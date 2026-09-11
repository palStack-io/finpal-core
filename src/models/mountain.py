"""The mountains a goal can be, and the thresholds that pick one.

*** MOUNTAINS BELONG TO GOALS, NOT TO learnPal. *** Owner decision 2026-09-11,
after asking — reasonably — *"does this peak and mountain thing go into goals or
learnpal, i am confused."* The confusion was the design's fault: the mountain is
the join between two subsystems (its height comes from goals data, its lessons
from learnPal) and nothing said which side owned it.

The first attempt put these tables in `src/modules/learnpal/` and
`hardest_band` on `Goal`, which put a column on a CORE table whose only possible
interpreter was an OPTIONAL module. That is the `Goal` coupling rule inverted,
and inverted is not better than broken.

**So: every user gets mountains.** Turn learnPal off and goals keep their peaks,
their ground and their summit notes — that is motivation, not teaching, and
withholding the payoff behind a learning module would be withholding it for the
work. learnPal adds lessons, gear and points on top.

*** TWO TABLES RATHER THAN A CONSTANT, BECAUSE OF WHERE THIS IS GOING. *** Owner:
*"in the future when i migrate it to premium will use adminpal to manage these
peaks."* A Python dict of thresholds would make that a rewrite; tables make it a
writer, which is the shape `UserModuleAccess` already has.

`mountains` is the region set. `mountain_bands` holds BOTH threshold tables keyed
by `scale`, because interest-per-month and distance-remaining are different
quantities in different units and one threshold cannot serve both.

**Absolute bands, not relative.** A £12/month card does not become somebody's
Everest for lack of competition, and the metaphor means the same thing between
two people.
"""

from src.extensions import db


class Mountain(db.Model):
    """One real mountain. SEEDED CONTENT — and adminPal's, eventually."""

    __tablename__ = 'mountains'

    slug = db.Column(db.String(40), primary_key=True)
    name = db.Column(db.String(80), nullable=False)

    # *** A NAMED PEAK WITH A REAL ELEVATION IS A CLAIM (§3). *** Calling a
    # £4,200 card "Everest" says something, so the number is real and is
    # carried rather than invented at render time.
    elevation_m = db.Column(db.Integer, nullable=False)

    # The region set. Only 'world' ships; the column is the mechanism for more.
    region = db.Column(db.String(30), nullable=False, default='world')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    # One true, interesting line about the real mountain. Shown on the per-peak
    # view, always.
    fact = db.Column(db.Text, nullable=True)

    # Shown ONCE, when a goal is finished — and it names the HARDEST band the
    # user ever faced, not the current one. See `Goal.hardest_band`.
    summit_note = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<Mountain {self.slug}>'


class MountainBand(db.Model):
    """One threshold row. `scale` is which of the two tables it belongs to."""

    __tablename__ = 'mountain_bands'

    id = db.Column(db.Integer, primary_key=True)

    # 'cost'  -> monthly interest, for a paydown peak
    # 'build' -> distance remaining, for an accumulate peak
    scale = db.Column(db.String(10), nullable=False)

    # Base currency. `min` inclusive, `max` EXCLUSIVE, NULL max = no ceiling.
    min_amount = db.Column(db.Numeric(18, 2), nullable=False)
    max_amount = db.Column(db.Numeric(18, 2), nullable=True)

    mountain_slug = db.Column(
        db.String(40),
        # *** SET NULL, NOT NO ACTION. *** D-184 and then `learn_completions`
        # were both this class of defect on the same day: an optional module's
        # row must never be the thing that refuses a delete.
        db.ForeignKey('mountains.slug', ondelete='SET NULL'),
        nullable=True)

    __table_args__ = (
        db.UniqueConstraint('scale', 'min_amount', name='uq_mountain_band_scale_min'),
    )

    def __repr__(self):
        return f'<MountainBand {self.scale} {self.min_amount}-{self.max_amount}>'
