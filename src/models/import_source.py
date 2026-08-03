"""Models for CSV import sources, learned column profiles and import batches.

Per finpal_core/CLAUDE.md these must not import other model files — use
string-based relationships.
"""
from datetime import datetime

from src.extensions import db


class ImportSource(db.Model):
    __tablename__ = 'import_sources'
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(30), nullable=False, default='local_folder')
    config = db.Column(db.JSON, nullable=False, default=dict)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    scan_interval_minutes = db.Column(db.Integer, nullable=False, default=5)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_scanned_at = db.Column(db.DateTime, nullable=True)


class ImportProfile(db.Model):
    __tablename__ = 'import_profiles'
    # Uniqueness is per user, NOT global. Two users can bank with the same
    # institution, so the same header shape legitimately appears twice and each
    # owner keeps their own mapping. A global unique here let one user's save
    # overwrite another's profile — every other access path (find_profile,
    # /api/v1/import-profiles) is user-scoped.
    __table_args__ = (
        db.UniqueConstraint('user_id', 'header_fingerprint',
                            name='uq_import_profiles_user_fingerprint'),
    )
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    header_fingerprint = db.Column(db.String(64), nullable=False, index=True)
    mapping = db.Column(db.JSON, nullable=False)
    date_format = db.Column(db.String(40), nullable=False, default='%Y-%m-%d')
    sign_convention = db.Column(db.String(20), nullable=False, default='negative_is_expense')
    origin = db.Column(db.String(20), nullable=False, default='manual')  # manual | heuristic
    confidence = db.Column(db.Float, nullable=True)
    times_used = db.Column(db.Integer, nullable=False, default=0)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class ImportBatch(db.Model):
    __tablename__ = 'import_batches'
    id = db.Column(db.Integer, primary_key=True)
    source_id = db.Column(db.Integer, db.ForeignKey('import_sources.id'), nullable=True)
    profile_id = db.Column(db.Integer, db.ForeignKey('import_profiles.id'), nullable=True)
    filename = db.Column(db.String(255), nullable=False)
    # UNIQUE is deliberate: it is what makes concurrent scans safe, rather than
    # relying on the scheduler gate alone.
    file_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    mapping_used = db.Column(db.JSON, nullable=True)  # snapshot, not a pointer
    confidence = db.Column(db.Float, nullable=True)
    row_count = db.Column(db.Integer, nullable=False, default=0)
    imported_count = db.Column(db.Integer, nullable=False, default=0)
    skipped_count = db.Column(db.Integer, nullable=False, default=0)
    error_count = db.Column(db.Integer, nullable=False, default=0)
    errors = db.Column(db.JSON, nullable=True)
    status = db.Column(db.String(20), nullable=False)  # success|partial|failed|reverted
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reverted_at = db.Column(db.DateTime, nullable=True)

    # ImportProfile lives in this same file, so this is not the cross-model
    # import CLAUDE.md forbids. Eager-loaded because the batch history endpoint
    # serialises a whole page at once and would otherwise emit a query per row.
    profile = db.relationship('ImportProfile', lazy='joined')
