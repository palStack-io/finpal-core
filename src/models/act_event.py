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


class TeachingSeen(db.Model):
    """Which of the four explanations this user has already been shown.

    *** A NEW TABLE, NOT A COLUMN ON `User` — D-121. *** `create_all()` makes a
    missing TABLE at boot and is blind to a new COLUMN on an existing model, so
    a flag on `users` would read as absent on every deployment that already has
    users, and every existing user would be taught everything again.

    Four rows at most per user today (`coins`, `gear`, `badges`, `mountains`),
    and the table takes a fifth without a migration anybody has to remember.
    """

    __tablename__ = 'teaching_seen'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'topic', name='uq_teaching_seen_user_topic'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_teaching_seen_user'),
        nullable=False, index=True)
    topic = db.Column(db.String(40), nullable=False)
    seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<TeachingSeen {self.user_id} {self.topic}>'


class EverestWatermark(db.Model):
    """The highest fraction of Everest a user has ever reached.

    *** A WATERMARK, NOT A CURRENT VALUE, AND THAT IS WHAT MAKES EVEREST OBEY
    DECISION 1. *** Altitude is coins earned over coins AVAILABLE to the user,
    and the denominator MOVES: opening a first credit card activates three
    dormant debt acts and adds 2,200 coins to it, which would drop a user's
    altitude for doing something sensible. Storing the best-ever fraction means
    nothing earned is ever taken away -- the same reason `raise_watermark` and
    `raise_hardest_band` are ratchet-only.

    *** A NEW TABLE, NOT A COLUMN ON `User` — D-121. *** `create_all()` is
    blind to a new column on an existing model, so a column here would never
    exist on any deployment that already has users.

    *** `Numeric`, NEVER `Float`. *** It is compared for equality with itself
    across requests and it decides a displayed figure.
    """

    __tablename__ = 'everest_watermarks'
    __table_args__ = (
        db.UniqueConstraint('user_id', name='uq_everest_watermark_user'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_everest_user'),
        nullable=False, index=True)
    fraction = db.Column(db.Numeric(6, 5), nullable=False, default=0)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow,
        onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<EverestWatermark {self.user_id} {self.fraction}>'


class BadgeEarned(db.Model):
    """One row per badge a user has been awarded. *** APPEND-ONLY. ***

    *** THIS TABLE IS WHAT MAKES AN ACHIEVEMENT BADGE SAFE. *** The three the
    owner asked for on 2026-09-17 — debt cleared, goal reached, months on
    budget — are all OUTCOMES, and §14.1 excludes outcomes from EARNING for a
    good reason: a careful person on a low wage may never clear their card.
    Badges survive that rule only because of two properties, and this table is
    the first:

    1. *** RECORDED WHEN FIRST OBSERVED, NEVER RE-EVALUATED. *** A live
       predicate would take the badge BACK the moment the user borrowed again,
       and decision 1 says nothing earned can ever be taken away. So the badge
       is an EVENT, not a condition, exactly as `ActEvent` is for the acts that
       cannot be derived from state.
    2. An unearned badge is ABSENT from the payload, never present-and-false —
       so no client can render a grid of locked badges saying *you have not paid
       your debt*, which is the report card decision 5 forbids.

    *** AND THEY PAY NOTHING ELSE. *** No coins, no altitude. Owner decision,
    2026-09-17: otherwise a high earner would out-climb a careful low earner,
    which is the brief's own failure mode one level up, and is the same reason
    debt-to-income was refused for Everest.

    *** A NEW TABLE, NOT A COLUMN — D-121. *** `create_all()` is blind to a new
    column on an existing model.
    """

    __tablename__ = 'badges_earned'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'slug', name='uq_badge_earned_user_slug'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_badge_earned_user'),
        nullable=False, index=True)
    slug = db.Column(db.String(60), nullable=False)
    earned_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<BadgeEarned {self.user_id} {self.slug}>'
