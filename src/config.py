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

# Secret-shaped variables whose placeholder values `.env.example` publishes. Anything the
# example ships as a placeholder is a value the whole world can read, so the app must refuse it.
_SECRET_VARS = ('SECRET_KEY', 'JWT_SECRET_KEY')

_HOW_TO_GENERATE = (
    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\" "
    "(or: openssl rand -hex 32)"
)


def placeholder_secret_values():
    """The placeholder secrets published in `.env.example`.

    *** READ FROM THE FILE RATHER THAN LISTED IN CODE, so the two cannot drift. *** A hardcoded
    list would go blind the moment someone reworded the example, which is the failure mode
    AUDIT records for spelling-keyed guards. Returns an empty set if the file is absent — it is
    not shipped inside the container image, and a missing example must not stop the app booting.
    """
    example = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.example')
    values = set()
    try:
        with open(example, 'r', encoding='utf-8') as handle:
            for line in handle:
                name, _, value = line.strip().partition('=')
                if name in _SECRET_VARS and value.strip():
                    values.add(value.strip())
    except OSError:
        return values
    return values


def get_config():
    """Get the appropriate configuration.

    Refuses to build a config that would run with a publicly known secret. Both checks are
    boot-time on purpose: a warning in a log nobody reads is how an instance ends up signing
    tokens with a value published on GitHub.
    """
    config = Config()

    # *** READ THE LIVE ENVIRONMENT, NOT THE CLASS ATTRIBUTE. *** `Config`'s fields are
    # class-level, so they are evaluated once when this module is first imported. Anything that
    # changes the environment afterwards -- a test, or an import that happens before `.env` is
    # loaded -- leaves the class holding a stale value while the operator believes their setting
    # took effect. That is the same shape as the bug where config set after `create_app()` gated
    # nothing (AUDIT D-61 / #88), and validating the stale copy would let a placeholder through.
    # The resolved value is written back onto the instance so the config the app receives and the
    # value validated here are the same thing.
    published = placeholder_secret_values()
    for name in _SECRET_VARS:
        value = os.getenv(name)
        if value is not None:
            setattr(config, name, value)
        else:
            value = getattr(config, name, None)

        # Exact match, never a substring: a generated hex secret may legitimately begin with
        # "change", and a boot failure nobody can explain is worse than the leak this prevents.
        if value and value in published:
            raise ValueError(
                f"{name} is still set to the placeholder value published in .env.example. "
                f"Anyone can read it, so sessions and tokens signed with it are forgeable. "
                f"{_HOW_TO_GENERATE}"
            )

    if not getattr(config, 'SECRET_KEY', None):
        raise ValueError(
            f"SECRET_KEY environment variable must be set. {_HOW_TO_GENERATE}"
        )
    return config
