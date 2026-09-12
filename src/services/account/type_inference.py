"""Which kind of account SimpleFin just handed us — D-191.

*** SimpleFin DOES NOT CLASSIFY ACCOUNTS, AND finPal ASSUMED IT DID. ***
`integrations/simplefin/client.py` defaulted to `checking` and refined the type
inside `if 'type' in account:`. Measured against the live bridge on 2026-09-12,
printing key names only: an account carries

    available-balance, balance, balance-date, currency, holdings, id, name,
    org, transactions

and **0 of 25 real accounts carried a `type` key**. So the whole
credit/savings/investment/loan branch was unreachable and every SimpleFin
account -- for every user, on every install, since the integration shipped --
was written `checking`. A Visa Signature at -5,544.12 and a PayPal Credit at
-830.00 both landed as `checking`, which made them invisible to `peak_magnitude`'s
cost scale, to `credit_utilisation_below`, to `has_debt_account_with_a_rate` and
to the four lesson predicates that read `_owed_accounts`.

*** SO finPal MUST INFER — AND MUST NEVER PRESENT THE INFERENCE AS A FACT. ***
That is what `Account.type_source` is for. D-77 and D-108 are what a guess
rendered as a fact looks like once it ships.
"""

# Order matters: the first rule that fires wins.
INVESTMENT_KEY = 'holdings'


def infer_account_type(raw_account):
    """`(type, type_source)` for one raw SimpleFin account dict.

    *** DELIBERATELY SHORT, AND DELIBERATELY NOT NAME-BASED. *** "Customized
    Cash Rewards Visa Signature" and "PayPal Credit" both carry obvious tells,
    and both are user-editable strings in a locale finPal does not control.
    D-189 rejected string-matching a category called "Income" for exactly this
    reason; matching on an account name is the same mistake wearing a different
    hat, and it would fail silently for every non-English bank.
    """
    # 1. Holdings are unambiguous: SimpleFin sends them only for an account that
    #    has them. 3 of the 25 real accounts did.
    if raw_account.get(INVESTMENT_KEY):
        return 'investment', 'inferred'

    # 2. A negative balance on a consumer account is overwhelmingly a card.
    #    *** EVALUATED ONCE, AT IMPORT, AND NEVER RE-EVALUATED. *** "Has ever
    #    been negative" would reclassify an overdrawn current account, and a
    #    checking account that dips below zero for one day is still a checking
    #    account.
    try:
        balance = float(raw_account.get('balance') or 0)
    except (TypeError, ValueError):
        balance = 0.0
    if balance < 0:
        return 'credit', 'inferred'

    # 3. Nothing is known. `checking` because a NOT NULL column needs a value --
    #    and `default` so the client can say so rather than assert it.
    return 'checking', 'default'


def backfill_account_type_source():
    """Stamp `type_source` on every account written before the column existed.

    *** A CREATE-PATH FIX REACHES NOBODY WHO ALREADY HAS ACCOUNTS (D-178). ***
    Every SimpleFin account on every install is currently `checking` with no
    record of why, and the two the owner imported on 2026-09-12 were a Visa
    Signature at -5,544.12 and a PayPal Credit at -830.00. Wiring the importer
    fixes the next import and nothing that already happened.

    **CONDITION-KEYED on `type_source IS NULL`**, which is exactly "written
    before this column existed", so re-running is a no-op and an operator who
    has already corrected an account keeps their correction.

    Two rules, and the asymmetry is the point:

    * A MANUAL account gets `type_source='user'` and **keeps its type**. The
      person chose it in a form. There is nothing to infer and nothing to
      second-guess.
    * An IMPORTED account is re-evaluated, because its type was never a
      decision -- it was the `checking` default of a branch that could not fire.

    *** IT DOES NOT RE-EVALUATE AN IMPORTED ACCOUNT'S TYPE FROM ITS CURRENT
    BALANCE IF THAT WOULD CONTRADICT A TYPE THE USER ALREADY SEES AS CREDIT. ***
    An account already typed `credit`, `savings`, `loan` or `investment` on an
    import row means somebody changed it by hand after the fact -- the importer
    could only ever write `checking` -- so that is a user decision wearing no
    label, and it is preserved as `user`.

    Returns the number of rows stamped, for the boot log.
    """
    import logging
    from src.extensions import db
    from src.models.account import Account

    logger = logging.getLogger(__name__)

    rows = Account.query.filter(Account.type_source.is_(None)).all()
    if not rows:
        return 0

    stamped = 0
    for account in rows:
        if account.import_source is None:
            # Typed into a form by a person.
            account.type_source = 'user'
        elif account.type and account.type != 'checking':
            # Only a human could have put a non-checking type on an imported
            # row, because the importer could not.
            account.type_source = 'user'
        else:
            # The `checking` default of a branch that never fired. Re-decide it
            # from what we can still see -- the balance. `holdings` is not
            # available here (it lives in the feed, not the row), so an
            # investment account stays `checking` until its next import, and
            # that is stated rather than hidden.
            balance = float(account.balance or 0)
            if balance < 0:
                account.type, account.type_source = 'credit', 'inferred'
            else:
                account.type_source = 'default'
        stamped += 1

    db.session.commit()
    logger.info('account type_source stamped on %s row(s)', stamped)
    return stamped
