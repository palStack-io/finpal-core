"""Proving somebody controls an SSO identity *now*, so they may set a password.

*** THE PROBLEM D-161 RECORDS: AN SSO USER HAS A PASSWORD THEY CAN NEVER KNOW.
*** The OIDC path creates them with a real hash of a random 24-byte secret, so
the ordinary change-password flow — which proves identity by asking for the
CURRENT password — can never work for them. The API told them they had typed it
wrong.

**Owner decision, 2026-09-12: send them back to the identity provider and accept
a new password only on a FRESH assertion.** It proves they control the SSO
identity *now*, rather than merely that they hold a session token issued at some
earlier point; it reuses `/login/oidc`, which already exists; and it needs no
mail stack — which matters, because `EMAIL_ENABLED=false` on the demo would have
made an email-confirmation design untestable there.

Rejected, with reasons recorded so they are not reopened cold:

  * **"being logged in is enough"** — a stolen session would become a PERMANENT
    second credential, which is strictly worse than the session itself.
  * **an emailed link** — needs a mail stack the demo does not have.

── THE CHECK THAT MATTERS ──────────────────────────────────────────────────────

*** ASKING FOR `prompt=login` IS NOT THE SAME AS THE USER HAVING RE-AUTHENTICATED.
*** `prompt` is a REQUEST to the identity provider and a provider is free to
ignore it — many will return an existing session immediately. So "we sent
prompt=login" proves nothing on its own, and a design that trusted it would be
the same shape as trusting a client-side check.

What *is* evidence is the ID token's own `auth_time` claim: the provider stating
when the user actually authenticated. `is_fresh_assertion` reads that, and a
provider that omits it is refused rather than assumed recent — the honest
failure, because a missing claim is an unknown, not a young one.
"""

import time

#: How long a fresh assertion stays good, in seconds.
#:
#: *** SHORT ON PURPOSE. *** This window is the entire authorisation for creating
#: a new permanent credential, so it should cover "click through the IdP and type
#: a password twice" and nothing more. Ten minutes is generous for that and far
#: too short to be worth stealing a token for.
FRESH_ASSERTION_SECONDS = 10 * 60

#: The claim the callback stamps on the access token when the assertion was
#: fresh. Named rather than inlined because the endpoint and the issuer must
#: agree, and two spellings of the same claim is how a guard goes blind.
REAUTH_CLAIM = 'reauth_at'


def is_fresh_assertion(auth_time, now=None):
    """Did the identity provider say the user authenticated just now?

    `auth_time` is the OIDC `auth_time` claim — seconds since the epoch, stated
    by the PROVIDER.

    *** A MISSING `auth_time` IS REFUSED, NOT ASSUMED RECENT. *** The claim is
    optional in OIDC unless `max_age` was requested, so an absent one is an
    unknown. Treating an unknown as fresh would let a provider that ignores
    `prompt=login` authorise a password change with a session from last month,
    which is precisely the hole this whole flow exists to close.

    *** AND A FUTURE `auth_time` IS REFUSED TOO. *** Clock skew of a few seconds
    is ordinary and tolerated; a timestamp minutes ahead is either a broken
    clock or a forged claim, and neither should buy a credential.
    """
    if auth_time is None:
        return False
    try:
        stated = float(auth_time)
    except (TypeError, ValueError):
        return False

    current = time.time() if now is None else float(now)
    age = current - stated
    # A small negative age is skew; a large one is not.
    if age < -60:
        return False
    return age <= FRESH_ASSERTION_SECONDS


def reauth_is_current(claims, now=None):
    """Is this access token carrying a still-valid proof of re-authentication?

    Reads `REAUTH_CLAIM` off the decoded JWT. The token is signed, so the claim
    cannot be added by a client — but it CAN be replayed until it expires, which
    is exactly why the window is short and why this re-checks the age rather
    than trusting the claim's presence.
    """
    if not isinstance(claims, dict):
        return False
    return is_fresh_assertion(claims.get(REAUTH_CLAIM), now=now)


def describe_refusal(claims, now=None):
    """Why the caller was refused, in words the client can show.

    *** SEPARATE MESSAGES, BECAUSE THEY ASK FOR DIFFERENT ACTIONS. *** "You never
    re-authenticated" means *start the flow*; "it expired" means *do it again*.
    Collapsing them into one string is how D-106 happened — a login screen
    telling a user something true-ish that did not describe their situation.

    Deliberately says nothing about whether the account exists or uses SSO: this
    is reachable by anyone holding a token, and an error that distinguishes
    account states is an enumeration oracle.
    """
    if not isinstance(claims, dict) or claims.get(REAUTH_CLAIM) is None:
        return 'Confirm it is you with your identity provider before setting a password.'
    return 'That confirmation has expired. Confirm with your identity provider again.'
