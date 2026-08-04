"""OIDC helpers for the User model.

`from_oidc` used to be defined here and attached to `User` at startup by
`extend_user_model()`. It now lives on the model itself, in
`src/models/user.py`.

That mattered: the attach happened inside `if oidc_enabled`, so with
`OIDC_ENABLED=false` the method simply did not exist and every native Apple
sign-in raised `AttributeError` — a bug that was hard to find precisely because
`grep from_oidc` did not lead to a definition on the class. A real classmethod
cannot be conditionally absent.
"""

def create_oidc_migration(directory="migrations/versions"):
    """
    Create a migration script for adding OIDC fields to User model
    
    Args:
        directory: Directory to save the migration file
        
    Returns:
        Path to the created migration file
    """
    import os
    from datetime import datetime
    
    # Create migration content
    migration_content = """\"\"\"Add OIDC support fields to users table

Revision ID: add_oidc_fields
Revises: # Will be filled automatically
Create Date: {date}

\"\"\"
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = 'add_oidc_fields'
down_revision = None  # This will be filled automatically
branch_labels = None
depends_on = None


def upgrade():
    # Add OIDC-related columns to users table
    op.add_column('users', sa.Column('oidc_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('oidc_provider', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('last_login', sa.DateTime, nullable=True))
    
    # Create index for faster lookups by OIDC ID
    op.create_index(op.f('ix_users_oidc_id'), 'users', ['oidc_id'], unique=True)


def upgrade_with_check():
    # Check if columns already exist (for manual execution)
    inspector = sa.inspect(op.get_bind())
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    if 'oidc_id' not in columns:
        op.add_column('users', sa.Column('oidc_id', sa.String(255), nullable=True))
    
    if 'oidc_provider' not in columns:
        op.add_column('users', sa.Column('oidc_provider', sa.String(50), nullable=True))
    
    if 'last_login' not in columns:
        op.add_column('users', sa.Column('last_login', sa.DateTime, nullable=True))
    
    # Create index if it doesn't exist
    indices = [idx['name'] for idx in inspector.get_indexes('users')]
    if 'ix_users_oidc_id' not in indices:
        op.create_index(op.f('ix_users_oidc_id'), 'users', ['oidc_id'], unique=True)


def downgrade():
    # Remove OIDC-related columns and index
    op.drop_index(op.f('ix_users_oidc_id'), table_name='users')
    op.drop_column('users', 'last_login')
    op.drop_column('users', 'oidc_provider')
    op.drop_column('users', 'oidc_id')
""".format(date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    # Ensure directory exists
    os.makedirs(directory, exist_ok=True)
    
    # Create migration file
    filename = os.path.join(directory, "add_oidc_fields.py")
    
    with open(filename, 'w') as f:
        f.write(migration_content)
    
    return filename