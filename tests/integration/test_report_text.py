"""B8 — the plain-text alternative, and the guard against it drifting from the HTML.

*** THE POINT IS DELIVERABILITY, WHICH NO TEST OF THE HTML CAN REACH. *** An
HTML-only `multipart/alternative` carries exactly one part, which is a spam signal
at most large providers. The message renders perfectly right up until it is
filtered, so the failure mode is invisible from inside.

*** AND THE ASSERTION THAT MATTERS MOST IS THE CROSS-CHECK. *** Two renderers over
one payload drift the moment somebody adds a section to one of them. A test of the
text alone would still pass; `test_every_figure_in_the_html_is_in_the_text` would
not.
"""
import re
from datetime import datetime
from decimal import Decimal

import pytest

from src.services.report.builder import build_report
from src.services.report.render import render_html, render_text
from src.services.report.period import resolve_period
from tests.factories import (UserFactory, AccountFactory, CategoryFactory,
                             ExpenseFactory)

AS_OF = datetime(2026, 9, 7, 13, 0)
INSIDE = datetime(2026, 9, 2, 12, 0)
WEEK = resolve_period('weekly', AS_OF, 'UTC')
MONTH = resolve_period('monthly', datetime(2026, 9, 20, 13, 0), 'UTC')

MONEY = re.compile(r'[$€£¥]\s?[\d.,  ]+\d')


def _household(name='Harun', **kwargs):
    me = UserFactory(name=name, **kwargs)
    account = AccountFactory(user_id=me.id, name='Everyday', type='checking',
                             balance=Decimal('3000.00'), currency_code='USD')
    card = AccountFactory(user_id=me.id, name='Amex Gold', type='credit',
                          balance=Decimal('-420.55'), currency_code='USD')
    groceries = CategoryFactory(name='Groceries', user_id=me.id)
    dining = CategoryFactory(name='Eating out', user_id=me.id)
    for category, amount in ((groceries, '200.00'), (dining, '65.40')):
        ExpenseFactory(user_id=me.id, account_id=account.id, date=INSIDE,
                       amount=Decimal(amount), paid_by=me.id,
                       category_id=category.id, currency_code='USD')
    ExpenseFactory(user_id=me.id, account_id=account.id, date=INSIDE,
                   amount=Decimal('1800.00'), paid_by=me.id,
                   category_id=groceries.id, currency_code='USD',
                   transaction_type='income')
    return me, card


def test_the_text_carries_the_figures(db):
    me, _ = _household()
    report = build_report(me.id, WEEK, 'weekly')

    text = render_text(report)

    assert '$265.40' in text, 'the spend total is missing'
    assert '$1,800.00' in text, 'income is missing'
    assert 'Groceries' in text and 'Eating out' in text
    assert 'Amex Gold' in text


def _months_of_history(user, account, category):
    """Enough back-history that the monthly report's net-worth trend is NOT empty.

    *** WITHOUT THIS THE CROSS-CHECK BELOW IS BLIND TO A WHOLE SECTION, AND IT WAS. ***
    A sabotage that deleted the entire NET WORTH block from `render_text` PASSED:
    with no history the trend renders as "Not enough history yet…" in both
    renderers, which carries no money figures, so removing the text block changed
    nothing the set comparison could see. That is a hole in the test, not a bad
    sabotage — the same shape as an empty fixture making an overflow gate report
    clean.
    """
    for month in (5, 6, 7, 8):
        ExpenseFactory(user_id=user.id, account_id=account.id,
                       date=datetime(2026, month, 10, 12, 0),
                       amount=Decimal('120.00'), paid_by=user.id,
                       category_id=category.id, currency_code='USD')


def test_every_figure_in_the_html_is_in_the_text(db):
    """*** THE ANTI-DRIFT GUARD, AND THE REASON THIS FILE EXISTS. ***

    Two renderers over one payload stay in step only while somebody remembers
    both. A section added to `render_html` and forgotten in `render_text` leaves
    the text quietly incomplete — and an incomplete plain-text part is exactly as
    deliverable as a correct one, so nothing else would ever report it.

    Compared as a SET of money strings rather than by section, so it keeps working
    when either renderer is restructured.
    """
    me, _ = _household()
    from src.models.account import Account
    from src.models.category import Category
    account = Account.query.filter_by(user_id=me.id, name='Everyday').one()
    _months_of_history(me, account, Category.query.filter_by(user_id=me.id).first())

    report = build_report(me.id, MONTH, 'monthly')
    assert report['trend'], 'the trend is empty — this test cannot see that section'

    html_figures = set(MONEY.findall(render_html(report)))
    text_figures = set(MONEY.findall(render_text(report)))

    assert html_figures, 'no figures found in the HTML — the regex is wrong, not the code'
    missing = html_figures - text_figures
    assert not missing, f'in the HTML but not the plain text: {sorted(missing)}'


def test_the_text_part_is_actually_sent(db, monkeypatch):
    """Asserted on the TRANSPORT CALL, not on the renderer.

    `render_text` existing and `render_text` being passed to `send_email` are two
    different things, and the second is the one that reaches a spam filter.
    """
    from src.services import email_service as module
    from src.services.report.delivery import send_reports

    calls = []
    monkeypatch.setattr(module.email_service, 'send_email',
                        lambda **kw: calls.append(kw) or True)
    _household()

    send_reports('weekly', as_of=AS_OF)

    assert len(calls) == 1
    assert calls[0].get('text_body'), 'the report was sent with no plain-text part'
    assert '<' not in calls[0]['text_body'].replace('<br', ''), (
        'the plain-text part contains markup')


def test_the_text_part_is_not_escaped_html(db):
    """`&amp;` in a plain-text part is a bug the HTML part cannot have.

    `_money` escapes because its output lands in a document; `_text_money` must
    not. A household name with an ampersand is the cheapest way to tell the two
    apart, and `display_name` puts every member's name in the header.
    """
    me, _ = _household(name='Harun & Co')
    report = build_report(me.id, WEEK, 'weekly')

    text = render_text(report)

    assert 'Harun & Co' in text
    assert '&amp;' not in text


def test_a_weekly_report_has_no_net_worth_section_in_either_renderer(db):
    """`trend` is None for a weekly report, which is not an empty series.

    Kept because the text renderer has to make the same distinction the HTML makes
    — `is not None` rather than truthiness — and getting it wrong prints an empty
    heading rather than omitting the section.
    """
    me, _ = _household()
    report = build_report(me.id, WEEK, 'weekly')

    assert report['trend'] is None
    assert 'NET WORTH' not in render_text(report)
    assert 'Net worth</h2>' not in render_html(report)
    # But the net worth TILE is in both, and that is a different thing.
    assert 'Net worth:' in render_text(report)
