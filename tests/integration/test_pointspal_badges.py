"""pointsPal's contributor badges: recognition for sharing, never payment.

*** OWNER DECISION 2026-09-17: A BADGE, NOT COINS. *** "when someone
contributes we just give them a badge. the whole goal is to encourage user to
contribute credit card point details".

*** WHY A BADGE SURVIVES THE OBJECTION THAT KILLED COINS. *** §5.1's warning is
about PAYING: "you get volume, not accuracy, and a community dataset's entire
value is accuracy." That is a warning about a CURRENCY, where every extra
submission is worth something again. A badge is once-only and buys nothing, so
the worst a farmer gets is one spurious submission.

Three things must hold, and each has a test and a sabotage:
  1. It pays no coins and no altitude.
  2. It counts CARDS shared, not clicks — re-opening the link cannot inflate it.
  3. It never claims the contribution was ACCEPTED, because finPal cannot know.
"""
import pytest

from src.extensions import db as _db
from src.models.act_event import BadgeEarned
from src.modules.pointspal.models import UserCard
from src.services.literacy.badges import BADGES, award_badges, earned_badges
from tests.factories import UserFactory

USER = 'ppbadge@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='PPB', password_plain='testpassword')
    _db.session.commit()
    return u


def _card(user_id, shared=False):
    c = UserCard(user_id=user_id, submitted_to_community=shared)
    _db.session.add(c)
    _db.session.commit()
    return c


def test_the_module_badges_reach_the_registry(app):
    """The third contribution hook. `get_checks()` had one, `get_acts()` had
    none until today, and this one is new — so it is asserted rather than
    assumed."""
    for slug in ('first-light', 'cairn-builder', 'map-maker'):
        assert slug in BADGES, f'{slug} did not reach the registry'


def test_sharing_nothing_earns_nothing(owner):
    _card(owner.id, shared=False)
    assert 'first-light' not in award_badges(owner.id)


def test_sharing_one_card_earns_the_first_badge(owner):
    _card(owner.id, shared=True)
    awarded = award_badges(owner.id)
    _db.session.commit()
    assert 'first-light' in awarded
    assert 'cairn-builder' not in awarded


def test_the_tiers_cut_at_one_three_and_ten(owner):
    for _ in range(3):
        _card(owner.id, shared=True)
    awarded = award_badges(owner.id)
    _db.session.commit()
    assert 'first-light' in awarded
    assert 'cairn-builder' in awarded
    assert 'map-maker' not in awarded


def test_IT_COUNTS_CARDS_NOT_CLICKS(owner):
    """*** THE FARM GUARD. *** `submitted_to_community` is a flag on the CARD,
    so re-opening the link for the same card cannot inflate the count. That
    matters more for a reward than for anything else here, because the whole
    risk of rewarding a submission is somebody pressing the button repeatedly.
    """
    card = _card(owner.id, shared=True)

    # "Press it again" — the handler re-sets the same flag on the same row.
    card.submitted_to_community = True
    _db.session.commit()
    card.submitted_to_community = True
    _db.session.commit()

    awarded = award_badges(owner.id)
    _db.session.commit()
    assert 'first-light' in awarded
    assert 'cairn-builder' not in awarded, (
        'pressing the button again counted as a second contribution')


def test_A_CONTRIBUTOR_BADGE_PAYS_NO_COINS_AND_NO_ALTITUDE(
        owner, auth_headers, client):
    """*** THE PROPERTY THAT MAKES REWARDING A SUBMISSION SAFE AT ALL. ***"""
    h = auth_headers(owner)
    before = client.get('/api/v1/coins', headers=h).get_json()

    _card(owner.id, shared=True)
    award_badges(owner.id)
    _db.session.commit()

    after = client.get('/api/v1/coins', headers=h).get_json()
    assert any(b['slug'] == 'first-light' for b in after['badges']), (
        'the badge was not earned — the test is vacuous')
    assert after['earned'] == before['earned'], 'a contributor badge paid coins'
    assert after['everest']['altitude_m'] == before['everest']['altitude_m'], (
        'a contributor badge moved the altitude on Everest')

    from src.repositories.coins import CoinRepository
    _db.session.rollback()
    ledger = {r.act_slug for r in CoinRepository().awards(owner.id)}
    assert not (ledger & set(BADGES)), (
        f'badge slugs are in the coin ledger: {ledger & set(BADGES)}')


def test_NO_BADGE_TITLE_CLAIMS_THE_CONTRIBUTION_WAS_ACCEPTED(app):
    """*** finPal CANNOT KNOW, AND MUST NOT IMPLY IT. *** Nothing links a merge
    back to a user, deliberately: D-91 keeps every identifier out of the public
    payload. `submitted_to_community` means a URL was built. So the titles say
    "shared", never "accepted", "merged", "approved" or "published"."""
    for slug in ('first-light', 'cairn-builder', 'map-maker'):
        title = BADGES[slug][0].lower()
        for forbidden in ('accepted', 'merged', 'approved', 'published',
                          'contributed'):
            assert forbidden not in title, (
                f'{slug} claims "{forbidden}", which finPal cannot know')
        assert 'shared' in title, f'{slug} does not say what actually happened'


def test_the_badge_survives_the_card_being_unshared(owner):
    """Decision 1: nothing earned is taken away. Badges are recorded once."""
    card = _card(owner.id, shared=True)
    award_badges(owner.id)
    _db.session.commit()

    card.submitted_to_community = False
    _db.session.commit()

    held = {b['slug'] for b in earned_badges(owner.id)}
    assert 'first-light' in held


def test_awarding_twice_does_not_duplicate(owner):
    _card(owner.id, shared=True)
    award_badges(owner.id)
    _db.session.commit()
    assert award_badges(owner.id) == []
    assert BadgeEarned.query.filter_by(
        user_id=owner.id, slug='first-light').count() == 1
