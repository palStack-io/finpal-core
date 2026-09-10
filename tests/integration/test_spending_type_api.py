"""
*** THE CLIENT CANNOT BE THE ONLY THING THAT VALIDATES THIS. *** D-99: a defect
reported in a client is a defect in every client until the SERVER refuses it.
Deleting an affordance is not removing a capability.

*** AND A SYSTEM CATEGORY MUST STILL BE CLASSIFIABLE. *** `update_category`
refuses every edit to a category with `is_system=True`, and the demo seeder sets
that flag on all 147 of its categories -- so without an exemption the feature is
INERT on the one instance anyone browses, and spec section 4's promise that "the
defaults are visible and editable from the first screen that shows them" is false
exactly where it is most looked at. Classifying is not renaming: the protection
exists so a user cannot rename or delete the 'Other' that orphaned transactions
fall back to, and a spending group has nothing to do with that.
"""
from src.models.category import Category
from tests.factories import UserFactory


def make(db, user, name, parent=None, **kw):
    row = Category(name=name, user_id=user.id,
                   parent_id=parent.id if parent else None, **kw)
    db.session.add(row)
    db.session.commit()
    return row


def reread(db, row_id):
    db.session.expire_all()
    return db.session.get(Category, row_id)


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------

def test_it_is_returned_on_the_list_payload(client, auth_headers, db):
    user = UserFactory()
    make(db, user, 'Rent/Mortgage', spending_type='fixed')
    body = client.get('/api/v1/categories/',
                      headers=auth_headers(user)).get_json()
    rent = next(c for c in body['categories'] if c['name'] == 'Rent/Mortgage')
    assert rent['spending_type'] == 'fixed'


def test_null_is_returned_as_null_not_omitted(client, auth_headers, db):
    # An omitted key and a null are different to a client, and "unsorted" has to
    # be distinguishable from "this backend is too old to know".
    user = UserFactory()
    make(db, user, 'Fitness')
    body = client.get('/api/v1/categories/',
                      headers=auth_headers(user)).get_json()
    fitness = next(c for c in body['categories'] if c['name'] == 'Fitness')
    assert 'spending_type' in fitness
    assert fitness['spending_type'] is None


def test_the_single_category_payload_carries_it_too(client, auth_headers, db):
    # A different handler that hand-builds its dict, so the schema does not
    # cover it and it has to be added separately.
    user = UserFactory()
    row = make(db, user, 'Gifts', spending_type='non_monthly')
    body = client.get(f'/api/v1/categories/{row.id}',
                      headers=auth_headers(user)).get_json()
    assert body['spending_type'] == 'non_monthly'


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------

def test_put_sets_it_and_the_DATABASE_agrees(client, auth_headers, db):
    user = UserFactory()
    row = make(db, user, 'Fitness')

    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'spending_type': 'fixed'})
    assert response.status_code == 200
    assert reread(db, row.id).spending_type == 'fixed'


def test_patch_sets_it_too(client, auth_headers, db):
    user = UserFactory()
    row = make(db, user, 'Fitness')
    client.patch(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
                 json={'spending_type': 'flexible'})
    assert reread(db, row.id).spending_type == 'flexible'


def test_put_can_clear_it_back_to_unsorted(client, auth_headers, db):
    # *** NULL IS A VALUE HERE, NOT AN ABSENCE. *** A handler reading this key
    # with `if value:` would silently ignore the clear.
    user = UserFactory()
    row = make(db, user, 'Fitness', spending_type='fixed')

    client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
               json={'spending_type': None})
    assert reread(db, row.id).spending_type is None


def test_an_edit_that_never_mentions_it_leaves_it_alone(client, auth_headers, db):
    user = UserFactory()
    row = make(db, user, 'Gifts', spending_type='non_monthly')

    client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
               json={'name': 'Presents'})
    after = reread(db, row.id)
    assert after.name == 'Presents'
    assert after.spending_type == 'non_monthly'


def test_post_accepts_it_on_creation(client, auth_headers, db):
    user = UserFactory()
    response = client.post('/api/v1/categories/', headers=auth_headers(user),
                           json={'name': 'Boat mooring',
                                 'spending_type': 'fixed'})
    assert response.status_code == 201
    row = Category.query.filter_by(name='Boat mooring').first()
    assert row.spending_type == 'fixed'


def test_a_created_category_defaults_to_unsorted_when_unspecified(client,
                                                                  auth_headers, db):
    # finPal does not guess a group from a name the user just invented.
    user = UserFactory()
    client.post('/api/v1/categories/', headers=auth_headers(user),
                json={'name': 'Groceries'})
    assert Category.query.filter_by(name='Groceries').first().spending_type is None


# --------------------------------------------------------------------------
# A SYSTEM category is classifiable, and still not renamable
# --------------------------------------------------------------------------

def test_a_SYSTEM_category_can_still_be_CLASSIFIED(client, auth_headers, db):
    # *** WITHOUT THIS THE FEATURE IS INERT ON THE DEMO. *** All 147 demo
    # categories carry is_system=True, and update_category refuses every edit to
    # one. Classifying is not renaming.
    user = UserFactory()
    row = make(db, user, 'Other', is_system=True)

    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'spending_type': 'flexible'})
    assert response.status_code == 200
    assert reread(db, row.id).spending_type == 'flexible'


def test_a_SYSTEM_category_still_cannot_be_RENAMED(client, auth_headers, db):
    # The protection that already existed must survive the exemption. 'Other' is
    # where orphaned transactions land when a category is deleted, and renaming
    # it breaks that lookup.
    user = UserFactory()
    row = make(db, user, 'Other', is_system=True)

    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'name': 'Whatever'})
    assert response.status_code == 400
    assert reread(db, row.id).name == 'Other'


def test_a_rename_smuggled_in_beside_a_classification_is_still_refused(client,
                                                                       auth_headers, db):
    # The exemption must be for the FIELD, not for the request. Otherwise
    # sending both keys buys a rename that would be refused on its own.
    user = UserFactory()
    row = make(db, user, 'Other', is_system=True)

    client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
               json={'name': 'Whatever', 'spending_type': 'flexible'})
    after = reread(db, row.id)
    assert after.name == 'Other'


# --------------------------------------------------------------------------
# Refusal
# --------------------------------------------------------------------------

def test_an_invalid_value_is_REFUSED_and_changes_nothing(client, auth_headers, db):
    user = UserFactory()
    row = make(db, user, 'Fitness', spending_type='fixed')

    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'spending_type': 'needs'})
    assert response.status_code == 400
    assert reread(db, row.id).spending_type == 'fixed'


def test_a_hyphen_is_refused_because_the_value_uses_an_underscore(client,
                                                                  auth_headers, db):
    # A guard keyed to a spelling goes blind. 'non-monthly' is not 'non_monthly'.
    user = UserFactory()
    row = make(db, user, 'Gifts')
    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'spending_type': 'non-monthly'})
    assert response.status_code == 400
    assert reread(db, row.id).spending_type is None


def test_the_refusal_names_the_three_values(client, auth_headers, db):
    # An error a client author can act on without reading the source.
    user = UserFactory()
    row = make(db, user, 'Gifts')
    body = client.put(f'/api/v1/categories/{row.id}', headers=auth_headers(user),
                      json={'spending_type': 'saving'}).get_json()
    message = str(body)
    for value in ('fixed', 'flexible', 'non_monthly'):
        assert value in message


def test_POST_also_refuses_an_invalid_value(client, auth_headers, db):
    # D-99: refusing it on PUT and accepting it on POST is the same defect one
    # verb over.
    user = UserFactory()
    response = client.post('/api/v1/categories/', headers=auth_headers(user),
                           json={'name': 'Moat', 'spending_type': 'needs'})
    assert response.status_code == 400
    assert Category.query.filter_by(name='Moat').first() is None


def test_a_non_string_is_refused_rather_than_stored(client, auth_headers, db):
    user = UserFactory()
    row = make(db, user, 'Gifts')
    response = client.put(f'/api/v1/categories/{row.id}',
                          headers=auth_headers(user),
                          json={'spending_type': 7})
    assert response.status_code == 400
    assert reread(db, row.id).spending_type is None
