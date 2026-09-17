"""Every act declares where it can be earned, and registration enforces it.

*** THIS GATE EXISTS BECAUSE THE FAILURE IS SILENT. *** An act with no surface
never fires a refresh: `CoinAward` renders nothing, no error is raised, and the
04:30 cron still pays the coins -- so it looks like it works. That is D-187's
shape (a reader with no writer) inside the mechanism built to fix D-187.
"""
from decimal import Decimal

from src.services.literacy.acts import (ACTS, SURFACES, Act, register_act,
                                        surface_acts)


def _act(slug, surfaces):
    return Act(slug, 'T', 100, lambda uid: Decimal(1), lambda uid: None,
               surfaces=surfaces)


def test_every_registered_act_declares_at_least_one_surface():
    assert ACTS, 'the registry is empty — the import-time registration broke'
    for slug, act in ACTS.items():
        assert act.surfaces, f'{slug} declares no surface'


def test_every_declared_surface_is_a_known_one():
    for slug, act in ACTS.items():
        for s in act.surfaces:
            assert s in SURFACES, f'{slug} names unknown surface {s!r}'


def test_an_act_with_no_surface_is_refused():
    before = dict(ACTS)
    register_act(_act('probe_no_surface', ()))
    assert 'probe_no_surface' not in ACTS
    assert ACTS == before


def test_an_act_naming_an_unknown_surface_is_refused():
    before = dict(ACTS)
    register_act(_act('probe_bad_surface', ('tea_room',)))
    assert 'probe_bad_surface' not in ACTS
    assert ACTS == before


def test_surface_acts_is_derived_and_finds_the_real_ones():
    slugs = {a.slug for a in surface_acts('transactions')}
    assert 'transactions_categorised' in slugs
    # An act that lives elsewhere must NOT appear.
    assert 'has_a_goal' not in slugs


def test_an_act_on_two_surfaces_appears_under_both():
    """`accounts_confirmed` is worked on Accounts AND on Review."""
    assert 'accounts_confirmed' in {a.slug for a in surface_acts('accounts')}
    assert 'accounts_confirmed' in {a.slug for a in surface_acts('review')}
