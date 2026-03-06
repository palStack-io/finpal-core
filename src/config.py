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
    # Secret key
    SECRET_KEY = os.getenv('SECRET_KEY', 'fallback_secret_key_change_in_production')

    # Encryption key for sensitive fields (API keys, tokens).
    # Must be a valid URL-safe base64-encoded 32-byte key.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If not set, derived from SECRET_KEY (less secure — set a dedicated key in production).
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
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
    POINTSPAL_SYNC_URL = os.getenv(
        'POINTSPAL_SYNC_URL',
        'https://raw.githubusercontent.com/palStack-io/pointsPal/main/dist/programs.json'
    )
    POINTSPAL_SYNC_INTERVAL_HOURS = int(os.getenv('POINTSPAL_SYNC_INTERVAL_HOURS', 1))
    POINTSPAL_AUTO_MATCH_THRESHOLD = float(os.getenv('POINTSPAL_AUTO_MATCH_THRESHOLD', 0.75))
    POINTSPAL_AUTO_LINK_THRESHOLD = float(os.getenv('POINTSPAL_AUTO_LINK_THRESHOLD', 0.95))

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

def get_config():
    """Get the appropriate configuration"""
    return Config()
