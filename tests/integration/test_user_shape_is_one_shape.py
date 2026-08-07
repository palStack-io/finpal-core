"""`/auth/login` and `/auth/me` must describe the same user — AUDIT D-63.

**The defect this exists for.** Both endpoints return "the current user", and the
clients treat them interchangeably: `authStore.login(user, ...)` is called with
whichever one is to hand. `POST /auth/login` included `modules`; `GET /auth/me`
did not.

That is not cosmetic, because **the clients gate on it**. web's `Sidebar` renders
module nav via `moduleRegistry.filter(m => user?.modules?.includes(m.slug))` and
`App.tsx` gates the module *routes* the same way. A user object with no `modules`
key is indistinguishable from a user entitled to nothing. And
`OidcCallback.tsx` builds its user from `/auth/me` — so **signing in with OIDC
made pointsPal vanish while signing in with a password kept it**. Same user, same
entitlement, different answer depending on which door was used. It renders fine
and reports no error, which is why nothing caught it.

**Keyed to the overlap, not to `modules`.** Asserting only that `modules` is
present would pass the day someone adds the next gating field to login and forgets
it here — which is the exact shape of the original bug. So this compares the two
payloads as a whole and requires every key they share to agree, plus an explicit
allowlist for the ones that legitimately differ.
"""
import pytest

from tests.factories import UserFactory


@pytest.fixture
def user(db):
    return UserFactory(id='shape@test.com', name='Shape', password_plain='pw-shape')


@pytest.fixture
def payloads(client, db, user):
    login = client.post('/api/v1/auth/login', json={
        'email': user.id, 'password': 'pw-shape'})
    assert login.status_code == 200, login.get_json()
    body = login.get_json()

    me = client.get('/api/v1/auth/me', headers={
        'Authorization': 'Bearer %s' % body['access_token']})
    assert me.status_code == 200, me.get_json()

    return body['user'], me.get_json()


# Keys one endpoint may carry and the other may not, each with a reason.
LOGIN_ONLY = set()
ME_ONLY = {
    'user_color',   # profile chrome the login response has never carried
    'is_admin',     # authorisation detail, not needed at the login moment
    'created_at',   # audit metadata
}


def test_login_still_reports_modules(payloads):
    """The pin. If login stops sending it, the comparison below goes vacuous."""
    login_user, _ = payloads
    assert 'modules' in login_user, (
        'login no longer reports modules, so the agreement test below would pass '
        'by both endpoints being equally wrong')


def test_me_reports_modules_too(payloads):
    """D-63 proper: this is the key OIDC logins were losing."""
    _, me = payloads
    assert 'modules' in me, (
        '/auth/me does not report modules. Clients gate module nav AND module '
        'routes on it, so a user object without the key is a user with no '
        'modules — and OidcCallback builds its user from this payload.')


def test_the_two_endpoints_agree_on_every_shared_key(payloads):
    """The mechanism, so the next gating field cannot repeat this."""
    login_user, me = payloads

    shared = (set(login_user) & set(me))
    disagreements = {
        k: (login_user[k], me[k]) for k in shared if login_user[k] != me[k]
    }
    assert not disagreements, (
        'login and /auth/me disagree about the same user: %s' % disagreements)


def test_neither_endpoint_carries_an_unexplained_extra_key(payloads):
    """The other half — an inventory that can only shrink.

    A key present in one payload and absent from the other is exactly the D-63
    shape. New ones must be added to BOTH endpoints, or listed above with a
    reason for differing.
    """
    login_user, me = payloads

    login_extra = set(login_user) - set(me) - LOGIN_ONLY
    me_extra = set(me) - set(login_user) - ME_ONLY

    assert not login_extra, (
        'login sends these and /auth/me does not: %s. Add them to /auth/me or '
        'to LOGIN_ONLY with a reason.' % sorted(login_extra))
    assert not me_extra, (
        '/auth/me sends these and login does not: %s. Add them to login or to '
        'ME_ONLY with a reason.' % sorted(me_extra))


def test_the_allowlists_are_not_stale(payloads):
    """An exemption for a key nobody sends any more is a place to hide a real one."""
    login_user, me = payloads

    stale_login = LOGIN_ONLY - set(login_user)
    stale_me = ME_ONLY - set(me)

    assert not stale_login, 'LOGIN_ONLY names keys login does not send: %s' % sorted(stale_login)
    assert not stale_me, 'ME_ONLY names keys /auth/me does not send: %s' % sorted(stale_me)
