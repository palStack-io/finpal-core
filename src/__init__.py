"""
Application factory for finPal
Creates and configures the Flask application
"""

import os
import logging
import pytz
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from src.config import get_config
from src.extensions import db, login_manager, mail, migrate, scheduler, init_extensions
from flask_jwt_extended import JWTManager
from flask_cors import CORS

# Import models (needed for migrations and relationships)
from src import models

def create_app(config_name=None):
    """Create and configure the Flask application"""

    # Create Flask app
    app = Flask(__name__)

    # Apply ProxyFix so Flask respects X-Forwarded-Proto/Host/For from reverse proxies
    # This fixes HTTPS redirect URLs when behind SSL-terminating proxies (Traefik, Caddy, etc.)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Load configuration
    config = get_config()
    app.config.from_object(config)

    # Ensure instance path exists for SQLite
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except OSError:
        pass

    # Set up SQLite database path if not using PostgreSQL
    if not app.config.get('SQLALCHEMY_DATABASE_URI'):
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(app.instance_path, "expenses.db")}'

    # Set up logging
    log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO'))
    logging.basicConfig(level=log_level)

    # Initialize Flask extensions
    init_extensions(app)

    # Configure JWT for API authentication
    app.config['JWT_SECRET_KEY'] = app.config.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400  # 24 hours
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = 2592000  # 30 days
    jwt = JWTManager(app)

    @jwt.unauthorized_loader
    def unauthorized_response(reason):
        return {'message': 'Missing or invalid authorization token', 'error': 'authorization_required'}, 401

    @jwt.invalid_token_loader
    def invalid_token_response(reason):
        return {'message': 'Invalid token', 'error': 'invalid_token'}, 401

    @jwt.expired_token_loader
    def expired_token_response(jwt_header, jwt_payload):
        return {'message': 'Token has expired', 'error': 'token_expired'}, 401

    @jwt.revoked_token_loader
    def revoked_token_response(jwt_header, jwt_payload):
        return {'message': 'Token has been revoked', 'error': 'token_revoked'}, 401

    # Configure CORS for React Native and web frontend
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",  # Allow all origins for development/demo
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
            "max_age": 3600
        }
    })

    # Configure login manager
    @login_manager.user_loader
    def load_user(user_id):
        from src.models.user import User
        return User.query.filter_by(id=user_id).first()

    # Set up OIDC if enabled
    oidc_enabled = False
    try:
        from integrations.oidc.auth import setup_oidc_config, register_oidc_routes
        from integrations.oidc.user import extend_user_model

        oidc_enabled = setup_oidc_config(app)
        if oidc_enabled:
            # Extend User model with OIDC methods
            from src.models.user import User
            User = extend_user_model(db, User)
            # Register OIDC routes with User model and db
            register_oidc_routes(app, User, db)
            app.logger.info("OIDC authentication enabled")
    except Exception as e:
        app.logger.warning(f"OIDC setup failed: {e}")

    # Set up SimpleFin client
    try:
        from integrations.simplefin.client import SimpleFin
        simplefin_client = SimpleFin(app)
        app.extensions['simplefin_client'] = simplefin_client
    except Exception as e:
        app.logger.warning(f"SimpleFin client setup failed: {e}")

    # Set up FMP cache for investments
    try:
        from integrations.investments.fmp_cache import FMPCache
        fmp_cache = FMPCache()
        app.extensions['fmp_cache'] = fmp_cache
    except Exception as e:
        app.logger.warning(f"FMP cache setup failed: {e}")

    # Set up demo timeout middleware
    try:
        from src.utils.session_timeout import DemoTimeout
        demo_timeout = DemoTimeout(
            timeout_minutes=app.config.get('DEMO_TIMEOUT_MINUTES', 10),
            demo_users=[
                'demo@example.com',
                'demo1@example.com',
                'demo2@example.com',
                'demo1@finpal.demo',
                'demo2@finpal.demo',
                'demo3@finpal.demo',
                'demo4@finpal.demo',
            ]
        )
        demo_timeout.init_app(app)
        app.extensions['demo_timeout'] = demo_timeout
    except Exception as e:
        app.logger.warning(f"Demo timeout setup failed: {e}")

    # Register API blueprints
    # Category API
    from src.services.category import api_bp as category_api_bp
    app.register_blueprint(category_api_bp)

    # Auth API
    from src.services.auth import api_bp as auth_api_bp
    app.register_blueprint(auth_api_bp)

    # Transaction API
    from src.services.transaction import api_bp as transaction_api_bp
    app.register_blueprint(transaction_api_bp)

    # Group API
    from src.services.group import api_bp as group_api_bp
    app.register_blueprint(group_api_bp)

    # Transaction Rule API
    from src.services.transaction_rule import api_bp as transaction_rule_api_bp
    app.register_blueprint(transaction_rule_api_bp)

    # REST API v1
    try:
        from api import api_bp
        app.register_blueprint(api_bp)
        app.logger.info("REST API v1 registered at /api/v1")
    except Exception as e:
        app.logger.warning(f"REST API registration failed: {e}")

    # Health check endpoint
    @app.route('/health')
    def health():
        return {'status': 'healthy'}, 200

    # Set up scheduled tasks
    setup_scheduled_tasks(app)

    app.logger.info(f"finPal application created successfully")
    app.logger.info(f"OIDC enabled: {oidc_enabled}")
    app.logger.info(f"SimpleFin enabled: {app.config.get('SIMPLEFIN_ENABLED', False)}")
    app.logger.info(f"Investment tracking enabled: {app.config.get('INVESTMENT_TRACKING_ENABLED', False)}")

    # Ensure database tables exist and seed demo data if needed
    with app.app_context():
        db.create_all()
        app.logger.info("Database tables verified")

        if app.config.get('DEMO_MODE', False):
            try:
                # Seed default currencies
                from src.cli import create_default_currencies
                create_default_currencies()

                from src.services.demo import DemoService
                result = DemoService.seed_demo_accounts()
                if result.get('success'):
                    app.logger.info(f"Demo mode enabled: {result.get('message')}")
                else:
                    app.logger.warning(f"Demo seeding issue: {result.get('message', result.get('error'))}")
            except Exception as e:
                app.logger.error(f"Failed to seed demo accounts: {e}")

    return app


def setup_scheduled_tasks(app):
    """Set up APScheduler cron jobs"""

    @scheduler.task('cron', id='budget_rollover', hour=0, minute=30)
    def scheduled_budget_rollover():
        """Run every day at 12:30 AM to process budget rollovers"""
        with app.app_context():
            try:
                from src.services.budget.rollover_service import BudgetRolloverService
                result = BudgetRolloverService.process_all_rollovers()
                app.logger.info(f"Budget rollover completed: {result['processed']} budgets processed, {result['errors']} errors")
            except Exception as e:
                app.logger.error(f"Budget rollover failed: {e}")

    @scheduler.task('cron', id='monthly_reports', day=1, hour=1, minute=0)
    def scheduled_monthly_reports():
        """Run on the 1st day of each month at 1:00 AM"""
        with app.app_context():
            try:
                app.logger.info("Monthly reports task executed")
            except Exception as e:
                app.logger.error(f"Monthly reports failed: {e}")

    @scheduler.task('cron', id='simplefin_sync', hour=23, minute=0)
    def scheduled_simplefin_sync():
        """Run every day at 11:00 PM"""
        with app.app_context():
            try:
                app.logger.info("SimpleFin sync task executed")
            except Exception as e:
                app.logger.error(f"SimpleFin sync failed: {e}")

    @scheduler.task('cron', id='update_exchange_rates', hour=2, minute=0)
    def scheduled_exchange_rate_update():
        """Run every day at 2:00 AM to update currency exchange rates"""
        with app.app_context():
            try:
                from src.services.currency.service import CurrencyService
                currency_service = CurrencyService()
                updated_count = currency_service.update_exchange_rates()

                if updated_count > 0:
                    app.logger.info(f"Exchange rates updated: {updated_count} currencies")
                elif updated_count == 0:
                    app.logger.warning("No exchange rates were updated")
                else:
                    app.logger.error("Exchange rate update failed")
            except Exception as e:
                app.logger.error(f"Exchange rate update failed: {e}")
