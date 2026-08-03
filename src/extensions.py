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
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")

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
    scheduler.init_app(app)
    if scheduler_enabled():
        scheduler.start()
    else:
        app.logger.info("Scheduler disabled in this process (RUN_SCHEDULER)")
