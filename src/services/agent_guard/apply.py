"""Apply an approved proposal through the ordinary write path.

Deliberately not a second implementation of each write. An approved proposal must
produce exactly what the direct call would have — the first version of this file
hand-built the Expense and silently diverged in seven ways: no rule engine, no
validation, account_id and currency_code dropped, notes/tags/splits discarded, a
different card_used default, and the date truncated to a day. Someone approving a
proposal has no reason to expect a different transaction from the one they saw.
"""
from src.extensions import db
from src.services.transaction.creation import (
    TransactionPayloadInvalid,
    build_transaction,
)


class UnsupportedAction(Exception):
    """The stored action has no apply implementation."""


class ProposalNoLongerValid(Exception):
    """The stored payload does not validate.

    Reachable by design: `@guarded_write` records a GATED proposal *before* the
    handler's validation runs, so a malformed payload can sit in the queue until
    someone approves it. `.errors` holds the field errors.
    """

    def __init__(self, errors):
        super().__init__('Proposal payload is not valid')
        self.errors = errors


def apply_action(row):
    """Apply `row` and return a target_ref like 'expense:12'.

    Adds to the session but does not commit — the caller commits alongside the
    status change, so a failure cannot leave a proposal marked approved with
    nothing created.
    """
    if row.action == 'create_transaction':
        try:
            expense = build_transaction(row.payload or {}, row.user_id)
        except TransactionPayloadInvalid as exc:
            raise ProposalNoLongerValid(exc.errors)
        db.session.add(expense)
        db.session.flush()
        return 'expense:%d' % expense.id

    raise UnsupportedAction(row.action)
