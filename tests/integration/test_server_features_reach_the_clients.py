"""`_get_server_features()` was written, then called from nowhere.

`api/v1/auth.py` defines it to report which optional features a server has switched on.
No response has ever included the result. web-ui reads `response.features` on login and
falls back to `DEFAULT_FEATURES = { simplefin: true, investments: true }` when it is
absent — which it always was — so **every** gate keyed to that object has been inert
since it was written, and a self-hoster running with `SIMPLEFIN_ENABLED=false` was still
shown the SimpleFin UI. The Settings panel happens to survive that because it asks a
different endpoint for `simplefinGloballyEnabled`; nothing else does.

The failure is quiet in the worst way: the flag exists, the client checks it, the check
passes, and the feature the operator disabled is advertised anyway. It only surfaces when
a user clicks through to a screen that tells them the thing is not available.

Both delivery points are covered here, and that is deliberate rather than thorough.
**D-63 is this exact shape one field over**: `modules` was sent by `/auth/login` and
omitted by `/auth/me`, so a client that refreshed the user from the wrong endpoint saw an
unentitled user. Features now ride on `/auth/config` — unauthenticated, server-level, and
re-readable at any time — as well as on login, so no client has to have been present at
sign-in to know what the server offers.
"""


def _login(client, email, password):
    return client.post('/api/v1/auth/login',
                       json={'email': email, 'password': password})


def test_the_login_response_says_which_features_the_server_has_on(client, db, app):
    from tests.factories import UserFactory

    UserFactory(id='flags@example.com', password_plain='secret')

    original = app.config.get('SIMPLEFIN_ENABLED', False)
    app.config['SIMPLEFIN_ENABLED'] = False
    try:
        body = _login(client, 'flags@example.com', 'secret').get_json()
    finally:
        app.config['SIMPLEFIN_ENABLED'] = original

    assert 'features' in body, (
        'login sends no `features` key, so every client falls back to "everything is '
        'enabled" and shows features the operator turned off'
    )
    assert body['features']['simplefin'] is False, (
        'the server has SIMPLEFIN_ENABLED=False and told the client otherwise'
    )


def test_the_same_answer_is_available_without_signing_in(client, db, app):
    """So a client can re-read it, and so mobile can ask before it has a session.

    D-63's lesson: a fact delivered only at login is a fact any client that refreshes
    from somewhere else quietly loses.
    """
    original = app.config.get('SIMPLEFIN_ENABLED', False)
    app.config['SIMPLEFIN_ENABLED'] = False
    try:
        body = client.get('/api/v1/auth/config').get_json()
    finally:
        app.config['SIMPLEFIN_ENABLED'] = original

    assert 'features' in body, '/auth/config does not report server features'
    assert body['features']['simplefin'] is False


def test_the_flag_actually_tracks_the_config_rather_than_being_hardcoded(client, db, app):
    """The other half. A helper that always answers False would pass both tests above."""
    original = app.config.get('SIMPLEFIN_ENABLED', False)
    app.config['SIMPLEFIN_ENABLED'] = True
    try:
        body = client.get('/api/v1/auth/config').get_json()
    finally:
        app.config['SIMPLEFIN_ENABLED'] = original

    assert body['features']['simplefin'] is True, (
        'the reported flag does not follow SIMPLEFIN_ENABLED'
    )
