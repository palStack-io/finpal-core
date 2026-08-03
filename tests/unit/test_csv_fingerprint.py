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


def test_one_users_save_cannot_touch_another_users_profile(db):
    """Two users can import the same bank's CSV without colliding.

    save_profile looked a profile up by fingerprint alone, so the second user to
    map a given header shape silently overwrote the first user's mapping, name and
    date_format — a cross-tenant write. Profiles are per-user everywhere else
    (find_profile filters on user_id, /api/v1/import-profiles is per-user), so the
    uniqueness has to be per-user too.
    """
    alice = UserFactory()
    bob = UserFactory()
    headers = ['Date', 'Description', 'Amount']

    a = save_profile(headers, {'date': 'Date', 'description': 'Description',
                               'amount': 'Amount'},
                     alice.id, name='Alice Bank', date_format='%Y-%m-%d',
                     sign_convention='negative_is_expense', origin='manual')
    b = save_profile(headers, {'date': 'Date', 'description': 'Description',
                               'amount': 'Amount'},
                     bob.id, name='Bob Bank', date_format='%m/%d/%Y',
                     sign_convention='positive_is_expense', origin='heuristic')

    assert a.id != b.id, 'the second save hijacked the first user\'s profile row'
    assert b.user_id == bob.id

    alice_profile = find_profile(headers, alice.id)
    bob_profile = find_profile(headers, bob.id)
    assert alice_profile is not None and bob_profile is not None
    assert alice_profile.id == a.id
    assert bob_profile.id == b.id
    # Alice's settings must survive Bob's save untouched.
    assert alice_profile.name == 'Alice Bank'
    assert alice_profile.date_format == '%Y-%m-%d'
    assert alice_profile.origin == 'manual'


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
