"""`flask create-admin --send-email` — the only caller of the welcome email.

*** THE ASSERTION CANNOT BE ON THE EXIT CODE, AND THAT IS THE WHOLE POINT. ***

The send sits inside `except Exception as e: click.echo(...)`, so the command
exits 0 and reports the admin created whether or not any mail went out. D-147 was
`EmailService(app.config)` against an `__init__` that takes no arguments — valid
Python, a TypeError at runtime, swallowed, and `src/cli.py` had no test at all. A
test that checked the exit code, or even that the command printed something, would
have passed against it for as long as it existed.

So this asserts on the CALL: the mailer was reached, with the values the operator
typed. Which is the repo's standing rule — assert on rendered output, a payload or
the database, never on a status code.
"""
import pytest

from src.cli import register_commands
from src.services.email_service import EmailService
from tests.factories import UserFactory


@pytest.fixture(autouse=True)
def commands(app):
    """`register_commands(app)` runs in `app.py`, NOT in `create_app()`.

    So the test app the suite builds has no CLI commands on it at all, and that is
    a large part of why `src/cli.py` had never been tested: an invoke against the
    fixture app answers `No such command 'create-admin'`, which reads as a broken
    test rather than a missing registration. Registered here explicitly, the same
    call the real entrypoint makes at import time.
    """
    register_commands(app)
    return app


def test_send_email_flag_actually_reaches_the_mailer(app, db, monkeypatch):
    calls = []
    monkeypatch.setattr(EmailService, 'send_welcome_email',
                        lambda self, **kw: calls.append(kw) or True)

    result = app.test_cli_runner().invoke(
        args=['create-admin', 'newadmin@test.com', 'hunter2',
              '--name', 'Ada', '--send-email'])

    assert result.exit_code == 0, result.output
    # The failure this file exists for is INVISIBLE in the output except as one
    # line of Python noise, so the output is checked for the absence of that noise
    # as well as for the presence of the success line.
    assert 'Error sending welcome email' not in result.output, result.output
    assert calls == [{
        'to_email': 'newadmin@test.com',
        'user_name': 'Ada',
        'login_link': f"{app.config.get('FRONTEND_URL', 'http://localhost')}/login",
    }]


def test_no_flag_sends_nothing(app, db, monkeypatch):
    """The negative half. A mailer called unconditionally passes the test above."""
    calls = []
    monkeypatch.setattr(EmailService, 'send_welcome_email',
                        lambda self, **kw: calls.append(kw) or True)

    result = app.test_cli_runner().invoke(
        args=['create-admin', 'quiet@test.com', 'hunter2'])

    assert result.exit_code == 0, result.output
    assert calls == []


def test_an_existing_user_is_not_overwritten(app, db, monkeypatch):
    """`create-admin` on an existing id must not silently reset their password."""
    existing = UserFactory(id='taken@test.com', name='Original')
    original_hash = existing.password_hash

    result = app.test_cli_runner().invoke(
        args=['create-admin', 'taken@test.com', 'newpassword'])

    assert 'already exists' in result.output
    db.session.expire(existing)
    assert existing.password_hash == original_hash
    assert existing.name == 'Original'
