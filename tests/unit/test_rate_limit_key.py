"""Agent traffic is limited per token, not per IP.

Every request from one MCP server shares a source address, so an IP key would
either throttle a whole household together or not throttle the agent at all.

These drive `rate_limit_key()` the way flask-limiter does — from request headers
during `before_request`, with nothing set on `g`. An earlier version keyed on
`g.pat`, which passes a test that sets `g.pat` by hand and is completely inert in
production, because flask-limiter's check runs before any view function has had
the chance to set it.
"""
from src.extensions import rate_limit_key

TOKEN = 'fp_live_' + 'a' * 32
OTHER = 'fp_live_' + 'b' * 32


def test_falls_back_to_the_remote_address_when_no_token_is_presented(app):
    with app.test_request_context('/', environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        assert rate_limit_key() == '10.1.2.3'


def test_uses_the_token_from_the_api_key_header(app):
    with app.test_request_context(
            '/', headers={'X-API-Key': TOKEN},
            environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        key = rate_limit_key()
    assert key.startswith('pat:')
    assert '10.1.2.3' not in key


def test_uses_the_token_from_a_bearer_header(app):
    with app.test_request_context(
            '/', headers={'Authorization': 'Bearer ' + TOKEN},
            environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        assert rate_limit_key().startswith('pat:')


def test_the_key_never_contains_the_token_itself(app):
    """The bucket label lands in the limiter's storage; it must not be the secret."""
    with app.test_request_context('/', headers={'X-API-Key': TOKEN}):
        key = rate_limit_key()
    assert TOKEN not in key
    assert TOKEN[8:] not in key


def test_two_tokens_from_one_address_get_separate_buckets(app):
    keys = []
    for token in (TOKEN, OTHER):
        with app.test_request_context(
                '/', headers={'X-API-Key': token},
                environ_base={'REMOTE_ADDR': '10.1.2.3'}):
            keys.append(rate_limit_key())
    assert keys[0] != keys[1]


def test_the_same_token_is_stable_across_requests(app):
    keys = []
    for _ in range(2):
        with app.test_request_context('/', headers={'X-API-Key': TOKEN}):
            keys.append(rate_limit_key())
    assert keys[0] == keys[1], 'a per-request key would give every call its own bucket'


def test_a_non_pat_bearer_token_falls_back_to_the_address(app):
    """A JWT session must not be bucketed as if it were a token."""
    with app.test_request_context(
            '/', headers={'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig'},
            environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        assert rate_limit_key() == '10.1.2.3'


def test_it_is_evaluated_before_any_view_runs(app, client):
    """The defect this replaced: keying on g.pat is inert.

    flask-limiter registers its check with app.before_request, so key_func runs
    before the view — and before @api_auth_required could set g.pat.
    """
    import flask_limiter.extension as ext
    import inspect
    source = inspect.getsource(ext.Limiter.init_app)
    assert 'before_request' in source, (
        'flask-limiter no longer hooks before_request; re-check whether a '
        'g-based key would now work')
