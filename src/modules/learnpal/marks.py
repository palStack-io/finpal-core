"""Skill marks for "learn as you use it": understood, used, remembered.

*** MARKS ONLY GO UP. *** `used` and `remembered`, once true, are written back to the
row, so later data loss (a deleted card, a cleared budget) cannot empty a mark. Turning
the learn_as_you_go switch off changes nothing here: rows are kept, only the teaching stops.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.debt_plan import DebtPlan
from src.models.goal import Goal
from src.models.transaction import Expense
from src.modules.learnpal.learn_skills import LEARN_SKILLS, skill_by_id
from src.modules.learnpal.models import LearnCompletion, LearnMilestone, LearnSkillMark
from src.modules.learnpal.short_lessons import SHORT_LESSONS

OUTCOMES = ('finished', 'action', 'not_now')
MIN_MONTH_TRANSACTIONS = 10
MONTH_WINDOW_DAYS = 60


def learning_on(user):
    """The switch. NULL (an old row) reads as on; only an explicit False is off."""
    return getattr(user, 'learn_as_you_go', None) is not False


def _owed_interest_known(user_id):
    """At least one account owed, and every owed account has a rate above zero."""
    owed = [a for a in Account.query.filter(
        Account.user_id == user_id, Account.type.in_(('credit', 'loan'))).all()
        if a.balance is not None and a.balance < 0]
    return bool(owed) and all(a.apr is not None and a.apr > 0 for a in owed)


def _count_budgets_non_monthly(user_id):
    return db.session.query(func.count(Budget.id)).join(
        Category, Category.id == Budget.category_id).filter(
        Budget.user_id == user_id, Category.spending_type == 'non_monthly').scalar() or 0


def _evidence(user_id, skill_id):
    if skill_id == 'read-your-month':
        since = datetime.utcnow() - timedelta(days=MONTH_WINDOW_DAYS)
        n = db.session.query(func.count(Expense.id)).filter(
            Expense.user_id == user_id, Expense.category_id.isnot(None),
            Expense.date >= since).scalar() or 0
        return n >= MIN_MONTH_TRANSACTIONS
    if skill_id == 'fixed-costs':
        return db.session.query(func.count(Category.id)).filter(
            Category.user_id == user_id, Category.spending_type == 'fixed',
            Category.spending_type_source == 'user').scalar() > 0
    if skill_id == 'non-monthly':
        return _count_budgets_non_monthly(user_id) > 0
    if skill_id == 'buffer':
        return db.session.query(func.count(Goal.id)).filter(
            Goal.user_id == user_id, Goal.kind == 'savings').scalar() > 0
    if skill_id == 'interest':
        return _owed_interest_known(user_id)
    if skill_id == 'pay-down':
        return db.session.query(func.count(DebtPlan.id)).filter(
            DebtPlan.user_id == user_id).scalar() > 0
    return False


def _mark_row(user_id, skill_id):
    return LearnSkillMark.query.filter_by(user_id=user_id, skill=skill_id).first()


def _get_or_create(user_id, skill_id):
    row = _mark_row(user_id, skill_id)
    if row is None:
        row = LearnSkillMark(user_id=user_id, skill=skill_id)
        db.session.add(row)
        db.session.flush()
    return row


def used_on_money(user_id, skill_id):
    """Has this person used the skill on their own money? Data evidence, or action taken."""
    row = _mark_row(user_id, skill_id)
    if row is not None and row.action_taken_at is not None:
        return True
    return bool(_evidence(user_id, skill_id))


def _progress_row(skill, row, used):
    return {'id': skill['id'], 'title': skill['title'],
            'marks': {'understood': bool(row and row.understood_at),
                      'used': used,
                      'remembered': bool(row and row.remembered_at)}}


def skills_progress(user_id):
    """Marks for the six skills in LEARN_SKILLS order. Writes back `used` once true."""
    now = datetime.utcnow()
    out = []
    for skill in LEARN_SKILLS:
        row = _mark_row(user_id, skill['id'])
        used = row is not None and row.action_taken_at is not None
        if not used and _evidence(user_id, skill['id']):
            row = row or _get_or_create(user_id, skill['id'])
            row.action_taken_at = now
            used = True
        out.append(_progress_row(skill, row, used))
    db.session.commit()
    return out


def _unlock_long_lesson(user_id, slug):
    """Unlock the long lesson the way engine.py does; never re-lock or change verified_by."""
    if not slug or db.session.get(LearnMilestone, slug) is None:
        return
    from src.modules.learnpal.engine import _unlock
    if LearnCompletion.query.filter_by(user_id=user_id, milestone_slug=slug).first() is None:
        _unlock(user_id, slug, verified_by='read')


def record_finish(user_id, short_id, outcome, today=None):
    """A short lesson was finished. Returns that skill's progress row.

    `today` is the person's local date (the routes pass it); it dates the first recall.
    """
    if outcome not in OUTCOMES:
        raise ValueError(f'unknown outcome: {outcome}')
    short = SHORT_LESSONS.get(short_id)
    if short is None:
        raise ValueError(f'unknown short lesson: {short_id}')
    skill_id = short['skill']
    skill = skill_by_id(skill_id)
    now = datetime.utcnow()
    row = _get_or_create(user_id, skill_id)
    first = row.understood_at is None
    if first:
        row.understood_at = now
    if outcome == 'action' and row.action_taken_at is None:
        row.action_taken_at = now
    if outcome == 'not_now':
        row.set_aside_at = now
    if first:
        from src.modules.learnpal.recall import schedule_first_recall
        schedule_first_recall(user_id, skill_id, today or date.today())
        _unlock_long_lesson(user_id, short.get('long_lesson'))
    db.session.commit()
    return _progress_row(skill, row, used_on_money(user_id, skill_id))


def delete_user_learn_rows(user_id):
    """Delete a user's learnPal rows from every learn table that exists. Returns rows removed.

    LEARNPAL_ENABLED is off by default, and then create_all never makes the learn_* tables
    even though the models import fine. A DELETE on a missing table would fail (and poison a
    Postgres transaction), so each table is checked first. Does not commit.
    """
    from sqlalchemy import inspect
    from src.modules.learnpal.models import LearnQuizAnswer, LearnRecall

    inspector = inspect(db.session.connection())
    removed = 0
    for model in (LearnQuizAnswer, LearnCompletion, LearnSkillMark, LearnRecall):
        if inspector.has_table(model.__tablename__):
            removed += model.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    return removed
