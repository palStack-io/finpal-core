"""A figure the SERVER renders must be in the user's currency, not the dollar.

*** THE ONE THE CLIENT CANNOT FIX. *** pointsPal's overview builds its recent
activity subtitle server-side -- `Overview.tsx` prints `{act.card_name} ·
{act.subtitle}` verbatim -- so a hardcoded `$` there reaches the screen of a
user whose every other figure is in pounds, and no client change can correct it.
That is D-101's shape pointing the other way: when the server owns the string,
the server owns the currency too.

*** AND THE GREP THAT FOUND IT WAS WRONG TWICE. *** A first sweep for
`formatMoney` with no currency argument flagged two mobile files that turned out
to pass a currency-aware formatter down as a PROP of the same name -- false
positives, withdrawn. The detector that works is different: a line containing
`${` and NO backtick, because inside a template literal `${}` interpolates and in
JSX text the dollar is printed verbatim. Assert on the rendered figure, never on
the shape of the source.
"""

import pytest

from src.extensions import db as _db
from src.utils.household import default_currency_for, number_locale_for
from src.utils.money import format_money
from tests.factories import UserFactory


@pytest.fixture
def gbp_user(db):
    user = UserFactory(id='gbp@test.com', name='Pounds')
    user.default_currency_code = 'GBP'
    _db.session.commit()
    return user


def test_the_currency_helper_reads_the_users_choice(gbp_user):
    assert default_currency_for(gbp_user.id) == 'GBP'


def test_it_falls_back_only_when_the_user_chose_nothing(db):
    user = UserFactory(id='nopref@test.com', name='None')
    user.default_currency_code = None
    _db.session.commit()

    assert default_currency_for(user.id) == 'USD'


def test_an_unknown_user_does_not_crash_a_render(db):
    """A figure must still render for a caller whose user row has gone."""
    assert default_currency_for('nobody@test.com') == 'USD'


def test_number_locale_is_None_rather_than_an_invented_default(db):
    """*** `None` IS A REAL ANSWER AND MUST NOT BECOME 'en-US'. ***

    `format_money` reads `None` as "the app default". Inventing `'en-US'` in the
    helper would make a user who never chose one indistinguishable from a user
    who deliberately chose American.
    """
    user = UserFactory(id='nolocale@test.com', name='NoLocale')
    user.number_locale = None
    _db.session.commit()

    assert number_locale_for(user.id) is None
    assert number_locale_for('nobody@test.com') is None


def test_a_server_rendered_figure_carries_the_users_symbol(gbp_user):
    """The assertion that fails on the old `f'${x:,.0f}'`."""
    rendered = format_money(
        450, default_currency_for(gbp_user.id), number_locale_for(gbp_user.id),
        whole_units=True)

    assert '£' in rendered
    assert '$' not in rendered
    assert '450' in rendered


def test_the_same_figure_reads_differently_for_two_users(db):
    """Discriminating: one figure, two users, two units — so the test cannot
    pass by the formatter ignoring its argument."""
    gbp = UserFactory(id='two-gbp@test.com', name='GBP')
    gbp.default_currency_code = 'GBP'
    eur = UserFactory(id='two-eur@test.com', name='EUR')
    eur.default_currency_code = 'EUR'
    _db.session.commit()

    a = format_money(450, default_currency_for(gbp.id), whole_units=True)
    b = format_money(450, default_currency_for(eur.id), whole_units=True)

    assert a != b
    assert '£' in a and '€' in b


def test_pointspal_overview_subtitle_is_not_a_dollar_string(gbp_user, client,
                                                            auth_headers):
    """End to end: the payload the client prints verbatim.

    *** THE FIRST VERSION OF THIS TEST WAS VACUOUS AND THE SABOTAGE IS WHAT SAID
    SO. *** It looped over `recent_activity`, which is EMPTY for a user with no
    cards, so restoring the hardcoded `f'${x:.0f}'` left it green. A sabotage
    that passes is a hole in the test, not a bad sabotage. The row is therefore
    built here, and `assert rows` refuses to let it go quiet again.
    """
    from datetime import datetime

    from src.modules.pointspal.models import SpendPeriodTotal, UserCard

    card = UserCard(user_id=gbp_user.id, card_nickname='Visa Signature')
    _db.session.add(card)
    _db.session.flush()
    _db.session.add(SpendPeriodTotal(
        user_card_id=card.id, category='groceries', period_type='monthly',
        period_key=datetime.utcnow().strftime('%Y-%m'),
        total_spent=450.0, total_pts_earned=1350.0, total_pts_missed=0.0))
    _db.session.commit()

    headers = auth_headers(gbp_user)
    resp = client.get('/api/v1/pointspal/overview', headers=headers)

    if resp.status_code == 404:
        pytest.skip('pointsPal is not enabled in this configuration')
    assert resp.status_code == 200

    rows = resp.get_json().get('recent_activity') or []
    assert rows, 'no activity row was built — this test would assert nothing'
    for row in rows:
        assert '$' not in row['subtitle'], row['subtitle']
        assert '£' in row['subtitle'], row['subtitle']
