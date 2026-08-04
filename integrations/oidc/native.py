"""Native provider sign-in: verify a mobile app's ID token against JWKS.

This is the *native* path — an app gets an ID token from Google or Apple on the
device and posts it here. It is additive: the web redirect PKCE flow in
`auth.py` is what self-hosters on Authentik, Keycloak and Authelia use, and it
stays exactly as it is.

Ported from pantryPal's `oidc.py`, with four deliberate differences:

1. **Sync, using `requests`.** pantryPal's is `async`/`httpx`; under Flask 2.2.5
   an awaitable never resolves in a normal view, so a direct port would hang or
   return a coroutine.
2. **Client IDs come from config, never hardcoded.** pantryPal hardcodes
   `com.palstack.pantrypal`, which is a bug waiting for the second app.
3. **The issuer is verified.** pantryPal checks `audience` only. Without `iss`,
   a token minted by any provider whose audience happens to match is accepted.
4. **JWKS keys are cached with a TTL**, which pantryPal does too and finPal's
   existing `/auth/apple` does not — it refetches Apple's keys on every single
   sign-in.
"""
import os
import threading
import time

import jwt as pyjwt
import requests
from jwt.algorithms import RSAAlgorithm

GOOGLE = 'google'
APPLE = 'apple'

GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration'
APPLE_DISCOVERY_URL = 'https://appleid.apple.com/.well-known/openid-configuration'

# Google mints tokens under either spelling; both are legitimate.
GOOGLE_ISSUERS = ('https://accounts.google.com', 'accounts.google.com')
APPLE_ISSUER = 'https://appleid.apple.com'

JWKS_CACHE_TTL_SECONDS = 3600
HTTP_TIMEOUT_SECONDS = 10

# discovery_url -> (keys, expires_at). Guarded by a lock because gunicorn serves
# concurrently within a worker; without it two simultaneous first sign-ins race
# and both fetch.
_jwks_cache = {}
_jwks_lock = threading.Lock()


class OidcConfigError(Exception):
    """The server is not configured for this provider. Not the caller's fault."""


class OidcVerificationError(Exception):
    """The token could not be verified. Message is safe to return to a client."""


def google_client_id():
    return (os.getenv('GOOGLE_CLIENT_ID') or '').strip()


def apple_client_id():
    """Apple calls this the bundle ID; it is the token's audience."""
    return (os.getenv('APPLE_CLIENT_ID') or '').strip()


def native_signin_enabled(provider):
    """Whether a provider is configured. Absence of a client ID means absence."""
    if provider == GOOGLE:
        return bool(google_client_id())
    if provider == APPLE:
        return (os.getenv('APPLE_SIGNIN_ENABLED', 'False').strip().lower() == 'true'
                and bool(apple_client_id()))
    return False


def public_config():
    """Fields the login screen needs. Client IDs are public by design."""
    return {
        'google_client_id': google_client_id(),
        'google_signin_enabled': bool(google_client_id()),
        'apple_signin_enabled': native_signin_enabled(APPLE),
    }


def _provider_config(provider):
    if provider == GOOGLE:
        client_id = google_client_id()
        if not client_id:
            raise OidcConfigError(
                'Google sign-in is not configured on this server')
        return {
            'client_id': client_id,
            'discovery_url': GOOGLE_DISCOVERY_URL,
            'issuers': GOOGLE_ISSUERS,
        }
    if provider == APPLE:
        client_id = apple_client_id()
        if not client_id:
            raise OidcConfigError(
                'Apple Sign In is not configured on this server')
        return {
            'client_id': client_id,
            'discovery_url': APPLE_DISCOVERY_URL,
            'issuers': (APPLE_ISSUER,),
        }
    raise OidcConfigError('Unknown sign-in provider: %s' % provider)


def _fetch_jwks(discovery_url, force=False):
    """Provider signing keys, cached for JWKS_CACHE_TTL_SECONDS."""
    now = time.time()
    if not force:
        cached = _jwks_cache.get(discovery_url)
        if cached and cached[1] > now:
            return cached[0]

    with _jwks_lock:
        # Re-check: another thread may have populated it while we waited.
        cached = _jwks_cache.get(discovery_url)
        if not force and cached and cached[1] > time.time():
            return cached[0]

        discovery = requests.get(discovery_url, timeout=HTTP_TIMEOUT_SECONDS)
        discovery.raise_for_status()
        jwks_uri = discovery.json().get('jwks_uri')
        if not jwks_uri:
            raise OidcVerificationError(
                'Provider discovery document has no jwks_uri')

        jwks = requests.get(jwks_uri, timeout=HTTP_TIMEOUT_SECONDS)
        jwks.raise_for_status()
        keys = jwks.json().get('keys', [])
        if not keys:
            raise OidcVerificationError('Provider published no signing keys')

        _jwks_cache[discovery_url] = (keys, time.time() + JWKS_CACHE_TTL_SECONDS)
        return keys


def clear_jwks_cache():
    """For tests, and for a future admin action if key rotation ever strands us."""
    with _jwks_lock:
        _jwks_cache.clear()


def _decode(id_token, key_dict, config):
    """Verify signature, audience and issuer. Algorithm is pinned."""
    public_key = RSAAlgorithm.from_jwk(key_dict)
    claims = pyjwt.decode(
        id_token,
        public_key,
        # Pinned deliberately: never take `alg` from the untrusted JWT header,
        # or a token can claim `none` and skip verification entirely.
        algorithms=['RS256'],
        audience=config['client_id'],
        # `issuer` is NOT passed to pyjwt. PyJWT 2.8's _validate_iss does a plain
        # `payload['iss'] != issuer`, so handing it a list or tuple compares the
        # claim against the container and rejects every valid token — verification
        # that looks present and is inverted. Google mints under two spellings, so
        # a set membership check is what is actually needed.
        options={'verify_iss': False},
    )

    issuer = claims.get('iss')
    if not issuer:
        raise pyjwt.InvalidIssuerError('Token has no issuer claim')
    if issuer not in config['issuers']:
        raise pyjwt.InvalidIssuerError('Invalid issuer')
    return claims


def verify_id_token(provider, id_token):
    """Return the verified claims of `id_token`, or raise.

    Raises OidcConfigError when the server is not set up for this provider, and
    OidcVerificationError when the token itself is not acceptable — the caller
    maps those to 500-ish and 401 respectively, because they are different
    problems belonging to different people.
    """
    if not id_token:
        raise OidcVerificationError('No ID token was provided')
    config = _provider_config(provider)

    try:
        header = pyjwt.get_unverified_header(id_token)
    except Exception:
        raise OidcVerificationError('Malformed ID token')

    kid = header.get('kid')

    def _find(keys):
        if kid:
            return next((k for k in keys if k.get('kid') == kid), None)
        # No kid: only unambiguous if the provider publishes exactly one key.
        return keys[0] if len(keys) == 1 else None

    try:
        keys = _fetch_jwks(config['discovery_url'])
    except OidcVerificationError:
        raise
    except Exception:
        raise OidcVerificationError(
            'Could not reach the sign-in provider to verify this token')

    key_dict = _find(keys)
    if key_dict is None:
        # Providers rotate keys, and a cached set goes stale before its TTL. One
        # forced refetch turns a spurious rejection into a success; without it a
        # rotation locks every user out for up to an hour.
        try:
            keys = _fetch_jwks(config['discovery_url'], force=True)
        except OidcVerificationError:
            raise
        except Exception:
            raise OidcVerificationError(
                'Could not reach the sign-in provider to verify this token')
        key_dict = _find(keys)
    if key_dict is None:
        raise OidcVerificationError('Token was not signed by a known key')

    try:
        return _decode(id_token, key_dict, config)
    except pyjwt.ExpiredSignatureError:
        raise OidcVerificationError('This sign-in token has expired')
    except pyjwt.InvalidAudienceError:
        raise OidcVerificationError('This token was issued for a different app')
    except pyjwt.InvalidIssuerError:
        raise OidcVerificationError('This token came from an unexpected issuer')
    except Exception:
        # Never surface the library's message: it can name internals, and a
        # caller cannot act on it anyway.
        raise OidcVerificationError('This sign-in token could not be verified')


def fetch_userinfo(provider, access_token):
    """Claims for an OAuth access token, for Google's native mobile flow.

    Google's native SDKs commonly hand the app an `access_token` rather than an
    `id_token`. Apple never uses this path — `expo-apple-authentication` only
    ever returns an identity token.
    """
    if not access_token:
        raise OidcVerificationError('No access token was provided')
    config = _provider_config(provider)

    try:
        discovery = requests.get(config['discovery_url'],
                                 timeout=HTTP_TIMEOUT_SECONDS)
        discovery.raise_for_status()
        endpoint = discovery.json().get('userinfo_endpoint')
        if not endpoint:
            raise OidcVerificationError(
                'Provider does not publish a userinfo endpoint')
        resp = requests.get(
            endpoint,
            headers={'Authorization': 'Bearer %s' % access_token},
            timeout=HTTP_TIMEOUT_SECONDS)
    except OidcVerificationError:
        raise
    except Exception:
        raise OidcVerificationError(
            'Could not reach the sign-in provider to verify this token')

    if resp.status_code != 200:
        raise OidcVerificationError('Access token was rejected by the provider')
    return resp.json()
