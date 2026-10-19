"""Request validation helpers using marshmallow schemas."""
import re

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


# marshmallow's own sentences ("Missing data for required field.") say what is wrong and not what to do, and the
# clients show only the sentences (never the field name), so each one names its field and gives the next step.
# Sentences a schema wrote itself ("A percentage cannot exceed 100.") are already ours and pass through untouched.
_PATTERNS = (
    (re.compile(r'^Missing data for required field\.$'), '{field} is needed.'),
    (re.compile(r'^Field may not be null\.$'), '{field} is needed.'),
    (re.compile(r'^Not a valid (?:number|integer|float|decimal)\.$'), '{field}: enter a number, like 12.50.'),
    (re.compile(r'^Not a valid string\.$'), '{field}: enter some text.'),
    (re.compile(r'^Not a valid boolean\.$'), '{field}: choose yes or no.'),
    (re.compile(r'^Not a valid email address\.$'), "{field}: that email doesn't look complete yet."),
    (re.compile(r'^Not a valid (?:date|datetime|time)\.$'), '{field}: use a date like 2026-10-19.'),
    (re.compile(r'^Unknown field\.$'), "{field} isn't something we use."),
    (re.compile(r'^Must be greater than or equal to (.+?) and less than or equal to (.+?)\.$'), '{field}: use a number from {0} to {1}.'),
    (re.compile(r'^Must be greater than (.+?) and less than (.+?)\.$'), '{field}: use a number between {0} and {1}.'),
    (re.compile(r'^Must be greater than or equal to (.+?)\.$'), '{field}: use {0} or more.'),
    (re.compile(r'^Must be less than or equal to (.+?)\.$'), '{field}: use {0} or less.'),
    (re.compile(r'^Must be greater than (.+?)\.$'), '{field}: use more than {0}.'),
    (re.compile(r'^Must be less than (.+?)\.$'), '{field}: use less than {0}.'),
    (re.compile(r'^Length must be between (.+?) and (.+?)\.$'), '{field}: use between {0} and {1} characters.'),
    (re.compile(r'^Shorter than minimum length (.+?)\.$'), '{field}: use at least {0} characters.'),
    (re.compile(r'^Longer than maximum length (.+?)\.$'), '{field}: use {0} characters or fewer.'),
    (re.compile(r'^Must be one of: (.+?)\.$'), '{field}: choose one of {0}.'),
)


def _humanise(field):
    text = str(field).replace('_', ' ').strip()
    return text[:1].upper() + text[1:] if text else 'This'


def _kind(message, field):
    for pattern, template in _PATTERNS:
        match = pattern.match(message)
        if match:
            return template.format(*match.groups(), field=_humanise(field))
    return message


def kind_messages(errors, field=None):
    """Same shape as marshmallow's `messages`, with its default sentences made kind and self-contained."""
    if isinstance(errors, dict):
        return {key: kind_messages(value, key if not isinstance(key, int) else field) for key, value in errors.items()}
    if isinstance(errors, list):
        return [kind_messages(item, field) for item in errors]
    if isinstance(errors, str):
        return _kind(errors, field or 'This')
    return errors


def validation_error_response(errors):
    """Format a marshmallow ValidationError messages dict into an API error response."""
    return {
        'success': False,
        'error': 'Some of what you entered needs another look.',
        'details': kind_messages(errors),
    }, 400
