"""The transaction detail route must resolve to the handler that is correct.

Two blueprints claimed `/api/v1/transactions/<id>`: the legacy
`transaction_api` (registered first, so it won) and the flask-restx
`TransactionDetail` (dead code). They are not equivalent — the restx handler
applies each field only `if 'field' in data`, while the legacy one was written
for an HTML form POST where every field is always present.

Retiring the legacy detail routes is safe because **no component in either client
calls them**: web-ui's `updateTransaction`/`getTransaction` are referenced only by
a contract test, and mobile's equivalents are unused. Verified by grep before
making the change.
"""
from datetime import datetime

from src.extensions import db
from src.models.category import Category
from src.models.transaction import Expense
from tests.factories import UserFactory


def _expense(db, user, **kw):
    fields = dict(
        description='Original', amount=10.0, date=datetime(2026, 7, 1),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal')
    fields.update(kw)
    e = Expense(**fields)
    db.session.add(e)
    db.session.commit()
    return e


def test_the_detail_route_resolves_to_the_restx_handler(app):
    """Both slash forms, both verbs. If this fails, one handler is dead again."""
    adapter = app.url_map.bind('localhost')
    for path in ('/api/v1/transactions/5', '/api/v1/transactions/5/'):
        for method in ('GET', 'PUT', 'DELETE'):
            endpoint, _ = adapter.match(path, method=method)
            assert endpoint.startswith('api.'), (
                '%s %s resolves to %s, not the flask-restx handler'
                % (method, path, endpoint))


def test_the_detail_route_is_no_longer_duplicated(app):
    shapes = {}
    for rule in app.url_map.iter_rules():
        path = str(rule.rule)
        if path.startswith('/api/v1/transactions/<'):
            shapes.setdefault('detail', set()).add(rule.endpoint)
    assert len(shapes.get('detail', set())) == 1, (
        'transaction detail is still served by more than one handler: %s'
        % shapes.get('detail'))


def test_a_partial_update_over_http_changes_only_what_was_sent(
        client, db, auth_headers):
    """The behaviour the routing change buys: the restx handler does this
    correctly, the legacy one could not."""
    user = UserFactory()
    food = Category(name='Food', user_id=user.id)
    db.session.add(food)
    db.session.flush()
    expense = _expense(db, user, category_id=food.id, notes='keep me')

    resp = client.put('/api/v1/transactions/%d' % expense.id,
                      json={'description': 'Renamed'},
                      headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    db.session.refresh(expense)
    assert expense.description == 'Renamed'
    assert expense.amount == 10.0, 'amount changed on a partial update'
    assert expense.category_id == food.id, 'category cleared on a partial update'
    assert expense.notes == 'keep me', 'notes cleared on a partial update'


def test_get_and_delete_still_work_over_http(client, db, auth_headers):
    user = UserFactory()
    expense = _expense(db, user)

    got = client.get('/api/v1/transactions/%d' % expense.id,
                     headers=auth_headers(user))
    assert got.status_code == 200, got.get_data(as_text=True)[:200]

    gone = client.delete('/api/v1/transactions/%d' % expense.id,
                         headers=auth_headers(user))
    assert gone.status_code == 200, gone.get_data(as_text=True)[:200]
    assert Expense.query.filter_by(id=expense.id).first() is None


def test_a_housemates_transaction_is_found_and_then_refused(client, db, auth_headers):
    """**Rewritten deliberately for D-18 items B+D, not quietly deleted.**

    This used to be `test_another_users_transaction_is_not_reachable` and asserted
    404 on all three verbs, because transactions were per-user. Under the model the
    owner settled on 2026-08-06 a row belongs to whoever owns its account and reads
    are household-wide, so `UserFactory()` here is a *housemate*, not an intruder:
    the row is legitimately visible.

    **The status matters more than it looks.** A refusal is 403 — the row must be
    FOUND and then refused. Answering 404 would mean the read scope had silently
    narrowed, which is D-43, and it is the reason this file keeps a test on the
    subject at all rather than losing one. The isolation half now lives in
    `test_a_demo_account_still_cannot_reach_the_household` below, keyed to the
    boundary that still exists.
    """
    owner = UserFactory()
    housemate = UserFactory()
    expense = _expense(db, owner, description='Private')

    resp = client.get('/api/v1/transactions/%d' % expense.id,
                      headers=auth_headers(housemate))
    assert resp.status_code == 200, 'a housemate could not open a row they can see'

    resp = client.delete('/api/v1/transactions/%d' % expense.id,
                         headers=auth_headers(housemate))
    assert resp.status_code == 403, 'refusal must be 403, never 404'

    resp = client.put('/api/v1/transactions/%d' % expense.id,
                      json={'description': 'Hijacked'},
                      headers=auth_headers(housemate))
    assert resp.status_code == 403
    db.session.refresh(expense)
    assert expense.description == 'Private'


def test_a_demo_account_still_cannot_reach_the_household(client, db, auth_headers):
    """The isolation this file used to get from per-user scoping, re-keyed.

    A demo account is on the instance but is NOT a household member, and it signs in
    with a password published in this repository. It is the boundary that survived
    the change, so it is what the leak test is keyed to now.
    """
    owner = UserFactory()
    demo = UserFactory(id='demo-routing@finpal.demo', is_demo_user=True)
    expense = _expense(db, owner, description='Private')

    for call, method in ((client.get, 'GET'), (client.delete, 'DELETE')):
        resp = call('/api/v1/transactions/%d' % expense.id,
                    headers=auth_headers(demo))
        assert resp.status_code == 404, '%s leaked the household to a demo login' % method

    db.session.refresh(expense)
    assert expense.description == 'Private'
