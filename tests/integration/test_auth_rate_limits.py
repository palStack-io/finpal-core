"""The four auth routes that are rate limited, and that each has its own bucket.

**This file exists because `test_auth_contract.py` cannot see any of this.**
`tests/conftest.py` sets `RATELIMIT_ENABLED: False` for the whole session — it
has to, because the `app` fixture is session-scoped and the limiter counts in
process memory, so the eleventh test to call `auth_headers()` would 429 on a
limit that is entirely real. The consequence is that every other test in this
suite is blind to rate limiting, and the auth contract oracle is blind to it
while porting the four routes that have it. That is the exact shape this project
has been bitten by twice: *a guard keyed to the thing you are changing goes quiet
exactly when it is needed*. So the limiter is turned back on here, deliberately,
for these tests only.

`register`, `login`, `apple` and `oidc` carry `@limiter.limit("10 per minute")`.
Two properties are checked, and the second is the one a port can silently break:

**Each route is limited at all.** Fired eleven times; the eleventh must 429.

**Each route has its OWN bucket.** flask-limiter scopes a route limit by
*endpoint*, so a port that collects several handlers onto one `Resource` — or
that puts the decorator in `method_decorators` / a class-level `decorators` list
— makes them share a counter. Ten failed logins would then lock out
registration, which is a denial of service on a public endpoint that nobody would
notice until it happened in production. Proved by exhausting one route and
checking the other three still answer.

`/auth/config` is the control. It is *not* decorated, and firing it thirty times
must never 429 — without that, a global `default_limits` (or a test that just
counts every request) would make every assertion here pass for the wrong reason.

**Both halves were watched failing before being believed.** Turning the limiter
off in the fixture failed 9 of these 11; making the four routes share a bucket
failed exactly the four separation cases and left the rest green.

One trap found while doing that, recorded because it wasted a run: the first
attempt at the shared-bucket sabotage used
`@limiter.limit("10 per minute", scope="shared")` and **everything still
passed** — `scope=` is *appended* to the endpoint (`auth_api.login:shared`), so
it subdivides a bucket rather than merging them. `limiter.shared_limit(...)` is
the API that actually shares one. A sabotage that fails to sabotage looks
identical to a passing test, which is the same trap as a check that inspects
nothing.
"""
import pytest

from src.extensions import limiter
from tests.factories import UserFactory

LIMIT = 10

# (name, path, payload) — each must answer *something* without a token, so the
# limiter is what decides the 429 rather than an auth failure ordering ahead of
# it. The bodies are deliberately invalid: what is being counted is requests,
# not successes.
LIMITED_ROUTES = [
    ('register', '/api/v1/auth/register', {}),
    ('login', '/api/v1/auth/login', {}),
    ('apple', '/api/v1/auth/apple', {}),
    ('oidc', '/api/v1/auth/oidc', {}),
]


@pytest.fixture
def rate_limited(app):
    """Turn the limiter on for one test, and leave no counters behind.

    Reset on the way in as well as out: the storage is process-wide and shared
    with every other test in the session.
    """
    limiter.reset()
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = False
        limiter.reset()


def _fire(client, path, payload, times):
    return [client.post(path, json=payload).status_code for _ in range(times)]


@pytest.mark.parametrize('name,path,payload', LIMITED_ROUTES,
                         ids=[r[0] for r in LIMITED_ROUTES])
def test_the_route_is_rate_limited(client, db, rate_limited, name, path, payload):
    codes = _fire(client, path, payload, LIMIT + 1)
    assert 429 not in codes[:LIMIT], (
        f'{name} refused a request before its limit of {LIMIT}: {codes}')
    assert codes[LIMIT] == 429, (
        f'{name} is NOT rate limited — request {LIMIT + 1} answered '
        f'{codes[LIMIT]}, so @limiter.limit did not survive: {codes}')


@pytest.mark.parametrize('exhausted,ex_path,ex_payload', LIMITED_ROUTES,
                         ids=[r[0] for r in LIMITED_ROUTES])
def test_each_limited_route_counts_separately(
        client, db, rate_limited, exhausted, ex_path, ex_payload):
    """Exhausting one must not close the others.

    A shared bucket here means ten failed sign-in attempts stop anybody
    registering — a denial of service reachable by any anonymous caller.
    """
    codes = _fire(client, ex_path, ex_payload, LIMIT + 1)
    assert codes[LIMIT] == 429, f'{exhausted} was not exhausted: {codes}'

    for name, path, payload in LIMITED_ROUTES:
        if name == exhausted:
            continue
        status = client.post(path, json=payload).status_code
        assert status != 429, (
            f'exhausting {exhausted} also blocked {name} — they share a '
            f'rate-limit bucket, so one route can lock out another')


def test_an_undecorated_auth_route_is_never_limited(client, db, rate_limited):
    """The control. Without it, every assertion above could pass for free."""
    codes = [client.get('/api/v1/auth/config').status_code for _ in range(30)]
    assert set(codes) == {200}, (
        f'/auth/config is not supposed to be rate limited, but got {set(codes)}')


def test_the_limit_applies_to_successful_requests_too(client, db, rate_limited):
    """Ten good logins, then a 429 — not just ten failures.

    Worth separating: a limit that only counted rejections would look correct in
    every test above and still let an attacker with valid credentials mint
    unlimited tokens.
    """
    user = UserFactory()
    good = {'email': user.id, 'password': 'testpassword'}
    codes = _fire(client, '/api/v1/auth/login', good, LIMIT + 1)
    assert codes[:LIMIT] == [200] * LIMIT, codes
    assert codes[LIMIT] == 429, codes


def test_these_tests_leave_the_limiter_off_for_everybody_else(client, db):
    """The fixture's teardown is load-bearing for the other 600-odd tests.

    If `rate_limited` ever failed to restore this, the eleventh unrelated test to
    log in would 429 and the failure would look like anything but its cause.

    Deliberately last in the file, and it takes no `rate_limited` fixture: it
    runs *after* the tests that turn the limiter on, so what it observes is their
    teardown rather than conftest's initial value.
    """
    assert limiter.enabled is False
    codes = [client.post('/api/v1/auth/login', json={}).status_code
             for _ in range(LIMIT + 5)]
    assert 429 not in codes, codes
