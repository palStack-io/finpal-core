"""Encrypt the SimpleFin credentials that were already stored in plaintext.

*** THIS IS THE RELEASE-GATING HALF OF D-280, AND IT IS NOT THE ACCESSORS. ***
Adding `set_access_url()` protects credentials written from now on. Every
instance that ran before this shipped still has the old ones sitting in the
clear — and those are the credentials that have been exposed the longest.
A fix that only covers new rows leaves the actual exposure in place.

*** CONDITION-KEYED, PER D-178. *** The condition is "*this stored value does
not decrypt and looks like a URL*", not a version stamp and not a one-shot
flag. So it is idempotent, safe on every boot, and — the part D-178 was
actually about — an instance that was already running before this shipped is
FIXED by it rather than skipped by it.

**It never touches a value it cannot account for.** A row that neither
decrypts nor looks like a URL is left exactly as it is: re-encrypting
something unreadable would turn a recoverable key problem into permanent
data loss. `looks_encrypted()` makes that call.

Verify it against the DATABASE after deploying, not against a healthy-looking
container — that is how D-178 was found:

    SELECT user_id, left(access_url, 12) FROM "SimpleFin";

Encrypted values start `gAAAAA`. Anything starting `http` has not been
converted. **And grep `finpal-scheduler` as well as `finpal-backend` for the
log line below** — the boot advisory lock has been won by the scheduler
twice, so grepping only the backend reads as "the backfill never ran".
"""

import logging

from src.extensions import db

logger = logging.getLogger(__name__)


def backfill_simplefin_encryption():
    """Re-encrypt plaintext SimpleFin credentials. Returns how many changed.

    Never raises: this runs at boot, and a credential-encryption problem must
    not stop the app from starting. It logs loudly instead, because a silent
    failure here means the exposure D-280 describes is still live.
    """
    from src.models.account import SimpleFin
    from src.models.user import UserApiSettings
    from src.utils.credential_crypto import encrypt, looks_encrypted

    converted = 0
    try:
        for row in SimpleFin.query.all():
            if looks_encrypted(row.access_url):
                continue
            # Read the raw column deliberately — `get_access_url()` would
            # route through the legacy branch and return the same string,
            # but going straight to the column makes it obvious that what is
            # being encrypted is exactly what was stored.
            row.access_url = encrypt(row.access_url)
            converted += 1

        for row in UserApiSettings.query.filter(
                UserApiSettings.simplefin_access_url.isnot(None)).all():
            if looks_encrypted(row.simplefin_access_url):
                continue
            row.simplefin_access_url = encrypt(row.simplefin_access_url)
            converted += 1

        if converted:
            db.session.commit()
            logger.warning(
                'D-280: encrypted %d SimpleFin credential(s) that were stored '
                'in plaintext. They were readable by anyone with a copy of '
                'this database (including backups) until now.', converted)
        else:
            logger.info('D-280: no plaintext SimpleFin credentials found')
    except Exception:
        db.session.rollback()
        logger.exception(
            'D-280 backfill could not run. SimpleFin credentials written '
            'before this release may still be stored in PLAINTEXT — check '
            'with: SELECT user_id, left(access_url, 12) FROM "SimpleFin";')

    return converted
