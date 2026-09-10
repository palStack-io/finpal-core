"""
Two separate mechanisms, and both have burned this project.

1. The COLUMN reaches an existing database only via the boot reconcile, never via
   create_all() (D-121).
2. The DEFAULTS reach EXISTING users only via a condition-keyed backfill. D-178:
   a seed change is not shipped until a correction exists for the rows the old
   version wrote -- three times in one day.

*** THE BACKFILL IS KEYED TO A CONDITION, NEVER TO A VERSION STAMP. *** But the
plan's original condition -- "a SYSTEM category whose name is in the map and whose
spending_type is NULL" -- was backwards in two directions at once:

  - `is_system` DEFAULTS TO FALSE (category.py:20) and
    `create_default_categories` sets it only on "Other". So on a real signup the
    predicate matched ZERO rows, and "Other" maps to None so it was excluded
    anyway. The rows it DID match were demo rows, seeded by a different seeder
    with `is_system=True`.
  - Keyed by bare NAME it crossed the two seed sets, and `Gas` is the utility
    bill in one tree and petrol in the other.

*** AND THE PLAN'S OWN TESTS COULD NOT SEE EITHER BREAK, WHICH IS THE PART WORTH
REMEMBERING. *** Every fixture built its rows with `is_system=True` by hand, and
the "does not touch a user's own category" test used the name 'Boat maintenance',
which is absent from the map and therefore passes under ANY predicate. D-106's
shape: a helper green on its own test while every real call site bypasses it. The
tests below use names that ARE in the map, at `is_system=False`, which is the only
assertion that catches it.

*** THE ONCE-PER-INSTANCE GUARD. *** Clearing a category back to unsorted writes
NULL -- exactly what the backfill keys on -- and the backfill runs at EVERY boot,
so without a guard every restart silently re-defaults a choice the user just made.
The guard stays condition-keyed: if any category on this instance already carries
a spending_type, the backfill has taken effect and does nothing.
"""
import pytest

from src.models.category import Category
from src.services.category.spending_type import backfill_spending_types
from tests.factories import UserFactory


def cat(db, user, name, parent=None, **kw):
    row = Category(name=name, user_id=user.id,
                   parent_id=parent.id if parent else None, **kw)
    db.session.add(row)
    db.session.commit()
    return row


def reread(db, row):
    db.session.expire_all()
    return db.session.get(Category, row.id)


# --------------------------------------------------------------------------
# It works on the rows a REAL SIGNUP creates -- is_system=False
# --------------------------------------------------------------------------

def test_it_sets_a_signup_seeded_category_that_has_none(db):
    # *** THE ASSERTION THAT CATCHES THE is_system INVERSION. *** These rows are
    # exactly what create_default_categories writes: is_system defaulting to
    # False. A predicate keyed to is_system=True sets nothing here.
    user = UserFactory()
    housing = cat(db, user, 'Housing')
    rent = cat(db, user, 'Rent/Mortgage', parent=housing)
    assert rent.spending_type is None

    assert backfill_spending_types() >= 2
    assert reread(db, housing).spending_type == 'fixed'
    assert reread(db, rent).spending_type == 'fixed'


def test_is_system_is_IRRELEVANT_to_whether_a_row_is_backfilled(db):
    # The flag is False on signup rows and True on demo rows, so keying on it
    # picks the wrong population either way. Both must be backfilled.
    user = UserFactory()
    food = cat(db, user, 'Food')
    plain = cat(db, user, 'Groceries', parent=food, is_system=False)
    flagged = cat(db, user, 'Restaurants', parent=food, is_system=True)

    backfill_spending_types()
    assert reread(db, plain).spending_type == 'flexible'
    assert reread(db, flagged).spending_type == 'flexible'


def test_it_resolves_by_PATH_so_gas_the_bill_and_gas_the_petrol_differ(db):
    # *** THE COLLISION. *** One name, two parents, opposite groups. A bare-name
    # backfill writes 'flexible' onto a gas BILL.
    user = UserFactory()
    housing = cat(db, user, 'Housing')
    transport = cat(db, user, 'Transportation')
    bill = cat(db, user, 'Gas', parent=housing)
    petrol = cat(db, user, 'Gas', parent=transport)

    backfill_spending_types()
    assert reread(db, bill).spending_type == 'fixed'
    assert reread(db, petrol).spending_type == 'flexible'


def test_a_top_level_category_is_never_matched_by_a_CHILD_key(db):
    # A user's own top-level "Groceries" is not Food/Groceries and gets nothing.
    user = UserFactory()
    orphan = cat(db, user, 'Groceries')
    backfill_spending_types()
    assert reread(db, orphan).spending_type is None


# --------------------------------------------------------------------------
# What it must never touch
# --------------------------------------------------------------------------

def test_it_NEVER_overwrites_a_choice_the_user_made(db):
    # The user decided their groceries are fixed. That is theirs.
    user = UserFactory()
    food = cat(db, user, 'Food')
    groceries = cat(db, user, 'Groceries', parent=food, spending_type='fixed')

    backfill_spending_types()
    assert reread(db, groceries).spending_type == 'fixed'


def test_it_leaves_the_deliberately_unclassified_alone(db):
    user = UserFactory()
    health = cat(db, user, 'Health')
    fitness = cat(db, user, 'Fitness', parent=health)

    backfill_spending_types()
    assert reread(db, health).spending_type is None
    assert reread(db, fitness).spending_type is None


def test_it_does_not_touch_a_users_OWN_category(db):
    # Named to sit UNDER a mapped parent, so only the exact-path rule saves it.
    # 'Boat maintenance' would have passed under any predicate at all.
    user = UserFactory()
    housing = cat(db, user, 'Housing')
    own = cat(db, user, 'Moat cleaning', parent=housing)

    backfill_spending_types()
    assert reread(db, own).spending_type is None


def test_income_and_savings_are_left_alone_because_they_are_ABSENT(db):
    user = UserFactory()
    income = cat(db, user, 'Income')
    salary = cat(db, user, 'Salary', parent=income)
    savings = cat(db, user, 'Savings & Investments')

    backfill_spending_types()
    assert reread(db, income).spending_type is None
    assert reread(db, salary).spending_type is None
    assert reread(db, savings).spending_type is None


# --------------------------------------------------------------------------
# The once-per-instance guard
# --------------------------------------------------------------------------

def test_it_is_idempotent(db):
    user = UserFactory()
    housing = cat(db, user, 'Housing')
    cat(db, user, 'Utilities', parent=housing)

    first = backfill_spending_types()
    second = backfill_spending_types()
    assert first >= 1
    assert second == 0        # nothing left to do, and no churn


def test_UNSORTING_A_CATEGORY_SURVIVES_THE_NEXT_BOOT(db):
    # *** THE HOLE THE GUARD EXISTS FOR. *** Clearing a category back to unsorted
    # writes NULL, which is the backfill's own condition. Without the guard the
    # next boot -- every restart, every deploy -- silently reverses the decision
    # the user just made, and spec section 4 promises the opposite.
    user = UserFactory()
    food = cat(db, user, 'Food')
    groceries = cat(db, user, 'Groceries', parent=food)

    backfill_spending_types()                       # first boot: sets flexible
    assert reread(db, groceries).spending_type == 'flexible'

    groceries = reread(db, groceries)
    groceries.spending_type = None                  # the user un-sorts it
    db.session.commit()

    assert backfill_spending_types() == 0           # second boot
    assert reread(db, groceries).spending_type is None


def test_the_guard_is_keyed_to_DATA_not_to_a_version_stamp(db):
    # A single classified category anywhere means the feature has taken effect
    # here. Condition-keyed and re-runnable -- never a stored version (D-178).
    user = UserFactory()
    cat(db, user, 'Other', spending_type='flexible')   # any non-null value
    housing = cat(db, user, 'Housing')

    assert backfill_spending_types() == 0
    assert reread(db, housing).spending_type is None


def test_an_instance_with_no_categories_stays_ready_for_the_next_boot(db):
    # A fresh install has nothing to backfill, and the guard must NOT arm --
    # otherwise an instance that gains rows later never gets them defaulted.
    assert backfill_spending_types() == 0

    user = UserFactory()
    housing = cat(db, user, 'Housing')
    assert backfill_spending_types() == 1
    assert reread(db, housing).spending_type == 'fixed'


def test_it_never_raises_because_it_runs_at_boot(db, monkeypatch):
    # A bad row must not stop the app starting.
    #
    # *** THE FIRST VERSION OF THIS TEST WAS VACUOUS AND PASSED ANYWAY. *** It
    # ran against an empty `categories` table, so the function returned 0 from
    # the early exit and never reached the `except` at all. A seeded row and a
    # raise on the path the loop actually takes is what exercises it.
    import src.services.category.spending_type as mod

    user = UserFactory()
    housing = cat(db, user, 'Housing')

    def boom(*args, **kwargs):
        raise RuntimeError('a bad row')

    monkeypatch.setattr(mod, 'category_path', boom)
    assert backfill_spending_types() == 0
    assert reread(db, housing).spending_type is None


# --------------------------------------------------------------------------
# A new signup never depends on the backfill having run
# --------------------------------------------------------------------------

def test_a_new_signup_gets_the_defaults_without_the_backfill(db):
    # create_default_categories applies the map directly. Asserted against the
    # DATABASE, and on the real seeder rather than a hand-built fixture.
    from src.services.auth.service import AuthService

    user = UserFactory(id='signup@test.com')
    AuthService().create_default_categories(user.id)
    db.session.commit()

    def find_top(name):
        return Category.query.filter_by(user_id=user.id, name=name,
                                        parent_id=None).first()

    def find(name, parent_name):
        parent = find_top(parent_name)
        return Category.query.filter_by(user_id=user.id, name=name,
                                        parent_id=parent.id).first()

    # *** THE PARENTS, AND NOT ONLY THE CHILDREN. *** An earlier version of this
    # test asserted on children alone, so deleting the parent seeder's
    # `spending_type=` argument outright was a sabotage that PASSED. Spending
    # lands on a parent directly (budget.py:76 matches the parent's own id), so
    # an unclassified parent is real money in the wrong section.
    assert find_top('Housing').spending_type == 'fixed'
    assert find_top('Food').spending_type == 'flexible'
    assert find_top('Transportation').spending_type == 'flexible'
    assert find_top('Health').spending_type is None

    assert find('Rent/Mortgage', 'Housing').spending_type == 'fixed'
    assert find('Groceries', 'Food').spending_type == 'flexible'
    assert find('Gifts', 'Shopping').spending_type == 'non_monthly'
    # Petrol, under Transportation -- not the Housing utility.
    assert find('Gas', 'Transportation').spending_type == 'flexible'
    # Deliberately unsorted.
    assert find('Fitness', 'Health').spending_type is None
    assert Category.query.filter_by(user_id=user.id, name='Other').first() \
        .spending_type is None

    # And the backfill then has nothing to do.
    assert backfill_spending_types() == 0


def test_the_DEMO_seeder_applies_the_map_too(db):
    # *** D-177: A FEATURE SHIPPING WHILE THE DEMO SEED DOES NOT KNOW. *** The
    # demo is the one instance anyone browses, and it uses a different seeder
    # with a different 147-category set.
    from src.data.seed_defaults import load_default_categories

    user = UserFactory(id='demo@test.com')
    load_default_categories(user.id)

    def find(name, parent_name):
        parent = Category.query.filter_by(user_id=user.id, name=parent_name,
                                          parent_id=None).first()
        return Category.query.filter_by(user_id=user.id, name=name,
                                        parent_id=parent.id).first()

    def find_top(name):
        return Category.query.filter_by(user_id=user.id, name=name,
                                        parent_id=None).first()

    # Parents too -- see the note in the signup test above.
    assert find_top('Housing').spending_type == 'fixed'
    assert find_top('Debt & Loans').spending_type == 'fixed'
    assert find_top('Travel').spending_type == 'non_monthly'
    assert find_top('Miscellaneous').spending_type is None
    assert find_top('Income').spending_type is None

    assert find('Gas', 'Housing').spending_type == 'fixed'          # the bill
    assert find('Gas/Fuel', 'Transportation').spending_type == 'flexible'
    assert find('Credit Card Payment', 'Debt & Loans').spending_type == 'fixed'
    assert find('Groceries', 'Food & Dining').spending_type == 'flexible'
    assert find('Emergency Fund', 'Savings & Investments').spending_type is None
    assert find('Salary', 'Income').spending_type is None

    assert backfill_spending_types() == 0


@pytest.mark.parametrize('seeder', ['signup', 'demo'])
def test_no_seeded_row_is_left_for_the_backfill_to_find(db, seeder):
    # The strongest form: after either seeder, the backfill is a no-op. If it
    # finds work, the seeder and the map have drifted apart.
    user = UserFactory(id=f'{seeder}-drift@test.com')
    if seeder == 'signup':
        from src.services.auth.service import AuthService
        AuthService().create_default_categories(user.id)
        db.session.commit()
    else:
        from src.data.seed_defaults import load_default_categories
        load_default_categories(user.id)

    assert backfill_spending_types() == 0
