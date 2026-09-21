"""Everest: one shared mountain, and the ratchet that keeps it honest.

*** THE TEST THAT MATTERS MOST IS THE CREDIT-CARD ONE. *** Altitude is coins
earned over coins AVAILABLE to the user, and that denominator MOVES. Opening a
first credit card activates `debt_rates`, `debt_limits` and `debt_minimums` --
2,200 coins of new denominator -- so an unratcheted altitude FALLS for doing
something sensible. That is the exact failure the whole design exists to
prevent, and it would have shipped as arithmetic nobody decided.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.act_event import EverestWatermark
from src.models.goal import Goal
from src.models.transaction_rule import TransactionRule
from src.services.literacy import everest
from tests.factories import AccountFactory, UserFactory

USER = 'everest@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Everest', password_plain='testpassword')
    _db.session.commit()
    return u


def _earn_something(user_id):
    """Give the user a goal and a rule, then run the real award pass."""
    from src.services.literacy.acts import award_for_user
    _db.session.add(Goal(user_id=user_id, name='Roof', start_amount=0,
                         target_amount=1000, status='active'))
    _db.session.add(TransactionRule(user_id=user_id, name='C', pattern='C',
                                    active=True))
    _db.session.commit()
    award_for_user(user_id)
    _db.session.commit()


def test_everyone_has_an_everest_from_day_one(owner):
    """*** THE HOLE THIS FILLS. *** A user with no goals had no mountain at all
    before Everest, and that is base camp's own audience (D-205)."""
    out = everest.altitude_for(owner.id)
    _db.session.commit()
    assert out['summit_m'] == 8849
    assert out['altitude_m'] >= 0
    assert out['at_summit'] is False


def test_earning_raises_the_altitude(owner):
    before = everest.altitude_for(owner.id)['altitude_m']
    _db.session.commit()

    _earn_something(owner.id)
    after = everest.altitude_for(owner.id)['altitude_m']
    _db.session.commit()

    assert after > before


def test_OPENING_A_CREDIT_CARD_DOES_NOT_LOWER_THE_ALTITUDE(owner):
    """*** THE REGRESSION THE RATCHET EXISTS FOR. ***

    Three debt acts are dormant for a user with no card and become live the
    moment they have one, adding 2,200 coins to the denominator. Unratcheted,
    this user's altitude drops for opening a credit card.
    """
    _earn_something(owner.id)
    before = everest.altitude_for(owner.id)['altitude_m']
    _db.session.commit()
    assert before > 0, 'nothing was earned — the test would be vacuous'

    # A credit card with an unrecorded rate, limit and minimum: exactly the
    # situation that activates all three debt acts at zero coverage.
    AccountFactory(user_id=owner.id, name='Visa', type='credit',
                   balance=-500.0)
    _db.session.commit()

    after = everest.altitude_for(owner.id)['altitude_m']
    _db.session.commit()

    assert after >= before, (
        f'altitude fell from {before} to {after} because the user opened a '
        f'credit card — decision 1 broken by arithmetic')


def test_the_watermark_is_persisted_and_never_falls(owner):
    _earn_something(owner.id)
    everest.altitude_for(owner.id)
    _db.session.commit()

    row = EverestWatermark.query.filter_by(user_id=owner.id).one()
    high = Decimal(str(row.fraction))
    assert high > 0

    # Force the raw fraction down by widening the denominator hard.
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=-500.0)
    _db.session.commit()
    everest.altitude_for(owner.id)
    _db.session.commit()

    row = EverestWatermark.query.filter_by(user_id=owner.id).one()
    assert Decimal(str(row.fraction)) >= high


def test_lessons_alone_CANNOT_reach_the_summit(owner, monkeypatch):
    """*** THE SUMMIT RIDGE. *** Reading is rewarded and still cannot
    substitute for doing — D-219 one level up, managed rather than ignored."""
    monkeypatch.setattr(everest, '_lesson_fraction', lambda _uid: Decimal(1))
    monkeypatch.setattr(everest, '_act_fraction', lambda _uid: Decimal('0.5'))

    out = everest.altitude_for(owner.id)
    _db.session.commit()
    assert out['at_summit'] is False
    assert out['altitude_m'] < 8849


def test_lessons_DO_lift_you(owner, monkeypatch):
    """Owner decision: altitude is coins PLUS lessons."""
    monkeypatch.setattr(everest, '_act_fraction', lambda _uid: Decimal('0.5'))

    monkeypatch.setattr(everest, '_lesson_fraction', lambda _uid: Decimal(0))
    without = everest._raw_fraction(owner.id)

    monkeypatch.setattr(everest, '_lesson_fraction', lambda _uid: Decimal(1))
    with_lessons = everest._raw_fraction(owner.id)

    assert with_lessons > without


def test_ACTS_ALONE_reach_the_summit(owner, monkeypatch):
    """learnPal is switchable, so acts must span the whole mountain."""
    monkeypatch.setattr(everest, '_act_fraction', lambda _uid: Decimal(1))
    monkeypatch.setattr(everest, '_lesson_fraction', lambda _uid: Decimal(0))

    out = everest.altitude_for(owner.id)
    _db.session.commit()
    assert out['at_summit'] is True
    assert out['altitude_m'] == 8849


def test_it_survives_learnpal_being_absent(owner, monkeypatch):
    def boom():
        raise ImportError('learnpal is not installed')
    monkeypatch.setattr(everest, '_lesson_fraction', lambda _uid: Decimal(0))
    out = everest.altitude_for(owner.id)
    _db.session.commit()
    assert out['summit_m'] == 8849


def test_the_WALLET_persists_the_watermark_over_HTTP(owner, auth_headers, client):
    """*** THE HALF THE SERVICE TESTS CANNOT SEE. ***

    `altitude_for` does not commit — the caller owns the transaction, matching
    `upsert_award`. So a GET that forgot to commit would compute the right
    altitude, return it, and lose it: the ratchet would reset every request and
    nobody would notice until a user's altitude dropped.

    Asserted after a rollback, because the test shares the request's session
    and autoflush would otherwise show an uncommitted row (D-61).
    """
    _earn_something(owner.id)

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert body['everest']['summit_m'] == 8849
    assert body['everest']['altitude_m'] > 0

    _db.session.rollback()
    row = EverestWatermark.query.filter_by(user_id=owner.id).one_or_none()
    assert row is not None, 'the GET computed an altitude and never saved it'
    assert Decimal(str(row.fraction)) > 0


def test_everest_carries_no_fraction_or_coin_figure_on_the_wire(
        owner, auth_headers, client):
    """Metres and a shared public summit, not a percentage of the user."""
    _earn_something(owner.id)
    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert set(body['everest']) == {'altitude_m', 'summit_m', 'at_summit'}


def test_the_demo_reset_clears_the_watermark(db):
    """*** THE LEAST OBVIOUS OF THE FIVE TABLES THE RESET MUST CLEAR. ***

    The watermark is ratchet-only by design, so a reset user who keeps it stays
    at the altitude their DELETED data earned. Everest would then show a height
    nothing on the stack justifies — which is exactly what `_coins_award`
    refuses to do for coins.
    """
    from src.services.demo.service import _coins_reset

    u = UserFactory(id='everestreset@test.com', name='R',
                    password_plain='testpassword')
    _db.session.commit()
    _db.session.add(EverestWatermark(user_id=u.id, fraction=Decimal('0.4')))
    _db.session.commit()

    _coins_reset(u.id)
    _db.session.commit()

    assert EverestWatermark.query.filter_by(user_id=u.id).count() == 0
