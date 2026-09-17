"""The coin ledger: what a user earned, and what they spent it on.

*** TWO TABLES, AND THAT IS WHAT MAKES DESIGN DECISION 1 STRUCTURAL. *** The
rule is *nothing earned can ever be taken away*, and a spendable currency is
exactly where such a rule quietly stops being true. So `coins_earned` is summed
from `coin_awards` ALONE -- a table with no delete path and a ratchet on the way
in -- while spending writes to a different table entirely. A purchase cannot
reduce the earned total because it does not touch the rows the total is built
from. That is a property of the schema, not a discipline somebody remembers.

*** NEW TABLES, NOT COLUMNS ON `User` — D-121. *** `create_all()` makes a
missing TABLE at boot and is blind to a new COLUMN on an existing model. Columns
here would read NULL on precisely the deployments that already have users, which
is every deployment that matters.

*** COVERAGE IS `Numeric`, NEVER `Float`. *** It is compared for equality with
the ratchet's stored value and it decides money, and binary floating point is
the wrong tool for both.
"""

from datetime import datetime

from src.extensions import db


class CoinAward(db.Model):
    """One row per (user, act). Ratcheted: it only ever rises.

    `coverage` is how much of the user's OWN picture that act has made true, in
    `[0, 1]`. `coins` is `ceiling * coverage` at the high-water mark -- stored
    rather than recomputed, so re-tuning an act's ceiling later cannot
    retroactively take coins away from somebody who already earned them.
    """

    __tablename__ = 'coin_awards'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'act_slug', name='uq_coin_award_user_act'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_coin_award_user'),
        nullable=False, index=True)

    # The act's slug, not a foreign key: acts live in code, not in a table, and
    # a row for an act this build no longer defines must still count toward the
    # user's earned total. Taking coins back because a slug was renamed would
    # break decision 1 for a reason the user cannot see.
    act_slug = db.Column(db.String(60), nullable=False)

    coverage = db.Column(db.Numeric(6, 5), nullable=False, default=0)
    coins = db.Column(db.Integer, nullable=False, default=0)

    first_awarded_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<CoinAward {self.user_id} {self.act_slug} {self.coins}>'


class CoinPurchase(db.Model):
    """One row per piece of gear a user has bought.

    *** THE PRICE IS STORED. *** Gear prices are seed data and will be tuned.
    Recomputing a user's spend from today's price list would silently change
    what they have left, so what they actually paid is what is recorded.
    """

    __tablename__ = 'coin_purchases'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'gear_slug', name='uq_coin_purchase_user_gear'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_coin_purchase_user'),
        nullable=False, index=True)
    gear_slug = db.Column(db.String(40), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    purchased_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<CoinPurchase {self.user_id} {self.gear_slug} {self.price}>'


class CoinAwardAck(db.Model):
    """How many coins of one act the user has actually been SHOWN.

    *** A NEW TABLE, NOT A COLUMN ON `coin_awards` — D-121. *** `create_all()`
    makes a missing TABLE at boot and is blind to a new COLUMN on an existing
    model, so a `seen_at` column here would never exist on any deployment that
    already has users -- which is every deployment that matters.

    *** AND IT STORES A FIGURE, NOT A FLAG, FOR A CASE A FLAG CANNOT COVER. ***
    An act whose coverage rises 0.4 -> 0.8 earns a SECOND time and deserves a
    second moment. `unseen` is `award.coins > ack.coins_seen`, which says that
    without needing a second column or a timestamp comparison.
    """

    __tablename__ = 'coin_award_acks'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'act_slug',
                            name='uq_coin_award_ack_user_act'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120), db.ForeignKey('users.id', name='fk_coin_award_ack_user'),
        nullable=False, index=True)

    # The act's slug, not a foreign key -- acts live in code, matching
    # `CoinAward.act_slug` exactly, because the two are joined on it.
    act_slug = db.Column(db.String(60), nullable=False)

    coins_seen = db.Column(db.Integer, nullable=False, default=0)

    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow,
        onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<CoinAwardAck {self.user_id} {self.act_slug} {self.coins_seen}>'
