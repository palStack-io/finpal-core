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
from src.models.transaction import Expense
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
    if not transaction_data.get('category_id'):
        from src.utils.rule_engine import apply_transaction_rules
        transaction_data = apply_transaction_rules(transaction_data, user_id)

    return Expense(
        description=payload.get('description'),
        amount=payload.get('amount'),
        date=_coerce_date(payload.get('date')),
        currency_code=payload.get('currency_code', 'USD'),
        card_used=payload.get('card_used', 'Cash'),
        category_id=transaction_data.get('category_id'),
        account_id=transaction_data.get('account_id', payload.get('account_id')),
        transaction_type=transaction_data.get(
            'transaction_type', payload.get('transaction_type', 'expense')),
        notes=transaction_data.get('notes', payload.get('notes')),
        split_method=payload.get('split_method', 'equal'),
        split_with=payload.get('split_with', ''),
        paid_by=payload.get('paid_by', user_id),
        group_id=validated.get('group_id'),
        user_id=user_id,
    )


def create_transaction(payload, user_id):
    """Build, persist and return a transaction. Commits."""
    expense = build_transaction(payload, user_id)
    db.session.add(expense)
    db.session.commit()
    return expense
