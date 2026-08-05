"""
Application configuration
Centralized configuration loaded from environment variables
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration"""
    # Secret key — must be set via environment variable; no default allowed
    SECRET_KEY = os.getenv('SECRET_KEY')

    # Encryption key for sensitive fields (API keys, tokens).
    # Must be a valid URL-safe base64-encoded 32-byte key.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If not set, derived from SECRET_KEY (less secure — set a dedicated key in production).
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Largest request body Flask will accept, in bytes (default 10 MB). Werkzeug
    # rejects anything larger with 413 before the handler reads it. Without this
    # the CSV import's row cap only applies *after* the whole upload has been read
    # into memory, and the only other bound was client_max_body_size in the
    # optional nginx proxy — which self-hosters running the backend directly do
    # not have (AUDIT.md S-10).
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 10 * 1024 * 1024))

    # Application settings
    DEVELOPMENT_MODE = os.getenv('DEVELOPMENT_MODE', 'True').lower() == 'true'
    DISABLE_SIGNUPS = os.getenv('DISABLE_SIGNUPS', 'False').lower() == 'true'
    LOCAL_LOGIN_DISABLE = os.getenv('LOCAL_LOGIN_DISABLE', 'False').lower() == 'true'
    
    # SimpleFin
    # Global toggle - if False, SimpleFin is disabled for all users
    # If True, per-user SimpleFin settings in database control access
    SIMPLEFIN_ENABLED = os.getenv('SIMPLEFIN_ENABLED', 'True').lower() == 'true'
    SIMPLEFIN_SETUP_TOKEN_URL = os.getenv('SIMPLEFIN_SETUP_TOKEN_URL', 'https://beta-bridge.simplefin.org/setup-token')
    
    # Investments
    # Global toggle - if False, Investment tracking is disabled for all users
    # If True, per-user Investment settings in database control access
    INVESTMENT_TRACKING_ENABLED = os.getenv('INVESTMENT_TRACKING_ENABLED', 'True').lower() == 'true'
    FMP_API_KEY = os.getenv('FMP_API_KEY', None)
    FMP_API_URL = os.getenv('FMP_API_URL', 'https://financialmodelingprep.com/api/v3')
    
    # Email configuration
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True').lower() == 'true'
    MAIL_USE_SSL = os.getenv('MAIL_USE_SSL', 'False').lower() == 'true'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER', os.getenv('MAIL_USERNAME'))
    
    # Timezone
    TIMEZONE = 'EST'
    
    # Demo mode
    DEMO_MODE = os.getenv('DEMO_MODE', 'False').lower() == 'true'
    DEMO_TIMEOUT_MINUTES = int(os.getenv('DEMO_TIMEOUT_MINUTES', 10))
    MAX_CONCURRENT_DEMO_SESSIONS = int(os.getenv('MAX_CONCURRENT_DEMO_SESSIONS', 10))
    
    # pointsPal
    POINTSPAL_ENABLED = os.getenv('POINTSPAL_ENABLED', 'False').lower() == 'true'
    # `or` rather than a getenv default: docker-compose forwards an unset variable
    # as the empty string, and an empty URL would fail every catalogue fetch.
    POINTSPAL_SYNC_URL = os.getenv('POINTSPAL_SYNC_URL') or (
        'https://raw.githubusercontent.com/palStack-io/pointsPal/main/dist/programs.json'
    )
    POINTSPAL_SYNC_INTERVAL_HOURS = int(os.getenv('POINTSPAL_SYNC_INTERVAL_HOURS', 1))
    POINTSPAL_AUTO_MATCH_THRESHOLD = float(os.getenv('POINTSPAL_AUTO_MATCH_THRESHOLD', 0.75))
    POINTSPAL_AUTO_LINK_THRESHOLD = float(os.getenv('POINTSPAL_AUTO_LINK_THRESHOLD', 0.95))

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

    # CORS — comma-separated list of allowed origins
    CORS_ALLOWED_ORIGINS = [
        o.strip()
        for o in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:3000').split(',')
        if o.strip()
    ]

def get_config():
    """Get the appropriate configuration"""
    config = Config()
    if not config.SECRET_KEY:
        raise ValueError(
            "SECRET_KEY environment variable must be set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    return config
