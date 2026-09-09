"""The notification preferences: what the API returns, and what it says it takes.

*** D-150's REPORTED DEFECT DOES NOT EXIST, AND THIS FILE RECORDS THE DISPROOF
ALONGSIDE THE TWO REAL THINGS UNDER IT. ***

D-150 said `/auth/login` and `/auth/me` "can report different notification
preferences for the same user", because login read the columns behind `hasattr`
guards whose fallbacks invert two of the four column defaults. Measured, with
defaults and with real NULLs written by raw SQL: the two endpoints agree in every
case. `hasattr` on a mapped column is True even when the stored value is NULL, so
the fallback branch was unreachable and always had been. That is D-90's shape —
a defect read out of source rather than proven behaviourally — and
`test_login_and_me_agree` below is kept as the regression guard the row wanted.

What IS real: a NULL preference reached both clients as JSON `null`, so
`if (!prefs.email)` reads it as opted OUT while the column's declared default says
True. D-155's one-NULL-two-meanings, moved to the server/client boundary.
"""
import pytest

from src.extensions import db as _db
from src.models.user import User
from tests.factories import UserFactory

PASSWORD = 'hunter2!Aa'
COLUMNS = {
    'email': 'notification_email',
    'push': 'notification_push',
    'budgetAlerts': 'notification_budget_alerts',
    'transactionAlerts': 'notification_transaction_alerts',
}


@pytest.fixture
def person(db):
    user = UserFactory(id='prefs@test.com', name='Prefs')
    user.set_password(PASSWORD)
    db.session.commit()
    return user


def _login(client, user):
    resp = client.post('/api/v1/auth/login',
                       json={'email': user.id, 'password': PASSWORD})
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def _me(client, token):
    resp = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    return body.get('user', body)


def _null_every_preference(user_id):
    """A real NULL, written with raw SQL.

    The ORM cannot produce one: SQLAlchemy applies the column default whenever the
    attribute is None at INSERT, so a factory-written "NULL" stores the default and
    a test built that way passes against the bug. Same trap as D-155.
    """
    _db.session.execute(_db.text(
        'UPDATE users SET notification_email = NULL, notification_push = NULL, '
        'notification_budget_alerts = NULL, notification_transaction_alerts = NULL '
        'WHERE id = :i'), {'i': user_id})
    _db.session.commit()
    stored = _db.session.execute(_db.text(
        'SELECT notification_email, notification_push, notification_budget_alerts, '
        'notification_transaction_alerts FROM users WHERE id = :i'),
        {'i': user_id}).fetchone()
    assert all(v is None for v in stored), 'the NULLs did not take — this proves nothing'


def test_login_and_me_agree_on_a_normal_user(client, person):
    """The regression guard D-150 asked for, against a defect that was not there."""
    login = _login(client, person)
    assert login['user']['notifications'] == _me(client, login['access_token'])['notifications']


def test_login_and_me_agree_when_every_preference_is_null(client, person):
    """The case the `hasattr` fallbacks were supposed to cover, and never did."""
    _null_every_preference(person.id)
    login = _login(client, person)
    assert login['user']['notifications'] == _me(client, login['access_token'])['notifications']


def test_a_null_preference_reads_as_the_columns_declared_default(client, person):
    """*** THE REAL DEFECT: `null` on the wire, where the model says True. ***

    A row that predates one of these columns holds NULL — the same population as
    D-155, reached by the boot-time schema reconcile adding a column to a table that
    already has rows. Both clients then apply their own default to a `null`, and
    `if (!prefs.email)` is an opt-out.

    Asserted against the MODEL's defaults rather than four literals, because the API
    now reads them off the model too — a copy here would pass while both copies were
    wrong together, which is how the two ends of this product have disagreed about
    the same column three times.
    """
    _null_every_preference(person.id)
    expected = {key: User.__table__.columns[col].default.arg
                for key, col in COLUMNS.items()}
    # The fixture is only meaningful if the defaults are not all the same value.
    assert len(set(expected.values())) > 1, 'all four defaults are equal — this test cannot discriminate'

    login = _login(client, person)
    assert login['user']['notifications'] == expected
    assert _me(client, login['access_token'])['notifications'] == expected


def test_a_stored_false_is_not_overwritten_by_the_default(client, person):
    """The negative half. Resolving NULL to the default must not resolve False too.

    Without this, "read the default when the value is missing" and "always read the
    default" are indistinguishable — and the second silently re-subscribes everyone
    who ever opted out.
    """
    person.notification_email = False
    person.notification_push = False
    _db.session.commit()

    login = _login(client, person)
    assert login['user']['notifications']['email'] is False
    assert login['user']['notifications']['push'] is False
    assert _me(client, login['access_token'])['notifications']['email'] is False


def test_the_docs_declare_the_nested_shape_the_handler_reads(client):
    """D-151 — the published spec for the only endpoint that writes preferences.

    `onboarding_model` declared `notifications` as a **Boolean** "master switch" with
    `push`, `budgetAlerts` and `transactionAlerts` as three flat siblings. The handler
    has never read that: it takes `data['notifications']` and indexes four keys inside
    it. A client following the docs sent flat booleans, got a **200**, and had every
    preference discarded — and this is the only write path there is.

    *** ASSERTS THE TYPE, NOT MERELY THE PRESENCE. *** Two doc gates already run over
    this file and neither caught it, because both check that a field EXISTS. The old
    shape would satisfy any presence check perfectly.
    """
    spec = client.get('/api/v1/swagger.json').get_json()
    model = spec['definitions']['Onboarding']
    prefs = model['properties']['notifications']

    assert prefs.get('type') != 'boolean', (
        'notifications is documented as a boolean; the handler indexes into it')
    ref = prefs.get('$ref') or prefs.get('allOf', [{}])[0].get('$ref')
    assert ref, f'notifications is not a nested object: {prefs}'

    nested = spec['definitions'][ref.rsplit('/', 1)[-1]]
    assert set(COLUMNS) <= set(nested['properties']), (
        f"the nested model is missing keys the handler reads: "
        f"{set(COLUMNS) - set(nested['properties'])}")

    # And the flat siblings are gone, so nobody can follow them by mistake.
    for orphan in ('push', 'budgetAlerts', 'transactionAlerts'):
        assert orphan not in model['properties'], (
            f"'{orphan}' is still documented as a top-level field the handler never reads")


def test_the_documented_shape_is_the_one_that_actually_persists(client, person, db):
    """The end of D-151's chain: send exactly what the docs now describe.

    A spec test on its own only proves two documents agree. This sends the documented
    body through the real endpoint and reads the columns back, which is the assertion
    that would have failed for the flat shape — with a 200, silently.
    """
    token = _login(client, person)['access_token']

    resp = client.post('/api/v1/auth/onboarding',
                       headers={'Authorization': f'Bearer {token}'},
                       json={'email': person.id,
                             'notifications': {'email': False, 'push': False,
                                               'budgetAlerts': False,
                                               'transactionAlerts': True}})
    assert resp.status_code == 200, resp.get_json()

    db.session.expire(person)
    assert person.notification_email is False
    assert person.notification_push is False
    assert person.notification_budget_alerts is False
    assert person.notification_transaction_alerts is True
