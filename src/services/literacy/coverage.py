"""Coverage: how much of a user's OWN picture each act has made true.

*** WEIGHTED BY AMOUNT WITHIN THE USER'S OWN FIGURES, NEVER BY THE SIZE OF
THEM. *** Recording the rate on the card carrying 80% of what you owe is worth
four times the one carrying 20% -- but a user with 900 of debt and a user with
90,000 earn exactly the same for understanding all of it. Absolute weighting was
considered and rejected: it would mean a large mortgage out-climbs a careful low
income, which is the failure this product exists to avoid, one level up.

*** EVERY FUNCTION RETURNS `Decimal` IN [0, 1], OR `None` WHEN DORMANT. ***
Dormant means the user has nothing this act could be about -- no cards at all,
say. A dormant act is ABSENT, not zero: scoring it zero tells a debt-free user
they are failing at something that does not apply to them, which is the
report-card voice decision 5 forbids. It wakes if their situation changes, and
the ratchet means nothing already earned moves.

*** A DENOMINATOR MUST ONLY COUNT WHAT THE USER CAN ACTUALLY FINISH. *** The
sharpest case is `categories_classified`: `Category.kind` is
`'income' | 'expense' | NULL`, and an income category can never carry a
`spending_type` (D-189). Counting those would cap the act below 1 for ever, the
act would never pay its ceiling, and the kit would stop being affordable --
every promise in the design at once. So income categories are excluded, and
`test_coin_coverage_universal.py` asserts behaviourally that a user who has done
everything available to them reaches EXACTLY 1.

These read core tables directly, like the predicates beside them, and for the
same reason: a coverage function must not be able to WRITE anything.
"""

from decimal import Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.group import Settlement
from src.models.investment import Investment, Portfolio
from src.models.recurring import RecurringExpense
from src.models.transaction import Expense
from src.models.transaction_rule import TransactionRule

ONE = Decimal('1')
ZERO = Decimal('0')

# Account types that carry a balance a user could owe on.
DEBT_TYPES = ('credit', 'loan')
CARD_TYPES = ('credit',)


def _share(covered, total):
    """`covered / total`, clamped to [0, 1]. `None` when there is nothing at all.

    *** `total == 0` IS DORMANT, NOT COMPLETE AND NOT ZERO. *** A user with no
    accounts has not confirmed all of them; there is simply nothing to confirm
    yet. The caller renders that as absent.
    """
    total = Decimal(str(total or 0))
    if total <= 0:
        return None
    covered = Decimal(str(covered or 0))
    if covered <= 0:
        return ZERO
    return min(ONE, covered / total)


def _binary(done):
    """An act with nothing to weight: you have done it or you have not.

    Never dormant -- every user can name a goal, record their income or teach a
    rule, whatever their circumstances.
    """
    return ONE if done else ZERO


def _binary_conditional(possible, done):
    """A binary act that a user's circumstances may not raise at all.

    *** `_binary` IS WRONG FOR AN EVENT ACT AND ITS OWN DOCSTRING SAYS WHY: ***
    *"never dormant"*. That is true of naming a goal and false of revising a
    budget -- you cannot revise one you have not set, and scoring that user
    `ZERO` tells them they are failing at something they cannot yet do, which
    is the report-card voice decision 5 exists to forbid (§4.2.1).

    So: `None` when the act is not yet possible, `ONE` once done, `ZERO` only
    in the genuine middle -- it IS possible and you have not done it.
    """
    if not possible:
        return None
    return ONE if done else ZERO


# ══════════════════════════════════════════════════════════════════════
# The eight UNIVERSAL acts — anyone with any data at all can finish these,
# which is why §7.2 prices the whole kit against them alone.
# ══════════════════════════════════════════════════════════════════════

def accounts_confirmed(user_id):
    """Share of your balances sitting on an account whose type you confirmed.

    *** WEIGHTED BY `abs(balance)` BECAUSE A CARD'S DEBT IS PART OF THE PICTURE.
    *** A -800 card is 800 of money to be right about, exactly as a +800 savings
    account is. This is the one place `abs` is correct: we are measuring how much
    of the picture is settled, not how much is owed.
    """
    rows = Account.query.filter_by(user_id=user_id).all()
    if not rows:
        return None
    total = sum(abs(Decimal(str(a.balance or 0))) for a in rows)
    if total <= 0:
        # Accounts exist but all read zero. Fall back to counting them, so a
        # new user with two empty accounts can still finish this act.
        return _share(sum(1 for a in rows if a.type_source != 'inferred'), len(rows))
    covered = sum(abs(Decimal(str(a.balance or 0)))
                  for a in rows if a.type_source != 'inferred')
    return _share(covered, total)


def transactions_categorised(user_id):
    """Share of what you SPENT that carries a category — by amount, not count.

    Categorising the rent teaches you more than categorising a coffee, and the
    reward follows the teaching.
    """
    total = db.session.query(func.coalesce(func.sum(func.abs(Expense.amount)), 0)).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
    ).scalar()
    covered = db.session.query(func.coalesce(func.sum(func.abs(Expense.amount)), 0)).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
        Expense.category_id.isnot(None),
    ).scalar()
    return _share(covered, total)


def categories_classified(user_id):
    """Share of your SPEND sitting in a category sorted fixed/flexible/non-monthly.

    *** INCOME CATEGORIES ARE EXCLUDED FROM THE DENOMINATOR (D-189). *** They can
    never carry a `spending_type`, so counting them would cap this act below 1
    for ever and the user could never finish it.
    """
    spend_by_cat = db.session.query(
        Expense.category_id,
        func.coalesce(func.sum(func.abs(Expense.amount)), 0),
    ).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
        Expense.category_id.isnot(None),
    ).group_by(Expense.category_id).all()
    if not spend_by_cat:
        return None

    ids = [cid for cid, _ in spend_by_cat]
    cats = {c.id: c for c in Category.query.filter(Category.id.in_(ids)).all()}

    total = ZERO
    covered = ZERO
    for cid, amount in spend_by_cat:
        cat = cats.get(cid)
        if cat is None or cat.kind == 'income':
            continue                      # D-189: cannot carry a spending_type
        amount = Decimal(str(amount or 0))
        total += amount
        if cat.spending_type:
            covered += amount
    return _share(covered, total)


def has_a_goal(user_id):
    """One goal is what turns a balance into a climb. Never dormant."""
    return _binary(Goal.query.filter(
        Goal.user_id == user_id, Goal.status != 'archived').first() is not None)


def has_a_budget(user_id):
    """Share of your FLEXIBLE spend that sits inside an active budget.

    *** ONLY FLEXIBLE SPEND IS COUNTED. *** A budget on rent is a wish, and a
    budget on a yearly insurance bill is D-101's arithmetic waiting to happen.
    Measuring against all spend would make this act unfinishable for everyone.
    """
    spend_by_cat = db.session.query(
        Expense.category_id,
        func.coalesce(func.sum(func.abs(Expense.amount)), 0),
    ).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
        Expense.category_id.isnot(None),
    ).group_by(Expense.category_id).all()
    if not spend_by_cat:
        return None

    ids = [cid for cid, _ in spend_by_cat]
    flexible = {c.id for c in Category.query.filter(
        Category.id.in_(ids), Category.spending_type == 'flexible').all()}
    if not flexible:
        return None                        # nothing movable to budget for yet

    budgeted = {b.category_id for b in Budget.query.filter(
        Budget.user_id == user_id, Budget.active.is_(True)).all()}

    total = ZERO
    covered = ZERO
    for cid, amount in spend_by_cat:
        if cid not in flexible:
            continue
        amount = Decimal(str(amount or 0))
        total += amount
        if cid in budgeted:
            covered += amount
    return _share(covered, total)


def income_recorded(user_id):
    """An active recurring row the user marked as income. Never dormant.

    *** READ FROM `RecurringExpense.transaction_type`, THE ONLY PLACE finPal
    RECORDS THAT SOMETHING IS INCOME. *** `Category.kind` states it for a
    category, but a recurring row is the fact that money actually arrives.
    """
    return _binary(db.session.query(RecurringExpense.id).filter(
        RecurringExpense.user_id == user_id,
        RecurringExpense.active.is_(True),
        RecurringExpense.transaction_type == 'income',
    ).first() is not None)


def taught_a_rule(user_id):
    """One rule the user taught finPal. Never dormant."""
    return _binary(db.session.query(TransactionRule.id).filter(
        TransactionRule.user_id == user_id,
        TransactionRule.active.is_(True),
    ).first() is not None)


def bank_connected(user_id):
    """Share of your accounts that refresh themselves rather than being typed.

    The largest single award in the product, and honestly so: one move and every
    balance on the range becomes today's rather than the one you last remembered
    to update.
    """
    rows = Account.query.filter_by(user_id=user_id).all()
    if not rows:
        return None
    return _share(sum(1 for a in rows if a.import_source), len(rows))


# ══════════════════════════════════════════════════════════════════════
# The CONDITIONAL acts — dormant unless the user's circumstances raise them.
# They are excluded from §7.2's affordability check for exactly that reason:
# pricing the kit against a ceiling a debt-free user can never reach would lock
# them out of it.
# ══════════════════════════════════════════════════════════════════════

def _owed(account):
    """What is actually owed on an account, as a positive number.

    *** CARD DEBT IS A NEGATIVE BALANCE, AND AN OVERPAID CARD IS NOT DEBT. ***
    `balances.py::_move` applies one rule to every account type with no
    `type == 'credit'` special case, so an owed 1,125.41 is stored as -1125.41
    and what is USED is `-balance`. Writing `abs(balance)` here would count an
    OVERPAID card -- a positive balance, where the bank owes the user -- as
    debt, which is D-176's exact arithmetic error one table over, and
    `credit_utilisation_below` carries the same warning.
    """
    balance = Decimal(str(account.balance or 0))
    return -balance if balance < 0 else ZERO


def debt_rates(user_id):
    """Share of what you OWE that sits on an account with a recorded rate.

    Dormant when nothing is owed: a user who owes nothing has no rate to record
    and is not failing at anything.
    """
    rows = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(DEBT_TYPES),
    ).all()
    total = sum(_owed(a) for a in rows)
    if total <= 0:
        return None
    covered = sum(_owed(a) for a in rows if a.apr is not None)
    return _share(covered, total)


def debt_limits(user_id):
    """Share of your card balances sitting on a card with a recorded limit.

    Weighted by what is owed, because a limit on a card you owe nothing on tells
    you nothing about your utilisation.
    """
    rows = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(CARD_TYPES),
    ).all()
    if not rows:
        return None
    total = sum(_owed(a) for a in rows)
    if total <= 0:
        # Cards exist but none is in debt. Counting them is the honest fallback:
        # a limit is still worth recording before you use it.
        return _share(sum(1 for a in rows if a.credit_limit is not None), len(rows))
    covered = sum(_owed(a) for a in rows if a.credit_limit is not None)
    return _share(covered, total)


def debt_minimums(user_id):
    """Share of your card debt sitting on a card with a recorded minimum payment."""
    rows = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(CARD_TYPES),
    ).all()
    if not rows:
        return None
    total = sum(_owed(a) for a in rows)
    if total <= 0:
        return _share(sum(1 for a in rows if a.min_payment is not None), len(rows))
    covered = sum(_owed(a) for a in rows if a.min_payment is not None)
    return _share(covered, total)


def transfers_confirmed(user_id):
    """Share of the money in matched transfer pairs that the user has blessed.

    *** A TRANSFER RECORDED AS INCOME INFLATES WHAT finPal THINKS YOU EARN, AND
    BUDGETS EXCLUDE TRANSFERS (D-183). *** So this is not tidiness: it is the
    difference between a true income figure and a flattering one. On the live
    demo it is six rows worth 1,900.00, all named "Transfer into the emergency
    fund" and all recorded as income.

    Dormant when nothing has been matched as a pair.
    """
    rows = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.transfer_group_id.isnot(None),
    ).all()
    if not rows:
        return None
    total = sum(abs(Decimal(str(r.amount or 0))) for r in rows)
    covered = sum(abs(Decimal(str(r.amount or 0)))
                  for r in rows if r.type_source == 'user')
    return _share(covered, total)


def holdings_priced(user_id):
    """Share of your holdings that record what you actually paid.

    *** THIS ACT EXISTS BECAUSE THE MISSING FIGURE DOES NOT READ AS MISSING —
    D-257. *** `Investment.purchase_price` is `nullable=False, default=0`, and
    `gain_loss` is `current_value - shares * purchase_price`. So a holding you
    never priced does not say *unknown*: it reports its ENTIRE market value as
    profit, beside a confident `0.00%`. Recording the price is the truth test's
    first limb exactly -- it makes a figure finPal already shows truer.

    *** PER-USER, NOT HOUSEHOLD-SCOPED, AND THAT IS DELIBERATE. *** The
    Investments PAGE shows a housemate's holdings (portfolios are
    household-scoped in `api/v1/investments.py`), so this denominator is
    smaller than the page's list. That is correct twice over: coins measure
    coverage of the user's OWN picture (decision 5), and writes to someone
    else's holding are not theirs to make -- paying them for a figure they
    cannot fix would be a score they can never clear. Every other coverage
    function in this file is per-user for the same reason.
    """
    rows = Investment.query.join(
        Portfolio, Portfolio.id == Investment.portfolio_id).filter(
            Portfolio.user_id == user_id).all()
    if not rows:
        return None
    return _share(sum(1 for h in rows if h.purchase_price and h.purchase_price > 0),
                  len(rows))


def _shared_expenses_for(user_id):
    """Group expenses this user is actually split into.

    *** `split_with` IS A COMMA-SEPARATED STRING, NOT A RELATION *** -- the
    same shape `Group.balances` reads (`group.py:15`). So the membership test
    happens in Python after the query rather than in SQL, and a substring
    `LIKE` would be wrong: `'bob@x.com'` is a substring of `'rob@x.com'` is
    not, but `'a@x.com'` IS a substring of `'ba@x.com'`.
    """
    rows = Expense.query.filter(
        Expense.group_id.isnot(None),
        Expense.split_with.isnot(None)).all()
    mine = []
    for e in rows:
        ids = [i.strip() for i in (e.split_with or '').split(',') if i.strip()]
        if user_id in ids or e.paid_by == user_id or e.user_id == user_id:
            mine.append(e)
    return mine


def splits_confirmed(user_id):
    """Share of your shared expenses whose split you have confirmed.

    *** DORMANT UNLESS THE USER IS SPLIT INTO SOMETHING. *** A user in no
    group, or in a group with no shared expense, has nothing to confirm.

    Counted from `ActEvent` because **there is no split-confirmation field
    anywhere** -- `split_method`, `split_with`, `split_details` and
    `has_category_splits` all describe the split, none records that a human
    agreed with it (§14.3.1).
    """
    from src.repositories.act_events import ActEventRepository

    mine = _shared_expenses_for(user_id)
    if not mine:
        return None
    confirmed = ActEventRepository().subject_ids(user_id, 'splits_confirmed')
    return _share(sum(1 for e in mine if str(e.id) in confirmed), len(mine))


def settlement_recorded(user_id):
    """Have you recorded settling up with anyone?

    *** KEYED ON THE RECORDING, NEVER ON A BALANCE REACHING ZERO (§14.2). *** A
    user who cannot pay yet is not failing, and a reward keyed to the zero
    would say they were -- voice rule 11. So an outstanding balance does not
    reduce this, and clearing one does not raise it; only the record does.

    *** THE SETTLEMENT CHECK COMES FIRST, BEFORE THE DORMANCY TEST. *** A user
    who has settled everything would otherwise fall into the dormant branch and
    read as absent having actually done the thing.

    *** AND DORMANCY IS "NO SHARED EXPENSE", NOT "NEVER HAD A BALANCE". *** A
    balance is derived from expenses plus settlements, so the schema only knows
    the CURRENT one -- *ever had a balance* is not computable from what is
    stored. This test is, and it fails in the right direction.
    """
    has_settled = db.session.query(Settlement.query.filter(
        db.or_(Settlement.payer_id == user_id,
               Settlement.receiver_id == user_id)).exists()).scalar()
    if has_settled:
        return ONE
    if not _shared_expenses_for(user_id):
        return None
    return ZERO


def budget_adjusted(user_id):
    """Have you come back and changed a budget you had set?

    *** THE CLEAREST THING THE AMENDED TRUTH TEST UNLOCKS. *** Under the
    original §1 this paid nothing: revising a budget makes no figure truer, it
    is a deliberate act of taking control. §14.1 added that limb.

    *** DORMANT UNTIL THERE IS A BUDGET TO REVISE. *** You cannot revise what
    you have not set.

    *** IT READS `ActEvent`, NOT `Budget.updated_at` — D-197. ***
    `src/services/budget/rollover_service.py:76` writes `budget.rollover_amount`
    from a SCHEDULED TASK, which fires `onupdate`. Keyed on the timestamp,
    every budget on every stack would eventually read as *the user revised
    this* because a cron touched it. A column with a non-user writer cannot
    testify to a user's act.
    """
    from src.repositories.act_events import ActEventRepository

    has_budget = db.session.query(
        Budget.query.filter_by(user_id=user_id).exists()).scalar()
    return _binary_conditional(
        has_budget, ActEventRepository().exists(user_id, 'budget_adjusted'))
