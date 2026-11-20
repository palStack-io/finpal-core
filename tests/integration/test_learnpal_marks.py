"""Skill marks, the learn_as_you_go switch, and the two new tables."""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import inspect

from src.extensions import db as _db
from src.models.debt_plan import DebtPlan
from src.models.goal import Goal
from src.modules.learnpal.learn_skills import LEARN_SKILLS
from src.modules.learnpal.marks import learning_on, record_finish, skills_progress, used_on_money
from src.modules.learnpal.models import (
    LearnCompletion, LearnMilestone, LearnRecall, LearnSkillMark)
from src.modules.learnpal.short_lessons import SHORT_LESSONS
from src.services.auth.service import AuthService
from src.services.demo.service import _learnpal_reset
from tests.factories import AccountFactory, CategoryFactory, UserFactory, ExpenseFactory


@pytest.fixture
def user(db):
    return UserFactory()


def _marks(user_id):
    return {r['id']: r['marks'] for r in skills_progress(user_id)}


def test_new_user_six_skills_all_false(user):
    rows = skills_progress(user.id)
    assert [r['id'] for r in rows] == [s['id'] for s in LEARN_SKILLS] and len(rows) == 6
    for r in rows:
        assert r['marks'] == {'understood': False, 'used': False, 'remembered': False}
    assert LearnSkillMark.query.count() == 0


def _payoff_goal(user, account, kind='payoff'):
    _db.session.add(Goal(user_id=user.id, name='Clear it', kind=kind, account_id=account.id,
                         start_amount=Decimal('-500'), target_amount=Decimal('0')))
    _db.session.commit()


def test_apr_alone_is_not_use(user):
    AccountFactory(user_id=user.id, type='credit', balance=Decimal('-500'), apr=Decimal('19.9'))
    assert _marks(user.id)['interest']['used'] is False


def test_interest_never_vacuously_used(user):
    assert used_on_money(user.id, 'interest') is False
    AccountFactory(user_id=user.id, type='loan', balance=Decimal('-900'), apr=None)
    assert used_on_money(user.id, 'interest') is False


def test_payoff_goal_on_owed_card_counts_as_interest_used(user):
    card = AccountFactory(user_id=user.id, type='credit', balance=Decimal('-500'))
    assert used_on_money(user.id, 'interest') is False
    _payoff_goal(user, card)
    assert _marks(user.id)['interest']['used'] is True


def test_payoff_goal_on_cleared_or_savings_account_does_not(user):
    cleared = AccountFactory(user_id=user.id, type='credit', balance=Decimal('0'))
    _payoff_goal(user, cleared)
    assert used_on_money(user.id, 'interest') is False


def test_debt_plan_counts_as_interest_used(user):
    _db.session.add(DebtPlan(user_id=user.id, method='avalanche'))
    _db.session.commit()
    assert used_on_money(user.id, 'interest') is True


def test_buffer_used_needs_the_starter_cushion(user):
    cat = CategoryFactory(user_id=user.id, spending_type='fixed')
    last = datetime.utcnow().replace(day=1, hour=12) - timedelta(days=5)
    ExpenseFactory(user_id=user.id, amount=1600, category_id=cat.id, date=last)
    saver = AccountFactory(user_id=user.id, type='savings', balance=Decimal('100'))
    _db.session.add(Goal(user_id=user.id, name='Rainy', kind='savings', account_id=saver.id,
                         start_amount=Decimal('0'), target_amount=Decimal('1000')))
    _db.session.commit()
    assert used_on_money(user.id, 'buffer') is False  # a savings goal alone is not use
    saver.balance = Decimal('800')
    _db.session.commit()
    assert used_on_money(user.id, 'buffer') is True


def test_finish_sets_understood_and_schedules_recall(user):
    _db.session.add(LearnMilestone(slug='what-your-apr-costs', title='t'))
    _db.session.commit()
    row = record_finish(user.id, 'interest', 'finished')
    assert row['marks']['understood'] is True and row['marks']['used'] is False
    recall = LearnRecall.query.filter_by(user_id=user.id, skill='interest').one()
    assert recall.due_on == date.today() + timedelta(days=3) and recall.step == 0
    assert LearnCompletion.query.filter_by(
        user_id=user.id, milestone_slug='what-your-apr-costs').count() == 1
    record_finish(user.id, 'interest', 'not_now')
    assert LearnRecall.query.filter_by(user_id=user.id, skill='interest').count() == 1
    assert LearnSkillMark.query.one().set_aside_at is not None


def test_action_outcome_marks_used(user):
    assert record_finish(user.id, 'buffer', 'action')['marks']['used'] is True


def test_marks_never_go_down(user):
    card = AccountFactory(user_id=user.id, type='credit', balance=Decimal('-500'), apr=Decimal('20'))
    _db.session.add(DebtPlan(user_id=user.id, method='avalanche'))
    _db.session.commit()
    assert _marks(user.id)['interest']['used'] is True
    _db.session.delete(card)
    _db.session.commit()
    assert used_on_money(user.id, 'interest') is True
    assert _marks(user.id)['interest']['used'] is True


def test_evidence_rules(user):
    c = CategoryFactory(user_id=user.id, spending_type='fixed', spending_type_source='inferred')
    assert used_on_money(user.id, 'fixed-costs') is False
    c.spending_type_source = 'user'
    _db.session.commit()
    assert used_on_money(user.id, 'fixed-costs') is True
    assert used_on_money(user.id, 'pay-down') is False
    _db.session.add(DebtPlan(user_id=user.id, method='avalanche'))
    _db.session.commit()
    assert used_on_money(user.id, 'pay-down') is True
    # Correction 2026-11-20: categorised transactions (mostly the rules' work) are not use; only
    # the lesson's action is (test_learnpal_final_review.py).
    cat = CategoryFactory(user_id=user.id)
    for _ in range(10):
        ExpenseFactory(user_id=user.id, category_id=cat.id, date=datetime.utcnow())
    assert used_on_money(user.id, 'read-your-month') is False


def test_learning_off_keeps_rows(user):
    record_finish(user.id, 'buffer', 'finished')
    assert learning_on(user) is True
    user.learn_as_you_go = False
    _db.session.commit()
    assert learning_on(user) is False
    user.learn_as_you_go = None
    assert learning_on(user) is True
    user.learn_as_you_go = False
    assert LearnSkillMark.query.filter_by(user_id=user.id).count() == 1
    assert _marks(user.id)['buffer']['understood'] is True


def test_account_deletion_removes_marks_and_recalls(user):
    other = UserFactory()
    record_finish(user.id, 'interest', 'finished')
    record_finish(other.id, 'interest', 'finished')
    ok, _ = AuthService().admin_delete_user(user.id, other.id)
    assert ok
    assert LearnSkillMark.query.filter_by(user_id=user.id).count() == 0
    assert LearnRecall.query.filter_by(user_id=user.id).count() == 0
    assert LearnSkillMark.query.filter_by(user_id=other.id).count() == 1


def test_demo_reset_removes_marks_and_recalls(user):
    record_finish(user.id, 'interest', 'finished')
    _learnpal_reset(user.id)
    assert LearnSkillMark.query.count() == 0 and LearnRecall.query.count() == 0


def test_every_short_lesson_skill_exists():
    ids = {s['id'] for s in LEARN_SKILLS}
    assert {v['skill'] for v in SHORT_LESSONS.values()} <= ids


def test_learn_as_you_go_column_is_reconciled(app, db):
    from sqlalchemy import text
    from src.utils.schema_reconcile import reconcile_schema
    with db.engine.begin() as conn:
        conn.execute(text('ALTER TABLE users DROP COLUMN learn_as_you_go'))
    assert 'learn_as_you_go' not in {c['name'] for c in inspect(db.engine).get_columns('users')}
    applied = reconcile_schema(app, db)
    assert 'learn_as_you_go' in {c['name'] for c in inspect(db.engine).get_columns('users')}
    assert any('learn_as_you_go' in s for s in applied), applied


def test_deletion_works_when_learn_tables_are_absent(user):
    """Module off (the default): create_all never made the learn_* tables."""
    other = UserFactory()
    _db.session.commit()
    for t in ('learn_recalls', 'learn_skill_marks', 'learn_quiz_answers', 'learn_completions'):
        _db.session.execute(_db.text(f'DROP TABLE {t}'))
    _db.session.commit()
    ok, _ = AuthService().admin_delete_user(user.id, other.id)
    assert ok
    assert _learnpal_reset(other.id) == 0
