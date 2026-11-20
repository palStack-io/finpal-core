"""Skill marks for "learn as you use it": understood, used, remembered.

*** MARKS ONLY GO UP. *** `used` and `remembered`, once true, are written back to the
row, so later data loss (a deleted card, a cleared budget) cannot empty a mark. Turning
the learn_as_you_go switch off changes nothing here: rows are kept, only the teaching stops.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.debt_plan import DebtPlan
from src.models.goal import Goal
from src.modules.learnpal.learn_skills import LEARN_SKILLS, skill_by_id
from src.modules.learnpal.models import LearnCompletion, LearnMilestone, LearnSkillMark
from src.modules.learnpal.short_lessons import SHORT_LESSONS

OUTCOMES = ('finished', 'action', 'not_now')


def learning_on(user):
    """The switch. NULL (an old row) reads as on; only an explicit False is off."""
    return getattr(user, 'learn_as_you_go', None) is not False


def _payoff_goal_with_owed_card(user_id):
    """A payoff goal (kind payoff, or a paydown by its numbers) that includes an owed credit account."""
    from src.models.goal_account import GoalAccount
    goals = [g for g in Goal.query.filter(Goal.user_id == user_id, Goal.status != 'archived').all()
             if g.kind == 'payoff' or (g.start_amount is not None and g.target_amount is not None
                                       and (g.start_amount < 0 or g.target_amount < g.start_amount))]
    for g in goals:
        ids = {r.account_id for r in GoalAccount.query.filter_by(goal_id=g.id).all()}
        if g.account_id:
            ids.add(g.account_id)
        if not ids:
            continue
        for a in Account.query.filter(Account.id.in_(ids), Account.user_id == user_id,
                                      Account.type == 'credit').all():
            if a.balance is not None and a.balance < 0:
                return True
    return False


def _buffer_started(user_id):
    """Money held has reached the starter cushion (half a month of essentials)."""
    from src.modules.learnpal.short_figures import starter_buffer
    starter = starter_buffer(user_id)
    if starter is None:
        return False
    pic, _monthly, target = starter
    return Decimal(str(pic['held'])) >= target


def _sinking_fund_set(user_id):
    """A sinking fund is set: a budget that `is_sinking_fund` reads as one (a yearly budget on a
    Non-Monthly category). Any other Non-Monthly budget is exactly what the card teaches about."""
    from src.services.budget.sinking import is_sinking_fund
    rows = db.session.query(Category.spending_type, Budget.period).join(
        Category, Category.id == Budget.category_id).filter(
        Budget.user_id == user_id, Category.spending_type == 'non_monthly').all()
    return any(is_sinking_fund(st, period) for st, period in rows)


def _evidence(user_id, skill_id):
    if skill_id == 'read-your-month':
        # Correction 2026-11-20: categorised transactions are mostly the rules' work, so counting
        # them marked nearly everyone and the card never showed. Core keeps no record of a category
        # set by hand (no source column on expenses; category mappings are also seeded), so only
        # the lesson's own action counts (action_taken_at, checked by the callers).
        return False
    if skill_id == 'fixed-costs':
        return db.session.query(func.count(Category.id)).filter(
            Category.user_id == user_id, Category.spending_type == 'fixed',
            Category.spending_type_source == 'user').scalar() > 0
    if skill_id == 'non-monthly':
        return _sinking_fund_set(user_id)
    if skill_id == 'buffer':
        return _buffer_started(user_id)
    if skill_id == 'interest':
        return (db.session.query(func.count(DebtPlan.id)).filter(
            DebtPlan.user_id == user_id).scalar() > 0
            or _payoff_goal_with_owed_card(user_id))
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


def request_memo():
    """The per-request memo of a read route wrapped in `memoised`, else None (no caching).

    Only those routes turn it on, for the length of one handler: `flask.g` belongs to the app
    context, which can outlive a request (the test client and fixtures reuse one), so a memo left
    on would hand a later call an answer from before a write.
    """
    from flask import g, has_app_context
    return g.get('_learn_memo') if has_app_context() else None


def memoised(handler):
    """Decorate a read route: `used_on_money` and `quiet_day` are computed once per handler call."""
    from functools import wraps

    @wraps(handler)
    def wrapper(*args, **kwargs):
        from flask import g
        previous = g.get('_learn_memo')
        g._learn_memo = {}
        try:
            return handler(*args, **kwargs)
        finally:
            g._learn_memo = previous
    return wrapper


def clear_request_memo():
    """Write paths call this so a later read in the same request sees the write."""
    memo = request_memo()
    if memo is not None:
        memo.clear()


def used_on_money(user_id, skill_id):
    """Has this person used the skill on their own money? Data evidence, or action taken."""
    memo = request_memo()
    key = ('used', user_id, skill_id)
    if memo is not None and key in memo:
        return memo[key]
    row = _mark_row(user_id, skill_id)
    used = (row is not None and row.action_taken_at is not None) or bool(_evidence(user_id, skill_id))
    if memo is not None:
        memo[key] = used
    return used


def _progress_row(skill, row, used):
    return {'id': skill['id'], 'title': skill['title'],
            'marks': {'understood': bool(row and row.understood_at),
                      'used': used,
                      'remembered': bool(row and row.remembered_at)}}


def skills_progress(user_id):
    """Marks for the six skills in LEARN_SKILLS order. Writes back `used` once true."""
    clear_request_memo()
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
    clear_request_memo()
    return _progress_row(skill, row, used_on_money(user_id, skill_id))


def delete_user_learn_rows(user_id, keep_completions=False):
    """Delete a user's learnPal rows from every learn table that exists. Returns rows removed.

    Every path that deletes a `users` row calls this first with the default: `learn_completions`
    has a FK to users with no ON DELETE, so one finished short lesson (which unlocks its long
    lesson) blocked account deletion on Postgres. `keep_completions=True` is for "Delete all
    data", which keeps the account and has always kept lesson unlocks (they are permanent).

    LEARNPAL_ENABLED is off by default, and then create_all never makes the learn_* tables
    even though the models import fine. A DELETE on a missing table would fail (and poison a
    Postgres transaction), so each table is checked first. Does not commit.
    """
    from sqlalchemy import inspect
    from src.modules.learnpal.models import LearnQuizAnswer, LearnRecall

    inspector = inspect(db.session.connection())
    removed = 0
    models = (LearnQuizAnswer, LearnSkillMark, LearnRecall) if keep_completions else (
        LearnQuizAnswer, LearnCompletion, LearnSkillMark, LearnRecall)
    for model in models:
        if inspector.has_table(model.__tablename__):
            removed += model.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    return removed
