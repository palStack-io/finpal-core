"""The boot correction turns emoji the old seeders wrote into line-icon keys, and only those (Wave 0, 2026-11-20).

Rows are written straight into the column (`_icon`), bypassing the model's setter, which is how every earlier
version stored them.
"""
import pytest

from src.models.category import Category
from src.services.category.icon_keys import correct_seeded_icon_emoji
from tests.factories import UserFactory

ROWS = {                       # name: (stored before, stored after)
    'Coffee Shops': ('☕', 'coffee'),
    'Home Insurance': ('🛡', 'shield'),           # seeded as 🛡️; stored without U+FE0F
    'Doctor': ('👨‍⚕️', 'stethoscope'),
    'Savings': ('🐷', 'piggy-bank'),
    'Untitled': ('📁', 'folder'),                 # the old conversion's fallback
    'Mine': ('🦄', '🦄'),                         # a person's own emoji
    'Words': ('rent', 'rent'),                   # free text
    'Already': ('coffee', 'coffee'),
}


@pytest.fixture
def seeded(db):
    user = UserFactory()
    for name, (before, _) in ROWS.items():
        row = Category(name=name, user_id=user.id)
        row._icon = before
        db.session.add(row)
    db.session.commit()
    return user


def _stored(db, user):
    db.session.expire_all()
    return {c.name: c._icon for c in Category.query.filter_by(user_id=user.id)}


def test_seeded_emoji_become_keys_and_a_persons_own_icon_stays(db, seeded):
    assert _stored(db, seeded) == {n: before for n, (before, _) in ROWS.items()}
    assert correct_seeded_icon_emoji() == 5
    assert _stored(db, seeded) == {n: after for n, (_, after) in ROWS.items()}


def test_a_second_boot_changes_nothing(db, seeded):
    correct_seeded_icon_emoji()
    after = _stored(db, seeded)
    assert correct_seeded_icon_emoji() == 0
    assert _stored(db, seeded) == after


def test_the_api_answers_the_same_emoji_before_and_after(db, seeded):
    db.session.expire_all()
    before = {c.name: c.icon for c in Category.query.filter_by(user_id=seeded.id)}
    correct_seeded_icon_emoji()
    db.session.expire_all()
    after = {c.name: (c.icon, c.icon_key) for c in Category.query.filter_by(user_id=seeded.id)}
    assert after['Coffee Shops'] == ('☕', 'coffee')
    assert after['Mine'] == ('🦄', None)
    assert after['Home Insurance'] == ('🛡️', 'shield')
    assert before['Coffee Shops'] == '☕'
