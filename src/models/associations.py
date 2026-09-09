"""
Association tables for many-to-many relationships
"""

from datetime import datetime

from src.extensions import db

# Group-User Association Table
group_users = db.Table('group_users',
    db.Column('group_id', db.Integer, db.ForeignKey('groups.id'), primary_key=True),
    db.Column('user_id', db.String(120), db.ForeignKey('users.id'), primary_key=True)
)

# Co-owners IN ADDITION to `Account.user_id`, which stays the PRIMARY owner.
#
# *** PERMISSION AND PRESENTATION ONLY. ATTRIBUTION IS UNCHANGED. *** This table is
# never consulted by `owner_scope_filter`, so no historical figure moves and D-18
# stays settled. Three alternatives were rejected and are recorded in the spec so
# they are not re-proposed: 50/50 split attribution, attributing by `paid_by`, and
# a per-account share ratio from a cutover date.
#
# RELEASE-GATING: a new table IS created by `create_all()` on an existing database,
# unlike a new column -- but only if the model is imported by the time it runs. It
# is reached through `src/models/associations.py`, which `src/models/__init__.py`
# already loads.
account_owners = db.Table(
    'account_owners',
    db.Column('account_id', db.Integer,
              db.ForeignKey('accounts.id', name='fk_account_owner_account'),
              primary_key=True),
    db.Column('user_id', db.String(120),
              db.ForeignKey('users.id', name='fk_account_owner_user'),
              primary_key=True),
    db.Column('added_at', db.DateTime, default=datetime.utcnow),
)

# Expense-Tag Association Table
expense_tags = db.Table('expense_tags',
    db.Column('expense_id', db.Integer, db.ForeignKey('expenses.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tags.id'), primary_key=True)
)
