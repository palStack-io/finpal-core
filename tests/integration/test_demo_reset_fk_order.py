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
from src.models.associations import account_owners, expense_tags
from src.models.budget import Budget
from src.models.category import Category, CategoryMapping, Tag
from src.models.goal import Goal
from src.models.goal_account import GoalAccount
from src.models.investment import Investment, InvestmentTransaction, Portfolio
from src.models.transaction import Expense, CategorySplit
from src.models.transaction_rule import TransactionRule
from src.models.user import User
from tests.factories import UserFactory


DEMO_EMAIL = 'demo1@finpal.demo'
CO_OWNER = 'co.owner@finpal.test'


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
        # *** THE FIVE THE FIRST FIX MISSED. *** Every one of them is in the FK
        # closure below, and NONE of them was in this fixture before -- which is
        # exactly why the eight tests here were green while the function still
        # died on Postgres. `demo2` and `demo3` reset cleanly on the live demo
        # only because they happened to own no portfolio; `demo1` and `demo4`
        # did, and both raised
        #     ForeignKeyViolation: update or delete on table "portfolios"
        #     violates constraint "investments_portfolio_id_fkey"
        CategoryMapping(user_id=user.id, keyword='tesco',
                        category_id=category.id),
    ])
    db.session.commit()

    portfolio = Portfolio(user_id=user.id, name='Brokerage',
                          account_id=account.id)
    tag = Tag(name=f'tag-for-{user.id}', user_id=user.id)
    db.session.add_all([portfolio, tag])
    db.session.commit()

    investment = Investment(portfolio_id=portfolio.id, symbol='VWRP',
                            shares=3, purchase_price=100, current_price=110)
    db.session.add(investment)
    db.session.commit()

    db.session.add(InvestmentTransaction(
        investment_id=investment.id, transaction_type='buy',
        shares=3, price=100))
    db.session.execute(expense_tags.insert().values(
        expense_id=expense.id, tag_id=tag.id))
    # *** THE CO-OWNER IS A DIFFERENT USER AND THAT DETAIL IS THE TEST. ***
    # A first version of this fixture co-owned the account with `user` itself,
    # and a sabotage that cleared `account_owners` by `user_id` instead of by
    # `account_id` sailed through all ten tests -- because with one user the two
    # predicates happen to agree. They do not agree on the live demo, where the
    # single row is `(account 1 owned by demo1, user demo2)`, and there the
    # `user_id` form deletes nothing and the account delete still fails.
    co_owner = User.query.filter_by(id=CO_OWNER).first()
    if co_owner is None:
        co_owner = UserFactory(id=CO_OWNER)
    db.session.execute(account_owners.insert().values(
        account_id=account.id, user_id=co_owner.id))
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


# --------------------------------------------------------------------------
# The delete set, DERIVED -- never spelled out
# --------------------------------------------------------------------------
#
# *** A HAND-WRITTEN LIST OF TABLES IS A SPELLING-KEYED GUARD AND IT WENT BLIND
# ONCE ALREADY. *** The first version of the order test below asserted against
# the literal tuple `('transaction_rules', 'goals', 'expenses', 'budgets')`, so
# `portfolios` -> `investments` -> `investment_transactions`, `account_owners`,
# `category_mappings` and `expense_tags` were invisible to it however broken the
# function was. The set below is computed from `db.metadata` instead, so a model
# added tomorrow with a foreign key into any of these six tables turns this file
# RED until `reset_demo_user` deletes it. Verified equal to the closure
# `pg_constraint` reports on the live demo database: fifteen tables.

CLOSURE_SEEDS = frozenset({'accounts', 'categories', 'portfolios',
                           'expenses', 'goals', 'budgets'})


def _blocks(fk):
    """True if this foreign key can actually REFUSE a delete.

    *** ADDED 2026-09-10 AFTER THIS GUARD CAUGHT A REAL DEFECT AND THEN ASKED
    FOR THE WRONG FIX. *** When it was written, every FK into `accounts` and
    `categories` was NO ACTION, so "references it" and "blocks deleting it"
    were the same thing and the distinction did not exist.

    learnPal's `learn_completions.unlocked_by_goal_id` is the first that is
    not: it is `ON DELETE SET NULL`, because an optional learning module must
    never be able to make a core deletion fail. The database releases the
    reference and the goal deletes cleanly, so demanding that `reset_demo_user`
    clear that table would be asking core to know about a module -- exactly the
    coupling the SET NULL exists to avoid.

    A guard that cannot tell a blocking edge from a released one grows a
    hard-coded exception list the first time it meets one, and that is how a
    derived guard turns back into a spelling-keyed one.
    """
    return (fk.ondelete or '').upper() not in ('SET NULL', 'CASCADE', 'SET DEFAULT')


def fk_closure():
    """Every table whose foreign key can REFUSE a delete of one the reset clears."""
    closure = set(CLOSURE_SEEDS)
    changed = True
    while changed:
        changed = False
        for table in db.metadata.sorted_tables:
            if table.name in closure:
                continue
            if any(fk.column.table.name in closure and _blocks(fk)
                   for fk in table.foreign_keys):
                closure.add(table.name)
                changed = True
    return closure


def fk_edges(closure):
    """(child, parent) for every FK inside the closure. Self-edges excluded --
    `categories.parent_id` points at `categories`, and the function handles it
    by deleting subcategories before parents in two statements on one table."""
    for table in db.metadata.sorted_tables:
        if table.name not in closure:
            continue
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if parent in closure and parent != table.name and _blocks(fk):
                yield table.name, parent


def deletes_emitted_by_a_reset():
    """Run a reset and return the table name of every DELETE, in order."""
    from sqlalchemy import event
    from src.services.demo.service import DemoService

    emitted = []

    def record(conn, cursor, statement, params, context, executemany):
        text = ' '.join(statement.split()).lower()
        if text.startswith('delete from'):
            emitted.append(text.split()[2].strip('"'))

    event.listen(db.engine, 'before_cursor_execute', record)
    try:
        result = DemoService.reset_demo_user(DEMO_EMAIL)
    finally:
        event.remove(db.engine, 'before_cursor_execute', record)
    assert result['success'] is True, result
    return emitted


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


def test_NO_ORPHANS_ANYWHERE_IN_THE_CLOSURE_derived_from_metadata(demo_user, app):
    """The half the order test cannot see: the right table, the wrong predicate.

    *** A SABOTAGE PASSED HERE AND THAT IS WHY THIS TEST EXISTS. *** Rewriting
    the `account_owners` delete to clear only `user_id == the demo user` --
    which deletes NOTHING, because a co-owner is by definition somebody else --
    left the test above completely green: `DELETE FROM account_owners` was
    still emitted, still in the right position, and the blocking row was still
    there. Only Postgres caught it. This sweep checks the DATA instead of the
    statement, so it holds on SQLite too, and like the closure itself it is
    derived rather than listed.
    """
    from sqlalchemy import text
    from src.services.demo.service import DemoService

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()

    orphans = {}
    for table in db.metadata.sorted_tables:
        if table.name not in fk_closure():
            continue
        for fk in table.foreign_keys:
            parent = fk.column.table
            if parent.name not in fk_closure():
                continue
            child_col, parent_col = fk.parent.name, fk.column.name
            count = db.session.execute(text(
                f'SELECT count(*) FROM {table.name} c '
                f'LEFT JOIN {parent.name} p ON c.{child_col} = p.{parent_col} '
                f'WHERE c.{child_col} IS NOT NULL AND p.{parent_col} IS NULL'
            )).scalar()
            if count:
                orphans[f'{table.name}.{child_col} -> {parent.name}'] = count

    assert not orphans, f'rows left pointing at deleted parents: {orphans}'


def test_the_CO_OWNERSHIP_of_a_deleted_account_goes_with_it(demo_user, app):
    """*** SQLITE REUSES ROWIDS AND THAT BLINDS THE ORPHAN SWEEP. ***

    Two guards above already failed to catch clearing `account_owners` by
    `user_id` instead of `account_id`. The order test could not see it because
    the DELETE was still emitted in the right place; the orphan sweep could not
    see it because SQLite hands the re-seeded account the same integer id the
    deleted one had, so the stale row lands back on a live parent and stops
    looking like an orphan. Postgres, whose sequences do not rewind, caught it
    both times.

    So this asserts the fact itself: the co-owner named on a deleted account is
    not a co-owner of anything afterwards. `CO_OWNER` is nobody the seeder ever
    recreates, so a surviving row can only be one the reset failed to clear.
    """
    from sqlalchemy import text
    from src.services.demo.service import DemoService

    before = db.session.execute(text(
        'SELECT count(*) FROM account_owners WHERE user_id = :u'),
        {'u': CO_OWNER}).scalar()
    assert before == 1, 'the fixture never created the co-ownership row'

    DemoService.reset_demo_user(DEMO_EMAIL)
    db.session.expire_all()

    after = db.session.execute(text(
        'SELECT count(*) FROM account_owners WHERE user_id = :u'),
        {'u': CO_OWNER}).scalar()
    assert after == 0, (
        'the co-ownership of a deleted account survived the reset -- on '
        'Postgres this is the row that makes the account delete fail')


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
    emitted = deletes_emitted_by_a_reset()

    def first(table):
        assert table in emitted, f'{table} was never deleted: {emitted}'
        return emitted.index(table)

    # Leaves before the rows they point at.
    assert first('category_splits') < first('expenses')
    assert first('goal_accounts') < first('goals')
    assert first('investment_transactions') < first('investments')
    assert first('investments') < first('portfolios')

    # Everything that references an account or a category, before those two.
    for dependant in ('transaction_rules', 'goals', 'expenses', 'budgets',
                      'portfolios', 'account_owners', 'category_mappings'):
        assert first(dependant) < first('accounts'), \
            f'{dependant} deleted after accounts: {emitted}'
    for dependant in ('transaction_rules', 'expenses', 'budgets',
                      'category_mappings', 'category_splits'):
        assert first(dependant) < first('categories'), \
            f'{dependant} deleted after categories: {emitted}'


def test_EVERY_TABLE_IN_THE_FK_CLOSURE_IS_DELETED_and_in_order(demo_user, app):
    """The guard that cannot go blind, because nothing in it is spelled out.

    *** THIS IS THE TEST #168 SHOULD HAVE HAD. *** That fix added the edge that
    fired and the suite stayed green, so the next four edges -- `investments`,
    `investment_transactions`, `account_owners`, `category_mappings`,
    `expense_tags` -- were found by a live reseed failing in production instead
    of by a test. Both the SET and the ORDER come from `db.metadata` here, so
    the only way to make this pass is to clear the whole closure.
    """
    closure = fk_closure()
    # Sanity: the derivation itself must not silently collapse. Measured
    # against `pg_constraint` on the live demo database on 2026-09-10.
    assert len(closure) == 15, sorted(closure)

    emitted = deletes_emitted_by_a_reset()

    missing = sorted(t for t in closure if t not in emitted)
    assert not missing, (
        f'these tables FK into the reset set and are never deleted: {missing}')

    def first(table):
        return emitted.index(table)

    out_of_order = [(child, parent) for child, parent in fk_edges(closure)
                    if first(child) > first(parent)]
    assert not out_of_order, (
        f'deleted after the row it points at: {out_of_order} -- order was '
        f'{emitted}')
