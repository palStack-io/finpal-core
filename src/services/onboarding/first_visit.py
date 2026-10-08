"""Which first-visit cards a user has dismissed, and dismissing one.

Stored as `TeachingSeen` rows under `first_visit:<page>` -- see
`first_visit_topic` in `copy.py` for why it shares that table.
"""
from sqlalchemy.exc import IntegrityError

from src.extensions import db
from src.models.act_event import TeachingSeen
from src.services.onboarding.copy import FIRST_VISIT_PAGES, first_visit_topic


def dismissed_pages(user_id):
    topics = {first_visit_topic(p): p for p in FIRST_VISIT_PAGES}
    rows = TeachingSeen.query.filter(
        TeachingSeen.user_id == user_id,
        TeachingSeen.topic.in_(list(topics))).all()
    return sorted(topics[r.topic] for r in rows)


def dismiss(user_id, page):
    """Record the dismissal; doing it twice is not an error. Returns the list."""
    if page not in FIRST_VISIT_PAGES:
        raise ValueError(page)
    topic = first_visit_topic(page)
    if not TeachingSeen.query.filter_by(user_id=user_id, topic=topic).first():
        try:
            db.session.add(TeachingSeen(user_id=user_id, topic=topic))
            db.session.commit()
        except IntegrityError:
            # Two tabs, or a double click: the other request wrote the row
            # between the read and this insert. The outcome is the one asked
            # for, so it is not an error.
            db.session.rollback()
    return dismissed_pages(user_id)
