"""D-79 — a demo account's own category was refused for every budget it tried to create.

`BudgetService.add_budget` validated the category with
`category.user_id not in household_user_ids()`, and `household_user_ids()` is *everyone on
the instance **except** demo accounts* by its own docstring. So for a demo caller the set
never contains their own id and **every one of their own categories** answered
**400 "Invalid category selected"** — measured live across four of `demo1`'s categories.

*** THIS IS THE D-42 PATTERN: A FIX INTRODUCED IT. *** D-66's own row records the change —
*"the category check uses household membership"* — which replaced `category.user_id !=
user_id` with the household helper and, in doing so, locked demo accounts out of a check
they used to pass. D-42 was caused by D-20's fix in exactly the same way, one table over.
That makes **three** rows now closed by moving one call to `visible_user_ids(caller)`.

The duplicate check immediately below it carried the same helper and therefore the
**inverse** bug, which no symptom had reported: `household_user_ids()` excludes a demo
account, so a demo caller's *own* active budget was invisible to the duplicate check and
they could stack two budgets on one category. Both are converted here — a fixture that only
covered the reported symptom would have left the second half live.

*** THE SANDBOX BOUNDARY IS THE OTHER HALF OF THIS FILE, AND IT IS NOT OPTIONAL. *** A demo
password is PUBLISHED (`demo1234`, `src/services/demo/service.py`), so "let the demo
through" must not become "let the demo at household property". `visible_user_ids` is the
right predicate precisely because it narrows to the caller alone for a demo account instead
of widening to everyone.
"""
from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from tests.factories import UserFactory

URL = '/api/v1/budgets/'


def _category(owner, name='Groceries'):
    cat = Category(name=name, user_id=owner.id)
    _db.session.add(cat)
    _db.session.commit()
    return cat


def _payload(cat, amount=100):
    return {'name': 'B', 'amount': amount, 'period': 'monthly', 'category_id': cat.id}


def test_a_demo_account_can_budget_against_its_own_category(client, db, auth_headers):
    """The reported defect. A demo visitor's own category is theirs to budget."""
    demo = UserFactory(is_demo_user=True)
    cat = _category(demo, 'DemoFood')

    resp = client.post(URL, headers=auth_headers(demo), json=_payload(cat))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert Budget.query.filter_by(user_id=demo.id, category_id=cat.id).count() == 1


def test_a_demo_account_cannot_budget_against_the_households_category(client, db, auth_headers):
    """The boundary. Widening the check to `get_all_user_ids()` would pass the test
    above and break this one — which is the whole reason both are here.

    D-42's shape: a published demo password must not reach real household property.
    """
    real = UserFactory()
    demo = UserFactory(is_demo_user=True)
    household_cat = _category(real, 'RealGroceries')

    resp = client.post(URL, headers=auth_headers(demo), json=_payload(household_cat))

    assert resp.status_code == 400, resp.get_data(as_text=True)[:300]
    assert 'invalid category' in str(resp.get_json()).lower()
    assert Budget.query.filter_by(category_id=household_cat.id).count() == 0


def test_a_real_member_can_still_budget_against_a_housemates_category(client, db, auth_headers):
    """D-66's original fix must survive: categories are household property.

    Two real users, for whom `household_user_ids()` and `visible_user_ids()` return the
    same set — so this test cannot tell the two helpers apart, and that is exactly why
    the demo cases above exist. It is here to prove the conversion did not narrow the
    household case back to per-user.
    """
    alice = UserFactory()
    bob = UserFactory()
    bobs_cat = _category(bob, 'BobsCategory')

    resp = client.post(URL, headers=auth_headers(alice), json=_payload(bobs_cat))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]


def test_a_demo_account_cannot_stack_two_budgets_on_one_category(client, db, auth_headers):
    """The inverse half, which no symptom reported.

    The duplicate check also read `household_user_ids()`, so a demo account's own active
    budget was invisible to it and "one budget per category" silently did not apply to
    demo users. Fixing only the category check would leave this live.
    """
    demo = UserFactory(is_demo_user=True)
    cat = _category(demo, 'DemoOnce')
    headers = auth_headers(demo)

    first = client.post(URL, headers=headers, json=_payload(cat, 100))
    assert first.status_code == 201, first.get_data(as_text=True)[:300]

    second = client.post(URL, headers=headers, json=_payload(cat, 200))

    assert second.status_code == 400, (
        'a demo account stacked a second active budget on the same category: '
        + second.get_data(as_text=True)[:200])
    assert Budget.query.filter_by(user_id=demo.id, category_id=cat.id).count() == 1
