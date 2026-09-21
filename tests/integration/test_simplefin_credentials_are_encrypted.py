"""D-280: SimpleFin credentials must not be stored in plaintext.

*** THESE TESTS READ THE RAW COLUMN WITH SQL. THAT IS THE WHOLE POINT. ***
The defect survived for the life of the feature because both columns carried
a comment saying "encrypted" — so a reviewer saw the question already
answered. A round-trip test would have passed just as happily: it passes when
`set` and `get` are both the identity function, which is exactly what they
effectively were.

So every assertion here either reads the stored bytes directly, or drives the
real service call path and then reads the stored bytes directly.
"""

import pytest
from sqlalchemy import text

from src.extensions import db
from src.models.account import SimpleFin
from src.models.user import UserApiSettings
from tests.factories import UserFactory

ACCESS_URL = 'https://tokenuser:tokenpass@bridge.simplefin.org/simplefin'


@pytest.fixture
def test_user(db):
    return UserFactory()


def _raw_simplefin(user_id):
    return db.session.execute(
        text('SELECT access_url FROM "SimpleFin" WHERE user_id = :u'),
        {'u': user_id}).scalar()


def _raw_settings(user_id):
    return db.session.execute(
        text('SELECT simplefin_access_url FROM user_api_settings '
             'WHERE user_id = :u'), {'u': user_id}).scalar()


# --------------------------------------------------------------------------
# The columns
# --------------------------------------------------------------------------

def test_simplefin_access_url_is_not_stored_in_plaintext(db, test_user):
    row = SimpleFin(user_id=test_user.id, access_url=ACCESS_URL)
    db.session.add(row)
    db.session.commit()

    stored = _raw_simplefin(test_user.id)
    assert stored, 'nothing was stored at all'
    assert ACCESS_URL not in stored, (
        f'the access URL is in the database in the clear: {stored[:60]}')
    assert 'tokenpass' not in stored, 'the token is readable in the column'
    assert 'bridge.simplefin.org' not in stored


def test_the_constructor_encrypts_not_just_the_setter(db, test_user):
    """`SimpleFin(access_url=...)` is a real write path and must not bypass
    encryption — otherwise every caller has to remember, and the one that
    forgets writes a plaintext credential silently."""
    row = SimpleFin(user_id=test_user.id, access_url=ACCESS_URL)
    assert row.access_url != ACCESS_URL
    assert row.get_access_url() == ACCESS_URL


def test_it_decrypts_back(db, test_user):
    row = SimpleFin(user_id=test_user.id, access_url=ACCESS_URL)
    db.session.add(row)
    db.session.commit()
    db.session.expire_all()
    assert SimpleFin.query.filter_by(
        user_id=test_user.id).first().get_access_url() == ACCESS_URL


def test_user_api_settings_column_is_not_plaintext(db, test_user):
    s = UserApiSettings(user_id=test_user.id)
    s.set_simplefin_access_url(ACCESS_URL)
    db.session.add(s)
    db.session.commit()

    stored = _raw_settings(test_user.id)
    assert stored
    assert ACCESS_URL not in stored
    assert 'tokenpass' not in stored
    db.session.expire_all()
    assert UserApiSettings.query.filter_by(
        user_id=test_user.id).first().get_simplefin_access_url() == ACCESS_URL


def test_an_empty_credential_stays_null(db, test_user):
    """An encrypted empty string is a VALUE, and `hasSimplefinConnection`
    checks `is not None` — so it would report a connection that is not there."""
    row = SimpleFin(user_id=test_user.id, access_url=ACCESS_URL)
    row.set_access_url(None)
    assert row.access_url is None
    assert row.get_access_url() is None


# --------------------------------------------------------------------------
# The legacy window — every existing instance has plaintext today
# --------------------------------------------------------------------------

def test_a_pre_d280_plaintext_row_is_still_readable(db, test_user):
    """*** WRITTEN WITH RAW SQL, BECAUSE THE ORM CAN NO LONGER CREATE THE
    STATE PRODUCTION IS ACTUALLY IN. ***

    `set_access_url` encrypts, so an ORM-built "plaintext row" asserts
    nothing (this is D-155's lesson applied to a different column). Every
    instance upgrading to this release has rows in exactly this shape, and
    refusing to read them would take SimpleFin offline for all of them.
    """
    db.session.execute(
        text('INSERT INTO "SimpleFin" (user_id, access_url) VALUES (:u, :v)'),
        {'u': test_user.id, 'v': ACCESS_URL})
    db.session.commit()

    assert _raw_simplefin(test_user.id) == ACCESS_URL, 'fixture did not store plaintext'
    row = SimpleFin.query.filter_by(user_id=test_user.id).first()
    assert row.get_access_url() == ACCESS_URL


def test_an_undecryptable_non_url_is_refused_not_returned(db, test_user):
    """The legacy tolerance must be NARROW.

    A value that neither decrypts nor looks like a URL is a wrong key or
    corruption. Returning it would hand ciphertext to the SimpleFin client as
    if it were an access URL.
    """
    db.session.execute(
        text('INSERT INTO "SimpleFin" (user_id, access_url) VALUES (:u, :v)'),
        {'u': test_user.id, 'v': 'gAAAAABnotarealfernettoken'})
    db.session.commit()

    row = SimpleFin.query.filter_by(user_id=test_user.id).first()
    assert row.get_access_url() is None


# --------------------------------------------------------------------------
# The backfill — the half that fixes the credentials already exposed
# --------------------------------------------------------------------------

def test_the_backfill_encrypts_an_existing_plaintext_row(db, test_user):
    from src.services.account.simplefin_backfill import (
        backfill_simplefin_encryption)

    db.session.execute(
        text('INSERT INTO "SimpleFin" (user_id, access_url) VALUES (:u, :v)'),
        {'u': test_user.id, 'v': ACCESS_URL})
    db.session.commit()

    assert backfill_simplefin_encryption() == 1

    stored = _raw_simplefin(test_user.id)
    assert ACCESS_URL not in stored, 'the backfill did not encrypt the row'
    db.session.expire_all()
    assert SimpleFin.query.filter_by(
        user_id=test_user.id).first().get_access_url() == ACCESS_URL, (
        'the backfill encrypted it into something unreadable')


def test_the_backfill_is_idempotent(db, test_user):
    """Condition-keyed, not flag-keyed (D-178) — it runs on every boot."""
    from src.services.account.simplefin_backfill import (
        backfill_simplefin_encryption)

    db.session.execute(
        text('INSERT INTO "SimpleFin" (user_id, access_url) VALUES (:u, :v)'),
        {'u': test_user.id, 'v': ACCESS_URL})
    db.session.commit()

    assert backfill_simplefin_encryption() == 1
    first = _raw_simplefin(test_user.id)
    assert backfill_simplefin_encryption() == 0, 'second run converted again'
    assert _raw_simplefin(test_user.id) == first, 'second run double-encrypted'


def test_the_backfill_leaves_an_unreadable_value_alone(db, test_user):
    """Re-encrypting something we cannot read turns a recoverable key problem
    into permanent data loss."""
    from src.services.account.simplefin_backfill import (
        backfill_simplefin_encryption)

    junk = 'gAAAAABnotarealfernettoken'
    db.session.execute(
        text('INSERT INTO "SimpleFin" (user_id, access_url) VALUES (:u, :v)'),
        {'u': test_user.id, 'v': junk})
    db.session.commit()

    assert backfill_simplefin_encryption() == 0
    assert _raw_simplefin(test_user.id) == junk


def test_the_backfill_converts_the_settings_column_too(db, test_user):
    from src.services.account.simplefin_backfill import (
        backfill_simplefin_encryption)

    db.session.execute(
        text('INSERT INTO user_api_settings (user_id, simplefin_access_url) '
             'VALUES (:u, :v)'), {'u': test_user.id, 'v': ACCESS_URL})
    db.session.commit()

    assert backfill_simplefin_encryption() == 1
    assert ACCESS_URL not in _raw_settings(test_user.id)


# --------------------------------------------------------------------------
# The service path — where the defect actually lived
# --------------------------------------------------------------------------

def test_the_connect_flow_stores_ciphertext(db, test_user, monkeypatch):
    """`connect_simplefin` holds the assignment that proved the comment false.
    Drive it, then read the column."""
    from src.services.account.service import SimpleFinService

    # The class is `SimpleFin` in integrations.simplefin.client; service.py
    # imports it aliased as SimpleFinClient, which is NOT a patchable path.
    monkeypatch.setattr(
        'integrations.simplefin.client.SimpleFin.claim_access_url',
        lambda self, url: ACCESS_URL)
    monkeypatch.setattr(
        'integrations.simplefin.client.SimpleFin.test_access_url',
        lambda self, url: True)

    ok, _ = SimpleFinService().connect_simplefin(test_user.id, ACCESS_URL)
    assert ok

    stored = _raw_simplefin(test_user.id)
    assert stored and ACCESS_URL not in stored, (
        f'the connect flow stored plaintext: {(stored or "")[:60]}')
