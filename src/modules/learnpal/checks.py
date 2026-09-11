"""learnPal's event predicates.

*** EVERY PREDICATE IS PURE `check(user_id, args) -> bool` AND UNIT-TESTABLE
WITHOUT HTTP. *** That is the parent spec's design and it is kept exactly,
because the same convention is reused by `questions.py`'s generators in C1e --
one naming convention for both, so a reader who learns one has learned the other.

*** A PREDICATE THAT CANNOT ANSWER RETURNS False, NEVER True. *** An unlock is
permanent (design decision 4), so a wrong True can never be taken back, while a
wrong False costs the user one evaluation cycle. The asymmetry is the whole
reason the default is what it is.

They read core tables directly rather than going through services. That is a
deliberate narrowing: a predicate must not be able to WRITE anything, and the
services can.
"""

import logging

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.recurring import RecurringExpense
from src.models.transaction import Expense

logger = logging.getLogger(__name__)


def categorised_transactions_at_least(user_id, args):
    """At least `n` of this user's expenses carry a category.

    `where-your-money-goes` is pointless before there is anything to look at,
    and a lesson about categories shown to somebody with none is the shape of
    the demo demonstrating its own emptiness (D-77).
    """
    n = int((args or {}).get('n', 20))
    count = db.session.query(func.count(Expense.id)).filter(
        Expense.user_id == user_id,
        Expense.category_id.isnot(None),
    ).scalar() or 0
    return count >= n


def has_active_budget(user_id, args=None):
    """This user has at least one active budget."""
    return db.session.query(Budget.id).filter(
        Budget.user_id == user_id,
        Budget.active.is_(True),
    ).first() is not None


def categories_classified_at_least(user_id, args):
    """At least `n` categories carry a `spending_type`.

    The budget spending-groups column. NULL means "not classified yet", which
    is where every existing user starts, so this is the honest test of whether
    the user has actually engaged with the feature.
    """
    n = int((args or {}).get('n', 5))
    count = db.session.query(func.count(Category.id)).filter(
        Category.user_id == user_id,
        Category.spending_type.isnot(None),
    ).scalar() or 0
    return count >= n


def credit_utilisation_below(user_id, args):
    """Utilisation across cards with a known limit is below `pct` percent.

    *** CARD DEBT IS A NEGATIVE BALANCE. *** `balances.py::_move` applies one
    rule for every account type, with no `type == 'credit'` special case, so an
    owed 1,125.41 is stored as -1125.41 and what is USED is `-balance`. Writing
    `abs(balance)` here would count an OVERPAID card -- a positive balance,
    where the bank owes the user -- as utilisation, which is D-176's exact
    arithmetic error one table over.

    *** RETURNS False WHEN NO CARD HAS A LIMIT, WHICH IS NOT THE SAME AS 0%. ***
    Before C1a nothing collected `credit_limit`, so this was the universal case;
    treating "unknown" as "excellent utilisation" would have unlocked the lesson
    for everybody on no evidence at all.
    """
    pct = float((args or {}).get('pct', 30))

    cards = Account.query.filter(
        Account.user_id == user_id,
        Account.type == 'credit',
        Account.credit_limit.isnot(None),
    ).all()
    limit_total = sum(float(c.credit_limit or 0) for c in cards)
    if limit_total <= 0:
        return False

    used_total = sum(max(0.0, -float(c.balance or 0)) for c in cards)
    return (used_total / limit_total) * 100 < pct


def has_debt_account_with_a_rate(user_id, args=None):
    """A card or loan with an APR recorded.

    *** THIS IS THE PREDICATE C1a EXISTS TO MAKE ANSWERABLE. *** `Account.apr`
    was NULL for every user on every instance until APR capture shipped, so
    before it this returned False universally -- which is a decent test of
    whether that slice was worth doing.
    """
    return Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(('credit', 'loan')),
        Account.apr.isnot(None),
    ).first() is not None


# ===========================================================================
# The eleven approved drafts' predicates (lessons 9-19, seeded 2026-09-11).
#
# *** EVERY DEFINITION BELOW IS A DECISION I TOOK AND RECORDED, NOT ONE THE
# DRAFT MADE. *** `2026-09-10-learnpal-lesson-drafts-2.md` names each
# `check_type` and says nothing about what it means in SQL -- so each docstring
# states the rule chosen and why, and each has a test asserting the NEGATIVE
# case as well as the positive one. An unlock is permanent, so a predicate that
# is too generous can never be taken back.
#
# *** AND NONE OF THEM MAY GO THROUGH `GoalService`. *** This module's header
# narrows predicates to reading core tables directly, because a predicate must
# not be able to WRITE and a service can -- `stamp_if_achieved` commits. Where a
# derived figure is needed, the COLUMN RULE is mirrored and the mirror is pinned
# by a test against the service's own answer.
# ===========================================================================

# `GoalService.direction`, as a pure column rule. Mirrored rather than imported
# because importing the service into a predicate would put a writer one attribute
# access away. `test_learnpal_new_checks.py` asserts the two agree.
def _is_paydown(goal):
    return goal.start_amount < 0 or goal.target_amount < goal.start_amount


def _owed_accounts(user_id):
    """Credit and loan accounts with money actually OWED.

    *** CARD DEBT IS A NEGATIVE BALANCE AND AN OVERPAID CARD IS NOT DEBT. ***
    `balances.py::_move` applies one rule for every account type, so what is
    owed is `-balance`. Counting `abs(balance)` would make a card the bank owes
    the user look like debt -- D-176's arithmetic one table over, and
    `credit_utilisation_below` right above carries the same warning.
    """
    return [a for a in Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(('credit', 'loan')),
    ).all() if float(a.balance or 0) < 0]


def _income_months(user_id):
    """The set of (year, month) in which this user recorded any income."""
    rows = db.session.query(Expense.date).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'income',
    ).all()
    return {(r[0].year, r[0].month) for r in rows if r[0] is not None}


def has_two_months_of_income(user_id, args=None):
    """Income recorded in at least two DISTINCT calendar months.

    Lesson 9 is about the gap between the offer letter and what lands, and it
    needs something to compare -- *** TWO MONTHS, NOT TWO TRANSACTIONS. *** A
    single month with a salary and a refund in it says nothing about what
    regularly arrives, and a user who imported one statement would get a lesson
    about variance with no variance to look at (D-77's shape: the demo
    demonstrating its own emptiness).
    """
    return len(_income_months(user_id)) >= 2


def has_debt_account_and_income(user_id, args=None):
    """Money owed on a card or loan, AND income recorded at all.

    Lesson 10 is debt-to-income, which is a RATIO: both halves must exist or the
    figure is undefined. Returning True on debt alone would open a lesson whose
    subject the user's data cannot express -- and an unlock is permanent.
    """
    return bool(_owed_accounts(user_id)) and bool(_income_months(user_id))


def has_two_or_more_debt_accounts(user_id, args=None):
    """Two or more cards or loans with money owed.

    Lesson 11 is about consolidation, which is only a question when there is
    more than one thing to consolidate. *** COUNTS ACCOUNTS IN DEBT, NOT
    ACCOUNTS OF A DEBT TYPE. *** Two credit cards, one of them cleared, is one
    debt -- and telling somebody who has paid a card off that they might
    consolidate "their debts" is the product misreading its own data.
    """
    return len(_owed_accounts(user_id)) >= 2


def has_debt_and_no_savings_goal(user_id, args=None):
    """Money owed, and no non-archived goal that accumulates.

    Lesson 12 argues the shelter goes up before the climb, so it is FOR the
    person who has not started one. *** ARCHIVED GOALS DO NOT COUNT AND ACHIEVED
    ONES DO. *** Somebody who built a buffer and finished the goal has the
    buffer; somebody who archived a savings goal has abandoned it, and the
    lesson is addressed to them.
    """
    if not _owed_accounts(user_id):
        return False
    goals = Goal.query.filter(
        Goal.user_id == user_id, Goal.status != 'archived').all()
    return not any(not _is_paydown(g) for g in goals)


def has_non_monthly_spending(user_id, args=None):
    """Something that recurs and is NOT monthly, by either of the two marks.

    Lesson 14 is sinking funds, and finPal knows about non-monthly spending in
    two independent places: a category classified `non_monthly` (the budget
    spending groups), or an active recurring expense whose frequency is
    `yearly`. *** EITHER IS ENOUGH, BECAUSE A USER WHO HAS DONE ONE HAS NOT
    NECESSARILY DONE THE OTHER *** -- and requiring both would gate a lesson on
    the user having adopted a feature rather than on the fact being true.

    `daily` and `weekly` are MORE often than monthly, not less. A sinking fund
    is for the thing that arrives once a year, and folding them in would make
    the predicate true for anybody with a coffee habit.
    """
    classified = db.session.query(Category.id).filter(
        Category.user_id == user_id,
        Category.spending_type == 'non_monthly',
    ).first() is not None
    if classified:
        return True
    return db.session.query(RecurringExpense.id).filter(
        RecurringExpense.user_id == user_id,
        RecurringExpense.active.is_(True),
        func.lower(RecurringExpense.frequency) == 'yearly',
    ).first() is not None


def has_recurring_income(user_id, args=None):
    """An ACTIVE recurring row the user marked as income.

    Lesson 15 is paying yourself first, which presumes a predictable arrival to
    pay yourself out of. *** READ FROM `RecurringExpense.transaction_type`, WHICH
    IS THE ONLY PLACE finPal RECORDS THAT A CATEGORY IS INCOME. *** `Category`
    has no income/expense column at all (D-189), so the recurring row is the
    fact, and a category named "Salary" is a string a user can rename.
    """
    return db.session.query(RecurringExpense.id).filter(
        RecurringExpense.user_id == user_id,
        RecurringExpense.active.is_(True),
        RecurringExpense.transaction_type == 'income',
    ).first() is not None


def has_buffer_and_debt(user_id, args=None):
    """A savings goal that has REACHED its target, and debt still outstanding.

    Lesson 17 is the fork in the trail -- stop saving, start paying down -- and
    it is only a fork once both are true. *** THE BUFFER IS READ FROM THE
    WATERMARK, NOT FROM CURRENT PROGRESS. *** `Goal.highest_progress` only ever
    rises, so a user who reached their target and then dipped into the buffer
    has still built one; reading live progress would take the lesson back from
    exactly the person the dip proves needed it. That column is only reliably
    populated since D-187 wired a writer to it, which is why this predicate
    could not have been written before today.

    `status == 'achieved'` is accepted too, because the server stamps it on the
    transition and a goal archived after being achieved keeps the flag.
    """
    if not _owed_accounts(user_id):
        return False
    goals = Goal.query.filter(Goal.user_id == user_id).all()
    for goal in goals:
        if _is_paydown(goal):
            continue
        if goal.status == 'achieved':
            return True
        if goal.highest_progress is not None and goal.highest_progress >= 1:
            return True
    return False


def has_completed_three_lessons(user_id, args):
    """At least `n` lessons already unlocked. Default 3.

    Lesson 19 is *what finPal cannot tell you*, and it is deliberately last: it
    is the one that says the product has limits, and saying that to somebody who
    has read nothing is a disclaimer rather than a lesson.

    *** THE ONLY PREDICATE THAT READS learnPal's OWN TABLE, AND IT CANNOT COUNT
    ITSELF. *** `evaluate_for_user` snapshots `already` BEFORE the loop and adds
    to it as it goes, so a milestone unlocked earlier in the same pass is
    already in the database when this runs -- which is correct and is why the
    threshold is a floor rather than an equality.
    """
    n = int((args or {}).get('n', 3))
    from src.modules.learnpal.models import LearnCompletion
    count = db.session.query(func.count(LearnCompletion.id)).filter(
        LearnCompletion.user_id == user_id).scalar() or 0
    return count >= n


# The registry the engine dispatches through. A milestone naming a `check_type`
# that is not in here is SKIPPED and logged -- never treated as satisfied.
# A seeded row with a typo in it must not unlock anything.
CHECKS = {
    'categorised_transactions_at_least': categorised_transactions_at_least,
    'has_active_budget': has_active_budget,
    'categories_classified_at_least': categories_classified_at_least,
    'credit_utilisation_below': credit_utilisation_below,
    'has_debt_account_with_a_rate': has_debt_account_with_a_rate,
    # Lessons 9-19, seeded 2026-09-11.
    'has_two_months_of_income': has_two_months_of_income,
    'has_debt_account_and_income': has_debt_account_and_income,
    'has_two_or_more_debt_accounts': has_two_or_more_debt_accounts,
    'has_debt_and_no_savings_goal': has_debt_and_no_savings_goal,
    'has_non_monthly_spending': has_non_monthly_spending,
    'has_recurring_income': has_recurring_income,
    'has_buffer_and_debt': has_buffer_and_debt,
    'has_completed_three_lessons': has_completed_three_lessons,
}


# *** WHY A PREDICATE-GATED LESSON IS LOCKED, IN WORDS, AND WHY IT LIVES HERE
# RATHER THAN IN THE VIEW. *** The learnPal home has to answer "what is next and
# why can I not read it yet", and a reason assembled in a template drifts from
# the predicate it describes the moment one of them changes. Keeping the two in
# one file means adding a predicate without a reason is a visible omission.
#
# `{n}` and `{pct}` are filled from the milestone's own `check_args`, so the
# number in the sentence is the number the predicate actually tests -- never a
# default typed twice. A predicate with no placeholder ignores the args.
#
# *** FAIL-CLOSED, LIKE `CHECKS` ITSELF. *** An unknown `check_type` gets `None`
# and the client says it cannot explain the lock, rather than a plausible
# sentence about a condition nobody is testing. `run_check` already refuses to
# unlock such a milestone; this refuses to describe it.
# `(sentence, defaults)`. The defaults exist because a seeded row MAY omit
# `check_args`, and they are a second copy of the numbers inside the predicates
# above -- which is precisely the drift this project keeps paying for. So
# `test_learnpal_stats.py` pins them BEHAVIOURALLY: for each entry it calls the
# predicate with no args and with the declared default and asserts the two agree
# on a fixture sitting exactly on the boundary. A spelling guard would go blind
# the moment somebody renamed a key (D-165's class); a boundary fixture cannot.
CHECK_REASONS = {
    'categorised_transactions_at_least':
        ('Give {n} transactions a category', {'n': 20}),
    'has_active_budget':
        ('Have an active budget', {}),
    'categories_classified_at_least':
        ('Classify {n} categories as fixed, flexible or non-monthly', {'n': 5}),
    'credit_utilisation_below':
        ('Get your card utilisation below {pct}%', {'pct': 30}),
    'has_debt_account_with_a_rate':
        ('Record the interest rate on a card or loan', {}),
    # *** EACH SENTENCE SAYS WHAT TO DO, NOT WHAT IS MISSING. *** "You have no
    # recurring income" is a description; "Add your pay as a recurring income"
    # is something the user can act on, and the home renders these as the only
    # answer to "why is this locked".
    'has_two_months_of_income':
        ('Record income in two different months', {}),
    'has_debt_account_and_income':
        ('Record some income, and a card or loan with a balance', {}),
    'has_two_or_more_debt_accounts':
        ('Have two or more cards or loans with a balance owing', {}),
    'has_debt_and_no_savings_goal':
        ('Opens while you have debt and no savings goal yet', {}),
    'has_non_monthly_spending':
        ('Classify a category as non-monthly, or add a yearly recurring bill',
         {}),
    'has_recurring_income':
        ('Add your pay as a recurring income', {}),
    'has_buffer_and_debt':
        ('Reach the target on a savings goal while you still have debt', {}),
    'has_completed_three_lessons':
        ('Read {n} lessons first', {'n': 3}),
}


def check_reason(check_type, args=None):
    """One line saying what this predicate wants, or `None` if it cannot say.

    *** NEVER GUESS. *** `None` is a handled state the client renders as "we
    cannot explain this one yet", which is honest about a seeded row naming a
    predicate this build does not have -- and the same fail-closed rule
    `run_check` follows. `run_check` refuses to unlock such a milestone; this
    refuses to describe it.

    The number in the sentence comes from the milestone's OWN `check_args`
    wherever it has them, so it is the number the predicate actually tests
    rather than one typed twice.
    """
    entry = CHECK_REASONS.get(check_type)
    if entry is None:
        return None
    template, defaults = entry
    values = dict(defaults)
    values.update({k: v for k, v in (args or {}).items() if k in defaults})
    try:
        return template.format(**values)
    except (KeyError, IndexError, ValueError):
        return None


def run_check(check_type, user_id, args=None):
    """Dispatch, failing CLOSED on anything unexpected.

    An unknown name, a predicate that raises, a bad `args` shape -- all of them
    answer False. The alternative is a permanent unlock granted by a typo.
    """
    fn = CHECKS.get(check_type)
    if fn is None:
        logger.warning('learnpal: unknown check_type %r — treated as not met', check_type)
        return False
    try:
        return bool(fn(user_id, args))
    except Exception:
        logger.exception('learnpal: check %r raised — treated as not met', check_type)
        return False
