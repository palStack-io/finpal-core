"""
*** ASSERT ON THE NUMBERS IN THE PAYLOAD, NEVER ON THE STATUS CODE. *** An overview
that returns 200 with a subtotal that does not add up is exactly the defect this
project keeps finding, and it renders beautifully.

*** THE SERVER OWNS THE TOTALS (D-101). *** Two clients summing independently is
two chances to disagree with each other and with the database, so the grouping,
the subtotals and left-to-budget are all computed here and the clients render
what they are given.
"""
from datetime import datetime

from src.models.budget import Budget
from src.models.category import Category
from src.models.transaction import Expense
from tests.factories import UserFactory


def category(db, user, name, spending_type=None, parent=None):
    row = Category(name=name, user_id=user.id, spending_type=spending_type,
                   parent_id=parent.id if parent else None)
    db.session.add(row)
    db.session.commit()
    return row


def budget(db, user, cat, amount, name=None):
    row = Budget(user_id=user.id, category_id=cat.id, name=name or cat.name,
                 amount=amount, period='monthly', active=True,
                 include_subcategories=True, start_date=datetime.utcnow())
    db.session.add(row)
    db.session.commit()
    return row


def spend(db, user, cat, amount, kind='expense'):
    row = Expense(description=f'{kind} on {cat.name}', amount=amount,
                  date=datetime.utcnow(), user_id=user.id, paid_by=user.id,
                  category_id=cat.id, transaction_type=kind,
                  currency_code='USD', split_method='none',
                  card_used='Test Card')
    db.session.add(row)
    db.session.commit()
    return row


def income(db, user, amount, when=None):
    row = Expense(description='Salary', amount=amount,
                  date=when or datetime.utcnow(), user_id=user.id,
                  paid_by=user.id, transaction_type='income',
                  currency_code='USD', split_method='none',
                  card_used='Test Card')
    db.session.add(row)
    db.session.commit()
    return row


def overview(client, user, auth_headers):
    return client.get('/api/v1/budgets/overview',
                      headers=auth_headers(user)).get_json()


def seeded(db):
    """One budget in each group, with spending against each."""
    user = UserFactory()
    rent = category(db, user, 'Rent', 'fixed')
    groceries = category(db, user, 'Groceries', 'flexible')
    gifts = category(db, user, 'Gifts', 'non_monthly')
    budget(db, user, rent, 1000.0)
    budget(db, user, groceries, 600.0)
    budget(db, user, gifts, 120.0)
    spend(db, user, rent, 1000.0)
    spend(db, user, groceries, 250.0)
    spend(db, user, gifts, 40.0)
    return user


# --------------------------------------------------------------------------
# The groups
# --------------------------------------------------------------------------

def test_the_three_groups_are_present_and_in_order(client, auth_headers, db):
    body = overview(client, seeded(db), auth_headers)
    assert [g['spending_type'] for g in body['groups']] == \
        ['fixed', 'flexible', 'non_monthly']


def test_a_group_subtotal_is_the_sum_of_its_budgets(client, auth_headers, db):
    body = overview(client, seeded(db), auth_headers)
    for group in body['groups']:
        assert group['planned'] == sum(b['amount'] for b in group['budgets'])
        assert group['actual'] == sum(b['spent'] for b in group['budgets'])
        assert group['remaining'] == group['planned'] - group['actual']


def test_the_grand_total_is_the_sum_of_the_groups_plus_unsorted(client, auth_headers, db):
    body = overview(client, seeded(db), auth_headers)
    assert body['totals']['planned'] == sum(g['planned'] for g in body['groups'])
    assert body['totals']['actual'] == \
        sum(g['actual'] for g in body['groups']) + body['unsorted']['actual']


def test_an_empty_group_is_still_present_with_zeroes(client, auth_headers, db):
    # A missing key and a zero are different to a client, and a group that
    # vanishes when empty makes the page jump around.
    user = UserFactory()
    rent = category(db, user, 'Rent', 'fixed')
    budget(db, user, rent, 1000.0)

    body = overview(client, user, auth_headers)
    assert len(body['groups']) == 3
    flexible = next(g for g in body['groups'] if g['spending_type'] == 'flexible')
    assert flexible['planned'] == 0
    assert flexible['actual'] == 0
    assert flexible['budgets'] == []


def test_the_group_labels_match_the_shared_client_rule(client, auth_headers, db):
    # 'Non-Monthly', not 'non_monthly'. The same three strings the two clients
    # hold in GROUP_LABELS.
    body = overview(client, seeded(db), auth_headers)
    assert [g['label'] for g in body['groups']] == \
        ['Fixed', 'Flexible', 'Non-Monthly']


# --------------------------------------------------------------------------
# Inheritance, mirroring budget.py:72 exactly
# --------------------------------------------------------------------------

def test_a_subcategory_budget_INHERITS_its_parents_group(client, auth_headers, db):
    user = UserFactory()
    housing = category(db, user, 'Housing', 'fixed')
    electricity = category(db, user, 'Electricity', None, parent=housing)
    budget(db, user, electricity, 90.0)
    spend(db, user, electricity, 85.0)

    body = overview(client, user, auth_headers)
    fixed = next(g for g in body['groups'] if g['spending_type'] == 'fixed')
    assert fixed['planned'] == 90.0
    assert [b['name'] for b in fixed['budgets']] == ['Electricity']


def test_an_explicit_child_value_OVERRIDES_its_parent(client, auth_headers, db):
    user = UserFactory()
    housing = category(db, user, 'Housing', 'fixed')
    decor = category(db, user, 'Home Decor', 'flexible', parent=housing)
    budget(db, user, decor, 50.0)

    body = overview(client, user, auth_headers)
    flexible = next(g for g in body['groups'] if g['spending_type'] == 'flexible')
    assert [b['name'] for b in flexible['budgets']] == ['Home Decor']


def test_inheritance_does_NOT_reach_a_grandparent(client, auth_headers, db):
    # budget.py:72 rolls up exactly one level. A deeper walk here would put a
    # budget in a group whose subtotal the rollup never counted.
    user = UserFactory()
    housing = category(db, user, 'Housing', 'fixed')
    utilities = category(db, user, 'Utilities', None, parent=housing)
    electricity = category(db, user, 'Electricity', None, parent=utilities)
    budget(db, user, electricity, 90.0)

    body = overview(client, user, auth_headers)
    fixed = next(g for g in body['groups'] if g['spending_type'] == 'fixed')
    assert fixed['planned'] == 0
    assert body['unsorted']['budget_count'] == 1


# --------------------------------------------------------------------------
# Honesty
# --------------------------------------------------------------------------

def test_remaining_goes_NEGATIVE_rather_than_clamping_at_zero(client, auth_headers, db):
    # An overspend the page renders as 0 is a lie the user acts on.
    user = UserFactory()
    groceries = category(db, user, 'Groceries', 'flexible')
    budget(db, user, groceries, 600.0)
    spend(db, user, groceries, 723.0)

    body = overview(client, user, auth_headers)
    flexible = next(g for g in body['groups'] if g['spending_type'] == 'flexible')
    assert flexible['actual'] == 723.0
    assert flexible['remaining'] == -123.0


def test_unsorted_spending_is_REPORTED_not_hidden(client, auth_headers, db):
    # A budget page that only shows budgeted categories tells you spending is
    # under control while money leaves elsewhere.
    user = UserFactory()
    mystery = category(db, user, 'Bank Fees', None)
    spend(db, user, mystery, 210.0)

    body = overview(client, user, auth_headers)
    assert body['unsorted']['count'] >= 1
    assert body['unsorted']['actual'] == 210.0
    assert 'Bank Fees' in [c['name'] for c in body['unsorted']['categories']]


def test_an_unsorted_category_with_NO_spending_is_not_listed(client, auth_headers, db):
    # Unsorted is a to-do list. Padding it with categories nobody has spent
    # against makes the real ones harder to find.
    user = UserFactory()
    category(db, user, 'Bank Fees', None)

    body = overview(client, user, auth_headers)
    assert body['unsorted']['count'] == 0
    assert body['unsorted']['categories'] == []


def test_a_classified_category_never_appears_in_unsorted(client, auth_headers, db):
    user = UserFactory()
    groceries = category(db, user, 'Groceries', 'flexible')
    spend(db, user, groceries, 80.0)

    body = overview(client, user, auth_headers)
    assert body['unsorted']['actual'] == 0
    assert body['unsorted']['categories'] == []


def test_a_group_actual_EXCLUDES_income_now_that_D_183_IS_FIXED(db, client, auth_headers):
    """*** THIS TEST DID ITS JOB. ***

    It used to assert 5100.0 -- the WRONG number -- and name AUDIT D-183, so
    that whoever fixed the underlying defect would see it go red rather than
    rediscover the whole thing. D-183 was fixed on 2026-09-10 with the owner's
    approval, this went red exactly as designed, and it now asserts the right
    number.

    A group subtotal sums the per-budget figures, so it inherits whatever
    `calculate_spent_amount` reports. That is why the pin lived here.
    """
    user = UserFactory()
    groceries = category(db, user, 'Groceries', 'flexible')
    budget(db, user, groceries, 600.0)
    spend(db, user, groceries, 100.0)
    spend(db, user, groceries, 5000.0, kind='income')

    body = overview(client, user, auth_headers)
    flexible = next(g for g in body['groups'] if g['spending_type'] == 'flexible')
    assert flexible['actual'] == 100.0


def test_income_does_not_leak_into_the_UNSORTED_total(client, auth_headers, db):
    # The one place this piece DOES control the arithmetic, so it gets the rule
    # right: the unsorted section sums Expense rows directly rather than going
    # through calculate_spent_amount, and it filters on transaction_type.
    user = UserFactory()
    fees = category(db, user, 'Bank Fees', None)
    spend(db, user, fees, 30.0)
    spend(db, user, fees, 5000.0, kind='income')

    body = overview(client, user, auth_headers)
    assert body['unsorted']['actual'] == 30.0


# --------------------------------------------------------------------------
# Left to budget
# --------------------------------------------------------------------------

def test_left_to_budget_is_null_when_income_is_unknown(client, auth_headers, db):
    # No income transactions -> finPal does not know. Null, never zero: zero is
    # a claim that they earned nothing.
    body = overview(client, seeded(db), auth_headers)
    assert body['left_to_budget'] is None


def test_left_to_budget_is_income_minus_planned(client, auth_headers, db):
    user = seeded(db)
    income(db, user, 4000.0)

    body = overview(client, user, auth_headers)
    assert body['income'] == 4000.0
    assert body['left_to_budget'] == 4000.0 - body['totals']['planned']


def test_left_to_budget_is_NULL_when_income_exists_but_NOT_THIS_MONTH(client,
                                                                      auth_headers, db):
    # *** THE DEMO'S ACTUAL SHAPE, AND WHY THIS IS NOT A ZERO. *** Measured on
    # the live demo 2026-09-10: total_income 9950, current_month_income 0,
    # because every seeded income row is in an earlier month. Treating that as
    # income=0 would render "-$1,400 left to budget" to somebody who simply has
    # not been paid yet. The same reasoning as the test above: finPal does not
    # know this month's income, so it says so.
    user = seeded(db)
    income(db, user, 4000.0, when=datetime(2020, 1, 15))

    body = overview(client, user, auth_headers)
    assert body['income'] is None
    assert body['left_to_budget'] is None


def test_left_to_budget_goes_negative_when_planned_exceeds_income(client,
                                                                  auth_headers, db):
    # Over-committing is a real state and clamping it hides the problem.
    user = seeded(db)
    income(db, user, 500.0)

    body = overview(client, user, auth_headers)
    assert body['left_to_budget'] == 500.0 - body['totals']['planned']
    assert body['left_to_budget'] < 0


# --------------------------------------------------------------------------
# The old contract still holds
# --------------------------------------------------------------------------

def test_the_pre_existing_keys_are_unchanged(client, auth_headers, db):
    # Additive only. mobile and any script read these today.
    body = overview(client, seeded(db), auth_headers)
    for key in ('success', 'total_budget', 'total_spent', 'total_remaining',
                'percentage_used', 'budget_count', 'budgets'):
        assert key in body, key
    assert body['total_budget'] == 1720.0
    assert body['budget_count'] == 3


# --------------------------------------------------------------------------
# The duplication gate
# --------------------------------------------------------------------------

def test_the_income_helper_AGREES_with_the_dashboards_own_figure(db):
    """*** TWO IMPLEMENTATIONS OF ONE RULE, PINNED TOGETHER RATHER THAN LEFT TO
    DRIFT. ***

    `AnalyticsService.current_month_income` computes the same figure
    `get_dashboard_data` already reports as `current_month_income`. It does not
    call that method, deliberately: `get_dashboard_data` runs
    `sync_investments_with_accounts` (analytics/service.py:87), a WRITE, and a
    budget page load has no business triggering an investment sync.

    So the duplication is real, and this is the gate that keeps it honest --
    change one and this goes red. The only sanctioned difference is the None:
    the helper says None where the dashboard says 0, because zero is a claim
    that the user earned nothing.
    """
    from src.services.analytics.service import AnalyticsService

    user = UserFactory()
    income(db, user, 4000.0)
    income(db, user, 250.0)
    income(db, user, 999.0, when=datetime(2020, 1, 15))   # an earlier month
    groceries = category(db, user, 'Groceries', 'flexible')
    spend(db, user, groceries, 80.0)

    service = AnalyticsService()
    helper = service.current_month_income(user.id)
    dashboard = service.get_dashboard_data(user.id)['current_month_income']

    assert helper == 4250.0
    assert float(dashboard) == helper


def test_the_two_disagree_ONLY_by_returning_None_instead_of_zero(db):
    from src.services.analytics.service import AnalyticsService

    user = UserFactory()
    income(db, user, 500.0, when=datetime(2020, 1, 15))   # nothing this month

    service = AnalyticsService()
    assert service.current_month_income(user.id) is None
    assert float(service.get_dashboard_data(user.id)['current_month_income']) == 0.0
