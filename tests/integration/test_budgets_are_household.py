"""A budget belongs to the household, not to the member who created it.

Owner decision **2026-08-06**, recorded in AUDIT **D-20**: *"budget, categories
and rest is for household."* Categories were converged onto it that day. Budgets
were not, and the two halves of budgeting disagreed for a year:

* the **list** endpoint has always been household-wide — its own docstring says
  *"Get all budgets for household"*;
* the **arithmetic** filtered `Expense.user_id == self.user_id`, so it counted
  only rows the budget's owner typed in, and then apportioned them by
  `split_with` — **the attribution model D-18 retired**.

So Bob buying groceries on Alice's card counted against **Bob**, halved, while
the transactions list, the dashboard and `group_by=owner` all called it Alice's
in full.

── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────

**The 20 tests that already covered budgets all passed against both models**, and
that is the point: every one of them uses a single user, where "this member's
spending" and "the household's spending" are the same number. A fixture where the
two models agree cannot tell them apart — the same trap the `group_by=owner`
fixture fell into, caught the same way. Every test below is written so that the
per-user implementation gives a *different* answer.
"""
from datetime import datetime

from src.extensions import db as _db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.transaction import Expense
from tests.factories import UserFactory

URL = '/api/v1/budgets/'


def _category(owner, name='Groceries'):
    cat = Category(name=name, user_id=owner.id)
    _db.session.add(cat)
    _db.session.flush()
    return cat


def _account(owner, name):
    acc = Account(name=name, type='checking', user_id=owner.id)
    _db.session.add(acc)
    _db.session.flush()
    return acc


def _expense(entered_by, amount, category, account=None, split_with=None):
    return Expense(
        description='shop', amount=amount, date=datetime.utcnow(),
        user_id=entered_by.id, paid_by=entered_by.id, card_used='',
        split_method='equal', split_with=split_with,
        category_id=category.id,
        account_id=account.id if account else None,
        transaction_type='expense')


def _budget(owner, category, amount=500.0):
    b = Budget(user_id=owner.id, category_id=category.id, name='Food',
               amount=amount, period='monthly', start_date=datetime.utcnow(),
               active=True, include_subcategories=False)
    _db.session.add(b)
    _db.session.commit()
    return b


def _spent(client, headers, budget_id):
    """The budget's `spent`, read back off the API rather than the model."""
    resp = client.get(URL, headers=headers)
    assert resp.status_code == 200
    body = resp.get_json()
    rows = body['budgets'] if isinstance(body, dict) else body
    for row in rows:
        if row['id'] == budget_id:
            return float(row['spent'])
    raise AssertionError('budget %s not in the list: %s' % (budget_id, rows))


def test_a_housemates_spending_counts_against_the_household_budget(
        client, db, auth_headers):
    """The whole decision in one assertion.

    Alice owns the budget; BOB does the spending. Under the old per-user
    arithmetic this was 0.00 — a budget that quietly ignored half the household.
    """
    alice = UserFactory()
    bob = UserFactory()
    groceries = _category(alice)
    budget = _budget(alice, groceries)

    _db.session.add(_expense(bob, 40.0, groceries, _account(bob, 'Bob Current')))
    _db.session.commit()

    assert _spent(client, auth_headers(alice), budget.id) == 40.0


def test_a_split_row_counts_IN_FULL_not_apportioned(client, db, auth_headers):
    """`split_with` settles up; it does not decide attribution (D-18).

    The old code took the payer's share of a split row — 30.00 of a 60.00 shop
    split with one other person. Under household scope the whole 60.00 is the
    household's, and halving it would double-count once the other half is
    counted too.
    """
    alice = UserFactory()
    bob = UserFactory()
    groceries = _category(alice)
    budget = _budget(alice, groceries)

    _db.session.add(_expense(alice, 60.0, groceries,
                             _account(alice, 'Alice Current'),
                             split_with=bob.id))
    _db.session.commit()

    assert _spent(client, auth_headers(alice), budget.id) == 60.0


def test_a_row_one_member_entered_on_anothers_account_counts_once(
        client, db, auth_headers):
    """The row that separates every candidate attribution rule.

    `Expense.user_id` is Bob, `Account.user_id` is Alice. Per-user-by-enterer
    gives 0 for Alice's budget; per-user-by-account-owner gives 25; household
    gives 25 and would give the same if either member held the budget. Only the
    household reading is stable under "who owns the budget".
    """
    alice = UserFactory()
    bob = UserFactory()
    groceries = _category(alice)
    budget = _budget(alice, groceries)

    _db.session.add(_expense(bob, 25.0, groceries, _account(alice, 'Alice Current')))
    _db.session.commit()

    assert _spent(client, auth_headers(alice), budget.id) == 25.0
    # And it does not depend on which member is asking.
    assert _spent(client, auth_headers(bob), budget.id) == 25.0


def test_a_demo_accounts_spending_never_counts(client, db, auth_headers):
    """`household_user_ids()`, not `get_all_user_ids()`.

    The latter includes demo accounts by its own docstring, and D-42 is the row
    where that leaked — fixed for categories only, with the other callers
    deliberately deferred. Widening budgets to "the household" must not widen
    them to "everyone on the instance", or a published demo password moves the
    real household's budget figures.
    """
    alice = UserFactory()
    demo = UserFactory(is_demo_user=True)
    groceries = _category(alice)
    budget = _budget(alice, groceries)

    _db.session.add(_expense(demo, 999.0, groceries))
    _db.session.commit()

    assert _spent(client, auth_headers(alice), budget.id) == 0.0


def test_a_second_budget_for_the_same_category_is_refused_ACROSS_MEMBERS(
        client, db, auth_headers):
    """One budget per category per household — not one each.

    Scoped to `user_id` this passed, leaving Alice and Bob holding separate
    active Groceries budgets which, under household spend, report the SAME
    number while the overview sums both.
    """
    alice = UserFactory()
    bob = UserFactory()
    groceries = _category(alice)
    _budget(alice, groceries)

    resp = client.post(URL, json={
        'name': 'Food again', 'category_id': groceries.id,
        'amount': 300, 'period': 'monthly',
    }, headers=auth_headers(bob))

    assert resp.status_code == 400
    assert 'already exists' in resp.get_json()['error']


def test_a_member_can_budget_against_a_category_someone_else_created(
        client, db, auth_headers):
    """Categories are household property (D-20), and this check never followed.

    Bob got "Invalid category selected" for a perfectly valid household
    category — live, and the sibling of the fix D-20 applied to CategoryService.
    """
    alice = UserFactory()
    bob = UserFactory()
    groceries = _category(alice)

    resp = client.post(URL, json={
        'name': 'Food', 'category_id': groceries.id,
        'amount': 300, 'period': 'monthly',
    }, headers=auth_headers(bob))

    assert resp.status_code == 201, resp.get_json()


def test_the_list_and_the_permissions_agree(client, db, auth_headers):
    """"A row you can see becomes a row you cannot edit" — D-20's phrase.

    The collection was household-wide while the four detail routes were
    `filter_by(user_id=current_user_id)`, so a member saw every household budget
    and got a 404 opening, editing or deleting any but their own.
    """
    alice = UserFactory()
    bob = UserFactory()
    budget = _budget(alice, _category(alice))
    bob_headers = auth_headers(bob)

    # Bob can see it...
    listed = client.get(URL, headers=bob_headers).get_json()
    rows = listed['budgets'] if isinstance(listed, dict) else listed
    assert any(r['id'] == budget.id for r in rows)

    # ...so Bob must be able to open and change it.
    assert client.get(f'{URL}{budget.id}', headers=bob_headers).status_code == 200
    assert client.put(f'{URL}{budget.id}', json={'amount': 750},
                      headers=bob_headers).status_code == 200
    assert client.delete(f'{URL}{budget.id}', headers=bob_headers).status_code == 200


# ── D-66 REOPENED, 2026-08-10 ────────────────────────────────────────────────
#
# The four tests above shipped with #108 and are correct. They could not see the
# half of D-66 that was left undone, and the reason is the trap THIS FILE'S OWN
# docstring names, one level deeper.
#
# `test_the_list_and_the_permissions_agree` uses Alice and Bob — two REAL users.
# For them `get_all_user_ids()` and `household_user_ids()` return the SAME set,
# so a list built from one beside a detail built from the other agrees perfectly.
# The asymmetry only appears when a DEMO account is on the instance, and no
# fixture here had one on the *reading* side: `test_a_demo_accounts_spending_
# never_counts` puts a demo in the data and then asks ALICE what she sees.
#
# Measured on a copy of the seeded database before these were written: a demo
# account is listed 11 budgets and gets 404 on all 11, and on an instance that
# also has a real user, the demo's OWN budget reports the REAL user's spending.

def test_a_demo_account_can_open_every_budget_it_is_shown(client, db, auth_headers):
    """The list and the detail must agree **for a demo account too**.

    The list was `get_all_user_ids()` (demo INCLUDED) while the detail routes
    were `household_user_ids()` (demo EXCLUDED), so a demo visitor saw the whole
    household's budgets and got 404 opening every one of them. Asserts the row
    OPENS, not that the list answers 200 — a 200 with an unopenable row is the
    defect.
    """
    alice = UserFactory()
    demo = UserFactory(is_demo_user=True)
    _budget(alice, _category(alice, 'Groceries'))
    _budget(demo, _category(demo, 'DemoFood'))

    headers = auth_headers(demo)
    body = client.get(URL, headers=headers).get_json()
    rows = body['budgets'] if isinstance(body, dict) else body

    assert rows, 'a demo account was shown no budgets at all'
    for row in rows:
        assert client.get(f"{URL}{row['id']}", headers=headers).status_code == 200, (
            f"budget {row['id']} is listed to a demo account but 404s when opened"
        )


def test_a_demo_account_is_not_shown_the_households_budgets(client, db, auth_headers):
    """The sandbox runs both ways (D-42, D-47).

    A demo password is PUBLISHED, so anything the demo persona can see is public.
    """
    alice = UserFactory()
    demo = UserFactory(is_demo_user=True)
    alice_budget = _budget(alice, _category(alice, 'Groceries'))
    _budget(demo, _category(demo, 'DemoFood'))

    body = client.get(URL, headers=auth_headers(demo)).get_json()
    rows = body['budgets'] if isinstance(body, dict) else body
    assert all(r['id'] != alice_budget.id for r in rows), (
        "a demo account was shown the real household's budget"
    )


def test_a_demo_budget_reports_the_demos_own_spending_not_the_households(
        client, db, auth_headers):
    """The spend figure itself leaked, which is worse than the 404.

    `calculate_spent_amount` summed `household_user_ids()` REGARDLESS of whose
    budget it was, so on an instance with one real user every budget — including
    the demo's own — reported the REAL household's spending. Measured: demo1's
    own budget read $123.45, the real user's private figure, while the demo's
    actual $21.25 counted nowhere.
    """
    alice = UserFactory()
    demo = UserFactory(is_demo_user=True)
    demo_food = _category(demo, 'DemoFood')
    demo_budget = _budget(demo, demo_food)

    # The real household spends in a category of the SAME NAME...
    alice_food = _category(alice, 'DemoFood')
    _db.session.add(_expense(alice, 123.45, alice_food))
    # ...and the demo spends its own, smaller amount.
    _db.session.add(_expense(demo, 21.25, demo_food))
    _db.session.commit()

    assert _spent(client, auth_headers(demo), demo_budget.id) == 21.25
