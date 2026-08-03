"""Infer a column mapping for a CSV whose header we have never seen.

Used only as a fallback after fingerprint lookup misses. Deliberately refuses to
guess when it cannot find a date or an amount column — see the spec's
"Low confidence and unmappable are different outcomes".
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from src.services.csv_import.mapper import parse_amount

CANDIDATE_DATE_FORMATS = [
    '%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%m/%d/%Y', '%d/%m/%Y',
    '%d.%m.%Y', '%b %d, %Y', '%d %b %Y', '%Y-%m-%d %H:%M:%S',
]
_SLASH_AMBIGUOUS = {'%m/%d/%Y': '%d/%m/%Y', '%d/%m/%Y': '%m/%d/%Y'}
_DEBIT_HINTS = ('debit', 'withdrawal', 'paid out', 'money out')
_CREDIT_HINTS = ('credit', 'deposit', 'paid in', 'money in')


@dataclass
class Detected:
    mapping: dict
    date_format: str
    sign_convention: str
    confidence: float
    assumed: list[str] = field(default_factory=list)


def _values(rows, column):
    return [(r.get(column) or '').strip() for r in rows
            if (r.get(column) or '').strip()]


def _date_score(values, fmt):
    if not values:
        return 0.0
    ok = 0
    for v in values:
        try:
            datetime.strptime(v, fmt)
            ok += 1
        except ValueError:
            pass
    return ok / len(values)


def _find_date_column(headers, rows):
    """Return (column, format, ambiguous)."""
    best = (None, None, 0.0)
    for column in headers:
        values = _values(rows, column)
        for fmt in CANDIDATE_DATE_FORMATS:
            score = _date_score(values, fmt)
            if score > best[2]:
                best = (column, fmt, score)
    column, fmt, score = best
    if column is None or score < 0.8:
        return None, None, False

    ambiguous = False
    if fmt in _SLASH_AMBIGUOUS:
        # A first component >12 can only be a day.
        first_parts = [v.split('/')[0] for v in _values(rows, column)
                       if '/' in v]
        day_first = any(p.isdigit() and int(p) > 12 for p in first_parts)
        if day_first:
            fmt = '%d/%m/%Y'
        else:
            ambiguous = True
    return column, fmt, ambiguous


_HAS_LETTER = re.compile(r'[A-Za-z]')


def _looks_numeric(value: str) -> bool:
    """Whether a value plausibly holds money, for column classification.

    parse_amount strips non-numeric characters before converting, so
    parse_amount('A1') == 1.0. That is the right behaviour when parsing a column
    already known to hold money, but far too permissive for deciding *which*
    column that is: a reference column of A1/B2 scored as fully numeric and could
    be selected as the amount column, silently importing reference numbers as
    transaction values. Requiring no letters keeps '$1,234.56', '(25.00)' and
    '1.234,56' while rejecting identifiers.
    """
    if _HAS_LETTER.search(value):
        return False
    try:
        parse_amount(value)
        return True
    except ValueError:
        return False


def _numeric_score(values):
    if not values:
        return 0.0
    return sum(1 for v in values if _looks_numeric(v)) / len(values)


def _find_amount(headers, rows, date_column):
    """Return (column, sign_convention)."""
    numeric = []
    for column in headers:
        if column == date_column:
            continue
        values = _values(rows, column)
        if values and _numeric_score(values) >= 0.8:
            numeric.append(column)
    if not numeric:
        return None, None

    lowered = {c: c.lower() for c in numeric}
    debit = next((c for c in numeric
                  if any(h in lowered[c] for h in _DEBIT_HINTS)), None)
    credit = next((c for c in numeric
                   if any(h in lowered[c] for h in _CREDIT_HINTS)), None)
    if debit and credit:
        # Debit/credit pair: the debit column holds positive expense amounts.
        return debit, 'positive_is_expense'

    return numeric[0], 'negative_is_expense'


def _find_description(headers, rows, exclude):
    best, best_len = None, -1.0
    for column in headers:
        if column in exclude:
            continue
        values = _values(rows, column)
        if not values:
            continue
        if _numeric_score(values) >= 0.8:
            continue
        mean_len = sum(len(v) for v in values) / len(values)
        if mean_len > best_len:
            best, best_len = column, mean_len
    return best


def detect(headers, sample_rows) -> Detected | None:
    if not headers or not sample_rows:
        return None

    date_column, date_format, ambiguous = _find_date_column(headers, sample_rows)
    if not date_column:
        return None

    amount_column, sign_convention = _find_amount(headers, sample_rows, date_column)
    if not amount_column:
        return None

    description = _find_description(
        headers, sample_rows, exclude={date_column, amount_column})
    if not description:
        return None

    parsed = 0
    for row in sample_rows:
        try:
            datetime.strptime((row.get(date_column) or '').strip(), date_format)
            parse_amount((row.get(amount_column) or '').strip())
            parsed += 1
        except (ValueError, TypeError):
            pass
    confidence = parsed / len(sample_rows)

    assumed = []
    if ambiguous:
        assumed.append('date_format')

    return Detected(
        mapping={'date': date_column, 'description': description,
                 'amount': amount_column},
        date_format=date_format,
        sign_convention=sign_convention,
        confidence=confidence,
        assumed=assumed,
    )
