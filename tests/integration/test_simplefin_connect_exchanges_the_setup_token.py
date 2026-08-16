"""Connecting SimpleFin accepted any string at all and called it a connection.

SimpleFin Bridge hands a *user* exactly one artifact: a base64 **setup token**, usable
once. Its developer guide says the application must base64-decode that token to a claim
URL and POST it to receive an **access URL**, which is the long-lived credential. finPal
shipped both halves of that exchange in `integrations/simplefin/client.py`
(`decode_setup_token`, `claim_access_url`) and **called neither from anywhere** —
`save_simplefin_token` wrote whatever string arrived straight into `SimpleFin.access_url`
and answered `{'connected': True}`.

So the only artifact a user can actually obtain was stored as though it were the
credential it is exchanged for, and the UI reported success. Nothing failed until the
next sync, which parsed the token as a URL, got nothing, and returned "no accounts" —
a connection that reports itself healthy forever and never syncs. That is this project's
recurring shape: a 200 and a green screen over work that did not happen.

These tests are written against the *service* rather than only the route because
`_simplefin_required()` gates every SimpleFin endpoint behind `SIMPLEFIN_ENABLED`, which
is `False` by default — a config-dependent 503 would hide the defect again. One endpoint
test is kept, with the flag forced on, because `connected: true` in a response body is
what the user was actually shown.

The bridge is mocked at `integrations.simplefin.client.requests`. No test here reaches
the network: a suite that talks to beta-bridge.simplefin.org would be red whenever
someone else's service is down, and a claim token can only be spent once anyway.
"""
import base64
from unittest.mock import patch

import pytest

from src.models.account import SimpleFin
from src.services.account.service import SimpleFinService
from tests.factories import UserFactory


CLAIM_URL = 'https://beta-bridge.simplefin.org/simplefin/claim/DEMO-CLAIM'
ACCESS_URL = 'https://user123:pass456@beta-bridge.simplefin.org/simplefin'
SETUP_TOKEN = base64.b64encode(CLAIM_URL.encode()).decode()


class FakeResponse:
    def __init__(self, status_code, text=''):
        self.status_code = status_code
        self.text = text

    def json(self):
        return {'accounts': []}


def _stored(user_id):
    return SimpleFin.query.filter_by(user_id=user_id).first()


def test_a_junk_string_is_refused_and_nothing_is_stored(db):
    """The defect itself, from the user's side: a paste that cannot possibly work.

    Asserted on the database as well as the return value — the old code committed the
    row *and* reported success, so a test that only read the message would have passed
    against a connection that was already broken.
    """
    user = UserFactory()
    service = SimpleFinService()

    with patch('integrations.simplefin.client.requests') as requests_mock:
        success, message = service.connect_simplefin(user.id, 'i-pasted-the-wrong-thing')

    assert success is False, (
        'a string that is neither a setup token nor an access URL was accepted, so the '
        'UI told the user their bank was connected'
    )
    assert _stored(user.id) is None, (
        'nothing usable was obtained, yet a SimpleFin row was written — the next sync '
        'will fail against a credential the user believes is good'
    )
    assert requests_mock.post.called is False, (
        'a string with no claim URL in it should not produce an outbound request'
    )
    assert message, 'a refusal with no message gives the user nothing to act on'


def test_a_setup_token_is_exchanged_for_an_access_url_and_the_url_is_what_is_stored(db):
    """The flow SimpleFin actually documents, end to end.

    The assertion that matters is the *stored* value: storing the token would leave the
    user connected in name only, which is the state this whole file exists to prevent.
    """
    user = UserFactory()
    service = SimpleFinService()

    with patch('integrations.simplefin.client.requests') as requests_mock:
        requests_mock.post.return_value = FakeResponse(200, ACCESS_URL)
        requests_mock.get.return_value = FakeResponse(200)
        success, message = service.connect_simplefin(user.id, SETUP_TOKEN)

    assert success is True, 'a valid setup token was refused: %s' % message

    claimed = requests_mock.post.call_args[0][0]
    assert claimed == CLAIM_URL, (
        'the token was not base64-decoded before being claimed; POSTed %r' % claimed)

    row = _stored(user.id)
    assert row is not None, 'a successful exchange stored nothing'
    assert row.access_url == ACCESS_URL, (
        'the setup token was stored instead of the access URL it was exchanged for'
    )
    assert SETUP_TOKEN not in (row.access_url or ''), (
        'the one-time setup token is being kept as the long-lived credential'
    )


def test_a_token_that_has_already_been_claimed_says_so(db):
    """Setup tokens are single-use, so this is the mistake users will actually make.

    Reconnecting means going back to the bridge for a new token. "Failed to connect"
    would send them to re-paste the same dead token forever.
    """
    user = UserFactory()
    service = SimpleFinService()

    with patch('integrations.simplefin.client.requests') as requests_mock:
        requests_mock.post.return_value = FakeResponse(403, 'Forbidden')
        success, message = service.connect_simplefin(user.id, SETUP_TOKEN)

    assert success is False
    assert _stored(user.id) is None
    assert 'already' in message.lower() or 'new' in message.lower(), (
        'the message does not tell the user to generate a fresh token: %r' % message)


def test_an_access_url_the_bridge_rejects_is_not_saved(db):
    """Back-compat path: a pasted access URL is still accepted — but only if it works.

    Shape-checking alone would re-create the defect one level down, since a well-formed
    URL with a wrong password parses perfectly and syncs nothing.
    """
    user = UserFactory()
    service = SimpleFinService()

    with patch('integrations.simplefin.client.requests') as requests_mock:
        requests_mock.get.return_value = FakeResponse(403)
        success, message = service.connect_simplefin(user.id, ACCESS_URL)

    assert success is False, 'an access URL the bridge refuses was accepted'
    assert _stored(user.id) is None
    assert requests_mock.post.called is False, (
        'an access URL is not a claim URL and must not be POSTed to')


def test_a_working_access_url_is_still_accepted(db):
    """The path self-hosters using an existing credential rely on."""
    user = UserFactory()
    service = SimpleFinService()

    with patch('integrations.simplefin.client.requests') as requests_mock:
        requests_mock.get.return_value = FakeResponse(200)
        success, message = service.connect_simplefin(user.id, ACCESS_URL)

    assert success is True, message
    assert _stored(user.id).access_url == ACCESS_URL


def test_reconnecting_replaces_the_credential_rather_than_adding_a_second_row(db):
    """One connection per user is what `get_simplefin_settings` assumes."""
    user = UserFactory()
    service = SimpleFinService()
    second_url = 'https://user999:pass999@beta-bridge.simplefin.org/simplefin'

    with patch('integrations.simplefin.client.requests') as requests_mock:
        requests_mock.get.return_value = FakeResponse(200)
        service.connect_simplefin(user.id, ACCESS_URL)
        service.connect_simplefin(user.id, second_url)

    rows = SimpleFin.query.filter_by(user_id=user.id).all()
    assert len(rows) == 1, 'reconnecting left %d rows' % len(rows)
    assert rows[0].access_url == second_url


@pytest.mark.parametrize('key', ['access_url', 'setup_token'])
def test_the_endpoint_does_not_report_connected_for_a_credential_it_never_verified(
        client, db, auth_headers, app, key):
    """What the user was shown. Asserted on the body, never on the status code.

    Parameterised over **both** request keys, and that is the point rather than
    thoroughness. Written with only `setup_token` this test **passed against the broken
    code** — the old endpoint required `access_url`, so junk under the new key was
    rejected as a missing field and the assertion never reached the defect. A passing
    test over a known-bad build is a hole in the test, so the key the API actually
    accepted is now covered too. Measured before the fix: `access_url` gave HTTP 200,
    `{'connected': True}`, with `'i-pasted-the-wrong-thing'` stored as the credential.

    `SIMPLEFIN_ENABLED` is forced on for this test only: it defaults to False, so
    without this the route answers 503 and the assertions below would pass while
    testing nothing.
    """
    user = UserFactory(password_plain='secret')
    headers = auth_headers(user, password='secret')

    original = app.config.get('SIMPLEFIN_ENABLED', False)
    app.config['SIMPLEFIN_ENABLED'] = True
    try:
        with patch('integrations.simplefin.client.requests'):
            resp = client.post(
                '/api/v1/accounts/simplefin/connect',
                json={key: 'i-pasted-the-wrong-thing'},
                headers=headers,
            )
    finally:
        app.config['SIMPLEFIN_ENABLED'] = original

    assert resp.get_json().get('connected') is not True, (
        'the API told the client it was connected to a bank using a string it never '
        'checked; body was %r' % resp.get_json()
    )
    assert _stored(user.id) is None


def test_the_endpoint_accepts_a_setup_token_at_all(client, db, auth_headers, app):
    """The other half: refusing junk is easy if you refuse everything.

    Without this, making the endpoint strict would satisfy every assertion above while
    leaving users with no working way in — the field the UI now asks for would 400.
    """
    user = UserFactory(password_plain='secret')
    headers = auth_headers(user, password='secret')

    original = app.config.get('SIMPLEFIN_ENABLED', False)
    app.config['SIMPLEFIN_ENABLED'] = True
    try:
        with patch('integrations.simplefin.client.requests') as requests_mock:
            requests_mock.post.return_value = FakeResponse(200, ACCESS_URL)
            requests_mock.get.return_value = FakeResponse(200)
            resp = client.post(
                '/api/v1/accounts/simplefin/connect',
                json={'setup_token': SETUP_TOKEN},
                headers=headers,
            )
    finally:
        app.config['SIMPLEFIN_ENABLED'] = original

    assert resp.get_json().get('connected') is True, (
        'a valid setup token was refused by the endpoint: %r' % resp.get_json())
    assert _stored(user.id).access_url == ACCESS_URL
