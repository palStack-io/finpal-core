"""
User model
"""

from datetime import datetime, timedelta
import secrets
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from src.extensions import db

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(120), primary_key=True)  # Using email as ID
    password_hash = db.Column(db.String(256))
    name = db.Column(db.String(100))
    is_admin = db.Column(db.Boolean, default=False)
    email_verified = db.Column(db.Boolean, default=False)
    verification_token = db.Column(db.String(100), nullable=True)
    verification_token_expiry = db.Column(db.DateTime, nullable=True)
    reset_token = db.Column(db.String(100), nullable=True)
    reset_token_expiry = db.Column(db.DateTime, nullable=True)
    default_currency_code = db.Column(db.String(3), db.ForeignKey('currencies.code'), nullable=True)
    default_currency = db.relationship('Currency', backref=db.backref('users', lazy=True))
    user_color = db.Column(db.String(7), default="#15803d")
    # OIDC related fields
    oidc_id = db.Column(db.String(255), nullable=True, index=True, unique=True)
    oidc_provider = db.Column(db.String(50), nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)
    monthly_report_enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    timezone = db.Column(db.String(50), nullable=True, default='UTC')

    # Onboarding and notification preferences
    has_completed_onboarding = db.Column(db.Boolean, default=False)
    notification_email = db.Column(db.Boolean, default=True)
    notification_push = db.Column(db.Boolean, default=True)
    notification_budget_alerts = db.Column(db.Boolean, default=True)
    notification_transaction_alerts = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        try:
            return check_password_hash(self.password_hash, password)
        except ValueError:
            return False
        
    def generate_reset_token(self):
        """Generate a password reset token that expires in 1 hour"""
        self.reset_token = secrets.token_urlsafe(32)
        self.reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
        return self.reset_token
        
    def verify_reset_token(self, token):
        """Verify if the provided token is valid and not expired"""
        if not self.reset_token or self.reset_token != token:
            return False
        if not self.reset_token_expiry or self.reset_token_expiry < datetime.utcnow():
            return False
        return True
        
    def clear_reset_token(self):
        """Clear the reset token and expiry after use"""
        self.reset_token = None
        self.reset_token_expiry = None

    def generate_verification_token(self):
        """Generate an email verification token that expires in 24 hours"""
        self.verification_token = secrets.token_urlsafe(32)
        self.verification_token_expiry = datetime.utcnow() + timedelta(hours=24)
        return self.verification_token

    def verify_email_token(self, token):
        """Verify if the provided email verification token is valid and not expired"""
        if not self.verification_token or self.verification_token != token:
            return False
        if not self.verification_token_expiry or self.verification_token_expiry < datetime.utcnow():
            return False
        return True

    def clear_verification_token(self):
        """Clear the verification token and expiry after use"""
        self.verification_token = None
        self.verification_token_expiry = None
        self.email_verified = True


class UserApiSettings(db.Model):
    __tablename__ = 'user_api_settings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False, unique=True)
    fmp_api_key = db.Column(db.String(100))  # Encrypted API key
    simplefin_enabled = db.Column(db.Boolean, default=False)  # SimpleFin integration enabled
    simplefin_access_url = db.Column(db.Text, nullable=True)  # SimpleFin access URL (encrypted)
    investment_tracking_enabled = db.Column(db.Boolean, default=False)  # Investment tracking enabled
    last_used = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    user = db.relationship('User', backref=db.backref('api_settings', uselist=False))
    
    def set_api_key(self, api_key):
        """Encrypt and store the API key"""
        if not api_key:
            self.fmp_api_key = None
            return
            
        # Simple encryption - in production use proper encryption
        import base64
        self.fmp_api_key = base64.b64encode(api_key.encode()).decode()
        
    def get_api_key(self):
        """Decrypt and return the API key"""
        if not self.fmp_api_key:
            return None
            
        # Simple decryption - in production use proper decryption
        import base64
        return base64.b64decode(self.fmp_api_key.encode()).decode()
