"""learnPal "learn as you use it": fixes from the final whole-branch review (2026-11-20).

1. Deleting an account (or removing a member) after finishing a short lesson: finishing writes a
   `learn_completions` row, whose FK to users has no ON DELETE. SQLite does not enforce FKs, so the
   test asserts no learn row is left behind (an orphan row is exactly what Postgres refuses).
2. Non-monthly "used" = action taken or a sinking fund set (a yearly Non-Monthly budget), not any budget.
3. Read-your-month "used" = action taken only in core (core has no record of a by-hand categorisation).
5. At most one recall a day.
6. The hard-month opening and quiet_day read the same, local, date.
8. figures_for treats a decimal ArithmeticError as "not relevant".
"""
from datetime import date, datetime, timedelta, timezone
from decimal import InvalidOperation

import pytest

from src.extensions import db as _db
from src.models.user import User
from src.models.visit_mark import VisitMark
from src.modules.learnpal import routes as learn_routes
from src.modules.learnpal import short_figures
from src.modules.learnpal.marks import record_finish, used_on_money
from src.modules.learnpal.models import (
    LearnCompletion, LearnMilestone, LearnQuizAnswer, LearnRecall, LearnSkillMark)
from src.modules.learnpal.recall import answer_recall, due_recall, quiet_day
from src.modules.learnpal.lesson_quizzes import QUIZZES
from src.services.onboarding import hard_month
from tests.factories import BudgetFactory, CategoryFactory, ExpenseFactory, UserFactory

DAY = date(2026, 11, 20)


def _finished_a_short_lesson(user):
    """What finishing the interest short lesson writes: a mark, a recall and a long-lesson unlock."""
    if _db.session.get(LearnMilestone, 'what-your-apr-costs') is None:
        _db.session.add(LearnMilestone(slug='what-your-apr-costs', title='t'))
        _db.session.commit()
    record_finish(user.id, 'interest', 'finished', DAY)
    assert LearnCompletion.query.filter_by(user_id=user.id).count() == 1


def _learn_rows(user_id):
    return {m.__tablename__: m.query.filter_by(user_id=user_id).count()
            for m in (LearnCompletion, LearnSkillMark, LearnRecall, LearnQuizAnswer)}


# ------------------------------------------------------------------ 1. deletion

def test_a_member_who_finished_a_short_lesson_can_delete_their_account(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    _finished_a_short_lesson(user)
    resp = client.delete('/api/v1/users/account', headers=headers, json={'password': 'testpassword'})
    assert resp.status_code == 200, resp.get_json()
    assert _db.session.get(User, user.id) is None
    assert _learn_rows(user.id) == {t: 0 for t in _learn_rows(user.id)}


def test_delete_all_data_clears_marks_and_recalls_and_keeps_unlocks(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    _finished_a_short_lesson(user)
    resp = client.post('/api/v1/users/delete-all-data', headers=headers, json={'password': 'testpassword'})
    assert resp.status_code == 200, resp.get_json()
    rows = _learn_rows(user.id)
    assert rows['learn_skill_marks'] == 0 and rows['learn_recalls'] == 0
    assert rows['learn_completions'] == 1  # unlocks are permanent; the account stays


def test_removing_a_member_who_finished_a_short_lesson(client, db, auth_headers):
    admin = UserFactory(is_admin=True, password_plain='adminpass')
    member = UserFactory()
    _finished_a_short_lesson(member)
    resp = client.delete(f'/api/v1/team/members/{member.id}',
                         headers=auth_headers(admin, password='adminpass'))
    assert resp.status_code == 200, resp.get_json()
    assert _learn_rows(member.id) == {t: 0 for t in _learn_rows(member.id)}


# ------------------------------------------------------- 2. non-monthly evidence

def _non_monthly_budget(user, period):
    cat = CategoryFactory(user_id=user.id, spending_type='non_monthly')
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=1200, period=period)


def test_a_monthly_non_monthly_budget_is_not_a_sinking_fund(db):
    user = UserFactory()
    _non_monthly_budget(user, 'monthly')
    assert used_on_money(user.id, 'non-monthly') is False


def test_a_yearly_non_monthly_budget_is_a_sinking_fund_set(db):
    user = UserFactory()
    _non_monthly_budget(user, 'yearly')
    assert used_on_money(user.id, 'non-monthly') is True


def test_non_monthly_action_taken_counts(db):
    user = UserFactory()
    record_finish(user.id, 'non-monthly', 'action', DAY)
    assert used_on_money(user.id, 'non-monthly') is True


# ---------------------------------------------------- 3. read-your-month evidence

def test_categorised_transactions_alone_are_not_reading_your_month(db):
    """Rules categorise most transactions; core has no record of a by-hand one, so only the action counts."""
    user = UserFactory()
    cat = CategoryFactory(user_id=user.id)
    for _ in range(12):
        ExpenseFactory(user_id=user.id, category_id=cat.id, date=datetime.utcnow())
    assert used_on_money(user.id, 'read-your-month') is False
    record_finish(user.id, 'month', 'action', DAY)
    assert used_on_money(user.id, 'read-your-month') is True


# --------------------------------------------------------- 5. one recall a day

def test_two_skills_finished_the_same_day_get_different_recall_days(db):
    user = UserFactory()
    record_finish(user.id, 'buffer', 'finished', DAY)
    record_finish(user.id, 'interest', 'finished', DAY)
    dues = sorted(r.due_on for r in LearnRecall.query.filter_by(user_id=user.id).all())
    assert dues == [DAY + timedelta(days=3), DAY + timedelta(days=4)]


def _right(recall):
    q = next(q for q in QUIZZES[recall.milestone_slug]['questions'] if q['id'] == recall.question_id)
    return str([o['right'] for o in q['options']].index(True))


def test_answering_one_recall_does_not_surface_another_the_same_day(db):
    user = UserFactory()
    record_finish(user.id, 'buffer', 'finished', DAY)
    record_finish(user.id, 'interest', 'finished', DAY)
    both_due = DAY + timedelta(days=4)
    first = due_recall(user.id, both_due)
    assert first is not None
    answer_recall(first.id, user.id, _right(first), both_due)
    assert due_recall(user.id, both_due) is None
    second = due_recall(user.id, both_due + timedelta(days=1))
    assert second is not None and second.id != first.id


def test_not_now_also_counts_as_the_days_question(db):
    user = UserFactory()
    record_finish(user.id, 'buffer', 'finished', DAY)
    record_finish(user.id, 'interest', 'finished', DAY)
    both_due = DAY + timedelta(days=4)
    first = due_recall(user.id, both_due)
    answer_recall(first.id, user.id, 'not_now', both_due)
    assert due_recall(user.id, both_due) is None


# ------------------------------------------------------------ 6. local date

NEAR_MIDNIGHT = datetime(2026, 12, 1, 3, 0, tzinfo=timezone.utc)  # 22:00 on Nov 30 in New York


def test_hard_month_and_quiet_day_read_the_same_local_date(client, db, auth_headers, monkeypatch):
    """At 03:00 UTC on Dec 1 a New Yorker is still in November, so "last month" is October."""
    monkeypatch.setattr(hard_month, '_now', lambda: NEAR_MIDNIGHT, raising=False)
    user = UserFactory(timezone='America/New_York')
    cat = CategoryFactory(user_id=user.id)
    BudgetFactory(user_id=user.id, category_id=cat.id, amount=100, period='monthly',
                  start_date=datetime(2026, 1, 1))
    ExpenseFactory(user_id=user.id, category_id=cat.id, amount=150, date=datetime(2026, 10, 15))
    local = learn_routes._local_today(user)
    assert local == date(2026, 11, 30)
    assert quiet_day(user.id, local) is True
    resp = client.get('/api/v1/modules/hard-month?lang=en', headers=auth_headers(user))
    opening = resp.get_json()['opening']
    assert opening is not None and opening['key'] == 'hm-month:2026-10'


def test_the_visit_mark_is_the_local_date(client, db, auth_headers, monkeypatch):
    monkeypatch.setattr(hard_month, '_now', lambda: NEAR_MIDNIGHT, raising=False)
    user = UserFactory(timezone='America/New_York')
    assert client.get('/api/v1/modules/guides?lang=en', headers=auth_headers(user)).status_code == 200
    assert _db.session.get(VisitMark, user.id).last_seen_on == date(2026, 11, 30)


# --------------------------------------------------------- 8. ArithmeticError

def test_a_decimal_arithmetic_error_is_not_relevant(db, monkeypatch, caplog):
    user = UserFactory()

    def broken(_user_id, *a, **kw):
        raise InvalidOperation('bad figure')

    monkeypatch.setitem(short_figures._BUILDERS, 'interest', broken)
    assert short_figures.figures_for(user.id, 'interest') is None
    assert any('interest' in r.getMessage() for r in caplog.records if r.levelname == 'WARNING')
