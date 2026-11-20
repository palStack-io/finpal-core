from src.modules.learnpal.learn_skills import LEARN_SKILLS, skill_by_id
from src.modules.learnpal.short_lessons import (
    NOT_NOW_LINE, SHORT_LESSONS, UNDERSTOOD_LINE, WHEN_PROMPT)
from src.modules.learnpal.seed import MILESTONES


def test_six_skills_in_order():
    assert [s['id'] for s in LEARN_SKILLS] == ['read-your-month', 'fixed-costs', 'non-monthly', 'buffer', 'interest', 'pay-down']


def test_every_lesson_named_exists():
    slugs = {m[0] for m in MILESTONES}
    for s in LEARN_SKILLS:
        assert set(s['lessons']) <= slugs, s['id']
    for sid, sl in SHORT_LESSONS.items():
        assert sl['long_lesson'] in slugs and skill_by_id(sl['skill']), sid


def test_every_skill_has_a_short_lesson():
    assert {sl['skill'] for sl in SHORT_LESSONS.values()} == {s['id'] for s in LEARN_SKILLS}


def test_priority_order_and_try_kinds():
    assert list(SHORT_LESSONS) == ['interest', 'buffer', 'fixed-share', 'non-monthly', 'month', 'debt-order']
    kinds = {'month', 'fixed_share', 'sinking', 'buffer', 'interest', 'debt_order'}
    assert {sl['try_kind'] for sl in SHORT_LESSONS.values()} == kinds
    assert skill_by_id('nope') is None


def test_shared_lines():
    assert NOT_NOW_LINE == "Fine. It'll be here when you want it."
    assert UNDERSTOOD_LINE.startswith("You've got the idea.")
    assert WHEN_PROMPT == "When would you like to do this: on payday, or on the 1st?"
    assert SHORT_LESSONS['interest']['card'].startswith('Your {account} payment')


def test_copy_rules():
    for sid, sl in SHORT_LESSONS.items():
        text = ' '.join([sl['card'], sl['number'], *sl['explain'], sl['action']['label'],
                         NOT_NOW_LINE, UNDERSTOOD_LINE, WHEN_PROMPT])
        for banned in ('wrong', 'streak', 'overspent', '!!'):
            assert banned not in text.lower(), (sid, banned)
        assert sl['action']['href'].startswith('/')
        assert 2 <= len(sl['explain']) <= 3
        assert not any(ord(ch) > 0x2FFF for ch in text), 'no emojis'
