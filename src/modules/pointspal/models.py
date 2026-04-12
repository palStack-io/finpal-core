"""
pointsPal ORM models
"""

import json
from datetime import datetime
from src.extensions import db


class PointsProgram(db.Model):
    __tablename__ = 'points_programs'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.String(100), nullable=False, unique=True)
    program_name = db.Column(db.String(200), nullable=False)
    issuer = db.Column(db.String(100), nullable=False)
    network = db.Column(db.String(50), nullable=True)
    currency_name = db.Column(db.String(100), nullable=True)
    annual_fee = db.Column(db.Float, nullable=True)
    effective_annual_fee = db.Column(db.String(50), nullable=True)
    base_cpp = db.Column(db.Float, nullable=True)
    tpg_cpp = db.Column(db.Float, nullable=True)
    has_transfer_fee = db.Column(db.Boolean, nullable=True)
    expiry_policy = db.Column(db.String(100), nullable=True)
    data_as_of = db.Column(db.String(20), nullable=True)
    issuer_effective_date = db.Column(db.String(20), nullable=True)
    known_change_event = db.Column(db.Text, nullable=True)
    review_frequency_months = db.Column(db.Integer, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    source_url = db.Column(db.Text, nullable=True)
    contributor = db.Column(db.String(100), nullable=True)
    welcome_bonus = db.Column(db.Text, nullable=True)  # JSON string
    foreign_transaction_fee_pct = db.Column(db.Float, nullable=True)
    category_exceptions = db.Column(db.Text, nullable=True)
    is_stale = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    earn_categories = db.relationship(
        'PointsEarnCategory', backref='program', lazy=True,
        cascade='all, delete-orphan'
    )
    transfer_partners = db.relationship(
        'PointsTransferPartner', backref='program', lazy=True,
        cascade='all, delete-orphan'
    )

    def get_welcome_bonus(self):
        if self.welcome_bonus:
            try:
                return json.loads(self.welcome_bonus)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def __repr__(self):
        return f"<PointsProgram {self.program_id}>"


class PointsEarnCategory(db.Model):
    __tablename__ = 'points_earn_categories'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(
        db.String(100),
        db.ForeignKey('points_programs.program_id', name='fk_pec_program'),
        nullable=False
    )
    category = db.Column(db.String(100), nullable=False)
    multiplier = db.Column(db.Float, nullable=False)
    cap_amount = db.Column(db.Float, nullable=True)
    cap_period = db.Column(db.String(20), nullable=True)  # 'monthly', 'quarterly', 'annual'
    multiplier_fallback = db.Column(db.Float, nullable=True)
    card_variant = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<PointsEarnCategory {self.program_id}/{self.category} {self.multiplier}x>"


class PointsTransferPartner(db.Model):
    __tablename__ = 'points_transfer_partners'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(
        db.String(100),
        db.ForeignKey('points_programs.program_id', name='fk_ptp_program'),
        nullable=False
    )
    partner_name = db.Column(db.String(200), nullable=False)
    ratio = db.Column(db.String(20), nullable=True)
    type = db.Column(db.String(50), nullable=True)  # 'airline', 'hotel'
    est_cpp = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<PointsTransferPartner {self.program_id} -> {self.partner_name}>"


class PointspalSyncLog(db.Model):
    __tablename__ = 'pointspal_sync_log'

    id = db.Column(db.Integer, primary_key=True)
    synced_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    status = db.Column(db.String(20), nullable=False)  # 'success', 'error'
    programs_upserted = db.Column(db.Integer, nullable=True)
    schema_version = db.Column(db.String(20), nullable=True)
    error_message = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<PointspalSyncLog {self.synced_at} {self.status}>"


class UserCard(db.Model):
    __tablename__ = 'user_cards'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120),
        db.ForeignKey('users.id', name='fk_uc_user'),
        nullable=False
    )
    program_id = db.Column(
        db.String(100),
        db.ForeignKey('points_programs.program_id', name='fk_uc_program'),
        nullable=True
    )
    card_nickname = db.Column(db.String(200), nullable=True)
    last_four = db.Column(db.String(4), nullable=True)
    # 'pointspal_sync' | 'user_manual' | 'partial'
    association_source = db.Column(db.String(30), nullable=False, default='user_manual')
    earn_override = db.Column(db.Text, nullable=True)  # JSON: {category_slug: multiplier}
    # 'high' | 'medium' | 'low'
    confidence_level = db.Column(db.String(10), nullable=False, default='medium')
    user_last_verified_at = db.Column(db.DateTime, nullable=True)
    user_stale_flag = db.Column(db.Boolean, default=False)
    submitted_to_community = db.Column(db.Boolean, default=False)
    community_pr_url = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('user_cards', lazy=True))
    program = db.relationship('PointsProgram', backref=db.backref('user_cards', lazy=True))
    simplefin_links = db.relationship(
        'SimpleFinCardLink', backref='user_card', lazy=True,
        cascade='all, delete-orphan'
    )

    def get_earn_override(self):
        if self.earn_override:
            try:
                return json.loads(self.earn_override)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    def set_earn_override(self, override_dict):
        self.earn_override = json.dumps(override_dict) if override_dict else None

    def __repr__(self):
        return f"<UserCard {self.id} user={self.user_id} program={self.program_id}>"


class SimpleFinCardLink(db.Model):
    __tablename__ = 'simplefin_card_links'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120),
        db.ForeignKey('users.id', name='fk_scl_user'),
        nullable=False
    )
    user_card_id = db.Column(
        db.Integer,
        db.ForeignKey('user_cards.id', name='fk_scl_card'),
        nullable=True
    )
    # This is accounts.external_id from the accounts table
    simplefin_account_id = db.Column(db.String(200), nullable=False)
    simplefin_account_name = db.Column(db.String(200), nullable=True)
    simplefin_last_four = db.Column(db.String(4), nullable=True)
    match_source = db.Column(db.String(50), nullable=True)  # 'last4', 'fuzzy_name', 'manual'
    match_confidence = db.Column(db.Float, nullable=True)
    is_credit_card = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('simplefin_card_links', lazy=True))

    def __repr__(self):
        return f"<SimpleFinCardLink account={self.simplefin_account_id} card={self.user_card_id}>"


class SpendPeriodTotal(db.Model):
    __tablename__ = 'spend_period_totals'

    id = db.Column(db.Integer, primary_key=True)
    user_card_id = db.Column(
        db.Integer,
        db.ForeignKey('user_cards.id', name='fk_spt_card'),
        nullable=False
    )
    category = db.Column(db.String(100), nullable=False)
    period_type = db.Column(db.String(20), nullable=False)  # 'monthly', 'quarterly', 'annual'
    period_key = db.Column(db.String(10), nullable=False)   # '2026-03', '2026-Q1', '2026'
    total_spent = db.Column(db.Float, default=0.0)
    total_pts_earned = db.Column(db.Float, default=0.0)
    total_pts_missed = db.Column(db.Float, default=0.0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user_card = db.relationship('UserCard', backref=db.backref('spend_totals', lazy=True))

    def __repr__(self):
        return f"<SpendPeriodTotal card={self.user_card_id} {self.category} {self.period_key}>"


class OptimizerAlert(db.Model):
    __tablename__ = 'optimizer_alerts'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.String(120),
        db.ForeignKey('users.id', name='fk_oa_user'),
        nullable=False
    )
    user_card_id = db.Column(
        db.Integer,
        db.ForeignKey('user_cards.id', name='fk_oa_card'),
        nullable=False
    )
    category = db.Column(db.String(100), nullable=False)
    period_type = db.Column(db.String(20), nullable=False)
    period_key = db.Column(db.String(10), nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)  # 'warning_80', 'warning_95', 'capped'
    pct_used = db.Column(db.Float, nullable=True)
    dismissed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('optimizer_alerts', lazy=True))
    user_card = db.relationship('UserCard', backref=db.backref('alerts', lazy=True))

    def __repr__(self):
        return f"<OptimizerAlert {self.alert_type} card={self.user_card_id} {self.category}>"
