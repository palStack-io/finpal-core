"""Agent traffic is limited per token, not per IP.

Every request from one MCP server shares a source address, so an IP key would
either throttle a whole household together or not throttle an agent at all.
"""
from datetime import datetime, timedelta

from src.extensions import db, rate_limit_key
from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken
from tests.factories import UserFactory


def test_falls_back_to_the_remote_address_for_humans(app):
    with app.test_request_context('/', environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        assert rate_limit_key() == '10.1.2.3'


def test_uses_the_token_id_when_one_authenticated(app, db):
    user = UserFactory()
    token, _ = PersonalAccessToken.generate(
        user_id=user.id, name='n', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()

    with app.test_request_context('/', environ_base={'REMOTE_ADDR': '10.1.2.3'}):
        from flask import g
        g.pat = token
        key = rate_limit_key()

    assert key == 'pat:%d' % token.id
    assert '10.1.2.3' not in key


def test_two_tokens_from_one_address_get_separate_buckets(app, db):
    user = UserFactory()
    a, _ = PersonalAccessToken.generate(
        user_id=user.id, name='a', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    b, _ = PersonalAccessToken.generate(
        user_id=user.id, name='b', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()

    keys = []
    for token in (a, b):
        with app.test_request_context('/', environ_base={'REMOTE_ADDR': '10.1.2.3'}):
            from flask import g
            g.pat = token
            keys.append(rate_limit_key())

    assert keys[0] != keys[1]
