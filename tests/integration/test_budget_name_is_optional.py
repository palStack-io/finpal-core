"""D-78 — the web UI could not create a budget at all, for any user.

`web-ui/src/pages/BudgetsMinimal.tsx:260` sends `name: '', // Optional name`, and the
form has **no name input** — its fields are category, amount, start date and a rollover
checkbox. `BudgetInput.name` was `required=True, Length(min=1, max=100)`, so every submit
answered **400 `{"name": ["Length must be between 1 and 100."]}`**.

**Owner decision, following D-74's precedent in this same schema: THE API FOLLOWS THE
DATABASE.** `Budget.name` is `VARCHAR(100)` **nullable**, so *optional* is what the column
already says and the schema was the layer out of step. D-74 moved `category_id` the other
way for the same reason — the column is `NOT NULL`, so the schema became required. One
principle, applied twice, in opposite directions, because the columns differ.

The alternative — generating a name from the selected category — was refused: it invents
data the user never typed, which is its own defect class in this audit.

Found by the web interaction pass (`tests/contract/interaction_walk.js`), the first check
here that ever submitted a form. Every existing budget test supplies a name, which is
exactly why 1140 green tests never saw it: **the only reader that omits one is the web
form, and nothing tested the web form's payload.**
"""
from src.extensions import db as _db
from src.models.budget import Budget
from src.models.category import Category
from tests.factories import UserFactory

URL = '/api/v1/budgets/'


def _category(owner, name='Groceries'):
    cat = Category(name=name, user_id=owner.id)
    _db.session.add(cat)
    _db.session.commit()
    return cat


def test_the_web_forms_exact_payload_creates_a_budget(client, db, auth_headers):
    """The literal body `BudgetsMinimal.tsx:260` sends, `name: ''` included.

    This is the regression test proper: it fails if anyone restores a minimum length
    on `name`, and it is written as the payload rather than as "a budget with no name"
    so that it keeps testing the thing the browser actually posts.
    """
    user = UserFactory()
    cat = _category(user)

    resp = client.post(URL, headers=auth_headers(user), json={
        'name': '', 'amount': 321, 'period': 'monthly',
        'category_id': cat.id, 'start_date': '2026-08-10',
        'is_active': True, 'rollover': False,
    })

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    # Assert on the row, not the status: a create that answers 201 and writes nothing
    # is the shape this project keeps finding.
    row = Budget.query.filter_by(user_id=user.id, category_id=cat.id).one()
    assert float(row.amount) == 321.0


def test_a_budget_can_be_created_with_the_name_omitted_entirely(client, db, auth_headers):
    """Absent, not merely empty — a client that leaves the key out is equally valid."""
    user = UserFactory()
    cat = _category(user, 'Transport')

    resp = client.post(URL, headers=auth_headers(user), json={
        'amount': 50, 'period': 'monthly', 'category_id': cat.id,
    })

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert Budget.query.filter_by(user_id=user.id, category_id=cat.id).count() == 1


def test_an_over_long_name_is_still_refused(client, db, auth_headers):
    """The inverse case, so this fix cannot degrade into "accept anything".

    `Budget.name` is `VARCHAR(100)`; the schema must still hold that ceiling or an
    over-long name reaches the column and fails as an opaque 400 instead of a named
    validation error — which is precisely the failure mode D-74 was opened for.
    """
    user = UserFactory()
    cat = _category(user, 'Long')

    resp = client.post(URL, headers=auth_headers(user), json={
        'name': 'x' * 101, 'amount': 10, 'period': 'monthly', 'category_id': cat.id,
    })

    assert resp.status_code == 400
    assert 'name' in str(resp.get_json()).lower()
