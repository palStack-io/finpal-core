"""When a person was last here, so finPal can tell a return after a long gap.

*** NOT `users.last_login`. *** Login writes that field, so by the time any page
reads it, it holds this visit, not the previous one; and a remembered session
can last weeks without a login at all. This row is written by the requests every
client makes when it opens (the page guides and the hard-month check), at most
once per day.

A new TABLE, not a column on `User` (D-121): `create_all()` makes a missing table
at boot and never adds a column to an existing one.
"""
from src.extensions import db


class VisitMark(db.Model):
    __tablename__ = 'visit_marks'

    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_visit_marks_user'),
        primary_key=True)
    #: The last UTC day any client opened finPal for this person.
    last_seen_on = db.Column(db.Date, nullable=False)
    #: The day they came back after a gap of RETURN_GAP_DAYS or more; None until then.
    returned_on = db.Column(db.Date, nullable=True)
