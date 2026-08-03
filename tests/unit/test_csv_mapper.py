"""Unit tests for the shared CSV row mapper."""
import pytest

from src.services.csv_import.mapper import (
    Mapping, MapperConfig, map_row, parse_amount, import_rows,
)
from tests.factories import UserFactory

MAPPING = Mapping(date='Date', description='Description', amount='Amount')


@pytest.mark.parametrize('raw,expected', [
    ('-4.50', -4.50),
    ('$1,234.56', 1234.56),
    ('(25.00)', -25.00),
    ('  12.00  ', 12.00),
    ('1.234,56', 1234.56),
])
def test_parse_amount_handles_real_world_formats(raw, expected):
    assert parse_amount(raw) == pytest.approx(expected)


def test_parse_amount_rejects_junk():
    with pytest.raises(ValueError):
        parse_amount('abc')


def test_map_row_builds_an_expense(db):
    user = UserFactory()
    result = map_row(
        {'Date': '2026-01-15', 'Description': 'Coffee', 'Amount': '-4.50'},
        MAPPING, MapperConfig(), user.id,
    )
    assert result.error is None
    assert result.expense.description == 'Coffee'
    assert result.expense.amount == 4.50
    assert result.expense.transaction_type == 'expense'
    assert result.expense.card_used == ''
    assert result.expense.split_method == 'equal'


def test_map_row_marks_income_for_positive_amounts(db):
    user = UserFactory()
    result = map_row(
        {'Date': '2026-01-15', 'Description': 'Pay', 'Amount': '2000.00'},
        MAPPING, MapperConfig(), user.id,
    )
    assert result.expense.transaction_type == 'income'


def test_map_row_reports_a_bad_date(db):
    user = UserFactory()
    result = map_row(
        {'Date': 'nope', 'Description': 'X', 'Amount': '1.00'},
        MAPPING, MapperConfig(), user.id,
    )
    assert result.expense is None
    assert 'date' in result.error.lower()


def test_import_rows_counts_outcomes(db):
    user = UserFactory()
    rows = [
        {'Date': '2026-01-15', 'Description': 'A', 'Amount': '-1.00'},
        {'Date': 'bad', 'Description': 'B', 'Amount': '-2.00'},
    ]
    result = import_rows(rows, MAPPING, MapperConfig(), user.id)
    assert result.imported == 1
    assert result.errors == 1
    assert len(result.error_details) == 1


@pytest.mark.xfail(
    reason='Expense.import_batch_id column is added in Task 6; until then the '
           'attribute does not exist and raises AttributeError rather than '
           'returning None. Flips to XPASS once the column lands.',
    strict=False,
)
def test_import_rows_stamps_batch_id(db):
    user = UserFactory()
    rows = [{'Date': '2026-01-15', 'Description': 'A', 'Amount': '-1.00'}]
    import_rows(rows, MAPPING, MapperConfig(), user.id, batch_id=None)
    from src.models.transaction import Expense
    assert Expense.query.filter_by(user_id=user.id).one().import_batch_id is None
