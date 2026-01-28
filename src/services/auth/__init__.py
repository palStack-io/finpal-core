"""
Auth Service Module
Handles user authentication and management
"""

from src.services.auth.routes import bp, admin_bp
from src.services.auth.api_routes import api_bp

__all__ = ['bp', 'admin_bp', 'api_bp']
