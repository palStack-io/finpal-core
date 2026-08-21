"""#123's ceiling guarded the POST and nothing guarded the PUT.

Found while fixing #130. `AccountsList.post` runs `validate_request(account_input, data)`;
`AccountDetail.put` read `request.get_json()` and assigned straight to the model with no
schema at all. So every constraint #123 added — the 7-character colour matching
`Account.color = db.String(7)`, the `OneOf` on account type, the 100-char name — applied
only to creation.

*** THAT IS THE D-99 SHAPE, AGAIN. *** #123 was reported as a *create* failure, fixed on
the create path, and the update path kept accepting exactly the values that caused it. A
defect reported in one place is a defect everywhere the same value can enter until the
server refuses it. The client that would hit this is not hypothetical either: before #130
was fixed, `pages/Accounts.tsx` supplied `var(--accent-blue)` as the colour fallback for
any account with a NULL colour, and that row is what the edit form opens on — so saving an
unrelated field re-posted an 18-character string into a 7-character column.

On Postgres that is a `StringDataRightTruncation`; SQLite does not enforce VARCHAR lengths
at all, which is why a dev database and this suite would both have shrugged. The
assertions below are on the RESPONSE and the stored row, never on a status code alone.

The validation is `partial=True`: a PUT is a partial update and `AccountInput` marks `name`
and `account_type` required, so a full load would refuse an ordinary balance edit — a
"fix" that broke every update. Both directions are asserted.
"""
from src.models.account import Account
from tests.factories import UserFactory


def _account(user, **kwargs):
    from src.extensions import db as _db
    fields = dict(name='Everyday', type='checking', user_id=user.id, balance=100,
                  currency_code='USD', color='#3b82f6')
    fields.update(kwargs)
    account = Account(**fields)
    _db.session.add(account)
    _db.session.commit()
    return account


def test_a_too_long_colour_is_refused_on_update(client, db, auth_headers):
    """The reported class, on the path that had no guard."""
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'color': 'var(--brand-green-glow)'})

    assert resp.status_code == 400, (
        f'a 23-character colour was accepted into a String(7) column: '
        f'{resp.status_code} {resp.get_data(as_text=True)[:200]}'
    )
    refreshed = db.session.get(Account, account.id)
    assert refreshed.color == '#3b82f6', (
        f'the row was mutated despite the refusal: {refreshed.color!r}'
    )


def test_an_invalid_account_type_is_refused_on_update(client, db, auth_headers):
    """`OneOf(ACCOUNT_TYPES)` also applied only to create."""
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'account_type': 'not-a-real-type'})

    assert resp.status_code == 400, resp.get_data(as_text=True)[:200]
    assert db.session.get(Account, account.id).type == 'checking'


def test_an_over_long_name_is_refused_on_update(client, db, auth_headers):
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'name': 'x' * 101})

    assert resp.status_code == 400, resp.get_data(as_text=True)[:200]
    assert db.session.get(Account, account.id).name == 'Everyday'


def test_an_ordinary_partial_update_still_works(client, db, auth_headers):
    """The inverse of the symptom, and the thing a careless fix would break.

    `AccountInput` marks `name` and `account_type` required. Validating a PUT with a
    non-partial load would refuse every real edit the UI makes, since the form sends only
    what changed. This is the assertion that distinguishes a fix from a regression.
    """
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'balance': 250.75})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    refreshed = db.session.get(Account, account.id)
    assert float(refreshed.balance) == 250.75
    # Untouched fields must survive a partial update.
    assert refreshed.name == 'Everyday'
    assert refreshed.type == 'checking'


def test_a_valid_colour_and_type_change_still_applies(client, db, auth_headers):
    """The happy path for the two fields the new validation touches most."""
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'account_type': 'savings', 'color': '#22c55e'})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    refreshed = db.session.get(Account, account.id)
    assert refreshed.type == 'savings'
    assert refreshed.color == '#22c55e'


def test_external_id_still_applies_on_update(client, db, auth_headers):
    """`external_id` is assigned by this handler and was NOT on `AccountInput`.

    With `unknown=EXCLUDE`, adding validation without adding this field would have made
    the handler silently stop applying it — turning a missing guard into a dropped field,
    which is the exact class of bug #129 turned out to be. Asserted so the schema and the
    handler cannot drift apart again.
    """
    user = UserFactory()
    account = _account(user)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'external_id': 'simplefin-abc-123'})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert db.session.get(Account, account.id).external_id == 'simplefin-abc-123'
