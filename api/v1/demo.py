"""Demo Mode API endpoints"""
from flask import current_app
from flask_restx import Namespace, Resource, fields

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('demo', description='Demo mode operations')

# Define response models
demo_status_model = ns.model('DemoStatus', {
    'enabled': fields.Boolean(description='Whether demo mode is enabled'),
    # *** A CONFIGURED INTENTION, NOT AN ENFORCED LIMIT — AUDIT D-232. ***
    # Nothing in this codebase expires a demo session: `session_timeout.py`
    # registers no request hook and has zero production callers on all four of
    # its methods, and a real token from the live demo lives 86400s against the
    # 7200 this field claimed. The web UI stopped presenting it as a limit on
    # 2026-09-16 (owner decision: withdraw the claim rather than implement
    # expiry). Kept in the payload because removing it breaks any self-hoster's
    # client; described honestly so no new client repeats the mistake. See
    # `DemoService.get_demo_timeout_minutes`.
    'timeout_minutes': fields.Integer(
        description='Configured demo session timeout in minutes. NOT ENFORCED — '
                    'no request hook expires demo sessions (AUDIT D-232). Do not '
                    'present this to a user as a session limit.'),
})

demo_account_model = ns.model('DemoAccount', {
    'email': fields.String(description='Demo account email'),
    'password': fields.String(description='Demo account password'),
    'name': fields.String(description='Demo user display name'),
    'persona': fields.String(description='Demo user persona/profile type'),
    'currency': fields.String(description='Default currency'),
})


@ns.route('/status')
class DemoStatus(Resource):
    @ns.doc('get_demo_status')
    @ns.marshal_with(demo_status_model)
    def get(self):
        """Get demo mode status and configuration"""
        return {
            'enabled': current_app.config.get('DEMO_MODE', False),
            'timeout_minutes': current_app.config.get('DEMO_TIMEOUT_MINUTES', 10),
        }, 200


@ns.route('/accounts')
class DemoAccounts(Resource):
    @ns.doc('get_demo_accounts')
    @ns.marshal_list_with(demo_account_model)
    def get(self):
        """Get list of demo accounts (only when demo mode is enabled)"""
        if not current_app.config.get('DEMO_MODE', False):
            return [], 200

        from src.services.demo import DemoService
        return DemoService.get_demo_accounts_info(), 200
