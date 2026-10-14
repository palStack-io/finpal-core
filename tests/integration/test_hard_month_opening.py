"""Phase 1e: the hard-month opening on Dashboard and Budgets (docs/phase1e-hard-month-spec.md).

Through the API, as a client sees it. `_today` is pinned so the month boundary and the
28-day gap are exact.
"""
from datetime import date, datetime

import pytest

from src.extensions import db as _db
from src.models.visit_mark import VisitMark
from src.services.onboarding import hard_month
from tests.factories import BudgetFactory, CategoryFactory, ExpenseFactory, UserFactory

TODAY = date(2026, 10, 14)
URL = '/api/v1/modules/hard-month'


@pytest.fixture
def at(monkeypatch):
    def pin(day):
        monkeypatch.setattr(hard_month, '_today', lambda: day)
    pin(TODAY)
    return pin


def _budget(user, amount=100, spent=0, when=datetime(2026, 9, 15), period='monthly', **kw):
    cat = CategoryFactory(user_id=user.id)
    budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=amount, period=period,
                           start_date=datetime(2026, 1, 1), **kw)
    if spent:
        ExpenseFactory(user_id=user.id, category_id=cat.id, amount=spent, date=when)
    return budget


def _get(client, headers, lang='en'):
    resp = client.get(f'{URL}?lang={lang}', headers=headers)
    assert resp.status_code == 200
    return resp.get_json()['opening']


def test_requires_auth(client, db):
    assert client.get(URL).status_code == 401


def test_a_month_over_budget_opens_with_one_category(client, db, auth_headers, at):
    user = UserFactory()
    _budget(user, amount=100, spent=150)
    opening = _get(client, auth_headers(user))
    assert opening['state'] == 'off_plan'
    assert opening['key'] == 'hm-month:2026-09'
    assert opening['text'] == "Last month didn't go to plan. You can start by looking at one category."
    assert opening['action'] == 'Review a category' and opening['href'] == '/budgets'


def test_within_budget_shows_nothing(client, db, auth_headers, at):
    user = UserFactory()
    _budget(user, amount=100, spent=80)
    assert _get(client, auth_headers(user)) is None


def test_no_budgets_shows_nothing(client, db, auth_headers, at):
    assert _get(client, auth_headers(UserFactory())) is None


def test_overspending_THIS_month_is_not_last_month(client, db, auth_headers, at):
    user = UserFactory()
    _budget(user, amount=100, spent=150, when=datetime(2026, 10, 2))
    assert _get(client, auth_headers(user)) is None


def test_a_yearly_budget_never_triggers_it(client, db, auth_headers, at):
    """A big yearly bill landing in one month is not overspending (sinking-fund rule)."""
    user = UserFactory()
    _budget(user, amount=100, spent=900, period='yearly')
    assert _get(client, auth_headers(user)) is None


def test_a_paused_budget_never_triggers_it(client, db, auth_headers, at):
    user = UserFactory()
    _budget(user, amount=100, spent=150, active=False)
    assert _get(client, auth_headers(user)) is None


def test_a_budget_created_this_month_did_not_plan_last_month(client, db, auth_headers, at):
    user = UserFactory()
    b = _budget(user, amount=100, spent=150)
    b.start_date = datetime(2026, 10, 3)
    _db.session.commit()
    assert _get(client, auth_headers(user)) is None


def test_the_month_boundary_is_exact(client, db, auth_headers, at):
    """Spending on the last second of September counts; on 1 October it does not."""
    user = UserFactory()
    _budget(user, amount=100, spent=150, when=datetime(2026, 9, 30, 23, 59, 0))
    assert _get(client, auth_headers(user))['key'] == 'hm-month:2026-09'
    at(date(2026, 11, 1))
    assert _get(client, auth_headers(user)) is None, 'October had no overspend'


def test_dismissing_closes_it_for_that_month_only(client, db, auth_headers, at):
    user = UserFactory()
    headers = auth_headers(user)
    _budget(user, amount=100, spent=150)
    key = _get(client, headers)['key']
    assert client.post(f'{URL}/dismiss', json={'key': key}, headers=headers).status_code == 200
    assert client.post(f'{URL}/dismiss', json={'key': key}, headers=headers).status_code == 200
    assert _get(client, headers) is None
    # Another hard month is a new episode.
    _budget(user, amount=100, spent=150, when=datetime(2026, 10, 9))
    at(date(2026, 11, 2))
    assert _get(client, headers)['key'] == 'hm-month:2026-10'


def test_dismiss_refuses_an_unknown_key(client, db, auth_headers):
    headers = auth_headers(UserFactory())
    assert client.post(f'{URL}/dismiss', json={'key': 'guide:accounts'}, headers=headers).status_code == 400


def test_a_first_visit_is_never_a_return(client, db, auth_headers, at):
    user = UserFactory()
    assert _get(client, auth_headers(user)) is None
    assert _db.session.get(VisitMark, user.id).returned_on is None


def test_a_return_after_28_days_says_welcome_back(client, db, auth_headers, at):
    user = UserFactory()
    _db.session.add(VisitMark(user_id=user.id, last_seen_on=date(2026, 9, 16)))
    _db.session.commit()
    opening = _get(client, auth_headers(user))
    assert opening['state'] == 'returning'
    assert opening['key'] == 'hm-return:2026-10-14'
    assert opening['href'] == '/transactions'


def test_27_days_is_not_a_return(client, db, auth_headers, at):
    user = UserFactory()
    _db.session.add(VisitMark(user_id=user.id, last_seen_on=date(2026, 9, 17)))
    _db.session.commit()
    assert _get(client, auth_headers(user)) is None


def test_the_welcome_back_offer_lasts_a_week(client, db, auth_headers, at):
    user = UserFactory()
    headers = auth_headers(user)
    _db.session.add(VisitMark(user_id=user.id, last_seen_on=date(2026, 9, 1)))
    _db.session.commit()
    assert _get(client, headers)['state'] == 'returning'
    at(date(2026, 10, 20))
    assert _get(client, headers)['state'] == 'returning'
    at(date(2026, 10, 21))
    assert _get(client, headers) is None


def test_both_at_once_shows_the_budget_one_only(client, db, auth_headers, at):
    user = UserFactory()
    _db.session.add(VisitMark(user_id=user.id, last_seen_on=date(2026, 8, 1)))
    _db.session.commit()
    _budget(user, amount=100, spent=150)
    assert _get(client, auth_headers(user))['state'] == 'off_plan'


def test_loading_the_guides_counts_as_a_visit(client, db, auth_headers, at):
    user = UserFactory()
    assert client.get('/api/v1/modules/guides?lang=en', headers=auth_headers(user)).status_code == 200
    assert _db.session.get(VisitMark, user.id).last_seen_on == TODAY


def test_spanish_is_served_when_asked(client, db, auth_headers, at):
    user = UserFactory()
    _budget(user, amount=100, spent=150)
    opening = _get(client, auth_headers(user), lang='es')
    assert opening['action'] == 'Revisar una categoría'


def test_budgets_are_the_households_but_dismissing_is_personal(client, db, auth_headers, at):
    """Core is one household per deployment (D-20): a member sees the shared budget's
    opening, as the Budgets page shows them the same budgets. Closing it is personal.
    Tenant isolation is premium's, tested there."""
    mine, theirs = UserFactory(), UserFactory()
    _budget(mine, amount=100, spent=150)
    assert _get(client, auth_headers(theirs))['state'] == 'off_plan'
    client.post(f'{URL}/dismiss', json={'key': 'hm-month:2026-09'}, headers=auth_headers(theirs))
    assert _get(client, auth_headers(theirs)) is None
    assert _get(client, auth_headers(mine))['state'] == 'off_plan'


def test_deleting_account_data_takes_the_visit_mark_and_dismissals_with_it(client, db, auth_headers, at):
    """Both tables key on users.id with no ON DELETE: left behind, they block the user delete."""
    from api.v1.users import _delete_all_user_data
    from src.models.act_event import TeachingSeen
    user = UserFactory()
    headers = auth_headers(user)
    _budget(user, amount=100, spent=150)
    key = _get(client, headers)['key']
    client.post(f'{URL}/dismiss', json={'key': key}, headers=headers)
    assert _db.session.get(VisitMark, user.id) is not None
    assert TeachingSeen.query.filter_by(user_id=user.id).count() == 1
    _delete_all_user_data(user.id)
    _db.session.commit()
    _db.session.expire_all()
    assert _db.session.get(VisitMark, user.id) is None
    assert TeachingSeen.query.filter_by(user_id=user.id).count() == 0
