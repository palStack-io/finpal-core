"""The one place `Account.balance` is moved by a transaction.

`Account.balance` is a stored column and the only source of truth for what an
account holds — `AccountSchema.get_current_balance` calls `obj.get_balance()` if it
exists, `Account` defines no such method, so `current_balance` is the same stored
number wearing a different name. web-ui displays it and sums it into the Accounts
page's net worth.

It has to be applied at every point a transaction is persisted, changed or removed,
and it stopped being applied at *any* of them in two steps: PR #42 moved update and
delete onto flask-restx handlers that never touched it, and PR #45 moved create,
which removed the only caller of `TransactionService.add_transaction`. Rather than
repeat the arithmetic at each call site — which is how it came apart — every path
goes through the two functions here, and `TransactionService` delegates to them so
there is exactly one implementation.

Nothing here commits. The caller owns the transaction boundary, so a balance move
lands in the same commit as the row that caused it and a rollback takes both.
"""
from src.models.account import Account
from src.utils.money import money_or_zero


def snapshot(expense):
    """The four fields that determine a balance move, captured before mutation.

    `TransactionDetail.put` applies fields conditionally (`if 'amount' in data`),
    so by the time it has finished the row no longer knows what it used to be.
    Reversing an update therefore needs the *old* values, taken before any
    assignment. Returned as a plain dict rather than the instance for that reason —
    holding a reference to `expense` would give the new values, not the old.
    """
    return {
        'account_id': expense.account_id,
        'destination_account_id': getattr(expense, 'destination_account_id', None),
        'transaction_type': expense.transaction_type,
        'amount': expense.amount or 0,
    }


def _move(account_id, destination_account_id, transaction_type, amount, direction):
    """Apply (direction=1) or undo (direction=-1) one transaction's effect."""
    if not account_id:
        # Cash transactions carry no account. Nothing to move.
        return

    account = Account.query.get(account_id)
    if not account:
        return

    # `money_or_zero`, not `amount or 0`: `account.balance` is `Numeric` and so
    # reads back as a `Decimal`, while `amount` has usually just arrived from a
    # JSON payload as a `float` — and `Decimal + float` raises rather than
    # converting. This is the single boundary where a transaction's amount
    # becomes money (D-58).
    delta = money_or_zero(amount) * direction

    if transaction_type == 'expense':
        account.balance -= delta
    elif transaction_type == 'income':
        account.balance += delta
    elif transaction_type == 'transfer' and destination_account_id:
        # The `and destination_account_id` guard is load-bearing, not defensive.
        # `destination_account_id` is currently dropped at the schema layer
        # (`TransactionInput` has no such field and `validate_request` loads with
        # `unknown=EXCLUDE`), so a transfer created through the API records no
        # destination. Debiting the source regardless would delete the money from
        # the books entirely — strictly worse than the no-op this produces. Pinned
        # by test_a_transfer_without_a_destination_moves_nothing; when
        # destination_account_id is wired up, that test is what has to change.
        account.balance -= delta
        destination = Account.query.get(destination_account_id)
        if destination:
            destination.balance += delta


def apply_on_add(expense):
    """Move the balances for a newly persisted transaction."""
    _move(expense.account_id,
          getattr(expense, 'destination_account_id', None),
          expense.transaction_type,
          expense.amount,
          1)


def reverse(state):
    """Undo the effect of a `snapshot()` taken earlier.

    Used for both delete and the first half of an update.
    """
    _move(state['account_id'], state['destination_account_id'],
          state['transaction_type'], state['amount'], -1)
