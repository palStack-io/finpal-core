"""
`DemoService.reset_demo_user` deletes in an order Postgres refuses.

*** IT IS CALLED BY NOTHING AND HAS NEVER BEEN RUN. *** Which is why it has
survived: it bulk-deletes `Account` and `Category` rows while SIXTEEN foreign
keys point at those two tables and every one of them is `NO ACTION`, not
cascade. Measured on the live demo database, not read off the models:

    transaction_rules.auto_category_id -> categories   (208 rows on the demo)
    transaction_rules.auto_account_id  -> accounts
    goals.account_id                   -> accounts     (15 goals)
    goal_accounts.account_id           -> accounts     (8 links)
    budgets, expenses, category_splits, category_mappings,
    recurring_expenses, portfolios, account_owners     -> both

`Query.delete()` is a BULK delete: it emits one DELETE and bypasses the ORM's
cascade rules and every service-layer guard, including the one D-181 added to
stop an account deletion silently resetting a linked goal. So the function
cannot rely on any of that -- the order has to be explicit.

*** THE SQLITE SUITE IS THE WRONG WITNESS HERE AND THAT IS THE POINT. ***
SQLite does not enforce foreign keys unless `PRAGMA foreign_keys=ON`, so the
broken version can pass a green test run and still fail on Postgres -- the exact
shape of the partial-index defect this project hit before. The test below
therefore asserts the ORDER OF DELETION rather than only the outcome, so it
holds on either engine.
"""
from datetime import datetime

import pytest

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.goal_account import GoalAccount
from src.models.transaction import Expense, CategorySplit
from src.models.transaction_rule import TransactionRule
from tests.factories import UserFactory


DEMO_EMAIL = 'demo1@finpal.demo'


def build_the_whole_graph(user):
    """Every table that FKs to accounts or categories, populated."""
    account = Account(user_id=user.id, name='Primary Checking', type='checking',
                      balance=1000)
    category = Category(user_id=user.id, name='Groceries')
    db.session.add_all([account, category])
    db.session.commit()

    expense = Expense(description='shop', amount=20, date=datetime.utcnow(),
                      user_id=user.id, paid_by=user.id, card_used='X',
                      split_method='none', currency_code='USD',
                      transaction_type='expense',
                      category_id=category.id, account_id=account.id,
                      has_category_splits=True)
    db.session.add(expense)
    db.session.commit()

    goal = Goal(user_id=user.id, name='Emergency fund', target_amount=1000,
                start_amount=0, account_id=account.id)
    db.session.add(goal)
    db.session.commit()

    db.session.add_all([
        CategorySplit(expense_id=expense.id, category_id=category.id, amount=20),
        GoalAccount(goal_id=goal.id, account_id=account.id, start_amount=0),
        Budget(user_id=user.id, category_id=category.id, name='Food',
               amount=100, period='monthly', active=True,
               start_date=datetime.utcnow()),
        TransactionRule(user_id=user.id, name='Supermarket', pattern='tesco',
                        auto_category_id=category.id, auto_account_id=account.id,
                        priority=50, active=True),
    ])
    db.session.commit()
    return account, category, goal


def counts(user_id):
    return {
        'accounts': Account.query.filter_by(user_id=user_id).count(),
        'categories': Category.query.filter_by(user_id=user_id).count(),
        'expenses': Expense.query.filter_by(user_id=user_id).count(),
        'budgets': Budget.query.filter_by(user_id=user_id).count(),
        'goals': Goal.query.filter_by(user_id=user_id).count(),
        'rules': TransactionRule.query.filter_by(user_id=user_id).count(),
        # Scoped through their parents. Counting these globally made the
        # "other users are untouched" test compare 2 against 1 and fail for a
        # reason that had nothing to do with the subject.
        'splits': CategorySplit.query.join(
            Expense, CategorySplit.expense_id == Expense.id).filter(
            Expense.user_id == user_id).count(),
        'links': GoalAccount.query.join(
            Goal, GoalAccount.goal_id == Goal.id).filter(
            Goal.user_id == user_id).count(),
    }


@pytest.fixture
def demo_user(db):
    user = UserFactory(id=DEMO_EMAIL, is_demo_user=True)
    build_the_whole_graph(user)
    return user


def test_it_SUCCEEDS_with_the_whole_dependency_graph_present(demo_user, app):
    # Today this returns success=False with an FK violation logged, or leaves
    # orphans behind on an engine that does not enforce them.
    from src.services.demo.service import DemoService

    result = DemoService.reset_demo_user(DEMO_EMAIL)
    assert result['success'] is True, result


def test_it_leaves_NO_ORPHANS_pointing_at_deleted_rows(demo_user, app):
    from src.services.demo.service import DemoService

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()

    live_accounts = {a.id for a in Account.query.all()}
    live_categories = {c.id for c in Category.query.all()}

    for rule in TransactionRule.query.all():
        assert rule.auto_category_id in live_categories or rule.auto_category_id is None
        assert rule.auto_account_id in live_accounts or rule.auto_account_id is None
    for goal in Goal.query.all():
        assert goal.account_id in live_accounts or goal.account_id is None
    for link in GoalAccount.query.all():
        assert link.account_id in live_accounts
    for split in CategorySplit.query.all():
        assert split.category_id in live_categories
    for budget in Budget.query.all():
        assert budget.category_id in live_categories or budget.category_id is None


def test_it_RE_SEEDS_rather_than_just_emptying(demo_user, app):
    # A reset that deletes and does not re-seed turns the public demo into an
    # empty account, which is worse than a stale one.
    from src.services.demo.service import DemoService

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()

    after = counts(DEMO_EMAIL)
    assert after['accounts'] > 0, after
    assert after['categories'] > 0, after
    assert after['expenses'] > 0, after


def test_the_reseeded_categories_carry_their_SPENDING_GROUPS(demo_user, app):
    # The reset must not hand back a demo where every category is unsorted --
    # that is D-177, one seeder over.
    from src.services.demo.service import DemoService

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()

    classified = Category.query.filter(
        Category.user_id == DEMO_EMAIL,
        Category.spending_type.isnot(None)).count()
    assert classified > 0

    housing = Category.query.filter_by(user_id=DEMO_EMAIL, name='Housing',
                                       parent_id=None).first()
    if housing is not None:
        gas = Category.query.filter_by(user_id=DEMO_EMAIL, name='Gas',
                                       parent_id=housing.id).first()
        assert gas is not None and gas.spending_type == 'fixed'   # the bill


def test_only_the_named_demo_user_is_touched(db, app):
    # A reset that reaches another user's rows on a shared instance is a far
    # worse defect than the one it fixes.
    from src.services.demo.service import DemoService

    other = UserFactory(id='real@person.com')
    build_the_whole_graph(other)
    before = counts(other.id)

    demo = UserFactory(id=DEMO_EMAIL, is_demo_user=True)
    build_the_whole_graph(demo)

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()
    assert counts(other.id) == before


def test_it_refuses_a_user_who_is_not_a_demo_user(db, app):
    from src.services.demo.service import DemoService

    UserFactory(id='real2@person.com')
    result = DemoService.reset_demo_user('real2@person.com')
    assert result['success'] is False


def test_it_is_re_runnable(demo_user, app):
    from src.services.demo.service import DemoService

    assert DemoService.reset_demo_user(DEMO_EMAIL)['success'] is True
    assert DemoService.reset_demo_user(DEMO_EMAIL)['success'] is True


# --------------------------------------------------------------------------
# The assertion that survives the engine
# --------------------------------------------------------------------------

def test_THE_ORDER_ITSELF_every_dependant_is_deleted_before_its_parent(demo_user, app):
    """*** THIS IS THE ONLY TEST IN THIS FILE THAT CAN FAIL ON SQLITE. ***

    The seven above all passed against the broken function, because
    `tests/conftest.py` pins SQLite in memory and SQLite does not enforce
    foreign keys without `PRAGMA foreign_keys=ON`. The real defect was proven
    against Postgres 14, where the old order raised

        ForeignKeyViolation: update or delete on table "expenses" violates
        constraint "category_splits_expense_id_fkey"

    on the first statement. A gate that cannot see the defect it was written
    for is the shape this project keeps finding, so this one asserts the
    ORDER OF THE EMITTED DELETES rather than the outcome, and holds on either
    engine.
    """
    from sqlalchemy import event
    from src.services.demo.service import DemoService

    emitted = []

    def record(conn, cursor, statement, params, context, executemany):
        text = ' '.join(statement.split()).lower()
        if text.startswith('delete from'):
            emitted.append(text.split()[2].strip('"'))

    event.listen(db.engine, 'before_cursor_execute', record)
    try:
        assert DemoService.reset_demo_user(DEMO_EMAIL)['success'] is True
    finally:
        event.remove(db.engine, 'before_cursor_execute', record)

    def first(table):
        assert table in emitted, f'{table} was never deleted: {emitted}'
        return emitted.index(table)

    # Leaves before the rows they point at.
    assert first('category_splits') < first('expenses')
    assert first('goal_accounts') < first('goals')

    # Everything that references an account or a category, before those two.
    for dependant in ('transaction_rules', 'goals', 'expenses', 'budgets'):
        assert first(dependant) < first('accounts'), \
            f'{dependant} deleted after accounts: {emitted}'
        assert first(dependant) < first('categories'), \
            f'{dependant} deleted after categories: {emitted}'
