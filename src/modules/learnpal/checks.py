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


# The registry the engine dispatches through. A milestone naming a `check_type`
# that is not in here is SKIPPED and logged -- never treated as satisfied.
# A seeded row with a typo in it must not unlock anything.
CHECKS = {
    'categorised_transactions_at_least': categorised_transactions_at_least,
    'has_active_budget': has_active_budget,
    'categories_classified_at_least': categories_classified_at_least,
    'credit_utilisation_below': credit_utilisation_below,
    'has_debt_account_with_a_rate': has_debt_account_with_a_rate,
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
