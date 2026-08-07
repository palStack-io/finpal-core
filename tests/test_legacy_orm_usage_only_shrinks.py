"""Legacy SQLAlchemy 1.x call sites are bounded and may only shrink. **NOW ZERO.**

**The counter did its job and is now a ratchet.** All 65 `Query.get()` call sites
are `db.session.get(Model, id)`, so `MAX_QUERY_GET` is **0** and the next one
anyone writes fails the build. The two-sided contract below is what made that
possible: the ceiling could only fall, and `test_the_ceiling_is_not_stale` forced
it down the moment the debt did.

**Why it was a counter and not a migration, originally.** The roadmap recorded
item 3 as "64 `Query.get()` calls, REMOVED in SQLAlchemy 2". That premise was
wrong: `Query.get()` is *legacy* in 2.0, not removed — it works and emits
`LegacyAPIWarning`. Verified on SQLAlchemy 2.0.36 against real PostgreSQL 15, not
only SQLite. So the upgrade needed **no** application code change, and rewriting
65 call sites was correctly not part of getting onto 2.0. `pytest.ini` sets
`ignore::DeprecationWarning`, so nothing in the suite would ever have mentioned
them — which is how 65 accumulated unnoticed.

**What the clearing actually required, since "not mechanical" was the warning
here and deserves a precise answer.** Both APIs return `None` for a missing row,
so surrounding `first_or_404`/`abort` handling was unaffected. The edge that
mattered was a **`None` primary key**, because several sites pass a nullable FK
(`db.session.get(Account, portfolio.account_id)`,
`db.session.get(Category, budget.category_id)`). Measured on this SQLAlchemy
rather than assumed:

    Model.query.get(None)        -> None
    db.session.get(Model, None)  -> None

Identical, so those sites keep their behaviour. All 65 were printed and read
before the substitution, and two files needed a `db` import they did not have
(`notification/service.py`, `transaction/balances.py`).

**`Model.query` the ACCESSOR is untouched and still used widely** — this file has
never counted it. Only `.get()` on it is gone. Narrowing the accessor is a
separate, much larger piece of work and would want the repository pattern
(`src/repositories/`) rather than a sweep.
"""
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEARCH_DIRS = ('src', 'api', 'integrations', 'scripts')

# Lower these when you remove call sites. They must never be raised.
# 65 -> 0: every site is now `db.session.get(Model, id)`. This is a CEILING OF
# ZERO now, which makes the test a ratchet rather than a budget — the next
# `Query.get()` anyone writes fails the build.
MAX_QUERY_GET = 0

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

    **The two directions need OPPOSITE advice, and saying so is not padding.**
    This message used to read "lower it to N" unconditionally, which was fine
    while the ceiling was 65 and could only fall. Now that it is **0**, the only
    way this can fail is the count going *up* — and "lower it to 1" would then be
    telling the reader to RAISE a ceiling that the top of this file says must
    never be raised. A guard whose failure message advises the forbidden action
    is worse than one with no message.
    """
    hits = _count(QUERY_GET)
    if len(hits) > MAX_QUERY_GET:
        raise AssertionError(
            f'{len(hits)} `.query.get(` call sites but the ceiling is '
            f'{MAX_QUERY_GET}. Do NOT raise the ceiling — that is what it exists '
            f'to prevent. Replace the new call with '
            f'`db.session.get(Model, id)`:\n' + '\n'.join(sorted(set(hits))[:10]))
    assert len(hits) == MAX_QUERY_GET, (
        f'Good news: only {len(hits)} `.query.get(` call sites remain but '
        f'MAX_QUERY_GET is still {MAX_QUERY_GET}. Lower it to {len(hits)} so the '
        f'ceiling describes the present and the debt cannot grow back.')


def test_query_get_still_works_on_this_sqlalchemy(app, db):
    """The premise check, kept executable rather than written down.

    **It now guards the opposite direction from when it was written.** With zero
    call sites left, a future SQLAlchemy removing `Query.get()` can no longer
    break this application — so this is no longer a warning about production. It
    is kept because it is the evidence for the *ceiling of zero being safe*: it
    proves `Query.get()` and `db.session.get()` return the **same identity-mapped
    instance**, which is what makes the 65 substitutions behaviour-preserving
    rather than merely compiling. If that ever stops being true, the assertion
    below fails and says so.
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
