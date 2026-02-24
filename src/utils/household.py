"""
Household utility
One finPal instance = one household. All users share the same data.
"""

from src.models.user import User


def get_all_user_ids():
    """Get all user IDs on this instance (the household)."""
    return [u.id for u in User.query.with_entities(User.id).all()]
