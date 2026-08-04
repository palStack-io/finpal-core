"""A fresh, non-demo install must be able to register its first user.

`users.default_currency_code` is a foreign key into `currencies`, and the
register handler hardcodes `'USD'`. Currencies were seeded only under
`DEMO_MODE`, so on a real self-hosted install the table was empty and the very
first signup failed with a ForeignKeyViolation — leaving the instance unusable,
because you cannot create the admin account and therefore cannot reach any UI
that would let you add a currency.

Note these tests pass on SQLite even without the fix if written as "does signup
succeed", because SQLite does not enforce foreign keys unless
`PRAGMA foreign_keys=ON`. The production failure was on Postgres. So they assert
the *seeding* invariant directly, which holds on any backend.
"""
from src.models.currency import Currency
from src.models.user import User


def test_reference_data_seeding_creates_the_hardcoded_default(db):
    """register() hardcodes 'USD', so that row has to exist."""
    from src import _seed_reference_data
    from flask import current_app

    assert Currency.query.count() == 0, 'fixture should start empty'

    _seed_reference_data(current_app)

    usd = Currency.query.filter_by(code='USD').first()
    assert usd is not None, (
        "no USD currency after seeding — register() hardcodes "
        "default_currency_code='USD' and would violate the foreign key")
    assert usd.is_base is True


def test_seeding_is_idempotent(db):
    """It runs on every boot, so a second call must not duplicate or raise."""
    from src import _seed_reference_data
    from flask import current_app

    _seed_reference_data(current_app)
    first = Currency.query.count()
    _seed_reference_data(current_app)

    assert Currency.query.count() == first
    assert Currency.query.filter_by(code='USD').count() == 1


def test_first_signup_succeeds_and_becomes_admin(client, db):
    """The end-to-end path a self-hoster takes on a brand-new instance."""
    from src import _seed_reference_data
    from flask import current_app

    _seed_reference_data(current_app)

    resp = client.post('/api/v1/auth/register', json={
        'email': 'owner@example.com',
        'password': 'FirstAdminPass123',
        'username': 'owner',
    })

    assert resp.status_code == 201, f'first signup failed: {resp.get_json()}'

    user = User.query.filter_by(id='owner@example.com').first()
    assert user is not None
    assert user.is_admin is True, 'the first non-demo user must become admin'
    assert user.default_currency_code == 'USD'


def test_second_signup_requires_an_invitation(client, db):
    """Registration closes itself once an admin exists.

    This is the real protection on an open port — `DISABLE_SIGNUPS` is read into
    config and then never referenced anywhere, so it protects nothing.
    """
    from src import _seed_reference_data
    from flask import current_app

    _seed_reference_data(current_app)
    client.post('/api/v1/auth/register', json={
        'email': 'owner@example.com', 'password': 'FirstAdminPass123'})

    resp = client.post('/api/v1/auth/register', json={
        'email': 'stranger@example.com', 'password': 'AlsoValidPass123'})

    assert resp.status_code == 403
    assert User.query.filter_by(id='stranger@example.com').first() is None


def test_create_app_seeds_currencies_outside_any_demo_mode_branch():
    """The regression that actually shipped.

    Seeding sat inside `if app.config.get('DEMO_MODE')`, so a real install never
    got it. The tests above call _seed_reference_data() directly and so would not
    have caught that.

    This inspects the AST rather than booting a second app: `scheduler`, `limiter`
    and `db` are module-level singletons, so a second create_app() in the same
    process raises SchedulerAlreadyRunningError before it reaches any seeding.
    """
    import ast
    import inspect

    import src

    tree = ast.parse(inspect.getsource(src.create_app))

    def demo_gated(node, ancestors):
        """True if any enclosing `if` tests DEMO_MODE."""
        for anc in ancestors:
            if isinstance(anc, ast.If) and 'DEMO_MODE' in ast.dump(anc.test):
                return True
        return False

    found, gated = False, True

    def walk(node, ancestors):
        nonlocal found, gated
        for child in ast.iter_child_nodes(node):
            if (isinstance(child, ast.Call)
                    and isinstance(child.func, ast.Name)
                    and child.func.id == '_seed_reference_data'):
                found = True
                if not demo_gated(child, ancestors + [node]):
                    gated = False
            walk(child, ancestors + [node])

    walk(tree, [])

    assert found, 'create_app() no longer calls _seed_reference_data at all'
    assert not gated, (
        'every call to _seed_reference_data sits inside a DEMO_MODE branch, so a '
        'fresh self-hosted install gets no currencies and cannot register its '
        'first user'
    )
