"""Unit tests for the CSV import models."""
import pytest

from src.extensions import db
from src.models.import_source import ImportBatch, ImportProfile, ImportSource
from tests.factories import UserFactory


def test_source_round_trips_json_config(db):
    user = UserFactory()
    src = ImportSource(kind='local_folder', config={'path': '/data/inbox'},
                       user_id=user.id)
    db.session.add(src)
    db.session.commit()
    assert ImportSource.query.one().config['path'] == '/data/inbox'
    assert ImportSource.query.one().enabled is True
    assert ImportSource.query.one().scan_interval_minutes == 5


def test_profile_fingerprint_is_unique(db):
    user = UserFactory()
    for _ in range(2):
        db.session.add(ImportProfile(
            name='Chase', header_fingerprint='abc123',
            mapping={'date': 'Date'}, user_id=user.id))
    with pytest.raises(Exception):
        db.session.commit()
    db.session.rollback()


def test_batch_file_hash_is_unique(db):
    """The UNIQUE constraint is what arbitrates concurrent scans."""
    user = UserFactory()
    for _ in range(2):
        db.session.add(ImportBatch(
            filename='chase.csv', file_hash='deadbeef',
            status='success', user_id=user.id))
    with pytest.raises(Exception):
        db.session.commit()
    db.session.rollback()


def test_expense_carries_a_batch_id(db):
    from datetime import datetime
    from src.models.transaction import Expense
    user = UserFactory()
    batch = ImportBatch(filename='c.csv', file_hash='h1', status='success',
                        user_id=user.id)
    db.session.add(batch)
    db.session.flush()
    exp = Expense(description='X', amount=1.0, date=datetime(2026, 1, 1),
                  user_id=user.id, paid_by=user.id, card_used='',
                  split_method='equal', import_batch_id=batch.id)
    db.session.add(exp)
    db.session.commit()
    assert Expense.query.one().import_batch_id == batch.id


def test_from_oidc_is_a_real_method_not_a_monkeypatch():
    """from_oidc must be defined on User, not attached at startup.

    It used to be installed by integrations.oidc.user.extend_user_model(), which
    made it ungreppable — and that is exactly how the OIDC_ENABLED bug hid: the
    attach happened inside `if oidc_enabled`, so with OIDC off every native Apple
    sign-in raised AttributeError. A real classmethod cannot be conditionally
    absent.
    """
    from src.models.user import User

    assert hasattr(User, 'from_oidc'), 'User.from_oidc is missing'
    assert isinstance(vars(User).get('from_oidc'), classmethod)
    # The discriminator: a monkeypatched method also lands in vars(User), but it
    # carries the module it was *defined* in.
    defined_in = User.from_oidc.__func__.__module__
    assert defined_in == 'src.models.user', (
        f'from_oidc is defined in {defined_in}, so it is still being attached '
        'from outside src/models/user.py')


def test_nothing_still_monkeypatches_the_user_model():
    """The shim must not reintroduce the attach."""
    import inspect
    from integrations.oidc import user as oidc_user

    source = inspect.getsource(oidc_user)
    assert 'User.from_oidc =' not in source, (
        'integrations/oidc/user.py still assigns User.from_oidc')
