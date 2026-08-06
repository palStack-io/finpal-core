"""The categories contract, in two halves — what the port must preserve, and D-20.

`src/services/category/api_routes.py` is the last plain-Flask blueprint. It owns
five rules; restx owns only the collection at `/` . Because
`url_map.strict_slashes = False`, the collection exists **twice** with two
different implementations, and each client reaches a different one — that is D-20,
and `_KNOWN_DUPLICATE_ROUTES` exists to stop a port from settling it by accident.

**It is no longer an accident.** Owner decision 2026-08-06, recorded at the bottom
of ROADMAP.md: a household is the instance, ownership sits on the *account*, and
"budget, categories and rest is for household". So categories are household
property, this convergence is the ruling rather than a side effect, and D-20 closes.

**This file is deliberately in two halves, because "passes unchanged" cannot be the
proof here the way it was for the auth port.** Some of these routes must behave
*differently* afterwards. Mixing the two would destroy the property that makes an
oracle worth having, so they are labelled:

  * **PINS** — behaviour the port must not change. Captured against the current
    code and passing before the port; if one of these changes, the port broke
    something.
  * **THE FIX** — behaviour that must change, i.e. D-20. **All ten `test_fix_*`
    assertions were watched FAILING against the pre-port code**, which is the red
    test a defect fix is supposed to start from. If one of these ever passes before
    the fix, it is testing nothing. Measured baseline: 21 pins passed, 10 fixes
    failed. One of them, `persists_the_colour`, failed on the **trailing-slash**
    spelling only and passed on the slash-less one — which is exactly the evidence
    that restx drops `color` while the blueprint stores it.
  * **MODEL** — one `test_model_*` guard, which passes now and always should. It
    is not a fix and is named so that the claim above stays true; it pins the
    definition the scope decision rests on, so that changing what a "household"
    means fails loudly here.

Three things measured during recon, each of which changes what is written here:

1. **`GET /categories` (no slash) is per-user; `GET /categories/` is household.**
   web-ui sends the first, mobile the second, so the two clients genuinely see
   different rows. The shapes differ too: `{categories}` with six fields per item
   versus `{success, categories}` with eight.
2. **restx's `POST` silently drops `color`.** `CategoryInput` validates the field
   and `CategoryList.post` never passes it to `Category(...)`, while the
   blueprint's `create_category` does persist it. After the blueprint is deleted
   restx serves *both* spellings, so carrying `color` over is **preserving**
   behaviour for the slash-less caller, not adding a feature.
3. **The detail route is per-user while the list mobile sees is household-wide.**
   So mobile can list a category and get 403 opening it — the list and the detail
   of one resource disagreeing about who owns it. Under the settled model both are
   household.

**Not treated as a defect, deliberately:** both clients read
`response.data.category` from create/update/detail, and no handler on either
surface returns a `category` key for those — so those reads are `undefined` today.
It is **dead code on both sides**: web-ui's `Categories.tsx` only lists and
deletes, and no mobile screen uses `useCategory`/`useCreateCategory`/
`useUpdateCategory`. Nothing is on screen, so it is noted in AUDIT.md rather than
filed, and the shapes below stay as they are. Following #64, which declined to
normalise `POST /groups/<id>/members` onto its sibling's convention during a port:
a port changes routing, not contracts. 1c regenerates the service layer and is
where that reconciliation belongs.
"""
import pytest

from src.extensions import db as _db
from src.models.category import Category
from tests.factories import UserFactory

BOTH_SPELLINGS = pytest.mark.parametrize('slash', ['', '/'],
                                         ids=['no-slash', 'trailing-slash'])

DETAIL_FIELDS = {'id', 'name', 'icon', 'color', 'parent_id', 'is_system'}


@pytest.fixture
def me(db):
    return UserFactory()


@pytest.fixture
def housemate(db):
    """A second user on the instance — which, per the settled model, IS a household."""
    return UserFactory()


@pytest.fixture
def headers(me, auth_headers):
    return auth_headers(me)


def _make_category(owner, name, **kwargs):
    category = Category(name=name, user_id=owner.id,
                        icon=kwargs.pop('icon', 'fa-tag'),
                        color=kwargs.pop('color', '#6c757d'), **kwargs)
    _db.session.add(category)
    _db.session.commit()
    return category


# =============================================================================
# PINS — the port must not change any of this
# =============================================================================

@BOTH_SPELLINGS
def test_pin_get_one_category_returns_a_bare_six_field_dict(
        client, db, me, headers, slash):
    """No envelope, no `success`, no `category` key — just the fields."""
    category = _make_category(me, 'Groceries', color='#112233')

    resp = client.get(f'/api/v1/categories/{category.id}{slash}', headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json() == {
        'id': category.id,
        'name': 'Groceries',
        'icon': 'fa-tag',
        'color': '#112233',
        'parent_id': None,
        'is_system': False,
    }


@BOTH_SPELLINGS
def test_pin_get_a_missing_category_is_404(client, db, me, headers, slash):
    resp = client.get(f'/api/v1/categories/999999{slash}', headers=headers)
    assert resp.status_code == 404
    assert resp.get_json() == {'error': 'Category not found'}


@BOTH_SPELLINGS
def test_pin_the_detail_route_requires_a_token(client, db, me, slash):
    category = _make_category(me, 'Groceries')
    assert client.get(
        f'/api/v1/categories/{category.id}{slash}').status_code == 401


@BOTH_SPELLINGS
def test_pin_update_answers_with_a_bare_message(client, db, me, headers, slash):
    category = _make_category(me, 'Old Name')

    resp = client.put(f'/api/v1/categories/{category.id}{slash}',
                      headers=headers, json={'name': 'New Name'})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert set(body) == {'message'}
    # Asserted on the row, not the echo.
    assert Category.query.get(category.id).name == 'New Name'


@BOTH_SPELLINGS
def test_pin_patch_behaves_exactly_like_put(client, db, me, headers, slash):
    """The blueprint shares one decorator between PUT and PATCH.

    restx needs them spelled out separately, so this is the assertion that
    catches a port which only wires up one of them.
    """
    a = _make_category(me, 'A')
    b = _make_category(me, 'B')

    put = client.put(f'/api/v1/categories/{a.id}{slash}', headers=headers,
                     json={'name': 'Renamed'})
    patch = client.patch(f'/api/v1/categories/{b.id}{slash}', headers=headers,
                         json={'name': 'Renamed'})
    assert put.status_code == patch.status_code == 200
    assert put.get_json() == patch.get_json()
    assert Category.query.get(a.id).name == 'Renamed'
    assert Category.query.get(b.id).name == 'Renamed'


@BOTH_SPELLINGS
def test_pin_update_requires_a_body(client, db, me, headers, slash):
    category = _make_category(me, 'Groceries')
    resp = client.put(f'/api/v1/categories/{category.id}{slash}',
                      headers=headers, json={})
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Request body is required'}


@BOTH_SPELLINGS
def test_pin_delete_answers_with_a_bare_message_and_removes_the_row(
        client, db, me, headers, slash):
    category = _make_category(me, 'Doomed')
    category_id = category.id

    resp = client.delete(f'/api/v1/categories/{category_id}{slash}',
                         headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert set(resp.get_json()) == {'message'}
    assert Category.query.get(category_id) is None


@BOTH_SPELLINGS
def test_pin_system_categories_cannot_be_edited_or_deleted(
        client, db, me, headers, slash):
    """A 400 with an authored reason, not a 403 and not a silent no-op."""
    category = _make_category(me, 'System One', is_system=True)

    edit = client.put(f'/api/v1/categories/{category.id}{slash}',
                      headers=headers, json={'name': 'Nope'})
    assert edit.status_code == 400
    assert edit.get_json() == {
        'error': 'System categories cannot be edited'}

    remove = client.delete(f'/api/v1/categories/{category.id}{slash}',
                           headers=headers)
    assert remove.status_code == 400
    assert remove.get_json() == {
        'error': 'System categories cannot be deleted'}

    assert Category.query.get(category.id) is not None


def test_pin_the_slashed_collection_get_is_the_household_envelope(
        client, db, me, housemate, headers):
    """The spelling mobile uses. This half is already correct and must stay."""
    _make_category(me, 'Mine')
    _make_category(housemate, 'Theirs')

    resp = client.get('/api/v1/categories/', headers=headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['success'] is True
    assert sorted(c['name'] for c in body['categories']) == ['Mine', 'Theirs']
    assert {'user_id', 'subcategories'} <= set(body['categories'][0])


def test_pin_the_slashed_collection_post_envelope(client, db, me, headers):
    resp = client.post('/api/v1/categories/', headers=headers,
                       json={'name': 'Created', 'icon': 'fa-star'})
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert body['success'] is True
    assert body['message'] == 'Category created successfully'
    assert body['category']['name'] == 'Created'


def test_pin_creating_without_a_name_is_refused(client, db, me, headers):
    resp = client.post('/api/v1/categories/', headers=headers, json={})
    assert resp.status_code == 400
    assert Category.query.filter_by(user_id=me.id).count() == 0


# =============================================================================
# THE FIX — D-20. Every assertion below FAILED before the port.
# =============================================================================

def test_fix_the_slashless_collection_is_household_wide(
        client, db, me, housemate, headers):
    """D-20's core. web-ui sends this spelling and saw only its own rows.

    Before the port: returned ['Mine'] only, and had no `success` key.
    """
    _make_category(me, 'Mine')
    _make_category(housemate, 'Theirs')

    resp = client.get('/api/v1/categories', headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()
    assert sorted(c['name'] for c in body['categories']) == ['Mine', 'Theirs'], (
        'the slash-less spelling is still per-user, so web-ui and mobile still '
        'disagree about what a category list contains')
    assert body['success'] is True, (
        "the slash-less spelling still lacks `success` — web-ui's own declared "
        'TypeScript type says it is there')


def test_fix_both_spellings_are_now_byte_identical(
        client, db, me, housemate, headers):
    """The property that actually closes D-20, stated directly.

    One implementation, so a trailing slash cannot change what a caller sees.
    This is the assertion to keep if every other one in this file is deleted.
    """
    _make_category(me, 'Mine')
    _make_category(housemate, 'Theirs')

    a = client.get('/api/v1/categories', headers=headers)
    b = client.get('/api/v1/categories/', headers=headers)
    assert a.status_code == b.status_code
    assert a.get_json() == b.get_json(), (
        'the two spellings still return different payloads, so D-20 is not '
        'closed no matter what the other tests say')


@BOTH_SPELLINGS
def test_fix_creating_a_category_persists_the_colour(client, db, me, headers, slash):
    """restx's POST validated `color` and then dropped it on the floor.

    `CategoryInput` declares the field, so a client sending it got a 201 and no
    colour. The blueprint persisted it, so after the blueprint is deleted this is
    *preserving* the slash-less caller's behaviour — and fixing the slashed one.
    """
    resp = client.post(f'/api/v1/categories{slash}', headers=headers,
                       json={'name': 'Coloured', 'color': '#abcdef'})
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]

    saved = Category.query.filter_by(name='Coloured').first()
    assert saved is not None
    assert saved.color == '#abcdef', (
        f'the colour was accepted and not stored (got {saved.color!r})')


@BOTH_SPELLINGS
def test_fix_a_housemates_category_can_be_opened(
        client, db, me, housemate, headers, slash):
    """Before the port this answered 403, while mobile's list showed the row.

    A list and a detail view of the same resource disagreeing about ownership is
    a broken screen, not a permission model.
    """
    theirs = _make_category(housemate, 'Theirs')

    resp = client.get(f'/api/v1/categories/{theirs.id}{slash}', headers=headers)
    assert resp.status_code == 200, (
        'opening a household category is still refused: '
        f'{resp.status_code} {resp.get_data(as_text=True)[:200]}')
    assert resp.get_json()['name'] == 'Theirs'
    assert set(resp.get_json()) == DETAIL_FIELDS


@BOTH_SPELLINGS
def test_fix_a_housemates_category_can_be_renamed(
        client, db, me, housemate, headers, slash):
    """Categories are household property, so any member may maintain them."""
    theirs = _make_category(housemate, 'Theirs')

    resp = client.put(f'/api/v1/categories/{theirs.id}{slash}',
                      headers=headers, json={'name': 'Ours'})
    assert resp.status_code == 200, (
        f'renaming a household category is still refused: '
        f'{resp.get_data(as_text=True)[:200]}')
    assert Category.query.get(theirs.id).name == 'Ours'


@BOTH_SPELLINGS
def test_fix_a_housemates_category_can_be_deleted(
        client, db, me, housemate, headers, slash):
    """The one live caller in either client is web-ui's delete button.

    web-ui's list becomes household-wide with this port, so the page renders
    other members' categories next to a delete button. If the permission stayed
    per-user that button would answer 400 — the convergence would have shipped a
    visibly broken screen.
    """
    theirs = _make_category(housemate, 'Theirs')
    category_id = theirs.id

    resp = client.delete(f'/api/v1/categories/{category_id}{slash}',
                         headers=headers)
    assert resp.status_code == 200, (
        f'deleting a household category is still refused: '
        f'{resp.get_data(as_text=True)[:200]}')
    assert Category.query.get(category_id) is None


def test_model_the_household_is_still_the_whole_instance(client, db, me, headers):
    """The household is the instance, so there is no "outside" to test against.

    Kept as a statement of the model rather than a gap: if cross-household
    isolation is ever introduced, this test is where it must be asserted, and it
    should start failing loudly rather than silently passing. `get_all_user_ids()`
    returning every user on the instance IS the household definition.
    """
    from src.utils.household import get_all_user_ids
    from src.models.user import User
    assert sorted(get_all_user_ids()) == sorted(u.id for u in User.query.all()), (
        'get_all_user_ids no longer means "everyone on the instance", so the '
        'household model has changed and the category scope needs revisiting')


def test_fix_the_duplicate_route_allowlist_is_empty(client, db):
    """D-20 was the sole entry. Closing it should leave nothing behind.

    Keyed to the allowlist being empty rather than to categories being absent
    from it, so it also catches the next port that widens it instead of fixing
    the collision.
    """
    from src import _KNOWN_DUPLICATE_ROUTES
    assert _KNOWN_DUPLICATE_ROUTES == set(), (
        'a route collision is still allowlisted, so some (path, method) is '
        f'served by two handlers depending on its trailing slash: '
        f'{sorted(_KNOWN_DUPLICATE_ROUTES)}')
