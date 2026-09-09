"""
Currency conversion utilities
"""

from src.models.currency import Currency


class RateTable:
    """Every currency's `rate_to_base`, loaded once.

    *** THIS EXISTS FOR CORRECTNESS FIRST AND SPEED SECOND, AND BOTH MATTER. ***

    Correctness: D-156 was one converter with one caller. `calculate_asset_debt_trends`
    ran account balances through `convert_currency` into the reader's currency while
    every transaction figure — the spend total, income, the category breakdown, the
    rows in the recent-transactions list — was summed straight off `Expense.amount`
    and never converted at all. So one card printed a CONVERTED net worth beside an
    UNCONVERTED spend total, under one currency symbol, and the figure and the symbol
    were chosen by two different rules. Routing every read through one object is what
    stops the two halves drifting apart again; five call sites doing their own
    arithmetic is D-145's shape.

    Speed: `convert_currency` issues THREE queries per call — source, target and base.
    The dashboard loads a year of household transactions, so converting them one by
    one would have turned a page load into thousands of round trips. This reads the
    `currencies` table once.

    *** A NULL `currency_code` MEANS THE BASE CURRENCY, NOT THE READER'S. ***
    The column is nullable and the write path always fills it
    (`transaction/service.py:52-56`), so the only rows holding NULL are ones that
    predate the column — written when the instance was, in effect, single-currency.
    Base is what those amounts are denominated in. Reading NULL as "already in
    whatever the reader prefers" would leave a legacy row unconverted while relabelling
    it, which is the exact defect D-156 is about, one population down. On a
    single-currency instance the two readings are identical, which is why it has never
    mattered until now.
    """

    def __init__(self):
        rows = Currency.query.all()
        self._rates = {c.code: c.rate_to_base for c in rows}
        self._base = next((c.code for c in rows if c.is_base), None)

    @property
    def base_code(self):
        return self._base

    def convert(self, amount, from_code, to_code):
        """`amount` restated in `to_code`.

        Returns the amount UNCHANGED when it cannot convert — no base currency
        configured, or a code that is not in the table. That is deliberate and it
        matches `convert_currency`: a missing rate must not turn a real figure into
        zero or into an exception in the middle of a cron run. It does mean an
        unconvertible amount is shown under the reader's symbol, which is the
        original defect in miniature — so it is bounded to a misconfigured instance
        rather than being the default path.
        """
        if amount is None or from_code == to_code or self._base is None:
            return amount
        if from_code not in self._rates or to_code not in self._rates:
            return amount
        in_base = amount if from_code == self._base else amount * self._rates[from_code]
        return in_base if to_code == self._base else in_base / self._rates[to_code]

    def code_of(self, record, fallback=None):
        """The currency a stored row is denominated in. NULL means base."""
        return getattr(record, 'currency_code', None) or fallback or self._base

    def amount_of(self, record, to_code, attr='amount'):
        """One stored row's amount, restated in `to_code`."""
        return self.convert(getattr(record, attr), self.code_of(record), to_code)

    def amounts_for(self, records, to_code, attr='amount'):
        """`{id: converted amount}` for a whole list, in one pass.

        Keyed by id and returned SEPARATELY rather than written back onto the rows.
        Assigning to `expense.amount` would mark the instance dirty, and the next
        `db.session.commit()` anywhere in the request would write a reader's-currency
        figure into the database permanently — a display fix that silently corrupts
        the data it was meant to describe. The dashboard already threads
        `expense_splits` through as a dict keyed by expense id; this follows it.
        """
        return {r.id: self.amount_of(r, to_code, attr=attr) for r in records}

def get_base_currency():
    """Get the base currency"""
    return Currency.query.filter_by(is_base=True).first()

def convert_currency(amount, from_code, to_code):
    """Convert an amount from one currency to another"""
    if from_code == to_code:
        return amount
    
    from_currency = Currency.query.filter_by(code=from_code).first()
    to_currency = Currency.query.filter_by(code=to_code).first()
    
    if not from_currency or not to_currency:
        return amount  # Return original if either currency not found
    
    # Get base currency for reference
    base_currency = Currency.query.filter_by(is_base=True).first()
    if not base_currency:
        return amount  # Cannot convert without a base currency
    
    # First convert amount to base currency
    if from_code == base_currency.code:
        # Amount is already in base currency
        amount_in_base = amount
    else:
        # Convert from source currency to base currency
        amount_in_base = amount * from_currency.rate_to_base
    
    # Then convert from base currency to target currency
    if to_code == base_currency.code:
        # Target is base currency, so we're done
        return amount_in_base
    else:
        # Convert from base currency to target currency
        return amount_in_base / to_currency.rate_to_base
