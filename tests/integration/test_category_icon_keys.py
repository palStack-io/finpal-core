"""Category icons are line-icon keys (Wave 0, 2026-11-20): seeds write keys, the API keeps `icon` an emoji for
clients that draw it as text and adds `icon_key`, and writes store a key for any emoji finPal itself ever wrote.
"""
import importlib.util
import re
from pathlib import Path

import pytest

from src.extensions import db as _db
from src.models.category import Category
from src.models.category_icons import DEFAULT_ICON_KEY, ICON_KEYS, LEGACY_EMOJI, icon_key, legacy_text, to_key
from tests.factories import UserFactory

ROOT = Path(__file__).resolve().parents[2]
KEBAB = re.compile(r'^[a-z][a-z0-9]*(-[a-z0-9]+)*$')


def _strings(path, pattern):
    return re.findall(pattern, (ROOT / path).read_text(encoding='utf-8'))


# ------------------------------------------------------------------ the table

def test_every_key_is_a_lucide_style_name_with_an_emoji_for_old_clients():
    assert all(KEBAB.match(k) for k in ICON_KEYS), sorted(k for k in ICON_KEYS if not KEBAB.match(k))
    assert DEFAULT_ICON_KEY in ICON_KEYS
    for key in ICON_KEYS:
        assert LEGACY_EMOJI[legacy_text(key)] == key


def _module(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _picker_emoji():
    """The web picker's suggestions (`categoryIcons` in CategoryManagement.tsx)."""
    src = (ROOT / 'web-ui/src/components/CategoryManagement.tsx').read_text(encoding='utf-8')
    block = src[src.index('const categoryIcons'):]
    block = block[:block.index('};')]
    return set(re.findall(r"^  '[^']+': '([^']+)',$", block, re.M))


def test_the_table_covers_every_emoji_finpal_ever_wrote():
    """The correction is only as wide as this table: every writer's old emoji must be in it (seed-corrections)."""
    from src.data.convert_icons_to_emoji import FALLBACK, ICON_MAP
    old_migration = _module(ROOT / 'migrations/versions/c7e3b5f1a2d8_category_icons_to_emoji.py')
    picker = _picker_emoji()
    assert len(picker) > 20
    written = set(ICON_MAP.values()) | set(old_migration.ICON_MAP.values()) | {FALLBACK, old_migration.FALLBACK, '🏷️'}
    written |= picker
    assert sorted(e for e in written if to_key(e) not in ICON_KEYS) == []


@pytest.mark.parametrize('value, stored', [
    ('coffee', 'coffee'),            # a key stays
    ('☕', 'coffee'),                 # an old finPal emoji becomes its key
    ('🛡️', 'shield'), ('🛡', 'shield'),   # with or without U+FE0F
    ('👨‍⚕️', 'stethoscope'),
    ('🦄', '🦄'),                     # a person's own emoji is kept
    ('Rent', 'Rent'),
    (None, None),
])
def test_to_key(value, stored):
    assert to_key(value) == stored


def test_icon_key_and_legacy_text():
    assert (icon_key('coffee'), legacy_text('coffee')) == ('coffee', '☕')
    assert (icon_key('🦄'), legacy_text('🦄')) == (None, '🦄')
    assert (icon_key(None), legacy_text(None)) == (None, None)


# ------------------------------------------------------------------ what the seeders write

def test_the_default_tree_and_auto_categorize_hold_keys():
    from src.data.default_categories import DEFAULT_CATEGORIES
    seeded = []
    for spec in DEFAULT_CATEGORIES.values():
        seeded += [spec['icon']] + [s['icon'] for s in spec.get('subcategories', [])]
    seeded += _strings('src/utils/auto_categorize.py', r"'icon': '([^']+)'")
    assert len(seeded) > 150
    assert sorted({i for i in seeded if i not in ICON_KEYS}) == []


def _stored(user_id):
    return [c._icon for c in Category.query.filter_by(user_id=user_id).all()]


def test_both_default_seeders_store_keys(db):
    from src.data.seed_defaults import load_default_categories
    from src.services.auth.service import AuthService
    signup, demo = UserFactory(), UserFactory()
    AuthService().create_default_categories(signup.id)
    load_default_categories(demo.id)
    _db.session.commit()
    for user in (signup, demo):
        stored = _stored(user.id)
        assert len(stored) > 20
        assert sorted({i for i in stored if i not in ICON_KEYS}) == [], user.id


# ------------------------------------------------------------------ the model and the API

def test_the_model_stores_a_key_and_answers_both(db):
    user = UserFactory()
    mine = Category(name='Mine', icon='🦄', user_id=user.id)
    coffee = Category(name='Coffee', icon='☕', user_id=user.id)
    plain = Category(name='Plain', user_id=user.id)
    _db.session.add_all([mine, coffee, plain])
    _db.session.commit()
    assert (coffee._icon, coffee.icon, coffee.icon_key) == ('coffee', '☕', 'coffee')
    assert (mine._icon, mine.icon, mine.icon_key) == ('🦄', '🦄', None)
    assert (plain._icon, plain.icon, plain.icon_key) == ('tag', '🏷️', 'tag')


@pytest.fixture
def me(db):
    return UserFactory()


def test_api_create_list_and_an_old_clients_round_trip(client, me, auth_headers):
    h = auth_headers(me)
    made = client.post('/api/v1/categories/', headers=h, json={'name': 'Coffee', 'icon': 'coffee'}).get_json()
    assert (made['category']['icon'], made['category']['icon_key']) == ('☕', 'coffee')
    cid = made['category']['id']

    listed = {c['name']: c for c in client.get('/api/v1/categories/', headers=h).get_json()['categories']}
    assert (listed['Coffee']['icon'], listed['Coffee']['icon_key']) == ('☕', 'coffee')

    # An old client sends back the emoji it was given: the row stays a key.
    assert client.put(f'/api/v1/categories/{cid}', headers=h,
                      json={'name': 'Coffee shops', 'icon': '☕'}).status_code == 200
    _db.session.expire_all()
    assert _db.session.get(Category, cid)._icon == 'coffee'

    # A person's own emoji is theirs.
    own = client.post('/api/v1/categories/', headers=h, json={'name': 'Fun', 'icon': '🦄'}).get_json()['category']
    assert (own['icon'], own['icon_key']) == ('🦄', None)
    default = client.post('/api/v1/categories/', headers=h, json={'name': 'Bare'}).get_json()['category']
    assert (default['icon'], default['icon_key']) == ('🏷️', 'tag')
