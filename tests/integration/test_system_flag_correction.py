"""
*** D-178 AGAIN, AND I WALKED INTO IT AFTER QUOTING IT ALL DAY. ***

D-182's fix changed `load_default_categories` so only "Other" is flagged
`is_system`. That fixes what the seeder writes FROM NOW ON and does nothing for
the rows the old version already wrote -- and `seed_demo_accounts` skips users
that exist, so a redeploy re-seeds nothing. The live demo's 588 categories would
have stayed uneditable behind a "fixed" defect.

That is exactly D-178: *a seed change is not shipped until a condition-keyed
correction exists for the rows the old version wrote.* I applied that lesson
carefully for `spending_type` in the same branch and then failed to apply it to
`is_system` eight commits later.

*** CONDITION-KEYED, NOT DEMO-KEYED. *** The condition is "a system category
whose name is not 'Other'". Any instance seeded through `load_default_categories`
has these -- not only the demo -- so a self-hoster who used that path is
corrected too. On a signup-seeded instance it matches nothing and is a no-op.

Safe because the ONLY writers of `is_system=True` are the two seeders:
`create_default_categories` (on "Other" alone) and `load_default_categories`.
`category/service.py:224` merely READS the flag to find the orphan fallback.
"""
from src.models.category import Category
from src.services.category.system_flag import correct_system_category_flag
from tests.factories import UserFactory


def cat(db, user, name, is_system):
    row = Category(name=name, user_id=user.id, is_system=is_system)
    db.session.add(row)
    db.session.commit()
    return row


def reread(db, row):
    db.session.expire_all()
    return db.session.get(Category, row.id)


def test_it_clears_the_flag_on_rows_the_OLD_seeder_wrote(db):
    user = UserFactory()
    groceries = cat(db, user, 'Groceries', True)
    housing = cat(db, user, 'Housing', True)

    assert correct_system_category_flag() == 2
    assert reread(db, groceries).is_system is False
    assert reread(db, housing).is_system is False


def test_it_NEVER_clears_the_flag_on_Other(db):
    # 'Other' is where orphaned transactions land when a category is deleted.
    # Clearing it would let a user delete the fallback and send those rows to
    # category_id NULL.
    user = UserFactory()
    other = cat(db, user, 'Other', True)

    correct_system_category_flag()
    assert reread(db, other).is_system is True


def test_the_orphan_fallback_still_resolves_afterwards(db):
    # The behaviour the flag exists for, asserted rather than assumed.
    user = UserFactory()
    cat(db, user, 'Other', True)
    cat(db, user, 'Groceries', True)

    correct_system_category_flag()
    fallback = Category.query.filter_by(name='Other', user_id=user.id,
                                        is_system=True).first()
    assert fallback is not None


def test_it_leaves_a_users_own_category_alone(db):
    user = UserFactory()
    own = cat(db, user, 'Boat maintenance', False)

    correct_system_category_flag()
    assert reread(db, own).is_system is False


def test_it_is_idempotent(db):
    user = UserFactory()
    cat(db, user, 'Groceries', True)
    cat(db, user, 'Other', True)

    first = correct_system_category_flag()
    second = correct_system_category_flag()
    assert first == 1
    assert second == 0


def test_a_signup_seeded_instance_is_a_NO_OP(db):
    # create_default_categories already flags only 'Other', so there is nothing
    # to correct and the function must not touch 28 healthy rows.
    from src.services.auth.service import AuthService

    user = UserFactory(id='signup-noop@test.com')
    AuthService().create_default_categories(user.id)
    db.session.commit()

    assert correct_system_category_flag() == 0
    assert Category.query.filter_by(user_id=user.id, name='Other').first().is_system is True


def test_it_never_raises_because_it_runs_at_boot(db, monkeypatch):
    import src.services.category.system_flag as mod

    user = UserFactory()
    groceries = cat(db, user, 'Groceries', True)

    def boom(*args, **kwargs):
        raise RuntimeError('a bad row')
    monkeypatch.setattr(mod, '_rows_to_correct', boom)

    assert correct_system_category_flag() == 0
    assert reread(db, groceries).is_system is True


def test_the_demo_becomes_editable_END_TO_END(db, client, auth_headers):
    """The whole point, asserted through the API rather than on the column.

    Seeds the OLD way -- every category flagged -- then corrects and renames
    one, which is the exact request that answered 400 on the live demo.
    """
    from src.data.default_categories import DEFAULT_CATEGORIES

    user = UserFactory(id='old-demo@test.com')
    parent = next(iter(DEFAULT_CATEGORIES))
    row = cat(db, user, parent, True)

    before = client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
                        json={'name': 'Renamed'})
    assert before.status_code == 400          # the shipped behaviour

    correct_system_category_flag()

    after = client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
                       json={'name': 'Renamed'})
    assert after.status_code == 200
    assert reread(db, row).name == 'Renamed'
