"""
Custom decorators for authentication and access control
"""

from functools import wraps
from flask import current_app, jsonify
from flask_jwt_extended import get_jwt_identity
from src.models.user import User


def demo_restricted(f):
    """
    Decorator to restrict demo users from accessing certain API endpoints.
    Used for JWT-protected API routes.
    Returns a JSON error response with 403 status for demo users.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
            if user_id:
                user = User.query.filter_by(id=user_id).first()
                if user and user.is_demo_user:
                    return jsonify({
                        'error': 'This feature is disabled in demo mode',
                        'code': 'DEMO_RESTRICTED',
                        'message': 'Demo accounts cannot perform this action. Sign up for a full account to access all features.'
                    }), 403
        except Exception:
            # If JWT identity check fails, let it pass through to the route's own auth
            pass
        return f(*args, **kwargs)
    return decorated_function
