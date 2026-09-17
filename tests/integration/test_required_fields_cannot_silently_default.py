"""A `required=True` field must not silently become a plausible wrong value.

*** THIS IS D-257 TURNED FROM A ROW INTO AN INVARIANT, AND IT IS THE ANSWER TO
THE SURFACE-WIDE QUESTION THE ROW LEFT OPEN. *** Owner delegated the decision
on 2026-09-17. The question was *should v1 validate request bodies at all* —
57 `required=True` fields across 16 files, and nothing in this app sets
`RESTX_VALIDATE` or passes `validate=True`, so every one of them documents a
requirement it does not enforce.

**Flipping validation on globally was rejected.** It would change the answer of
dozens of handlers at once, for clients nobody can test here, to fix a problem
that is only DANGEROUS in a narrow subset. A lenient API that returns 400 on a
missing field it never needed is not the failure worth that risk.

*** THE DANGEROUS SUBSET IS: a required field whose target column is
`nullable=False` WITH a Python-side `default=`. *** There, omitting the field
does not error and does not store NULL — SQLAlchemy fills in the default, so
the row is written with a plausible, wrong, confident value. Measured
instances:

- `Investment.purchase_price` (`default=0`) — a holding reported its whole
  market value as profit beside 0.00%. That is D-257 itself.
- `Investment.shares` (`default=0`) — found by enumerating this class rather
  than by luck: a holding of ZERO shares, 201, dragging every portfolio total.
- `Expense.date` (`default=utcnow`) — **already guarded**; the handler answers
  400. Kept in the list so the guard cannot be removed unnoticed.

Everything else with `nullable=False + default` is a timestamp or a genuine
config default that no API field claims to require.
"""
import ast
import pathlib
import re

import pytest

MODELS = list(pathlib.Path('src/models').glob('*.py')) + \
    list(pathlib.Path('src/modules').rglob('models.py'))
API = sorted(pathlib.Path('api/v1').glob('*.py'))


def _columns_that_absorb_a_none():
    """`{column_name: [(module, default)]}` for `nullable=False` + `default=`.

    *** AST, NOT A REGEX, AND THE REGEX VERSION WAS WRONG. *** A first pass used
    `db\\.Column\\((.*?)\\)`, which stops at the FIRST `)` — so every column with
    a nested call was skipped, `db.Numeric(18, 2)` included. That silently
    omitted `purchase_price`, the very column this test exists for. A detector
    that misses its own founding case is worse than no detector.
    """
    out = {}
    for f in MODELS:
        try:
            tree = ast.parse(f.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
                continue
            fn = node.value.func
            if not (isinstance(fn, ast.Attribute) and fn.attr == 'Column'):
                continue
            kws = {k.arg: k.value for k in node.value.keywords if k.arg}
            nn = kws.get('nullable')
            if not (isinstance(nn, ast.Constant) and nn.value is False):
                continue
            if 'default' not in kws or 'primary_key' in kws:
                continue
            if not isinstance(node.targets[0], ast.Name):
                continue
            name = node.targets[0].id
            out.setdefault(name, []).append(
                (f.stem if f.stem != 'models' else f.parent.name,
                 ast.unparse(kws['default'])))
    return out


def _required_api_fields():
    """`{field_name: [api_file]}` for every `required=True` in an `ns.model`."""
    out = {}
    for f in API:
        src = f.read_text()
        for m in re.finditer(
                r"'([a-z_]+)':\s*fields\.\w+\([^)]*required=True", src, re.S):
            out.setdefault(m.group(1), []).append(f.name)
    return out


# The pairs that ARE dangerous and are each guarded by a named behavioural test.
# An entry here is a promise that omitting the field is REFUSED, not defaulted.
GUARDED = {
    'purchase_price': 'test_d257_holding_needs_a_price.py',
    'shares': 'test_d257_holding_needs_a_price.py',
    'date': 'the transactions handler answers 400; test at the bottom of this file',
}

# *** THE MATCH IS BY NAME ACROSS EVERY MODEL, SO IT OVER-REPORTS — AND THAT IS
# THE RIGHT DIRECTION FOR A SAFETY GATE. *** Pairing a required field with a
# column in a table the handler never writes is a false alarm, and a false
# alarm is cheap: declare it with the reason. Missing a real one is not cheap,
# which is why the matching is not tightened.
#
# Each entry states WHY the collision is harmless, and the staleness test below
# refuses an entry that has stopped colliding at all.
NOT_A_PAIR = {
    'start_date':
        "required by `recurring.py`, where `RecurringExpense.start_date` is "
        "`nullable=False` with NO default — so omitting it ERRORS, which is the "
        "correct behaviour. The defaulting `start_date` columns belong to "
        "`Budget` and `Goal`, which that handler never writes.",
    'surface':
        "required by `/coins/refresh`, and it is not a column at all — the "
        "handler reads it to choose which acts to evaluate and stores nothing. "
        "The defaulting `surface` column belongs to learnPal's milestones.",
}


def test_the_detector_finds_its_own_founding_case():
    """Or the whole file passes by finding nothing.

    `purchase_price` is why this test exists. If the detector stops seeing it,
    every assertion below becomes vacuous.
    """
    cols = _columns_that_absorb_a_none()
    assert 'purchase_price' in cols, (
        'the detector no longer sees purchase_price — it is broken, not clean')
    assert 'shares' in cols
    assert len(cols) > 20, f'suspiciously few columns found: {len(cols)}'


def test_the_api_scan_finds_required_fields():
    fields = _required_api_fields()
    assert len(fields) > 20, f'only found {len(fields)} required fields'
    assert 'purchase_price' in fields


def test_EVERY_DANGEROUS_PAIR_IS_GUARDED_OR_DECLARED():
    """*** THE INVARIANT. *** A required field over a silently-defaulting column
    must be listed in `GUARDED`, which means a behavioural test proves omitting
    it is refused.

    A new one appearing here is not a style complaint: it means a caller told
    the field is required can omit it and get a confidently wrong row.
    """
    cols = _columns_that_absorb_a_none()
    required = _required_api_fields()

    dangerous = sorted(set(cols) & set(required))
    unguarded = [f for f in dangerous
                 if f not in GUARDED and f not in NOT_A_PAIR]

    assert not unguarded, (
        f'These fields are documented `required=True` and land on a column that '
        f'is `nullable=False` with a Python-side default, so omitting them '
        f'writes a plausible WRONG value instead of erroring: {unguarded}.\n'
        f'For each: refuse a missing value in the handler and add it to '
        f'GUARDED with the test that proves it. Do NOT reach for '
        f'`validate=True` globally — see this file\'s docstring.\n'
        f'  columns: ' + '; '.join(
            f'{f}={cols[f]}' for f in unguarded)
    )


@pytest.mark.parametrize('listing', ['GUARDED', 'NOT_A_PAIR'])
def test_NO_STALE_ENTRY_IN_EITHER_LISTING(listing):
    """An entry that has stopped colliding at all. A stale entry is how a list
    quietly stops describing anything — the same rule the demo-coverage
    exemptions follow, and the same rule that caught my own first draft of the
    page-padding gate on its first run."""
    cols = _columns_that_absorb_a_none()
    required = _required_api_fields()
    live = set(cols) & set(required)

    entries = GUARDED if listing == 'GUARDED' else NOT_A_PAIR
    stale = [f for f in entries if f not in live]
    assert not stale, (
        f'{listing} lists {stale}, which no longer both appears as a required '
        f'API field and lands on a silently-defaulting column — delete the '
        f'entry, or the list stops describing anything')


def test_the_date_guard_still_answers_400(db, auth_headers, client):
    """`Expense.date` is `nullable=False, default=utcnow`, so an unguarded
    handler would silently date a transaction TODAY — landing it in the wrong
    month and corrupting budgets, analytics and the on-budget streak.

    Guarded already; this pins it so the guard cannot quietly go.
    """
    from src.extensions import db as _db
    from src.models.transaction import Expense
    from tests.factories import AccountFactory, UserFactory

    u = UserFactory(id='dateguard@test.com', name='D',
                    password_plain='testpassword')
    _db.session.commit()
    a = AccountFactory(user_id=u.id, name='C', type='checking')
    _db.session.commit()

    res = client.post('/api/v1/transactions',
                      json={'description': 'no date', 'amount': -10,
                            'account_id': a.id},
                      headers=auth_headers(u))

    assert res.status_code == 400, res.get_json()
    _db.session.rollback()
    assert Expense.query.filter_by(user_id=u.id).count() == 0
