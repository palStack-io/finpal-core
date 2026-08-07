"""Transaction attribution and the household/member filter — items B and D of D-18.

Under the model the owner settled on 2026-08-06, **a row belongs to whoever owns its
account, full stop**. `split_with` stays in the product for settling up — the group
and settlement screens still read it — but it no longer answers "whose transaction is
this". A row Alice paid for on her card and split with Bob appears under **Alice**,
never under Bob.

That is a behaviour change to the main transactions list, so following
`test_account_ownership_contract.py`, this file is in three parts:

  * **MODEL** — the definitions the scope decision rests on. If someone later
    redefines attribution, these fail loudly rather than silently re-scoping money.
  * **PINS** — behaviour that must NOT change, captured against the pre-change code
    and passing before it. Two of them are the "nobody loses a capability" guards
    behind the mutation rule, and one is the demo-isolation guard that keeps D-42
    closed.
  * **THE FIX** — behaviour that must change. Every `test_fix_*` was watched FAILING
    against the pre-change code. "Passes unchanged" cannot be the proof when the
    route is supposed to change.

Four things measured during recon on 2026-08-06, each of which changed what is
written here:

1. **`_transactions_for_user()` (`api/v1/transactions.py:54`) is
   `Expense.user_id == me OR split_with contains me`.** So `split_with` decides what
   the transactions page shows *today*, and D cannot add a member filter without
   replacing that clause. Three read sites share it: the list (`:137`), the detail
   GET (`:263`) and `/recent` (`:492`).

2. **PUT (`:288`) and DELETE (`:458`) do NOT share it** — both are
   `filter_by(id=id, user_id=current_user_id)`. The moment the list goes
   household-wide, that is **D-43 all over again**: a row you can see and cannot
   open. They are re-keyed here, in the same change, because shipping the list
   without them ships the bug D-43 just closed.

3. **`can_manage_owned` returns False when `owner_id` is falsy** (its first line).
   `Expense.account_id` is nullable and `AccountRepository.nullify_account_on_
   transactions` (`src/repositories/account.py:102`) nulls it across an account's
   entire history on delete — so orphaned rows are reachable and permanent. Gating
   mutation on the account owner ALONE would make every orphan uneditable and
   undeletable by everyone, including the person who entered it. That is why the
   rule is owner-or-admin **OR the person who entered the row**, and why
   `test_pin_an_orphaned_row_stays_editable_by_its_creator` is a pin rather than a
   fix: it passes today, and it is exactly what a naive port of D-47 would break.

4. **The deploy's orphan count told us nothing.** `select count(*) - count(account_id)
   from expenses` returned 0 — out of 2 rows, on the test account's database. The
   rule for account-less rows was decided on reachability (point 3), not on that
   count.

**Measured baseline before any code changed:** see the checkpoint in ROADMAP.md.
"""

import pytest

from src.extensions import db
from src.models.account import Account
from src.models.transaction import Expense
from tests.factories import AccountFactory, ExpenseFactory, UserFactory


# ---------------------------------------------------------------------------
# Fixtures — a household of two, plus a demo account that is on the instance
# but is NOT a household member.
# ---------------------------------------------------------------------------

@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice',
                       is_admin=False)


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@test.com', name='Bob', password_plain='pw-bob',
                       is_admin=False)


@pytest.fixture
def demo_user(db):
    return UserFactory(id='demo1@finpal.demo', name='Demo',
                       is_demo_user=True, password_plain='pw-demo')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def bob_h(client, auth_headers, bob):
    return auth_headers(bob, password='pw-bob')


@pytest.fixture
def demo_h(client, auth_headers, demo_user):
    return auth_headers(demo_user, password='pw-demo')


def _row(owner, entered_by=None, **kw):
    """A transaction on `owner`'s account, entered by `entered_by` (default owner).

    The two are deliberately separable: `account.user_id` is whose money it is and
    `Expense.user_id` is who typed the row in, and the whole point of the settled
    model is that those are different questions.
    """
    account = kw.pop('account', None) or AccountFactory(user_id=owner.id)
    return ExpenseFactory(user_id=(entered_by or owner).id,
                          account_id=account.id, **kw)


def _descriptions(payload):
    return sorted(t['description'] for t in payload['transactions'])


def _get(client, headers, **params):
    qs = '&'.join(f'{k}={v}' for k, v in params.items())
    return client.get(f'/api/v1/transactions/?{qs}' if qs else '/api/v1/transactions/',
                      headers=headers)


# ===========================================================================
# MODEL — the definitions the scope decision rests on
# ===========================================================================

def test_model_attribution_lives_on_the_account(db):
    """Whose money a row is comes from `Account.user_id`, which is NOT NULL.

    If this ever becomes nullable, the orphan rule below silently starts catching
    rows that DO have an account, and every member's list quietly widens.
    """
    assert Account.__table__.c.user_id.nullable is False
    assert Expense.__table__.c.account_id.nullable is True, (
        'account_id is nullable — that is why an orphan rule exists at all')


def test_model_the_three_fields_still_mean_three_different_things(db):
    """`account.owner`, `Expense.user_id` and `paid_by` are not interchangeable.

    account.owner  = whose money it is    (attribution)
    Expense.user_id = who entered the row (audit trail)
    paid_by         = who fronted the cash (settlement)

    Collapsing any two reintroduces the two-sources-of-truth problem the settled
    model exists to remove. `paid_by` being a String is load-bearing: it is
    documented as an Integer in the flask-restx model, which is D-48.
    """
    assert Expense.__table__.c.user_id.nullable is False
    assert Expense.__table__.c.paid_by.nullable is False
    assert Expense.__table__.c.paid_by.type.python_type is str


def test_model_orphans_are_reachable_not_theoretical(db, alice):
    """Deleting an account nulls `account_id` across its whole transaction history.

    This is the reachability argument that decided the orphan rule. It is pinned
    because if the repository ever starts cascading the delete instead, the orphan
    branch becomes dead code and should be removed deliberately, not left to rot.
    """
    from src.repositories.account import AccountRepository

    account = AccountFactory(user_id=alice.id)
    expense = ExpenseFactory(user_id=alice.id, account_id=account.id)

    AccountRepository().nullify_account_on_transactions(account.id)
    db.session.commit()
    db.session.refresh(expense)

    assert expense.account_id is None


# ===========================================================================
# PINS — behaviour that must not change
# ===========================================================================

def test_pin_a_caller_still_sees_their_own_rows(client, alice_h, alice):
    _row(alice, description='Alice groceries')

    resp = _get(client, alice_h)

    assert resp.status_code == 200
    assert _descriptions(resp.get_json()) == ['Alice groceries']


def test_pin_a_demo_caller_sees_only_its_own_rows(client, demo_h, demo_user, alice):
    """D-42's guard, one level down.

    The scope must come from `visible_user_ids(caller)`, which collapses to the
    caller alone for a demo account — NOT from `household_user_ids()`. A demo login
    ships with a published password, so widening this puts the real household's
    money behind credentials that are in the repository.
    """
    _row(alice, description='Household rent')
    _row(demo_user, description='Demo coffee')

    resp = _get(client, demo_h)

    assert resp.status_code == 200
    assert _descriptions(resp.get_json()) == ['Demo coffee']


def test_pin_the_person_who_entered_a_row_may_still_edit_it(
        client, bob_h, alice, bob):
    """Bob typed a row in against Alice's card. He can still fix his own typo.

    A literal port of D-47 — owner-or-admin only — would take this away, which is a
    NEW restriction rather than a port. Nobody loses a capability they have today.
    """
    expense = _row(alice, entered_by=bob, description='Bob typo')

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=bob_h, json={'description': 'Bob fixed'})

    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Bob fixed'


def test_pin_an_orphaned_row_stays_editable_by_its_creator(client, bob_h, bob):
    """The trap in point 3 of this file's docstring, pinned.

    `can_manage_owned(None, caller)` is False for every caller. If mutation were
    gated on the account owner alone, deleting an account would permanently freeze
    its entire transaction history — for everyone, including whoever entered it.
    """
    expense = ExpenseFactory(user_id=bob.id, account_id=None,
                             description='Orphan')

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=bob_h, json={'description': 'Orphan edited'})

    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Orphan edited'


def test_pin_the_search_filter_is_still_applied_server_side(client, alice_h, alice):
    """The page was fixed once for exactly this: it used to load the whole history
    and filter in the browser, so its three summary cards described all time no
    matter what was on screen. The member filter must not undo that.
    """
    _row(alice, description='Coffee')
    _row(alice, description='Rent')

    resp = _get(client, alice_h, search='Cof')

    assert _descriptions(resp.get_json()) == ['Coffee']


def test_pin_the_summary_totals_still_exclude_transfers(client, alice_h, alice):
    _row(alice, description='Pay', amount=100.0, transaction_type='income')
    _row(alice, description='Food', amount=30.0, transaction_type='expense')
    _row(alice, description='Move', amount=500.0, transaction_type='transfer')

    summary = _get(client, alice_h).get_json()['summary']

    assert summary['total_income'] == 100.0
    assert summary['total_expense'] == 30.0


def test_pin_a_missing_transaction_is_still_a_404(client, alice_h, alice):
    """404 stays 404 for a row that does not exist. Only *refusal* becomes 403 —
    the distinction is the whole point of "found, then refused".
    """
    assert client.get('/api/v1/transactions/999999',
                      headers=alice_h).status_code == 404


# ===========================================================================
# THE FIX — behaviour that must change
# ===========================================================================

def test_fix_the_list_shows_a_housemates_row(client, alice_h, alice, bob):
    """The core of D. Before: Alice saw only rows she entered or was split with."""
    _row(alice, description='Alice groceries')
    _row(bob, description='Bob petrol')

    resp = _get(client, alice_h)

    assert _descriptions(resp.get_json()) == ['Alice groceries', 'Bob petrol']


def test_fix_attribution_comes_from_the_account_not_split_with(
        client, alice_h, alice, bob):
    """The owner decision, made observable.

    A row Bob paid for on HIS card and split with Alice belongs to **Bob**. Under
    the old clause Alice's list matched it through `split_with`; under the new one
    it is Bob's, and filtering to Alice must not return it.
    """
    _row(bob, description='Bob dinner', split_with=alice.id, split_method='equal')

    to_alice = _get(client, alice_h, member_id=alice.id)
    to_bob = _get(client, alice_h, member_id=bob.id)

    assert _descriptions(to_alice.get_json()) == []
    assert _descriptions(to_bob.get_json()) == ['Bob dinner']


def test_fix_split_with_no_longer_reaches_a_demo_account(
        client, demo_h, demo_user, alice):
    """`split_with` was a second, un-scoped route into the household's rows.

    A household row naming a demo account in `split_with` was visible to that demo
    login. Attribution by account closes it: the row is on Alice's account, so it is
    Alice's, and the published-password sandbox cannot see it.
    """
    _row(alice, description='Household rent',
         split_with=demo_user.id, split_method='equal')

    assert _descriptions(_get(client, demo_h).get_json()) == []


def test_fix_the_member_filter_narrows_to_one_members_accounts(
        client, alice_h, alice, bob):
    _row(alice, description='Alice groceries')
    _row(bob, description='Bob petrol')

    resp = _get(client, alice_h, member_id=bob.id)

    assert resp.status_code == 200
    assert _descriptions(resp.get_json()) == ['Bob petrol']


def test_fix_the_summary_totals_follow_the_member_filter(
        client, alice_h, alice, bob):
    """The three cards describe the rows on screen, or they are lying.

    `_totals_for` runs over the whole filtered query, so this follows from the
    filter being applied to the query rather than the page — which is what keeps
    D-01's retirement honest.
    """
    _row(alice, description='Alice food', amount=30.0, transaction_type='expense')
    _row(bob, description='Bob petrol', amount=45.0, transaction_type='expense')

    both = _get(client, alice_h).get_json()['summary']
    just_bob = _get(client, alice_h, member_id=bob.id).get_json()['summary']

    assert both['total_expense'] == 75.0
    assert just_bob['total_expense'] == 45.0


def test_fix_the_member_filter_refuses_an_id_outside_the_household(
        client, alice_h, alice):
    """403, not an empty list and not a 404.

    An empty list is indistinguishable from "that member has no transactions", so
    a typo'd id would read as a real answer.
    """
    resp = _get(client, alice_h, member_id='nobody@example.com')

    assert resp.status_code == 403
    assert 'error' in resp.get_json()


def test_fix_a_demo_caller_cannot_filter_to_a_real_member(
        client, demo_h, demo_user, alice):
    """The filter parameter must be intersected with `visible_user_ids(caller)`.

    Without that, a demo login reads the household's rows by passing an id — the
    filter becomes a way around the scope it is supposed to sit inside.
    """
    _row(alice, description='Household rent')

    resp = _get(client, demo_h, member_id=alice.id)

    assert resp.status_code == 403
    assert _descriptions(_get(client, demo_h).get_json()) == []


def test_fix_detail_get_reaches_a_housemates_row(client, alice_h, bob):
    """D-43's shape: a row you can see in the list must open."""
    expense = _row(bob, description='Bob petrol')

    resp = client.get(f'/api/v1/transactions/{expense.id}', headers=alice_h)

    assert resp.status_code == 200
    assert resp.get_json()['transaction']['description'] == 'Bob petrol'


def test_fix_detail_put_finds_a_housemates_row_and_then_refuses(
        client, alice_h, alice, bob):
    """403, never 404. A 404 here would mean the read scope silently narrowed."""
    expense = _row(bob, description='Bob petrol')

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=alice_h, json={'description': 'Hijacked'})

    assert resp.status_code == 403, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Bob petrol'


def test_fix_detail_delete_finds_a_housemates_row_and_then_refuses(
        client, alice_h, bob):
    expense = _row(bob, description='Bob petrol')

    resp = client.delete(f'/api/v1/transactions/{expense.id}', headers=alice_h)

    assert resp.status_code == 403, resp.get_json()
    assert db.session.get(Expense, expense.id) is not None


def test_fix_an_admin_may_edit_a_housemates_row(client, auth_headers, db, bob):
    """Owner-or-admin, ported from D-47's `can_manage_owned`."""
    admin = UserFactory(id='admin@test.com', name='Admin',
                        password_plain='pw-admin', is_admin=True)
    headers = auth_headers(admin, password='pw-admin')
    expense = _row(bob, description='Bob petrol')

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=headers, json={'description': 'Admin corrected'})

    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Admin corrected'


def test_fix_the_account_owner_may_edit_a_row_a_housemate_entered(
        client, alice_h, alice, bob):
    """It is Alice's money, so it is Alice's row even though Bob typed it in."""
    expense = _row(alice, entered_by=bob, description='Bob entered this')

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=alice_h, json={'description': 'Alice corrected'})

    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Alice corrected'


def test_fix_an_orphaned_row_is_attributed_to_whoever_entered_it(
        client, alice_h, alice, bob):
    """Owner decision: account-less rows fall back to `Expense.user_id`.

    It is the only non-null field that can carry them. They appear in the household
    view and under their creator, and nowhere else.
    """
    ExpenseFactory(user_id=bob.id, account_id=None, description='Bob orphan')

    household = _get(client, alice_h)
    as_bobs = _get(client, alice_h, member_id=bob.id)
    as_alices = _get(client, alice_h, member_id=alice.id)

    assert _descriptions(household.get_json()) == ['Bob orphan']
    assert _descriptions(as_bobs.get_json()) == ['Bob orphan']
    assert _descriptions(as_alices.get_json()) == []


def test_fix_recent_covers_the_household(client, alice_h, alice, bob):
    """`/recent` shares the base query, so it moves whether we intend it or not.

    Asserted deliberately rather than left to fall out, because the dashboard's
    other figures stay caller-scoped until item E and this is the one strip that
    changes.
    """
    _row(bob, description='Bob petrol')

    resp = client.get('/api/v1/transactions/recent', headers=alice_h)

    assert resp.status_code == 200
    assert 'Bob petrol' in [t['description'] for t in resp.get_json()['transactions']]


def test_fix_csv_export_covers_the_household(client, alice_h, alice, bob):
    """`accounts.py:569` is `filter_by(user_id=caller)` — D-43's shape in a second
    file. Without this, exporting a housemate's account returns an empty file.
    """
    _row(bob, description='Bob petrol')

    resp = client.get('/api/v1/accounts/export-csv', headers=alice_h)

    assert resp.status_code == 200
    assert 'Bob petrol' in resp.get_data(as_text=True)


def test_fix_editing_a_housemates_row_does_not_trip_the_paid_by_rule(
        client, alice_h, alice, bob):
    """**D-49**, and it was found by the admin/owner tests above, not predicted.

    `TransactionDetail.put` re-validates the row's *existing* `paid_by` after every
    edit, and `validate_paid_by` used to require it to equal the caller whenever the
    row was not in a group. So permission passed, and then a stale caller-scoped
    invariant refused the write — with a `paid_by` error naming a field the caller
    never sent. Asserted on the error body rather than the status, because a 400
    here is indistinguishable from ordinary validation.
    """
    expense = _row(alice, entered_by=bob, description='Bob entered this')
    assert expense.paid_by == bob.id

    resp = client.put(f'/api/v1/transactions/{expense.id}',
                      headers=alice_h, json={'description': 'Alice corrected'})

    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(expense)
    assert expense.description == 'Alice corrected'
    assert expense.paid_by == bob.id, 'who fronted the cash is unchanged by an edit'


def test_pin_paid_by_still_refuses_someone_outside_the_household(
        client, alice_h, alice, demo_user):
    """D-49 widened the boundary to the household. It must not widen past it.

    A demo account is on the instance but is NOT a household member, and it signs in
    with a password published in this repository. `visible_user_ids` is what keeps
    that true; `get_all_user_ids` would not, which is why the original rule refused
    the household boundary outright.
    """
    account = AccountFactory(user_id=alice.id)

    resp = client.post('/api/v1/transactions/', headers=alice_h, json={
        'description': 'Attributed to the sandbox', 'amount': 10.0,
        'date': '2026-08-06', 'account_id': account.id,
        'transaction_type': 'expense', 'paid_by': demo_user.id,
    })

    assert resp.status_code == 400
    assert 'paid_by' in resp.get_json()['details']


def test_fix_paid_by_is_documented_as_the_type_it_actually_is(db):
    """**D-48.** `api/v1/transactions.py:110` declares `fields.Integer` while the
    column is `String(50)`. A generated client sends an int. Same class as #68/#69.
    """
    from api.v1.transactions import transaction_model
    from flask_restx import fields as restx_fields

    assert isinstance(transaction_model['paid_by'], restx_fields.String)


def test_fix_the_payload_names_whose_account_each_row_is(client, alice_h, bob):
    """The per-row label is free: `TransactionSchema` nests `AccountSchema`, and #72
    put `owner` on the latter. Pinned so that a schema tidy-up cannot quietly remove
    the only thing the label reads.
    """
    _row(bob, description='Bob petrol')

    payload = _get(client, alice_h).get_json()
    owner = payload['transactions'][0]['account']['owner']

    assert owner['id'] == bob.id
    assert owner['name'] == 'Bob'
