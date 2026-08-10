"""D-74 — `category_id` was optional in three layers and NOT NULL in the database.

`BudgetInput.category_id` was `fields.Int(allow_none=True)`, the handler read
`validated.get('category_id')`, and web-ui typed it `category_id?: number` —
while `Budget.category_id` is `nullable=False` with no default. Omitting it
raised `IntegrityError: NOT NULL constraint failed` which the route caught and
returned as **400 "Error adding budget"**, naming neither the field nor the cause.

**Owner decision 2026-08-10: the API is wrong, not the column.** Every client
already requires a category — the web form enforces it and mobile has no create
form — so the schema is brought in line with the database rather than the other
way round. No migration, and no behaviour change for anything that already works.
"""
from tests.factories import UserFactory

URL = '/api/v1/budgets/'


def test_creating_a_budget_without_a_category_is_a_named_validation_error(
        client, db, auth_headers):
    """The 400 must say WHICH field, not "Error adding budget".

    An opaque message is why this survived: the failure looked like any other
    rejected create.
    """
    user = UserFactory()
    resp = client.post(URL, headers=auth_headers(user),
                       json={'name': 'No category', 'amount': 100, 'period': 'monthly'})

    assert resp.status_code == 400
    body = resp.get_json()
    blob = str(body).lower()
    assert 'category_id' in blob, f'the error does not name the field: {body}'
    assert 'error adding budget' not in blob, (
        f'still the opaque IntegrityError message rather than validation: {body}')


def test_creating_a_budget_with_a_category_still_works(client, db, auth_headers):
    """The inverse case, so the fix cannot degrade into "refuse everything"."""
    from src.extensions import db as _db
    from src.models.category import Category

    user = UserFactory()
    cat = Category(name='Groceries', user_id=user.id)
    _db.session.add(cat)
    _db.session.commit()

    resp = client.post(URL, headers=auth_headers(user),
                       json={'name': 'Food', 'amount': 100, 'period': 'monthly',
                             'category_id': cat.id})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert resp.get_json()['budget']['category_id'] == cat.id
