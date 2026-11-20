"""Spaced recall: first ask after 3 days, two rights = remembered, misses retry, nothing is paid."""
from datetime import date, datetime, timedelta

import pytest

from src.extensions import db as _db
from src.models.act_event import ActEvent
from src.models.coins import CoinAward
from src.models.visit_mark import VisitMark
from src.modules.learnpal.lesson_quizzes import QUIZZES
from src.modules.learnpal.models import LearnRecall, LearnSkillMark
from src.modules.learnpal.recall import (
    RecallNotFound, answer_recall, due_recall, quiet_day, schedule_first_recall)
from tests.factories import UserFactory

TODAY = date(2026, 11, 20)
SKILL = 'buffer'  # three lessons with quizzes, so rotation crosses lessons


@pytest.fixture
def user(db):
    return UserFactory()


def _recall(user, due=TODAY, **kw):
    r = schedule_first_recall(user.id, SKILL, TODAY - timedelta(days=3))
    r.due_on = due
    for k, v in kw.items():
        setattr(r, k, v)
    _db.session.commit()
    return r


def _right(recall):
    q = next(q for q in QUIZZES[recall.milestone_slug]['questions'] if q['id'] == recall.question_id)
    return str([o['right'] for o in q['options']].index(True))


def _wrong(recall):
    q = next(q for q in QUIZZES[recall.milestone_slug]['questions'] if q['id'] == recall.question_id)
    return str([o['right'] for o in q['options']].index(False))


def test_first_recall_three_days_after_understood(user):
    r = schedule_first_recall(user.id, SKILL, TODAY)
    assert r.due_on == TODAY + timedelta(days=3) and r.step == 0 and r.misses == 0
    assert schedule_first_recall(user.id, SKILL, TODAY).id == r.id


def test_two_rights_fill_remembered(user):
    r = _recall(user)
    out = answer_recall(r.id, user.id, _right(r), TODAY)
    assert out['right'] is True and out['why'] and out['marks']['remembered'] is False
    r = _db.session.get(LearnRecall, r.id)
    assert r.step == 1 and r.due_on == TODAY + timedelta(days=21) and r.done_at is None
    later = TODAY + timedelta(days=21)
    out = answer_recall(r.id, user.id, _right(r), later)
    assert out['marks']['remembered'] is True
    r = _db.session.get(LearnRecall, r.id)
    assert r.done_at is not None
    assert LearnSkillMark.query.filter_by(user_id=user.id, skill=SKILL).one().remembered_at is not None
    assert due_recall(user.id, later + timedelta(days=60)) is None


def test_not_sure_retries_7_then_21_forever(user):
    r = _recall(user)
    seen = [(r.milestone_slug, r.question_id)]
    day = TODAY
    for expected in (7, 21, 21):
        out = answer_recall(r.id, user.id, 'not_sure', day)
        assert out['right'] is None and out['why']
        r = _db.session.get(LearnRecall, r.id)
        assert r.due_on == day + timedelta(days=expected) and r.step == 0 and r.done_at is None
        seen.append((r.milestone_slug, r.question_id))
        day = r.due_on
    assert r.misses == 3
    assert len(set(seen)) == 4  # rotated through different questions each time
    assert seen[1][0] == seen[0][0]  # next question of the same lesson first, then the next lesson
    assert seen[2][0] != seen[1][0]


def test_wrong_choice_counts_as_a_miss_and_rotation_wraps(user):
    r = _recall(user)
    cycle = [(s, q['id']) for s in ('a-starter-buffer', 'why-a-buffer-comes-first', 'how-much-is-enough')
             for q in QUIZZES[s]['questions']]
    r.milestone_slug, r.question_id = cycle[-1]
    _db.session.commit()
    out = answer_recall(r.id, user.id, _wrong(r), TODAY)
    assert out['right'] is False and out['why']
    r = _db.session.get(LearnRecall, r.id)
    assert r.misses == 1 and (r.milestone_slug, r.question_id) == cycle[0]


def test_not_now_moves_two_days(user):
    r = _recall(user)
    before = (r.milestone_slug, r.question_id)
    out = answer_recall(r.id, user.id, 'not_now', TODAY)
    assert out['right'] is None
    r = _db.session.get(LearnRecall, r.id)
    assert r.due_on == TODAY + timedelta(days=2) and r.misses == 0 and r.step == 0
    assert (r.milestone_slug, r.question_id) == before


def test_only_one_due_returned(user):
    first = _recall(user, due=TODAY - timedelta(days=1))
    other = LearnRecall(user_id=user.id, skill='interest', milestone_slug='what-your-apr-costs',
                        question_id='q1', due_on=TODAY, step=0, misses=0)
    _db.session.add(other)
    _db.session.commit()
    assert due_recall(user.id, TODAY).id == first.id
    assert due_recall(user.id, TODAY - timedelta(days=5)) is None


def test_none_on_fresh_start_day(user):
    """Core has no fresh-start service, so the nearest quiet day is the hard-month return opening."""
    _recall(user)
    assert due_recall(user.id, TODAY) is not None
    _db.session.add(VisitMark(user_id=user.id, last_seen_on=TODAY, returned_on=TODAY))
    _db.session.commit()
    assert quiet_day(user.id, TODAY) is True
    assert due_recall(user.id, TODAY) is None
    assert quiet_day(user.id, TODAY + timedelta(days=8)) is False


def test_none_when_learning_off(user):
    _recall(user)
    user.learn_as_you_go = False
    _db.session.commit()
    assert due_recall(user.id, TODAY) is None


def test_answer_refuses_another_users_recall(user):
    r = _recall(user)
    with pytest.raises(RecallNotFound):
        answer_recall(r.id, UserFactory().id, '0', TODAY)
    with pytest.raises(RecallNotFound):
        answer_recall(99999, user.id, '0', TODAY)
    with pytest.raises(ValueError):
        answer_recall(r.id, user.id, '9', TODAY)


def test_recall_writes_no_coins(user):
    r = _recall(user)
    coins, acts = CoinAward.query.count(), ActEvent.query.count()
    answer_recall(r.id, user.id, _right(r), TODAY)
    answer_recall(r.id, user.id, 'not_sure', TODAY)
    answer_recall(r.id, user.id, _right(_db.session.get(LearnRecall, r.id)), TODAY)
    assert (CoinAward.query.count(), ActEvent.query.count()) == (coins, acts)
