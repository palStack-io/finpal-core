"""`act_events` — the discrete acts a user performed.

*** THE CASE WORTH THE TEST IS THE SUBJECT-LESS ONE. *** A nullable
`subject_id` would not dedupe, because `UNIQUE` permits many NULLs in both
SQLite and Postgres (`NULL = NULL` is unknown). The column is
`nullable=False, default=''` so that uniqueness is total, and this file is what
would catch a future edit making it nullable again.
"""
import pytest

from src.extensions import db as _db
from src.models.act_event import ActEvent
from src.repositories.act_events import ActEventRepository
from tests.factories import UserFactory

USER = 'events@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Events', password_plain='testpassword')
    _db.session.commit()
    return u


def test_a_first_record_is_new_and_a_repeat_is_not(owner):
    repo = ActEventRepository()

    assert repo.record(owner.id, 'budget_adjusted', '7') is True
    _db.session.commit()
    assert repo.record(owner.id, 'budget_adjusted', '7') is False
    _db.session.commit()

    assert ActEvent.query.filter_by(user_id=owner.id).count() == 1


def test_a_subject_less_event_also_dedupes(owner):
    """*** WHAT A NULLABLE COLUMN WOULD HAVE GOT SILENTLY WRONG. ***"""
    repo = ActEventRepository()

    assert repo.record(owner.id, 'budget_adjusted') is True
    _db.session.commit()
    assert repo.record(owner.id, 'budget_adjusted') is False
    _db.session.commit()

    assert ActEvent.query.filter_by(user_id=owner.id).count() == 1


def test_none_is_stored_as_the_sentinel_not_as_null(owner):
    repo = ActEventRepository()
    repo.record(owner.id, 'budget_adjusted', None)
    _db.session.commit()

    row = ActEvent.query.filter_by(user_id=owner.id).one()
    assert row.subject_id == ''
    assert row.subject_id is not None


def test_different_subjects_are_different_events(owner):
    repo = ActEventRepository()
    repo.record(owner.id, 'splits_confirmed', '1')
    repo.record(owner.id, 'splits_confirmed', '2')
    _db.session.commit()

    assert repo.count(owner.id, 'splits_confirmed') == 2
    assert repo.subject_ids(owner.id, 'splits_confirmed') == {'1', '2'}


def test_it_is_per_user(owner, db):
    other = UserFactory(id='events2@test.com', name='O',
                        password_plain='testpassword')
    _db.session.commit()

    repo = ActEventRepository()
    repo.record(owner.id, 'budget_adjusted', '7')
    _db.session.commit()

    assert repo.exists(owner.id, 'budget_adjusted') is True
    assert repo.exists(other.id, 'budget_adjusted') is False
    assert repo.count(other.id, 'budget_adjusted') == 0


def test_record_does_not_commit(owner):
    """The caller owns the transaction, matching `upsert_award` and `ack`."""
    repo = ActEventRepository()
    repo.record(owner.id, 'budget_adjusted', '7')

    _db.session.rollback()
    assert ActEvent.query.filter_by(user_id=owner.id).count() == 0


def test_the_CONSTRAINT_dedupes_a_subject_less_event_not_just_the_pre_check(owner):
    """*** BYPASSES `record()` ON PURPOSE. ***

    `record()` pre-checks with `filter_by(subject_id=...)`, and SQLAlchemy
    turns a `None` there into `IS NULL`, which matches -- so the repository
    dedupes even when the COLUMN is nullable and the constraint does not.
    Making `subject_id` nullable therefore breaks the database guarantee while
    every test that goes through `record()` stays green.

    This inserts twice directly, so it fails if the uniqueness is ever made
    partial. `UNIQUE` permits many NULLs in both SQLite and Postgres, which is
    exactly the hole the `''` sentinel closes.
    """
    from sqlalchemy.exc import IntegrityError

    _db.session.add(ActEvent(user_id=owner.id, act_slug='budget_adjusted'))
    _db.session.commit()

    _db.session.add(ActEvent(user_id=owner.id, act_slug='budget_adjusted'))
    with pytest.raises(IntegrityError):
        _db.session.commit()
    _db.session.rollback()

    assert ActEvent.query.filter_by(user_id=owner.id).count() == 1


def test_the_demo_reset_clears_the_acks_or_the_award_moment_stops_demoing(db):
    """*** THE HALF OF THIS THAT IS NOT COSMETIC. ***

    `_coins_reset` deleted awards and purchases and left `coin_award_acks`
    behind. A reset user's awards are then re-earned while their acks survive,
    so every re-earned award reads as ALREADY SEEN, the wallet's `unseen` list
    comes back empty, and the award moment stops demonstrating itself with
    nothing on the page to say so — D-77's shape, and D-184's lesson.

    Asserts on both new tables, because a reset that clears one and not the
    other is the same defect half-fixed.
    """
    from src.models.act_event import ActEvent
    from src.models.coins import CoinAward, CoinAwardAck
    from src.repositories.act_events import ActEventRepository
    from src.repositories.coins import CoinRepository
    from src.services.demo.service import _coins_reset

    u = UserFactory(id='resetme@test.com', name='R',
                    password_plain='testpassword')
    _db.session.commit()

    _db.session.add(CoinAward(user_id=u.id, act_slug='has_a_goal',
                              coverage=1, coins=600))
    _db.session.commit()
    CoinRepository().ack(u.id, 'has_a_goal')
    ActEventRepository().record(u.id, 'budget_adjusted', '7')
    _db.session.commit()

    assert CoinAwardAck.query.filter_by(user_id=u.id).count() == 1
    assert ActEvent.query.filter_by(user_id=u.id).count() == 1

    _coins_reset(u.id)
    _db.session.commit()

    assert CoinAwardAck.query.filter_by(user_id=u.id).count() == 0, (
        'acks survived the reset — re-earned awards will read as already seen')
    assert ActEvent.query.filter_by(user_id=u.id).count() == 0, (
        'act_events survived the reset, pointing at data that is now gone')
