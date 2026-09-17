"""`act_events`: the discrete things a user did that an act pays for.

*** TWO OF THE FOUR NEW ACTS ARE EVENTS, NOT COVERAGES, AND NEITHER IS
DERIVABLE FROM WHAT EXISTS. *** Spec §14.3.1. The other ten acts are fractions
over a countable set -- transactions categorised, accounts confirmed -- and can
be measured from the rows themselves. These two cannot:

- `splits_confirmed`: there is **no split-confirmation field anywhere**.
  `Transaction` carries `split_method`, `split_with`, `split_details` and
  `has_category_splits`, and not one of them records *a human agreed this is
  right*.
- `budget_adjusted`: `Budget.updated_at` looks free and is **poisoned**.
  `src/services/budget/rollover_service.py:76` writes `budget.rollover_amount`
  from a SCHEDULED TASK, which fires `onupdate`. Every budget on every stack
  would eventually read as *the user revised this* because a cron touched it.
  *** D-197's SHAPE: A COLUMN WITH A NON-USER WRITER CANNOT TESTIFY TO A USER'S
  ACT. ***

*** A NEW TABLE, NOT A COLUMN — D-121. *** `create_all()` makes a missing TABLE
at boot and is blind to a new COLUMN on an existing model, so a column on
`expenses` or `budgets` would never exist on any deployment that already has
users, which is every deployment that matters.

*** ONE TABLE RATHER THAN TWO. *** Event acts are a KIND, not two coincidences,
and two near-identical tables would drift. This is still not a generic
key-value store: `act_slug` names a registered act and `subject_id` is the row
the act was performed on, so another act of the same kind needs no schema
change and no migration anyone has to remember.

*** `settlement_recorded` DELIBERATELY WRITES NOTHING HERE. *** `Settlement`
rows already mean exactly what that act pays for, and a parallel row would be a
second copy of a fact the schema already holds -- D-101.
"""

from datetime import datetime

from src.extensions import db


class ActEvent(db.Model):
    """One row per (user, act, subject). Idempotent by constraint."""

    __tablename__ = 'act_events'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'act_slug', 'subject_id',
                            name='uq_act_event_user_act_subject'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_act_event_user'),
        nullable=False, index=True)

    # The act's slug, not a foreign key: acts live in code, exactly as
    # `CoinAward.act_slug` does.
    act_slug = db.Column(db.String(60), nullable=False)

    # *** `nullable=False, default=''` AND THE SENTINEL IS NOT A STYLE CHOICE.
    # *** A nullable column would NOT dedupe: `UNIQUE` permits many NULLs in
    # both SQLite and Postgres, because `NULL = NULL` is unknown. Recording a
    # subject-less event twice would insert twice and the constraint would
    # quietly stop being a constraint. Both event acts have a natural subject
    # anyway; `''` only exists to keep the uniqueness total.
    subject_id = db.Column(db.String(64), nullable=False, default='')

    occurred_at = db.Column(db.DateTime, nullable=False,
                            default=datetime.utcnow)

    def __repr__(self):
        return f'<ActEvent {self.user_id} {self.act_slug} {self.subject_id!r}>'
