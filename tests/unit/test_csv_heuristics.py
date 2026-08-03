"""Unit tests for heuristic CSV column detection."""
from src.services.csv_import.heuristics import detect


def rows(*tuples, headers):
    return [dict(zip(headers, t)) for t in tuples]


def test_detects_a_simple_single_amount_file():
    headers = ['Date', 'Description', 'Amount']
    d = detect(headers, rows(
        ('2026-01-15', 'Coffee Shop', '-4.50'),
        ('2026-01-16', 'Paycheck', '2000.00'),
        headers=headers))
    assert d.mapping['date'] == 'Date'
    assert d.mapping['description'] == 'Description'
    assert d.mapping['amount'] == 'Amount'
    assert d.date_format == '%Y-%m-%d'
    assert d.confidence == 1.0


def test_detects_us_slash_dates():
    headers = ['Posting Date', 'Payee', 'Amt']
    d = detect(headers, rows(
        ('01/15/2026', 'Store', '-9.99'),
        ('02/20/2026', 'Shop', '-1.00'),
        headers=headers))
    assert d.date_format == '%m/%d/%Y'


def test_detects_day_first_dates_when_a_day_exceeds_twelve():
    headers = ['Date', 'Payee', 'Amt']
    d = detect(headers, rows(
        ('25/01/2026', 'Store', '-9.99'),
        ('13/02/2026', 'Shop', '-1.00'),
        headers=headers))
    assert d.date_format == '%d/%m/%Y'


def test_flags_an_ambiguous_date_as_assumed():
    headers = ['Date', 'Payee', 'Amt']
    d = detect(headers, rows(
        ('01/02/2026', 'Store', '-9.99'),
        headers=headers))
    assert 'date_format' in d.assumed


def test_detects_a_debit_credit_pair():
    headers = ['Date', 'Description', 'Debit', 'Credit']
    d = detect(headers, rows(
        ('2026-01-15', 'Coffee', '4.50', ''),
        ('2026-01-16', 'Pay', '', '2000.00'),
        headers=headers))
    assert d.mapping['amount'] == 'Debit'
    assert d.sign_convention == 'positive_is_expense'


def test_handles_parenthesised_negatives():
    headers = ['Date', 'Description', 'Amount']
    d = detect(headers, rows(
        ('2026-01-15', 'Coffee', '(4.50)'),
        headers=headers))
    assert d.mapping['amount'] == 'Amount'


def test_picks_the_longest_text_column_as_description():
    headers = ['Date', 'Ref', 'Narrative', 'Amount']
    d = detect(headers, rows(
        ('2026-01-15', 'A1', 'CARD PURCHASE AT COFFEE SHOP LONDON', '-4.50'),
        ('2026-01-16', 'B2', 'DIRECT DEBIT UTILITIES COMPANY LTD', '-80.00'),
        headers=headers))
    assert d.mapping['description'] == 'Narrative'


def test_does_not_mistake_a_reference_column_for_the_amount():
    """A ref column like A1/B2 must not be chosen as the amount column.

    parse_amount strips non-numeric characters, so parse_amount('A1') == 1.0.
    That is fine for parsing a column already known to hold money, but as a
    column *classifier* it is far too permissive: 'Ref' scored as fully numeric
    and, appearing before 'Amount' in the header, was selected as the amount
    column — silently importing reference numbers as transaction values.
    """
    headers = ['Date', 'Ref', 'Narrative', 'Amount']
    d = detect(headers, rows(
        ('2026-01-15', 'A1', 'CARD PURCHASE AT COFFEE SHOP LONDON', '-4.50'),
        ('2026-01-16', 'B2', 'DIRECT DEBIT UTILITIES COMPANY LTD', '-80.00'),
        headers=headers))
    assert d.mapping['amount'] == 'Amount'


def test_returns_none_without_a_date_column():
    headers = ['Description', 'Amount']
    assert detect(headers, rows(('Coffee', '-4.50'), headers=headers)) is None


def test_returns_none_without_an_amount_column():
    headers = ['Date', 'Description']
    assert detect(headers, rows(('2026-01-15', 'Coffee'), headers=headers)) is None


def test_confidence_drops_when_rows_do_not_parse():
    """A mostly-good file with a few bad rows is low-confidence, not unmappable.

    The plan's version of this test used one good row and one entirely garbage
    row. That makes the date column score 0.5, which trips the deliberate
    `score < 0.8` guard in _find_date_column, so detect() correctly returns None
    and the assertion blows up on NoneType. The guard is right — a column where
    half the values are not dates is not a date column — so the fix is realistic
    data: a confident date column with one malformed amount, which is what a real
    bank export looks like when it has a bad row.
    """
    headers = ['Date', 'Description', 'Amount']
    d = detect(headers, rows(
        ('2026-01-15', 'Coffee', '-4.50'),
        ('2026-01-16', 'Shop', '-1.00'),
        ('2026-01-17', 'Store', '-2.00'),
        ('2026-01-18', 'Mall', '-3.00'),
        ('2026-01-19', 'Broken', 'nope'),
        headers=headers))
    assert d is not None
    assert 0.0 < d.confidence < 1.0


def test_half_garbage_date_column_is_unmappable():
    """The other side of the same guard: that really is unmappable, not low-confidence."""
    headers = ['Date', 'Description', 'Amount']
    assert detect(headers, rows(
        ('2026-01-15', 'Coffee', '-4.50'),
        ('garbage', 'Broken', 'nope'),
        headers=headers)) is None
