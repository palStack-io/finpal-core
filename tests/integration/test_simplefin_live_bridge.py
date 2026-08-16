"""
The whole SimpleFin journey against the REAL SimpleFin Bridge, over HTTP.

*** WHY THIS EXISTS. *** D-110 was a feature that reported `{'connected': True}` over a
credential that could never sync: the pasted setup token was stored verbatim as though it
were the access URL it is exchanged for. The fix shipped with nine unit tests, all green,
and the checkpoint still had to record the honest gap — *nobody had ever pasted a real
token*. Mocks cannot close that gap, because the thing that was wrong was our model of
what Bridge hands out, and a mock is written from the same wrong model.

*** WHAT MAKES IT POSSIBLE WITHOUT A PAID ACCOUNT. *** SimpleFin's developer guide prints
a live, single-use DEMO setup token, regenerated on every page load. It claims against the
same `/simplefin/claim/` endpoint a paid token does and returns a working access URL
serving three demo accounts. So the full exchange is exercisable for free, on demand.

*** NETWORK-GATED ON PURPOSE. *** It talks to a third party, so it is skipped unless
`FINPAL_LIVE=1`. It is not part of the default suite and must never be relied on by CI:
run it by hand when the SimpleFin path changes.

    FINPAL_LIVE=1 ./venv/bin/pytest tests/integration/test_simplefin_live_bridge.py -v -s

The assertions are deliberately about *rendered payloads and database rows*, never a
status code. Every SimpleFin defect this project has found answered 200.
"""

import base64
import os
import re

import pytest
import requests

from tests.factories import UserFactory

pytestmark = pytest.mark.skipif(
    os.environ.get('FINPAL_LIVE') != '1',
    reason='talks to beta-bridge.simplefin.org; set FINPAL_LIVE=1 to run',
)

DEV_GUIDE = 'https://beta-bridge.simplefin.org/info/developers'


def fresh_demo_token():
    """
    Pull a new single-use demo setup token off SimpleFin's developer guide.

    Matched by the property that defines it — base64 that decodes to a Bridge claim
    URL — rather than by the markup around it. A token is spent by claiming it, so
    every call must return a different one; a test that silently reused a spent token
    would fail as though the exchange were broken.
    """
    html = requests.get(DEV_GUIDE, timeout=30).text
    for blob in re.findall(r'[A-Za-z0-9+/=]{60,}', html):
        try:
            decoded = base64.b64decode(blob).decode('utf-8')
        except Exception:
            continue
        if decoded.startswith('http') and '/simplefin/claim/' in decoded:
            return blob
    pytest.fail(f'no demo setup token on {DEV_GUIDE} — has the page changed?')


def test_a_real_setup_token_is_exchanged_and_syncs(client, auth_headers, db):
    """Connect, fetch, import — and prove real money landed in real rows."""
    from src.models.account import Account, SimpleFin
    from src.models.transaction import Expense

    user = UserFactory()
    headers = auth_headers(user)
    token = fresh_demo_token()

    # --- connect: the token must be EXCHANGED, not stored -------------------
    resp = client.post('/api/v1/accounts/simplefin/connect',
                       json={'setup_token': token}, headers=headers)
    body = resp.get_json()
    # The success and failure shapes are not symmetric: success answers `connected`
    # with no `success` key, failure answers `success: false` with `error`. Asserting
    # `success is True` here would read as a pass on neither.
    assert body.get('connected') is True, f'live connect failed: {body}'

    row = SimpleFin.query.filter_by(user_id=user.id).first()
    assert row is not None, 'reported success and wrote no credential'
    # D-110's exact symptom, stated as the thing that must not be true.
    assert row.access_url != token, 'the setup token was stored unexchanged (D-110)'
    assert row.access_url.startswith('http'), f'not an access URL: {row.access_url[:40]}'

    # --- fetch: the credential must actually answer Bridge ------------------
    resp = client.post('/api/v1/accounts/simplefin/fetch', headers=headers)
    available = resp.get_json().get('accounts') or []
    assert available, f'the exchanged credential fetched no accounts: {resp.get_json()}'

    # --- import: pick them all and prove the rows carry real balances -------
    resp = client.post('/api/v1/accounts/simplefin/import',
                       json={'account_ids': [a['id'] for a in available]},
                       headers=headers)
    body = resp.get_json()
    assert body.get('success') is True, f'live import failed: {body}'

    imported = Account.query.filter_by(user_id=user.id).all()
    assert len(imported) == len(available), (
        f'{len(available)} accounts offered, {len(imported)} rows created')
    # A balance of exactly zero on every account is what a broken parse looks like.
    assert any(a.balance for a in imported), 'every imported account has a zero balance'

    # --- sync: the transactions, which import deliberately does NOT fetch ----
    #
    # `import_simplefin_accounts` fetches with `days_back=1` "just to get current
    # balances -- no transactions needed", so a user who has connected and imported
    # still has an empty transaction list until a sync runs. Stopping at the account
    # rows would be D-110's mistake one layer out: the balance proves the credential
    # works, not that the feature does. `SimpleFinService.__init__` is also where a
    # missing repository once made every sync call 500 for every user, so this is the
    # method with the least real traffic behind it.
    # Import must leave `last_sync` unset, or the first sync fetches a 3-day window
    # over which nothing was ever imported. On this demo account that silently cost
    # 39 of 57 transactions; on a real bank account with a quiet three days it cost
    # all of them.
    assert all(a.last_sync is None for a in imported), (
        'import stamped last_sync, so the first sync will fetch a 3-day window')

    resp = client.post('/api/v1/accounts/simplefin/sync-all', headers=headers)
    body = resp.get_json()
    assert body.get('success') is True, f'live sync-all failed: {body}'

    synced = Expense.query.filter_by(user_id=user.id).all()
    assert synced, 'connected, imported, synced -- and not one transaction landed'
    assert any(e.amount for e in synced), 'every synced transaction has a zero amount'
    assert all(e.account_id for e in synced), 'a synced transaction has no account'


def test_a_spent_token_is_refused_with_a_useful_message(client, auth_headers, db):
    """
    A setup token is single-use, and the message for a spent one has to say so.

    This is the error a returning user is most likely to hit — they reconnect and paste
    the token they still have in their clipboard. Bridge answers 403, which on its own
    reads as "your credentials are wrong" and sends them looking in the wrong place.
    """
    user = UserFactory()
    headers = auth_headers(user)
    token = fresh_demo_token()

    first = client.post('/api/v1/accounts/simplefin/connect',
                        json={'setup_token': token}, headers=headers)
    assert first.get_json().get('connected') is True, first.get_json()

    replay = client.post('/api/v1/accounts/simplefin/connect',
                         json={'setup_token': token}, headers=headers)
    body = replay.get_json()
    assert body.get('success') is False, 'a single-use token was claimed twice'
    assert 'once' in body.get('error', '').lower(), (
        f'the message does not explain single use: {body.get("error")!r}')


def test_junk_is_refused_and_never_written(client, auth_headers, db):
    """
    D-110 itself, as a live regression test.

    The original defect accepted any string, wrote it into `access_url` and answered
    `connected: true`. Asserting only on the response would have passed against the
    broken code, so this asserts on the database too.
    """
    from src.models.account import SimpleFin

    user = UserFactory()
    headers = auth_headers(user)

    resp = client.post('/api/v1/accounts/simplefin/connect',
                       json={'setup_token': 'i-pasted-the-wrong-thing'},
                       headers=headers)
    body = resp.get_json()
    assert body.get('success') is False, 'junk was accepted as a credential'
    assert SimpleFin.query.filter_by(user_id=user.id).first() is None, (
        'junk was written to the database')
