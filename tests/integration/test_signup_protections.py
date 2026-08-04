"""Two protections that were documented but did not exist.

`DISABLE_SIGNUPS` is in `.env.example` and the README as though it works. It was
read into config at `src/config.py:37` and then **never referenced anywhere**, so
a self-hoster who set it got no protection and no warning.

Password length was validated by a marshmallow schema (`min=8`) attached to the
flask-restx register handler — which is shadowed by the legacy blueprint and never
runs. Any non-empty string was accepted, including a single character.
"""
from src.extensions import db
from src.models.user import User
from tests.factories import UserFactory

REGISTER = '/api/v1/auth/register'
MIN_PASSWORD_LENGTH = 8


def test_a_short_password_is_refused(client, db):
    resp = client.post(REGISTER, json={
        'email': 'shorty@example.com', 'password': 'abc'})

    assert resp.status_code == 400, resp.get_data(as_text=True)[:200]
    assert 'password' in resp.get_json()['error'].lower()
    assert User.query.filter_by(id='shorty@example.com').first() is None


def test_the_boundary_is_eight_characters(client, db):
    seven = client.post(REGISTER, json={
        'email': 'seven@example.com', 'password': 'a' * 7})
    assert seven.status_code == 400

    eight = client.post(REGISTER, json={
        'email': 'eight@example.com', 'password': 'a' * 8})
    assert eight.status_code == 201, eight.get_data(as_text=True)[:200]


def test_the_error_says_what_is_required(client, db):
    """A refusal the user cannot act on is barely better than accepting it."""
    resp = client.post(REGISTER, json={
        'email': 'x@example.com', 'password': 'abc'})
    assert str(MIN_PASSWORD_LENGTH) in resp.get_json()['error']


def test_disable_signups_actually_blocks_the_first_signup(client, db, app):
    """The config key was dead. On an empty instance it must still hold."""
    app.config['DISABLE_SIGNUPS'] = True
    try:
        resp = client.post(REGISTER, json={
            'email': 'blocked@example.com', 'password': 'ValidPass123'})
        assert resp.status_code == 403, resp.get_data(as_text=True)[:200]
        assert User.query.filter_by(id='blocked@example.com').first() is None
    finally:
        app.config['DISABLE_SIGNUPS'] = False


def test_disable_signups_blocks_an_invited_signup_too(client, db, app):
    """Otherwise 'signups disabled' would still admit anyone with an invitation,
    which is not what the name says."""
    from src.models.invitation import Invitation

    inviter = UserFactory()  # an existing user, so the invitation path is live
    db.session.add(Invitation(
        email='invited@example.com', status='pending',
        invited_by=inviter.id, token='test-invite-token'))
    db.session.commit()

    app.config['DISABLE_SIGNUPS'] = True
    try:
        resp = client.post(REGISTER, json={
            'email': 'invited@example.com', 'password': 'ValidPass123'})
        assert resp.status_code == 403
        assert User.query.filter_by(id='invited@example.com').first() is None
    finally:
        app.config['DISABLE_SIGNUPS'] = False


def test_signups_work_normally_when_not_disabled(client, db, app):
    app.config['DISABLE_SIGNUPS'] = False
    resp = client.post(REGISTER, json={
        'email': 'allowed@example.com', 'password': 'ValidPass123'})
    assert resp.status_code == 201
