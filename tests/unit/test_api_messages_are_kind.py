"""The API's refusals are kind and self-contained (warmth audit, voice rule 10: errors are ours, and kind).

The clients show only the sentences in `details`, never the field name, so each default marshmallow sentence has to
carry its own field and a next step. A sentence a schema wrote itself passes through untouched.
"""
import pytest

from src.utils.messages import GENERIC_ERROR
from src.utils.validation import kind_messages, validation_error_response


@pytest.mark.parametrize('raw, field, expected', [
    ('Missing data for required field.', 'amount', 'Amount is needed.'),
    ('Field may not be null.', 'split_value', 'Split value is needed.'),
    ('Not a valid number.', 'apr', 'Apr: enter a number, like 12.50.'),
    ('Not a valid email address.', 'email', "Email: that email doesn't look complete yet."),
    ('Not a valid date.', 'date', 'Date: use a date like 2026-10-19.'),
    ('Length must be between 1 and 100.', 'name', 'Name: use between 1 and 100 characters.'),
    ('Shorter than minimum length 8.', 'password', 'Password: use at least 8 characters.'),
    ('Longer than maximum length 120.', 'name', 'Name: use 120 characters or fewer.'),
    ('Must be greater than or equal to 0.', 'credit_limit', 'Credit limit: use 0 or more.'),
    ('Must be greater than or equal to 0 and less than or equal to 999.99.', 'apr', 'Apr: use a number from 0 to 999.99.'),
    ('Must be one of: weekly, monthly.', 'period', 'Period: choose one of weekly, monthly.'),
])
def test_default_sentences_become_kind_and_name_their_field(raw, field, expected):
    assert kind_messages({field: [raw]}) == {field: [expected]}


def test_a_sentence_the_schema_wrote_is_left_alone():
    sentence = 'A percentage cannot exceed 100.'
    assert kind_messages({'split_value': [sentence]}) == {'split_value': [sentence]}


def test_nested_errors_keep_their_shape_and_name_the_inner_field():
    errors = {'splits': {0: {'amount': ['Not a valid number.']}}}
    assert kind_messages(errors) == {'splits': {0: {'amount': ['Amount: enter a number, like 12.50.']}}}


def test_the_response_names_no_category_of_failure_in_cold_words():
    body, status = validation_error_response({'amount': ['Missing data for required field.']})
    assert status == 400
    assert body['error'] == 'Some of what you entered needs another look.'
    assert 'Validation error' not in str(body)


def test_the_generic_failure_blames_nobody_and_names_no_internals():
    for word in ('Internal', 'error', 'Invalid', 'token', 'tenant', 'param', 'Failed'):
        assert word.lower() not in GENERIC_ERROR.lower(), word
    assert 'Try again' in GENERIC_ERROR
