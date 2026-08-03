"""The demo_restricted decorator must return 403, not blow up with a 500.

It lives on flask-restx Resource methods. Returning a Flask Response object from
one of those makes flask-restx try to JSON-serialise the Response itself, which
raises TypeError and surfaces to the caller as 500 Internal Server Error.
"""
import io
import json

from tests.factories import UserFactory


def _post_csv(client, headers):
    return client.post(
        '/api/v1/csv-import/import',
        data={
            'file': (io.BytesIO(b'Date,Description,Amount\n2026-01-15,X,-1.00\n'), 'x.csv'),
            'mapping': json.dumps({'date': 'Date', 'description': 'Description',
                                   'amount': 'Amount'}),
        },
        headers=headers,
        content_type='multipart/form-data',
    )


def test_demo_user_gets_403_not_500(client, db, auth_headers):
    demo_user = UserFactory(is_demo_user=True)

    resp = _post_csv(client, auth_headers(demo_user))

    assert resp.status_code == 403, (
        f'expected 403, got {resp.status_code} — a 500 here means the decorator '
        f'returned a Response object that flask-restx could not serialise'
    )
    body = resp.get_json()
    assert body['code'] == 'DEMO_RESTRICTED'
    assert 'demo' in body['error'].lower()


def test_non_demo_user_is_not_blocked(client, db, auth_headers):
    normal_user = UserFactory(is_demo_user=False)

    resp = _post_csv(client, auth_headers(normal_user))

    assert resp.status_code == 200
    assert resp.get_json()['imported'] == 1
