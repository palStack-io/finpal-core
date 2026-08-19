"""Authentication API endpoints"""
from flask import request, current_app
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt
)
from werkzeug.security import check_password_hash, generate_password_hash
# Werkzeug raises HTTPException from inside handler bodies — BadRequest from a
# bare `request.get_json()` on a malformed body being the common case. Each
# route-level `except Exception` that answers with a 500 is preceded by
# `except HTTPException: raise`, so a correct 4xx is not rewritten as a server
# fault. Without it `POST /api/v1/auth/login` answered a malformed body with a
# 500. Deliberately NOT applied to the two catches that are not route-level: the
# module-list fallback, and the verification-email guard whose whole purpose is
# that registration succeeds even if mail fails.
from werkzeug.exceptions import HTTPException
from src.models.user import User, RevokedToken
from src.models.invitation import Invitation
from src.extensions import db, limiter
from datetime import datetime, timedelta
from src.data import seed_user_defaults
from schemas.input_schemas import login_input, register_input
from src.utils.validation import validate_request, validation_error_response
import logging
import threading
from src.models.personal_access_token import SCOPE_READ
from src.utils.api_auth import api_auth_required

logger = logging.getLogger(__name__)


def _background_sync(app, user_id: str) -> None:
    """
    Spawn a daemon thread to refresh SimpleFin transactions and run
    module background sync hooks. Non-blocking — login/app-open is never delayed.
    """
    def _run():
        with app.app_context():
            # 1. SimpleFin — per-user transaction sync
            try:
                from src.models.account import SimpleFin as SimpleFinConn
                conn = SimpleFinConn.query.filter_by(
                    user_id=user_id, enabled=True
                ).first()
                if conn:
                    from src.services.account.service import SimpleFinService
                    SimpleFinService().sync_all_accounts(user_id)
                    logger.info(f"Background SimpleFin sync complete for {user_id}")
            except Exception as e:
                logger.warning(f"Background SimpleFin sync failed for {user_id}: {e}")

            # 2. Module background sync hooks (e.g. pointsPal program sync)
            try:
                from src.modules.registry import module_registry
                module_registry.background_sync(app, user_id)
            except Exception as e:
                logger.warning(f"Module background sync failed for {user_id}: {e}")

    if app.config.get('TESTING'):
        # A daemon thread outlives the request, and the test db fixture drops
        # every table after each test — so a sync spawned by one test hits the
        # next test's half-built schema and errors with "no such table: users".
        # Non-deterministic by nature: it passed on CI's 3.8 leg and failed on
        # 3.12 in the same run.
        logger.debug('Background sync skipped under TESTING')
        return

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


def _get_user_modules(user_id: str) -> list:
    """Return list of module slugs enabled for this user."""
    try:
        from src.modules.registry import module_registry
        return [
            m.name for m in module_registry.modules
            if m.is_enabled() and m.is_user_enabled(user_id)
        ]
    except Exception:
        # The per-user check reads user_module_access, so a database problem lands
        # here. Fall back to deployment-level enablement only — never to a re-read of
        # a module's env var. This branch used to answer
        # `os.getenv('POINTSPAL_ENABLED', 'false')`, whose default is the opposite of
        # `ModuleBase.is_enabled()`'s (pointsPal is `default_enabled`), and it named
        # one module by hand so a second module would have been invisible here
        # forever. Same defect as the one in src/models/__init__.py — see #122.
        logger.warning('Per-user module check failed; falling back to deployment flags',
                       exc_info=True)
        try:
            from src.modules.registry import module_registry
            return [m.name for m in module_registry.modules if m.is_enabled()]
        except Exception:
            return []


def _get_server_features() -> dict:
    """Return which server-level optional features are enabled."""
    return {
        'simplefin': current_app.config.get('SIMPLEFIN_ENABLED', True),
        'investments': current_app.config.get('INVESTMENT_TRACKING_ENABLED', True),
    }

# Create namespace
ns = Namespace('auth', description='Authentication operations')

# Define request/response models for Swagger documentation
login_model = ns.model('Login', {
    'email': fields.String(required=True, description='User email'),
    'password': fields.String(required=True, description='User password')
})

register_model = ns.model('Register', {
    # NOT required, despite what this model said until the port. The handler does
    # `data.get('username', email.split('@')[0])`, so a body of
    # {email, password} registers successfully — the contract oracle asserts
    # exactly that. While these Resources were shadowed the model was inert
    # scaffolding and the lie cost nothing; publishing it would have made
    # `username` mandatory in every generated client, which is the same class of
    # defect as the routes being missing altogether.
    'username': fields.String(
        required=False,
        description='Display name. Defaults to the local part of the email.'),
    'email': fields.String(required=True, description='User email'),
    'password': fields.String(required=True, description='User password')
})

# The remaining seven auth bodies. Until now these routes appeared in swagger
# with no body at all, so a generated client could see the route and had no way
# to know what to send it — the same defect as a missing route, one level down.
#
# `required` here means *the handler rejects the request without it*, and every
# one below was read off the handler's own guard rather than inferred from the
# name. Getting that wrong in either direction is a real bug: `Register` claimed
# `username` was required for two years while the handler defaults it, which
# would have made the field mandatory in every generated client.

verify_email_model = ns.model('VerifyEmail', {
    'token': fields.String(required=True, description='Token from the verification email'),
})

resend_verification_model = ns.model('ResendVerification', {
    'email': fields.String(required=True, description='Address to resend the verification email to'),
})

forgot_password_model = ns.model('ForgotPassword', {
    'email': fields.String(required=True, description='Address to send the reset link to'),
})

reset_password_model = ns.model('ResetPasswordRequest', {
    'token': fields.String(required=True, description='Token from the reset email'),
    # NEITHER spelling is required, and that is not an oversight. The handler is
    # `data.get('password') or data.get('new_password')` — it accepts either,
    # because both are in the wild. Marking one required would make a generated
    # client refuse the other, which the server accepts happily.
    'password': fields.String(
        required=False,
        description='The new password. Interchangeable with new_password; send one of the two.'),
    'new_password': fields.String(
        required=False,
        description='The new password. Interchangeable with password; send one of the two.'),
})

apple_signin_model = ns.model('AppleSignIn', {
    'identity_token': fields.String(required=True, description='Identity token from Sign in with Apple'),
    'full_name': fields.String(
        required=False,
        description='Only supplied by Apple on the very first authorisation, so it '
                    'cannot be relied on for returning users.'),
})

oidc_signin_model = ns.model('OidcSignIn', {
    'provider': fields.String(required=True, description='Native provider key, e.g. google'),
    # One of these two is needed, but neither on its own: the guard is
    # `if not id_token and not access_token`. Declaring either required would
    # reject a request the server accepts.
    'id_token': fields.String(
        required=False, description='OIDC ID token. Supply this or access_token.'),
    'access_token': fields.String(
        required=False, description='OAuth access token. Supply this or id_token.'),
    'full_name': fields.String(required=False, description='Display name from the provider'),
})

onboarding_model = ns.model('Onboarding', {
    # Every field optional: the handler rejects only a wholly absent body and
    # reads each key with a default.
    'email': fields.String(required=False, description='Address being onboarded'),
    'default_currency_code': fields.String(required=False, description="e.g. 'GBP'"),
    'timezone': fields.String(required=False, description='IANA timezone name'),
    'profile_emoji': fields.String(required=False, description='Avatar emoji'),
    'notifications': fields.Boolean(required=False, description='Master notification switch'),
    'push': fields.Boolean(required=False, description='Push notifications'),
    'budgetAlerts': fields.Boolean(required=False, description='Budget threshold alerts'),
    'transactionAlerts': fields.Boolean(required=False, description='New transaction alerts'),
})

# TokenResponse and UserResponse used to be declared here. Both were written for
# the Resources deleted in #19 and referenced by nothing since — no `marshal_with`
# anywhere in this file — so restx never emitted them into `definitions` and they
# documented nothing. Removed rather than wired up: `UserResponse` declared
# `'id': fields.Integer` when the user primary key is the email *string*, so
# attaching it to a real handler would have published a wrong type. The response
# shapes these endpoints actually return are pinned field-for-field in
# tests/integration/test_auth_contract.py; giving them accurate restx models is
# work for the client-generation step, which needs them for every route, not just
# these two.


# All thirteen auth routes are HERE now, and the `auth_api` blueprint
# (src/services/auth/api_routes.py) is deleted. This is the same port as #63/#64
# did for transaction-rules and groups, and it is here for the same reason: only
# flask-restx resources appear in swagger, so while these thirteen sat on a
# blueprint the API documented **no login, no register and no refresh**. A
# generated OpenAPI client — which is what this unblocks — would have had no way
# to authenticate.
#
# The handler bodies are moved, not rewritten. `tests/integration/
# test_auth_contract.py` was captured against the blueprint *before* this port,
# 110 assertions over all 13 rules in both slash spellings, and passes against
# these unchanged; that file is the oracle and any edit to it means behaviour
# changed. Two details it deliberately pins because they read like bugs:
# `/refresh` answers **401** (not flask-jwt-extended's 422) when handed an access
# token, and `/apple`'s `getattr(user, 'profile_emoji', '\U0001f464')` default is
# dead — the column exists holding None, so None is what ships.
#
# Three things this port had to get right that a passing suite would not have
# shown:
#
# 1. **The rate limits.** register, login, apple and oidc carry
#    `@limiter.limit("10 per minute")`, and `tests/conftest.py` disables the
#    limiter for the whole session — so the contract oracle is structurally blind
#    to them. They have their own file, `test_auth_rate_limits.py`, which turns
#    the limiter back on and checks both that each route is limited *and that
#    each keeps its own bucket*: one Resource per path, never several methods
#    sharing one, because a shared counter would let ten failed logins lock
#    everybody out of registration.
# 2. **Plain dicts, never `jsonify`.** A restx Resource returning
#    `(Response, code)` hands `output_json` a Response object to serialise. Every
#    `return jsonify(x), n` became `return x, n`.
# 3. **Handlers keep their own try/except returning `{'error': ...}`.** Letting
#    restx shape these would answer `{'message': ...}` and drop the `data.error`
#    key web-ui reads — the D-40 failure, one layer down.
#
# Slash spellings: `@ns.route('/register')` registers the unslashed rule, and
# `url_map.strict_slashes = False` lets that one rule serve `/register/` too,
# exactly as the blueprint's own unslashed rule did. Verified by the oracle
# running every case twice.
#
# Why the blueprint was the side that survived: the Login, Register,
# RefreshToken, CurrentUser, Logout and CompleteOnboarding Resources that used to
# live in this file were *shadowed* — src/__init__.py registered the blueprint
# first, it claimed byte-identical URLs, and Werkzeug resolves duplicates to the
# first registered. So the S-07, S-08 and S-13 fixes were written here, reviewed,
# and never executed; they were ported to the live handler in #19 and these
# Resources deleted. The blueprint was also the more complete side, serving
# verify-email, resend-verification, forgot-password, reset-password, config and
# apple, which never existed here. What comes back below is the blueprint's code,
# not the 2024 Resources.

MIN_PASSWORD_LENGTH = 8


def _native_signin_available(provider):
    """Whether this server accepts native sign-in for `provider`."""
    from integrations.oidc import native
    return native.native_signin_enabled(provider)


def _complete_native_signin(provider, claims, full_name=None):
    """Turn verified provider claims into finPal tokens.

    Identity comes from the verified claims ONLY, never from the request body.
    Apple omits the email claim on every sign-in after the first, so a body
    fallback would be the normal path rather than an edge case — and because the
    user PK *is* the email, any caller with a valid token of their own could name
    someone else's address and be handed that account. Resolve by `sub`.
    """
    sub = claims.get('sub')
    if not sub:
        return {'error': 'Provider token carried no subject'}, 401

    token_email = claims.get('email')
    # Providers send email_verified as a bool or the string "true".
    email_verified = str(claims.get('email_verified', 'false')).lower() == 'true'

    known = User.query.filter_by(oidc_id=sub, oidc_provider=provider).first()
    if not known:
        # First sign-in for this provider identity: creating or linking an
        # account needs a trustworthy address, and only the token can supply one.
        if not token_email:
            return {
                'error': 'Your sign-in provider did not return an email address, '
                         'so finPal cannot create an account. Check the app has '
                         'permission to share your email.',
            }, 400
        if not email_verified:
            return {
                'error': 'This account email is not verified with the provider',
            }, 403

    oidc_data = {'sub': sub}
    if token_email and email_verified:
        oidc_data['email'] = token_email
        oidc_data['email_verified'] = True
    # Display-only. Apple returns the real name once, at first authorization, so
    # the client relays it — it never decides which account is used.
    if full_name:
        oidc_data['name'] = full_name
    elif claims.get('name'):
        oidc_data['name'] = claims['name']

    try:
        user = User.from_oidc(oidc_data, provider=provider)
    except ValueError as exc:
        # from_oidc raises ValueError only with an authored, user-facing message
        # ("already linked to X"). Not the str(e) leak CLAUDE.md forbids.
        return {'error': str(exc)}, 409
    except HTTPException:
        raise
    except Exception:
        db.session.rollback()
        logger.exception('Native OIDC sign-in failed to resolve a user')
        return {'error': 'Authentication failed'}, 500

    if not user:
        return {'error': 'Failed to create or find user'}, 500

    db.session.commit()

    access = create_access_token(identity=user.id,
                                 additional_claims={'email': user.id})
    refresh = create_refresh_token(identity=user.id)
    return {
        'access_token': access,
        'refresh_token': refresh,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'default_currency_code': getattr(user, 'default_currency_code', 'USD') or 'USD',
            'profile_emoji': getattr(user, 'profile_emoji', '\U0001f464'),
        },
    }, 200


@ns.route('/register')
class Register(Resource):
    # One Resource per route, so flask-limiter gives each its own bucket. See
    # test_auth_rate_limits.py::test_each_limited_route_counts_separately.
    decorators = [limiter.limit("10 per minute")]

    @ns.doc('register')
    @ns.expect(register_model)
    def post(self):
        """Register a new user"""
        try:
            data = request.get_json()

            # Enforced here, not by a marshmallow schema. The MIN_PASSWORD_LENGTH
            # schema lives on the register input schema, which the legacy
            # blueprint shadowed — so it never ran and any non-empty string was
            # accepted, including a single character.
            if not data or not data.get('email') or not data.get('password'):
                return {'error': 'Email and password are required'}, 400

            email = data['email']
            password = data['password']

            if len(password) < MIN_PASSWORD_LENGTH:
                return {
                    'error': 'Password must be at least %d characters'
                             % MIN_PASSWORD_LENGTH,
                }, 400

            # DISABLE_SIGNUPS was read into config and never referenced anywhere,
            # so a self-hoster who set it got no protection and no warning.
            # Checked before the invitation path on purpose: "signups disabled"
            # that still admitted anyone holding an invitation would not mean
            # what it says.
            if current_app.config.get('DISABLE_SIGNUPS'):
                return {
                    'error': 'Registration is disabled on this server.',
                }, 403
            username = data.get('username', email.split('@')[0])

            # Deliberately does not say the address is taken: that turns register
            # into an account-existence oracle (S-13).
            if User.query.filter_by(id=email).first():
                return {'error': 'Unable to create account'}, 400

            # If other users exist, require an invitation.
            user_count = User.query.filter_by(is_demo_user=False).count()
            invitation = Invitation.query.filter_by(
                email=email, status='pending').first()

            if user_count > 0 and not invitation:
                return {'error': 'Registration is by invitation only. '
                                 'Ask your household admin for an invite.'}, 403

            user = User(
                id=email,
                name=username,
                default_currency_code='USD',
                email_verified=False
            )
            user.set_password(password)

            # First non-demo user becomes admin
            if user_count == 0:
                user.is_admin = True

            token = user.generate_verification_token()

            db.session.add(user)

            if invitation:
                invitation.status = 'accepted'

            db.session.commit()

            # Send verification email. Deliberately NOT re-raising
            # HTTPException here: registration must succeed even if mail fails.
            try:
                from src.services.email_service import email_service
                import os

                app_url = os.getenv('APP_URL', 'http://localhost:3000')
                verification_link = f"{app_url}/verify-email?token={token}"

                email_service.send_verification_email(
                    to_email=user.id,
                    user_name=user.name,
                    verification_link=verification_link
                )
            except Exception:
                logger.exception('Failed to send verification email')

            access_token = create_access_token(
                identity=email, additional_claims={'email': email})
            refresh_token = create_refresh_token(identity=email)

            return {
                'access_token': access_token,
                'refresh_token': refresh_token,
                'user': {
                    'id': user.id,
                    'name': user.name,
                    'email': user.id,
                    'email_verified': user.email_verified,
                    'is_admin': user.is_admin,
                    'is_demo_user': user.is_demo_user,
                    'default_currency_code': user.default_currency_code,
                    'hasCompletedOnboarding': user.has_completed_onboarding,
                    'profile_emoji': user.profile_emoji,
                    'modules': _get_user_modules(user.id),
                }
            }, 201

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/login')
class Login(Resource):
    decorators = [limiter.limit("10 per minute")]

    @ns.doc('login')
    @ns.expect(login_model)
    def post(self):
        """Login user"""
        try:
            data = request.get_json()

            if not data or not data.get('email') or not data.get('password'):
                return {'error': 'Email and password are required'}, 400

            email = data['email']
            password = data['password']

            user = User.query.filter_by(id=email).first()

            # S-07: one message for a wrong password and an unknown address, so
            # login is not an account-existence oracle either.
            if not user or not user.check_password(password):
                return {'error': 'Invalid email or password'}, 401

            access_token = create_access_token(
                identity=email, additional_claims={'email': email})
            refresh_token = create_refresh_token(identity=email)

            return {
                'access_token': access_token,
                'refresh_token': refresh_token,
                # web-ui has read this key since the day it was written and never
                # received it: `_get_server_features()` existed and nothing called it,
                # so the client's fallback ("everything is on") was the only value it
                # ever used and every gate keyed to it was inert.
                'features': _get_server_features(),
                'user': {
                    'id': user.id,
                    'name': user.name,
                    'email': user.id,
                    'profile_emoji': user.profile_emoji,
                    'default_currency_code': user.default_currency_code,
                    'hasCompletedOnboarding': user.has_completed_onboarding,
                    'timezone': user.timezone,
                    'modules': _get_user_modules(user.id),
                    'notifications': {
                        'email': user.notification_email if hasattr(user, 'notification_email') else True,
                        'push': user.notification_push if hasattr(user, 'notification_push') else False,
                        'budgetAlerts': user.notification_budget_alerts if hasattr(user, 'notification_budget_alerts') else True,
                        'transactionAlerts': user.notification_transaction_alerts if hasattr(user, 'notification_transaction_alerts') else True
                    }
                }
            }, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/refresh')
class RefreshToken(Resource):
    @ns.doc('refresh_token', security='Bearer')
    @jwt_required(refresh=True)
    def post(self):
        """Exchange a refresh token for a new access token"""
        try:
            identity = get_jwt_identity()
            access_token = create_access_token(
                identity=identity, additional_claims={'email': identity})

            return {'access_token': access_token}, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/me')
class CurrentUser(Resource):
    @ns.doc('current_user', security='Bearer')
    @jwt_required()
    def get(self):
        """Get current user info"""
        try:
            identity = get_jwt_identity()
            user = User.query.filter_by(id=identity).first()

            if not user:
                return {'error': 'User not found'}, 404

            return {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'user_color': user.user_color,
                'profile_emoji': user.profile_emoji,
                'is_admin': user.is_admin,
                'default_currency_code': user.default_currency_code,
                'timezone': user.timezone,
                'hasCompletedOnboarding': user.has_completed_onboarding,  # camelCase
                # *** modules WAS MISSING HERE AND login SENDS IT — D-63. ***
                # The clients gate a module's nav entry AND its routes on
                # `user.modules`, so a user object without the key is a user with
                # no modules. `POST /auth/login` includes it; this endpoint did
                # not, and `OidcCallback.tsx` builds its user from THIS payload —
                # so signing in with OIDC made pointsPal silently disappear while
                # signing in with a password kept it. Same user, same
                # entitlement, different answer depending on the door used.
                # One user shape, one source: `_get_user_modules`.
                'modules': _get_user_modules(user.id),
                'notifications': {
                    'email': user.notification_email,
                    'push': user.notification_push,
                    'budgetAlerts': user.notification_budget_alerts,
                    'transactionAlerts': user.notification_transaction_alerts
                },
                'created_at': user.created_at.isoformat() if user.created_at else None
            }, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/logout')
class Logout(Resource):
    @ns.doc('logout', security='Bearer')
    @jwt_required()
    def post(self):
        """Logout — revoke the access token so it cannot be reused."""
        jti = get_jwt()['jti']
        try:
            if not RevokedToken.is_revoked(jti):
                db.session.add(RevokedToken(jti=jti))
                db.session.commit()
        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Failed to revoke token on logout')
            return {'error': 'Logout failed'}, 500
        return {'message': 'Logged out successfully'}, 200


@ns.route('/onboarding')
class CompleteOnboarding(Resource):
    @ns.doc('complete_onboarding', security='Bearer')
    @ns.expect(onboarding_model)
    @jwt_required()
    def post(self):
        """Complete onboarding — currency, timezone and notification prefs"""
        try:
            identity = get_jwt_identity()
            user = User.query.filter_by(id=identity).first()

            if not user:
                return {'error': 'User not found'}, 404

            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            if 'default_currency_code' in data:
                user.default_currency_code = data['default_currency_code']

            if 'timezone' in data:
                user.timezone = data['timezone']

            if 'profile_emoji' in data:
                user.profile_emoji = data['profile_emoji']

            if 'notifications' in data:
                notifications = data['notifications']
                if 'email' in notifications:
                    user.notification_email = notifications['email']
                if 'push' in notifications:
                    user.notification_push = notifications['push']
                if 'budgetAlerts' in notifications:
                    user.notification_budget_alerts = notifications['budgetAlerts']
                if 'transactionAlerts' in notifications:
                    user.notification_transaction_alerts = notifications['transactionAlerts']

            user.has_completed_onboarding = True

            db.session.commit()

            return {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'profile_emoji': user.profile_emoji,
                'default_currency_code': user.default_currency_code,
                'timezone': user.timezone,
                'hasCompletedOnboarding': True,
                'is_demo_user': user.is_demo_user,
                'modules': _get_user_modules(user.id),
            }, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/verify-email')
class VerifyEmail(Resource):
    @ns.doc('verify_email')
    @ns.expect(verify_email_model)
    def post(self):
        """Verify a user's email with the token from their verification link"""
        try:
            data = request.get_json()

            if not data or not data.get('token'):
                return {'error': 'Verification token is required'}, 400

            token = data['token']

            user = User.query.filter_by(verification_token=token).first()

            if not user:
                return {'error': 'Invalid verification token'}, 400

            if not user.verify_email_token(token):
                return {'error': 'Verification token has expired'}, 400

            user.clear_verification_token()
            db.session.commit()

            return {
                'message': 'Email verified successfully',
                'user': {
                    'id': user.id,
                    'email': user.id,
                    'email_verified': user.email_verified
                }
            }, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/resend-verification')
class ResendVerification(Resource):
    @ns.doc('resend_verification')
    @ns.expect(resend_verification_model)
    def post(self):
        """Send a fresh verification email"""
        try:
            data = request.get_json()

            if not data or not data.get('email'):
                return {'error': 'Email is required'}, 400

            email = data['email']
            user = User.query.filter_by(id=email).first()

            if not user:
                # Don't reveal whether the address is registered.
                return {'message': 'If the email exists, a verification link '
                                   'has been sent'}, 200

            if user.email_verified:
                return {'error': 'Email is already verified'}, 400

            token = user.generate_verification_token()
            db.session.commit()

            from src.services.email_service import email_service
            import os

            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            verification_link = f"{app_url}/verify-email?token={token}"

            email_service.send_verification_email(
                to_email=user.id,
                user_name=user.name or user.id.split('@')[0],
                verification_link=verification_link
            )

            return {'message': 'Verification email sent'}, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/forgot-password')
class ForgotPassword(Resource):
    @ns.doc('forgot_password')
    @ns.expect(forgot_password_model)
    def post(self):
        """Request a password reset email"""
        try:
            data = request.get_json()

            if not data or not data.get('email'):
                return {'error': 'Email is required'}, 400

            email = data['email']
            user = User.query.filter_by(id=email).first()

            # Always the same answer, so this is not an enumeration oracle.
            if not user:
                return {'success': True,
                        'message': 'If the email exists, a reset link has been '
                                   'sent'}, 200

            token = user.generate_reset_token()
            db.session.commit()

            from src.services.email_service import email_service
            import os

            app_url = os.getenv('APP_URL', 'http://localhost:3000')
            reset_link = f"{app_url}/reset-password?token={token}&email={user.id}"

            email_service.send_password_reset_email(
                to_email=user.id,
                user_name=user.name or user.id.split('@')[0],
                reset_link=reset_link
            )

            return {'success': True,
                    'message': 'If the email exists, a reset link has been '
                               'sent'}, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/config')
class AuthConfig(Resource):
    @ns.doc('auth_config')
    def get(self):
        """Auth capabilities, so a client can show the right login options"""
        import os
        oidc_enabled = current_app.config.get('OIDC_ENABLED', False)
        oidc_provider_name = current_app.config.get('OIDC_PROVIDER_NAME', 'SSO')
        apple_signin_enabled = os.getenv(
            'APPLE_SIGNIN_ENABLED', 'False').lower() == 'true'
        from integrations.oidc import native
        payload = {
            'oidc_enabled': bool(oidc_enabled),
            'oidc_provider_name': oidc_provider_name,
            'apple_signin_enabled': apple_signin_enabled,
            # Optional features live here as well as on the login response, so a client
            # can re-read them without a session and without having been present at
            # sign-in. That is D-63's lesson applied one field over: `modules` was sent
            # by login and omitted by `/auth/me`, and any client that refreshed from the
            # wrong endpoint silently lost it. Which features a server runs is not
            # sensitive — the docs describe these flags as controlling UI visibility.
            'features': _get_server_features(),
        }
        # Native sign-in config for mobile. Client IDs are public by design —
        # they identify the app to the provider and are embedded in every
        # shipped binary.
        payload.update(native.public_config())
        return payload, 200


@ns.route('/apple')
class AppleSignIn(Resource):
    decorators = [limiter.limit("10 per minute")]

    @ns.doc('apple_signin')
    @ns.expect(apple_signin_model)
    def post(self):
        """Deprecated alias for POST /api/v1/auth/oidc with provider=apple.

        Kept because shipped mobile builds call it. It delegates rather than
        duplicating: the previous implementation was ~110 lines that refetched
        Apple's JWKS on every single sign-in and verified the issuer inline. All
        of that now lives in integrations/oidc/native.py, shared with Google,
        with the keys cached for an hour.

        Note the field name differs — this endpoint takes `identity_token`,
        which is what Apple's SDK calls it, while /auth/oidc takes `id_token`.
        """
        from integrations.oidc import native

        # NOT silent=True: a malformed body must keep raising BadRequest so the
        # app's own JSON error handler answers it, same as the blueprint did.
        data = request.get_json() or {}
        identity_token = data.get('identity_token')

        if not _native_signin_available(native.APPLE):
            return {'error': 'Apple Sign In is not enabled'}, 403
        if not identity_token:
            return {'error': 'identity_token is required'}, 400

        try:
            claims = native.verify_id_token(native.APPLE, identity_token)
        except native.OidcConfigError as exc:
            current_app.logger.error('Apple Sign In misconfigured: %s', exc)
            return {'error': str(exc)}, 503
        except native.OidcVerificationError as exc:
            current_app.logger.warning('Apple token verification failed: %s', exc)
            return {'error': str(exc)}, 401

        return _complete_native_signin(native.APPLE, claims,
                                       data.get('full_name'))


@ns.route('/reset-password')
class ResetPassword(Resource):
    @ns.doc('reset_password')
    @ns.expect(reset_password_model)
    def post(self):
        """Set a new password using the token from a reset email"""
        try:
            data = request.get_json()

            token = data.get('token')
            # Accept both 'password' and 'new_password' for compatibility —
            # both spellings are in the wild.
            new_password = data.get('password') or data.get('new_password')
            if not token or not new_password:
                return {'error': 'Token and new password are required'}, 400

            if len(new_password) < MIN_PASSWORD_LENGTH:
                return {'error': 'Password must be at least %d characters'
                                 % MIN_PASSWORD_LENGTH}, 400

            user = User.query.filter_by(reset_token=token).first()

            if not user:
                return {'error': 'Invalid reset token'}, 400

            if not user.verify_reset_token(token):
                return {'error': 'Reset token has expired'}, 400

            user.set_password(new_password)
            user.clear_reset_token()
            db.session.commit()

            return {'success': True,
                    'message': 'Password reset successfully'}, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error in auth endpoint')
            return {'success': False,
                    'error': 'An internal error occurred'}, 500


@ns.route('/oidc')
class NativeOidcSignIn(Resource):
    decorators = [limiter.limit("10 per minute")]

    @ns.doc('native_oidc_signin')
    @ns.expect(oidc_signin_model)
    def post(self):
        """Sign in with a provider ID token obtained natively on a device.

        Contract matches pantryPal's so mobile code is portable across the pals:
        `{provider, id_token | access_token, full_name?}`.

        This is additive. The web redirect PKCE flow in
        integrations/oidc/auth.py is what self-hosters on Authentik, Keycloak
        and Authelia use and is untouched.
        """
        from integrations.oidc import native

        # NOT silent=True: a malformed body must keep raising BadRequest so the
        # app's own JSON error handler answers it, same as the blueprint did.
        data = request.get_json() or {}
        provider = (data.get('provider') or '').strip().lower()
        id_token = data.get('id_token')
        access_token = data.get('access_token')

        if not provider:
            return {'error': 'provider is required'}, 400
        if not _native_signin_available(provider):
            return {
                'error': '%s sign-in is not enabled on this server'
                         % provider.title(),
            }, 403
        if not id_token and not access_token:
            return {'error': 'id_token or access_token is required'}, 400

        try:
            if id_token:
                claims = native.verify_id_token(provider, id_token)
            else:
                # Google's native SDKs often hand the app an access_token
                # instead. Apple never uses this path.
                claims = native.fetch_userinfo(provider, access_token)
        except native.OidcConfigError as exc:
            # The operator's problem, not the caller's — do not report it as 401
            # or they will go hunting for a bad token that does not exist.
            current_app.logger.error('Native OIDC misconfigured: %s', exc)
            return {'error': str(exc)}, 503
        except native.OidcVerificationError as exc:
            # Authored, client-safe messages only.
            current_app.logger.warning('Native OIDC verification failed: %s', exc)
            return {'error': str(exc)}, 401

        return _complete_native_signin(provider, claims, data.get('full_name'))


@ns.route('/sync')
class BackgroundSync(Resource):
    @ns.doc('background_sync', security='Bearer')
    @jwt_required()
    def post(self):
        """
        Trigger background SimpleFin + pointsPal refresh for the current user.
        Returns 202 immediately — sync runs in a daemon thread.
        Called by the frontend on app open (once per browser session).
        """
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if user and not user.is_demo_user:
            _background_sync(current_app._get_current_object(), user_id)
        return {'status': 'sync started'}, 202


@ns.route('/whoami')
class WhoAmI(Resource):
    @ns.doc('whoami', security='Bearer')
    # Token-reachable on purpose, unlike /auth/me which is JWT-only.
    # An API client needs to know which identity its token belongs to: finPal
    # returns household-wide rows for accounts, categories and budgets
    # (src/utils/household.py:get_all_user_ids), so a client cannot infer the
    # caller from the data — and guessing would attribute one member's spending
    # to another with total confidence. Returns the minimum needed to tell
    # "you" from "someone else in your household", nothing more.
    @api_auth_required(scope=SCOPE_READ)
    def get(self):
        """The identity this credential belongs to."""
        user_id = get_jwt_identity()
        user = User.query.filter_by(id=user_id).first()
        if not user:
            return {'error': 'User not found'}, 404
        return {'id': user.id, 'name': user.name}, 200
