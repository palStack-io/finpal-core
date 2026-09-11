"""learnPal's two tables: what can be learned, and what this user has learned.

*** NEITHER TABLE OWNS `Goal`, AND THAT IS A SETTLED DECISION, NOT A STYLE
CHOICE. *** `src/models/goal.py:4` says it in as many words: debtPal,
retirementPal and firePal all need goals and none may depend on a learning
module, so `Goal` lives in core and learnPal reads it. Moving it in here later
would revert a decision rather than refactor one.

Both tables are created by `create_all()` at boot, which works for a NEW table
on an existing database -- unlike a new COLUMN, which is invisible to it and
needs the boot reconcile (D-121). `Goal.highest_progress`, added alongside this
module, is the column case and is handled there.

They are imported from `src/models/__init__.py` only when the module is enabled,
matching pointsPal. That conditional import is what decides whether the tables
exist at all, which is why `test_learnpal_in_core.py` pins the two readers of
`is_enabled()` to one source of truth -- pointsPal shipped a version where the
suite could never run the default it claimed to cover.
"""

from datetime import datetime

from src.extensions import db


# `verified_by` is a FOUR-value vocabulary as of the mountain design's §5.1.
# 'quiz' is new there, and the split is what preserves the parent spec's
# protection rather than weakening it: gear comes from reading, points from
# answering, and altitude/streaks/badges ONLY from money actually moving. The
# three are never summed, so no amount of studying can make a financial picture
# look better than it is.
VERIFIED_BY = ('data', 'read', 'quiz', 'manual')


class LearnMilestone(db.Model):
    """SEEDED CONTENT. One row per lesson.

    A milestone is unlockable two ways and **both coexist** -- altitude is an
    additional trigger, not a replacement:

    * `unlock_at_progress` -- fires when a goal's server-computed progress first
      reaches it. NULL means not altitude-gated.
    * `check_type` -- a pure predicate in `checks.py`, fired on evaluation.

    A row may carry both (lesson 3 does) or neither (lesson 1 is surfaced by
    guided setup, which is C1f).
    """

    __tablename__ = 'learn_milestones'

    slug = db.Column(db.String(60), primary_key=True)
    title = db.Column(db.String(160), nullable=False)

    # The gear this lesson awards. A slug the client maps to a hand-drawn SVG
    # path -- *** NEVER AN EMOJI ***. B10's failure was glyphs rendering as `?`
    # boxes on a real device while every test stayed green, so this is verified
    # by looking at a simulator, not by a green suite.
    gear_slug = db.Column(db.String(40), nullable=True)

    # 0.000-1.000. Numeric, not Float: `progress` is computed from Numeric money
    # columns and a float here would reintroduce the representation error that
    # `Account.apr` is Numeric(5,2) to avoid.
    unlock_at_progress = db.Column(db.Numeric(4, 3), nullable=True)

    # Names a predicate in `learnpal/checks.py`. NULL = no event trigger.
    check_type = db.Column(db.String(60), nullable=True)
    check_args = db.Column(db.JSON, nullable=True)

    # Altitude gates that apply to one KIND of climb only. Holds a value of
    # `GoalService.direction` -- 'paydown' or 'accumulate' -- or NULL for any
    # goal. *** `direction`, NEVER `kind`. *** `Goal.kind` is presentation-only
    # by its own comment, and `direction` is derived from the amounts, which is
    # the thing that is actually true about the goal.
    applies_to_direction = db.Column(db.String(20), nullable=True)

    # Where the lesson is offered. 'mountain' is the default surface; 'setup'
    # belongs to guided setup (C1f) and is carried now so seeding does not have
    # to change shape later.
    surface = db.Column(db.String(20), nullable=False, default='mountain')

    sort_order = db.Column(db.Integer, nullable=False, default=0)

    # Authored prose. NULL for a milestone whose content has not landed yet --
    # C1b seeds the ROWS so the engine is demonstrable; C1d fills the bodies.
    # A milestone with no body is unlockable and simply has nothing to read,
    # which is a better state than a lesson that exists only in a document.
    body_md = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<LearnMilestone {self.slug}>'


class LearnCompletion(db.Model):
    """USER DATA. One row per (user, milestone) once unlocked.

    *** UNLOCKS ARE PERMANENT (design decision 4). *** Falling back below the
    band does not re-lock, which is why this is a row that gets INSERTED and
    never deleted rather than a boolean recomputed from current state. A user
    who paid a card down to 30% and then had a bad month keeps what they read.
    """

    __tablename__ = 'learn_completions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    milestone_slug = db.Column(
        db.String(60), db.ForeignKey('learn_milestones.slug'), nullable=False)

    # One of VERIFIED_BY. Unlocking writes 'read'; answering writes 'quiz'
    # (C1d); money moving writes 'data'.
    verified_by = db.Column(db.String(10), nullable=False, default='read')

    # Which goal's altitude opened it, when that is how it opened. Nullable
    # because a `check_type` unlock has no goal behind it.
    #
    # *** `ondelete='SET NULL'`, AND THE FIRST VERSION OF THIS GOT IT WRONG. ***
    # The comment here used to say `ondelete` was "deliberately absent" so that
    # a learnPal row could never block deleting a goal -- which is the right
    # intent and the opposite of what a bare FK does. A plain NO ACTION
    # reference is EXACTLY the thing that blocks the delete.
    #
    # Caught by `test_EVERY_TABLE_IN_THE_FK_CLOSURE_IS_DELETED_and_in_order`,
    # the guard written for D-184 this same day, which put `learn_completions`
    # into the reset's dependency closure and failed. An optional learning
    # module must never be able to make a core deletion fail, so the database
    # releases the reference instead. Losing the attribution of WHICH goal
    # opened a lesson is a far smaller harm than losing the unlock -- and the
    # unlock is the row, which survives.
    unlocked_by_goal_id = db.Column(
        db.Integer, db.ForeignKey('goals.id', ondelete='SET NULL'), nullable=True)

    unlocked_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        # A milestone unlocks once. The engine is re-entrant and runs on every
        # evaluation, so without this a nightly task would insert a duplicate
        # row every night -- and "unlocks are permanent" would quietly become
        # "unlocks accumulate".
        db.UniqueConstraint('user_id', 'milestone_slug',
                            name='uq_learn_completion_user_milestone'),
    )

    def __repr__(self):
        return f'<LearnCompletion {self.user_id} {self.milestone_slug}>'
