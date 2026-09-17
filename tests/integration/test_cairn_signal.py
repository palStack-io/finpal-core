"""`open` and `surfaces` on the wallet: what the cairn is drawn from.

*** THE CAIRN IS BINARY AND SO IS ITS SIGNAL, WHICH IS THE WHOLE REASON THIS
IS PERMITTED. *** Decision 5 forbids a denominator the user did not choose, and
decision 8 leaves the shop price as the only one in the product. A BIT is
neither: `open` plus an earned total cannot reconstruct a ceiling, so no client
can render "14 of 35" from this payload.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.goal import Goal
from src.models.transaction_rule import TransactionRule
from tests.factories import UserFactory

USER = 'cairn@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='Cairn', password_plain='testpassword')
    _db.session.commit()
    return u


def _acts(client, headers):
    return {a['slug']: a for a in
            client.get('/api/v1/coins', headers=headers).get_json()['acts']}


def test_an_unfinished_act_is_open(owner, auth_headers, client):
    """`has_a_goal` with no goal: live, and not done."""
    acts = _acts(client, auth_headers(owner))
    assert acts['has_a_goal']['open'] is True


def test_a_finished_act_is_NOT_open(owner, auth_headers, client):
    """*** OR THE CAIRN BECOMES A PERMANENT NAG. *** A marker that never
    clears stops meaning "there is something here" and starts meaning nothing.
    """
    _db.session.add(Goal(user_id=owner.id, name='Roof', start_amount=0,
                         target_amount=1000, status='active'))
    _db.session.commit()

    acts = _acts(client, auth_headers(owner))
    assert acts['has_a_goal']['open'] is False


def test_a_dormant_act_is_ABSENT_not_open(owner, auth_headers, client):
    """A user with no investments has no `holdings_priced` row at all, so
    Investments raises no cairn — it is not a page with work waiting."""
    acts = _acts(client, auth_headers(owner))
    assert 'holdings_priced' not in acts


def test_each_act_names_its_surfaces(owner, auth_headers, client):
    acts = _acts(client, auth_headers(owner))
    assert acts['has_a_goal']['surfaces'] == ['goals']
    assert set(acts['taught_a_rule']['surfaces']) == {'rules'}


def test_an_act_on_two_surfaces_names_both(owner, auth_headers, client):
    # `accounts_confirmed` is DORMANT without an account, which is correct and
    # is why it needs one here: a dormant act is absent from the list entirely.
    from tests.factories import AccountFactory
    AccountFactory(user_id=owner.id, name='C', type='checking')
    _db.session.commit()

    acts = _acts(client, auth_headers(owner))
    assert set(acts['accounts_confirmed']['surfaces']) == {'accounts', 'review'}


def test_STILL_no_denominator_on_the_wire(owner, auth_headers, client):
    """*** THE ASSERTION THAT MATTERS MOST, AND ADDING `open` IS EXACTLY WHEN
    IT COULD HAVE SLIPPED. *** No ceiling and no coverage fraction, so no
    client can reconstruct "n of m"."""
    _db.session.add(TransactionRule(user_id=owner.id, name='C',
                                    pattern='C', active=True))
    _db.session.commit()

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert body['acts'], 'no acts — the absence check would be vacuous'
    for act in body['acts']:
        assert 'ceiling' not in act
        assert 'coverage' not in act
        assert 'total' not in act
        assert 'of' not in act
        # `open` must be a plain bool, not a number that reads as one.
        assert isinstance(act['open'], bool)


def test_a_NEVER_EARNED_act_whose_coverage_raises_is_OMITTED(
        owner, auth_headers, client, monkeypatch):
    """*** OMITTED, NOT SHOWN AS OPEN, AND THE DISTINCTION IS THE POINT. ***

    If a predicate crashes for an act the user has never earned, finPal does
    not know whether it even APPLIES to them. Raising a cairn would claim there
    is work on a page that may be irrelevant — `debt_rates` on a debt-free
    user. So the act is left out, which is the pre-existing dormancy rule.
    """
    import dataclasses

    from src.services.literacy.acts import ACTS

    def boom(_uid):
        raise RuntimeError('deliberate')

    monkeypatch.setitem(
        ACTS, 'taught_a_rule',
        dataclasses.replace(ACTS['taught_a_rule'], coverage=boom))

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    assert body['acts'], 'the whole list was lost to one broken act'
    assert 'taught_a_rule' not in {a['slug'] for a in body['acts']}


def test_an_EARNED_act_whose_coverage_raises_is_shown_as_OPEN(
        owner, auth_headers, client, monkeypatch):
    """*** FAIL OPEN ONCE WE KNOW THE ACT APPLIES, AND THE FIRST VERSION OF
    THIS CODE GOT IT BACKWARDS. *** It set `open: False` on a crash while the
    comment beside it claimed the opposite, so a broken predicate told the user
    the job was done and they would never return to the page. A spurious cairn
    costs a wasted visit; a missing one costs the act.
    """
    import dataclasses

    from src.models.coins import CoinAward
    from src.services.literacy.acts import ACTS

    # A row means the act has already paid, so it demonstrably applies here.
    _db.session.add(CoinAward(user_id=owner.id, act_slug='taught_a_rule',
                              coverage=Decimal('0.5'), coins=350))
    _db.session.commit()

    def boom(_uid):
        raise RuntimeError('deliberate')

    monkeypatch.setitem(
        ACTS, 'taught_a_rule',
        dataclasses.replace(ACTS['taught_a_rule'], coverage=boom))

    body = client.get('/api/v1/coins', headers=auth_headers(owner)).get_json()
    shown = {a['slug']: a for a in body['acts']}
    assert 'taught_a_rule' in shown, 'an earned act vanished on a crash'
    assert shown['taught_a_rule']['open'] is True, (
        'a coverage function that raised was reported as FINISHED')
