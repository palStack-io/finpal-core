"""
Flask extensions initialization
All Flask extensions are initialized here and then imported by the application factory
"""

import os

from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail
from flask_migrate import Migrate
from flask_apscheduler import APScheduler
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import pytz

# Initialize extensions
db = SQLAlchemy()
login_manager = LoginManager()
mail = Mail()
migrate = Migrate()
scheduler = APScheduler()
def rate_limit_storage_uri() -> str:
    """Where flask-limiter keeps its counters.

    `memory://` is per-process. The production image runs `gunicorn --workers=3`,
    so each worker holds its own counters and a "10 per minute" limit is really
    ~30/minute — measured on a live deployment: 45 login attempts drew 28 429s
    rather than 35. Point RATELIMIT_STORAGE_URI at a shared store (e.g.
    redis://redis:6379/0) to make the configured limit the actual limit.
    """
    return os.getenv('RATELIMIT_STORAGE_URI', 'memory://').strip() or 'memory://'


def rate_limit_key():
    """Bucket by access token when there is one, else by address.

    Every request from a single MCP server shares a source address, so keying on
    the address alone would throttle an agent together with the humans behind the
    same NAT — or, with a generous limit, not throttle it at all.

    Imported lazily: src.utils.api_auth imports models, and this module is
    imported before them.
    """
    try:
        from src.utils.api_auth import current_pat
        pat = current_pat()
        if pat is not None:
            return 'pat:%d' % pat.id
    except Exception:
        pass
    return get_remote_address()


limiter = Limiter(key_func=rate_limit_key, storage_uri=rate_limit_storage_uri())

# Configure scheduler timezone
scheduler.timezone = pytz.timezone('EST')

def scheduler_enabled():
    """Whether this process should run scheduled jobs.

    Defaults to true so single-process and dev setups keep working. The Docker
    entrypoint sets RUN_SCHEDULER=false on the gunicorn workers and runs one
    dedicated scheduler process, because gunicorn --workers=3 would otherwise
    start three schedulers and fire every cron job three times.
    """
    return os.getenv('RUN_SCHEDULER', 'true').strip().lower() not in ('false', '0', 'no')


def init_extensions(app):
    """Initialize all Flask extensions with the app"""
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    mail.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
    _warn_if_rate_limits_are_per_process(app)
    scheduler.init_app(app)
    if scheduler_enabled():
        scheduler.start()
    else:
        app.logger.info("Scheduler disabled in this process (RUN_SCHEDULER)")


def _warn_if_rate_limits_are_per_process(app):
    """Say so out loud when the configured limit is not the effective limit.

    Silently enforcing 3x the documented limit is worse than either enforcing it
    or not having it, because it looks fixed. This is deliberately a warning and
    not an error: a single-worker or single-process deployment is fine on
    memory://, and self-hosters should not be forced to run Redis.
    """
    uri = rate_limit_storage_uri()
    if not uri.startswith('memory:'):
        app.logger.info(f"Rate limit storage: {uri.split('://')[0]}:// (shared)")
        return

    workers = os.getenv('GUNICORN_WORKERS') or os.getenv('WEB_CONCURRENCY')
    detail = f' with {workers} workers' if workers else ''
    app.logger.warning(
        'Rate limits are stored in process memory%s. With more than one worker '
        'each holds its own counters, so the effective limit is the configured '
        'limit multiplied by the worker count. Set RATELIMIT_STORAGE_URI to a '
        'shared store (e.g. redis://host:6379/0) to enforce it exactly.' % detail
    )
