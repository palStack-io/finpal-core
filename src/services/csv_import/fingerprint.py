"""Header fingerprinting, so a bank's CSV format is recognised on sight."""
from __future__ import annotations

import hashlib

from src.extensions import db
from src.models.import_source import ImportProfile

# Joined with a unit separator rather than a comma so a header that itself
# contains a comma cannot collide with two separate headers.
_UNIT_SEP = '\x1f'

_BOM = '﻿'


def fingerprint_headers(headers: list[str]) -> str:
    """Stable sha256 of a header row.

    Normalized so cosmetic differences (BOM, casing, padding) do not produce a
    different fingerprint. Order IS significant — two banks can use the same
    column names in a different order with different meanings.
    """
    normalized = [
        (h or '').replace(_BOM, '').strip().lower()
        for h in headers
    ]
    joined = _UNIT_SEP.join(normalized)
    return hashlib.sha256(joined.encode('utf-8')).hexdigest()


def find_profile(headers: list[str], user_id: str) -> ImportProfile | None:
    return ImportProfile.query.filter_by(
        header_fingerprint=fingerprint_headers(headers),
        user_id=user_id,
    ).first()


def save_profile(headers, mapping, user_id, name, date_format,
                 sign_convention, origin, confidence=None) -> ImportProfile:
    """Create or update the profile for this header shape."""
    fp = fingerprint_headers(headers)
    profile = ImportProfile.query.filter_by(header_fingerprint=fp).first()
    if profile is None:
        profile = ImportProfile(header_fingerprint=fp, user_id=user_id)
        db.session.add(profile)

    profile.name = name
    profile.mapping = mapping
    profile.date_format = date_format
    profile.sign_convention = sign_convention
    profile.origin = origin
    profile.confidence = confidence
    db.session.commit()
    return profile
