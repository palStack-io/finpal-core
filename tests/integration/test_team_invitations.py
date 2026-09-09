"""The household / invitation API, which had NO tests at all before this file.

*** THAT IS THE FINDING, NOT AN ASIDE. *** `api/v1/team.py` is 300 lines carrying
every invitation, member and role operation in the product, and a `grep` for a test
file naming it returned nothing. Four of the eight issues a self-hoster filed on
2026-08-21 (#140, #141, #142, #143) live in it, and none of them needed anything
cleverer than a request to notice.

Each test below names the issue it pins. They were watched failing first.
"""
from datetime import datetime, timedelta

import pytest

from src.extensions import db as _db
from src.models.invitation import Invitation
from src.models.user import User
from tests.factories import UserFactory


@pytest.fixture
def admin(db):
    """The household admin. `is_admin` is finPal's only authority flag."""
    return UserFactory(name='Owner', is_admin=True, password_plain='adminpass')


@pytest.fixture
def as_admin(client, auth_headers, admin):
    return auth_headers(admin, password='adminpass')


def _invite(client, headers, email, role='member'):
    return client.post('/api/v1/team/invite', json={'email': email, 'role': role},
                       headers=headers)


def _register(client, email, password='newpassword123'):
    return client.post('/api/v1/auth/register',
                       json={'email': email, 'password': password})


# ── #140: an admin invitation produced a member ──────────────────────────────

def test_an_admin_invitation_creates_an_admin(client, as_admin, db):
    """*** #140. `api/v1/auth.py` marked the invitation accepted and NEVER READ
    `invitation.role`. ***

    `Invitation.role` is stored and returned by the API, the invite form offers
    it, and registration set `is_admin` only for the very first user — so every
    invited admin arrived as a member and the only way to get a second admin was
    the separate role endpoint, which the reporter had no reason to look for.
    """
    assert _invite(client, as_admin, 'newadmin@test.com', role='admin').status_code == 201
    assert _register(client, 'newadmin@test.com').status_code in (200, 201)

    created = User.query.filter_by(id='newadmin@test.com').first()
    assert created is not None, 'registration did not create the user'
    assert created.is_admin is True, (
        'invited as admin and arrived as a member — the invitation role is being '
        'discarded at registration (#140)')


def test_a_member_invitation_still_creates_a_member(client, as_admin, db):
    """The inverse, so #140's fix cannot be "make everyone an admin".

    Without this pair, `user.is_admin = True` unconditionally passes the test
    above, and the household's authority flag would be handed to every invitee.
    """
    assert _invite(client, as_admin, 'plain@test.com', role='member').status_code == 201
    _register(client, 'plain@test.com')

    created = User.query.filter_by(id='plain@test.com').first()
    assert created.is_admin is False, 'a member invitation granted admin'


def test_a_viewer_invitation_is_now_REFUSED(client, as_admin, db):
    """*** THIS TEST USED TO ASSERT A 201, AND THAT WAS THE DEFECT. ***

    It pinned today's answer — `role` accepted 'viewer', `User` has no such concept,
    so a "viewer" was an ordinary member with full write access wearing a badge that
    said otherwise — and said inventing a tier would be a feature rather than a bug
    fix. Owner decision B7 (2026-09-08) took the third option neither the row nor
    this docstring considered: **stop offering it.** An affordance that is offered,
    stored, and does nothing is worse than a missing one.

    Kept and inverted rather than deleted, so the change is visible in the file that
    blessed the old behaviour.
    """
    resp = _invite(client, as_admin, 'viewer@test.com', role='viewer')

    assert resp.status_code == 400, resp.get_json()
    assert Invitation.query.filter_by(email='viewer@test.com').first() is None, (
        'refused with a 400 and stored the invitation anyway')


def test_a_viewer_invitation_STORED_BEFORE_B7_still_registers_as_a_member(client, as_admin, admin, db):
    """Existing rows keep working, and nothing needs migrating.

    Written directly to the table because the endpoint now refuses to create one —
    which is the point: the rows that already exist cannot be reproduced through the
    API any more, so a test that went through the API would silently stop covering
    them. Registration reads `invitation.role == 'admin'`, so anything else has
    always resolved to an ordinary member.
    """
    invitation = Invitation(email='legacy-viewer@test.com', role='viewer',
                            token='legacy-viewer-token', status='pending',
                            invited_by=admin.id,
                            expires_at=datetime.utcnow() + timedelta(days=7))
    _db.session.add(invitation)
    _db.session.commit()

    _register(client, 'legacy-viewer@test.com')

    created = User.query.filter_by(id='legacy-viewer@test.com').first()
    assert created is not None, 'a pre-B7 viewer invitation stopped working'
    assert created.is_admin is False


def test_the_role_endpoint_refuses_a_role_the_product_does_not_have(client, as_admin,
                                                                    admin, db):
    """It answered **200 — "Role updated to viewer"** while setting `is_admin = False`.

    So the API confirmed a role that does not exist, and the caller was told they had
    a read-only member who could in fact write everything. B7. Asserted on the stored
    column as well as the status, because a 400 that had already committed would look
    identical from the response.
    """
    target = UserFactory(id='rolecheck@test.com', name='Target')
    target.is_admin = True
    _db.session.commit()

    resp = client.put(f'/api/v1/team/members/{target.id}/role',
                      headers=as_admin, json={'role': 'viewer'})

    assert resp.status_code == 400, resp.get_json()
    _db.session.expire(target)
    assert target.is_admin is True, 'refused the role change and applied it anyway'


def test_registration_without_an_invitation_is_still_refused(client, as_admin, db):
    """#140's fix must not widen who may register at all.

    An admin already exists, so `user_count > 0` and the invitation-only rule
    applies. Reading `invitation.role` requires touching the same branch that
    enforces this, which is why it is asserted in the same file.
    """
    resp = _register(client, 'stranger@test.com')
    assert resp.status_code == 403, resp.get_json()
    assert User.query.filter_by(id='stranger@test.com').first() is None


# ── #141: a deleted user stayed in "Pending invitations" ─────────────────────

def test_removing_a_member_removes_their_invitations(client, as_admin, admin, db):
    """*** #141, and the reporter is right that it is a GDPR question. ***

    They invited a local user, deleted it, and invited again — and the address kept
    appearing on the household page. `DELETE /team/members/<id>` deleted the `User`
    row and left every `Invitation` row bearing that email behind, and
    `GET /team/invitations` lists invitations of EVERY status, so the accepted
    invitation of a deleted account stayed on screen with the address in it.

    So "the user keeps showing" was not a stale cache: the email really was still
    stored, and deleting the account did not delete it.
    """
    _invite(client, as_admin, 'gone@test.com')
    _register(client, 'gone@test.com')
    assert Invitation.query.filter_by(email='gone@test.com').count() == 1

    resp = client.delete('/api/v1/team/members/gone@test.com', headers=as_admin)
    assert resp.status_code == 200, resp.get_json()

    assert User.query.filter_by(id='gone@test.com').first() is None
    assert Invitation.query.filter_by(email='gone@test.com').count() == 0, (
        "the deleted user's invitation still holds their email address (#141)")


def test_the_invitation_list_does_not_name_users_who_are_gone(client, as_admin, db):
    """The symptom as the reporter saw it, asserted on the rendered payload.

    Separate from the test above because they can fail independently: the list
    could be filtered client-side while the row (and the address) stayed in the
    database, which would look fixed and satisfy nothing the reporter cares about.
    """
    _invite(client, as_admin, 'gone@test.com')
    _register(client, 'gone@test.com')
    client.delete('/api/v1/team/members/gone@test.com', headers=as_admin)

    listed = client.get('/api/v1/team/invitations', headers=as_admin).get_json()
    assert 'gone@test.com' not in str(listed), (
        f'the household page still shows the removed address: {listed}')


def test_re_inviting_a_removed_address_works(client, as_admin, db):
    """The reporter's exact sequence: invite, delete, invite again.

    Before the fix the second invite still succeeded — the stale row was
    'accepted', not 'pending', so the duplicate check missed it — and the result
    was TWO rows for one address, one of them naming a user that no longer exists.
    """
    _invite(client, as_admin, 'again@test.com')
    _register(client, 'again@test.com')
    client.delete('/api/v1/team/members/again@test.com', headers=as_admin)

    second = _invite(client, as_admin, 'again@test.com')
    assert second.status_code == 201, second.get_json()
    assert Invitation.query.filter_by(email='again@test.com').count() == 1, (
        'a second invitation was added beside the first rather than replacing it')


# ── #143: "Expires: invalid date" ────────────────────────────────────────────

def test_an_invitation_carries_a_real_expiry(client, as_admin, db):
    """*** #143. The model had NO expiry column and the API sent `expiresAt: ''`. ***

    `TeamManagement.tsx:445` renders `new Date(invitation.expiresAt)
    .toLocaleDateString()` unconditionally, and `new Date('')` is `Invalid Date` —
    so the UI was not mis-formatting a date, it was formatting a field that did not
    exist. Owner decision 2026-09-08: add the real expiry rather than delete the
    line, because a never-expiring invite token is the more serious half.
    """
    body = _invite(client, as_admin, 'timed@test.com').get_json()

    assert body['expiresAt'], 'the API still sends an empty expiresAt (#143)'
    parsed = datetime.fromisoformat(body['expiresAt'])
    # 7 days, allowing a generous window for a slow test run.
    assert timedelta(days=6, hours=23) < (parsed - datetime.utcnow()) <= timedelta(days=7)


def test_the_invitation_list_carries_the_expiry_too(client, as_admin, db):
    """Both sender sites had the same hardcoded `''`, and the LIST is the one the
    reporter's screenshot was of."""
    _invite(client, as_admin, 'timed@test.com')

    listed = client.get('/api/v1/team/invitations', headers=as_admin).get_json()
    assert listed[0]['expiresAt'], 'the list still sends an empty expiresAt (#143)'
    datetime.fromisoformat(listed[0]['expiresAt'])


def test_an_expired_invitation_is_refused(client, as_admin, db):
    """The half that is a security fix rather than a display fix.

    Before this the token was valid forever, so a leaked invite link stayed a
    working registration credential for the life of the instance.
    """
    _invite(client, as_admin, 'stale@test.com')
    invitation = Invitation.query.filter_by(email='stale@test.com').first()
    invitation.expires_at = datetime.utcnow() - timedelta(minutes=1)
    _db.session.commit()

    resp = _register(client, 'stale@test.com')
    assert resp.status_code == 403, resp.get_json()
    assert User.query.filter_by(id='stale@test.com').first() is None, (
        'an expired invitation still admitted a registration (#143)')


def test_a_legacy_invitation_with_no_expiry_is_NOT_treated_as_expired(client, as_admin, db):
    """*** NULL MEANS "PREDATES THE COLUMN", AND IT MUST NOT MEAN "EXPIRED". ***

    `expires_at` is nullable so D-121's boot reconcile can add it to a table that
    already has rows — and every invitation already pending on a self-hoster's
    instance gets NULL. Reading NULL as expired would invalidate all of them at
    upgrade time, turning a display fix into an outage for anyone mid-invite.

    Written with raw SQL for the reason D-155 records: the ORM applies a
    Python-side default whenever the attribute is None at INSERT, so
    `Invitation(expires_at=None)` would not produce a NULL at all and this test
    would silently assert nothing.
    """
    _invite(client, as_admin, 'legacy@test.com')
    _db.session.execute(
        _db.text('UPDATE invitations SET expires_at = NULL WHERE email = :e'),
        {'e': 'legacy@test.com'})
    _db.session.commit()
    assert _db.session.execute(
        _db.text('SELECT expires_at FROM invitations WHERE email = :e'),
        {'e': 'legacy@test.com'}).scalar() is None, 'the NULL did not take'

    resp = _register(client, 'legacy@test.com')
    assert resp.status_code in (200, 201), resp.get_json()
    assert User.query.filter_by(id='legacy@test.com').first() is not None


def test_accept_invitation_refuses_an_expired_token(client, as_admin, admin, auth_headers, db):
    """`POST /team/accept-invitation` is the second door onto the same token."""
    _invite(client, as_admin, 'stale2@test.com')
    invitation = Invitation.query.filter_by(email='stale2@test.com').first()
    token = invitation.token
    invitation.expires_at = datetime.utcnow() - timedelta(minutes=1)
    _db.session.commit()

    resp = client.post('/api/v1/team/accept-invitation', json={'token': token},
                       headers=as_admin)
    assert resp.status_code == 400, resp.get_json()
    assert Invitation.query.filter_by(email='stale2@test.com').first().status == 'pending'


# ── the admin gate, which nothing asserted ──────────────────────────────────

def test_a_non_admin_cannot_invite_or_list_or_remove(client, auth_headers, db):
    """No test covered `_require_admin` before this file existed.

    Asserted for all three verbs rather than one, because they are three separate
    calls to the same helper and a refactor can miss one silently.
    """
    UserFactory(name='Owner', is_admin=True)
    member = UserFactory(name='Member', is_admin=False, password_plain='memberpass')
    headers = auth_headers(member, password='memberpass')

    assert client.post('/api/v1/team/invite', json={'email': 'x@test.com'},
                       headers=headers).status_code == 403
    assert client.get('/api/v1/team/invitations', headers=headers).status_code == 403
    assert client.delete('/api/v1/team/members/other@test.com',
                         headers=headers).status_code == 403


def test_removing_a_demoted_admin_who_had_sent_invitations_works(client, as_admin, db):
    """*** A LATENT 500 ON POSTGRES THAT THIS SUITE CANNOT SEE BY DEFAULT. ***

    `Invitation.invited_by` is NOT NULL with a foreign key to `users.id`, so a row
    cannot outlive its inviter. Only admins can invite and an admin cannot be
    removed — but `PUT /team/members/<id>/role` demotes one to 'member' first, and
    then the removal deletes a user with `invitations_sent` still pointing at them.
    On Postgres that is a foreign-key violation and a 500.

    **SQLite does not enforce foreign keys unless `PRAGMA foreign_keys=ON`**, which
    this suite does not set, so this test passes on the broken code too and is NOT
    evidence on its own — it asserts the ROWS ARE GONE, which is engine-independent
    and false before the fix. That distinction is D-123's, where over-long values
    were accepted silently by SQLite and failed only on Postgres.
    """
    second = UserFactory(name='Second Admin', is_admin=True)
    _invite(client, as_admin, 'invitee@test.com')
    Invitation.query.filter_by(email='invitee@test.com').first().invited_by = second.id
    _db.session.commit()

    # Demote, then remove — the reachable path to the constraint.
    assert client.put(f'/api/v1/team/members/{second.id}/role',
                      json={'role': 'member'}, headers=as_admin).status_code == 200
    resp = client.delete(f'/api/v1/team/members/{second.id}', headers=as_admin)
    assert resp.status_code == 200, resp.get_json()

    assert Invitation.query.filter_by(invited_by=second.id).count() == 0, (
        'an invitation still points at a user row that has been deleted, which is '
        'a foreign-key violation waiting for the next Postgres deploy')


def test_an_expired_invitation_does_not_block_a_new_one(client, as_admin, db):
    """*** A REGRESSION THE EXPIRY ITSELF CREATED, CAUGHT IN REVIEW. ***

    Once #143 gave invitations an expiry, `status == 'pending'` stopped implying
    "usable" — nothing sweeps an expired row, so it stays pending forever. With the
    duplicate check keyed to the bare status, the admin was trapped between two
    refusals: the invitee could not register (expired) and the admin could not send a
    new invitation ("a pending invitation already exists") for an invitation nobody
    could use.

    So the fix for a display bug had made the feature unusable in a state the fix
    itself introduced. Asserted on the count of USABLE rows, not on the 201.
    """
    _invite(client, as_admin, 'retry@test.com')
    first = Invitation.query.filter_by(email='retry@test.com').first()
    old_token = first.token
    first.expires_at = datetime.utcnow() - timedelta(minutes=1)
    _db.session.commit()

    resp = _invite(client, as_admin, 'retry@test.com')
    assert resp.status_code == 201, resp.get_json()

    rows = Invitation.query.filter_by(email='retry@test.com').all()
    usable = [r for r in rows if r.is_usable]
    assert len(usable) == 1, f'expected exactly one usable invitation, got {rows}'
    assert usable[0].token != old_token, (
        'the stale token was reused; re-inviting must mint a fresh link, because a '
        'link that has been sitting in a mailbox for a week is what the expiry is '
        'there to retire')
    assert resp.get_json()['expiresAt']


def test_a_still_valid_invitation_DOES_block_a_duplicate(client, as_admin, db):
    """The inverse, so the fix above cannot become "always allow another invite".

    Without this, spamming the invite button would create unlimited live tokens for
    one address.
    """
    assert _invite(client, as_admin, 'once@test.com').status_code == 201
    assert _invite(client, as_admin, 'once@test.com').status_code == 400
    assert Invitation.query.filter_by(email='once@test.com').count() == 1


def test_resending_an_expired_invitation_extends_it_rather_than_mailing_a_dead_link(
        client, as_admin, db):
    """*** RESEND IS THE THIRD DOOR ONTO THE TOKEN. ***

    A bare status check would re-send an expired invitation and tell the admin it
    worked, while the recipient followed the link to a refusal — the worst available
    behaviour, because nobody is told anything is wrong.

    Extended rather than refused: an admin choosing to chase somebody is expressing
    exactly the intent the window exists for.
    """
    _invite(client, as_admin, 'chase@test.com')
    invitation = Invitation.query.filter_by(email='chase@test.com').first()
    invitation.expires_at = datetime.utcnow() - timedelta(minutes=1)
    _db.session.commit()
    assert invitation.is_usable is False

    resp = client.post(f'/api/v1/team/invitations/{invitation.id}/resend',
                       headers=as_admin)
    assert resp.status_code == 200, resp.get_json()

    _db.session.expire_all()
    refreshed = Invitation.query.filter_by(email='chase@test.com').first()
    assert refreshed.is_usable is True, (
        'the invitation was re-sent while still expired, so the recipient has been '
        'mailed a link that will refuse them')

    # And the link now actually works, which is the claim that matters.
    assert _register(client, 'chase@test.com').status_code in (200, 201)


# ── removal when the member owns something ──────────────────────────────────

def test_removing_a_member_who_owns_an_account_is_refused_not_a_500(
        client, as_admin, db):
    """*** THE BIGGEST THING IN THIS PASS AND NOBODY REPORTED IT. ***

    Every user-keyed table in finPal declares `user_id ... nullable=False`, and no
    relationship declares a cascade or `ondelete`. So `db.session.delete(user)` makes
    SQLAlchemy NULL the child's foreign key and the NOT NULL constraint raises —
    measured as `IntegrityError: NOT NULL constraint failed: accounts.user_id`, on
    SQLite, so it is the ORM's behaviour and not Postgres being strict.

    `DELETE /team/members/<id>` therefore answered **500 for any member who owned
    anything**, which is every real member. #141's reporter saw it work only because
    their throwaway account owned nothing — and a freshly registered user owns nothing
    either (measured), so the happy path was the only path anyone had exercised.

    Owner decision 2026-09-08: **refuse and say why**, rather than call
    `_delete_all_user_data` and let one click erase a housemate's history.
    """
    from decimal import Decimal

    from tests.factories import AccountFactory

    member = UserFactory(name='Rachel', is_admin=False)
    AccountFactory(user_id=member.id, name='Hers', type='checking',
                   balance=Decimal('100.00'))

    resp = client.delete(f'/api/v1/team/members/{member.id}', headers=as_admin)

    assert resp.status_code == 409, (
        f'answered {resp.status_code}; a 500 here is the pre-existing defect and a '
        f'200 means somebody wired up a destructive delete')
    body = resp.get_json()
    assert 'account' in (body.get('message') or '').lower(), body
    assert User.query.filter_by(id=member.id).first() is not None, (
        'refused and deleted the user anyway')


def test_the_refusal_names_every_kind_of_thing_in_the_way(client, as_admin, db):
    """A message naming one blocker when there are four sends the admin round a loop.

    So the count is asserted per kind, not just "something is in the way".
    """
    from decimal import Decimal
    from datetime import datetime

    from tests.factories import AccountFactory, CategoryFactory, ExpenseFactory

    member = UserFactory(name='Rachel', is_admin=False)
    account = AccountFactory(user_id=member.id, name='Hers', type='checking',
                             balance=Decimal('100.00'))
    category = CategoryFactory(name='Food', user_id=member.id)
    ExpenseFactory(user_id=member.id, account_id=account.id,
                   amount=Decimal('10.00'), date=datetime(2026, 9, 2, 12),
                   paid_by=member.id, category_id=category.id)

    message = client.delete(f'/api/v1/team/members/{member.id}',
                            headers=as_admin).get_json()['message'].lower()

    assert 'account' in message, message
    assert 'transaction' in message, message
    assert 'categor' in message, message


def test_a_member_who_owns_nothing_can_still_be_removed(client, as_admin, db):
    """The inverse, and it is the flow #141's reporter was actually using.

    Without this, "refuse when they own data" could be implemented as "always refuse"
    and the two tests above would both still pass while removal stopped working
    entirely.
    """
    member = UserFactory(name='Empty', is_admin=False)

    resp = client.delete(f'/api/v1/team/members/{member.id}', headers=as_admin)

    assert resp.status_code == 200, resp.get_json()
    assert User.query.filter_by(id=member.id).first() is None
