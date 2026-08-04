"""
User model
"""

from datetime import datetime, timedelta
import hashlib
import json
import secrets
from flask import current_app
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
    profile_emoji = db.Column(db.String(10), nullable=True)
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

    # Demo mode
    is_demo_user = db.Column(db.Boolean, default=False)

    @classmethod
    def from_oidc(cls, oidc_data, provider='authelia'):
        """Create or update a user from OIDC data with security best practices"""
        # Check if user exists by OIDC ID
        user = cls.query.filter_by(oidc_id=oidc_data.get('sub'), oidc_provider=provider).first()
        
        # If not found, fall back to matching on email — this is what links an
        # existing local password account to an OIDC identity.
        #
        # TRUST BOUNDARY: `oidc_data` must already be derived from a verified
        # source — a signature-checked ID token, or a userinfo response fetched
        # with a token the server obtained itself. Never pass client-supplied
        # fields in here: the user PK is the email, so an attacker-chosen
        # `email` at this point is an account takeover.
        #
        # email_verified defaults to True because self-hosted IdPs (Authelia,
        # Keycloak) often omit the claim, and their operator controls the
        # directory. Public multi-tenant providers DO send it, and callers
        # using them must check it themselves before calling — see the native
        # Apple path in src/services/auth/api_routes.py.
        if not user and 'email' in oidc_data:
            email_verified = oidc_data.get('email_verified', True)

            if email_verified:
                user = cls.query.filter_by(id=oidc_data['email']).first()
            
        # If user exists, update OIDC details if needed
        if user:
            # Block if account is already linked to a different provider
            if user.oidc_provider and user.oidc_provider != provider:
                raise ValueError(
                    f"This account is already linked to {user.oidc_provider}. "
                    f"Please sign in with {user.oidc_provider} instead."
                )
            # Link local account with OIDC if not already linked
            if not user.oidc_id:
                user.oidc_id = oidc_data.get('sub')
                user.oidc_provider = provider
                db.session.commit()
            
            # Update any user profile information
            if 'name' in oidc_data and oidc_data['name'] != user.name:
                user.name = oidc_data['name']
                db.session.commit()
                
            # Update last login time
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            return user
            
        # Create new user if not found
        if 'email' in oidc_data:
            # Email is required for a new user
            # Generate a secure random password for the local account
            random_password = secrets.token_urlsafe(24)
            
            # Get the display name from OIDC data
            name = oidc_data.get('name', 
                            oidc_data.get('preferred_username', 
                                        oidc_data['email'].split('@')[0]))
            
            # Check if this will be the first user
            is_first_user = cls.query.count() == 0
            
            # Create the user object
            user = cls(
                id=oidc_data['email'],
                name=name,
                oidc_id=oidc_data.get('sub'),
                oidc_provider=provider,
                is_admin=is_first_user,  # Make first user admin
                last_login=datetime.utcnow()
            )
            
            # Set the random password
            user.set_password(random_password)
            
            # Generate user color based on email
            hash_object = hashlib.md5(user.id.encode())
            hash_hex = hash_object.hexdigest()
            r = int(hash_hex[:2], 16)
            g = int(hash_hex[2:4], 16)
            b = int(hash_hex[4:6], 16)
            brightness = (r * 299 + g * 587 + b * 114) / 1000
            if brightness > 180:
                r = min(int(r * 0.7), 255)
                g = min(int(g * 0.7), 255)
                b = min(int(b * 0.7), 255)
            user.user_color = f'#{r:02x}{g:02x}{b:02x}'
            
            # Save to database
            db.session.add(user)
            db.session.commit()

            # Seed default categories. This used to be `from app import
            # create_default_categories`, which never resolved — app.py has no
            # such module-level name, it is a method on AuthService. Because the
            # user is already committed above, the ImportError left every
            # first-ever OIDC/Apple sign-in returning an error with a
            # category-less account already in the database.
            #
            # Seeding is best-effort on purpose: the account exists and the user
            # should be let in even if the defaults fail.
            try:
                from src.services.auth.service import AuthService
                AuthService().create_default_categories(user.id)
            except Exception:
                current_app.logger.exception(
                    f"Failed to seed default categories for new OIDC user {user.id}"
                )

            # Add a log entry
            current_app.logger.info(f"New user created via OIDC: {user.id}, Admin: {is_first_user}")
            
            return user
            
        # If we can't create a user (no email), log and return None
        current_app.logger.error(f"Cannot create user from OIDC data: Missing email. Data: {json.dumps(oidc_data)}")
        return None

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


class LoginEvent(db.Model):
    __tablename__ = 'login_events'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ip_address = db.Column(db.String(45), nullable=True)   # max IPv6 length
    user_agent = db.Column(db.String(500), nullable=True)
    success = db.Column(db.Boolean, nullable=False, default=True)

    user = db.relationship('User', backref=db.backref('login_events', lazy='dynamic', cascade='all, delete-orphan'))


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
    
    @staticmethod
    def _get_fernet():
        from cryptography.fernet import Fernet
        from flask import current_app
        import base64, hashlib
        raw_key = current_app.config.get('ENCRYPTION_KEY')
        if raw_key:
            # Use explicit key — must be a valid Fernet key string
            return Fernet(raw_key.encode() if isinstance(raw_key, str) else raw_key)
        # Fallback: derive a 32-byte key from SECRET_KEY
        secret = current_app.config['SECRET_KEY'].encode()
        derived = hashlib.sha256(secret).digest()
        return Fernet(base64.urlsafe_b64encode(derived))

    def set_api_key(self, api_key):
        """Encrypt and store the API key using Fernet symmetric encryption."""
        if not api_key:
            self.fmp_api_key = None
            return
        f = self._get_fernet()
        self.fmp_api_key = f.encrypt(api_key.encode()).decode()

    def get_api_key(self):
        """Decrypt and return the API key."""
        if not self.fmp_api_key:
            return None
        try:
            f = self._get_fernet()
            return f.decrypt(self.fmp_api_key.encode()).decode()
        except Exception:
            # Handle legacy base64-encoded values that predate encryption
            try:
                import base64
                return base64.b64decode(self.fmp_api_key.encode()).decode()
            except Exception:
                return None


class RevokedToken(db.Model):
    """JWT blocklist — stores revoked token JTIs so they cannot be reused."""
    __tablename__ = 'revoked_tokens'
    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    revoked_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @classmethod
    def is_revoked(cls, jti):
        return cls.query.filter_by(jti=jti).first() is not None
