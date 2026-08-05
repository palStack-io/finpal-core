"""The rule engine had no tests, and it runs on almost every transaction created.

`build_transaction` calls `apply_transaction_rules` whenever a create arrives without
a `category_id` — which is the common case, since the web form leaves the field blank
unless the user picks one. So this code silently decides how a user's spending is
categorised, and from there what their budgets report, with 222 lines and zero
coverage. It is the "broaden coverage" roadmap item's most exposed half.

Tests are written against behaviour a user would notice: which category a transaction
ends up in, whose rules can act on it, and whether a rule that cannot compile takes
the request down with it.

One deliberate choice about scope. `apply_transaction_rules` applies **every** matching
rule in priority order rather than stopping at the first, and the source says so in a
comment that reads like an open question ("Stop after first match if desired (can make
this configurable)"). The tests pin the behaviour as it is, and name it, rather than
asserting the behaviour someone might have intended — an unreviewed guess about intent
is how a test ends up encoding a bug, which happened twice in this session already.
"""
from src.extensions import db
from src.models.category import Category
from src.models.transaction_rule import TransactionRule
from src.utils.rule_engine import (apply_transaction_rules, bulk_apply_rules,
                                   get_matching_rule)
from tests.factories import UserFactory


def _rule(user, **kw):
    fields = dict(user_id=user.id, name='R', pattern='tesco',
                  pattern_field='description', is_regex=False,
                  case_sensitive=False, priority=50, active=True)
    fields.update(kw)
    rule = TransactionRule(**fields)
    db.session.add(rule)
    db.session.commit()
    return rule


def _category(user, name='Groceries'):
    c = Category(name=name, user_id=user.id)
    db.session.add(c)
    db.session.commit()
    return c


def _txn(**kw):
    data = dict(description='Tesco Extra', amount=42.0,
                transaction_type='expense', category_id=None, notes='')
    data.update(kw)
    return data


def test_a_matching_rule_sets_the_category(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, auto_category_id=food.id)

    result = apply_transaction_rules(_txn(), user.id)

    assert result['category_id'] == food.id


def test_a_non_matching_rule_leaves_the_category_alone(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='sainsbury', auto_category_id=food.id)

    result = apply_transaction_rules(_txn(description='Tesco Extra'), user.id)

    assert result['category_id'] is None


def test_matching_ignores_case_by_default(client, db):
    """`case_sensitive=False` is the default the UI creates rules with, so a rule
    for "tesco" has to catch "TESCO EXTRA"."""
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='tesco', auto_category_id=food.id)

    result = apply_transaction_rules(_txn(description='TESCO EXTRA'), user.id)

    assert result['category_id'] == food.id


def test_a_case_sensitive_rule_respects_case(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='Tesco', case_sensitive=True, auto_category_id=food.id)

    assert apply_transaction_rules(
        _txn(description='tesco extra'), user.id)['category_id'] is None
    assert apply_transaction_rules(
        _txn(description='Tesco Extra'), user.id)['category_id'] == food.id


def test_another_users_rules_never_apply(client, db):
    """Rules are per-user and the query filters on `user_id`. Pinned because a rule
    silently recategorising someone else's spending would be invisible."""
    mine = UserFactory()
    theirs = UserFactory()
    their_category = _category(theirs, 'Their bucket')
    _rule(theirs, auto_category_id=their_category.id)

    result = apply_transaction_rules(_txn(), mine.id)

    assert result['category_id'] is None, (
        "another user's rule categorised this transaction")


def test_an_inactive_rule_does_not_apply(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, active=False, auto_category_id=food.id)

    assert apply_transaction_rules(_txn(), user.id)['category_id'] is None


def test_the_highest_priority_rule_wins_the_category(client, db):
    """Rules are ordered by descending priority and each applies in turn, so the
    first to set a category is the highest-priority match."""
    user = UserFactory()
    low = _category(user, 'Low')
    high = _category(user, 'High')
    _rule(user, name='low', priority=1, auto_category_id=low.id)
    _rule(user, name='high', priority=99, auto_category_id=high.id)

    result = apply_transaction_rules(_txn(), user.id)

    assert result['category_id'] == high.id, (
        'priority %s won instead of the highest' % result['category_id'])


def test_an_amount_range_bounds_the_match(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, amount_min=10.0, amount_max=50.0, auto_category_id=food.id)

    assert apply_transaction_rules(
        _txn(amount=42.0), user.id)['category_id'] == food.id
    assert apply_transaction_rules(
        _txn(amount=5.0), user.id)['category_id'] is None
    assert apply_transaction_rules(
        _txn(amount=500.0), user.id)['category_id'] is None


def test_an_amount_range_uses_the_absolute_value(client, db):
    """`matches` takes `abs(amount)`, so a rule written for a positive range still
    catches a negative amount of the same size. Pinned because it is surprising."""
    user = UserFactory()
    food = _category(user)
    _rule(user, amount_min=10.0, amount_max=50.0, auto_category_id=food.id)

    assert apply_transaction_rules(
        _txn(amount=-42.0), user.id)['category_id'] == food.id


def test_a_transaction_type_filter_is_respected(client, db):
    user = UserFactory()
    income = _category(user, 'Salary')
    _rule(user, pattern='acme', transaction_type_filter='income',
          auto_category_id=income.id)

    assert apply_transaction_rules(
        _txn(description='ACME Payroll', transaction_type='income'),
        user.id)['category_id'] == income.id
    assert apply_transaction_rules(
        _txn(description='ACME Payroll', transaction_type='expense'),
        user.id)['category_id'] is None


def test_a_regex_rule_matches(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern=r'tesco|sainsbury', is_regex=True,
          auto_category_id=food.id)

    assert apply_transaction_rules(
        _txn(description='Sainsbury Local'), user.id)['category_id'] == food.id


def test_an_uncompilable_regex_does_not_break_the_create(client, db):
    """`matches` catches `re.error` and returns False.

    This matters more than it looks: `apply_transaction_rules` runs inside
    `build_transaction`, so a rule the user saved with a broken pattern would
    otherwise make every uncategorised create fail.
    """
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='[unclosed', is_regex=True, auto_category_id=food.id)

    result = apply_transaction_rules(_txn(), user.id)

    assert result['category_id'] is None


def test_an_empty_field_value_never_matches(client, db):
    """`matches` returns False on a falsy field value, so a blank description is not
    swept up by every rule."""
    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='tesco', auto_category_id=food.id)

    assert apply_transaction_rules(
        _txn(description=''), user.id)['category_id'] is None


def test_get_matching_rule_returns_the_highest_priority_match(client, db):
    user = UserFactory()
    food = _category(user)
    _rule(user, name='low', priority=1, auto_category_id=food.id)
    _rule(user, name='high', priority=99, auto_category_id=food.id)

    rule = get_matching_rule(_txn(), user.id)

    assert rule is not None and rule.name == 'high'


def test_get_matching_rule_returns_none_when_nothing_matches(client, db):
    user = UserFactory()
    _rule(user, pattern='nope')

    assert get_matching_rule(_txn(), user.id) is None


def test_rules_reach_a_real_create_through_the_api(client, db, auth_headers):
    """The path that matters: a create with no category runs the engine.

    `build_transaction` only calls it when `category_id` is absent, which is what the
    web form sends unless the user picks one — so this is the common case, not an
    edge one.
    """
    from src.models.transaction import Expense

    user = UserFactory()
    food = _category(user)
    _rule(user, pattern='tesco', auto_category_id=food.id)

    resp = client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Tesco Extra big shop',
        'amount': 42.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
    })

    assert resp.status_code == 201, resp.get_data(as_text=True)[:200]
    row = Expense.query.filter_by(description='Tesco Extra big shop').first()
    assert row.category_id == food.id, (
        'the rule did not reach the create path; category is %r' % row.category_id)


def test_an_explicit_category_is_not_overridden_by_a_rule(
        client, db, auth_headers):
    """The user's own choice wins. `build_transaction` skips the engine entirely when
    a category is supplied, so a rule cannot quietly move it."""
    from src.models.transaction import Expense

    user = UserFactory()
    rule_target = _category(user, 'RuleSays')
    chosen = _category(user, 'IChose')
    _rule(user, pattern='tesco', auto_category_id=rule_target.id)

    client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Tesco Extra',
        'amount': 42.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'category_id': chosen.id,
    })

    row = Expense.query.filter_by(description='Tesco Extra').first()
    assert row.category_id == chosen.id, (
        "a rule overrode the category the user picked")


def test_bulk_apply_only_touches_the_callers_transactions(client, db):
    """`bulk_apply_rules` rewrites history, so its user scoping is the assertion that
    matters most about it."""
    from datetime import datetime

    from src.models.transaction import Expense

    mine = UserFactory()
    theirs = UserFactory()
    my_category = _category(mine)
    _rule(mine, pattern='tesco', auto_category_id=my_category.id)

    for owner, description in ((mine, 'Tesco mine'), (theirs, 'Tesco theirs')):
        db.session.add(Expense(
            description=description, amount=10.0, date=datetime(2026, 8, 5),
            user_id=owner.id, paid_by=owner.id, card_used='',
            split_method='equal', transaction_type='expense'))
    db.session.commit()

    result = bulk_apply_rules(mine.id)

    assert result.get('success') is True, result
    db.session.expire_all()
    assert Expense.query.filter_by(
        description='Tesco mine').first().category_id == my_category.id
    assert Expense.query.filter_by(
        description='Tesco theirs').first().category_id is None, (
        "bulk apply recategorised another user's transaction")


def test_a_lower_priority_rule_still_contributes_notes(client, db):
    """The other half of the intent at `rule_engine.py:46`.

    Making the category first-match-wins must not stop lower-priority rules
    contributing the things that accumulate — otherwise the fix trades one wrong
    behaviour for another.
    """
    user = UserFactory()
    high_cat = _category(user, 'High')
    low_cat = _category(user, 'Low')
    _rule(user, name='high', priority=99, auto_category_id=high_cat.id)
    _rule(user, name='low', priority=1, auto_category_id=low_cat.id,
          auto_notes='seen by the low rule')

    result = apply_transaction_rules(_txn(), user.id)

    assert result['category_id'] == high_cat.id, 'priority stopped working'
    assert 'seen by the low rule' in (result.get('notes') or ''), (
        'the lower-priority rule stopped contributing its note: %r'
        % result.get('notes'))


def test_priority_holds_through_a_real_create(client, db, auth_headers):
    """Through the API, since that is where the inversion actually cost the user."""
    from src.models.transaction import Expense

    user = UserFactory()
    general = _category(user, 'General shopping')
    specific = _category(user, 'Coffee')
    _rule(user, name='general', pattern='tesco', priority=1,
          auto_category_id=general.id)
    _rule(user, name='specific', pattern='tesco cafe', priority=99,
          auto_category_id=specific.id)

    client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Tesco Cafe flat white',
        'amount': 3.2,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
    })

    row = Expense.query.filter_by(description='Tesco Cafe flat white').first()
    assert row.category_id == specific.id, (
        'the general low-priority rule beat the specific high-priority one')


def test_bulk_apply_still_recategorises_an_already_categorised_transaction(
        client, db):
    """The behaviour the precedence fix must not break.

    `bulk_apply_rules` exists to re-categorise history, and it passes each
    transaction's *current* `category_id` into `apply`. An earlier version of the fix
    put the "don't overwrite" guard inside `TransactionRule.apply`, which silently
    reduced this feature to "only categorise the uncategorised" — on an action the
    user invokes deliberately. That is why precedence lives in the priority loop
    instead.
    """
    from datetime import datetime

    from src.models.transaction import Expense

    user = UserFactory()
    old = _category(user, 'Wrong bucket')
    new = _category(user, 'Right bucket')
    _rule(user, pattern='tesco', auto_category_id=new.id)
    db.session.add(Expense(
        description='Tesco Extra', amount=10.0, date=datetime(2026, 8, 5),
        user_id=user.id, paid_by=user.id, card_used='', split_method='equal',
        transaction_type='expense', category_id=old.id))
    db.session.commit()

    bulk_apply_rules(user.id)

    db.session.expire_all()
    row = Expense.query.filter_by(description='Tesco Extra').first()
    assert row.category_id == new.id, (
        'bulk apply refused to move an already-categorised transaction, so '
        're-categorising history no longer works')


def test_the_rule_preview_reports_the_rule_acting_on_a_categorised_sample(
        client, db, auth_headers):
    """`POST /transaction-rules/test` previews a rule against a client-supplied
    sample, which may already carry a category.

    web-ui calls this at `transactionRules.ts:84` before the user saves. A preview
    that reports "no change" for a rule that would in fact change the category is
    worse than no preview.
    """
    user = UserFactory()
    existing = _category(user, 'Already')
    target = _category(user, 'Rule target')

    resp = client.post('/api/v1/transaction-rules/test',
                       headers=auth_headers(user), json={
                           'pattern': 'tesco',
                           'auto_category_id': target.id,
                           'test_transaction': {
                               'description': 'Tesco Extra',
                               'amount': 10.0,
                               'transaction_type': 'expense',
                               'category_id': existing.id,
                           },
                       })

    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json()
    assert body['matches'] is True, body
    assert body['result']['category_id'] == target.id, (
        'the preview claims the rule would leave the category at %r, but the rule '
        'sets it to %r' % (body['result'].get('category_id'), target.id))
