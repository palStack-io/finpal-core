"""Sending the periodic report — the only unit in this package that talks out.

`period.py`, `builder.py` and `render.py` are pure or read-only. This is where
the side effect lives, so it is where the refusals live too.

*** THREE REFUSALS, IN THIS ORDER, AND THE ORDER IS THE POINT. ***

1. **The instance.** `DEMO_MODE` means this is a demo stack and nothing is sent
   at all — owner decision, 2026-09-08. See `reports_are_refused_here`.
2. **The user.** `household_user_ids()` excludes demo accounts, and
   `notification_email is False` excludes anyone who opted out.
3. **The report.** `is_empty` means there is nothing to say, so nothing is sent
   (D-108: four `$0.00` tiles read as measured data to the person holding them).

*** THE RETURN VALUE IS A TALLY, NOT EVIDENCE OF DELIVERY. *** With
`EMAIL_ENABLED=false`, `EmailService.send_email` logs the message and returns
`True` — so `{'sent': 4}` is exactly what a stack sending nothing also reports.
Every test in this package's guard asserts on the **captured transport calls**,
never on this dict. That is trap 5 of the design spec and it is the reason the
demo refusal cannot be built on `EMAIL_ENABLED`.

One message per household member, each built and rendered separately: the
figures are household-wide but the currency, the `number_locale` and the
timezone are the recipient's own.
"""
import logging
from datetime import datetime, timezone

from flask import current_app

from src.models.user import User
from src.services.email_service import email_service
from src.services.report.builder import build_report
from src.services.report.period import MONTHLY, WEEKLY, resolve_period
from src.services.report.render import render_html
from src.utils.household import household_user_ids

logger = logging.getLogger(__name__)

SUBJECT = {
    WEEKLY: 'Your weekly finPal report',
    MONTHLY: 'Your monthly finPal report',
}


def reports_are_refused_here():
    """Whether this instance must never send a report. **Owner decision, 2026-09-08.**

    *** `finpal-demo-scheduler` RUNS WITH `RUN_SCHEDULER=true`. *** Measured on the
    server and in `docker-compose.demo.yml:167`: the demo stack has its own scheduler
    container, so a job added to `setup_scheduled_tasks()` fires there by default. The
    demo's users are seeded personas with published passwords and made-up money, and
    mailing them a financial summary is at best noise.

    **`EMAIL_ENABLED=false` is NOT this guarantee, and that is the trap.** The demo
    stack does set it (`docker-compose.demo.yml:41`), but `send_email` then *logs the
    message and returns `True`* — so the demo would report a clean send of every
    report, forever, and look correct while doing it. A refusal has to be a refusal.

    **Why `DEMO_MODE` and not a new `REPORT_EMAILS_ENABLED` flag.** `DEMO_MODE` is a
    *necessary* condition for a demo stack: `api/v1/demo.py:46` refuses to start a demo
    session without it, so it cannot quietly fall out of the demo compose while the
    demo still works. A dedicated flag has no such anchor — defaulting it to "send"
    means the demo fires the day someone forgets it, and defaulting it to "don't send"
    re-creates D-149, a cron that claims a job and does nothing on the real stack.

    **The cost, recorded rather than hidden:** a self-hoster who runs `DEMO_MODE=true`
    on the same instance as their real household gets no report emails. That is
    documented in `docs/ENV_REFERENCE.md` and it fails in the safe direction.
    """
    return bool(current_app.config.get('DEMO_MODE', False))


def _send_one(user_id, cadence, as_of):
    """Build, render and send one member's report. Returns the tally key."""
    user = User.query.filter_by(id=user_id).first()
    if user is None:
        # `household_user_ids()` just returned this id, so losing the row between
        # the two queries means something else deleted it mid-run.
        logger.warning('Report skipped: user %s vanished mid-run', user_id)
        return 'failed'

    # `is False`, not `not user.notification_email`: the column is
    # `db.Column(db.Boolean, default=True)` — a PYTHON-side default, so every row
    # written before it existed, or by anything that bypasses the ORM default, holds
    # NULL. NULL means "never expressed a preference", which is opt-in. Only an
    # explicit False is an opt-out.
    if user.notification_email is False:
        return 'skipped_preference'

    # Resolved per user, from the ONE instant the cron fired, in the recipient's own
    # timezone (design spec trap 10). A single global week boundary would file a
    # Sunday-evening transaction in the wrong week for half a household.
    period = resolve_period(cadence, as_of, user.timezone)
    report = build_report(user_id, period, cadence)

    if report['is_empty']:
        logger.info('Report skipped for %s: nothing to report for %s',
                    user_id, period.label)
        return 'skipped_empty'

    subject = f'{SUBJECT[cadence]} — {period.label}'
    # A False here is a real SMTP failure: with email disabled it returns True.
    if not email_service.send_email(to_email=user.id, subject=subject,
                                    html_body=render_html(report)):
        logger.error('Report to %s was not accepted by the mail transport', user_id)
        return 'failed'
    return 'sent'


def send_reports(cadence, as_of=None):
    """Send the `cadence` report to every household member who should get one.

    `as_of` is the instant the run represents; it defaults to now, in UTC. The
    cron passes nothing, and the tests pass a fixed instant — nothing here reads
    the clock more than once, so every member's window comes from the same moment.

    Returns a tally: `sent`, `skipped_preference`, `skipped_empty`, `failed`,
    `recipients`, and `refused` (the reason, or None). **Read the class docstring
    before asserting on it** — it counts attempts, not deliveries.

    One member's failure does not abort the run. A cron that stops at the first
    bad row delivers to whoever sorts first and silently to nobody else.
    """
    if cadence not in (WEEKLY, MONTHLY):
        raise ValueError(f'Unknown report cadence: {cadence!r}')

    tally = {'cadence': cadence, 'recipients': 0, 'sent': 0,
             'skipped_preference': 0, 'skipped_empty': 0, 'failed': 0,
             'refused': None}

    # FIRST, before any recipient is even looked up. Not inside the cron body:
    # a `flask shell` call on the demo stack has to refuse too, and a guard that
    # only exists at one call site is a guard the next call site will not have.
    if reports_are_refused_here():
        logger.warning(
            'Report run refused: DEMO_MODE is on, so this is a demo instance and '
            'no %s reports will be sent.', cadence)
        tally['refused'] = 'DEMO_MODE'
        return tally

    as_of = as_of or datetime.now(timezone.utc)

    # `household_user_ids()` IS the demo-account filter — it is
    # `is_demo_user IS NOT TRUE`, which is why there is no second `is_demo_user`
    # call here. It is the household predicate, not `visible_user_ids`: this is a
    # send list, not a read scope, and the report's own figures are scoped inside
    # `build_report` by `read_scope`.
    recipients = household_user_ids()
    tally['recipients'] = len(recipients)

    for user_id in recipients:
        try:
            tally[_send_one(user_id, cadence, as_of)] += 1
        except Exception:
            # Per user, so one member's bad data cannot silence the household —
            # which is exactly what D-154 did before it was fixed.
            logger.exception('Report failed for %s', user_id)
            tally['failed'] += 1

    logger.info('Report run (%s): %s', cadence, tally)
    return tally
