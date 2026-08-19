"""
A marshmallow Length ceiling must not be looser than the column it writes to.

This is the shape of palStack-io/finpal-core#123, and the reason it is worth a
general guard rather than a one-line fix: a validator that is *looser* than its
column does not reject anything, it just moves the failure from marshmallow's clean
400 to Postgres's `StringDataRightTruncation` — a 500, or an opaque "Error adding
account", with nothing useful in the response.

`AccountInput.color` allowed 20 characters into `Account.color`, which is
`db.String(7)` ("Hex color code (e.g., #3b82f6)"). The web-ui was sending CSS
variable references — `var(--accent-blue)` is 18 characters, `var(--brand-green-glow)`
is 23 — so:

  * savings and the Green swatch tripped the 20-char validator → 400, and the backend
    logged nothing at all, because marshmallow rejects before the handler runs. That
    is the 400 with no backend log the reporter attached.
  * checking, credit and cash passed the validator at 17–20 characters and then hit
    the 7-char column.

Only `investment` (#8b5cf6) could be created. The validator and the column disagreeing
is what let the second group through, so both halves are fixed: the web-ui sends hex
(see AddAccountForm/EditAccountForm) and the ceiling here follows the database — the
same principle already recorded for `category_id` (D-74) and `Budget.name` (D-78).

SQLite does not enforce VARCHAR lengths, so a dev database silently accepted every one
of these values. This test reads the declared column width instead of writing a row,
so it holds on either engine.
"""

import pytest
from marshmallow import validate

from schemas import input_schemas


# (schema instance, model class, {schema field: column name})
# Add a pair here when touching a domain; a missing pair is not a failure, but a pair
# whose validator overruns its column is.
def _pairs():
    from src.models.account import Account
    from src.models.category import Category
    from src.models.transaction import Expense

    return [
        pytest.param(input_schemas.account_input, Account,
                     {'account_type': 'type'}, id='AccountInput/Account'),
        pytest.param(input_schemas.category_input, Category, {}, id='CategoryInput/Category'),
        pytest.param(input_schemas.transaction_input, Expense, {}, id='TransactionInput/Expense'),
    ]


def _declared_max(field):
    """The largest string a marshmallow field will accept, or None if unbounded."""
    best = None
    for v in getattr(field, 'validators', []):
        if isinstance(v, validate.Length):
            if v.equal is not None:
                return v.equal
            if v.max is not None:
                best = v.max if best is None else min(best, v.max)
    return best


def _column_length(model, name):
    """The declared width of a String column, or None if it is not a bounded string."""
    col = model.__table__.columns.get(name)
    if col is None:
        return None
    return getattr(col.type, 'length', None)


def test_there_are_pairs_to_check():
    """Guard against the sweep passing because it checked nothing."""
    assert _pairs(), 'no schema/model pairs declared'


@pytest.mark.parametrize('schema, model, renames', [
    (p.values[0], p.values[1], p.values[2]) for p in _pairs()
], ids=[p.id for p in _pairs()])
def test_no_validator_accepts_more_than_its_column_holds(schema, model, renames):
    overruns = []
    checked = 0

    for field_name, field in schema.fields.items():
        column_name = renames.get(field_name, field_name)
        declared = _declared_max(field)
        width = _column_length(model, column_name)
        if declared is None or width is None:
            continue
        checked += 1
        if declared > width:
            overruns.append(
                f'{type(schema).__name__}.{field_name} accepts {declared} chars but '
                f'{model.__name__}.{column_name} is String({width})'
            )

    assert checked > 0, (
        f'{type(schema).__name__} shares no bounded string field with '
        f'{model.__name__} — the mapping is probably stale'
    )
    assert overruns == [], (
        'a validator is looser than its column, so oversized input reaches the '
        'database as a 500 instead of being refused as a 400:\n  '
        + '\n  '.join(overruns)
    )


def test_account_color_is_hex_sized():
    """
    #123 named explicitly, so the general sweep above cannot be relaxed without this
    also going red. `Account.color` stores a hex code; nothing longer belongs in it.
    """
    from src.models.account import Account

    assert _column_length(Account, 'color') == 7
    assert _declared_max(input_schemas.account_input.fields['color']) <= 7
