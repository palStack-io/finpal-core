"""D-91 — the community contribution published the card's last four to a PUBLIC GitHub issue.

`generate_pr_url` builds a pre-filled issue against `palStack-io/pointsPal` so a user can donate
their card's earn rates. It included the card's **last four digits twice** — once as
`**Last four:** 1142` in the prose and again as `"last_four": "1142"` inside the JSON payload —
while web-ui's own UI reassures the user, in as many words:

    "Opens a pre-filled GitHub issue. No personal data is shared."

*** MEASURED AGAINST THE RUNNING ENDPOINT, NOT INFERRED FROM THE SOURCE. *** A real request to
`/api/v1/wallet/cards/1/pr-url` returned a URL whose decoded body contained both occurrences.

**Owner decision, 2026-08-10: remove the field rather than reword the promise.** The last four
contributes nothing to a community *earn-rate* database — the useful fields are the program,
issuer, categories, multipliers, caps and notes — so deleting it makes the existing reassurance
true and costs the contribution nothing.

**Why this is a real leak and not a nicety:** the destination is a public repository. A card's last
four beside its issuer and program is an identifier many services accept for verification, and once
it is in an issue it is in the repo's history whether or not the issue is later edited.
"""
import json
import urllib.parse

from src.extensions import db as _db
from src.modules.pointspal.models import PointsProgram, UserCard
from tests.factories import UserFactory

URL = '/api/v1/wallet/cards/{}/pr-url'

LAST_FOUR = '4321'


def _card(owner):
    program = PointsProgram.query.filter_by(program_id='test_ur').first()
    if not program:
        # Only the three columns the contribution actually reads. `PointsProgram` has no
        # `program_type`; inventing a field in a fixture is how a test ends up asserting
        # against a model that never existed.
        program = PointsProgram(program_id='test_ur', program_name='Test Rewards',
                                issuer='TestBank')
        _db.session.add(program)
        _db.session.commit()
    card = UserCard(user_id=owner.id, program_id=program.program_id,
                    card_nickname='Test Sapphire', last_four=LAST_FOUR)
    _db.session.add(card)
    _db.session.commit()
    return card


def _decoded_body(url):
    """The issue body as GitHub would show it, not the percent-encoded blob."""
    assert '&body=' in url, url[:200]
    raw = url.split('&body=')[1].split('&labels=')[0]
    return urllib.parse.unquote(raw)


def test_the_contribution_does_not_publish_the_card_number(client, db, auth_headers):
    user = UserFactory()
    card = _card(user)

    resp = client.get(URL.format(card.id), headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = _decoded_body(resp.get_json()['pr_url'])
    # Both spellings, because it appeared twice in two different forms.
    assert LAST_FOUR not in body, f'the card number is in the public issue body:\n{body[:600]}'
    assert 'last_four' not in body, f'the payload still carries a last_four key:\n{body[:600]}'
    assert 'Last four' not in body


def test_it_still_carries_what_the_community_actually_needs(client, db, auth_headers):
    """The inverse, so the fix cannot degrade into stripping the contribution empty.

    A contribution with no program or rates is worse than none — it wastes a maintainer's time.
    """
    user = UserFactory()
    card = _card(user)

    resp = client.get(URL.format(card.id), headers=auth_headers(user))

    assert resp.status_code == 200
    body = _decoded_body(resp.get_json()['pr_url'])
    assert 'Test Rewards' in body
    assert 'TestBank' in body
    assert 'earn_categories' in body
    # The JSON block must still parse — a hand-edited f-string is easy to break.
    block = body.split('```json')[1].split('```')[0]
    payload = json.loads(block)
    assert payload['program_name'] == 'Test Rewards'
    assert payload['issuer'] == 'TestBank'
    assert 'last_four' not in payload


def test_the_url_targets_the_community_repo_with_its_label(client, db, auth_headers):
    """Pin the destination. A contribution posted to the wrong repo is silently useless."""
    user = UserFactory()
    card = _card(user)

    url = client.get(URL.format(card.id), headers=auth_headers(user)).get_json()['pr_url']

    assert url.startswith('https://github.com/palStack-io/pointsPal/issues/new')
    assert 'community-contribution' in urllib.parse.unquote(url)


def test_another_users_card_is_refused(client, db, auth_headers):
    """The boundary: a card id is a guessable integer, and this endpoint reads card data."""
    owner = UserFactory()
    stranger = UserFactory()
    card = _card(owner)

    resp = client.get(URL.format(card.id), headers=auth_headers(stranger))

    assert resp.status_code in (400, 403, 404), resp.get_data(as_text=True)[:200]
    assert LAST_FOUR not in resp.get_data(as_text=True)


def test_the_card_list_reports_whether_a_link_was_generated(client, db, auth_headers):
    """D-92 — both clients read `/pointspal/cards`, which did not carry this field.

    web's card list called `fetchCards()` with the comment *"Refresh so
    submitted_to_community flag updates"* against a payload that **never contained it**, so no
    UI could show the state and a user had no way to tell they had already opened a
    contribution — inviting duplicate issues. `/wallet/cards` had the field all along; the list
    endpoint both clients actually use did not.

    Named "reports whether a LINK was generated" on purpose: that is all the flag can mean.
    """
    user = UserFactory()
    card = _card(user)

    # A bare list, not an envelope — web types it `WalletCard[]`. Asserted rather than
    # accommodated with `.get('cards') or …`, which would hide a shape change.
    before = client.get('/api/v1/pointspal/cards', headers=auth_headers(user)).get_json()
    assert isinstance(before, list), type(before).__name__
    row = [c for c in before if c['id'] == card.id][0]
    assert 'submitted_to_community' in row, f'the list endpoint omits the flag: {sorted(row)}'
    assert row['submitted_to_community'] is False

    client.get(URL.format(card.id), headers=auth_headers(user))

    after = client.get('/api/v1/pointspal/cards', headers=auth_headers(user)).get_json()
    row = [c for c in after if c['id'] == card.id][0]
    assert row['submitted_to_community'] is True
    assert row['community_pr_url'].startswith('https://github.com/palStack-io/pointsPal')
