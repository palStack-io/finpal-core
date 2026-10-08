"""Which page guides and tours a user has finished, and finishing one.

`TeachingSeen` rows under `guide:<page>` (the card) and `tour:<page>` (the tour) —
the same table as the reward explanations and the legacy first-visit cards, so no
migration. The prefixes keep the families apart and fit the column (40 chars).
"""
from sqlalchemy.exc import IntegrityError

from src.extensions import db
from src.models.act_event import TeachingSeen
from src.services.onboarding.guides import PAGES


def _topic(kind, page):
    return f'{kind}:{page}'


def _seen(user_id, kind):
    topics = {_topic(kind, p): p for p in PAGES}
    rows = TeachingSeen.query.filter(
        TeachingSeen.user_id == user_id, TeachingSeen.topic.in_(list(topics))).all()
    return sorted(topics[r.topic] for r in rows)


def guide_state(user_id):
    return {'dismissed': _seen(user_id, 'guide'), 'toured': _seen(user_id, 'tour')}


def _record(user_id, kind, page):
    if page not in PAGES:
        raise ValueError(page)
    topic = _topic(kind, page)
    if not TeachingSeen.query.filter_by(user_id=user_id, topic=topic).first():
        try:
            db.session.add(TeachingSeen(user_id=user_id, topic=topic))
            db.session.commit()
        except IntegrityError:
            # Two tabs, or a double click: the other request won the insert. The
            # outcome is the one asked for, so it is not an error.
            db.session.rollback()
    return guide_state(user_id)


def dismiss_guide(user_id, page):
    return _record(user_id, 'guide', page)


def complete_tour(user_id, page):
    return _record(user_id, 'tour', page)
