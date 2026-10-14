"""The hard-month opening (PRODUCT_ROADMAP Phase 1e; docs/phase1e-hard-month-spec.md).

After a month that went over a budget, or a return after a long gap, Dashboard and
Budgets open with one calm line and one action before the totals. Decided by Harun
2026-10-14, as drafted:

* **Off plan:** at least one active MONTHLY budget spent more than its limit in the
  last completed calendar month. Weekly and yearly budgets never trigger it: a big
  yearly bill landing in one month is not overspending (the sinking-fund rule).
* **Returning:** the person's previous visit was RETURN_GAP_DAYS or more ago. A first
  visit, or no trustworthy previous visit, never triggers it.
* **Both:** off plan wins. One opening, never two.
* **Dismiss:** once per episode (that month, or that return), on every client, stored
  in `TeachingSeen` like the page guides.

Nothing here changes money, budgets or rewards, and nothing is sent anywhere.
Days are UTC days; finPal has no per-user timezone on the server.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta

from sqlalchemy.exc import IntegrityError

from src.extensions import db
from src.models.act_event import TeachingSeen
from src.models.visit_mark import VisitMark

RETURN_GAP_DAYS = 28
#: How long the "welcome back" opening stays on offer after the return, unless dismissed.
RETURN_WINDOW_DAYS = 7

COPY = {
    'en': {
        'off_plan': {
            'text': "Last month didn't go to plan. You can start by looking at one category.",
            'action': 'Review a category', 'href': '/budgets'},
        'returning': {
            'text': "Welcome back. Start with one category you'd like to understand.",
            'action': 'Review transactions', 'href': '/transactions'},
        'dismiss': 'Close',
    },
    # Spanish is DRAFT until a fluent review (docs/voice.md).
    'es': {
        'off_plan': {
            'text': 'El mes pasado no salió como lo planeaste. Puedes empezar por revisar una categoría.',
            'action': 'Revisar una categoría', 'href': '/budgets'},
        'returning': {
            'text': 'Qué bueno verte de nuevo. Empieza con una categoría que quieras entender.',
            'action': 'Revisar transacciones', 'href': '/transactions'},
        'dismiss': 'Cerrar',
    },
}


def _today():
    return datetime.utcnow().date()


def record_visit(user_id, today=None):
    """Mark today as a visit; note a return when the previous one was long ago.

    Idempotent within a day, and safe to call from any request a client makes on open.
    Returns the mark.
    """
    today = today or _today()
    mark = db.session.get(VisitMark, user_id)
    if mark is None:
        mark = VisitMark(user_id=user_id, last_seen_on=today)
        db.session.add(mark)
    elif mark.last_seen_on < today:
        if (today - mark.last_seen_on).days >= RETURN_GAP_DAYS:
            mark.returned_on = today
        mark.last_seen_on = today
    else:
        return mark
    try:
        db.session.commit()
    except IntegrityError:
        # Two requests on first open raced on the insert; the other one won.
        db.session.rollback()
        mark = db.session.get(VisitMark, user_id)
    return mark


def _previous_month(today):
    first = today.replace(day=1)
    last_of_prev = first - timedelta(days=1)
    return last_of_prev.year, last_of_prev.month


def over_budget_last_month(user_id, today=None):
    """Monthly budgets that spent past their limit in the last completed month."""
    from src.services.budget.service import BudgetService

    today = today or _today()
    year, month = _previous_month(today)
    month_end = datetime(year, month, monthrange(year, month)[1], 23, 59, 59)
    rows, _, _ = BudgetService().get_all_budgets(user_id, year=year, month=month)
    over = []
    for row in rows:
        budget = row['budget']
        if budget.period != 'monthly' or not budget.active:
            continue
        if budget.start_date and budget.start_date > month_end:
            continue  # it did not exist yet, so last month was never planned with it
        if budget.amount is None or budget.amount <= 0:
            continue
        if row['spent'] > budget.amount:
            over.append(budget.id)
    return over, f'{year:04d}-{month:02d}'


def _dismissed(user_id, key):
    return TeachingSeen.query.filter_by(user_id=user_id, topic=key).first() is not None


def hard_month_state(user_id, lang='en', today=None):
    """At most one opening for this person today, or None."""
    today = today or _today()
    mark = record_visit(user_id, today)
    copy = COPY.get(lang, COPY['en'])

    over, month_key = over_budget_last_month(user_id, today)
    if over:
        key = f'hm-month:{month_key}'
        if not _dismissed(user_id, key):
            return {'state': 'off_plan', 'key': key, **copy['off_plan'], 'dismiss': copy['dismiss']}

    if mark.returned_on and (today - mark.returned_on).days < RETURN_WINDOW_DAYS:
        key = f'hm-return:{mark.returned_on.isoformat()}'
        if not _dismissed(user_id, key):
            return {'state': 'returning', 'key': key, **copy['returning'], 'dismiss': copy['dismiss']}
    return None


def dismiss(user_id, key):
    if not (key.startswith('hm-month:') or key.startswith('hm-return:')) or len(key) > 40:
        raise ValueError(key)
    if not _dismissed(user_id, key):
        try:
            db.session.add(TeachingSeen(user_id=user_id, topic=key))
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
    return {'dismissed': key}
