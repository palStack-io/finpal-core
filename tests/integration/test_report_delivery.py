"""Who gets a report, who does not, and what lands in the message (A7/A9).

*** EVERY ASSERTION HERE IS ON THE CAPTURED TRANSPORT CALLS, NEVER ON THE TALLY
`send_reports` RETURNS. *** That is not style. With `EMAIL_ENABLED=false` —
which is what the demo stack runs — `EmailService.send_email` logs the message
and returns `True`, so `{'sent': 4}` is precisely what a stack delivering
nothing also reports. A test that asserted on the tally would pass on both the
fixed and the broken state, which is this project's most-repeated failure shape
(D-61, D-107, D-149 all wear it). Design spec trap 5.

The transport is stubbed by replacing `send_email` on the **module-level
singleton** `src.services.email_service.email_service`, which is the same object
`delivery.py` imported at import time. Patching the `EMAIL_ENABLED` environment
variable instead would do nothing at all: `EmailService.__init__` reads
`os.getenv` once, and the singleton was constructed at import
(`email_service.py:926`).
"""
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.services.email_service import email_service
from src.services.report.delivery import send_reports
from tests.factories import (
    AccountFactory, CategoryFactory, ExpenseFactory, UserFactory)

# A Monday, so `resolve_period('weekly', ...)` reports on Aug 31 – Sep 6.
AS_OF = datetime(2026, 9, 7, 13, 0, tzinfo=timezone.utc)
INSIDE = datetime(2026, 9, 2, 12, 0)


@pytest.fixture
def sent(monkeypatch):
    """Every message the transport was handed, as dicts. Empty means nothing sent."""
    captured = []

    def capture(to_email, subject, html_body, text_body=None):
        captured.append({'to': to_email, 'subject': subject, 'html': html_body})
        return True

    monkeypatch.setattr(email_service, 'send_email', capture)
    return captured


def _spender(**kwargs):
    """A user with a week's spending inside the reported window."""
    user = UserFactory(**kwargs)
    account = AccountFactory(user_id=user.id, name='Current', type='checking',
                             balance=Decimal('2450.00'))
    category = CategoryFactory(name='Groceries', user_id=user.id)
    ExpenseFactory(user_id=user.id, account_id=account.id,
                   amount=Decimal('75.00'), date=INSIDE, paid_by=user.id,
                   category_id=category.id)
    return user


# --- A9: the instance refusal, which is the FIRST line ----------------------

def test_a_demo_instance_sends_absolutely_nothing(db, app, sent, monkeypatch):
    """*** OWNER DECISION 2026-09-08: THE REPORT MUST NEVER RUN ON THE DEMO STACK. ***

    `finpal-demo-scheduler` runs with `RUN_SCHEDULER=true`
    (`docker-compose.demo.yml:167`), so a job added to `setup_scheduled_tasks()`
    fires there by default. This asserts the transport was never touched — not
    that the tally says it refused, which would pass with the guard deleted and
    the sends left in.
    """
    _spender(name='Harun')
    monkeypatch.setitem(app.config, 'DEMO_MODE', True)

    send_reports('weekly', as_of=AS_OF)

    assert sent == [], (
        f'a DEMO_MODE instance handed {len(sent)} message(s) to the transport')


def test_the_same_household_does_get_a_report_when_not_a_demo_instance(db, app, sent):
    """The inverse, so the test above cannot be satisfied by sending nothing ever.

    Without this pair, deleting the whole body of `send_reports` passes the
    refusal test — which is the "a check that inspects nothing looks exactly like
    a check that passes" shape recorded all over this repo.
    """
    assert app.config.get('DEMO_MODE') is False, 'conftest no longer disables DEMO_MODE'
    _spender(name='Harun')

    send_reports('weekly', as_of=AS_OF)

    assert len(sent) == 1


def test_email_enabled_is_not_what_stops_the_demo(db, app, monkeypatch):
    """The trap this guard exists for, pinned as a fact rather than a comment.

    `EMAIL_ENABLED=false` is what the demo stack actually sets, and it makes
    `send_email` **log and return True**. So had the refusal been built on it,
    the demo would have reported a clean send of every report forever.
    """
    monkeypatch.setattr(email_service, 'enabled', False)
    assert email_service.send_email('a@b.test', 'subject', '<p>body</p>') is True


# --- A7: the per-user refusals, which are the SECOND line -------------------

def test_a_demo_user_gets_no_report_on_a_real_instance(db, sent):
    """`household_user_ids()` is the filter — `is_demo_user IS NOT TRUE`.

    Demo accounts ship with a published password (D-42), so they are not people
    and their addresses are not deliverable.
    """
    real = _spender(name='Harun')
    _spender(name='Demo Persona', is_demo_user=True)

    send_reports('weekly', as_of=AS_OF)

    assert [m['to'] for m in sent] == [real.id]


def test_notification_email_false_is_honoured(db, sent):
    wants = _spender(name='Harun', notification_email=True)
    _spender(name='Rachel', notification_email=False)

    send_reports('weekly', as_of=AS_OF)

    assert [m['to'] for m in sent] == [wants.id]


def test_a_null_notification_email_still_gets_the_report(db, sent):
    """NULL is "never expressed a preference", and the preference defaults to on.

    `notification_email` is `db.Column(db.Boolean, default=True)` — a **Python-side**
    default, which means two things that pull in opposite directions:

    *** THE NULL IS WRITTEN WITH RAW SQL BECAUSE THE ORM CANNOT PRODUCE ONE. ***
    `UserFactory(notification_email=None)` stores **True**: SQLAlchemy applies the
    column default whenever the attribute is None at INSERT. Measured, not assumed —
    the first version of this test did exactly that, asserted a send, and passed
    with `is False` sabotaged to `not ...`, because there was never a NULL in the row.

    And NULL is still reachable in production, by the one route that bypasses the
    default entirely: a column **added to a table that already has rows**. That is
    what D-121's boot-time reconcile does on every upgrade, so the oldest accounts on
    any pre-existing database are precisely the ones holding NULL here. Reading NULL
    as an opt-out would silently exclude them, which is why the check is `is False`.
    """
    user = _spender(name='Harun')
    _db.session.execute(
        _db.text('UPDATE users SET notification_email = NULL WHERE id = :i'),
        {'i': user.id})
    _db.session.commit()
    assert _db.session.execute(
        _db.text('SELECT notification_email FROM users WHERE id = :i'),
        {'i': user.id}).scalar() is None, 'the NULL did not take — test proves nothing'

    send_reports('weekly', as_of=AS_OF)

    assert [m['to'] for m in sent] == [user.id]


def test_a_user_with_nothing_to_report_gets_no_email(db, sent):
    """D-108: four `$0.00` tiles read as measured data to the person holding them.

    A brand-new account is not a quiet week — it is an account with no data, and
    `is_empty` is the payload's own distinction between the two.
    """
    UserFactory(name='Brand New')

    send_reports('weekly', as_of=AS_OF)

    assert sent == []


def test_a_quiet_week_for_somebody_with_money_is_still_a_report(db, sent):
    """The other side of `is_empty`: it is "nothing to report", not "all zeroes".

    Someone with a balance and no spending this week has a real report. Without
    this, "skip empty" could be implemented as "skip when spend is zero" and
    nothing would notice.
    """
    user = UserFactory(name='Saver')
    AccountFactory(user_id=user.id, name='Savings', type='savings',
                   balance=Decimal('8000.00'))

    send_reports('weekly', as_of=AS_OF)

    assert [m['to'] for m in sent] == [user.id]


# --- what actually lands in the message -------------------------------------

def test_one_message_per_household_member(db, sent):
    """Household-wide figures, one email each — spec §1, scope decision."""
    me = _spender(name='Harun')
    them = UserFactory(name='Rachel')

    send_reports('weekly', as_of=AS_OF)

    assert sorted(m['to'] for m in sent) == sorted([me.id, them.id])


def test_the_seeded_figure_reaches_the_html(db, sent):
    """The whole point of the feature, asserted on the body rather than a count."""
    _spender(name='Harun')

    send_reports('weekly', as_of=AS_OF)

    assert '$75.00' in sent[0]['html']
    assert 'Groceries' in sent[0]['html']
    assert '<!DOCTYPE html>' in sent[0]['html']


def test_the_subject_names_the_period_it_covers(db, sent):
    _spender(name='Harun')

    send_reports('weekly', as_of=AS_OF)

    assert sent[0]['subject'] == 'Your weekly finPal report — Week of Aug 31 – Sep 6, 2026'


def test_the_loop_builds_a_REPORT_PER_MEMBER_not_one_mailed_twice(db, sent):
    """Each recipient's payload is built separately, so the formatting is personal.

    *** THIS TEST USED TO ASSERT `any('$')` AND `any('€')` AND THAT WAS BLESSING A
    DEFECT. *** Those two assertions are satisfied by the correct behaviour AND by
    D-156 — the household's spend total is the SAME NUMBER for both members while
    the symbol differs, because `Expense.amount` is never converted and only the
    account balances are. So it passed either way and was evidence of nothing.

    What it asserts now is only the claim it can actually support: two distinct
    bodies were rendered, one per recipient, rather than one body mailed twice.
    The currency question is D-156's, and `test_the_two_members_get_the_same_spend
    _total_under_different_symbols` below pins the defect explicitly so that fixing
    it fails a test instead of passing quietly.
    """
    _spender(name='Harun', default_currency_code='USD', number_locale='en-US')
    UserFactory(name='Amélie', default_currency_code='EUR', number_locale='fr-FR')

    send_reports('weekly', as_of=AS_OF)

    bodies = {m['to']: m['html'] for m in sent}
    assert len(bodies) == 2
    assert len(set(bodies.values())) == 2, (
        'both members received a byte-identical body, so the loop built one report '
        'and mailed it twice — the per-recipient currency, number_locale and '
        'timezone are all doing nothing')


def test_the_two_members_get_the_same_spend_total_under_different_symbols(db, sent):
    """*** PINS D-156, WHICH IS A LIVE DEFECT AND NOT THE REPORT'S OWN. ***

    `Expense.amount` is not converted anywhere on read, but
    `calculate_asset_debt_trends` DOES convert account balances into the viewing
    user's currency (`src/utils/helpers.py:279`). So one report card carries a
    converted net worth beside an unconverted spend total, under one symbol.

    Measured, both here and against `get_dashboard_data`, which does exactly the
    same thing — so this is **pre-existing and live on the deployed dashboard**,
    not something the report introduced. It is pinned rather than fixed because the
    fix is a decision about a payload two other clients already consume.

    *** D-156 IS NOW FIXED AND THIS TEST WAS REWRITTEN, NOT DELETED. *** It used to
    assert `€150.00` — the dollar figure under a euro symbol — and said in this
    docstring that fixing D-156 must make it fail. It did. The third assertion is
    the one that matters: `not any('€150.00')` fails if anything ever relabels
    without converting again, which the two positive assertions on their own would
    not catch.

    *** AND IT ONLY MEANS ANYTHING BECAUSE THE `db` FIXTURE NOW SEEDS CURRENCIES. ***
    It did not: `create_all()`/`drop_all()` per test wiped the boot-seeded
    `currencies` table after the first test, so `convert_currency` found no base
    currency, returned its input, and every conversion in the suite was the
    identity. This test PASSED against the fixed code for exactly that reason —
    running it alone failed, running it in its file passed. See D-166.
    """
    _spender(name='Dollar', default_currency_code='USD', number_locale='en-US')
    _spender(name='Euro', default_currency_code='EUR', number_locale='en-US')

    send_reports('weekly', as_of=AS_OF)

    bodies = {m['to']: m['html'] for m in sent}
    assert len(bodies) == 2

    # *** THE HOUSEHOLD SPENT ONE AMOUNT; THE TWO MEMBERS SEE IT IN THEIR OWN
    # CURRENCY, AND THE SYMBOL AND THE FIGURE NOW COME FROM THE SAME RULE. ***
    # 150.00 USD at EUR's seeded `rate_to_base` of 1.1 is 136.36. The euro reader
    # used to be shown **€150.00** — the dollar figure, relabelled — which is what
    # this test pinned before D-156 was fixed.
    assert any('$150.00' in html for html in bodies.values()), 'the base-currency reader should be unaffected'
    assert any('€136.36' in html for html in bodies.values()), 'the euro reader must see the CONVERTED total'
    assert not any('€150.00' in html for html in bodies.values()), 'a dollar figure under a euro symbol is D-156'


def test_the_window_is_resolved_in_each_users_own_timezone(db, sent):
    """Design spec trap 10 — the cron fires once, the week boundary is personal.

    *** THE INSTANT HERE IS 01:00 UTC AND THAT IS THE ONLY REASON THIS TEST CAN
    SEE ANYTHING. *** The first version used 13:00 UTC, where every timezone
    agrees — so it passed with `user.timezone` sabotaged to a hardcoded `'UTC'`
    and proved only that the code did not crash. That sabotage is what found it.

    At 01:00 UTC on Monday 7 Sep it is 02:00 **Monday** in London and 18:00
    **Sunday** in Los Angeles, so the two recipients must get **different**
    windows: the Londoner's week has just ended, the Californian's has not.
    Two labels, not one.

    New York would NOT work here and that is worth recording: it is UTC-4 in
    September, so 01:00 UTC is 21:00 Sunday there too, and the first attempt at
    this test compared two Sundays and failed for the right reason.
    """
    _spender(name='Harun', timezone='Europe/London')
    _spender(name='Casey', timezone='America/Los_Angeles')

    send_reports('weekly', as_of=datetime(2026, 9, 7, 1, 0, tzinfo=timezone.utc))

    labels = {m['subject'] for m in sent}
    assert labels == {
        'Your weekly finPal report — Week of Aug 31 – Sep 6, 2026',
        'Your weekly finPal report — Week of Aug 24 – Aug 30, 2026',
    }, labels


def test_at_the_hour_the_cron_actually_fires_every_timezone_agrees(db, sent):
    """The other half: the window is personal, but it must not be *ragged*.

    A user is not served by getting last week's report because they live west of
    the server. `tests/unit/test_scheduler_gate.py` is what pins the firing hour
    to a value with this property across UTC-12 to UTC+14; this asserts the
    consequence end-to-end, through the real send loop, at that hour.
    """
    _spender(name='Harun', timezone='America/New_York')
    _spender(name='Casey', timezone='America/Los_Angeles')
    _spender(name='Teraina', timezone='Pacific/Kiritimati')

    send_reports('weekly', as_of=AS_OF)          # 13:00 UTC = 08:00 EST

    assert len(sent) == 3
    assert {m['subject'] for m in sent} == {
        'Your weekly finPal report — Week of Aug 31 – Sep 6, 2026'}


def test_a_monthly_run_reports_the_previous_calendar_month(db, sent):
    _spender(name='Harun')

    send_reports('monthly', as_of=datetime(2026, 10, 1, 13, 0, tzinfo=timezone.utc))

    assert sent[0]['subject'] == 'Your monthly finPal report — September 2026'


# --- the run does not abort on one bad member -------------------------------

def test_one_members_failure_does_not_silence_the_household(db, sent, monkeypatch):
    """A cron that stops at the first exception delivers to whoever sorts first.

    D-154 is the live example: one member with a NULL name raised inside
    `render_html` and, before the per-user `try`, would have taken every other
    member's report down with it.
    """
    import src.services.report.delivery as delivery

    good = _spender(name='Zoe')
    bad = _spender(name='Adam')
    real_build = delivery.build_report

    def explode(user_id, period, cadence):
        if user_id == bad.id:
            raise RuntimeError('bad row')
        return real_build(user_id, period, cadence)

    monkeypatch.setattr(delivery, 'build_report', explode)

    tally = send_reports('weekly', as_of=AS_OF)

    assert [m['to'] for m in sent] == [good.id]
    assert tally['failed'] == 1


def test_an_unknown_cadence_is_refused_rather_than_guessed(db, sent):
    with pytest.raises(ValueError, match='cadence'):
        send_reports('daily', as_of=AS_OF)
    assert sent == []
