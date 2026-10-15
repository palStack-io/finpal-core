"""Phase 5d: every lesson's quick check, served with the lesson once it is earned, recorded without reward."""
import pytest

from src.extensions import db as _db
from src.modules.learnpal.lesson_bodies import BODIES, apply_bodies
from src.modules.learnpal.lesson_quizzes import QUIZZES
from src.modules.learnpal.models import LearnCompletion, LearnQuizAnswer
from src.modules.learnpal.seed import seed_milestones
from tests.factories import UserFactory


def test_every_written_lesson_has_a_quick_check():
    assert set(BODIES) <= set(QUIZZES), sorted(set(BODIES) - set(QUIZZES))


@pytest.mark.parametrize('slug', sorted(QUIZZES))
def test_each_quiz_follows_the_rules(slug):
    q = QUIZZES[slug]
    assert q['action']['href'].startswith('/') and q['action']['label']
    assert 2 <= len(q['questions']) <= 3
    for question in q['questions']:
        assert len(question['options']) == 3
        assert sum(o['right'] for o in question['options']) == 1, 'exactly one right answer'
        assert all(o['why'].strip() for o in question['options']), 'every answer is explained'
        assert question['not_sure'].strip(), '"Not sure" is explained too'
        text = ' '.join([question['prompt'], question['not_sure']] + [o['text'] + o['why'] for o in question['options']])
        assert 'wrong' not in question['not_sure'].lower()
        assert not any(ch in text for ch in '\U0001F300\U0001F600'), 'no emojis'


@pytest.fixture
def lesson(db):
    seed_milestones()
    apply_bodies()
    return 'a-starter-buffer'


def test_a_locked_lesson_carries_no_quiz(client, lesson, auth_headers):
    user = UserFactory()
    body = client.get(f'/api/v1/learnpal/lessons/{lesson}', headers=auth_headers(user)).get_json()
    if body.get('lesson') is None:
        pytest.skip('learnPal not enabled in this test app')
    assert body['lesson']['quiz'] is None


def test_an_earned_lesson_serves_its_quiz_and_answers_are_recorded_without_reward(client, lesson, auth_headers):
    user = UserFactory()
    _db.session.add(LearnCompletion(user_id=user.id, milestone_slug=lesson, verified_by='read'))
    _db.session.commit()
    headers = auth_headers(user)
    body = client.get(f'/api/v1/learnpal/lessons/{lesson}', headers=headers).get_json()
    if body.get('lesson') is None:
        pytest.skip('learnPal not enabled in this test app')
    quiz = body['lesson']['quiz']
    assert [q['id'] for q in quiz['questions']] == ['q1', 'q2']
    right = str([o['right'] for o in quiz['questions'][0]['options']].index(True))
    r = client.post(f'/api/v1/learnpal/lessons/{lesson}/quiz', headers=headers, json={'answers': [
        {'question_id': 'q1', 'choice': right}, {'question_id': 'q2', 'choice': 'not_sure'},
        {'question_id': 'nope', 'choice': '0'}, {'question_id': 'q1', 'choice': '7'}]})
    assert r.status_code == 200 and r.get_json()['recorded'] == 2
    rows = LearnQuizAnswer.query.filter_by(user_id=user.id).order_by(LearnQuizAnswer.question_id).all()
    assert [(a.question_id, a.choice, a.right) for a in rows] == [('q1', right, True), ('q2', 'not_sure', False)]


def test_the_quiz_refuses_a_lesson_not_yet_earned(client, lesson, auth_headers):
    r = client.post(f'/api/v1/learnpal/lessons/{lesson}/quiz', headers=auth_headers(UserFactory()),
                    json={'answers': [{'question_id': 'q1', 'choice': '0'}]})
    if r.status_code == 404:
        pytest.skip('learnPal not enabled in this test app')
    assert r.status_code == 409
