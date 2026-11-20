"""Compare the two payoff methods (core's engine): `debt_compare.compare_methods`."""
from decimal import Decimal as D

import pytest

from src.services.goal.debt_compare import OwedDebt, compare_methods
from src.services.goal.projection import months_to_clear


def test_two_debts_worked_by_hand():
    # A: 300 at 12% (1% a month), B: 400 at 24% (2% a month), 50 minimum each, 300 a month in all.
    out = compare_methods([OwedDebt(1, D('300'), D('12'), D('50')), OwedDebt(2, D('400'), D('24'), D('50'))], D('300'))
    # Highest rate first (B). Month 1: 3.00 + 8.00 interest, minimums, 200 more to B: A 253, B 158.
    # Month 2: 2.53 + 3.16; B clears and 88.84 goes on to A: 116.69. Month 3: 1.17 interest; A clears.
    assert out['avalanche'] == {'months': 3, 'interest_total': D('17.86'), 'first': 2, 'never': False}
    # Smallest balance first (A). Month 1: 11.00: A 53, B 358. Month 2: 0.53 + 7.16; A clears, 196.47 to B: 118.69.
    # Month 3: 2.37; B clears.
    assert out['snowball'] == {'months': 3, 'interest_total': D('21.06'), 'first': 1, 'never': False}


def test_never_when_the_amount_does_not_beat_the_interest():
    out = compare_methods([OwedDebt(1, D('10000'), D('24')), OwedDebt(2, D('500'), D('10'))], D('150'))
    for m in ('avalanche', 'snowball'):
        assert out[m] == {'months': None, 'interest_total': None, 'first': out[m]['first'], 'never': True}


@pytest.mark.parametrize('given', [[5, 3], [3, 5]])
def test_ties_start_on_the_same_debt_in_any_input_order(given):
    debts = {i: OwedDebt(i, D('1000'), D('18'), D('30')) for i in (3, 5)}
    out = compare_methods([debts[i] for i in given], D('200'))
    assert out['avalanche']['first'] == 3 and out['snowball']['first'] == 3


@pytest.mark.parametrize('owed,apr,pay', [
    ('1000', '18', '100'), ('800', '19.99', '35'), ('2500', '7', '90'), ('1200', '0', '100'), ('5000', '24', '250'),
])
def test_one_debt_matches_months_to_clear(owed, apr, pay):
    out = compare_methods([OwedDebt(1, D(owed), D(apr))], D(pay))
    assert out['avalanche']['months'] == out['snowball']['months'] == months_to_clear(D(owed), D(apr), D(pay)).months


def test_one_debt_never_matches_months_to_clear():
    assert months_to_clear(D('10000'), D('24'), D('150')).never is True
    assert compare_methods([OwedDebt(1, D('10000'), D('24'))], D('150'))['snowball']['never'] is True


def test_alex_figures():
    # The demo's Alex (premium :8900 debt view, 2026-11-20): the same debts and $250 give the same figures here.
    debts = [OwedDebt(101, D('800'), D('19.99'), D('35')), OwedDebt(109, D('14500'), D('4.5')),
             OwedDebt(110, D('350'), D('0'), D('25'))]
    out = compare_methods(debts, D('250'))
    assert (out['avalanche']['months'], out['avalanche']['interest_total'], out['avalanche']['first']) == (72, D('2239.89'), 101)
    assert (out['snowball']['months'], out['snowball']['interest_total'], out['snowball']['first']) == (72, D('2266.40'), 110)
