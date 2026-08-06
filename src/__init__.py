"""
Application factory for finPal
Creates and configures the Flask application
"""

import os
import logging
from contextlib import contextmanager

import pytz
from flask import Flask, jsonify, request
from sqlalchemy import text
from werkzeug.middleware.proxy_fix import ProxyFix
from src.config import get_config
from src.extensions import db, login_manager, mail, migrate, scheduler, init_extensions
from flask_jwt_extended import JWTManager
from flask_cors import CORS

# Import models (needed for migrations and relationships)
from src import models

# Fixed key for the first-boot advisory lock. Every process that runs create_app()
# against the same database must use this same value for the lock to mean anything.
_FIRST_BOOT_LOCK_KEY = 8675309


@contextmanager
def _first_boot_lock(app):
    """Serialise first-boot database initialisation across processes.

    gunicorn runs several workers and every one calls create_app(), so against an
    empty database they all initialise at once and race. Concurrent
    db.create_all() collides in the Postgres catalogue ("duplicate key value
    violates unique constraint pg_type_typname_nsp_index") and kills workers;
    concurrent demo seeding collides on users_pkey and leaves a half-seeded
    database. Holding an advisory lock makes the losers wait and then find the work
    already done.

    Postgres only. SQLite (dev, tests) has no advisory locks and is single-process
    here, so it just proceeds. Failure to acquire is logged and ignored rather than
    fatal — a database that cannot take the lock should still be able to boot.
    """
    if db.engine.dialect.name != 'postgresql':
        yield
        return

    conn = None
    locked = False
    try:
        conn = db.engine.connect()
        conn.execute(text('SELECT pg_advisory_lock(:key)'), {'key': _FIRST_BOOT_LOCK_KEY})
        locked = True
    except Exception as e:
        app.logger.warning(f"First-boot advisory lock unavailable, continuing without it: {e}")

    try:
        yield
    finally:
        if locked:
            try:
                conn.execute(text('SELECT pg_advisory_unlock(:key)'),
                             {'key': _FIRST_BOOT_LOCK_KEY})
            except Exception:
                app.logger.exception("Failed to release the first-boot advisory lock")
        if conn is not None:
            conn.close()

def create_app(config_name=None):
    """Create and configure the Flask application"""

    # Create Flask app
    app = Flask(__name__)

    # Apply ProxyFix so Flask respects X-Forwarded-Proto/Host/For from reverse proxies
    # This fixes HTTPS redirect URLs when behind SSL-terminating proxies (Traefik, Caddy, etc.)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Disable strict slashes so /accounts and /accounts/ both work without 308 redirect
    # (308 redirects cause HTTP clients to drop the Authorization header)
    app.url_map.strict_slashes = False

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

    # Configure JWT for API authentication — use dedicated JWT key if set, fall back to SECRET_KEY
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY') or app.config['SECRET_KEY']
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

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        from src.models.user import RevokedToken
        return RevokedToken.is_revoked(jwt_payload['jti'])

    # Configure CORS — origins read from CORS_ALLOWED_ORIGINS env var (see config.py)
    allowed_origins = app.config.get('CORS_ALLOWED_ORIGINS', ['http://localhost:5173'])
    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
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
        from src.models.user import User

        # No extend_user_model() call any more: from_oidc is a plain classmethod
        # on User (src/models/user.py). It used to be attached here, and because
        # the attach originally sat inside `if oidc_enabled` below, native Apple
        # sign-in — gated independently by APPLE_SIGNIN_ENABLED — raised
        # AttributeError whenever OIDC_ENABLED was false.
        oidc_enabled = setup_oidc_config(app)
        if oidc_enabled:
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
    # No Category API blueprint: all five of its routes are flask-restx Resources
    # in api/v1/categories.py now. It was the last plain-Flask blueprint, and the
    # last route collision — its slash-less collection rule and restx's slashed one
    # served *different implementations* to web-ui and mobile, which is D-20.
    # Deleting it converges them, which the owner authorised on 2026-08-06 by
    # settling the household model. See src/services/category/__init__.py.

    # No Auth API blueprint: all thirteen of its routes are flask-restx
    # Resources in api/v1/auth.py now, so they finally appear in swagger — the
    # blueprint's routes did not, which is why the documented API had no login,
    # no register and no refresh. Deleting the registration has to land in the
    # same commit as those Resources, or _assert_no_new_duplicate_routes raises
    # at app creation. See src/services/auth/__init__.py.

    # No Transaction API blueprint: every route it carried shadowed
    # api/v1/transactions.py, and all of them are now retired. See
    # src/services/transaction/__init__.py.

    # The group and transaction-rule blueprints were retired here: their thirteen
    # routes are now flask-restx resources in api/v1/groups.py and
    # api/v1/transaction_rules.py, so they appear in swagger. Each registration
    # had to go in the same commit as its resources — keeping both would make
    # `_assert_no_new_duplicate_routes` raise at app creation, which is the guard
    # doing its job.

    # REST API v1
    try:
        from api import api_bp
        app.register_blueprint(api_bp)
        app.logger.info("REST API v1 registered at /api/v1")
    except Exception as e:
        app.logger.warning(f"REST API registration failed: {e}")

    # An /api/ path answers in JSON, including when it fails.
    #
    # Werkzeug raises HTTPException from inside handlers — BadRequest from a
    # malformed body being the common case — and Flask's default renderer answers
    # with an HTML page. The legacy blueprints previously hid that by catching the
    # exception themselves and returning 500, which was worse; with that removed, a
    # JSON client asking for JSON was getting `<!doctype html>` and Flask's stock
    # "The browser (or proxy) sent a request..." wording.
    #
    # Scoped to /api/ so non-API routes keep the normal error pages, and it defers to
    # `e.description` only for the safe, framework-generated text — the handler
    # message, never an application exception, which is what `str(e)` used to leak.
    from werkzeug.exceptions import HTTPException as _HTTPException

    # Both `error` and `message` carry the status name, because the two clients read
    # different keys and neither can be changed in lockstep with this: web reads
    # `data.error` (AddTransactionForm, GroupDetail) and mobile reads `data.message`
    # in most places and `data.error` in a couple. That is also the shape the JWT
    # loaders above already use. The value is the HTTP status name — "Bad Request" —
    # not `e.description`, whose BadRequest wording ("The browser (or proxy) sent a
    # request...") is meaningless to an API client, and never an application
    # exception, which is what the `str(e)` returns used to leak.
    @app.errorhandler(_HTTPException)
    def _json_http_errors(e):
        if not request.path.startswith('/api/'):
            return e
        return jsonify({
            'success': False,
            'error': e.name,
            'message': e.name,
            'status': e.code,
        }), (e.code or 500)

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

    # Ensure database tables exist and seed demo data if needed.
    # Held under an advisory lock so concurrent gunicorn workers cannot race each
    # other through create_all() and the demo seeder — see _first_boot_lock.
    with app.app_context():
        with _first_boot_lock(app):
            db.create_all()
            app.logger.info("Database tables verified")

            # Module startup hooks (seeding, cache warming, etc.)
            try:
                from src.modules.registry import module_registry
                module_registry.startup(app)
            except Exception as e:
                app.logger.warning(f"Module startup failed (non-fatal): {e}")

            _seed_reference_data(app)

            if app.config.get('DEMO_MODE', False):
                try:
                    from src.services.demo import DemoService
                    result = DemoService.seed_demo_accounts()
                    if result.get('success'):
                        app.logger.info(f"Demo mode enabled: {result.get('message')}")
                    else:
                        app.logger.warning(f"Demo seeding issue: {result.get('message', result.get('error'))}")
                except Exception as e:
                    app.logger.error(f"Failed to seed demo accounts: {e}")

    _assert_no_new_duplicate_routes(app)

    return app


def _seed_reference_data(app):
    """Seed rows the application cannot function without.

    Currencies are reference data, not demo data. `users.default_currency_code`
    is a foreign key into `currencies`, and `register()` hardcodes 'USD', so an
    empty currencies table makes the *first signup on a fresh install* fail with
    a ForeignKeyViolation. Nothing else in the product recovers from that: you
    cannot create the admin account, so you cannot reach any UI that would let
    you add a currency.

    This used to be called only under `DEMO_MODE`, which is why it went unnoticed
    — every demo instance seeded 22 currencies and every real self-hosted install
    had none. Found on the first genuinely fresh non-demo deploy.

    Safe to call on every boot: create_default_currencies() skips codes that
    already exist, and the caller holds the first-boot advisory lock so
    concurrent gunicorn workers cannot race each other through it.
    """
    try:
        from src.cli import create_default_currencies
        create_default_currencies()
    except Exception:
        # Non-fatal by choice: an existing install with currencies already
        # present should still boot if this fails for an unrelated reason.
        app.logger.exception('Failed to seed default currencies')


# Routes where two handlers still claim the same request today. Werkzeug resolves
# duplicates to the first registered, so for each of these the older blueprint
# wins and the flask-restx handler is dead code.
#
# These are NOT approved — they are recorded so that no *new* ones can appear
# unnoticed. Keyed by (shape, method); see _route_shape.
#
# Everything this set used to list has been resolved. What is left is one
# deliberate deferral:
# Deliberate route collisions, i.e. one (path, method) served by two handlers with
# the trailing slash deciding which. **This is empty, and that is the point.**
#
# Its sole entry was the categories collection (D-20): `category_api.get_categories`
# filtered to the calling user while `api.categories_category_list` returned the
# whole household, so web-ui and mobile genuinely saw different rows. It was
# allowlisted rather than fixed because picking a side decides whether a category
# belongs to a person or to a household — the question the owner deferred on
# 2026-08-05 with "redo it, don't patch it".
#
# The owner settled it on 2026-08-06: a household is the instance, ownership sits on
# the *account*, and "budget, categories and rest is for household". So the
# blueprint is deleted, one handler serves both spellings, and the collision is gone
# rather than tolerated.
#
# Adding an entry here should feel expensive. It means two clients can be served
# different code for the same URL and no test will notice, because
# `/x` and `/x/` are not the same (path, method) to the shadowing guard.
_KNOWN_DUPLICATE_ROUTES = set()


def _route_shape(rule):
    """The rule reduced to what actually decides whether it matches a request.

    Two normalisations, and both of them were learned from a duplicate this guard
    failed to catch:

    * Converter parameter **names** are stripped. `/x/<int:id>` and
      `/x/<int:transaction_id>` are different strings but match the same URLs, so
      one of them is dead. The flask-restx transaction detail handler was
      shadowed this way for months while this guard said nothing.
    * The **trailing slash** is stripped. This app sets
      `url_map.strict_slashes = False`, which makes a rule written without a
      trailing slash also match the slashed request, and vice versa — so
      `/api/v1/groups` and `/api/v1/groups/` are one route wearing two spellings.
      Comparing them as distinct strings is why the guard stayed silent while
      web-ui (slash-less, legacy blueprint) and mobile (slashed, restx) were
      served different implementations of groups, categories and transaction
      creation. Of the 18 collisions that state contained, only two were
      byte-identical rule strings.
    """
    import re
    shape = re.sub(r'<([^:<>]+):[^<>]+>', r'<\1>',
                   re.sub(r'<(?![^:<>]+:)([^<>]+)>', r'<string>', str(rule.rule)))
    return shape.rstrip('/') or '/'


def duplicate_routes(app):
    """{(shape, method): {endpoint, ...}} for every route with >1 handler.

    Methods are part of the key because they are part of matching: the legacy
    blueprint claims `POST /groups/<id>/members` and restx claims `GET` on the
    same path, which is two routes rather than a collision. Ignoring methods
    reported that as a duplicate and cost the set an allowlist entry.
    """
    from collections import defaultdict
    by_route = defaultdict(set)
    for rule in app.url_map.iter_rules():
        shape = _route_shape(rule)
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            by_route[(shape, method)].add(rule.endpoint)
    return {k: v for k, v in by_route.items() if len(v) > 1}


def _assert_no_new_duplicate_routes(app):
    """Fail fast if two handlers claim the same request.

    A duplicate means one handler is silently unreachable, or — worse, because it
    is invisible — that which handler runs depends on whether the client typed a
    trailing slash. Neither is hypothetical here: the S-07, S-08 and S-13 security
    fixes were written on handlers that had been shadowed this way, so they were
    committed, reviewed and never executed. Startup is the only place this is
    cheap to notice.
    """
    duplicates = duplicate_routes(app)
    unexpected = {k: eps for k, eps in duplicates.items()
                  if k not in _KNOWN_DUPLICATE_ROUTES}

    if unexpected:
        detail = '; '.join(f'{m} {p} -> {sorted(eps)}'
                           for (p, m), eps in sorted(unexpected.items()))
        raise RuntimeError(
            'Duplicate URL routes detected, so for each of these one handler is '
            f'unreachable or is chosen by the trailing slash: {detail}. Either '
            'remove the duplicate or, if it is deliberate, add (path, method) to '
            '_KNOWN_DUPLICATE_ROUTES with a reason.')

    stale = _KNOWN_DUPLICATE_ROUTES - set(duplicates)
    if stale:
        # Not fatal: a cleaned-up duplicate is good news, the list is just behind.
        app.logger.info(
            'These routes are no longer duplicated and can be dropped from '
            f'_KNOWN_DUPLICATE_ROUTES: {sorted(stale)}')


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
        """Sync all SimpleFin accounts for every connected user. Runs daily at 11 PM."""
        with app.app_context():
            try:
                from src.models.account import SimpleFin
                from src.services.account.service import SimpleFinService

                service = SimpleFinService()
                connections = SimpleFin.query.filter_by(enabled=True).all()
                total_users = len(connections)
                total_imported = 0

                for conn in connections:
                    try:
                        _, _, results = service.sync_all_accounts(conn.user_id)
                        total_imported += sum(r.get('imported', 0) for r in results)
                    except Exception as user_err:
                        app.logger.error(
                            f"SimpleFin sync failed for user {conn.user_id}: {user_err}"
                        )

                app.logger.info(
                    f"SimpleFin sync complete: {total_users} user(s), "
                    f"{total_imported} new transaction(s)"
                )
            except Exception as e:
                app.logger.error(f"SimpleFin sync task failed: {e}")

    @scheduler.task('interval', id='csv_folder_scan', minutes=5)
    def scheduled_csv_folder_scan():
        with app.app_context():
            try:
                from src.models.import_source import ImportSource
                from src.services.csv_import.scanner import scan_source
                for source in ImportSource.query.filter_by(enabled=True).all():
                    scan_source(source)
            except Exception:
                app.logger.exception('CSV folder scan failed')

    # Module scheduled tasks (e.g. pointsPal nightly sync)
    try:
        from src.modules.registry import module_registry
        module_registry.register_tasks(scheduler, app)
    except Exception as e:
        app.logger.warning(f"Module task registration failed (non-fatal): {e}")

    @scheduler.task('cron', id='update_investment_prices', hour=4, minute=0)
    def scheduled_investment_price_update():
        """Update all investment prices from yfinance nightly at 4 AM."""
        with app.app_context():
            try:
                from src.models.investment import Portfolio
                from src.services.investment.service import InvestmentService

                service = InvestmentService()
                user_ids = db.session.query(Portfolio.user_id).distinct().all()
                total_updated = 0

                for (uid,) in user_ids:
                    results = service.update_all_user_prices(uid)
                    total_updated += sum(1 for r in results if r['ok'])

                app.logger.info(f"Investment price update complete: {len(user_ids)} user(s), {total_updated} portfolio(s) updated")
            except Exception as e:
                app.logger.error(f"Investment price update failed: {e}")

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
