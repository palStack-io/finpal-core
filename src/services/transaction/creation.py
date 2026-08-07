"""One implementation of "create a transaction from a payload".

Both the REST endpoint and the approval of an agent proposal build transactions.
They must build the *same* transaction: an approved proposal that quietly skipped
the rule engine, defaulted the currency differently, or dropped the account would
be a different feature wearing the same name.

Validation lives here rather than at the API edge on purpose. `@guarded_write`
records a GATED proposal *before* the handler runs, so the handler's own
validation never sees it — without this, approving a proposal would apply a
payload nothing had ever checked.
"""
from datetime import datetime

from schemas.input_schemas import transaction_input
from src.extensions import db
from src.models.transaction import CategorySplit, Expense
from src.utils.validation import validate_request


class TransactionPayloadInvalid(Exception):
    """The payload failed schema validation. `.errors` holds the details."""

    def __init__(self, errors):
        super().__init__('Invalid transaction payload')
        self.errors = errors


def _coerce_date(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        # Full ISO, so time-of-day survives; date-only strings parse too.
        return datetime.fromisoformat(value)
    return datetime.utcnow()


def validate_paid_by(paid_by, group_id, caller_id):
    """`paid_by` decides who owes whom, so it cannot be an arbitrary id.

    Flagged by automated review when `paid_by` first got a `put` branch: assigned
    unchecked, a caller can attribute their own spending to anyone, and the named
    user then carries it through `Expense.calculate_splits`.

    The rule:

    * a group transaction may name any **member of that group** — this is the real
      case, and the one that must not break: `GroupDetail.tsx:115` records a
      settlement with another member's id;
    * without a group, the shared context is the **household**: a housemate really
      can have fronted the cash for a row on your card, and under the settled model
      (2026-08-06) that is exactly what `paid_by` is for.

    **The second rule used to be "the only honest value is the caller", and this
    docstring rejected the household as a boundary — correctly, at the time.** The
    only household helper then was `get_all_user_ids()`, which returns every user on
    the instance *including demo accounts*, so keying to it would have permitted
    anyone holding the published demo password. `visible_user_ids()` (D-42/D-47)
    does not: it excludes demo accounts and collapses to the caller alone for a demo
    login, so the sandbox stays symmetric and the boundary is now usable.

    Filed as **D-49**, because the old rule did not merely under-permit — it made
    the household transactions list unusable. `TransactionDetail.put` re-validates
    the row's *existing* `paid_by` after every edit, so once the list went
    household-wide, an account owner editing the description of a row a housemate
    entered was refused with a `paid_by` error naming a field they never touched.

    Public because `TransactionDetail.put` needs the identical rule; a field checked
    on create and not on update is just a slower way to store a bad value.
    """
    if paid_by is None or paid_by == caller_id:
        return

    from src.models.user import User

    if not User.query.filter_by(id=paid_by).first():
        raise TransactionPayloadInvalid({'paid_by': [
            'Unknown user.']})

    if group_id is None:
        from src.utils.household import visible_user_ids

        if str(paid_by) not in {str(u) for u in visible_user_ids(caller_id)}:
            raise TransactionPayloadInvalid({'paid_by': [
                'Only you or a member of your household can have paid a '
                'transaction that is not in a group.']})
        return

    from src.models.associations import group_users
    from src.models.group import Group
    is_member = db.session.query(Group.id).join(
        group_users, group_users.c.group_id == Group.id
    ).filter(Group.id == group_id, group_users.c.user_id == paid_by).first()
    if not is_member:
        raise TransactionPayloadInvalid({'paid_by': [
            "That user is not a member of this transaction's group."]})


def validate_split_value(split_value, split_method, amount):
    """`split_value` means different things per split method, so its valid range
    cannot be expressed in the schema.

    Public because `TransactionDetail.put` needs the identical rules: it reads
    `data` directly rather than through `TransactionInput`, and a field validated on
    create but not on update is just a slower way to store a bad number.
    """
    if split_value is None:
        return
    if split_method == 'equal':
        # `calculate_splits` never reads it for an equal split, so accepting it
        # would store a number that changes nothing — the same kind of lie as
        # dropping it silently. The web form agrees: it only sends the field when
        # the method is not `equal`.
        raise TransactionPayloadInvalid({'split_value': [
            'An equal split has no payer share to set.']})
    if split_value < 0:
        raise TransactionPayloadInvalid({'split_value': [
            'The payer share cannot be negative.']})
    if split_method == 'percentage' and split_value > 100:
        # Above 100 the remainder goes negative and an *expense* starts crediting
        # the other participants.
        raise TransactionPayloadInvalid({'split_value': [
            'A percentage share cannot exceed 100.']})
    if split_method == 'custom' and split_value > (amount or 0):
        raise TransactionPayloadInvalid({'split_value': [
            "The payer's amount cannot exceed the transaction total."]})


def validated_category_splits(raw, total_amount, user_id):
    """Public alias of `_validated_category_splits`, for the update handler."""
    return _validated_category_splits(raw, total_amount, user_id)


def _validated_category_splits(raw, total_amount, user_id):
    """Normalise `{category_id: amount}` into a list of (category_id, amount).

    Returns `[]` for absent or empty input, which is what keeps
    `has_category_splits` false for an ordinary transaction. Raises
    TransactionPayloadInvalid otherwise.
    """
    if not raw:
        # Covers both absent and `{}`. An empty object must not produce a flagged
        # expense with nothing to attribute — `budget.py:92` skips flagged
        # expenses, so that would delete the spending from every budget.
        return []

    from src.models.category import Category

    splits = []
    for key, amount in raw.items():
        try:
            category_id = int(key)
        except (TypeError, ValueError):
            raise TransactionPayloadInvalid({'category_splits': [
                'Category ids must be integers.']})
        if amount is None or amount <= 0:
            raise TransactionPayloadInvalid({'category_splits': [
                'Each split amount must be greater than zero.']})
        splits.append((category_id, float(amount)))

    owned = {
        c.id for c in Category.query.filter(
            Category.id.in_([cid for cid, _ in splits]),
            Category.user_id == user_id).all()
    }
    missing = [cid for cid, _ in splits if cid not in owned]
    if missing:
        # Same answer whether the category is absent or someone else's.
        raise TransactionPayloadInvalid({'category_splits': [
            'Unknown category, or it is not yours.']})

    # The legacy service logged a warning here and stored the transaction anyway,
    # which is how a budget silently under- or over-counts. A split that does not
    # account for the whole amount has no correct attribution, so refuse it.
    # The 0.01 tolerance is kept: thirds do not divide cleanly and refusing a
    # one-cent gap would make three-way splits impossible.
    if abs(sum(amount for _, amount in splits) - total_amount) > 0.01:
        raise TransactionPayloadInvalid({'category_splits': [
            'The split amounts must add up to the transaction amount.']})

    return splits


def build_transaction(payload, user_id):
    """Validate `payload`, apply the user's rules, return an unsaved Expense.

    Unsaved on purpose: the caller decides the transaction boundary. The REST
    handler commits immediately; approval commits alongside the status change so
    a failure cannot leave a proposal marked approved with nothing created.

    Raises TransactionPayloadInvalid.
    """
    validated, errors = validate_request(transaction_input, payload)
    if errors:
        raise TransactionPayloadInvalid(errors)

    # `group_id` goes straight to a foreign key, so it has to be checked here
    # rather than trusted. Without this, any caller could file a transaction into
    # any group by guessing an integer, and the row would then appear in that
    # group's list and in `calculate_group_balances` for its real members.
    #
    # This is checked at build time, not at the API edge, for the same reason the
    # rest of the validation lives here: `@guarded_write` records a GATED proposal
    # before the handler runs, so a check at the edge would not see an approved
    # proposal's payload.
    group_id = validated.get('group_id')
    if group_id is not None:
        from src.models.associations import group_users
        from src.models.group import Group
        is_member = db.session.query(Group.id).join(
            group_users, group_users.c.group_id == Group.id
        ).filter(
            Group.id == group_id,
            group_users.c.user_id == user_id,
        ).first()
        if not is_member:
            # Deliberately the same answer whether the group is absent or simply
            # not the caller's — otherwise this distinguishes real group ids from
            # unused ones for an outsider.
            raise TransactionPayloadInvalid(
                {'group_id': ['Unknown group, or you are not a member of it.']})

    # `destination_account_id` is the other raw foreign key a client supplies, and
    # crediting an account is if anything more sensitive than debiting one.
    destination_account_id = validated.get('destination_account_id')
    if destination_account_id is not None:
        from src.models.account import Account

        transaction_type = payload.get('transaction_type', 'expense')
        if transaction_type != 'transfer':
            # Refused rather than ignored. The balance arithmetic only reads this
            # for transfers, so storing it on an expense would record a movement
            # that never happens — and silently dropping documented fields is the
            # defect this whole series has been unpicking. The web form only sends
            # it when the type is `transfer`, so nothing legitimate breaks.
            raise TransactionPayloadInvalid({'destination_account_id': [
                'Only a transfer can have a destination account.']})

        owned = Account.query.filter_by(
            id=destination_account_id, user_id=user_id).first()
        if not owned:
            # Same answer whether the account is absent or someone else's, so this
            # cannot be used to probe which account ids exist.
            raise TransactionPayloadInvalid({'destination_account_id': [
                'Unknown account, or it is not yours.']})

        if destination_account_id == validated.get('account_id'):
            # Carried over from the legacy service. A self-transfer nets to zero in
            # the arithmetic, so it would be accepted and change nothing, leaving a
            # row that claims a movement which never happened.
            raise TransactionPayloadInvalid({'destination_account_id': [
                'Source and destination accounts cannot be the same.']})

    # Checked after `group_id`, because whether another user may be named as the
    # payer depends on that group's membership.
    validate_paid_by(payload.get('paid_by'), group_id, user_id)

    split_value = validated.get('split_value')
    validate_split_value(split_value, payload.get('split_method', 'equal'),
                         validated.get('amount') or 0)

    # Category splits. Validated here rather than in the schema because the checks
    # are cross-field: the amounts have to sum to the transaction total, and each
    # category id is a raw foreign key from the client.
    category_splits = _validated_category_splits(
        validated.get('category_splits'), validated.get('amount') or 0, user_id)

    # The rule engine may set category_id and account_id and append to notes.
    transaction_data = {
        'description': payload.get('description', ''),
        'amount': payload.get('amount', 0),
        'transaction_type': payload.get('transaction_type', 'expense'),
        'category_id': payload.get('category_id'),
        'account_id': payload.get('account_id'),
        'notes': payload.get('notes', ''),
        'tags': payload.get('tags', []),
    }
    if not transaction_data.get('category_id') and not category_splits:
        # Skipped when the transaction is split: the rule engine would assign a
        # single category, and a split expense must have none of its own or the
        # amount is attributed twice.
        from src.utils.rule_engine import apply_transaction_rules
        transaction_data = apply_transaction_rules(transaction_data, user_id)

    expense = Expense(
        description=payload.get('description'),
        amount=payload.get('amount'),
        date=_coerce_date(payload.get('date')),
        currency_code=payload.get('currency_code', 'USD'),
        card_used=payload.get('card_used', 'Cash'),
        # Cleared when the transaction is split across categories, which is the
        # other half of not double-counting: `budget.py:92` skips a flagged expense
        # and attributes its split rows instead, so an own-category as well would
        # be counted twice. The legacy service did this too.
        category_id=None if category_splits else transaction_data.get('category_id'),
        account_id=transaction_data.get('account_id', payload.get('account_id')),
        transaction_type=transaction_data.get(
            'transaction_type', payload.get('transaction_type', 'expense')),
        notes=transaction_data.get('notes', payload.get('notes')),
        split_method=payload.get('split_method', 'equal'),
        split_with=payload.get('split_with', ''),
        paid_by=payload.get('paid_by', user_id),
        group_id=group_id,  # the membership-checked value from above
        destination_account_id=destination_account_id,  # ownership-checked above
        split_value=split_value,  # range-checked against the split method above
        # Derived, never taken from the client. A caller who could set this flag
        # with no split rows would make the expense invisible to every budget:
        # `budget.py:92` skips flagged expenses and then finds nothing to attribute.
        has_category_splits=bool(category_splits),
        user_id=user_id,
    )

    # Appended to the relationship rather than constructed with an `expense_id`,
    # because `build_transaction` deliberately returns an *unsaved* row and has no id
    # to give them. SQLAlchemy fills it in when the caller flushes, and the backref's
    # `cascade='all, delete-orphan'` then removes them with the transaction — which
    # matters, since `budget.py` joins split rows on `expense_id` and would keep
    # counting orphans.
    for category_id, amount in category_splits:
        expense.category_splits.append(
            CategorySplit(category_id=category_id, amount=amount))

    return expense


def create_transaction(payload, user_id):
    """Build, persist and return a transaction. Commits.

    The balance move belongs here rather than in `build_transaction`, because
    `build_transaction` returns an *unsaved* row and a caller may discard it — a
    balance mutation left in the session by an abandoned build would commit with
    whatever came next.
    """
    from src.services.transaction.balances import apply_on_add

    expense = build_transaction(payload, user_id)
    db.session.add(expense)
    apply_on_add(expense)
    db.session.commit()
    return expense
