"""A user's module show/hide preference, server-side at last.

*** THE SETTINGS TOGGLE WAS `localStorage`-ONLY. *** It wrote
`module_hidden_${slug}` into one browser, so the choice did not follow the user
to another device and mobile could not see it at all. C1f's module chooser is
blocked on this, which is why "add learnPal to Settings" is a backend job before
it is a screen.

*** PREFERENCE AND ENTITLEMENT ARE DELIBERATELY DIFFERENT TABLES *** (owner,
2026-09-11). `UserModuleAccess` answers *may you* and is adminPal's, over HMAC;
`UserModulePreference` answers *do you want to* and is the user's. One row
meaning both would let an adminPal sync silently erase a choice, or a user's
toggle silently restore an entitlement they are not owed — and `finpal_premium`
is out of scope from here, so what adminPal does could not be verified. An
unverifiable assumption about someone else's writer is not a foundation.

Asserted on the payload and the database, never on a status code.
"""

import json

import pytest

from src.extensions import db as _db
from src.modules.access import UserModuleAccess
from src.modules.preference import UserModulePreference, hidden_modules_for
from tests.factories import UserFactory


def _put(client, auth_headers, user, slug, body):
    return client.put(f'/api/v1/users/module-preferences/{slug}',
                      headers=auth_headers(user), json=body)


def _me(client, auth_headers, user):
    """`/auth/me` returns the user fields at the TOP level, not under a 'user'
    key -- unlike `/auth/login`, which nests them. Checked rather than assumed,
    after a first version of this helper guessed wrong."""
    return client.get('/api/v1/auth/me', headers=auth_headers(user)).get_json()


# ---------------------------------------------------------------------------
# The default, which is the case that matters most
# ---------------------------------------------------------------------------

def test_ABSENT_MEANS_VISIBLE(client, auth_headers, db):
    """*** A DEFAULT OF HIDDEN WOULD MAKE EVERY MODULE VANISH FOR EVERY EXISTING
    USER THE MOMENT THIS TABLE APPEARED. ***"""
    user = UserFactory(id='fresh@test.com', name='Fresh')
    _db.session.commit()

    assert hidden_modules_for(user.id) == []
    body = _me(client, auth_headers, user)
    assert body['hidden_modules'] == []
    # And the entitled list is untouched by any of this.
    assert 'pointspal' in body['modules']


def test_A_ROW_INSERTED_WITHOUT_visible_DEFAULTS_TO_VISIBLE(client, auth_headers, db):
    """*** THE COLUMN DEFAULT IS A SAFETY NET FOR A WRITER THAT IS NOT MINE. ***

    A sabotage flipping `default=True` to `default=False` passed all eighteen
    tests, because `set_module_visibility` always writes `visible` explicitly and
    the default is never reached through the API. That made the default look
    like dead configuration — it is not. adminPal, a future migration, or C1f's
    guided setup could each insert a row the short way, and a default of hidden
    would make every module silently vanish for that user.

    So the default is exercised directly, by the only route that can reach it.
    """
    user = UserFactory(id='defaulted@test.com', name='Def')
    _db.session.commit()

    _db.session.add(UserModulePreference(user_id=user.id, module_name='pointspal'))
    _db.session.commit()

    row = UserModulePreference.query.filter_by(user_id=user.id).one()
    assert row.visible is True, 'a row created without `visible` defaulted to HIDDEN'
    assert hidden_modules_for(user.id) == []
    assert _me(client, auth_headers, user)['hidden_modules'] == []


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def test_hiding_a_module_persists_to_the_DATABASE(client, auth_headers, db):
    user = UserFactory(id='hider@test.com', name='Hider')
    _db.session.commit()

    resp = _put(client, auth_headers, user, 'pointspal', {'visible': False})

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['hidden'] == ['pointspal']
    row = UserModulePreference.query.filter_by(
        user_id=user.id, module_name='pointspal').one()
    assert row.visible is False


def test_the_choice_comes_back_on_a_DIFFERENT_request(client, auth_headers, db):
    # The entire point: localStorage did not survive a second device. `/me` is
    # what a fresh browser asks first.
    user = UserFactory(id='twodevices@test.com', name='Two')
    _db.session.commit()
    _put(client, auth_headers, user, 'pointspal', {'visible': False})

    assert _me(client, auth_headers, user)['hidden_modules'] == ['pointspal']


def test_unhiding_removes_it_from_the_list(client, auth_headers, db):
    user = UserFactory(id='unhider@test.com', name='Un')
    _db.session.commit()
    _put(client, auth_headers, user, 'pointspal', {'visible': False})

    resp = _put(client, auth_headers, user, 'pointspal', {'visible': True})

    assert resp.get_json()['hidden'] == []
    # The row survives, holding an explicit True — see `set_module_visibility`.
    row = UserModulePreference.query.filter_by(
        user_id=user.id, module_name='pointspal').one()
    assert row.visible is True


def test_toggling_twice_does_not_duplicate_the_row(client, auth_headers, db):
    user = UserFactory(id='toggler@test.com', name='Tog')
    _db.session.commit()
    for visible in (False, True, False):
        _put(client, auth_headers, user, 'pointspal', {'visible': visible})

    assert UserModulePreference.query.filter_by(user_id=user.id).count() == 1


# ---------------------------------------------------------------------------
# *** `modules` IS NOT FILTERED, AND THAT IS THE WHOLE DESIGN ***
# ---------------------------------------------------------------------------

def test_A_HIDDEN_MODULE_IS_STILL_IN_modules_SO_IT_CAN_BE_UNHIDDEN(
        client, auth_headers, db):
    """Subtracting hidden ones from `modules` would make hiding a ONE-WAY DOOR.

    `Settings.tsx` renders its Modules tab from `user.modules` and gates the tab
    itself on that list being non-empty. A module filtered out of it disappears
    from the only screen that can bring it back — the user would have to clear
    their preference in the database.
    """
    user = UserFactory(id='oneway@test.com', name='One')
    _db.session.commit()
    _put(client, auth_headers, user, 'pointspal', {'visible': False})

    body = _me(client, auth_headers, user)
    assert 'pointspal' in body['modules'], 'hiding a module removed it from Settings'
    assert body['hidden_modules'] == ['pointspal']


# ---------------------------------------------------------------------------
# Preference cannot grant. Entitlement still wins.
# ---------------------------------------------------------------------------

def test_PREFERENCE_CANNOT_GRANT_A_MODULE_ENTITLEMENT_REFUSES(
        client, auth_headers, db):
    """Showing a module you are not entitled to is a no-op, never a grant."""
    user = UserFactory(id='sneaky@test.com', name='Sneaky')
    _db.session.add(UserModuleAccess(user_id=user.id, module_name='pointspal',
                                     enabled=False, granted_by='manual'))
    _db.session.commit()
    assert 'pointspal' not in _me(client, auth_headers, user)['modules']

    _put(client, auth_headers, user, 'pointspal', {'visible': True})

    body = _me(client, auth_headers, user)
    assert 'pointspal' not in body['modules'], \
        'a preference granted an entitlement the deployment had revoked'


def test_the_two_tables_do_not_touch_each_other(client, auth_headers, db):
    # The reason they are separate at all: writing one must not write the other.
    user = UserFactory(id='separate@test.com', name='Sep')
    _db.session.commit()

    _put(client, auth_headers, user, 'pointspal', {'visible': False})

    assert UserModuleAccess.query.filter_by(user_id=user.id).count() == 0, \
        'setting a preference wrote to the entitlement table'


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------

def test_an_UNKNOWN_slug_is_refused(client, auth_headers, db):
    # Otherwise the table accumulates rows for typos and for modules that no
    # longer exist, and a client bug looks like a working request.
    user = UserFactory(id='typo@test.com', name='Typo')
    _db.session.commit()

    resp = _put(client, auth_headers, user, 'pointspall', {'visible': False})

    assert resp.status_code == 404, resp.get_json()
    assert UserModulePreference.query.filter_by(user_id=user.id).count() == 0


@pytest.mark.parametrize('body', [{}, {'visible': 'false'}, {'visible': 1},
                                  {'visible': None}, {'hidden': True}])
def test_a_non_boolean_is_refused_and_NAMES_THE_FIELD(client, auth_headers, db, body):
    user = UserFactory(id=f'bad{abs(hash(str(body)))}@test.com', name='Bad')
    _db.session.commit()

    resp = _put(client, auth_headers, user, 'pointspal', body)

    assert resp.status_code == 400, resp.get_json()
    assert 'visible' in resp.get_json()['details']


def test_FALSE_IS_NOT_A_MISSING_FIELD(client, auth_headers, db):
    """`'visible' in data`, never truthiness.

    `{"visible": false}` is the entire point of this endpoint. A truthiness
    check would read a deliberate hide as an absent field and answer 400 — the
    same trap the account credit fields use `if 'x' in data` to avoid.
    """
    user = UserFactory(id='explicitfalse@test.com', name='EF')
    _db.session.commit()

    resp = _put(client, auth_headers, user, 'pointspal', {'visible': False})

    assert resp.status_code == 200, resp.get_json()


def test_it_needs_a_token(client, db):
    resp = client.put('/api/v1/users/module-preferences/pointspal',
                      data=json.dumps({'visible': False}),
                      content_type='application/json')
    assert resp.status_code in (401, 422)


def test_one_users_preference_does_not_reach_another(client, auth_headers, db):
    alice = UserFactory(id='alice-pref@test.com', name='Alice')
    bob = UserFactory(id='bob-pref@test.com', name='Bob')
    _db.session.commit()

    _put(client, auth_headers, alice, 'pointspal', {'visible': False})

    assert _me(client, auth_headers, bob)['hidden_modules'] == []


# ---------------------------------------------------------------------------
# Reading it back
# ---------------------------------------------------------------------------

def test_the_GET_agrees_with_the_auth_payload(client, auth_headers, db):
    # Two readers of one fact is how they drift. They are pinned together here.
    user = UserFactory(id='agree@test.com', name='Agree')
    _db.session.commit()
    _put(client, auth_headers, user, 'pointspal', {'visible': False})

    from_get = client.get('/api/v1/users/module-preferences',
                          headers=auth_headers(user)).get_json()['hidden']
    from_me = _me(client, auth_headers, user)['hidden_modules']

    assert from_get == from_me == ['pointspal']
