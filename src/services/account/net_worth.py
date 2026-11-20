"""Net worth: one definition, one function. Every screen that says "net worth" reads this.

*** WHY THIS FILE EXISTS (UI audit 2026-11-20, P1-5). *** Separate code paths answered
"net worth" and disagreed. Measured on the premium demo persona Alex (core has the same
paths): the Dashboard said -$3,521.80, the Accounts page -$7,650.00. The Dashboard
counted an unlinked investment portfolio ($4,128.20); the Accounts page summed its own
balances and did not. The two server paths
also classified debt differently: one took `credit` only and silently dropped a loan
whose balance was stored positive, the other took `credit` and `loan`.

THE DEFINITION:
  * scope: the reader's scope (`read_scope`, or the ids the caller passes, e.g. one
    member from the Dashboard filter);
  * every account balance, converted into the reader's currency (a NULL currency is the
    base currency, D-166);
  * debt: an account of a debt type (`credit`, `loan`), whatever the sign of its stored
    balance, or any account below zero; it counts at its absolute value;
  * asset: any other account above zero;
  * plus investment portfolios NOT linked to an account (a linked one is already the
    account's balance, via `sync_investments_with_accounts`).

net_worth = total_assets - total_debts. Read-only: unlike `get_dashboard_data`, this
writes nothing, so the Accounts page can call it on every load.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal('0.01')
DEBT_TYPES = ('credit', 'loan')


def is_debt(account_type, balance) -> bool:
    """A debt-type account (any sign), or any account below zero."""
    return (account_type or '') in DEBT_TYPES or (balance or 0) < 0


def is_asset(account_type, balance) -> bool:
    """Any account above zero that is not a debt."""
    return not is_debt(account_type, balance) and (balance or 0) > 0


def net_worth_summary(user, scope_ids=None, currency_code=None) -> dict:
    """Totals for the accounts and unlinked portfolios in scope, in the reader's currency.

    Returns Decimals to the cent (`as_numbers` turns them into JSON numbers):
    total_assets (investments included), total_debts (positive), net_worth,
    investment_total (unlinked portfolios only), accounts_assets (assets without
    investments) and currency.
    """
    from src.models.account import Account
    from src.models.investment import Portfolio
    from src.utils.currency_converter import RateTable, convert_currency
    from src.utils.household import read_scope

    scope = list(scope_ids) if scope_ids else read_scope(user.id)
    if not scope:
        scope = [user.id]
    code = currency_code or user.default_currency_code or 'USD'
    stored_default = RateTable().base_code or code

    accounts_assets = Decimal('0')
    total_debts = Decimal('0')
    for account in Account.query.filter(Account.user_id.in_(scope)).all():
        balance = account.balance or 0
        if abs(balance) < 0.01:
            continue
        row_code = account.currency_code or stored_default
        converted = convert_currency(balance, row_code, code) if row_code != code else balance
        converted = Decimal(str(converted or 0))
        if is_debt(account.type, converted):
            total_debts += abs(converted)
        elif converted > 0:
            accounts_assets += converted

    investment_total = Decimal('0')
    for portfolio in Portfolio.query.filter(Portfolio.user_id.in_(scope)).all():
        if portfolio.account_id:
            continue
        investment_total += Decimal(str(portfolio.calculate_total_value() or 0))

    total_assets = accounts_assets + investment_total

    def cents(value):
        return value.quantize(CENTS, rounding=ROUND_HALF_UP)

    return {
        'total_assets': cents(total_assets),
        'accounts_assets': cents(accounts_assets),
        'investment_total': cents(investment_total),
        'total_debts': cents(total_debts),
        'net_worth': cents(total_assets - total_debts),
        'currency': code,
    }


def as_numbers(summary: dict) -> dict:
    """The summary with its money as JSON numbers (2 places), for an API response."""
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in summary.items()}
