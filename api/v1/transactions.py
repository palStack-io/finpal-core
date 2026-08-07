"""Transactions API endpoints"""
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.account import Account
from src.models.transaction import CategorySplit, Expense
from src.extensions import db
from src.utils.household import (
    can_manage_owned, owner_scope_filter, read_scope, scope_query,
    visible_user_ids)
from src.services.transaction import balances
from schemas import transaction_schema, transactions_schema
from schemas.input_schemas import transaction_input
from src.utils.validation import validate_request, validation_error_response
from datetime import datetime
from sqlalchemy import or_, and_
import logging

logger = logging.getLogger(__name__)


def _refuse(details):
    """Reject an update, rolling back first.

    `TransactionDetail.put` assigns the incoming fields onto the ORM object before
    it can validate them — the checks depend on the row's post-update state. So a
    plain `return` would leave those mutations pending in the session, to be
    committed by whatever ran next. Every validation exit goes through here.
    """
    db.session.rollback()
    return {'success': False, 'error': 'Validation error',
            'details': details}, 400


from src.models.personal_access_token import SCOPE_READ_WRITE  # noqa: E402
from src.services.agent_guard.guard import guarded_write  # noqa: E402
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required
# `src/utils/split_with.py` is deliberately NOT imported here any more. It used to
# back this file's base query, and the owner's 2026-08-06 decision took `split_with`
# out of attribution entirely — a row belongs to whoever owns its account. The helper
# itself stays, and its six other query sites (the group and settlement screens) are
# untouched: splitting a bill is still how the household settles up, it just no
# longer answers "whose transaction is this".


def _prior_category(transaction_id):
    """The category a transaction had before an agent changed it.

    Captured BEFORE the write, because afterwards it is gone — and without it
    DELETE /api/v1/agent-actions/<id> has nothing to restore and would report
    success having reverted nothing.
    """
    from flask_jwt_extended import get_jwt_identity as _identity
    expense = Expense.query.filter_by(
        id=transaction_id, user_id=_identity()).first()
    return {'category_id': expense.category_id} if expense else None


# Promoted to `src/utils/household.py` during D-18 item E, so the analytics
# service builds its figures from the SAME predicate this list is built from.
# Two copies is how the list and the totals would start disagreeing about the
# same rows again — which is what D-18 is. Re-exported under the old private
# names because the tests and the rest of this module refer to them, and a rename
# would have buried the move inside an unrelated diff.
_owner_scope_filter = owner_scope_filter
_scope_query = scope_query
_read_scope = read_scope


def _transactions_in_scope(user_id):
    """Base query: every transaction `user_id` may see."""
    return _scope_query(_read_scope(user_id))


def _member_scope(caller_id, member_id):
    """Resolve a `member_id` filter to a scope, as `(user_ids, error)`.

    The filter is INTERSECTED with what the caller may see, rather than trusted.
    Without that, a demo login reads the household's rows by passing an id — the
    filter becomes a way around the scope it is supposed to sit inside.

    A refusal is **403, not an empty list**: an empty list is indistinguishable from
    "that member has no transactions", so a bad id would read as a real answer.
    """
    visible = _read_scope(caller_id)
    if not member_id:
        return visible, None
    if str(member_id) not in {str(u) for u in visible}:
        return None, ({'success': False,
                       'error': 'Not a member of this household'}, 403)
    return [member_id], None


def _may_mutate(transaction, caller_id):
    """Whether `caller_id` may change or delete this transaction.

    Owner-or-admin — D-47's `can_manage_owned`, keyed to the **account's** owner —
    **or** whoever entered the row. Both clauses are load-bearing:

    * Without the account-owner clause this is not the settled model at all; it is
      whose money the row is that decides, not who typed it in.
    * Without the entered-by clause the rule is a NEW restriction rather than a port
      of D-47: a housemate who enters a row against your card could no longer fix
      their own typo. And more seriously, `can_manage_owned` returns False whenever
      `owner_id` is falsy, so an orphaned row — one whose account was deleted —
      would become uneditable and undeletable **by everyone**, permanently freezing
      that account's whole history.

    This runs only after the row has been FOUND through the read scope, so a refusal
    is 403. Answering 404 would mean the read scope had silently narrowed, which is
    D-43 returning.
    """
    if str(transaction.user_id) == str(caller_id):
        return True
    account = transaction.account
    if account is None:
        return False
    return can_manage_owned(account.user_id, caller_id)


def _totals_for(query):
    """Income and expense totals for a filtered query, as (income, expense).

    Aggregated in SQL over the whole query rather than in Python over the
    current page, so the figures describe the same set of rows the caller
    filtered for. `transfer` rows are excluded from both sides: moving money
    between your own accounts is not income and not spending, and counting it
    inflated both totals in the legacy handler.

    Amounts are stored positive with the direction carried by
    `transaction_type`, so this sums magnitudes and lets the caller subtract.
    """
    from sqlalchemy import func

    # `.order_by(None)` clears any ordering the caller applied. Postgres rejects
    # an ORDER BY on a column that is not in the GROUP BY, so leaving
    # `ORDER BY date DESC` in place here works on SQLite and 500s in production.
    sums = dict(
        query.order_by(None)
        .with_entities(
            Expense.transaction_type,
            func.coalesce(func.sum(func.abs(Expense.amount)), 0),
        )
        .group_by(Expense.transaction_type)
        .all()
    )
    income = float(sums.get('income') or 0)
    expense = float(sums.get('expense') or 0)
    return round(income, 2), round(expense, 2)

# Create namespace
ns = Namespace('transactions', description='Transaction operations')

# Define request/response models
transaction_model = ns.model('Transaction', {
    'description': fields.String(required=True, description='Transaction description'),
    'amount': fields.Float(required=True, description='Transaction amount'),
    'date': fields.DateTime(required=True, description='Transaction date'),
    'currency_code': fields.String(description='Currency code (e.g., USD)'),
    'card_used': fields.String(description='Card or payment method'),
    'category_id': fields.Integer(description='Category ID'),
    'account_id': fields.Integer(description='Account ID'),
    'transaction_type': fields.String(description='Type: expense, income, or transfer'),
    'notes': fields.String(description='Additional notes'),
    'split_method': fields.String(description='Split method: equal, custom, percentage'),
    'split_with': fields.String(description='Comma-separated user IDs to split with'),
    # **D-48.** Declared `fields.Integer` until 2026-08-06 while
    # `Expense.paid_by` is `String(50)` and user IDs are email addresses — so a
    # client generated from this spec sent an int and the documented contract was
    # simply false. Same class as #68/#69.
    'paid_by': fields.String(description='User ID (email) who fronted the cash'),
})


@ns.route('/')
class TransactionList(Resource):
    @ns.doc('list_transactions', security='Bearer')
    # Accepts a personal access token as well as a session, so an MCP
    # client or script can read. Reads need authentication only; the
    # write tiering is separate and unchanged.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """Get all transactions for current user with optional filters"""
        current_user_id = get_jwt_identity()

        # Get query parameters for filtering
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        start_date = request.args.get('start_date', type=str)
        end_date = request.args.get('end_date', type=str)
        category_id = request.args.get('category_id', type=int)
        account_id = request.args.get('account_id', type=int)
        transaction_type = request.args.get('type', type=str)
        search = request.args.get('search', type=str)
        group_id = request.args.get('group_id', type=int)
        member_id = request.args.get('member_id', type=str)

        # Build query. `member_id` narrows the scope rather than filtering the
        # result, so the summary totals — which `_totals_for` computes over the
        # whole query — describe exactly the rows on screen.
        scope, error = _member_scope(current_user_id, member_id)
        if error:
            return error
        query = _scope_query(scope)

        # Apply filters
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
                query = query.filter(Expense.date >= start)
            except ValueError:
                pass

        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                query = query.filter(Expense.date <= end)
            except ValueError:
                pass

        if category_id:
            # Include parent category AND all its subcategories (one level deep)
            from src.models.category import Category
            subcategory_ids = [c.id for c in Category.query.filter_by(parent_id=category_id).all()]
            all_category_ids = [category_id] + subcategory_ids
            query = query.filter(Expense.category_id.in_(all_category_ids))

        if account_id:
            query = query.filter(Expense.account_id == account_id)

        if transaction_type:
            query = query.filter(Expense.transaction_type == transaction_type)

        if search:
            query = query.filter(Expense.description.ilike(f'%{search}%'))

        # `group_id` was accepted by no one. GroupDetail.tsx has always called
        # `/api/v1/transactions/?group_id=<id>`, and because this handler never
        # read the parameter, a group's page rendered the user's entire
        # transaction history as if it belonged to that group. It returned 200
        # with a plausible-looking list, which is why it went unnoticed.
        if group_id:
            query = query.filter(Expense.group_id == group_id)

        # Order by date descending
        query = query.order_by(Expense.date.desc())

        # Totals are computed over the WHOLE filtered query, deliberately —
        # not over `pagination.items`. Summing one page and labelling it "Total
        # Income" would be a figure the app never computed, which is the exact
        # class of bug the analytics pass removed. Aggregating in SQL also keeps
        # this cheap as the history grows.
        income_total, expense_total = _totals_for(query)

        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        transactions = pagination.items

        # Serialize
        result = transactions_schema.dump(transactions)

        return {
            'success': True,
            'transactions': result,
            'summary': {
                'total_income': income_total,
                'total_expense': expense_total,
                'net_balance': round(income_total - expense_total, 2),
            },
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }
        }, 200

    @ns.doc('create_transaction', security='Bearer')
    @ns.expect(transaction_model)
    @jwt_required()
    def post(self):
        """Create a new transaction"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            # Shared with agent-proposal approval so an approved proposal builds
            # the same transaction a direct POST would — see
            # src/services/transaction/creation.py. Validation lives in there.
            from src.services.transaction.creation import (
                TransactionPayloadInvalid, build_transaction)
            try:
                new_transaction = build_transaction(data, current_user_id)
            except TransactionPayloadInvalid as exc:
                return validation_error_response(exc.errors)

            db.session.add(new_transaction)
            # Same commit as the row, so a rollback takes both.
            balances.apply_on_add(new_transaction)
            db.session.commit()

            # Serialize and return
            result = transaction_schema.dump(new_transaction)

            return {
                'success': True,
                'transaction': result,
                'message': 'Transaction created successfully'
            }, 201

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


@ns.route('/<int:id>')
@ns.param('id', 'Transaction ID')
class TransactionDetail(Resource):
    @ns.doc('get_transaction', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Get a specific transaction by ID"""
        current_user_id = get_jwt_identity()

        transaction = _transactions_in_scope(current_user_id).filter(Expense.id == id).first()

        if not transaction:
            return {'success': False, 'error': 'Transaction not found'}, 404

        result = transaction_schema.dump(transaction)

        return {
            'success': True,
            'transaction': result
        }, 200

    @ns.doc('update_transaction', security='Bearer')
    @ns.expect(transaction_model)
    # Order matters: api_auth_required resolves the caller and sets g.pat, which
    # guarded_write then reads. Reversed, every caller looks like a human.
    @api_auth_required(scope=SCOPE_READ_WRITE)
    @guarded_write(
        action='update_transaction_category',
        undo_state=lambda **kw: _prior_category(kw.get('id')),
    )
    def put(self, id):
        """Update a transaction"""
        current_user_id = get_jwt_identity()

        # Found through the READ scope first, then refused — never 404'd. The list
        # is household-wide, so keying this to the caller would put a row on screen
        # that its viewer cannot open, which is exactly D-43.
        transaction = _transactions_in_scope(current_user_id).filter(
            Expense.id == id).first()

        if not transaction:
            return {'success': False, 'error': 'Transaction not found'}, 404

        if not _may_mutate(transaction, current_user_id):
            return {'success': False,
                    'error': 'Only the account owner, a household admin or the '
                             'person who entered this transaction can change it'}, 403

        data = request.get_json() or {}
        if not data:
            return {'success': False, 'error': 'Request body required'}, 400

        try:
            # Taken before any assignment below: the field updates are
            # conditional, so afterwards the row cannot say what it used to be,
            # and crediting the old account back needs the old values.
            previous = balances.snapshot(transaction)

            # Update fields
            if 'description' in data:
                transaction.description = data['description']
            if 'amount' in data:
                transaction.amount = data['amount']
            if 'date' in data:
                transaction.date = datetime.fromisoformat(data['date']) if isinstance(data['date'], str) else data['date']
            if 'currency_code' in data:
                transaction.currency_code = data['currency_code']
            if 'card_used' in data:
                transaction.card_used = data['card_used']
            if 'category_id' in data:
                transaction.category_id = data['category_id']
            if 'account_id' in data:
                transaction.account_id = data['account_id']
            if 'transaction_type' in data:
                transaction.transaction_type = data['transaction_type']
            if 'notes' in data:
                transaction.notes = data['notes']
            if 'split_method' in data:
                transaction.split_method = data['split_method']
            if 'split_with' in data:
                transaction.split_with = data['split_with']
            if 'paid_by' in data:
                # Who paid feeds `calculate_splits`, so this decides who owes whom.
                transaction.paid_by = data['paid_by']
            if 'group_id' in data:
                # Membership-checked exactly as on create — otherwise `put` is simply
                # a way around that check. Never had a branch here at all, so moving
                # a transaction into or out of a group was silently dropped with a
                # 200, and `GroupDetail.tsx:88` lists a group by `?group_id=`, so the
                # correction never showed up where the user was looking.
                gid = data['group_id']
                if gid is not None:
                    from src.models.associations import group_users
                    from src.models.group import Group
                    is_member = db.session.query(Group.id).join(
                        group_users, group_users.c.group_id == Group.id
                    ).filter(
                        Group.id == gid,
                        group_users.c.user_id == current_user_id,
                    ).first()
                    if not is_member:
                        return _refuse({'group_id': [
                            'Unknown group, or you are not a member of it.']})
                transaction.group_id = gid
            if 'destination_account_id' in data:
                # Re-checked here rather than trusted: this handler reads `data`
                # directly instead of going through `TransactionInput`, so the
                # ownership check in `build_transaction` never sees an update.
                dest = data['destination_account_id']
                if dest is not None:
                    from src.models.account import Account
                    owned = Account.query.filter_by(
                        id=dest, user_id=current_user_id).first()
                    if not owned:
                        return _refuse({'destination_account_id': [
                            'Unknown account, or it is not yours.']})
                    if dest == transaction.account_id:
                        return _refuse({'destination_account_id': [
                            'Source and destination accounts cannot be '
                            'the same.']})
                transaction.destination_account_id = dest

            # `split_value` and `category_splits` are validated with the *same*
            # helpers the create path uses. They were wired into create in #51 and
            # forgotten here, and because this handler reads `data` rather than
            # `TransactionInput`, both were accepted with a 200 and discarded — the
            # form posts one payload object to either endpoint, so every edit of a
            # split transaction silently lost them.
            from src.services.transaction.creation import (
                TransactionPayloadInvalid, validate_paid_by,
                validate_split_value, validated_category_splits)

            try:
                # After the assignments above, so the group being checked against is
                # the one the transaction will actually be in.
                validate_paid_by(transaction.paid_by, transaction.group_id,
                                 current_user_id)
            except TransactionPayloadInvalid as exc:
                return _refuse(exc.errors)

            if 'split_value' in data:
                transaction.split_value = data['split_value']
            try:
                # Checked against the values the row holds *after* the assignments
                # above, since an edit may change the method and the share together.
                validate_split_value(transaction.split_value,
                                     transaction.split_method,
                                     transaction.amount)
            except TransactionPayloadInvalid as exc:
                return _refuse(exc.errors)

            if 'category_splits' in data:
                try:
                    splits = validated_category_splits(
                        data['category_splits'], transaction.amount,
                        current_user_id)
                except TransactionPayloadInvalid as exc:
                    return _refuse(exc.errors)
                # Replaced wholesale rather than merged: a partial update of split
                # rows has no meaning, since they must always sum to the total.
                for existing in list(transaction.category_splits):
                    transaction.category_splits.remove(existing)
                for category_id, amount in splits:
                    transaction.category_splits.append(
                        CategorySplit(category_id=category_id, amount=amount))
                # Re-derived, exactly as on create. Left set with no rows, the
                # expense would be skipped by budget.py:92 and attributed nowhere.
                transaction.has_category_splits = bool(splits)
                if splits:
                    transaction.category_id = None
            elif transaction.has_category_splits:
                # The splits were not restated, so they must still add up. Changing
                # only the amount would leave 60/40 against a new total, and
                # budget.py attributes from those rows regardless of the mismatch.
                try:
                    validated_category_splits(
                        {str(s.category_id): s.amount
                         for s in transaction.category_splits},
                        transaction.amount, current_user_id)
                except TransactionPayloadInvalid:
                    return _refuse({'category_splits': [
                        'This transaction is split across categories, so its '
                        'amount cannot change without restating the splits.']})

            # Undo what the row used to do, then apply what it does now. Reversing
            # first is what makes a moved account, a changed amount and a corrected
            # type all fall out of the same two calls.
            balances.reverse(previous)
            balances.apply_on_add(transaction)

            db.session.commit()

            result = transaction_schema.dump(transaction)

            return {
                'success': True,
                'transaction': result,
                'message': 'Transaction updated successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400

    @ns.doc('delete_transaction', security='Bearer')
    @jwt_required()
    def delete(self, id):
        """Delete a transaction"""
        current_user_id = get_jwt_identity()

        transaction = _transactions_in_scope(current_user_id).filter(
            Expense.id == id).first()

        if not transaction:
            return {'success': False, 'error': 'Transaction not found'}, 404

        if not _may_mutate(transaction, current_user_id):
            return {'success': False,
                    'error': 'Only the account owner, a household admin or the '
                             'person who entered this transaction can delete it'}, 403

        try:
            # Snapshot before the delete: afterwards the row is gone and there is
            # nothing left to read the amount and account from.
            balances.reverse(balances.snapshot(transaction))
            db.session.delete(transaction)
            db.session.commit()

            return {
                'success': True,
                'message': 'Transaction deleted successfully'
            }, 200

        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


@ns.route('/recent')
class RecentTransactions(Resource):
    @ns.doc('get_recent_transactions', security='Bearer')
    @jwt_required()
    def get(self):
        """Get recent transactions (last 10)"""
        current_user_id = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)

        transactions = _transactions_in_scope(current_user_id).order_by(Expense.date.desc()).limit(limit).all()

        result = transactions_schema.dump(transactions)

        return {
            'success': True,
            'transactions': result
        }, 200
