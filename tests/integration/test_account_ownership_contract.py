"""Account and portfolio ownership — the foundation of the settled household model.

This is item A of the D-18 build (ROADMAP.md, "The build this implies"). Under the
model the owner settled on 2026-08-06, **ownership sits on the account, not on the
transaction**: accounts and investments are assignable to a member, and a
transaction's attribution derives from the account it belongs to.

**The item description's central premise is wrong, and it is wrong in our favour.**
It reads "an owner on Account and the investment models", and RESUME_PROMPT.txt
warns in capitals that a new column will silently never appear on the deploy because
schema comes from `db.create_all()`. There is no new column. `Account.user_id`
(`src/models/account.py:14`) and `Portfolio.user_id` (`src/models/investment.py:13`)
already exist as non-null FKs to `users.id`, and `Investment` derives ownership
through `portfolio_id`. So item A is a semantics-and-surface change and the
`create_all` hazard does not apply to it at all.

**Two halves, because "passes unchanged" cannot be the proof here.** These routes
are *supposed* to behave differently afterwards, so following
`test_categories_contract.py`:

  * **PINS** — behaviour that must not change. Captured against the current code and
    passing before the change. If one of these flips, the work broke something.
  * **THE FIX** — behaviour that must change. Every `test_fix_*` was watched FAILING
    against the pre-change code. If one of these ever passes before the fix, it is
    testing nothing.
  * **MODEL** — guards that pin the definitions the scope decision rests on, so that
    redefining "household" fails loudly here rather than silently widening a
    permission. Named separately so the claim above stays true. One of the two
    (`test_model_the_household_excludes_demo_accounts`) necessarily fails at
    baseline, because the helper whose distinction it pins does not exist until it
    is promoted out of `CategoryService` — it is a model guard, not a fix, and is
    labelled as such rather than being quietly counted among the fixes.

**Measured baseline before any code changed: 6 pins passed, 17 fixes failed, and the
one model guard above failed.** One assertion written as a pin turned out to be a
fix — see `test_fix_create_refuses_an_outsider` — which is the entire reason for
running the baseline rather than assuming it.

Four things measured during recon on 2026-08-06, each of which changes what is
written here:

1. **The list is household-scoped and the detail is not.** `accounts.py:64` filters
   `user_id.in_(get_all_user_ids())`, while GET/PUT/DELETE `/accounts/<id>` and
   `/balance` all filter `filter_by(id=id, user_id=current_user_id)`. So a housemate
   sees the row in the list and gets a **404 on click**. `api/v1/investments.py` has
   the identical asymmetry for `Portfolio` (list `:71`, detail `:131`, put `:154`,
   delete `:191`) — so this is a class, not an instance. Under "they all see the same
   view" both are household. Filed as **D-43**; AUDIT.md was grepped first and the
   nearby `accounts.py:187` note is a different finding (it picks 404-vs-403 by
   testing whether a message string contains "not found").

2. **`owner_id` is silently dropped with a 201 today.** `validate_request` loads with
   `unknown=EXCLUDE` (`src/utils/validation.py:13`), so a client that sends an owner
   gets a success and the caller's own id on the row. That is D-26's exact shape —
   a field the client sends, discarded with a 2xx — and it is why the fix has to
   assert on the **database row**, not the status code.

3. **Reassignment breaks SimpleFin two different ways, and both are silent.**
   `Account.user_id` currently means both *whose money this is* and *who connected
   the feed*; reassignment splits those meanings apart and there is only one column.
   Dedupe on import is `get_by_external_id(acc['id'], user_id)`
   (`account/service.py:452`) keyed to the caller, so after member A assigns an
   account to B, A's next import finds nothing and **creates a duplicate**. And
   `sync_account` refuses outright at `:506` (`account.user_id != user_id`) while
   `sync_all_accounts` lists only the caller's own (`:605`), so the feed **silently
   stops updating** — B holds the account but has no token, since `SimpleFin.user_id`
   is unique per user. Both are re-keyed to the household here, in the same change,
   because shipping the picker without them ships a duplicate-creating bug.

4. **Widening the detail routes is D-42's exact shape.** `get_all_user_ids()` has no
   `is_demo_user` filter and demo accounts ship with a published password, so
   reaching for it on a mutation path is what made a demo login able to delete the
   real household's categories one hour after D-20 closed. The demo-filtered list
   already exists as `CategoryService.household_user_ids()`; it is promoted to
   `src/utils/household.py` and reused rather than re-derived. **The list route is
   narrowed to match**, because leaving it on `get_all_user_ids()` while the detail
   route excludes demo rows would recreate the very list/detail disagreement this
   change exists to remove — one demo account and you are back to seeing a row you
   cannot open.

**Superseded in part, 2026-08-06:** this file originally asserted that *any*
household member could update or delete a housemate's account. The owner narrowed
mutation to **owner-or-admin** (D-47) hours later; the two affected tests are re-keyed
above to pin what D-43 was really about — the row is *found* and then refused (403),
never hidden (404). Read scope is unchanged and still household-wide. The full
permission matrix lives in `test_account_manage_permissions.py`.

**Not treated as a defect here, deliberately:** reassigning an account
reattributes its whole transaction history, while `Expense.user_id` still records
who entered each row. Those two disagree, and that disagreement is item E's subject
(it is the open `split_with` question). Nothing here reads `Expense.user_id` as
ownership, so E stays free to settle it either way.
"""
import pytest

from src.extensions import db
from src.models.account import Account, SimpleFin
from src.models.investment import Investment, Portfolio
from tests.factories import AccountFactory, UserFactory


# ---------------------------------------------------------------------------
# Fixtures — a household of two, plus a demo account that is on the instance
# but is NOT a household member.
# ---------------------------------------------------------------------------

@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@test.com', name='Bob', password_plain='pw-bob')


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


def _names(payload):
    """The account names in a list response, whichever key it uses."""
    return sorted(a['name'] for a in payload['accounts'])


# ===========================================================================
# MODEL — the definitions the scope decision rests on
# ===========================================================================

def test_model_ownership_needs_no_new_column(db):
    """`Account.user_id` and `Portfolio.user_id` already exist and are non-null.

    This is the premise correction. If someone later "adds ownership" as a new
    column, this fails and points them here — a new column on an existing model
    silently never appears on the deploy, because schema comes from
    `db.create_all()` and there is no `alembic_version`.
    """
    assert 'user_id' in Account.__table__.columns
    assert Account.__table__.columns['user_id'].nullable is False
    assert 'user_id' in Portfolio.__table__.columns
    assert Portfolio.__table__.columns['user_id'].nullable is False

    # And no second column answering the same question has been added.
    for table in (Account.__table__, Portfolio.__table__):
        assert 'owner_id' not in table.columns, (
            'Two columns answering "whose account is this" is the shape this '
            'project keeps getting burned by. Reuse user_id.')


def test_model_the_household_excludes_demo_accounts(db, alice, bob, demo_user):
    """The demo/household distinction, pinned as a distinction rather than a value.

    D-42 was caused by a guard that asserted `get_all_user_ids()` *equals* every
    user and called that "the household definition" — it passed before, during and
    after the privilege escalation. This asserts the two lists **differ**, which is
    the only thing that would have caught it.
    """
    from src.utils.household import get_all_user_ids, household_user_ids

    everyone = set(get_all_user_ids())
    household = set(household_user_ids())

    assert demo_user.id in everyone, 'a demo account is still a row on the instance'
    assert demo_user.id not in household, 'but it is not a household member'
    assert {alice.id, bob.id} <= household
    assert household < everyone, 'the household must be a strict subset'


# ===========================================================================
# PINS — behaviour that must not change
# ===========================================================================

def test_pin_list_is_household_scoped(client, alice_h, alice, bob):
    """A housemate's account appears in the list. This is why the 404 is a defect."""
    AccountFactory(name='Alice Checking', user_id=alice.id)
    AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.get('/api/v1/accounts/', headers=alice_h)
    assert resp.status_code == 200
    assert _names(resp.get_json()) == ['Alice Checking', 'Bob Savings']


def test_pin_list_shape_and_owner_id_field(client, alice_h, alice):
    """The response shape, and that `user_id` is already dumped.

    Item D's per-row "whose account this is" label has a field to bind to today;
    it must keep it.
    """
    AccountFactory(name='Alice Checking', user_id=alice.id)

    body = client.get('/api/v1/accounts/', headers=alice_h).get_json()
    assert body['success'] is True
    account = body['accounts'][0]
    assert account['user_id'] == alice.id
    for field in ('id', 'name', 'account_type', 'balance', 'current_balance'):
        assert field in account


def test_pin_create_defaults_the_owner_to_the_caller(client, alice_h, alice, db):
    """Omitting an owner must keep assigning the account to the caller.

    This is also why `owner_id` must not be documented as required — the
    documentation gate makes the request the document calls invalid and asserts it
    succeeds.
    """
    resp = client.post('/api/v1/accounts/', headers=alice_h, json={
        'name': 'Defaulted', 'account_type': 'checking', 'balance': 10.0,
    })
    assert resp.status_code == 201

    row = Account.query.filter_by(name='Defaulted').one()
    assert row.user_id == alice.id


def test_pin_create_still_validates(client, alice_h):
    """A missing required field is still a 400, and account_type is still an enum."""
    assert client.post('/api/v1/accounts/', headers=alice_h,
                       json={'account_type': 'checking'}).status_code == 400
    assert client.post('/api/v1/accounts/', headers=alice_h,
                       json={'name': 'X', 'account_type': 'nonsense'}).status_code == 400


def test_pin_balance_is_untouched_by_ownership(client, alice_h, alice):
    """None of this may disturb `Account.balance`, which D-25 established is the
    only source of truth and which two separate sessions left unmaintained."""
    AccountFactory(name='Alice Checking', user_id=alice.id, balance=1104.55)

    account = client.get('/api/v1/accounts/', headers=alice_h).get_json()['accounts'][0]
    assert account['balance'] == 1104.55
    assert account['current_balance'] == 1104.55


def test_fix_create_refuses_an_outsider(client, alice_h, alice, bob, db):
    """Household scope is not "anyone" — a user who is not on the instance at all
    cannot be assigned an account.

    **This was written as a pin and the baseline proved it was a fix**, which is the
    reason for running the baseline at all. Today the request answers **201**: the
    unknown `owner_id` is excluded, so the account is created with the caller as
    owner and nothing is refused. There is no existing behaviour here to preserve.
    """
    resp = client.post('/api/v1/accounts/', headers=alice_h, json={
        'name': 'Nope', 'account_type': 'checking',
        'owner_id': 'stranger@elsewhere.com',
    })
    assert resp.status_code == 400
    assert Account.query.filter_by(name='Nope').first() is None


# ===========================================================================
# THE FIX — every one of these was watched FAILING first
# ===========================================================================

def test_fix_create_honours_owner_id(client, alice_h, alice, bob, db):
    """Assign an account to a housemate at creation. The picker's whole point.

    Asserted on the row, not the status code: today this returns **201** and
    silently writes the caller's id, because `validate_request` excludes unknown
    fields.
    """
    resp = client.post('/api/v1/accounts/', headers=alice_h, json={
        'name': 'Bobs Card', 'account_type': 'credit', 'owner_id': bob.id,
    })
    assert resp.status_code == 201

    row = Account.query.filter_by(name='Bobs Card').one()
    assert row.user_id == bob.id, 'the owner picker was ignored'


def test_fix_create_refuses_a_demo_owner(client, alice_h, alice, demo_user, db):
    """A demo account is on the instance but is not a household member."""
    resp = client.post('/api/v1/accounts/', headers=alice_h, json={
        'name': 'Sneaky', 'account_type': 'checking', 'owner_id': demo_user.id,
    })
    assert resp.status_code == 400
    assert Account.query.filter_by(name='Sneaky').first() is None


def test_fix_detail_get_reaches_a_housemates_account(client, alice_h, bob):
    """D-43. The list shows this row; opening it must not 404."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.get(f'/api/v1/accounts/{account.id}', headers=alice_h)
    assert resp.status_code == 200
    assert resp.get_json()['account']['name'] == 'Bob Savings'


def test_fix_detail_put_finds_a_housemates_account_and_then_decides(
        client, alice_h, bob, db):
    """D-43, the write half — **re-keyed, and the reason matters.**

    This originally asserted that any household member could rename a housemate's
    account, because that is what #72 shipped on my stated assumption. **Owner
    decision 2026-08-06 narrowed it to owner-or-admin (D-47)**, so the old assertion
    is now the defect rather than the fix.

    What D-43 was actually about survives, and is what this now pins: the route must
    **find** the row instead of pretending it does not exist. The discriminating
    detail is 403 rather than 404 — a 404 would mean the household read scope had
    been narrowed back and the list would again show a row nothing else can reach.
    """
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=alice_h,
                      json={'name': 'Alice Renamed It'})

    assert resp.status_code == 403, (
        '404 here would mean D-43 regressed: the row is visible in the list, so it '
        'must be found and then refused, not hidden')
    assert db.session.get(Account, account.id).name == 'Bob Savings'


def test_fix_detail_delete_finds_a_housemates_account_and_then_decides(
        client, alice_h, bob, db):
    """D-43, the destructive half — re-keyed for the same reason as the one above.

    Deleting also nulls `account_id` across the account's whole transaction history,
    which is why this is the operation the narrowing matters most for.
    """
    account = AccountFactory(name='Bob Savings', user_id=bob.id)

    resp = client.delete(f'/api/v1/accounts/{account.id}', headers=alice_h)

    assert resp.status_code == 403
    assert db.session.get(Account, account.id) is not None


def test_fix_balance_route_reaches_a_housemates_account(client, alice_h, bob):
    """D-43. `/accounts/<id>/balance` was caller-scoped too."""
    account = AccountFactory(name='Bob Savings', user_id=bob.id, balance=612.40)

    resp = client.get(f'/api/v1/accounts/{account.id}/balance', headers=alice_h)
    assert resp.status_code == 200
    assert resp.get_json()['balance'] == 612.40


def test_fix_put_can_reassign_the_owner(client, alice_h, alice, bob, db):
    """Reassignment, which is what makes the SimpleFin fixes below necessary."""
    account = AccountFactory(name='Alice Checking', user_id=alice.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=alice_h,
                      json={'owner_id': bob.id})
    assert resp.status_code == 200
    assert db.session.get(Account, account.id).user_id == bob.id


def test_fix_put_refuses_reassigning_outside_the_household(
        client, alice_h, alice, demo_user, db):
    account = AccountFactory(name='Alice Checking', user_id=alice.id)

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=alice_h,
                      json={'owner_id': demo_user.id})
    assert resp.status_code == 400
    assert db.session.get(Account, account.id).user_id == alice.id


def test_fix_payload_names_the_owner(client, alice_h, alice, bob):
    """Item D needs a label, not an email. `user_id` is an opaque id; the row has to
    be able to say *Bob* and carry his colour and emoji."""
    bob.user_color = '#123456'
    bob.profile_emoji = '🦊'
    db.session.commit()
    AccountFactory(name='Bob Savings', user_id=bob.id)

    body = client.get('/api/v1/accounts/', headers=alice_h).get_json()
    account = next(a for a in body['accounts'] if a['name'] == 'Bob Savings')

    assert account['owner']['id'] == bob.id
    assert account['owner']['name'] == 'Bob'
    assert account['owner']['color'] == '#123456'
    assert account['owner']['emoji'] == '🦊'


def test_fix_simplefin_import_does_not_duplicate_a_reassigned_account(
        db, alice, bob, monkeypatch):
    """The duplicate-creating bug reassignment would introduce, over the real path.

    Alice imports a SimpleFin account and it is assigned to Bob. Alice imports again.
    Keyed to the caller, the second import matches nothing and writes a **second row
    for the same `external_id`** — silently, reported as an ordinary import.

    Driven through `import_simplefin_accounts` rather than asserted on the repository,
    because the repository taking a scope list is not the bug; the bug is which scope
    the call site passes. The SimpleFin client is stubbed by replacing methods **on
    the class**, not by patching a module-path string — #68's monkeypatch went quiet
    precisely because it was keyed to a path that later moved.
    """
    from integrations.simplefin.client import SimpleFin as SimpleFinClient
    from src.services.account.service import SimpleFinService

    db.session.add(SimpleFin(user_id=alice.id, access_url='https://sf.test/access'))
    db.session.commit()

    remote = {
        'id': 'SF-ACCOUNT-1', 'name': 'Shared Card', 'type': 'credit',
        'institution': 'Test Bank', 'balance': 250.0, 'currency_code': 'USD',
        'color': '#3b82f6',
    }
    monkeypatch.setattr(SimpleFinClient, 'get_accounts_with_transactions',
                        lambda self, url, days_back=1: {'accounts': [remote]})
    monkeypatch.setattr(SimpleFinClient, 'process_raw_accounts',
                        lambda self, raw: [remote])

    service = SimpleFinService()

    ok, message, _ = service.import_simplefin_accounts(alice.id, ['SF-ACCOUNT-1'])
    assert ok, message
    imported = Account.query.filter_by(external_id='SF-ACCOUNT-1').one()

    # The account is assigned to Bob — the whole point of item A.
    imported.user_id = bob.id
    db.session.commit()

    ok, message, _ = service.import_simplefin_accounts(alice.id, ['SF-ACCOUNT-1'])
    assert ok, message

    rows = Account.query.filter_by(external_id='SF-ACCOUNT-1').all()
    assert len(rows) == 1, (
        'the second import created a duplicate account for the same external_id: %r'
        % [(r.id, r.name, r.user_id) for r in rows])
    assert rows[0].user_id == bob.id, 'the import reclaimed a reassigned account'


def test_fix_simplefin_import_assigns_to_the_chosen_member(
        client, alice_h, db, alice, bob, monkeypatch):
    """The assignment step at import — named explicitly by the settled model.

    "similar to when we pull from simplefin we can assign it". Driven through the
    **route**, not the service, because the route is what had no way to express this:
    the handler read only `account_ids`.

    The credential stays the caller's while the account becomes the housemate's, which
    is the distinction the rest of this file exists to protect.
    """
    from integrations.simplefin.client import SimpleFin as SimpleFinClient

    db.session.add(SimpleFin(user_id=alice.id, access_url='https://sf.test/access'))
    db.session.commit()

    remote = {
        'id': 'SF-IMPORT-9', 'name': 'Joint Card', 'type': 'credit',
        'institution': 'Test Bank', 'balance': 42.0, 'currency_code': 'USD',
        'color': '#3b82f6',
    }
    monkeypatch.setattr(SimpleFinClient, 'get_accounts_with_transactions',
                        lambda self, url, days_back=1: {'accounts': [remote]})
    monkeypatch.setattr(SimpleFinClient, 'process_raw_accounts',
                        lambda self, raw: [remote])

    resp = client.post('/api/v1/accounts/simplefin/import', headers=alice_h,
                       json={'account_ids': ['SF-IMPORT-9'], 'owner_id': bob.id})
    assert resp.status_code == 200, resp.get_json()

    row = Account.query.filter_by(external_id='SF-IMPORT-9').one()
    assert row.user_id == bob.id, 'the import ignored the assignment'


def test_fix_simplefin_import_refuses_a_non_member_owner(
        client, alice_h, db, alice, demo_user, monkeypatch):
    """And the same membership rule as every other assignment surface."""
    from integrations.simplefin.client import SimpleFin as SimpleFinClient

    db.session.add(SimpleFin(user_id=alice.id, access_url='https://sf.test/access'))
    db.session.commit()
    monkeypatch.setattr(SimpleFinClient, 'get_accounts_with_transactions',
                        lambda self, url, days_back=1: {'accounts': []})
    monkeypatch.setattr(SimpleFinClient, 'process_raw_accounts',
                        lambda self, raw: [])

    resp = client.post('/api/v1/accounts/simplefin/import', headers=alice_h,
                       json={'account_ids': ['SF-IMPORT-9'],
                             'owner_id': demo_user.id})
    assert resp.status_code == 400
    assert Account.query.filter_by(external_id='SF-IMPORT-9').first() is None


def test_fix_sync_permission_is_household_scoped(db, alice, bob):
    """The silent-stop half. Bob holds the account, Alice holds the token —
    `SimpleFin.user_id` is unique per user, so if this stays caller-scoped a
    reassigned account can never be synced by anyone: its owner has no credential
    and the credential holder is refused."""
    from src.services.account.service import SimpleFinService

    account = AccountFactory(name='Shared Card', user_id=bob.id,
                             import_source='simplefin', external_id='SF-ACCOUNT-1')

    success, message, _ = SimpleFinService().sync_account(account.id, alice.id)
    assert 'Permission denied' not in message, (
        'a household member must be allowed to sync a household account')


def test_fix_sync_all_covers_the_household(db, alice, bob):
    """`sync_all_accounts` listed only the caller's own SimpleFin accounts, so a
    reassigned account dropped out of every sync.

    Asserted on which accounts the sync actually reached — the per-account results —
    rather than on the repository call, so it stays true of the behaviour and not of
    one function signature.
    """
    from src.services.account.service import SimpleFinService

    AccountFactory(name='Bobs Feed', user_id=bob.id,
                   import_source='simplefin', external_id='SF-ACCOUNT-2')

    _, message, results = SimpleFinService().sync_all_accounts(alice.id)

    assert results, 'no accounts were considered: %s' % message
    assert 'Bobs Feed' in [r['account_name'] for r in results], (
        "a household member's SimpleFin account was not reached by the sync")


def test_fix_demo_account_cannot_reach_the_household(client, demo_h, alice, db):
    """D-42, in its new location. The sandbox is symmetric: a demo visitor must not
    read or delete the household's accounts."""
    account = AccountFactory(name='Alice Checking', user_id=alice.id)

    assert client.get(f'/api/v1/accounts/{account.id}',
                      headers=demo_h).status_code in (403, 404)
    client.delete(f'/api/v1/accounts/{account.id}', headers=demo_h)
    assert db.session.get(Account, account.id) is not None, (
        'a demo account deleted a real household account')

    body = client.get('/api/v1/accounts/', headers=demo_h).get_json()
    assert 'Alice Checking' not in _names(body)


def test_fix_demo_account_still_sees_its_own(client, demo_h, demo_user):
    """The other direction of the sandbox — the tour has to work."""
    AccountFactory(name='Demo Wallet', user_id=demo_user.id)

    body = client.get('/api/v1/accounts/', headers=demo_h).get_json()
    assert _names(body) == ['Demo Wallet']


def test_fix_demo_accounts_are_absent_from_the_household_list(
        client, alice_h, alice, demo_user):
    """And the list is narrowed to match the detail route, or one demo account puts
    a row in the list that its owner cannot open — the exact defect being fixed."""
    AccountFactory(name='Alice Checking', user_id=alice.id)
    AccountFactory(name='Demo Wallet', user_id=demo_user.id)

    body = client.get('/api/v1/accounts/', headers=alice_h).get_json()
    assert _names(body) == ['Alice Checking']


# --- Portfolios: the identical asymmetry, so the identical fixes -------------

def test_fix_portfolio_create_honours_owner_id(client, alice_h, bob, db):
    resp = client.post('/api/v1/investments/portfolios', headers=alice_h, json={
        'name': 'Bobs Portfolio', 'owner_id': bob.id,
    })
    assert resp.status_code in (200, 201)

    row = Portfolio.query.filter_by(name='Bobs Portfolio').one()
    assert row.user_id == bob.id


def test_fix_portfolio_detail_reaches_a_housemates(client, alice_h, bob, db):
    portfolio = Portfolio(name='Bob Retirement', user_id=bob.id)
    db.session.add(portfolio)
    db.session.commit()

    resp = client.get(f'/api/v1/investments/portfolios/{portfolio.id}',
                      headers=alice_h)
    assert resp.status_code == 200


def test_fix_everything_hanging_off_a_portfolio_is_scoped_the_same_way(
        client, alice_h, bob, db):
    """Widening the portfolio routes alone would have moved the asymmetry, not fixed it.

    Seven further sites join through `Portfolio.user_id == current_user_id`: the
    holdings list, adding a holding, the holding detail/update/delete, and the
    investment-transactions list and create. Leaving those caller-scoped means a
    housemate's portfolio **opens** and every holding inside it 404s — D-43
    reintroduced one level down by D-43's own fix, which is exactly how D-42 happened.

    Keyed to the routes rather than to the query text, and it asserts the *holding* is
    visible rather than only a status, because a 200 with an empty list would pass a
    status check while hiding the same bug.
    """
    portfolio = Portfolio(name='Bob Retirement', user_id=bob.id)
    db.session.add(portfolio)
    db.session.commit()

    investment = Investment(portfolio_id=portfolio.id, symbol='VWRL',
                            name='Vanguard All-World', shares=10,
                            purchase_price=100.0)
    db.session.add(investment)
    db.session.commit()

    listed = client.get('/api/v1/investments/holdings', headers=alice_h)
    assert listed.status_code == 200
    body = listed.get_json()
    symbols = [h['symbol'] for h in (body.get('holdings') or body.get('investments') or [])]
    assert 'VWRL' in symbols, (
        "a housemate's holding is invisible while their portfolio is visible: %r" % body)

    detail = client.get(f'/api/v1/investments/holdings/{investment.id}',
                        headers=alice_h)
    assert detail.status_code == 200, detail.get_json()
