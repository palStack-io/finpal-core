"""Every sidebar destination has a page guide, or a stated reason it does not.

A guide that exists for three pages and silently not for the fourth is the shape
this project keeps paying for (D-187: a registered thing with no caller). So the
sidebar is the source of truth and the registry has to keep up with it.
"""
import pathlib
import re

from src.services.onboarding.guides import PAGES

SIDEBAR = (pathlib.Path(__file__).resolve().parents[2]
           / 'web-ui' / 'src' / 'components' / 'layout' / 'Sidebar.tsx')

#: Sidebar `path:` entries that deliberately have no guide, each with the reason. Empty today:
#: the module pages (pointsPal, learnPal) and Base camp are not `path:` entries in the sidebar
#: (modules are built from the registry; Base camp is the profile link), so they are out of
#: scope here — module-page guides come with the module work, and Base camp is itself an
#: orientation screen (owner default, 2026-10-06).
EXEMPT: dict[str, str] = {}


def _sidebar_slugs():
    source = SIDEBAR.read_text()
    paths = set(re.findall(r"path:\s*'/([a-z-]+)'", source))
    return {p for p in paths}


def test_the_sidebar_is_readable_and_nonempty():
    assert {'dashboard', 'accounts', 'goals'} <= _sidebar_slugs()


def test_every_sidebar_page_has_a_guide_or_a_reason():
    missing = sorted(s for s in _sidebar_slugs() if s not in PAGES and s not in EXEMPT)
    assert missing == [], f'no guide and no stated reason: {missing}'


def test_no_exemption_outlives_its_reason():
    """An exemption for a page that now has a guide, or is no longer in the sidebar, is stale."""
    slugs = _sidebar_slugs()
    stale = sorted(s for s in EXEMPT if s in PAGES or s not in slugs)
    assert stale == [], f'stale exemptions: {stale}'
