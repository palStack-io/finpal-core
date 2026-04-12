"""
UserModuleAccess — per-user module access control.

Controlled by adminPal via HMAC-signed API calls. Default is open-access
(no row = enabled). A row with enabled=False explicitly revokes access.
"""

from datetime import datetime
from src.extensions import db


class UserModuleAccess(db.Model):
    __tablename__ = 'user_module_access'

    user_id = db.Column(
        db.String(120),
        db.ForeignKey('users.id'),
        primary_key=True,
        nullable=False,
    )
    module_name = db.Column(db.String(100), primary_key=True, nullable=False)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    granted_by = db.Column(db.String(50), nullable=True)  # 'adminpal' | 'manual'
    granted_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<UserModuleAccess {self.user_id}/{self.module_name} enabled={self.enabled}>'
