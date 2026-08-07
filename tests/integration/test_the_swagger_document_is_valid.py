"""The swagger document must be valid enough for a generator to consume.

The sibling gates prove every route is documented and every body-reading route
declares a body. Neither says the document as a whole is **well-formed**, and a
spec no tool will parse is as useless to a generated client as a spec that is
missing routes — which is the whole of item 1c.

Found by pointing a real generator at it. `swagger2openapi` — the standard step
for a Swagger 2.0 spec, because `openapi-typescript` dropped 2.0 at v6 — refused
the document outright:

    S2OError: (Patchable) response.description is mandatory

Eight entries in the root `responses` object were `{}`. They are the
`@api.errorhandler` registrations for the flask-jwt-extended exceptions, and
flask-restx takes a response's `description` **from the handler's docstring**.
The eight had none, so they serialised empty and one missing docstring made the
entire spec unconvertible.

`description` is required on a Response Object in both Swagger 2.0 and OpenAPI
3.x, so this was never merely untidy.
"""
import pytest


@pytest.fixture
def spec(client):
    doc = client.get('/api/v1/swagger.json').get_json()
    assert doc and doc.get('paths'), 'swagger.json served nothing usable'
    return doc


def _responses(node, path='$'):
    """Every Response Object in the document, wherever it is nested."""
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == 'responses' and isinstance(value, dict):
                for code, response in value.items():
                    if isinstance(response, dict):
                        found.append((f'{path}.responses.{code}', response))
            found.extend(_responses(value, f'{path}.{key}'))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            found.extend(_responses(value, f'{path}[{i}]'))
    return found


def test_every_response_has_a_description(spec):
    """Mandatory in Swagger 2.0 and OpenAPI 3.x alike.

    Checked at every depth, not just on operations: the eight that broke the
    conversion were in the document's ROOT `responses` object, which an
    operation-level sweep walks straight past. That is the shape the original
    bug had.
    """
    missing = [path for path, response in _responses(spec)
               if not response.get('description')]
    assert not missing, (
        'these responses have no `description`, which OpenAPI requires and '
        'which makes the whole document unconvertible — a flask-restx response '
        'takes its description from the error handler\'s DOCSTRING, so the fix '
        'is usually a missing docstring: %s' % sorted(missing))


def test_the_jwt_error_handlers_are_documented(spec):
    """Named, because these eight are the ones that broke it.

    A generic sweep would go quiet again if they were removed and re-added
    without docstrings — restx only emits a root `responses` entry for a handler
    that exists, so their absence would look identical to their being correct.
    """
    responses = spec.get('responses', {})
    for name in ('NoAuthorizationError', 'InvalidHeaderError', 'JWTDecodeError',
                 'WrongTokenError', 'RevokedTokenError', 'FreshTokenRequired',
                 'ExpiredSignatureError', 'DecodeError'):
        assert name in responses, f'{name} is no longer registered as an error handler'
        assert responses[name].get('description'), (
            f'{name} has no description — give its @api.errorhandler function a '
            f'docstring; restx reads the description from there')


def test_the_sweep_would_notice_a_missing_description(spec):
    """Proof this file inspects something.

    A `_responses` that returned nothing would satisfy the assertion above in
    silence, which is the failure this project has shipped four times.
    """
    found = _responses(spec)
    assert len(found) > 20, f'only {len(found)} responses found; the sweep is broken'

    sabotaged = {'responses': {'200': {'description': ''}, '404': {}}}
    missing = [p for p, r in _responses(sabotaged) if not r.get('description')]
    assert len(missing) == 2, f'the sweep missed a blank description: {missing}'


def test_the_document_declares_its_version(spec):
    """The version decides the toolchain, and getting it wrong wastes a session.

    flask-restx emits Swagger **2.0**, not OpenAPI 3. `openapi-typescript`
    dropped 2.0 support at v6, so mobile's generation pipeline must run
    `swagger2openapi` first. If flask-restx is ever replaced by something that
    emits 3.x, this fails and the pipeline can drop the conversion step.
    """
    assert spec.get('swagger') == '2.0', (
        'the spec version changed — mobile/package.json runs swagger2openapi '
        'before openapi-typescript purely because this is 2.0')
