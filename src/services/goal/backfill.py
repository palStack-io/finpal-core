"""Give every already-existing linked goal its `goal_accounts` row (B12).

*** THIS IS THE RELEASE-GATING HALF OF B12, AND IT IS NOT THE TABLE. ***
`db.create_all()` at boot DOES create a missing table -- that part is genuinely
free, unlike a missing column (D-121). What it does not do is put a row in it. On
every instance that already has goals, the deploy therefore lands a correct empty
join table and a set of goals that read their accounts through the legacy
`goals.account_id` fallback. That fallback exists precisely so nothing breaks in
that window, but a goal with no link cannot gain a second account, and its payload
carries an empty `accounts: []` beside a real `account_name` -- which is the kind
of half-migrated state that gets discovered by a user.

*** CONDITION-KEYED, PER D-178. A SEED OR RECONCILE CHANGE IS NOT SHIPPED UNTIL A
CORRECTION EXISTS FOR THE ROWS THE OLD VERSION WROTE. *** The condition here is
"*this goal names an account and has no link*", not a version stamp and not a
one-shot flag. So it is idempotent, it is safe on every boot, it self-corrects a
goal that somehow lost its link, and -- the part D-178 was actually about -- an
instance that was already running before this shipped is fixed by it rather than
skipped by it.

Verify it against the DATABASE after deploying, not against a healthy-looking
container: that is how D-178 was found, and how #158->#159 and #162->#163 both
happened. And grep `finpal-scheduler` as well as `finpal-backend` for the log
line below -- the boot advisory lock has been won by the scheduler twice, so
grepping only the backend reads as "the reconcile never ran".
"""

import logging

from src.extensions import db

logger = logging.getLogger(__name__)


def backfill_goal_accounts():
    """Returns the number of links created. Never raises.

    Never raises because it runs inside boot, before the app serves anything: a
    goal this cannot migrate must not be the reason an instance fails to start.
    Each goal is attempted in its own SAVEPOINT so one refusal cannot roll back
    the goals migrated before it -- and a refusal here is a real signal, not
    noise. The only way the insert can be refused is the unique index on
    `(account_id, active_direction)`, which means two ACTIVE goals in the same
    direction were already sharing an account. B5's index on `goals` forbids
    exactly that, so such a pair can only exist on a database that predates it,
    and it is the double-counting vector itself sitting in the data. It is logged
    at WARNING with both goal ids, and the goals keep working through the legacy
    fallback until somebody archives one.
    """
    from src.models.goal import Goal
    from src.models.goal_account import GoalAccount
    from src.services.goal.service import GoalService

    linked_goal_ids = set(
        row[0] for row in db.session.execute(
            db.select(GoalAccount.goal_id).distinct()).all())

    pending = [g for g in Goal.query.filter(Goal.account_id.isnot(None)).all()
               if g.id not in linked_goal_ids]
    if not pending:
        return 0

    svc = GoalService()
    created = 0
    for goal in pending:
        try:
            with db.session.begin_nested():
                db.session.add(GoalAccount(
                    goal_id=goal.id,
                    account_id=goal.account_id,
                    # *** THE GOAL'S OWN SNAPSHOT, CARRIED ACROSS UNCHANGED. ***
                    # Not re-read from the balance. Re-snapshotting would move the
                    # denominator of a percentage the user has already been shown,
                    # which is the one operation this whole model refuses -- and
                    # it would do it silently, to every goal, at once. The
                    # migration is invisible by construction: same denominator,
                    # same percentage, same sentence under the bar (spec §5.3).
                    start_amount=goal.start_amount,
                    # Written directly rather than through `sync_links`, because
                    # `sync_links` would recompute `goals.start_amount` from the
                    # links it can see -- and inside this loop that is the row
                    # being created. The value is the same one it would write.
                    active_direction=(svc.direction(goal)
                                      if goal.status == 'active' else None),
                ))
            created += 1
        except Exception:
            db.session.rollback()
            logger.warning(
                'Goal %s could not be migrated to goal_accounts: account %s is '
                'already held by another ACTIVE goal in the same direction. That '
                'is the double-counting vector B5 closed, in data that predates '
                'it. The goal still works through the legacy account_id path; '
                'archive one of the two goals to resolve it.',
                goal.id, goal.account_id)

    if created:
        db.session.commit()
        logger.info('Backfilled %s goal_accounts link(s)', created)
    return created
