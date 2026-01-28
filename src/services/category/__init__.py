"""
Category Service
Handles category management and auto-categorization mappings
"""

from src.services.category.routes import bp, mapping_bp
from src.services.category.api_routes import api_bp

__all__ = ['bp', 'mapping_bp', 'api_bp']
