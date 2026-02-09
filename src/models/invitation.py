"""
Invitation model for household invite system
"""

from datetime import datetime
import secrets
from src.extensions import db


class Invitation(db.Model):
    __tablename__ = 'invitations'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), default='member')  # member/admin/viewer
    invited_by = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending/accepted/cancelled
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    inviter = db.relationship('User', backref=db.backref('invitations_sent', lazy=True))

    def __init__(self, **kwargs):
        if 'token' not in kwargs:
            kwargs['token'] = secrets.token_urlsafe(32)
        super().__init__(**kwargs)
