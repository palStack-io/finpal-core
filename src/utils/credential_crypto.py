"""Fernet for stored third-party credentials — with a legacy plaintext path.

*** THIS EXISTS BECAUSE TWO COLUMNS SAID "encrypted" AND STORED PLAINTEXT
(AUDIT D-280). *** `SimpleFin.access_url` and
`UserApiSettings.simplefin_access_url` both carried comments claiming
encryption while the write path assigned the pasted string straight in. A
SimpleFin access URL is a bearer credential: it embeds the token and grants
read access to the holder's bank transactions. Anyone with a copy of the
database — a backup, a `pg_dump`, a stolen volume — had the tokens.

*** `decrypt()` TOLERATES LEGACY PLAINTEXT, AND THAT IS NOT THE
"accept-two-formats" ANTIPATTERN. *** Every instance that ran before this
shipped has plaintext in those columns. Refusing to read them would take
SimpleFin offline for every existing self-hoster on upgrade — a far worse
outcome than the defect. The tolerance is deliberately NARROW: a value is
treated as legacy only if it fails to decrypt **and** looks like a real
SimpleFin URL. Anything else is a wrong key or corruption, and is reported
rather than returned.

`backfill_simplefin_encryption()` closes the window by re-encrypting those
rows at boot, so the legacy branch stops being reachable on any instance that
has booted once since this shipped.

*** THE KEY IS `UserApiSettings._get_fernet()`, UNCHANGED, INCLUDING ITS
`SECRET_KEY` DERIVATION — ON PURPOSE. *** That derivation is weaker than a
dedicated `ENCRYPTION_KEY` and finPal Premium removed it. It must stay here:
`fmp_api_key` has been encrypted with it since it was written, so changing
the key derivation would make every existing API key on every instance that
never set `ENCRYPTION_KEY` permanently unreadable. Key management in core is
its own decision with its own migration; D-280 is about plaintext.
"""

import logging

logger = logging.getLogger(__name__)

#: A stored value is treated as legacy plaintext only if it starts with one of
#: these. A SimpleFin access URL carries credentials in its userinfo section
#: and the token in its path.
#:
#: *** DELIBERATELY NOT WRITTEN OUT AS AN EXAMPLE URL HERE. ***
#: `tests/unit/test_no_data_leaves_the_instance.py` scans every source file
#: for URL literals and requires each host to be declared as somewhere
#: finPal sends data. An illustrative access URL written out in this
#: comment made that guard report its userinfo segment as an undeclared
#: outbound host and refused the commit. The guard was right to: this module
#: makes no outbound call whatsoever, so declaring a host for it would have
#: asserted the opposite of the truth. `bridge.simplefin.org` is already declared, by the
#: client that really does talk to it.
_PLAINTEXT_PREFIXES = ('http://', 'https://')


def _fernet():
    from src.models.user import UserApiSettings
    return UserApiSettings._get_fernet()


def encrypt(value):
    """Encrypt a string. `None`/empty passes through as `None`.

    An empty credential means "nothing stored" and must stay NULL — an
    encrypted empty string is a value, and would make the "is SimpleFin
    connected?" checks read True.
    """
    if not value:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value, context=''):
    """Decrypt a stored credential, reading legacy plaintext if it finds it.

    Returns `None` when there is nothing stored, and `None` — with an error
    log naming `context` — when a value neither decrypts nor looks like a
    legacy URL.

    **Returns None rather than raising**, matching `get_api_key()`'s existing
    behaviour in this repo. The tradeoff is deliberate and is the opposite of
    the choice premium makes: a self-hoster whose key has changed gets a
    SimpleFin panel that says it cannot read the credential, instead of a 500
    on the accounts page. Premium raises because it has an operator watching;
    core's user IS the operator and needs the app to stay up.
    """
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        pass

    if value.startswith(_PLAINTEXT_PREFIXES):
        # Pre-D-280 row. Readable, and `backfill_simplefin_encryption` will
        # re-encrypt it at the next boot.
        logger.info(
            'Read a pre-D-280 plaintext credential%s; it will be encrypted '
            'by the boot backfill', f' ({context})' if context else '')
        return value

    logger.error(
        'A stored credential%s could not be decrypted and is not a legacy '
        'plaintext URL. This usually means ENCRYPTION_KEY (or SECRET_KEY, '
        'which it is derived from when ENCRYPTION_KEY is unset) has changed '
        'since the value was written.', f' ({context})' if context else '')
    return None


def looks_encrypted(value):
    """Whether a stored value is already ciphertext.

    Used by the backfill to decide what still needs converting. Asks the
    question by DECRYPTING rather than by pattern-matching the Fernet token
    format, so a value that merely looks like a token is not skipped.
    """
    if not value:
        return True  # nothing to convert
    if value.startswith(_PLAINTEXT_PREFIXES):
        return False
    try:
        _fernet().decrypt(value.encode())
        return True
    except Exception:
        # Neither decryptable nor URL-shaped: leave it alone. Re-encrypting
        # something we cannot read would destroy whatever it is.
        return True
