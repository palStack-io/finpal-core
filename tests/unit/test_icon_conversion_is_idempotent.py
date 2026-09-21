"""A conversion that cannot be run twice cannot be run at all on this project's deploys.

*** THE SYMPTOM: EVERY CATEGORY ON THE PUBLIC DEMO HAD THE SAME ICON. ***
Measured against `findemo.palstack.io` on 2026-09-16 — **275 categories, one
distinct icon value, `'📁'`**. Not null, not a `fa-*` class name: the folder
emoji, stored in the database.

*** THE CAUSE: `convert_icon` WAS `ICON_MAP.get(fa_icon, '📁')`. *** `ICON_MAP`
is keyed by FontAwesome names, so an already-converted emoji is not a key and
came back as the fallback. `convert_icon('fa-home')` is `'🏠'` and
`convert_icon('🏠')` was `'📁'`.

*** THE TRIGGER WAS A STALE CONVERSION CALL, NOT A MIGRATION RUNNING TWICE. ***
Worth stating precisely, because "run it twice" was the first explanation and it
is the mechanism rather than the cause. `src/data/default_categories.py` was
migrated from FontAwesome names to emoji long ago — that migration is why
`web-ui/src/utils/categoryIcon.ts` exists. `src/data/seed_defaults.py` kept
calling `convert_icon()` on those values at two sites, both commented *"Convert
FontAwesome to emoji"*, describing data that had stopped being FontAwesome. So
every FRESH SEED wrote 147 identical folders, with no migration involved.

*** WHICH IS WHY THE PROPERTY UNDER TEST IS IDEMPOTENCE AND NOT THE CONTENTS OF
THE MAP. *** Nothing was missing from the map. And finPal's schema comes from
`create_all()` rather than Alembic on a default deploy (D-121), so "has this
already been applied to this database?" is a question this project cannot
reliably answer — which makes re-application the normal case and a one-way
conversion a loaded gun. With the function idempotent, `seed_defaults.py` needs
no change and a fresh install seeds **147 icons, 98 distinct, zero folders**.

There is a second, independent half: there are **two** default-category seeders
and only one converted at all. `auth/service.py::create_default_categories` —
the one SIGNUP runs — wrote raw `fa-*` names straight into the column, and five
of its 28 names had no mapping, so even a correct conversion left Groceries
among others sharing the folder.
"""
import re

import pytest

from src.data.convert_icons_to_emoji import (
    ICON_MAP, FALLBACK, convert_icon, is_legacy_icon_name,
)

FOLDER = '📁'


def _signup_icons():
    """Every icon literal in `create_default_categories`, read from the source.

    Read rather than imported because the tree is a local inside the method and
    there is no seam to call it through without a database. A hardcoded copy
    here would drift from the seeder, which is the whole class of bug this file
    is about.
    """
    src = open('src/services/auth/service.py', encoding='utf-8').read()
    start = src.index('default_categories = [')
    end = src.index('from src.services.category.spending_type import default_for',
                    start)
    return re.findall(r'"icon": "([^"]+)"', src[start:end])


def test_the_source_read_actually_found_the_tree():
    """Guards the guard: an empty list passes every assertion below."""
    icons = _signup_icons()
    assert len(icons) >= 25, icons
    assert all(is_legacy_icon_name(i) or not i.startswith('fa') for i in icons)


def test_converting_twice_is_the_same_as_converting_once():
    """The property the defect broke, over the whole map rather than a sample."""
    for name in ICON_MAP:
        once = convert_icon(name)
        assert convert_icon(once) == once, (
            f'{name!r} -> {once!r} -> {convert_icon(once)!r}: not idempotent')


def test_the_fresh_seed_path_produces_varied_icons():
    """*** THE PATH THAT ACTUALLY DAMAGED THE DEMO, ASSERTED END TO END. ***

    `seed_defaults.py` runs every value in `DEFAULT_CATEGORIES` through
    `convert_icon`, and those values are already emoji. Before idempotence that
    produced 147 folders on every fresh install. This asserts the composition
    rather than the function, because the function passing in isolation is
    exactly what was true while the demo was broken.
    """
    from src.data.default_categories import DEFAULT_CATEGORIES

    seeded = []
    for parent, data in DEFAULT_CATEGORIES.items():
        seeded.append(convert_icon(data['icon']))
        for sub in data.get('subcategories', []):
            seeded.append(convert_icon(sub['icon']))

    assert len(seeded) > 100, f'only {len(seeded)} categories — the tree moved'
    assert seeded.count(FOLDER) == 0, (
        f'{seeded.count(FOLDER)} of {len(seeded)} seeded icons are the folder')
    # Some emoji legitimately repeat — six insurance categories share a shield,
    # which is the seed author's choice. What must not happen is one value for
    # everything, which is the state the demo was measured in.
    assert len(set(seeded)) > 50, (
        f'only {len(set(seeded))} distinct icons across {len(seeded)} categories')


def test_reproduces_the_exact_collapse_that_hit_the_demo():
    """If this stops failing the way it describes, the maths has changed."""
    assert convert_icon('fa-home') == '🏠'
    # The line that used to return the folder. This is the assertion that would
    # have failed before the fix, and it is the whole defect in two calls.
    assert convert_icon('🏠') == '🏠'
    assert convert_icon(convert_icon('fa-home')) == '🏠'


@pytest.mark.parametrize('emoji', ['🏠', '⚡', '🍽️', '🛡️', '💼', '🛒', FOLDER])
def test_an_emoji_passes_through_untouched(emoji):
    assert convert_icon(emoji) == emoji


@pytest.mark.parametrize('value', [None, '', '   ', 0])
def test_a_non_name_is_not_invented_into_an_icon(value):
    """`None` must stay `None`.

    The column is nullable and the client's own `categoryIcon()` renders a
    fallback for an empty value — that is the CLIENT's job. Turning `None` into
    a folder in the database destroys the distinction between "no icon chosen"
    and "the folder icon chosen", and this function is called by a migration
    that writes what it returns.
    """
    assert convert_icon(value) == value


def test_an_unmapped_fontawesome_name_still_becomes_the_fallback():
    """A user must never be shown a class name — D-158's original symptom."""
    assert convert_icon('fa-does-not-exist') == FALLBACK
    assert convert_icon('fas-also-not-real') == FALLBACK


def test_the_signup_seeder_produces_a_DIFFERENT_icon_for_every_category():
    """*** THE OWNER'S REPORT, AS AN ASSERTION. ***

    "the categories page in web, all of them have the same icon?" — and even a
    correct, once-only conversion left FIVE of the signup tree's 28 names
    unmapped and therefore sharing the folder with each other, Groceries among
    them. `default_categories.py` needed none of these: 147 icons, 98 distinct,
    zero folders. The gap was only ever in the second seeder.
    """
    icons = _signup_icons()
    converted = [convert_icon(i) for i in icons]

    assert FOLDER not in converted, (
        'these names have no mapping: '
        + ', '.join(n for n, c in zip(icons, converted) if c == FOLDER))
    assert len(set(converted)) == len(converted), (
        'two categories share an icon: '
        + str([c for c in converted if converted.count(c) > 1]))


def test_the_signup_seeder_no_longer_writes_class_names_to_the_database():
    """The write site, not the literal.

    The `fa-*` names stay in the tree — `create_default_category_mappings` and
    the CSV mapper key against them — but nothing reaches `Category.icon`
    without going through `convert_icon` first.
    """
    src = open('src/services/auth/service.py', encoding='utf-8').read()
    assert "cat_data['icon'] = convert_icon(cat_data.get('icon'))" in src
    assert "subcat_data['icon'] = convert_icon(subcat_data.get('icon'))" in src
