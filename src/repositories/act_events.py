"""Every query against `act_events`, in one place."""

import logging

from src.extensions import db
from src.models.act_event import ActEvent

logger = logging.getLogger(__name__)


class ActEventRepository:
    """Reads and writes for `act_events`. Nothing here commits."""

    def record(self, user_id, act_slug, subject_id='') -> bool:
        """Record that the user did this. `True` when it is new.

        *** IDEMPOTENT, LIKE `upsert_award`. *** A handler that fires twice --
        a double-submitted form, a retried request -- must not turn one act
        into two. The caller can treat the return value as *was this the first
        time*, which is what an award moment needs.
        """
        subject_id = '' if subject_id is None else str(subject_id)
        existing = ActEvent.query.filter_by(
            user_id=user_id, act_slug=act_slug, subject_id=subject_id).first()
        if existing is not None:
            return False
        db.session.add(ActEvent(user_id=user_id, act_slug=act_slug,
                                subject_id=subject_id))
        return True

    def count(self, user_id, act_slug) -> int:
        return ActEvent.query.filter_by(
            user_id=user_id, act_slug=act_slug).count()

    def exists(self, user_id, act_slug) -> bool:
        return db.session.query(
            ActEvent.query.filter_by(
                user_id=user_id, act_slug=act_slug).exists()).scalar()

    def subject_ids(self, user_id, act_slug) -> set:
        """Which subjects this user has done this act on.

        Coverage for `splits_confirmed` is a share over these, so it is a set
        rather than a count: a confirmation of an expense the user is no longer
        split into must not inflate the numerator.
        """
        return {row.subject_id for row in ActEvent.query.filter_by(
            user_id=user_id, act_slug=act_slug).all()}
