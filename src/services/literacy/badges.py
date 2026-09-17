"""Achievement badges: milestones a user reached, recorded once and kept.

*** THESE ARE OUTCOMES, WHICH §14.1 EXCLUDES FROM EARNING — AND THEY ARE STILL
SAFE. *** Owner, 2026-09-17: *"badges are given to those who pay all of their
debt or accomplish a goal or stayed onbudget for continuosly"*. Paying off debt
and finishing a goal both lean heavily on income, so rewarding them with COINS
would make a high earner out-climb a careful low earner. That is the brief's own
failure mode one level up, and it is the same reason debt-to-income was refused
for Everest.

Three properties make them work anyway, and all three are load-bearing:

1. *** THEY PAY BADGES ONLY. NO COINS. NO ALTITUDE. *** Owner decision. The
   coin economy and Everest keep measuring effort, so nothing here can make a
   financial picture look better than it is.
2. *** THEY ARE RECORDED WHEN FIRST OBSERVED, NEVER RE-EVALUATED. *** A live
   predicate would take the badge back the moment the user borrowed again, and
   decision 1 says nothing earned can ever be taken away. `BadgeEarned` is
   append-only.
3. *** AN UNEARNED BADGE IS ABSENT, NEVER PRESENT-AND-FALSE. *** No client can
   render a locked grid saying *you have not paid your debt*, which is the
   report card decision 5 exists to forbid. Same rule as a dormant act (§4.2.1).

*** THE STREAK RECORDS THE BEST, NEVER THE CURRENT — parked decision 4. *** A
visible current streak deletes something the user earned the month it breaks.
`on-budget-*` badges are cut at a BEST run, so a bad month costs nothing.
"""

import logging
from calendar import monthrange
from datetime import date
from decimal import Decimal

from src.extensions import db
from src.models.transaction import Expense

logger = logging.getLogger(__name__)

# How far back the streak looks. Bounded, because this runs per user in the
# nightly pass and an unbounded history would grow the cost forever.
STREAK_LOOKBACK_MONTHS = 24


def _previous_months(count):
    """The `count` most recent COMPLETE months, newest first.

    *** THE CURRENT MONTH IS EXCLUDED, AND THAT IS NOT AN OFF-BY-ONE. *** On the
    3rd, rent has landed and groceries have not, so a part-month reads as
    wildly under budget and would hand out a streak nobody earned. Same
    reasoning as `lastFullMonth()` on the Categories page.
    """
    today = date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(count):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append((y, m))
    return out


def _within_budget(user_id, year, month):
    """Was this user inside their budgets that month? `None` if unknowable.

    *** `None` MEANS "NO BUDGET EXISTED", WHICH IS NOT THE SAME AS FAILING. ***
    A month before the user set any budget cannot count for OR against a
    streak; it breaks the run rather than failing it, because there is nothing
    to have adhered to.
    """
    from src.models.budget import Budget

    budgets = Budget.query.filter_by(user_id=user_id, active=True).all()
    if not budgets:
        return None

    # *** A MONTH WITH NO ACTIVITY IS UNKNOWABLE, NOT A MONTH YOU SUCCEEDED. ***
    # Found on the live demo: every persona scored `best_run=24`, the entire
    # lookback window. `calculate_spent_amount` returns 0 for a month with no
    # transactions, and `0 <= planned` is True — so every month before the user
    # had any data counted as a month on budget. A brand-new user with one
    # budget would have collected "a year on budget" for having been absent,
    # which is a reward for a circumstance and the exact thing §14.1 excludes.
    #
    # Measured, not assumed: the demo seeds a few months of transactions and
    # scored 24 regardless.
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    activity = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.date >= first,
        Expense.date <= last,
    ).count()
    if activity == 0:
        return None

    planned = Decimal(0)
    spent = Decimal(0)
    for b in budgets:
        try:
            planned += Decimal(str(b.amount or 0))
            spent += Decimal(str(b.calculate_spent_amount(year, month) or 0))
        except Exception:
            logger.exception('badges: budget %s failed for %s-%s', b.id, year, month)
            return None
    if planned <= 0:
        return None
    return spent <= planned


def best_on_budget_run(user_id):
    """The longest run of consecutive complete months inside budget.

    *** THE BEST, NEVER THE CURRENT (parked decision 4). *** Scans backwards and
    keeps the longest run it finds, so a bad month last month cannot erase a
    six-month run from the spring.
    """
    best = 0
    run = 0
    for (y, m) in _previous_months(STREAK_LOOKBACK_MONTHS):
        ok = _within_budget(user_id, y, m)
        if ok is True:
            run += 1
            best = max(best, run)
        else:
            # False (over budget) and None (no budget to judge) both END a run.
            # Neither reduces `best`, which is the whole point.
            run = 0
    return best


def _has_cleared_all_debt(user_id):
    """Every debt account this user holds is at zero or in credit.

    *** REQUIRES THEM TO HAVE HAD DEBT AT ALL. *** A user with no credit card
    and no loan has not cleared anything, so the badge is simply absent for
    them rather than handed out for a circumstance.
    """
    from src.models.account import Account
    from src.services.literacy.coverage import DEBT_TYPES, _owed

    debts = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(DEBT_TYPES),
    ).all()
    if not debts:
        return False
    return all(_owed(a) <= 0 for a in debts)


def _has_reached_a_goal(user_id):
    from src.models.goal import Goal
    return db.session.query(Goal.query.filter(
        Goal.user_id == user_id,
        db.or_(Goal.status == 'achieved', Goal.achieved_at.isnot(None)),
    ).exists()).scalar()


# slug -> (title, predicate). Titles are what a client renders; art comes from
# `docs/superpowers/specs/2026-09-17-contributor-badge-art-prompt.md`.
BADGES = {
    'debt-free': (
        'Debt clear',
        _has_cleared_all_debt,
    ),
    'goal-reached': (
        'Goal reached',
        _has_reached_a_goal,
    ),
    'on-budget-3': (
        'Three months on budget',
        lambda uid: best_on_budget_run(uid) >= 3,
    ),
    'on-budget-6': (
        'Six months on budget',
        lambda uid: best_on_budget_run(uid) >= 6,
    ),
    'on-budget-12': (
        'A year on budget',
        lambda uid: best_on_budget_run(uid) >= 12,
    ),
}


def award_badges(user_id):
    """Record any badge this user has newly qualified for. `[slug]`.

    *** DOES NOT COMMIT. *** The caller owns the transaction, matching
    `upsert_award`, `ack` and `record`.

    *** ONE BROKEN PREDICATE MUST NOT COST THE OTHER FOUR. *** Same failure
    isolation as `award_for_user`, and the same reason: a predicate that raises
    is a bug, not a verdict.
    """
    from src.models.act_event import BadgeEarned

    held = {row.slug for row in
            BadgeEarned.query.filter_by(user_id=user_id).all()}
    new = []
    for slug, (_title, predicate) in BADGES.items():
        if slug in held:
            continue
        try:
            if not predicate(user_id):
                continue
        except Exception:
            logger.exception('badges: predicate for %r raised — skipped', slug)
            continue
        db.session.add(BadgeEarned(user_id=user_id, slug=slug))
        new.append(slug)
    return new


def earned_badges(user_id):
    """`[{slug, title, earned_at}]` for badges this user HOLDS.

    *** ONLY THE EARNED ONES GO ON THE WIRE. *** An unearned badge is absent,
    never present-and-false, so no client can render a locked grid telling
    somebody they have not paid their debt.
    """
    from src.models.act_event import BadgeEarned

    rows = BadgeEarned.query.filter_by(user_id=user_id).order_by(
        BadgeEarned.earned_at.asc()).all()
    return [
        {
            'slug': r.slug,
            'title': BADGES.get(r.slug, (r.slug, None))[0],
            'earned_at': r.earned_at.isoformat() if r.earned_at else None,
        }
        for r in rows
    ]


def award_all_badges(app):
    """The nightly pass. Commits per user. Returns how many badges were given.

    *** PER-USER COMMIT, SO ONE USER'S FAILURE CANNOT ROLL BACK EVERYBODY
    ELSE'S — D-61's lesson, where a shared session silently rolled writes back.

    *** EVERY USER, NOT EVERY USER WITH A GOAL — D-205. *** That row exists
    because a pass filtered on `Goal.user_id` and so skipped the population it
    was for. `debt-free` and `on-budget-*` are goal-independent, so the same
    filter would be the same defect with a different name.
    """
    from src.models.user import User

    total = 0
    for (user_id,) in db.session.query(User.id).all():
        try:
            total += len(award_badges(user_id))
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('badges: pass failed for %s', user_id)
    if total:
        app.logger.info('badges: %s badge(s) awarded', total)
    return total
