"""Unit tests for CSV header fingerprinting."""
from src.services.csv_import.fingerprint import (
    fingerprint_headers, find_profile, save_profile,
)
from tests.factories import UserFactory


def test_fingerprint_is_stable_and_64_chars():
    fp = fingerprint_headers(['Date', 'Description', 'Amount'])
    assert len(fp) == 64
    assert fp == fingerprint_headers(['Date', 'Description', 'Amount'])


def test_fingerprint_ignores_case_whitespace_and_bom():
    a = fingerprint_headers(['Date', 'Description', 'Amount'])
    # ﻿ is a BOM, which shows up as the first character of many bank exports.
    b = fingerprint_headers(['﻿date ', ' DESCRIPTION', 'amount'])
    assert a == b


def test_fingerprint_is_order_sensitive():
    a = fingerprint_headers(['Date', 'Amount'])
    b = fingerprint_headers(['Amount', 'Date'])
    assert a != b


def test_fingerprint_distinguishes_different_headers():
    a = fingerprint_headers(['Date', 'Description', 'Amount'])
    b = fingerprint_headers(['Posting Date', 'Payee', 'Debit'])
    assert a != b


def test_save_then_find_round_trip(db):
    user = UserFactory()
    headers = ['Posting Date', 'Payee', 'Debit']
    saved = save_profile(headers, {'date': 'Posting Date', 'description': 'Payee',
                                   'amount': 'Debit'},
                         user.id, name='Chase', date_format='%m/%d/%Y',
                         sign_convention='negative_is_expense', origin='manual')
    found = find_profile(headers, user.id)
    assert found is not None
    assert found.id == saved.id
    assert found.mapping['description'] == 'Payee'


def test_find_profile_misses_unknown_headers(db):
    user = UserFactory()
    assert find_profile(['Totally', 'Different'], user.id) is None


def test_save_profile_updates_an_existing_fingerprint(db):
    user = UserFactory()
    headers = ['Date', 'Desc', 'Amt']
    first = save_profile(headers, {'date': 'Date', 'description': 'Desc',
                                   'amount': 'Amt'},
                         user.id, name='V1', date_format='%Y-%m-%d',
                         sign_convention='negative_is_expense', origin='heuristic')
    second = save_profile(headers, {'date': 'Date', 'description': 'Desc',
                                    'amount': 'Amt'},
                          user.id, name='V2', date_format='%m/%d/%Y',
                          sign_convention='positive_is_expense', origin='manual')
    assert first.id == second.id
    assert second.origin == 'manual'
    assert second.date_format == '%m/%d/%Y'
