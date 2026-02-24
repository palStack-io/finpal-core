"""Demo Mode API endpoints"""
from flask import current_app
from flask_restx import Namespace, Resource, fields

# Create namespace
ns = Namespace('demo', description='Demo mode operations')

# Define response models
demo_status_model = ns.model('DemoStatus', {
    'enabled': fields.Boolean(description='Whether demo mode is enabled'),
    'timeout_minutes': fields.Integer(description='Demo session timeout in minutes'),
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
