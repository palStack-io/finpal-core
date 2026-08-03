"""
Unit tests for pointsPal category map.

Tests: known mappings, case insensitivity, whitespace stripping,
unknown categories default to 'other', empty string fallback.
"""

import pytest
from src.modules.pointspal.category_map import (
    finpal_category_to_slug,
    FINPAL_TO_POINTSPAL,
    VALID_SLUGS,
)


def test_groceries_maps_correctly():
    assert finpal_category_to_slug('groceries') == 'groceries'


def test_dining_maps_correctly():
    assert finpal_category_to_slug('dining') == 'dining'


def test_gas_maps_correctly():
    assert finpal_category_to_slug('gas') == 'gas'


def test_travel_maps_correctly():
    assert finpal_category_to_slug('travel') == 'travel_portal'


def test_flights_maps_correctly():
    assert finpal_category_to_slug('flights') == 'flights_direct'


def test_hotels_maps_correctly():
    assert finpal_category_to_slug('hotels') == 'hotels_direct'


def test_unknown_category_defaults_to_other():
    assert finpal_category_to_slug('unicorns') == 'other'


def test_empty_string_defaults_to_other():
    assert finpal_category_to_slug('') == 'other'


def test_none_defaults_to_other():
    assert finpal_category_to_slug(None) == 'other'


def test_case_insensitive():
    assert finpal_category_to_slug('GROCERIES') == 'groceries'
    assert finpal_category_to_slug('Dining') == 'dining'


def test_whitespace_stripped():
    assert finpal_category_to_slug('  gas  ') == 'gas'


def test_all_mapped_slugs_are_valid():
    """Every value in FINPAL_TO_POINTSPAL must be a valid slug."""
    for key, slug in FINPAL_TO_POINTSPAL.items():
        assert slug in VALID_SLUGS, f"'{key}' maps to invalid slug '{slug}'"
