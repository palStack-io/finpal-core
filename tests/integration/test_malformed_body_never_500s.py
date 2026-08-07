"""A malformed request body is the client's fault, so it must not read as ours.

This is S-14, which the 2026-08-03 re-audit ticked without evidence and then reopened
as "never substantiated". It is substantiated here, and the diagnosis in the roadmap
was wrong in an interesting way.

The roadmap said the exposure was low because "Flask 2.2 `get_json()` already 400s on
a non-JSON body". The first half is true — a bare `request.get_json()` raises
Werkzeug's `BadRequest` before the handler's own `if not data` guard can run. The
problem is what happens next: the legacy blueprints wrap their bodies in

    except Exception as e:
        return jsonify({'error': str(e)}), 500

and `BadRequest` is an `Exception`. So a correct **400 becomes a 500**, and the
exception text is handed to the client — which `CLAUDE.md` forbids outright ("never
return `str(e)` to the client") and which the Q-01 bulk fix was supposed to have
removed. `POST /api/v1/categories` did this for four of five malformed-body shapes.

Exactly the same swallowing was found once before, in the CSV handlers, where it
turned a correct 413 into a misleading 400. Twice is a pattern, so this test is keyed
to the **mechanism**: it enumerates every write route from `url_map` and sends each a
malformed body. A new handler written the old way fails here without anyone
remembering to add it to a list — the lesson of AUDIT D-28.

A 4xx of any kind is fine. So is a 404 from a dummy path parameter: this asserts only
that the server does not blame itself for a bad request.
"""
import re

import pytest

from src.extensions import db
from src.models.user import User

# Routes excluded from the sweep, each with a reason. Not "known failures" — reasons
# why sending a malformed body is not a meaningful test of the route.
SKIP_RULES = {
    # Logging out and refreshing take no body; a 4xx or 200 either way tells us
    # nothing about body handling, and logout revokes the token the sweep is using.
    '/api/v1/auth/logout',
    '/api/v1/auth/refresh',
}

MALFORMED_BODIES = [
    ('no body', None, {}),
    ('empty json body', '', {'Content-Type': 'application/json'}),
    ('text body', 'hello', {'Content-Type': 'text/plain'}),
    ('broken json', '{oops', {'Content-Type': 'application/json'}),
]


def _write_rules(app):
    """Every /api/v1 rule accepting a body, with path params filled in."""
    out = []
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith('/api/v1'):
            continue
        methods = rule.methods - {'GET', 'HEAD', 'OPTIONS', 'DELETE'}
        if not methods:
            continue
        if rule.rule in SKIP_RULES:
            continue
        # Dummy path parameters. A 404 is an acceptable outcome — the point is only
        # that a bad body is not reported as a server fault.
        path = re.sub(r'<int:[^>]+>', '1', rule.rule)
        path = re.sub(r'<(?:string:)?[^>]+>', 'x', path)
        if '<' in path:
            continue
        for method in sorted(methods):
            out.append((method, path))
    return sorted(set(out))


@pytest.fixture
def token(client, db):
    user = User(id='malformed@test.com', name='Probe')
    user.set_password('pw')
    db.session.add(user)
    db.session.commit()
    resp = client.post('/api/v1/auth/login',
                       json={'email': user.id, 'password': 'pw'})
    return resp.get_json()['access_token']


def test_there_are_write_routes_to_sweep(app):
    """A sweep that silently covers nothing reports success."""
    rules = _write_rules(app)
    assert len(rules) > 30, 'only found %d write routes: %s' % (
        len(rules), rules[:10])


def test_no_write_route_answers_a_malformed_body_with_a_5xx(
        app, client, db, token):
    headers_base = {'Authorization': 'Bearer %s' % token}
    failures = []

    for method, path in _write_rules(app):
        for label, body, extra in MALFORMED_BODIES:
            headers = dict(headers_base)
            headers.update(extra)
            try:
                resp = client.open(path, method=method, headers=headers,
                                   data=body)
            except Exception as exc:  # a raised exception is a 500 by any measure
                failures.append('%s %s [%s] raised %s'
                                % (method, path, label, type(exc).__name__))
                continue
            if resp.status_code >= 500:
                failures.append('%s %s [%s] -> %d'
                                % (method, path, label, resp.status_code))

    assert not failures, (
        'these blamed the server for a malformed request body, usually because an '
        '`except Exception` swallowed Werkzeug\'s BadRequest and re-raised it as a '
        '500:\n  %s' % '\n  '.join(failures))


def test_a_malformed_body_does_not_leak_the_exception_text(
        app, client, db, token):
    """The other half of the same defect.

    `jsonify({'error': str(e)})` hands Werkzeug's internal wording to the client —
    "The browser (or proxy) sent a request that this server could not understand" —
    which is both a leak and a lie about whose fault it is.
    """
    resp = client.post('/api/v1/categories',
                       headers={'Authorization': 'Bearer %s' % token,
                                'Content-Type': 'text/plain'},
                       data='hello')
    body = resp.get_data(as_text=True)
    assert 'browser (or proxy)' not in body, (
        'the raw Werkzeug exception text reached the client: %s' % body[:200])
    assert resp.status_code < 500, resp.status_code


def test_an_api_error_is_json_carrying_both_keys_the_clients_read(
        app, client, db, token):
    """The error contract, pinned because nothing pinned it before.

    Adding an app-level `errorhandler(HTTPException)` changed the shape of every
    failing `/api/` response, and the two clients read different keys and cannot be
    updated in lockstep with the backend: web reads `data.error`
    (`AddTransactionForm`, `GroupDetail`) while mobile reads `data.message` in most
    places and `data.error` in a couple. Both are populated, with the HTTP status
    name.

    Deliberately *not* `e.description`: BadRequest's wording is "The browser (or
    proxy) sent a request that this server could not understand", which is
    meaningless to an API client and was the text the old `str(e)` returns leaked.

    **The status is 415 under Flask 3, and was 400 under 2.2.** This request
    declares `Content-Type: text/plain`, and Flask 2.3+ answers a non-JSON
    content type with Unsupported Media Type rather than trying to parse it and
    failing. That is the correct reading of the two statuses, so it is adopted
    rather than forced back — and it costs the clients nothing, because the
    subject of this test is the SHAPE, which is identical: the handler keys on
    `HTTPException` in general, not on 400.
    """
    resp = client.post('/api/v1/categories',
                       headers={'Authorization': 'Bearer %s' % token,
                                'Content-Type': 'text/plain'},
                       data='hello')

    assert resp.status_code == 415, resp.status_code
    assert resp.is_json, 'an API error answered with %s' % resp.content_type
    body = resp.get_json()
    assert body['error'] == 'Unsupported Media Type', body
    assert body['message'] == 'Unsupported Media Type', body
    assert body['success'] is False, body


def test_unparseable_json_keeps_the_same_shape_on_400(app, client, db, token):
    """The case a real client can actually reach, which the 415 above cannot.

    axios sets `Content-Type: application/json` whenever it is handed an object,
    so neither client ever produces the 415 above in normal use — they produce
    this. Both statuses must carry both keys, or the clients' error rendering
    breaks on whichever one went unasserted.
    """
    resp = client.post('/api/v1/categories',
                       headers={'Authorization': 'Bearer %s' % token,
                                'Content-Type': 'application/json'},
                       data='{not json')

    assert resp.status_code == 400, resp.status_code
    assert resp.is_json, 'an API error answered with %s' % resp.content_type
    body = resp.get_json()
    assert body['error'] == 'Bad Request', body
    assert body['message'] == 'Bad Request', body
    assert body['success'] is False, body


def test_the_jwt_loaders_keep_their_own_shapes(app, client, db):
    """The app-level handler must not swallow these.

    flask-restx installs its own error handling and `api/__init__.py` registers eight
    `@api.errorhandler` entries, so this checks whose formatting wins for an
    unauthenticated restx route rather than assuming.
    """
    resp = client.get('/api/v1/transactions/')

    assert resp.status_code == 401
    body = resp.get_json()
    assert body['error'] == 'authorization_required', body
    assert 'authorization token' in body['message'], body


def test_a_non_api_path_is_untouched(app, client, db):
    """Scoped on purpose: only `/api/` answers in JSON, so anything Flask serves
    outside the API keeps its normal error page."""
    resp = client.get('/definitely-not-a-route')

    assert resp.status_code == 404
    assert not resp.is_json, 'a non-API 404 was turned into JSON'
