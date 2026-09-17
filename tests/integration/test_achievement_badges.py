"""Achievement badges: outcomes, made safe by three properties.

*** THE OWNER ASKED FOR BADGES ON OUTCOMES, WHICH §14.1 EXCLUDES FROM
EARNING. *** "pay all of their debt or accomplish a goal or stayed onbudget for
continuosly". Paying off debt and finishing a goal lean heavily on income, so
paying COINS for them would let a high earner out-climb a careful low earner —
the brief's own failure mode, and the reason DTI was refused for Everest.

The three properties that make them safe are each tested here, and each has a
sabotage:

1. They pay badges ONLY. No coins, no altitude.
2. They are recorded once and NEVER re-evaluated, so borrowing again cannot
   take one back (decision 1).
3. An unearned badge is ABSENT from the payload, never present-and-false, so no
   client can render a locked grid (decision 5).
"""
from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.act_event import BadgeEarned
from src.models.goal import Goal
from src.services.literacy import badges
from tests.factories import AccountFactory, UserFactory

USER = 'badges@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Badges', password_plain='testpassword')
    _db.session.commit()
    return u


# ══════════════════════════════════════════════════════════════════════
# debt-free
# ══════════════════════════════════════════════════════════════════════

def test_a_user_with_no_debt_at_all_does_NOT_get_debt_free(owner):
    """*** NOT A REWARD FOR A CIRCUMSTANCE. *** Somebody who never had a card
    has not cleared anything, so the badge is absent rather than handed over."""
    assert badges._has_cleared_all_debt(owner.id) is False

    awarded = badges.award_badges(owner.id)
    _db.session.commit()
    assert 'debt-free' not in awarded


def test_outstanding_debt_earns_nothing(owner):
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=-500.0)
    _db.session.commit()

    awarded = badges.award_badges(owner.id)
    _db.session.commit()
    assert 'debt-free' not in awarded


def test_clearing_every_debt_earns_it(owner):
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=0.0)
    _db.session.commit()

    awarded = badges.award_badges(owner.id)
    _db.session.commit()
    assert 'debt-free' in awarded


def test_BORROWING_AGAIN_DOES_NOT_TAKE_THE_BADGE_BACK(owner):
    """*** DECISION 1, AND THE REASON THIS IS A TABLE AND NOT A PREDICATE. ***

    A live check would revoke the badge the moment the user opened a new card.
    Nothing earned can ever be taken away, so the badge is an EVENT.
    """
    acct = AccountFactory(user_id=owner.id, name='Visa', type='credit',
                          balance=0.0)
    _db.session.commit()
    badges.award_badges(owner.id)
    _db.session.commit()

    # They borrow again.
    acct.balance = -900.0
    _db.session.commit()

    held = {b['slug'] for b in badges.earned_badges(owner.id)}
    assert 'debt-free' in held, 'the badge was revoked when they borrowed again'


# ══════════════════════════════════════════════════════════════════════
# goal-reached
# ══════════════════════════════════════════════════════════════════════

def test_an_active_goal_earns_nothing(owner):
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='active'))
    _db.session.commit()
    assert 'goal-reached' not in badges.award_badges(owner.id)


def test_an_achieved_goal_earns_it(owner):
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='achieved',
                         achieved_at=datetime.utcnow()))
    _db.session.commit()

    awarded = badges.award_badges(owner.id)
    _db.session.commit()
    assert 'goal-reached' in awarded


# ══════════════════════════════════════════════════════════════════════
# the streak — the BEST run, never the current
# ══════════════════════════════════════════════════════════════════════

def test_the_streak_keeps_the_BEST_RUN_not_the_current_one(owner, monkeypatch):
    """*** PARKED DECISION 4, AND IT IS WHY A BAD MONTH COSTS NOTHING. ***

    A visible current streak deletes something the user earned the month it
    breaks. Here: four good months, then one bad, then one good. The current
    run is 1. The best is 4, and that is what counts.
    """
    pattern = [True, False, True, True, True, True]   # newest first
    calls = iter(pattern)
    monkeypatch.setattr(badges, '_within_budget',
                        lambda _u, _y, _m: next(calls, None))

    assert badges.best_on_budget_run(owner.id) == 4


def test_a_month_with_NO_BUDGET_breaks_the_run_without_failing_it(
        owner, monkeypatch):
    """`None` is not the same as over budget: there was nothing to adhere to."""
    pattern = [True, True, None, True, True, True]
    calls = iter(pattern)
    monkeypatch.setattr(badges, '_within_budget',
                        lambda _u, _y, _m: next(calls, None))

    # The run either side is 2 and 3; nothing is scored against them.
    assert badges.best_on_budget_run(owner.id) == 3


def test_the_streak_badges_cut_at_three_six_and_twelve(owner, monkeypatch):
    monkeypatch.setattr(badges, 'best_on_budget_run', lambda _u: 6)
    awarded = badges.award_badges(owner.id)
    _db.session.commit()

    assert 'on-budget-3' in awarded
    assert 'on-budget-6' in awarded
    assert 'on-budget-12' not in awarded


def test_the_current_month_is_excluded_from_the_streak(owner):
    """*** NOT AN OFF-BY-ONE. *** On the 3rd, rent has landed and groceries
    have not, so a part-month reads as wildly under budget and would hand out a
    streak nobody earned."""
    from datetime import date
    months = badges._previous_months(3)
    today = date.today()
    assert (today.year, today.month) not in months
    assert len(months) == 3


# ══════════════════════════════════════════════════════════════════════
# the three safety properties, on the wire
# ══════════════════════════════════════════════════════════════════════

def test_UNEARNED_BADGES_ARE_ABSENT_not_present_and_false(
        owner, auth_headers, client):
    """*** DECISION 5. *** A locked grid saying "you have not paid your debt" is
    the report card this whole design forbids."""
    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert body['badges'] == []
    # And nothing in the payload enumerates the unearned ones.
    assert 'debt-free' not in str(body)


def test_a_BADGE_PAYS_NO_COINS_AND_NO_ALTITUDE(owner, auth_headers, client):
    """*** OWNER DECISION 2026-09-17, AND THE ONE THAT PROTECTS THE BRIEF. ***

    If clearing debt paid coins or altitude, a high earner would out-climb a
    careful low earner — which is exactly why debt-to-income was refused for
    Everest.
    """
    h = auth_headers(owner)
    before = client.get('/api/v1/coins', headers=h).get_json()

    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=0.0)
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='achieved',
                         achieved_at=datetime.utcnow()))
    _db.session.commit()

    # *** THROUGH THE ROUTE, NOT THE SERVICE. *** A first version of this test
    # called `award_badges` directly, and a sabotage that made the REFRESH
    # HANDLER pay 500 coins per badge passed it — the assertion never touched
    # the wiring where the risk actually lives. Third time tonight that a
    # sabotage found a hole in a test rather than in the code.
    #
    # `/refresh` is also the real path: it awards acts AND checks badges, so if
    # anything there ever pays a badge into the economy, this goes red.
    res = client.post('/api/v1/coins/refresh', json={'surface': 'goals'},
                      headers=h)
    assert res.status_code == 200, res.get_json()

    after = client.get('/api/v1/coins', headers=h).get_json()

    assert len(after['badges']) >= 2, 'no badge was earned — the test is vacuous'

    # *** THE COMPARISON IS AGAINST THE ACTS, NOT AGAINST ZERO. *** `has_a_goal`
    # legitimately pays coins on this refresh, so the assertion is that the
    # coin total equals exactly what the ACTS reported — leaving no room for a
    # badge to have added anything.
    from src.services.literacy.acts import ACTS
    from src.repositories.coins import CoinRepository
    _db.session.rollback()
    act_coins = sum(int(r.coins) for r in CoinRepository().awards(owner.id)
                    if r.act_slug in ACTS)
    assert after['earned'] == act_coins, (
        f"earned {after['earned']} but the acts only account for {act_coins} — "
        f'something paid coins that is not an act, and badges are the suspect')

    # And a badge slug must never appear in the coin ledger at all.
    ledger = {r.act_slug for r in CoinRepository().awards(owner.id)}
    assert not (ledger & set(badges.BADGES)), (
        f'badge slugs are in the coin ledger: {ledger & set(badges.BADGES)}')


def test_the_wallet_reports_a_badge_with_its_title(owner, auth_headers, client):
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=0.0)
    _db.session.commit()
    badges.award_badges(owner.id)
    _db.session.commit()

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    got = {b['slug']: b for b in body['badges']}
    assert 'debt-free' in got
    assert got['debt-free']['title'] == 'Debt clear'
    assert got['debt-free']['earned_at']


def test_awarding_twice_does_not_duplicate(owner):
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=0.0)
    _db.session.commit()

    badges.award_badges(owner.id)
    _db.session.commit()
    second = badges.award_badges(owner.id)
    _db.session.commit()

    assert second == []
    assert BadgeEarned.query.filter_by(
        user_id=owner.id, slug='debt-free').count() == 1


def test_one_broken_predicate_does_not_cost_the_others(owner, monkeypatch):
    """Same failure isolation as award_for_user: a predicate that raises is a
    bug, not a verdict."""
    def boom(_uid):
        raise RuntimeError('deliberate')

    monkeypatch.setitem(badges.BADGES, 'debt-free', ('Debt clear', boom))
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='achieved',
                         achieved_at=datetime.utcnow()))
    _db.session.commit()

    awarded = badges.award_badges(owner.id)
    _db.session.commit()
    assert 'goal-reached' in awarded


def test_badges_do_not_commit(owner):
    """The caller owns the transaction, matching upsert_award, ack and record."""
    AccountFactory(user_id=owner.id, name='Visa', type='credit', balance=0.0)
    _db.session.commit()

    badges.award_badges(owner.id)
    _db.session.rollback()
    assert BadgeEarned.query.filter_by(user_id=owner.id).count() == 0
