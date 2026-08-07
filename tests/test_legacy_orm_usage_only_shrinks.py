"""Legacy SQLAlchemy 1.x call sites are bounded and may only shrink.

**Why a counter and not a migration.** The roadmap recorded item 3 as "64
`Query.get()` calls, REMOVED in SQLAlchemy 2". That premise is wrong:
`Query.get()` is *legacy* in 2.0, not removed — it works and emits
`LegacyAPIWarning`. Verified on SQLAlchemy 2.0.36 against real PostgreSQL 15,
not only SQLite. So the upgrade needed **no** application code change, and
rewriting 65 call sites was not part of getting onto 2.0.

They are still debt. `Query.get()` and the `Model.query` accessor are both slated
to go, and `pytest.ini` sets `ignore::DeprecationWarning`, so nothing in the
suite would ever mention them again — which is how 65 of them accumulated
unnoticed in the first place.

This makes the debt **visible and bounded** rather than silently growing: the
count may fall, and the moment it does the ceiling must be lowered with it. That
is the same two-sided contract as `UNDOCUMENTED` and `NO_REQUEST_MODEL`
elsewhere in this suite — an inventory that can only shrink, never a list that
rots into permission.

To clear it: `X.query.get(id)` becomes `db.session.get(X, id)`. Not mechanical —
`Query.get()` returns `None` for a missing row and so does `Session.get()`, but
some call sites rely on the surrounding `first_or_404`/`abort` pattern instead,
so each one needs reading. This project's rule about not applying a mechanical
change across many sites without reading every site applies squarely.
"""
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEARCH_DIRS = ('src', 'api', 'integrations', 'scripts')

# Lower these when you remove call sites. They must never be raised.
MAX_QUERY_GET = 65

QUERY_GET = re.compile(r'\.query\.get\(')


def _python_files():
    for d in SEARCH_DIRS:
        for path in (ROOT / d).rglob('*.py'):
            if '__pycache__' in path.parts:
                continue
            yield path


def _count(pattern):
    hits = []
    for path in _python_files():
        for n, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
            if pattern.search(line):
                hits.append(f'{path.relative_to(ROOT)}:{n}')
    return hits


def test_the_scan_reaches_the_source():
    """A pass over zero files would satisfy every ceiling below in silence."""
    files = list(_python_files())
    assert len(files) > 50, f'only {len(files)} python files found; the scan is broken'
    assert any(p.name == 'account.py' for p in files), 'src/models not reached'


def test_query_get_call_sites_do_not_grow():
    hits = _count(QUERY_GET)
    assert len(hits) <= MAX_QUERY_GET, (
        f'{len(hits)} `.query.get(` call sites, ceiling is {MAX_QUERY_GET}. '
        f'Use `db.session.get(Model, id)` in new code — Query.get() is legacy in '
        f'SQLAlchemy 2 and will not survive the next major.\n'
        + '\n'.join(sorted(set(hits) )[:10]))


def test_the_ceiling_is_not_stale():
    """The other half. Without it the ceiling only ever describes the past.

    If call sites have been removed, this fails and names the new number, so the
    ceiling comes down with the debt instead of leaving headroom for it to grow
    back.
    """
    hits = _count(QUERY_GET)
    assert len(hits) == MAX_QUERY_GET, (
        f'{len(hits)} call sites remain but MAX_QUERY_GET is still '
        f'{MAX_QUERY_GET} — lower it to {len(hits)}.')


def test_query_get_still_works_on_this_sqlalchemy(app, db):
    """The premise check, kept executable rather than written down.

    If a future SQLAlchemy really does remove `Query.get()`, this fails loudly
    and names the 65 sites as the reason, instead of the removal surfacing as
    scattered AttributeErrors in production.
    """
    from src.models.user import User

    u = User(id='legacy-probe@finpal.test', name='Probe')
    u.set_password('longenough1')
    db.session.add(u)
    db.session.commit()

    with pytest.warns(Warning):  # LegacyAPIWarning - deprecated, not gone
        fetched = User.query.get('legacy-probe@finpal.test')
    assert fetched is not None
    assert db.session.get(User, 'legacy-probe@finpal.test') is fetched
