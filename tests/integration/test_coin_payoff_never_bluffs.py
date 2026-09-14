"""*** A PAYOFF MUST SAY NOTHING UNLESS ITS ACT WAS ACTUALLY DONE. ***

Found by reading the real `/api/v1/coins` payload rather than the code. Three
payoffs returned their sentence unconditionally, so the wire carried:

    {"slug": "income_recorded", "coins": 0,
     "revealed": "finPal now knows what arrives..."}

Zero coins beside copy claiming the act was complete. Every existing test
asserted what a sentence SAID; none asserted whether it should exist at all,
which is why the suite was green.

*** SO THE ASSERTION HERE IS AN ABSENCE, ACROSS EVERY ACT AT ONCE. *** A new act
whose payoff bluffs is caught by the parametrised case without anybody
remembering to add one.
"""

import pytest

from src.extensions import db as _db
from src.services.literacy.acts import ACTS
from tests.factories import UserFactory

BARE = 'bluff@test.com'


@pytest.fixture
def bare(db):
    UserFactory(id=BARE, name='Bare')
    _db.session.commit()


@pytest.mark.parametrize('slug', sorted(ACTS))
def test_no_payoff_speaks_for_a_user_who_has_done_NOTHING(bare, slug):
    """A user with no accounts, no transactions, no goals, no budget and no
    rules has done none of these. Every payoff must be silent."""
    act = ACTS[slug]
    got = act.payoff(BARE)
    assert got is None, (
        f'{slug} said "{got}" to a user who has done nothing. The coin award '
        'is the lesson, and a lesson about an act you have not performed is a '
        'bluff — which is the one thing this design says it never does.')


@pytest.mark.parametrize('slug', sorted(ACTS))
def test_no_payoff_raises_for_an_empty_user(bare, slug):
    """A payoff that raises would be swallowed by the API's try/except and
    silently omit a sentence a user had earned. Cheaper to assert here."""
    ACTS[slug].payoff(BARE)


def test_a_payoff_DOES_speak_once_the_act_is_done(db):
    """*** THE CONTROL. *** Without it, this file is satisfied by every payoff
    returning None for ever, and nobody would notice for a release."""
    from src.models.transaction_rule import TransactionRule
    user = UserFactory(id='didit@test.com', name='Did It')
    _db.session.commit()
    _db.session.add(TransactionRule(user_id=user.id, name='Coffee',
                                    pattern='COFFEE', active=True))
    _db.session.commit()

    got = ACTS['taught_a_rule'].payoff('didit@test.com')
    assert got is not None and '1 rule' in got, got
