"""
A category icon is an emoji, because web-ui renders it as text.

The Categories page showed the literal string `fa-tag` where an icon belongs. Nothing in
web-ui was wrong — it renders `category.icon` directly, which is exactly right for an
emoji. The value was a FontAwesome class name, and FontAwesome has never been a
dependency of this project, so the name resolved to nothing and fell through as text.

Three sources fed it:

  * `Category.icon`'s column default, `"fa-tag"`;
  * `CategoryService.add_category`'s `icon='fa-tag'` parameter default;
  * `api/v1/categories.py`'s `validated.get('icon', 'fa-tag')`;

and behind them all 147 icon literals in `src/data/default_categories.py`, so a fresh
install seeded a whole category tree that displayed class names.

`src/data/convert_icons_to_emoji.py` was written for this and never applied: its
`__main__` printed "Icon conversion map ready!" and did nothing. Applying it also turned
out to need the map extended — 37 of the 107 names in use had no entry, so a conversion
would have collapsed a third of the tree onto the 📁 fallback.

This gate covers the sources, not the rendering. Rendering is covered on the other side
by web-ui's `categoryIcon()`, which is a third layer for databases that predate the
migration.
"""

import re

import pytest

# `fa-`, and also the style-prefixed spellings (`fas-`, `far-`, `fab-`) so the guard is
# not keyed to the single spelling that happened to be used.
FONTAWESOME = re.compile(r'^fa[srlbd]?-[a-z0-9-]+$')


def _is_fontawesome(value):
    return isinstance(value, str) and bool(FONTAWESOME.match(value.strip()))


# ── The seed data ─────────────────────────────────────────────────────────────

def _seed_icons():
    """(path, icon) for every icon in the default category tree."""
    from src.data.default_categories import DEFAULT_CATEGORIES

    found = []
    for name, spec in DEFAULT_CATEGORIES.items():
        found.append((name, spec.get('icon')))
        for sub in spec.get('subcategories', []):
            found.append((f"{name}/{sub['name']}", sub.get('icon')))
    return found


def test_the_seed_tree_is_big_enough_to_be_worth_checking():
    """Guard against the sweep below passing because it found nothing."""
    icons = _seed_icons()
    assert len(icons) > 100, f'expected the full default tree, found {len(icons)} icons'


def test_no_seeded_category_icon_is_a_fontawesome_name():
    offenders = [f'{path} = {icon!r}' for path, icon in _seed_icons()
                 if _is_fontawesome(icon)]
    assert offenders == [], (
        'these render as literal text in web-ui, which has no FontAwesome:\n  '
        + '\n  '.join(offenders)
    )


def test_every_seeded_category_has_an_icon():
    """A missing icon is the same visual bug by another route."""
    missing = [path for path, icon in _seed_icons() if not (icon or '').strip()]
    assert missing == [], f'no icon for: {missing}'


# ── The three defaults that apply when a client sends none ────────────────────

def test_the_column_default_is_not_a_fontawesome_name():
    from src.models.category import Category

    default = Category.__table__.columns['icon'].default
    value = default.arg if default is not None else None
    assert value, 'Category.icon has no default at all'
    assert not _is_fontawesome(value), f'Category.icon defaults to {value!r}'


def test_the_service_default_is_not_a_fontawesome_name():
    import inspect

    from src.services.category.service import CategoryService

    default = inspect.signature(CategoryService.add_category).parameters['icon'].default
    assert not _is_fontawesome(default), f'add_category(icon={default!r})'


@pytest.mark.parametrize('path', [
    'api/v1/categories.py',
    'src/services/category/service.py',
    'src/models/category.py',
    'src/data/default_categories.py',
])
def test_no_fontawesome_literal_survives_in_the_category_sources(path):
    """
    Catches a fourth default appearing somewhere none of the checks above look.

    Tokenised rather than regexed over the raw text. Every one of these files now carries
    a comment explaining what `fa-tag` was and why it went — a regex over the source
    matched those comments and failed, which would have left the choice between a gate
    that cannot be explained and an explanation that cannot be gated. `tokenize` reads
    STRING tokens only, so the distinction is real rather than asserted.
    """
    import io
    import tokenize
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    source = (root / path).read_text()

    offenders = []
    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        if tok.type != tokenize.STRING:
            continue
        # Docstrings are STRING tokens too, and they are prose; skip anything that is
        # too long to be an icon value.
        text = tok.string.strip('rbuf')
        if len(text) > 40:
            continue
        for match in re.findall(r"""['"](fa[srlbd]?-[a-z0-9-]+)['"]""", text):
            offenders.append(f'line {tok.start[0]}: {match}')

    assert offenders == [], (
        f'{path} still holds FontAwesome string literals:\n  ' + '\n  '.join(offenders)
    )


# ── The map that does the conversion for existing rows ───────────────────────

def test_the_conversion_map_covers_every_icon_it_will_be_pointed_at():
    """
    The map is what the migration uses on an existing database. It had 100 entries for
    107 distinct names, so it must be checked against the data rather than by eye — and
    against the tree as it was, which is what git history holds. Checking it covers the
    CURRENT tree is vacuous now that the tree is emoji, so this asserts the property
    that matters instead: nothing maps to another FontAwesome name, and the fallback
    exists.
    """
    from src.data.convert_icons_to_emoji import ICON_MAP, convert_icon

    assert len(ICON_MAP) >= 137, f'map shrank to {len(ICON_MAP)} entries'

    bad = {k: v for k, v in ICON_MAP.items() if _is_fontawesome(v)}
    assert bad == {}, f'these map one class name onto another: {bad}'

    empty = {k: v for k, v in ICON_MAP.items() if not (v or '').strip()}
    assert empty == {}, f'these map onto nothing: {empty}'

    # An unknown name must still produce something renderable.
    assert convert_icon('fa-does-not-exist').strip()
    assert not _is_fontawesome(convert_icon('fa-does-not-exist'))
