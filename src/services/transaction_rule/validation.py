"""Request-shape validation for transaction rules.

Moved verbatim out of the retired `api_routes` blueprint when the routes were
ported onto flask-restx, so the coercion rules did not change hands with the
handlers. See AUDIT D-38 for why they exist at all: the three narrowing fields
were dropped on create and update, and assigning them straight through would
have put `''` into a `db.Float` and turned a 400 into a 500.
"""

# The three fields that NARROW a rule. `TransactionRule.matches()` reads all of
# them, but create and update never read them off the request, so every rule
# saved through the API was broader than the user asked for — and `/test`
# accepted them, so the preview and the saved rule disagreed.
TRANSACTION_TYPES = ('expense', 'income', 'transfer')


class FieldError(ValueError):
    """A client-facing message naming the single field that was wrong."""


def coerce_amount(data, key):
    """Absent, null and '' all mean "no bound"; anything else must be a number.

    An uncoerced value reaching the `db.Float` column raises on commit, and the
    route's `except Exception` would answer 500 — the shape PR #57 found for
    `int('')`. Refusing by name here keeps it a 400.
    """
    value = data.get(key)
    if value is None or value == '':
        return None
    # bool is an int subclass, so True would otherwise pass float() as 1.0.
    if isinstance(value, (bool, list, dict)):
        raise FieldError(f'{key} must be a number')
    try:
        return float(value)
    except (TypeError, ValueError):
        raise FieldError(f'{key} must be a number')


def coerce_type_filter(data, key='transaction_type_filter'):
    """`matches()` compares this against `transaction_type` verbatim, so a value
    outside the three real types silently stops the rule matching anything."""
    value = data.get(key)
    if value is None or value == '':
        return None
    if value not in TRANSACTION_TYPES:
        raise FieldError(
            f'{key} must be one of: {", ".join(TRANSACTION_TYPES)}')
    return value


def _reject_inverted_range(amount_min, amount_max):
    if amount_min is not None and amount_max is not None and amount_min > amount_max:
        raise FieldError('amount_min must not be greater than amount_max')


def narrowing_fields(data, rule=None):
    """Validate all three together, before anything is mutated.

    Returns the fields the request actually mentions. When `rule` is given only
    keys present in `data` are returned, so a PUT that omits a bound leaves it
    alone rather than widening the rule.
    """
    if rule is None:
        fields = {
            'amount_min': coerce_amount(data, 'amount_min'),
            'amount_max': coerce_amount(data, 'amount_max'),
            'transaction_type_filter': coerce_type_filter(data),
        }
        _reject_inverted_range(fields['amount_min'], fields['amount_max'])
        return fields

    fields = {}
    if 'amount_min' in data:
        fields['amount_min'] = coerce_amount(data, 'amount_min')
    if 'amount_max' in data:
        fields['amount_max'] = coerce_amount(data, 'amount_max')
    if 'transaction_type_filter' in data:
        fields['transaction_type_filter'] = coerce_type_filter(data)
    # The range is checked against what the rule will END UP with, not just what
    # this request carries, so lowering one bound past the stored other is caught.
    _reject_inverted_range(fields.get('amount_min', rule.amount_min),
                           fields.get('amount_max', rule.amount_max))
    return fields
