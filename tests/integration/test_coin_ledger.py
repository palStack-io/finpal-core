"""The coin ledger: two tables, and a watermark that cannot fall.

*** `coins_earned` READS ONLY `coin_awards`, WHICH HAS NO DELETE PATH. *** That is
what makes design decision 1 -- *nothing earned can ever be taken away* -- a
property of the schema rather than a rule somebody has to remember. Spending
touches a different table entirely, so no purchase can reduce what you earned.

Asserted on the database, never on a return value alone.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.coins import CoinAward, CoinPurchase
from src.repositories.coins import CoinRepository
from tests.factories import UserFactory


USER = 'saver@test.com'


@pytest.fixture
def repo(db):
    UserFactory(id=USER, name='Saver')
    _db.session.commit()
    return CoinRepository()


def test_an_award_is_written_and_earned_reflects_it(repo):
    delta = repo.upsert_award(USER, 'debt_rates', Decimal('0.5'), 150)
    _db.session.commit()

    assert delta == 150
    row = CoinAward.query.filter_by(user_id=USER, act_slug='debt_rates').one()
    assert row.coins == 150
    assert row.coverage == Decimal('0.50000')
    assert repo.earned(USER) == 150


def test_raising_coverage_awards_only_the_DIFFERENCE(repo):
    repo.upsert_award(USER, 'debt_rates', Decimal('0.5'), 150)
    _db.session.commit()

    delta = repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()

    assert delta == 150, 'the second award must pay the difference, not the total'
    assert repo.earned(USER) == 300
    assert CoinAward.query.filter_by(user_id=USER).count() == 1


def test_the_same_coverage_twice_awards_NOTHING(repo):
    repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()

    assert repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300) == 0
    _db.session.commit()
    assert repo.earned(USER) == 300


def test_a_LOWER_coverage_is_refused_and_takes_nothing_back(repo):
    """*** THE RATCHET. *** A user pays a card off and a new one arrives
    unrecorded: coverage genuinely drops. Nothing may be taken back."""
    repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()

    delta = repo.upsert_award(USER, 'debt_rates', Decimal('0.25'), 75)
    _db.session.commit()

    assert delta == 0
    row = CoinAward.query.filter_by(user_id=USER, act_slug='debt_rates').one()
    assert row.coins == 300, 'coins fell'
    assert row.coverage == Decimal('1.00000'), 'the coverage watermark fell'
    assert repo.earned(USER) == 300


def test_spending_reduces_the_BALANCE_and_never_the_EARNED_TOTAL(repo):
    repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()

    assert repo.purchase(USER, 'rope', 200) is True
    _db.session.commit()

    assert repo.balance(USER) == 100
    assert repo.earned(USER) == 300, 'spending reduced the lifetime total'
    assert CoinPurchase.query.filter_by(user_id=USER, gear_slug='rope').count() == 1


def test_gear_you_cannot_afford_is_refused_and_writes_nothing(repo):
    repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()

    assert repo.purchase(USER, 'oxygen', 2400) is False
    _db.session.commit()

    assert CoinPurchase.query.filter_by(user_id=USER).count() == 0
    assert repo.balance(USER) == 300


def test_buying_the_same_piece_twice_is_refused(repo):
    repo.upsert_award(USER, 'debt_rates', Decimal('1'), 300)
    _db.session.commit()
    repo.purchase(USER, 'rope', 100)
    _db.session.commit()

    assert repo.purchase(USER, 'rope', 100) is False
    _db.session.commit()

    assert CoinPurchase.query.filter_by(user_id=USER, gear_slug='rope').count() == 1
    assert repo.balance(USER) == 200


def test_a_user_with_no_rows_at_all_reads_as_zero_not_as_an_error(repo):
    assert repo.earned('nobody@test.com') == 0
    assert repo.spent('nobody@test.com') == 0
    assert repo.balance('nobody@test.com') == 0
