"""A guess is labelled as one, and the label reaches instances already live.

*** THE OWNER DECIDED TO GUESS RATHER THAN LEAVE BLANK (2026-09-13). *** 128 of
the 145 seeded categories classify confidently; 17 did not, because the honest
answer depends on the person — Health, the fee rows, Personal, Other. The choice
was **guess, and label it a guess**.

The reasoning is `Account.type_source`'s (D-191): an inference is not the
defect; *rendering an inference as a statement* is (D-77 / D-108). And leaving
them NULL was not neutral either — an unclassified category drops out of every
spending-group total silently, so "no opinion" was a position too, just an
invisible one.

*** THE HARD PART IS NOT THE GUESS, IT IS DELIVERY. ***
`backfill_spending_types` carries a once-per-instance guard: *if any category
already has a spending_type, the feature has taken effect here.* That is correct
for what it does and makes it a **no-op on every stack that is already live** —
so the 17 values and the source column would reach nobody through it. This is
D-178 one layer on, and `backfill_spending_type_source` is the condition-keyed
correction that actually lands.
"""

import pytest
from sqlalchemy import text

from src.extensions import db as _db
from src.models.category import Category
from src.services.category.spending_type import (
    DEFAULT_SPENDING_TYPES,
    INFERRED_PATHS,
    backfill_spending_type_source,
    backfill_spending_types,
)
from tests.factories import UserFactory


@pytest.fixture
def user(db):
    return UserFactory(id='src@test.com', name='Source')


def _cat(user_id, name, spending_type=None, parent=None):
    c = Category(name=name, user_id=user_id, spending_type=spending_type,
                 parent_id=parent.id if parent else None)
    _db.session.add(c)
    _db.session.flush()
    return c


def _source_of(cat_id):
    """Read the column back, not the object we just wrote."""
    return _db.session.execute(
        text('SELECT spending_type_source FROM categories WHERE id = :i'),
        {'i': cat_id}).scalar()


def test_all_145_seeded_paths_now_have_an_answer(db):
    """The 17 NULLs are gone — that is the decision, in one assertion."""
    assert [k for k, v in DEFAULT_SPENDING_TYPES.items() if v is None] == []
    assert len(INFERRED_PATHS) == 17


def test_a_guessed_category_is_labelled_inferred(user):
    cat = _cat(user.id, 'Health')
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'inferred'
    # and the value itself was filled, because the earlier pass left it blank
    assert Category.query.get(cat.id).spending_type == DEFAULT_SPENDING_TYPES['Health']


def test_a_confident_default_is_labelled_default_not_inferred(user):
    """*** THE DISTINCTION IS THE WHOLE POINT. *** If everything were 'inferred'
    the Review page would ask the user to confirm 145 rows, which is not a
    review, it is a chore."""
    path, value = next((k, v) for k, v in DEFAULT_SPENDING_TYPES.items()
                       if v is not None and k not in INFERRED_PATHS and '/' not in k)
    cat = _cat(user.id, path, spending_type=value)
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'default'


def test_a_choice_that_differs_from_the_seed_is_labelled_user(user):
    """Somebody moved it, so it is theirs — and must never be re-defaulted."""
    path = next(k for k, v in DEFAULT_SPENDING_TYPES.items()
                if v == 'flexible' and '/' not in k)
    cat = _cat(user.id, path, spending_type='fixed')  # not the seeded value
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'user'
    assert Category.query.get(cat.id).spending_type == 'fixed'


def test_it_never_overwrites_a_label_the_user_owns(user):
    """*** THE SABOTAGE. *** Keyed on the slug alone this test fails."""
    cat = _cat(user.id, 'Health', spending_type='fixed')
    _db.session.commit()
    _db.session.execute(
        text("UPDATE categories SET spending_type_source = 'user' WHERE id = :i"),
        {'i': cat.id})
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'user'
    assert Category.query.get(cat.id).spending_type == 'fixed'


def test_a_CHOICE_on_one_of_the_17_is_labelled_user_not_inferred(user):
    """*** THE STATE EVERY LIVE ROW IS IN, AND THE ONE THE SABOTAGE BELOW MISSES.

    *** `test_it_never_overwrites_a_label_the_user_owns` pre-sets the source, so
    the row never matches `source IS NULL` and the first branch never runs. But
    the column is NEW -- so value-set/source-NULL is the state of EVERY row on
    every stack that is already live.

    On those stacks the seeder wrote NULL on all 17, so a value here can only
    have come from the user: somebody with a gym CONTRACT marking Health fixed,
    which is the exact case the 17 exist for. Calling that a guess is not merely
    impolite, it is the label a later pass would feel free to overwrite.
    """
    cat = _cat(user.id, 'Health', spending_type='fixed')   # source stays NULL
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'user'
    assert Category.query.get(cat.id).spending_type == 'fixed'


def test_the_SEEDED_guess_is_still_labelled_inferred(user):
    """The other side of it: a signup since 2026-09-13 carries the guess itself,
    and that one IS a guess and must be offered for review."""
    from src.services.category.spending_type import DEFAULT_SPENDING_TYPES
    cat = _cat(user.id, 'Health', spending_type=DEFAULT_SPENDING_TYPES['Health'])
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) == 'inferred'


def test_a_users_own_unclassified_category_gets_no_label(user):
    """There is no claim to label yet — NULL is the honest state."""
    cat = _cat(user.id, 'Llama grooming')
    _db.session.commit()

    backfill_spending_type_source()

    assert _source_of(cat.id) is None


def test_a_second_boot_changes_nothing(user):
    _cat(user.id, 'Health')
    _db.session.commit()
    backfill_spending_type_source()

    assert backfill_spending_type_source() == 0


def test_it_lands_on_an_instance_the_OTHER_backfill_has_already_skipped(user):
    """*** THE ONE THAT PROVES IT SHIPS. ***

    `backfill_spending_types` returns 0 the moment any category carries a
    spending_type — which is true of every live stack. If the source labels rode
    on that function they would reach nobody. This builds exactly that state and
    asserts the correction still lands.
    """
    classified = _cat(user.id, 'Groceries', spending_type='flexible')
    guessed = _cat(user.id, 'Health')          # one of the 17, still NULL
    _db.session.commit()

    # the guard fires: the instance looks "already done"
    assert backfill_spending_types() == 0
    assert Category.query.get(guessed.id).spending_type is None

    # ...and the correction lands anyway
    assert backfill_spending_type_source() > 0
    assert _source_of(guessed.id) == 'inferred'
    assert Category.query.get(guessed.id).spending_type is not None
    assert _source_of(classified.id) is not None
