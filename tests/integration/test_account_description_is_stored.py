"""#129 — the account "Description" field was collected and thrown away.

Reported as `palStack-io/finpal-core#129`: *"When creating an account it asks a
'Description' which is usefull, but after the account is created nowhere that description
is visible or can be changed."*

The reporter could not tell which of two things was happening, and they need different
fixes. It was the worse one: **nothing was ever stored.** The chain was broken at every
single link, not one:

  1. `AddAccountForm` rendered a real `<textarea>` registered to the form — the one link
     that worked.
  2. Its submit built the payload field by field and never referenced `data.description`.
     `git log -S` shows the string was never sent, on any branch, ever.
  3. `accountService`'s create/update interfaces had no `description` member.
  4. `AccountInput` did not declare it, and `validate_request` loads with
     `unknown=EXCLUDE` — so a client that DID send it got a 201 and lost the field
     silently, with no error.
  5. Neither the POST kwargs nor the PUT's `if 'x' in data` ladder mentioned it.
  6. **`Account` had no `description` column.** `git log -S "description" --
     src/models/account.py` is empty: it never existed, so this is not the
     `create_all()`-never-ALTERs drift (D-121) — there was nothing to drift from.
  7. `AccountSchema` did not dump it, because there was nothing to dump.
  8. `EditAccountForm` initialised `description: ''` — a hardcoded empty string, not
     `account.description` — rendered no textarea, and sent nothing. Dead state that
     read like support for the feature, and the "cannot be changed" half of the report.

Built out rather than deleted, by owner decision (2026-08-20): the reporter called the
field useful. The D-05 precedent for the opposite call — delete a control with no column —
is what `account_number` on this same form still needs, and that is raised separately
rather than bundled here.

*** THIS ADDS A COLUMN, SO D-121 APPLIES TO EVERY EXISTING INSTALL. *** `create_all()`
creates missing *tables* and never adds a *column* to a table that already exists, so no
deployed instance gets `accounts.description` from a redeploy. `scripts/schema_drift.py`
prints the `ALTER`, which is the same recovery #124 needed.
"""
from src.models.account import Account
from tests.factories import UserFactory


A_DESCRIPTION = 'Joint account — rent, bills and the shared food shop'


def test_a_description_sent_on_create_is_stored_and_returned(client, db, auth_headers):
    """Asserted on the ROW and on the response body, never on the status code.

    The original defect answered 201 and rendered fine, which is how it survived.
    """
    user = UserFactory()

    resp = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Shared', 'account_type': 'checking', 'balance': 0,
        'description': A_DESCRIPTION,
    })

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Account.query.filter_by(user_id=user.id).one()
    assert row.description == A_DESCRIPTION, (
        f'the column holds {row.description!r} — the value was accepted and dropped'
    )
    body = resp.get_json()
    served = (body.get('account') or body)
    assert served.get('description') == A_DESCRIPTION, (
        f'stored but not served, which is the half the reporter could see: {body}'
    )


def test_the_description_comes_back_on_read(client, db, auth_headers):
    """"Nowhere that description is visible" — the list endpoint must serve it.

    Separate from the create assertion on purpose: the row could be right while the
    schema omits it, and that is exactly how a half-fix passes.
    """
    user = UserFactory()
    created = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Shared', 'account_type': 'checking', 'balance': 0,
        'description': A_DESCRIPTION})
    assert created.status_code == 201

    listed = client.get('/api/v1/accounts/', headers=auth_headers(user))
    assert listed.status_code == 200
    accounts = listed.get_json()['accounts']
    assert len(accounts) == 1
    assert accounts[0].get('description') == A_DESCRIPTION, (
        f'the read path does not serve it: {accounts[0]}'
    )


def test_the_description_can_be_changed(client, db, auth_headers):
    """"...or can be changed" — the second half of the report, on the PUT."""
    user = UserFactory()
    created = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Shared', 'account_type': 'checking', 'balance': 0,
        'description': A_DESCRIPTION})
    account_id = created.get_json()['account']['id']

    updated = client.put(f'/api/v1/accounts/{account_id}', headers=auth_headers(user),
                         json={'description': 'Now just the bills'})

    assert updated.status_code == 200, updated.get_data(as_text=True)[:300]
    assert db.session.get(Account, account_id).description == 'Now just the bills'


def test_the_description_can_be_cleared(client, db, auth_headers):
    """Emptying a field must work, and must not be confused with omitting it.

    `update_recurring`'s `value is not None` guard is the cautionary sibling here: a
    handler that skips falsy values makes a field un-clearable once set.
    """
    user = UserFactory()
    created = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Shared', 'account_type': 'checking', 'balance': 0,
        'description': A_DESCRIPTION})
    account_id = created.get_json()['account']['id']

    cleared = client.put(f'/api/v1/accounts/{account_id}', headers=auth_headers(user),
                         json={'description': ''})

    assert cleared.status_code == 200, cleared.get_data(as_text=True)[:300]
    assert db.session.get(Account, account_id).description == ''


def test_omitting_the_description_leaves_it_alone(client, db, auth_headers):
    """The inverse of the symptom: a partial update must not wipe it.

    Every existing client omits this field, so a fix that treated absent as empty would
    silently erase descriptions on any unrelated edit.
    """
    user = UserFactory()
    created = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Shared', 'account_type': 'checking', 'balance': 0,
        'description': A_DESCRIPTION})
    account_id = created.get_json()['account']['id']

    client.put(f'/api/v1/accounts/{account_id}', headers=auth_headers(user),
               json={'balance': 42})

    assert db.session.get(Account, account_id).description == A_DESCRIPTION


def test_an_account_created_without_a_description_is_fine(client, db, auth_headers):
    """It is optional, and must stay optional — every current client omits it."""
    user = UserFactory()
    resp = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Solo', 'account_type': 'savings', 'balance': 0})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Account.query.filter_by(user_id=user.id).one()
    assert row.description in (None, '')


def test_an_over_long_description_is_refused_rather_than_truncated(client, db, auth_headers):
    """The declared ceiling must match the column, which is D-123's whole lesson.

    A validator looser than its column converts a clean 400 into a 500 on Postgres while
    SQLite shrugs. `tests/unit/test_validators_fit_their_columns.py` sweeps this class;
    this asserts the behaviour for the new field specifically.
    """
    user = UserFactory()
    resp = client.post('/api/v1/accounts/', headers=auth_headers(user), json={
        'name': 'Solo', 'account_type': 'savings', 'balance': 0,
        'description': 'x' * 5000})

    assert resp.status_code == 400, (
        f'a 5000-character description was accepted: {resp.status_code}'
    )
    assert Account.query.filter_by(user_id=user.id).count() == 0
