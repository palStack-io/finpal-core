"""
Account and SimpleFin models
"""

from datetime import datetime
from src.extensions import db

class Account(db.Model):
    __tablename__ = 'accounts'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # checking, savings, credit, etc.
    institution = db.Column(db.String(100), nullable=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id', name='fk_account_user'), nullable=False)
    balance = db.Column(db.Numeric(18, 2), default=0)
    currency_code = db.Column(db.String(3), db.ForeignKey('currencies.code', name='fk_account_currency'), nullable=True)
    last_sync = db.Column(db.DateTime, nullable=True)
    import_source = db.Column(db.String(50), nullable=True)
    external_id = db.Column(db.String(200), nullable=True)
    status = db.Column(db.String(20), nullable=True)
    color = db.Column(db.String(7), nullable=True)  # Hex color code (e.g., #3b82f6)
    # #129: the create form has asked for this since it was written and there was nowhere
    # to put it -- the value was discarded on every save. Text, not String(n): it is a
    # free-form note ("Joint account - rent, bills and the shared food shop") and a
    # ceiling here would only re-create the validator-vs-column mismatch of #123.
    # NOTE: adding a column to an EXISTING table is invisible to `create_all()`, so no
    # deployed instance gets this from a redeploy -- see scripts/schema_drift.py (D-121).
    description = db.Column(db.Text, nullable=True)
    
    # Relationships
    user = db.relationship('User', backref=db.backref('accounts', lazy=True))
    currency = db.relationship('Currency', backref=db.backref('accounts', lazy=True))
    
    def __repr__(self):
        return f"<Account {self.name} ({self.type})>"


class SimpleFin(db.Model):
    """
    Stores SimpleFin connection settings for a user
    """
    __tablename__ = 'SimpleFin'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False, unique=True)
    access_url = db.Column(db.Text, nullable=False)  # Encoded/encrypted access URL
    last_sync = db.Column(db.DateTime, nullable=True)
    enabled = db.Column(db.Boolean, default=True)
    sync_frequency = db.Column(db.String(20), default='daily')  # 'daily', 'weekly', etc.
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    temp_accounts = db.Column(db.Text, nullable=True)
    
    # Relationship with User
    user = db.relationship('User', backref=db.backref('SimpleFin', uselist=False, lazy=True))
    
    def __repr__(self):
        return f"<SimpleFin settings for user {self.user_id}>"
