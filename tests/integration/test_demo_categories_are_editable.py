"""
D-182: every category on the public demo showed an Edit pencil that always
failed with 400 "System categories cannot be edited".

*** THE CAUSE WAS THE SEEDER, NOT THE RULE. *** `load_default_categories` set
`is_system=True` on all 147 of its categories, while `create_default_categories`
sets it on `"Other"` and nothing else. The two seeders disagreed about what the
flag MEANS, and the demo -- the one instance anyone browses -- ended up strictly
more locked down than a real install, with `CategoryManagement.tsx` offering an
edit affordance on every row that the server refused on every row.

The refusal itself is correct and stays: `"Other"` is where orphaned
transactions land when a category is deleted, so renaming or deleting it breaks
that lookup. Owner approved reserving the flag for `"Other"` on 2026-09-10,
knowing the side effect -- the other 146 demo categories become deletable.
"""
from src.models.category import Category
from tests.factories import UserFactory


def test_only_Other_is_seeded_as_a_system_category(db):
    from src.data.seed_defaults import load_default_categories

    user = UserFactory(id='demo-flag@test.com')
    load_default_categories(user.id)

    system = {c.name for c in Category.query.filter_by(
        user_id=user.id, is_system=True).all()}
    assert system == {'Other'}


def test_the_two_seeders_now_AGREE_about_what_the_flag_means(db):
    # *** THE ASSERTION THAT KEEPS THEM IN STEP. *** They disagreed for as long
    # as both have existed, and nothing compared them.
    from src.data.seed_defaults import load_default_categories
    from src.services.auth.service import AuthService

    demo = UserFactory(id='demo-agree@test.com')
    load_default_categories(demo.id)
    signup = UserFactory(id='signup-agree@test.com')
    AuthService().create_default_categories(signup.id)
    db.session.commit()

    def system_names(uid):
        return {c.name for c in Category.query.filter_by(
            user_id=uid, is_system=True).all()}

    assert system_names(demo.id) == system_names(signup.id) == {'Other'}


def test_a_demo_category_can_now_be_RENAMED_through_the_API(db, client, auth_headers):
    # The behaviour the defect was opened on, asserted against the DATABASE.
    from src.data.seed_defaults import load_default_categories

    user = UserFactory(id='demo-rename@test.com')
    load_default_categories(user.id)
    groceries = Category.query.filter_by(user_id=user.id, name='Groceries').first()

    response = client.put(f'/api/v1/categories/{groceries.id}',
                          headers=auth_headers(user),
                          json={'name': 'Food shopping'})
    assert response.status_code == 200
    db.session.expire_all()
    assert db.session.get(Category, groceries.id).name == 'Food shopping'


def test_Other_is_STILL_protected_because_orphans_land_there(db, client, auth_headers):
    from src.data.seed_defaults import load_default_categories

    user = UserFactory(id='demo-other@test.com')
    load_default_categories(user.id)
    # *** THE DEMO TREE'S ONLY "Other" IS `Miscellaneous/Other`, A CHILD. ***
    # The signup tree's is top-level. `delete_category`'s fallback looks it up
    # by name and flag without caring which, so both trees are covered -- but a
    # test that assumed `parent_id=None` found nothing here and failed for the
    # wrong reason.
    other = Category.query.filter_by(user_id=user.id, name='Other').first()
    assert other is not None and other.is_system is True

    response = client.put(f'/api/v1/categories/{other.id}',
                          headers=auth_headers(user), json={'name': 'Misc'})
    assert response.status_code == 400
    db.session.expire_all()
    assert db.session.get(Category, other.id).name == 'Other'


def test_the_orphan_fallback_can_still_FIND_an_Other_to_use(db):
    # `delete_category` looks up the fallback with `is_system=True`. Narrowing
    # the flag must not make that lookup fail -- which would send a deleted
    # category's transactions to category_id NULL.
    from src.data.seed_defaults import load_default_categories

    user = UserFactory(id='demo-fallback@test.com')
    load_default_categories(user.id)

    fallback = Category.query.filter_by(name='Other', user_id=user.id,
                                        is_system=True).first()
    assert fallback is not None


def test_the_spending_type_defaults_are_unaffected_by_the_flag_change(db):
    # The backfill and the seeder never keyed on is_system, so narrowing it must
    # change nothing about the groups. Asserted rather than assumed.
    from src.data.seed_defaults import load_default_categories
    from src.services.category.spending_type import backfill_spending_types

    user = UserFactory(id='demo-groups@test.com')
    load_default_categories(user.id)

    housing = Category.query.filter_by(user_id=user.id, name='Housing',
                                       parent_id=None).first()
    gas = Category.query.filter_by(user_id=user.id, name='Gas',
                                   parent_id=housing.id).first()
    assert gas.spending_type == 'fixed'          # the utility bill
    assert backfill_spending_types() == 0
