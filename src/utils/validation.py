"""Request validation helpers using marshmallow schemas."""
from marshmallow import ValidationError, EXCLUDE


def validate_request(schema, data, partial=False):
    """Validate incoming request data against a marshmallow schema.

    Returns (validated_data, None) on success.
    Returns (None, error_dict) on validation failure.
    Unknown fields are silently excluded.

    `partial=True` skips the `required` checks, for PUT handlers that apply only the keys
    they were sent. Without it a schema shared with a POST refuses every partial update,
    because the create path legitimately marks fields required that an update need not
    resend. The VALUE constraints -- lengths, `OneOf`, types -- still apply, which is the
    whole point: those are what protect the columns.
    """
    try:
        validated = schema.load(data or {}, unknown=EXCLUDE, partial=partial)
        return validated, None
    except ValidationError as err:
        return None, err.messages


def validation_error_response(errors):
    """Format a marshmallow ValidationError messages dict into an API error response."""
    return {
        'success': False,
        'error': 'Validation error',
        'details': errors,
    }, 400
