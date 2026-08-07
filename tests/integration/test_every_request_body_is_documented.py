"""A route that reads a request body must say so in swagger.

**The sibling gate is not enough.** `test_every_api_route_is_documented` proves
every live route *appears* in swagger. A route can appear, be callable, and still
be unusable by a generated client, because the client has no idea what to send:
the operation documents a path and a security scheme and nothing about the body
the handler goes on to read.

That is the half of item 1c that reads "generate **and write request models**".
Measured when this file was written: of 85 live write operations, 31 read a body
and documented one, **30 read a body and documented nothing**, and 24 read no
body at all and correctly stayed silent.

**Keyed to the mechanism.** "Which routes need a model?" is not a list somebody
maintains — it is derivable: a route needs one exactly when its handler reads the
request. So the handler's own source is the oracle. `POST /auth/logout` and
`POST /users/clear-cache` take no body and must NOT be forced to declare one; a
gate that demanded a model from every POST would be wrong 24 times and would be
silenced by adding empty models, which is worse than the gap.

**Delegation has to be followed.** `PATCH /categories/{id}` is one line —
`return self.put(category_id)` — so an unfollowed reader sees no body access and
concludes the route takes none. It documents a body and reads none only because
the read is one frame down. Three routes look like that, and without following
them this gate reports two false positives and one false negative.

**The inventory is two-sided and can only shrink**, the same contract as
`UNDOCUMENTED` in the sibling file: a route that gains a model must be removed
from `NO_REQUEST_MODEL`, so the list cannot rot into a set of things nobody
intends to fix.
"""
import inspect
import re

import pytest

# Routes whose handler reads a request body while the operation documents none.
# **This list must only ever get shorter.** Empty is the goal and the test below
# fails if an entry here has since been fixed.
NO_REQUEST_MODEL = set()

# Anything that reaches into the request. `request.files`/`request.form` count:
# a multipart upload is still a body a client has to construct.
BODY_READS = re.compile(
    r'request\.get_json|request\.json|api\.payload|ns\.payload|'
    r'request\.form|request\.files|request\.data|request\.values')

# `return self.put(...)` and friends - the read is one frame down.
DELEGATES = re.compile(r'self\.(get|post|put|patch|delete)\s*\(')

WRITE_METHODS = {'POST', 'PUT', 'PATCH'}
HTTP_METHODS = {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}


def _normalise(path):
    """`/api/v1/groups/<int:id>` and `/groups/{group_id}` must compare equal."""
    path = re.sub(r'<(?:[^:>]+:)?([^>]+)>', r'{\1}', path)
    path = re.sub(r'\{[^}]*\}', '{}', path)
    return path.rstrip('/') or '/'


def _method_source(resource, name, seen=None):
    """Source of `name` on `resource`, plus the source of anything it delegates to."""
    seen = seen or set()
    if name in seen:
        return ''
    seen.add(name)
    target = getattr(resource, name, None)
    if target is None:
        return ''
    try:
        source = inspect.getsource(inspect.unwrap(target))
    except (OSError, TypeError):
        return ''
    for delegate in DELEGATES.findall(source):
        source += _method_source(resource, delegate, seen)
    return source


def _reads_body(app, rule, method):
    view = app.view_functions.get(rule.endpoint)
    resource = getattr(view, 'view_class', None)
    if resource is None:
        try:
            return bool(BODY_READS.search(inspect.getsource(inspect.unwrap(view))))
        except (OSError, TypeError):
            return False
    return bool(BODY_READS.search(_method_source(resource, method.lower())))


@pytest.fixture
def bodies(app, client):
    spec = client.get('/api/v1/swagger.json').get_json()
    assert spec and spec.get('paths'), 'swagger.json served nothing usable'

    documented = {}
    for path, operations in spec['paths'].items():
        for method, operation in operations.items():
            if method.upper() not in HTTP_METHODS:
                continue  # a path-level `parameters` key is a list, not an operation
            params = operation.get('parameters') or []
            documented[(method.upper(), _normalise('/api/v1' + path))] = [
                p for p in params if p.get('in') in ('body', 'formData')]

    reads, documents = set(), set()
    for rule in app.url_map.iter_rules():
        path = str(rule.rule)
        if not path.startswith('/api/v1') or '/swagger' in path:
            continue
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            if method not in WRITE_METHODS:
                continue
            key = (method, _normalise(path))
            if _reads_body(app, rule, method):
                reads.add(key)
            if documented.get(key):
                documents.add(key)

    return reads, documents


def test_every_route_that_reads_a_body_documents_one(bodies):
    reads, documents = bodies
    missing = reads - documents - NO_REQUEST_MODEL
    assert not missing, (
        'these handlers read a request body but the operation documents none, '
        'so a generated client knows the route exists and not what to send it: '
        '%s' % sorted(missing))


def test_the_inventory_has_no_stale_entries(bodies):
    """The other half, so the list can only shrink."""
    reads, documents = bodies
    fixed = {entry for entry in NO_REQUEST_MODEL if entry in documents}
    assert not fixed, (
        'these document a body now - delete them from NO_REQUEST_MODEL: %s'
        % sorted(fixed))

    gone = {entry for entry in NO_REQUEST_MODEL if entry not in reads}
    assert not gone, (
        'these no longer read a body - delete them from NO_REQUEST_MODEL: %s'
        % sorted(gone))


def test_the_reader_can_tell_the_two_apart(app, bodies):
    """Proof this file inspects something.

    A `_reads_body` that always returned False would satisfy the assertion above
    in silence, and this project has shipped a check that inspects nothing four
    separate times. So: a known body-reader must read, a known body-less route
    must not, and delegation must be followed.
    """
    reads, documents = bodies

    assert ('POST', '/api/v1/auth/login') in reads, (
        'login obviously reads a body; the reader is broken')
    assert ('POST', '/api/v1/auth/logout') not in reads, (
        'logout takes no body; the reader is matching too eagerly')

    # Delegation: PATCH /categories/{} is `return self.put(...)` and nothing else.
    assert ('PATCH', '/api/v1/categories/{}') in reads, (
        'PATCH /categories delegates to put() - the reader did not follow it')

    assert len(reads) > 20, f'only {len(reads)} body-readers found; suspicious'
    assert documents, 'no documented bodies found at all; the spec parse is wrong'
