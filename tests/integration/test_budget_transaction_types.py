"""
D-183: a budget counted INCOME and TRANSFERS as money spent.

*** THE REALISTIC TRIGGER IS A REFUND, NOT A CONTRIVANCE. *** A refund is
normally recorded as `income` against the category it came back from, so
returning a coat INCREASED your reported clothing spend by its price -- the
figure moved the wrong way, by twice the amount.

`Budget.calculate_spent_amount()` filtered on the household, the date window and
the category, and never on `Expense.transaction_type` -- while
`Budget.transaction_types` has existed all along, is a comma-separated list, and
DEFAULTS TO 'expense'. A column the schema wrote and nothing read.

*** THIS MOVES EVERY BUDGET FIGURE IN THE APPLICATION, WHICH IS WHY IT IS ITS OWN
COMMIT AND ITS OWN TESTS. *** Owner approved the change 2026-09-10 knowing the
numbers shift. They shift toward correct.

Measured before the fix: 100 expense + 5000 income + 70 transfer on a 600 budget
reported 5170.00 spent and -4570.00 remaining.
"""
from datetime import datetime

from src.models.budget import Budget
from src.models.category import Category
from src.models.transaction import Expense
from tests.factories import UserFactory


def setup(db, transaction_types=None, amount=600.0):
    user = UserFactory()
    cat = Category(name='Clothing', user_id=user.id)
    db.session.add(cat)
    db.session.commit()
    kwargs = {} if transaction_types is None else {'transaction_types': transaction_types}
    budget = Budget(user_id=user.id, category_id=cat.id, name='Clothes',
                    amount=amount, period='monthly', active=True,
                    include_subcategories=True, start_date=datetime.utcnow(),
                    **kwargs)
    db.session.add(budget)
    db.session.commit()
    return user, cat, budget


def file(db, user, cat, amount, kind):
    db.session.add(Expense(description=kind, amount=amount, date=datetime.utcnow(),
                           user_id=user.id, paid_by=user.id, category_id=cat.id,
                           transaction_type=kind, currency_code='USD',
                           split_method='none', card_used='Test Card'))
    db.session.commit()


def test_the_exact_case_the_defect_was_opened_on(db):
    user, cat, budget = setup(db)
    file(db, user, cat, 100.0, 'expense')
    file(db, user, cat, 5000.0, 'income')
    file(db, user, cat, 70.0, 'transfer')

    # Was 5170.00 / -4570.00.
    assert float(budget.get_spent()) == 100.0
    assert float(budget.get_remaining()) == 500.0


def test_A_REFUND_REDUCES_NOTHING_BUT_IT_MUST_NOT_INCREASE_SPEND(db):
    # The honest behaviour for a refund is its own question -- arguably it should
    # come OFF the total. What is not arguable is that it must not go ON.
    user, cat, budget = setup(db)
    file(db, user, cat, 90.0, 'expense')
    before = float(budget.get_spent())
    file(db, user, cat, 90.0, 'income')      # returned the coat
    assert float(budget.get_spent()) == before


def test_a_transfer_between_accounts_is_not_spending(db):
    user, cat, budget = setup(db)
    file(db, user, cat, 400.0, 'transfer')
    assert float(budget.get_spent()) == 0.0


def test_the_default_is_expense_when_the_column_is_NULL(db):
    # *** WRITTEN WITH RAW SQL, BECAUSE THE ORM CANNOT PRODUCE THE NULL
    # PRODUCTION HAS. *** `transaction_types` carries a Python-side
    # default='expense', so an ORM-built row is never NULL and a test that built
    # one would assert nothing about the rows already in the database.
    from sqlalchemy import text
    from src.extensions import db as _db

    user, cat, budget = setup(db)
    _db.session.execute(text('UPDATE budgets SET transaction_types = NULL WHERE id = :i'),
                        {'i': budget.id})
    _db.session.commit()
    _db.session.expire_all()
    reread = _db.session.get(Budget, budget.id)
    assert reread.transaction_types is None

    file(db, user, cat, 100.0, 'expense')
    file(db, user, cat, 5000.0, 'income')
    assert float(reread.get_spent()) == 100.0


def test_an_empty_string_also_falls_back_to_expense(db):
    user, cat, budget = setup(db, transaction_types='')
    file(db, user, cat, 100.0, 'expense')
    file(db, user, cat, 5000.0, 'income')
    assert float(budget.get_spent()) == 100.0


def test_a_budget_that_ASKS_for_income_still_gets_it(db):
    # The column is honoured, not overridden. If someone deliberately tracks
    # both, that is theirs -- the defect was ignoring the column, not the value.
    user, cat, budget = setup(db, transaction_types='expense,income')
    file(db, user, cat, 100.0, 'expense')
    file(db, user, cat, 50.0, 'income')
    assert float(budget.get_spent()) == 150.0


def test_whitespace_in_the_list_is_tolerated(db):
    user, cat, budget = setup(db, transaction_types=' expense , transfer ')
    file(db, user, cat, 100.0, 'expense')
    file(db, user, cat, 70.0, 'transfer')
    file(db, user, cat, 5000.0, 'income')
    assert float(budget.get_spent()) == 170.0


def test_a_subcategory_rollup_obeys_the_same_filter(db):
    # budget.py:72 rolls one level up; the type filter must apply there too or
    # the defect survives one level down from where it was fixed.
    user, cat, budget = setup(db)
    child = Category(name='Shoes', user_id=user.id, parent_id=cat.id)
    db.session.add(child)
    db.session.commit()
    file(db, user, child, 60.0, 'expense')
    file(db, user, child, 5000.0, 'income')
    assert float(budget.get_spent()) == 60.0


# --------------------------------------------------------------------------
# The SECOND query, which the first fix did not reach
# --------------------------------------------------------------------------

def test_A_SPLIT_INCOME_ROW_ALSO_STOPS_COUNTING_AS_SPEND(db):
    """*** THE DEFECT SURVIVED ONE QUERY DOWN FROM WHERE IT WAS FIXED. ***

    `calculate_spent_amount` has TWO queries: plain expenses, and `CategorySplit`
    rows joined back to their expense. Only the first one was given the
    transaction_type filter; the second still counted an income row whose amount
    is carried by splits. Same defect, same method, eight lines apart.

    D-99's rule one function over: fixing the reported half is not fixing the
    defect. `test_the_inverse_of_the_symptom` found two unreported sandbox leaks
    the same way.
    """
    from src.models.transaction import CategorySplit

    user, cat, budget = setup(db)
    file(db, user, cat, 100.0, 'expense')

    refund = Expense(description='refund, split across two lines', amount=90.0,
                     date=datetime.utcnow(), user_id=user.id, paid_by=user.id,
                     category_id=cat.id, transaction_type='income',
                     currency_code='USD', split_method='none',
                     card_used='Test Card', has_category_splits=True)
    db.session.add(refund)
    db.session.commit()
    db.session.add(CategorySplit(expense_id=refund.id, category_id=cat.id,
                                 amount=90.0, description='the coat'))
    db.session.commit()

    assert float(budget.get_spent()) == 100.0


def test_a_split_EXPENSE_is_still_counted(db):
    # The filter must not throw the real ones out with the income.
    from src.models.transaction import CategorySplit

    user, cat, budget = setup(db)
    purchase = Expense(description='big shop, split', amount=120.0,
                       date=datetime.utcnow(), user_id=user.id, paid_by=user.id,
                       category_id=cat.id, transaction_type='expense',
                       currency_code='USD', split_method='none',
                       card_used='Test Card', has_category_splits=True)
    db.session.add(purchase)
    db.session.commit()
    db.session.add(CategorySplit(expense_id=purchase.id, category_id=cat.id,
                                 amount=120.0, description='shoes'))
    db.session.commit()

    assert float(budget.get_spent()) == 120.0
