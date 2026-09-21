"""The ACTS registry — what pays coins, as distinct from what opens a lesson.

*** `CHECKS` AND `ACTS` ARE TWO LISTS OVER ONE IDEA, AND THAT SEPARATION IS THE
POINT. *** About half of `CHECKS` describes a user's SITUATION rather than
something they did. Paying coins for `has_two_or_more_debt_accounts` would
reward taking out a second loan, and for `has_debt_and_no_savings_goal` would
reward not having one. A fence, so it cannot happen by accident.
"""

import pytest

from src.modules.base import ModuleBase
from src.services.literacy import acts as acts_mod
from src.services.literacy.acts import ACTS, Act, register_act


@pytest.fixture(autouse=True)
def _restore_registry():
    before = dict(ACTS)
    yield
    ACTS.clear()
    ACTS.update(before)


def _stub(slug='stub_act', ceiling=100, universal=False, surfaces=('goals',)):
    # `surfaces` is REQUIRED on `Act` and has no default, deliberately: an act
    # with nowhere to fire never triggers a refresh and looks fine doing it.
    # This stub names a real surface so the registration is a valid one --
    # `test_act_surfaces.py` owns the refusal cases.
    return Act(slug=slug, title='Stub', ceiling=ceiling,
               coverage=lambda user_id: None,
               payoff=lambda user_id: None,
               surfaces=surfaces,
               universal=universal)


def test_a_registered_act_is_retrievable():
    register_act(_stub())
    assert ACTS['stub_act'].ceiling == 100


def test_a_duplicate_slug_is_REFUSED_not_overridden():
    """Same rule as register_check: a module must not be able to change what an
    existing act pays, invisibly from core."""
    first = _stub(ceiling=100)
    register_act(first)

    register_act(_stub(ceiling=99999))

    assert ACTS['stub_act'] is first


def test_base_contributes_no_acts_by_default():
    assert ModuleBase().get_acts() == {}


def test_no_act_is_a_situation_rather_than_something_the_user_DID():
    """*** THE FENCE, ASSERTED. *** These five describe circumstances. If one
    ever appears in ACTS, finPal has started paying people for being in debt."""
    situations = {
        'has_two_or_more_debt_accounts',
        'has_debt_and_no_savings_goal',
        'has_buffer_and_debt',
        'has_debt_account_and_income',
        'credit_utilisation_below',
    }
    assert situations.isdisjoint(set(ACTS)), (
        f'these are situations, not acts: {sorted(situations & set(ACTS))}. '
        'Paying for them rewards a user for their circumstances, which voice '
        'rule 11 and design decision 2 both forbid.')


def test_the_universal_acts_alone_can_afford_the_whole_kit():
    """*** SPEC S7.2, AS ONE ASSERTION. *** The debt acts, transfers and
    pointsPal's are conditional on a user's circumstances (S4.2.1). Pricing the
    kit against ceilings a debt-free user can never reach would lock them out of
    it, so the eight universal acts have to cover the whole thing on their own.
    """
    from src.services.literacy.gear import GEAR_PRICES

    universal = sum(a.ceiling for a in ACTS.values() if a.universal)
    kit = sum(GEAR_PRICES.values())

    assert universal >= kit, (
        f'the universal acts pay {universal} and the full kit costs {kit}. A '
        'user with no debt, no pointsPal and no contributions cannot finish '
        'the kit, which is the one affordability promise the design makes.')


def test_every_act_declares_a_positive_ceiling_and_a_title():
    for slug, act in ACTS.items():
        assert act.ceiling > 0, f'{slug} pays nothing'
        assert act.title, f'{slug} has no title'
        assert callable(act.coverage), f'{slug} has no coverage function'


def test_the_four_amendment_acts_are_CONDITIONAL_not_universal():
    """*** AN INVARIANT, NOT A PREFERENCE. ***

    §7.2 prices the whole kit against the UNIVERSAL acts alone, precisely so a
    user whose circumstances never raise a conditional one can still finish it.
    `holdings_priced` needs investments; `splits_confirmed` and
    `settlement_recorded` need a group; `budget_adjusted` needs a budget.
    Flipping any of them to `universal=True` would quietly make the kit
    unaffordable for a user with none of those, and the affordability test
    above would keep passing because it reads the universal set.
    """
    from src.services.literacy.acts import ACTS

    for slug in ('holdings_priced', 'splits_confirmed',
                 'settlement_recorded', 'budget_adjusted'):
        assert slug in ACTS, f'{slug} is not registered'
        assert ACTS[slug].universal is False, (
            f'{slug} is universal, so the kit is now priced against a ceiling '
            f'a user without those circumstances can never reach')
