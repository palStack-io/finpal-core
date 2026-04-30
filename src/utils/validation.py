"""Request validation helpers using marshmallow schemas."""
from marshmallow import ValidationError, EXCLUDE


def validate_request(schema, data):
    """Validate incoming request data against a marshmallow schema.

    Returns (validated_data, None) on success.
    Returns (None, error_dict) on validation failure.
    Unknown fields are silently excluded.
    """
    try:
        validated = schema.load(data or {}, unknown=EXCLUDE)
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
