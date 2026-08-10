"""D-81 — in demo mode an account could not be edited at all.

Change a balance on `/accounts`, press **Update Account**, and the request answered
**400 "Owner must be a member of this household"** while the database kept the old value.
Nothing was being reassigned: `pages/Accounts.tsx:65` pre-fills the edit form with
`ownerId: acc.user_id`, and `EditAccountForm.tsx:100` sends `owner_id` whenever that is
non-empty — for an existing account, always. `api/v1/accounts.py` then refused it through
`is_household_member()`, which is **False for a demo account by design**.

*** THE FIX IS SERVER-SIDE BECAUSE THE HANDLER WAS INCONSISTENT WITH ITS OWN SIBLINGS, AND
READING THEM IS WHAT SETTLED IT. *** Both other owner-assignment sites already short-circuit
when the owner is not changing — `AccountService.create_account` guards with
`if owner_id and owner_id != user_id`, and the SimpleFin import with `if owner != user_id` —
and `can_manage_owned` states the same rule outright (`if owner_id == caller_id: return
True`). Only the PUT handler asked "is this id a household member?" without first asking
"is this a reassignment at all?". So a client-side patch would have left the API refusing a
no-op reassignment for every other caller; **the filed row named the wrong line
(`account/service.py:88`) and the wrong side** — corrected here.

**A no-op is not a privilege.** Assigning an account to whoever already owns it grants
nothing, which is why the membership check is the wrong question for it. Reassignment to
anyone else is untouched, and the tests below hold that line: D-42's lesson is that a
published demo password must never reach household property.
"""
from src.extensions import db as _db
from src.models.account import Account
from tests.factories import UserFactory


def _account(owner, name='Primary Checking', balance=5000.0):
    # The column is `type`, not `account_type` -- the API's INPUT field is
    # `account_type` and the model's attribute is `type`, which is worth knowing before
    # writing a fixture against either.
    acc = Account(name=name, type='checking', balance=balance,
                  user_id=owner.id, currency_code='USD')
    _db.session.add(acc)
    _db.session.commit()
    return acc


def _web_ui_payload(acc, owner_id, balance):
    """What `EditAccountForm.tsx:90-101` actually sends, including `owner_id`.

    Written as the browser's payload rather than a minimal body so it keeps testing the
    real request; `account_number` is in here because the form sends it and the schema
    drops it with `unknown=EXCLUDE` (D-05).
    """
    return {'name': acc.name, 'account_type': 'checking', 'balance': balance,
            'currency_code': 'USD', 'institution': 'Manual', 'account_number': 'N/A',
            'color': 'var(--accent-blue)', 'owner_id': owner_id}


def test_a_demo_account_can_edit_its_own_account(client, db, auth_headers):
    """The reported defect, asserted on the row rather than the status code."""
    demo = UserFactory(is_demo_user=True)
    acc = _account(demo)

    resp = client.put(f'/api/v1/accounts/{acc.id}', headers=auth_headers(demo),
                      json=_web_ui_payload(acc, demo.id, 999.99))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    _db.session.expire_all()
    assert float(Account.query.get(acc.id).balance) == 999.99
    assert Account.query.get(acc.id).user_id == demo.id


def test_a_real_user_can_edit_its_own_account_with_owner_id_echoed_back(
        client, db, auth_headers):
    """The same no-op reassignment for a non-demo caller.

    This passed before the fix — `is_household_member()` is True for a real user — and is
    here so the change is pinned as "a no-op is allowed" rather than "demo accounts are
    special", which is what a demo-only test would have implied.
    """
    user = UserFactory()
    acc = _account(user, 'Savings', 100.0)

    resp = client.put(f'/api/v1/accounts/{acc.id}', headers=auth_headers(user),
                      json=_web_ui_payload(acc, user.id, 250.0))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    _db.session.expire_all()
    assert float(Account.query.get(acc.id).balance) == 250.0


def test_reassigning_to_a_demo_account_is_still_refused(client, db, auth_headers):
    """The boundary, and the reason this fix is a short-circuit and not a deletion.

    A real member handing household property to a demo persona is D-42 exactly. If this
    ever passes, the fix has been over-applied.
    """
    real = UserFactory()
    demo = UserFactory(is_demo_user=True)
    acc = _account(real, 'Household Checking', 400.0)

    resp = client.put(f'/api/v1/accounts/{acc.id}', headers=auth_headers(real),
                      json=_web_ui_payload(acc, demo.id, 400.0))

    assert resp.status_code == 400, resp.get_data(as_text=True)[:300]
    assert 'household' in str(resp.get_json()).lower()
    _db.session.expire_all()
    assert Account.query.get(acc.id).user_id == real.id, 'the account was reassigned anyway'


def test_reassigning_to_an_id_that_is_not_on_the_instance_is_still_refused(
        client, db, auth_headers):
    """The other half of the same refusal — a stranger's id, refused the same way,
    which is what `is_household_member`'s docstring promises."""
    real = UserFactory()
    acc = _account(real, 'Current', 10.0)

    resp = client.put(f'/api/v1/accounts/{acc.id}', headers=auth_headers(real),
                      json=_web_ui_payload(acc, 'nobody@example.com', 10.0))

    assert resp.status_code == 400
    _db.session.expire_all()
    assert Account.query.get(acc.id).user_id == real.id


def test_a_demo_account_cannot_reassign_its_account_to_a_real_member(
        client, db, auth_headers):
    """The sandbox in the other direction: a demo must not push its rows into the
    household either, or the tour leaks data into real members' totals."""
    real = UserFactory()
    demo = UserFactory(is_demo_user=True)
    acc = _account(demo, 'Demo Checking', 20.0)

    resp = client.put(f'/api/v1/accounts/{acc.id}', headers=auth_headers(demo),
                      json=_web_ui_payload(acc, real.id, 20.0))

    assert resp.status_code in (400, 403), resp.get_data(as_text=True)[:300]
    _db.session.expire_all()
    assert Account.query.get(acc.id).user_id == demo.id
