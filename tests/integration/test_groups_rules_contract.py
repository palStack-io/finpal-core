"""The contract the groups and transaction-rules blueprints serve TODAY.

This file exists to make the restx port safe. Those two families are the last
plain-Flask blueprints (13 rules, **15 `(path, method)` pairs** — `PUT` and
`PATCH` share a decorator in both, which restx will need as an explicit `patch`),
and porting them replaces a **live rules engine** with code that has never served
a request. Nothing here is aspirational: every assertion was read off the current
handlers and cross-checked against the deployed instance.

Two properties matter more than any single field.

**Both slash spellings.** `url_map.strict_slashes = False`, so `/groups` and
`/groups/` are separate rules that can resolve to *different implementations* —
that is exactly what PR #45 existed to fix, with web-ui omitting the slash and
mobile sending it. Verified on 2026-08-05 that all 15 pairs currently resolve to
the same handler either way, so every case here is exercised **twice** and the
two responses compared. A port that canonicalises one spelling would pass a
single-spelling suite and still serve the two clients different code.

**Exact response shapes, including the asymmetries.** These are inconsistent, and
the inconsistencies are the contract:

  * `GET /transaction-rules` wraps in `{'rules': [...]}` but
    `GET /transaction-rules/<id>` returns a **bare** `to_dict()`.
  * `POST /groups/<id>/members` answers **200**, not 201.
  * `POST /groups` returns only `{'message', 'group_id'}` — no group object —
    while `POST /transaction-rules` returns `{'message', 'rule_id', 'rule'}`.
  * The groups **list** carries `created_at` and `member_count`; `GET` of a
    single group carries neither, but adds a per-member `balance`.
  * `/groups/<id>/balances` answers under the key `balances`, sourced from
    `simplified_debts`.

`POST /groups/<id>/members` must merge into the existing restx `GroupMembers`
Resource, which already owns `GET` on the same path and names its converter `id`
where the blueprint says `group_id`.

Timestamps and ids are normalised out before comparing, since they legitimately
differ between two calls.
"""
import copy

import pytest

from src.models.transaction_rule import TransactionRule
from tests.factories import UserFactory

BOTH_SPELLINGS = pytest.mark.parametrize('slash', ['', '/'],
                                         ids=['no-slash', 'trailing-slash'])

VOLATILE = {'created_at', 'updated_at', 'last_matched'}


def _normalise(value):
    """Drop fields that legitimately differ between two identical calls."""
    if isinstance(value, dict):
        return {k: _normalise(v) for k, v in value.items() if k not in VOLATILE}
    if isinstance(value, list):
        return [_normalise(v) for v in value]
    return value


@pytest.fixture
def owner(db):
    return UserFactory()


@pytest.fixture
def member(db):
    return UserFactory()


@pytest.fixture
def headers(owner, auth_headers):
    return auth_headers(owner)


@pytest.fixture
def group_id(client, headers, member):
    resp = client.post('/api/v1/groups', headers=headers, json={
        'name': 'Flat', 'description': 'Shared', 'member_ids': [member.id],
        'default_split_method': 'percentage', 'default_payer': None,
        'auto_include_all': True,
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    return resp.get_json()['group_id']


@pytest.fixture
def rule_id(client, headers):
    resp = client.post('/api/v1/transaction-rules', headers=headers, json={
        'name': 'Coffee', 'pattern': 'COFFEE', 'priority': 10,
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    return resp.get_json()['rule_id']


# ==========================================================================
# groups — response shapes
# ==========================================================================

@BOTH_SPELLINGS
def test_group_list_shape(client, headers, group_id, slash):
    resp = client.get(f'/api/v1/groups{slash}', headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body) == {'groups'}
    group = body['groups'][0]
    assert set(group) == {
        'id', 'name', 'description', 'created_by', 'default_split_method',
        'default_payer', 'auto_include_all', 'created_at', 'member_count',
        'members',
    }
    assert set(group['members'][0]) == {'id', 'email', 'name'}
    assert group['member_count'] == len(group['members'])


@BOTH_SPELLINGS
def test_group_detail_shape(client, headers, group_id, slash):
    """No created_at and no member_count here, but members carry a balance."""
    resp = client.get(f'/api/v1/groups/{group_id}{slash}', headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body) == {'group'}
    group = body['group']
    assert set(group) == {
        'id', 'name', 'description', 'created_by', 'default_split_method',
        'default_payer', 'auto_include_all', 'members',
    }
    assert set(group['members'][0]) == {'id', 'email', 'name', 'balance'}
    assert isinstance(group['members'][0]['balance'], float)


@BOTH_SPELLINGS
def test_group_create_carries_the_split_settings(client, headers, member, slash):
    """#53's fields. Dropping them rendered a blank badge and reset on edit."""
    resp = client.post(f'/api/v1/groups{slash}', headers=headers, json={
        'name': f'Trip{slash!r}', 'member_ids': [member.id],
        'default_split_method': 'percentage', 'auto_include_all': True,
    })

    assert resp.status_code == 201
    assert set(resp.get_json()) == {'message', 'group_id'}

    detail = client.get(f'/api/v1/groups/{resp.get_json()["group_id"]}',
                        headers=headers).get_json()['group']
    assert detail['default_split_method'] == 'percentage'
    assert detail['auto_include_all'] is True


@BOTH_SPELLINGS
def test_group_create_rejects_a_missing_body(client, headers, slash):
    resp = client.post(f'/api/v1/groups{slash}', headers=headers, json={})

    assert resp.status_code == 400
    assert set(resp.get_json()) == {'error'}


@pytest.mark.parametrize('method', ['put', 'patch'])
@BOTH_SPELLINGS
def test_group_update_accepts_both_verbs(client, headers, group_id, method,
                                         slash):
    """PUT and PATCH share one decorator; restx needs an explicit `patch`."""
    resp = getattr(client, method)(
        f'/api/v1/groups/{group_id}{slash}', headers=headers,
        json={'name': f'Renamed by {method}',
              'default_split_method': 'equal'})

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'message'}

    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=headers).get_json()['group']
    assert detail['name'] == f'Renamed by {method}'
    assert detail['default_split_method'] == 'equal'


@BOTH_SPELLINGS
def test_group_update_renames_and_keeps_the_description(client, headers,
                                                        group_id, slash):
    """`name` and `description` had no service support at all — `update_settings`
    covered only the four settings fields."""
    resp = client.put(f'/api/v1/groups/{group_id}{slash}', headers=headers,
                      json={'name': 'Flatmates', 'description': 'Bills'})

    assert resp.status_code == 200
    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=headers).get_json()['group']
    assert (detail['name'], detail['description']) == ('Flatmates', 'Bills')


@BOTH_SPELLINGS
def test_group_update_is_creator_only(client, auth_headers, member, group_id,
                                      slash):
    """Deliberate, and inherited rather than invented: `update_settings` has
    always been creator-only. A group's split rules decide what every member
    owes, so letting any member rewrite them is a product decision, not a
    detail of restoring this route. `member` is in the group but did not create
    it."""
    resp = client.put(f'/api/v1/groups/{group_id}{slash}',
                      headers=auth_headers(member), json={'name': 'Hijacked'})

    assert resp.status_code == 400
    assert 'creator' in resp.get_json()['error']

    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=auth_headers(member)).get_json()['group']
    assert detail['name'] == 'Flat', 'a refused edit must change nothing'


@BOTH_SPELLINGS
def test_group_update_refuses_an_empty_name(client, headers, group_id, slash):
    resp = client.put(f'/api/v1/groups/{group_id}{slash}', headers=headers,
                      json={'name': '   '})

    assert resp.status_code == 400
    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=headers).get_json()['group']
    assert detail['name'] == 'Flat'


def test_group_update_never_returns_the_exception_text(client, db, headers,
                                                       group_id, monkeypatch):
    """CLAUDE.md forbids `str(e)` in a response, and restoring the edit route
    made that path reachable: `update_group` delegates any settings change to
    `update_settings` and propagates its message straight into
    `jsonify({'error': message})`.

    The commit is forced to fail, because the obvious probe does not reach this
    branch at all — `update_settings` swallows malformed `default_split_values`
    with a bare `except: pass` and answers 200. A first version of this test
    guarded its assertions behind `if status >= 400` and therefore asserted
    **nothing**, which is the D-37 lesson: a check that inspects nothing looks
    exactly like a check that passes.
    """
    secret = 'psycopg2.errors.UndefinedColumn: column "xyzzy" does not exist'

    def explode():
        raise RuntimeError(secret)

    monkeypatch.setattr(db.session, 'commit', explode)

    resp = client.put(f'/api/v1/groups/{group_id}', headers=headers,
                      json={'default_split_method': 'percentage'})

    assert resp.status_code >= 400, (
        'the commit was forced to fail, so this must not report success')
    error = resp.get_json()['error']
    assert secret not in error, f'the raw exception text reached the client: {error}'
    assert 'xyzzy' not in error and 'Traceback' not in error


@BOTH_SPELLINGS
def test_group_update_tells_absent_from_explicit_null(client, headers,
                                                      group_id, slash):
    """Both are `None` after `data.get(...)`, so the handler cannot distinguish
    them and treats null as "not mentioned".

    Pinned because restx with a marshmallow/reqparse schema is exactly the
    technology that materialises *absent* fields as explicit nulls — a port that
    did so would clear every unmentioned field on a partial update and still pass
    the rest of this file.
    """
    client.put(f'/api/v1/groups/{group_id}', headers=headers,
               json={'name': 'Kept', 'description': 'Kept too'})

    resp = client.put(f'/api/v1/groups/{group_id}{slash}', headers=headers,
                      json={'default_split_method': 'equal'})

    assert resp.status_code == 200
    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=headers).get_json()['group']
    assert detail['name'] == 'Kept', 'an unmentioned field must survive'
    assert detail['description'] == 'Kept too'


@BOTH_SPELLINGS
def test_group_balances_shape(client, headers, group_id, slash):
    """Answers under `balances`, sourced from `simplified_debts`."""
    resp = client.get(f'/api/v1/groups/{group_id}/balances{slash}',
                      headers=headers)

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'balances'}
    assert isinstance(resp.get_json()['balances'], list)


@BOTH_SPELLINGS
def test_add_member_answers_200_not_201(client, headers, group_id, slash):
    """The one create-shaped route here that does not answer 201."""
    newcomer = UserFactory()

    resp = client.post(f'/api/v1/groups/{group_id}/members{slash}',
                       headers=headers, json={'email': newcomer.id})

    assert resp.status_code == 200, 'this route has always answered 200'
    assert set(resp.get_json()) == {'message'}

    detail = client.get(f'/api/v1/groups/{group_id}',
                        headers=headers).get_json()['group']
    assert newcomer.id in [m['id'] for m in detail['members']]


@BOTH_SPELLINGS
def test_add_member_requires_an_email(client, headers, group_id, slash):
    resp = client.post(f'/api/v1/groups/{group_id}/members{slash}',
                       headers=headers, json={})

    assert resp.status_code == 400
    assert set(resp.get_json()) == {'error'}


@BOTH_SPELLINGS
def test_group_delete(client, headers, group_id, slash):
    """D-24: this 400'd for every user until #47."""
    resp = client.delete(f'/api/v1/groups/{group_id}{slash}', headers=headers)

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'message'}
    assert client.get('/api/v1/groups',
                      headers=headers).get_json()['groups'] == []


@BOTH_SPELLINGS
def test_a_group_you_are_not_in_is_404(client, auth_headers, group_id, slash):
    stranger = UserFactory()

    resp = client.get(f'/api/v1/groups/{group_id}{slash}',
                      headers=auth_headers(stranger))

    assert resp.status_code == 404
    assert set(resp.get_json()) == {'error'}


# ==========================================================================
# transaction-rules — response shapes
# ==========================================================================

@BOTH_SPELLINGS
def test_rule_list_is_wrapped(client, headers, rule_id, slash):
    resp = client.get(f'/api/v1/transaction-rules{slash}', headers=headers)

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'rules'}


@BOTH_SPELLINGS
def test_rule_detail_is_bare(client, headers, rule_id, slash):
    """Asymmetric with the list on purpose — the port must keep it."""
    resp = client.get(f'/api/v1/transaction-rules/{rule_id}{slash}',
                      headers=headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert 'rule' not in body, 'the detail route returns a BARE to_dict()'
    assert body['id'] == rule_id


def test_rule_to_dict_field_set(client, headers, rule_id):
    """Named explicitly, so the port cannot quietly drop one."""
    body = client.get(f'/api/v1/transaction-rules/{rule_id}',
                      headers=headers).get_json()

    assert set(body) == {
        'id', 'name', 'pattern', 'pattern_field', 'is_regex', 'case_sensitive',
        'amount_min', 'amount_max', 'transaction_type_filter',
        'auto_category_id', 'auto_category', 'auto_account_id', 'auto_account',
        'auto_transaction_type', 'auto_tags', 'auto_notes', 'priority',
        'active', 'match_count', 'last_matched', 'created_at', 'updated_at',
    }


@BOTH_SPELLINGS
def test_rule_list_orders_by_priority_desc(client, headers, slash):
    for name, priority in [('low', 1), ('high', 99), ('mid', 50)]:
        client.post('/api/v1/transaction-rules', headers=headers,
                    json={'name': name, 'pattern': 'X', 'priority': priority})

    rules = client.get(f'/api/v1/transaction-rules{slash}',
                       headers=headers).get_json()['rules']

    assert [r['name'] for r in rules] == ['high', 'mid', 'low']


@BOTH_SPELLINGS
def test_rule_create_shape(client, headers, slash):
    resp = client.post(f'/api/v1/transaction-rules{slash}', headers=headers,
                       json={'name': 'Tesco', 'pattern': 'TESCO'})

    assert resp.status_code == 201
    assert set(resp.get_json()) == {'message', 'rule_id', 'rule'}


@pytest.mark.parametrize('missing,payload', [
    ('name', {'pattern': 'X'}),
    ('pattern', {'name': 'X'}),
])
@BOTH_SPELLINGS
def test_rule_create_requires_name_and_pattern(client, headers, missing,
                                               payload, slash):
    resp = client.post(f'/api/v1/transaction-rules{slash}', headers=headers,
                       json=payload)

    assert resp.status_code == 400
    assert missing in resp.get_json()['error'].lower()


@pytest.mark.parametrize('method', ['put', 'patch'])
@BOTH_SPELLINGS
def test_rule_update_accepts_both_verbs(client, headers, rule_id, method,
                                        slash):
    resp = getattr(client, method)(
        f'/api/v1/transaction-rules/{rule_id}{slash}', headers=headers,
        json={'name': f'Renamed by {method}'})

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'message', 'rule'}
    assert resp.get_json()['rule']['name'] == f'Renamed by {method}'


@BOTH_SPELLINGS
def test_rule_update_patches_only_named_fields(client, headers, rule_id, slash):
    """Key presence, not truthiness — `active: False` must land."""
    resp = client.put(f'/api/v1/transaction-rules/{rule_id}{slash}',
                      headers=headers, json={'active': False})

    assert resp.status_code == 200
    rule = resp.get_json()['rule']
    assert rule['active'] is False
    assert rule['name'] == 'Coffee', 'an unmentioned field must not change'
    assert rule['priority'] == 10


@BOTH_SPELLINGS
def test_rule_delete(client, db, headers, rule_id, slash):
    resp = client.delete(f'/api/v1/transaction-rules/{rule_id}{slash}',
                         headers=headers)

    assert resp.status_code == 200
    assert set(resp.get_json()) == {'message'}
    # `Query.get()` is removed in SQLAlchemy 2 and item 5 exists to delete the
    # 63 remaining calls; not adding a 64th here.
    assert db.session.get(TransactionRule, rule_id) is None


@BOTH_SPELLINGS
def test_another_users_rule_is_404(client, auth_headers, rule_id, slash):
    stranger = UserFactory()

    resp = client.get(f'/api/v1/transaction-rules/{rule_id}{slash}',
                      headers=auth_headers(stranger))

    assert resp.status_code == 404


# ==========================================================================
# the preview endpoint, which two clients read differently
# ==========================================================================

@BOTH_SPELLINGS
def test_preview_accepts_an_unsaved_rule(client, headers, slash):
    """web-ui posts `{...ruleData, test_transaction}` for an UNSAVED rule."""
    resp = client.post(f'/api/v1/transaction-rules/test{slash}',
                       headers=headers,
                       json={'pattern': 'COFFEE', 'name': 'preview',
                             'test_transaction': {'description': 'COFFEE SHOP',
                                                  'amount': 5}})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body['success'] is True
    assert body['matches'] is True
    assert 'rule' not in body, 'an unsaved preview reports no rule object'
    # `result` is what web-ui reads; `applied_changes` is kept for older callers.
    assert body['result'] == body['applied_changes']


@BOTH_SPELLINGS
def test_preview_of_a_saved_rule_reports_the_rule(client, headers, rule_id,
                                                  slash):
    resp = client.post(f'/api/v1/transaction-rules/test{slash}',
                       headers=headers,
                       json={'rule_id': rule_id,
                             'test_transaction': {'description': 'COFFEE SHOP',
                                                  'amount': 5}})

    assert resp.status_code == 200
    assert resp.get_json()['rule']['id'] == rule_id


@BOTH_SPELLINGS
def test_preview_accepts_either_sample_key(client, headers, slash):
    """`transaction_data` is the original name, `test_transaction` is web-ui's."""
    sample = {'description': 'COFFEE SHOP', 'amount': 5}
    a = client.post(f'/api/v1/transaction-rules/test{slash}', headers=headers,
                    json={'pattern': 'COFFEE', 'transaction_data': sample})
    b = client.post(f'/api/v1/transaction-rules/test{slash}', headers=headers,
                    json={'pattern': 'COFFEE', 'test_transaction': sample})

    assert a.status_code == b.status_code == 200
    assert a.get_json()['matches'] == b.get_json()['matches'] is True


@BOTH_SPELLINGS
def test_preview_never_saves_the_rule_it_builds(client, headers, slash):
    """`apply()` bumps match_count on the instance; it must not be flushed."""
    client.post(f'/api/v1/transaction-rules/test{slash}', headers=headers,
                json={'pattern': 'COFFEE', 'name': 'ghost',
                      'test_transaction': {'description': 'COFFEE', 'amount': 5}})

    assert TransactionRule.query.filter_by(name='ghost').first() is None


# ==========================================================================
# the property that outranks every field above
# ==========================================================================

CASES = [
    ('get', '/api/v1/groups{s}', None),
    ('get', '/api/v1/groups/{g}{s}', None),
    ('get', '/api/v1/groups/{g}/balances{s}', None),
    ('get', '/api/v1/transaction-rules{s}', None),
    ('get', '/api/v1/transaction-rules/{r}{s}', None),
    ('put', '/api/v1/groups/{g}{s}', {'description': 'same'}),
    ('patch', '/api/v1/groups/{g}{s}', {'description': 'same'}),
    ('put', '/api/v1/transaction-rules/{r}{s}', {'auto_notes': 'same'}),
    ('patch', '/api/v1/transaction-rules/{r}{s}', {'auto_notes': 'same'}),
    ('post', '/api/v1/transaction-rules/test{s}',
     {'pattern': 'COFFEE', 'test_transaction': {'description': 'COFFEE',
                                                'amount': 5}}),
]


@pytest.mark.parametrize('method,template,payload', CASES,
                         ids=[f'{m}-{t}' for m, t, _ in CASES])
def test_both_slash_spellings_answer_identically(client, headers, group_id,
                                                 rule_id, method, template,
                                                 payload):
    """`strict_slashes=False` lets the two spellings reach different code.

    web-ui omits the trailing slash and mobile sends it, so a port that
    canonicalises one of them serves the two clients different implementations
    while every single-spelling test stays green. This is the regression #45
    existed to fix.
    """
    def call(slash):
        url = template.format(g=group_id, r=rule_id, s=slash)
        kwargs = {'headers': headers}
        if payload is not None:
            kwargs['json'] = copy.deepcopy(payload)
        return getattr(client, method)(url, **kwargs)

    bare, slashed = call(''), call('/')

    assert bare.status_code == slashed.status_code, (
        f'{method.upper()} {template} answers differently with and without a '
        f'trailing slash: {bare.status_code} vs {slashed.status_code}')
    assert _normalise(bare.get_json()) == _normalise(slashed.get_json()), (
        f'{method.upper()} {template} returns a different body per spelling')


# The exact surface this contract was captured against, read off `app.url_map`
# on 2026-08-05. Named individually rather than counted, because a route added
# while another is removed keeps any count identical.
CAPTURED_SURFACE = {
    ('/api/v1/groups', 'GET'),
    ('/api/v1/groups', 'POST'),
    ('/api/v1/groups/<int:group_id>', 'GET'),
    ('/api/v1/groups/<int:group_id>', 'PUT'),
    ('/api/v1/groups/<int:group_id>', 'PATCH'),
    ('/api/v1/groups/<int:group_id>', 'DELETE'),
    ('/api/v1/groups/<int:group_id>/balances', 'GET'),
    ('/api/v1/groups/<int:group_id>/members', 'POST'),
    ('/api/v1/transaction-rules', 'GET'),
    ('/api/v1/transaction-rules', 'POST'),
    ('/api/v1/transaction-rules/<int:rule_id>', 'GET'),
    ('/api/v1/transaction-rules/<int:rule_id>', 'PUT'),
    ('/api/v1/transaction-rules/<int:rule_id>', 'PATCH'),
    ('/api/v1/transaction-rules/<int:rule_id>', 'DELETE'),
    ('/api/v1/transaction-rules/test', 'POST'),
}


def test_the_captured_surface_is_still_the_whole_surface(app):
    """Derived from the app's own url_map, so a route cannot join or leave these
    two families and silently go uncaptured before the port."""
    live = {
        (str(rule), method)
        for rule in app.url_map.iter_rules()
        if rule.endpoint.startswith(('group_api.', 'transaction_rule_api.'))
        for method in rule.methods - {'HEAD', 'OPTIONS'}
    }

    assert live == CAPTURED_SURFACE, (
        f'added since capture: {sorted(live - CAPTURED_SURFACE)}; '
        f'gone since capture: {sorted(CAPTURED_SURFACE - live)}')
    assert len(CAPTURED_SURFACE) == 15
