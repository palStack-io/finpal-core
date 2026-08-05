"""One logical route, one handler — and the same payload from both spellings.

`src/__init__.py` registers five legacy blueprints before the flask-restx
`api_bp`. Several of them claim URLs restx also claims, and because
`url_map.strict_slashes = False` a rule written without a trailing slash matches
the slashed request too (and vice versa), so *which implementation you reach
depends on whether the client typed the trailing slash*.

That is not a theoretical duplicate. web-ui calls the slash-less spelling and
mobile calls the slashed one, so the two clients were being served different code
for the same endpoint:

  * `GET /api/v1/groups` (legacy, web) returned `default_split_method`,
    `default_payer` and `auto_include_all`; `GET /api/v1/groups/` (restx, mobile)
    dropped all three from `GroupSchema`. mobile declares them at
    `groupService.ts:14-16` and renders `group.default_split_method` at
    `groups.tsx:165`, so it was rendering `undefined`, and opening the edit form
    read the group's split settings back as blank.
  * `POST /api/v1/transactions/` (restx) discarded `group_id`: it is a real
    column on `Expense` but was absent from `TransactionInput`, and
    `validate_request` loads with `unknown=EXCLUDE`. `GroupDetail.tsx:108` posts
    a settlement to the slashed spelling *with* `group_id`, so every settlement
    was filed as an ungrouped personal expense and never appeared in the group it
    settled.

Both are the failure mode this suite exists for: status 200, a rendered screen,
and the wrong data. So these tests assert on the response body and on the
database row, never on the status code.

The remaining known collision — the categories collection, where legacy is
per-user and restx is household-wide — is *deliberately* left open and listed in
`DEFERRED_COLLISIONS` below. Choosing a scope for it is part of the household
money model revamp (AUDIT D-18), which the owner deferred on 2026-08-05 with
"redo it, don't patch it".
"""
from src import _KNOWN_DUPLICATE_ROUTES, duplicate_routes
from src.extensions import db
from src.models.group import Group
from src.models.transaction import Expense
from tests.factories import UserFactory


# Deliberately imported from the app rather than restated here. The startup guard
# and this test have to agree on what "the same route" means, and the whole reason
# the shadowing survived four audits is that a check with a slightly wrong
# normaliser reports success. One definition, used by both.
DEFERRED_COLLISIONS = _KNOWN_DUPLICATE_ROUTES


def _collisions(app):
    return duplicate_routes(app)


def test_no_two_rules_claim_the_same_path_and_method(app):
    """The invariant, not a list of current offenders.

    A new route added on top of an existing one fails here rather than silently
    shadowing it, whichever blueprint happens to be registered first.
    """
    unexpected = {
        k: sorted(v) for k, v in _collisions(app).items()
        if k not in DEFERRED_COLLISIONS
    }
    assert not unexpected, (
        'these logical routes are served by more than one handler, so which one '
        'runs depends on the trailing slash the client typed:\n%s' % '\n'.join(
            '  %-7s %-42s %s' % (m, p, eps)
            for (p, m), eps in sorted(unexpected.items())))


def test_every_deferred_collision_still_exists(app):
    """Keeps the allowlist honest.

    If a deferred collision gets resolved, this fails and the entry must come
    out — otherwise the allowlist quietly grows into permission to shadow
    anything.
    """
    live = _collisions(app)
    stale = sorted(k for k in DEFERRED_COLLISIONS if k not in live)
    assert not stale, (
        'these are allowlisted as deferred but no longer collide — remove them '
        'from DEFERRED_COLLISIONS: %s' % stale)


def _group(user, **kw):
    fields = dict(
        name='Flat', description='', created_by=user.id,
        default_split_method='shares', default_payer=user.id,
        auto_include_all=False)
    fields.update(kw)
    group = Group(**fields)
    group.members.append(user)
    db.session.add(group)
    db.session.commit()
    return group


def test_both_spellings_of_the_groups_list_return_the_same_payload(
        client, db, auth_headers):
    """web-ui asks without the slash, mobile asks with it. Same answer, or the
    two clients are looking at different data."""
    user = UserFactory()
    _group(user)
    headers = auth_headers(user)

    bare = client.get('/api/v1/groups', headers=headers)
    slashed = client.get('/api/v1/groups/', headers=headers)

    assert bare.status_code == 200, bare.get_data(as_text=True)[:200]
    assert slashed.status_code == 200, slashed.get_data(as_text=True)[:200]

    bare_groups = bare.get_json()['groups']
    slashed_groups = slashed.get_json()['groups']
    assert len(bare_groups) == len(slashed_groups) == 1

    assert set(bare_groups[0]) == set(slashed_groups[0]), (
        'the two spellings describe a group with different fields; missing from '
        'the slashed form: %s'
        % sorted(set(bare_groups[0]) - set(slashed_groups[0])))
    assert bare_groups[0] == slashed_groups[0]


def test_the_groups_list_carries_the_split_settings_mobile_renders(
        client, db, auth_headers):
    """Named separately from the equality test above so a regression says which
    fields went missing, not just that two payloads differ."""
    user = UserFactory()
    _group(user)
    headers = auth_headers(user)

    for path in ('/api/v1/groups', '/api/v1/groups/'):
        group = client.get(path, headers=headers).get_json()['groups'][0]
        assert group['default_split_method'] == 'shares', (
            '%s dropped default_split_method; mobile renders it at '
            'groups.tsx:165 and reads it back into the edit form' % path)
        assert group['default_payer'] == user.id, (
            '%s dropped default_payer' % path)
        assert group['auto_include_all'] is False, (
            '%s dropped auto_include_all, so editing a group silently '
            're-enables it' % path)


def test_creating_a_group_keeps_the_split_settings_it_was_sent(
        client, db, auth_headers):
    """`POST /api/v1/groups/` (restx) built the Group from `name` and
    `description` only and returned 201, so mobile's GroupForm lost every
    setting on it."""
    user = UserFactory()
    headers = auth_headers(user)

    resp = client.post('/api/v1/groups/', headers=headers, json={
        'name': 'Roadtrip',
        'description': 'fuel and food',
        'default_split_method': 'percentage',
        'auto_include_all': False,
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]

    group = Group.query.filter_by(name='Roadtrip').first()
    assert group is not None, 'the group was not created at all'
    assert group.default_split_method == 'percentage', (
        'default_split_method was accepted with a 201 and silently dropped')
    assert group.auto_include_all is False, (
        'auto_include_all was accepted with a 201 and silently dropped')


def test_group_id_survives_a_create_on_both_spellings(
        client, db, auth_headers):
    """Asserted against the database row, because the response was a 201 either
    way. This is what filed every group settlement as a personal expense."""
    user = UserFactory()
    group = _group(user)
    headers = auth_headers(user)

    for path in ('/api/v1/transactions', '/api/v1/transactions/'):
        resp = client.post(path, headers=headers, json={
            'description': 'Settlement via %s' % path,
            'amount': 12.5,
            'date': '2026-08-05',
            'transaction_type': 'expense',
            'group_id': group.id,
        })
        assert resp.status_code == 201, resp.get_data(as_text=True)[:300]

        created = Expense.query.filter_by(
            description='Settlement via %s' % path).first()
        assert created is not None, '%s created nothing' % path
        assert created.group_id == group.id, (
            '%s accepted group_id with a 201 and dropped it, so the '
            'transaction never lands in the group' % path)


def test_both_spellings_of_the_create_return_the_shape_the_clients_declare(
        client, db, auth_headers):
    """web-ui's `createTransaction` reads `response.data.transaction` and
    mobile's `create` reads the same key. The legacy handler returned
    `{message, transaction_id}`, so on web the call resolved to `undefined`."""
    user = UserFactory()
    headers = auth_headers(user)

    for i, path in enumerate(('/api/v1/transactions', '/api/v1/transactions/')):
        resp = client.post(path, headers=headers, json={
            'description': 'Coffee %d' % i,
            'amount': 4.0,
            'date': '2026-08-05',
            'transaction_type': 'expense',
        })
        body = resp.get_json()
        assert 'transaction' in body, (
            '%s returned %s — no `transaction` key, so the client gets '
            'undefined' % (path, sorted(body)))
        assert body['transaction']['description'] == 'Coffee %d' % i
