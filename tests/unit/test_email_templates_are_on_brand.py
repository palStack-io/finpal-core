"""
finPal's emails must look like finPal, and be readable. D-129.

Reported by the owner as the brand colour being wrong in emails. It was — and it was
inconsistent rather than simply absent, which is worse: `#15803d`/`#166534` (the real brand
green) appeared in some templates for exactly the same roles where others used
`#3b82f6`/`#1d4ed8` blue, so two finPal emails disagreed with each other. The page and card
surfaces were `#0f172a`/`#1e293b`, the same leftover slate as D-127.

*** MEASURING IT FOUND THREE CONTRAST FAILURES NOBODY HAD REPORTED, AND THEY FAILED ON THE
OLD SURFACE TOO — so they are not something this change introduced: ***

    #475569  12px footer text, in all six templates      2.36:1   (needs 4.5)
    #64748b  12-13px secondary text, 11 sites            3.75:1
    #3b82f6  inline links, on the card                   4.39:1

and white on the `#3b82f6` end of the CTA gradient was **3.68:1**, on the primary button of
a verification email. The brand green fixes that one for free: white on `#15803d` is 5.02:1
and on `#166534` is 7.13:1.

HOW THIS CHECKS, AND WHY NOT BY GREPPING HEXES.

An email client resolves no CSS variables, so unlike the rest of web-ui these templates
MUST hold literal hex — which means the usual "use the token" gate is unavailable and a
list of banned hexes is all that is left. A list is a list of the ones somebody remembered.
So instead this **renders every template** through its real send method with a stubbed
transport, then parses the colours out of the HTML that was actually produced and measures
each foreground against the surface it sits on. A seventh template added later is covered
the moment it is registered below, and a new bad colour is caught without being named.
"""

import re

import pytest

# The brand, from web-ui/src/styles/finpal-theme.css.
BRAND_GREENS = {'#15803d', '#166534', '#86efac', '#22c55e'}

# The two dark surfaces the templates paint = --kt-wash and --kt-card.
PAGE = '#0E1711'
CARD = '#16241A'

# Never correct in a finPal email: emerald that is not ours, slate that is left over from
# before the palette went green, and the blue CTA.
OFF_BRAND = {
    '#10b981': 'emerald-500, not a finPal green',
    '#059669': 'emerald-600, not a finPal green',
    '#0f172a': 'slate-900 page (D-127)',
    '#1e293b': 'slate-800 card (D-127)',
    '#3b82f6': 'blue-500 CTA/link',
    '#1d4ed8': 'blue-700 CTA end',
    '#64748b': 'slate muted text — 3.75:1',
    '#475569': 'slate footer text — 2.36:1',
}

AA_NORMAL = 4.5


def _luminance(hex_colour):
    h = hex_colour.lstrip('#')
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = [
        c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        for c in channels
    ]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


# ── every template, rendered ──────────────────────────────────────────────────

def _report_samples():
    """
    The report email, rendered from `build_report`'s REAL output — two of them.

    *** IT JOINS THIS SWEEP RATHER THAN GETTING ITS OWN CONTRAST TEST. *** Design
    spec trap 4: the value of this file is that a seventh template is covered the
    moment it is registered, and a new bad colour is caught without anybody naming
    it. A parallel contrast test for one template would be a second list to keep in
    step, which is the drift this file was written to remove.

    The sample is deliberately a household that reaches every colour branch — a
    credit card with a NEGATIVE balance (`NEGATIVE`), a cash account, spend rows
    with bars (`BAR`), a housemate who owes money (`ACCENT`), and the MONTHLY
    cadence so the net-worth trend and the vs-previous deltas render too.
    `test_every_report_colour_is_actually_reached_by_the_sample` is what stops
    that claim going stale: a colour the sample never renders is a colour this
    file is not measuring.
    """
    from datetime import date, datetime
    from decimal import Decimal

    from src.services.report.builder import build_report
    from src.services.report.period import Period
    from src.services.report.render import render_html
    from tests.factories import (
        AccountFactory, CategoryFactory, ExpenseFactory, UserFactory)

    me = UserFactory(name='Harun')
    them = UserFactory(name='Rachel')
    current = AccountFactory(user_id=me.id, name='Current', type='checking',
                             balance=Decimal('2450.00'))
    AccountFactory(user_id=me.id, name='Amex', type='credit',
                   balance=Decimal('-450.00'))
    food = CategoryFactory(name='Groceries', user_id=me.id)
    travel = CategoryFactory(name='Travel', user_id=me.id)

    for when in (datetime(2026, 8, 15, 12, 0), datetime(2026, 7, 15, 12, 0)):
        ExpenseFactory(user_id=me.id, account_id=current.id, date=when,
                       amount=Decimal('75.00'), paid_by=me.id, category_id=food.id)
        ExpenseFactory(user_id=me.id, account_id=current.id, date=when,
                       amount=Decimal('25.00'), paid_by=me.id, category_id=travel.id)
        ExpenseFactory(user_id=me.id, account_id=current.id, date=when,
                       amount=Decimal('3000.00'), paid_by=me.id,
                       transaction_type='income')
        ExpenseFactory(user_id=me.id, account_id=current.id, date=when,
                       amount=Decimal('100.00'), paid_by=me.id, split_method='equal',
                       split_with=them.id, category_id=food.id)

    month = Period(start=date(2026, 8, 1), end=date(2026, 8, 31), label='August 2026')
    week = Period(start=date(2026, 8, 10), end=date(2026, 8, 16),
                  label='Week of Aug 10 – Aug 16, 2026')
    return {
        'report_monthly': render_html(build_report(me.id, month, 'monthly')),
        'report_weekly': render_html(build_report(me.id, week, 'weekly')),
    }


@pytest.fixture
def rendered(app, db, monkeypatch):
    """
    The HTML each template actually produces, keyed by the thing that produced it.

    Rendered rather than read off the file, so the assertions below are about what lands in
    somebody's inbox. `send_email` is stubbed to capture instead of send.
    """
    from src.services.email_service import EmailService

    captured = {}
    service = EmailService()
    calls = []

    def fake_send(to_email, subject, html_body, text_body=None):
        calls.append(html_body or '')
        return True

    monkeypatch.setattr(service, 'send_email', fake_send)

    # Signatures read off the class rather than guessed — an earlier draft of this file
    # guessed them, every call raised TypeError, and NOTHING rendered. The
    # "enough templates render" check above is what caught it, which is the argument for
    # having it: without that, this whole file would have been green and measuring zero.
    invocations = {
        'send_group_invite': dict(
            to_email='a@b.test', inviter_name='Ann', group_name='Flat',
            group_id=1, invite_link='https://example.test/i'),
        'send_welcome_email': dict(
            to_email='a@b.test', user_name='Ann', login_link='https://example.test/l'),
        'send_verification_email': dict(
            to_email='a@b.test', user_name='Ann',
            verification_link='https://example.test/v'),
        'send_password_reset_email': dict(
            to_email='a@b.test', user_name='Ann', reset_link='https://example.test/r'),
        'send_import_review_email': dict(
            to_email='a@b.test', user_name='Ann', filename='b.csv', imported=3,
            errors=1, guessed_mapping=True, review_link='https://example.test/rev'),
        'send_invite_email': dict(
            to_email='a@b.test', inviter_name='Ann', invite_link='https://example.test/j'),
    }

    with app.app_context():
        for name, kwargs in invocations.items():
            method = getattr(service, name, None)
            assert method is not None, f'EmailService has no {name}'
            calls.clear()
            method(**kwargs)
            assert calls, f'{name} produced no html_body'
            captured[name] = calls[-1]

        captured.update(_report_samples())

    return captured


def _surface_of(html):
    """
    The background a template's own text sits on.

    SIX of the seven templates paint their own dark card. `send_import_review_email` is a
    bare fragment — no <html>, no <body>, no background — so its text lands on whatever the
    mail client supplies, which is white. Measuring every template against one assumed
    surface is exactly the mistake that made a sweep of the muted colour take that template
    from 4.76:1 to 2.24:1 while every other one improved. So the surface is read from the
    template, not assumed for the file.
    """
    return CARD if '<body' in html else '#ffffff'


STYLED = 'styled'
FRAGMENT = 'fragment'


def _kind(html):
    return STYLED if '<body' in html else FRAGMENT


def test_enough_templates_render_to_make_this_meaningful(rendered):
    """
    Guard against every assertion below passing because nothing rendered. An earlier draft
    of this file guessed the send signatures, every call raised TypeError, `rendered` was
    empty, and four of the six tests passed on nothing at all. This is the check that
    caught it.
    """
    # Six `EmailService` templates plus the two report samples. It was seven
    # EmailService templates until A8 deleted `send_monthly_report_email`, whose
    # replacement is `report_monthly`/`report_weekly` — two report templates that
    # disagree with each other is D-129 verbatim, so there is deliberately only one.
    assert len(rendered) >= 8, (
        f'only rendered {sorted(rendered)} — this gate is measuring almost nothing'
    )
    assert 'send_monthly_report_email' not in rendered, (
        'the old monthly-report template is back. It formatted money as '
        '`${total_income:,.2f}` — a hardcoded dollar sign and US grouping, ignoring '
        'default_currency_code and number_locale entirely (D-145 in the Python path). '
        'src/services/report/render.py replaced it.')
    assert {'report_monthly', 'report_weekly'} <= set(rendered), (
        'the report email is not in this sweep, so nothing measures its contrast')
    for name, html in rendered.items():
        assert html.strip(), f'{name} produced an empty body'
        assert '<p' in html or '<table' in html, f'{name} produced no markup'


def test_exactly_one_template_is_an_unstyled_fragment(rendered):
    """
    Pins the asymmetry rather than hiding it. `send_import_review_email` has no chrome at
    all — no header, no badge, no card, no brand colour — and that is a real
    inconsistency in finPal's email, left alone here because giving it the other six
    templates' layout is a redesign and not a colour fix.

    If a second fragment appears, this fails and somebody has to decide which way the
    inconsistency should be resolved, instead of it doubling quietly.
    """
    fragments = sorted(n for n, html in rendered.items() if _kind(html) == FRAGMENT)
    assert fragments == ['send_import_review_email'], (
        f'unstyled email templates changed: {fragments}'
    )


def test_no_template_uses_an_off_brand_colour(rendered):
    offenders = []
    for name, html in rendered.items():
        lowered = html.lower()
        for colour, why in OFF_BRAND.items():
            if colour.lower() in lowered:
                offenders.append(f'{name}: {colour} ({why})')
    assert offenders == [], 'off-brand colours reached the rendered email:\n  ' + '\n  '.join(offenders)


def test_every_template_actually_carries_the_brand_green(rendered):
    """
    The inverse of the test above, and the one that matters more. Removing all the blue
    would satisfy a ban-list while leaving an email with no brand colour at all.
    """
    missing = [
        name for name, html in rendered.items()
        if _kind(html) == STYLED
        and not any(g.lower() in html.lower() for g in BRAND_GREENS)
    ]
    assert missing == [], f'these render with no finPal green in them: {missing}'

    # And the fragment's lack of one is asserted, not merely skipped — so "it has no brand
    # colour" stays a recorded fact rather than a gap in the sweep.
    fragment = rendered['send_import_review_email']
    assert not any(g.lower() in fragment.lower() for g in BRAND_GREENS), (
        'send_import_review_email has grown a brand colour — good, but then it should be '
        'held to the same standard as the others and moved out of the fragment case'
    )


# The lookbehind is load-bearing: without it this also matched `background-color:`, so the
# sweep compared each surface against ITSELF and reported 1.13:1 six times. A false
# positive of that shape is dangerous precisely because the obvious way to make it go away
# is to loosen the threshold.
HEX = re.compile(r'(?<![-\w])color:\s*(#[0-9a-fA-F]{6})')


def test_every_text_colour_in_every_template_clears_AA(rendered):
    """
    Each template against ITS OWN surface — the card for the six that paint one, white for
    the fragment that does not. Every `color:` in the rendered HTML, not a list of the ones
    somebody thought to check; that list is what let 2.36:1 ship in six templates.
    """
    failures = []
    checked = 0

    for name, html in rendered.items():
        surface = _surface_of(html)
        for colour in sorted(set(HEX.findall(html))):
            checked += 1
            ratio = contrast(colour, surface)
            if ratio < AA_NORMAL:
                failures.append(f'{name}: {colour} on {surface} = {ratio:.2f}:1')

    assert checked > 0, 'no text colours found at all — the regex is probably stale'
    assert failures == [], (
        'text below WCAG AA in a rendered email:\n  ' + '\n  '.join(sorted(set(failures)))
    )


def test_the_maths_reproduces_the_failures_that_prompted_this(rendered):
    """
    If the helper above were broken — returning large numbers for everything — the sweep
    would pass while measuring nothing. These four are the ratios that were actually
    shipping, so a broken implementation cannot stay green.
    """
    assert contrast('#475569', CARD) < AA_NORMAL
    assert contrast('#64748b', CARD) < AA_NORMAL
    assert contrast('#3b82f6', CARD) < AA_NORMAL
    assert contrast('#ffffff', '#3b82f6') < AA_NORMAL      # the old CTA button
    # and the replacements clear it
    assert contrast('#ffffff', '#15803d') >= AA_NORMAL     # the new CTA button
    assert contrast('#22c55e', CARD) >= AA_NORMAL          # the new link
    assert contrast('#9CB3A3', CARD) >= AA_NORMAL          # the new muted text
    assert contrast('#7E9488', CARD) >= AA_NORMAL          # the new footer text

    # The fragment, on white. #9CB3A3 is right on the dark card and WRONG here, which is
    # the whole reason `_surface_of` exists.
    assert contrast('#9CB3A3', '#ffffff') < AA_NORMAL
    assert contrast('#56685D', '#ffffff') >= AA_NORMAL


def test_emails_hold_no_css_variables(rendered):
    """
    An email client resolves no custom properties, so a `var(--brand-main-green)` here
    renders as nothing at all. This is the one place in the project where a hardcoded hex
    is the correct answer, and it is worth pinning so a later tidy-up does not "fix" it.
    """
    for name, html in rendered.items():
        assert 'var(--' not in html, f'{name} contains a CSS variable, which email cannot resolve'


# ── the report template specifically ─────────────────────────────────────────
#
# Everything above applies to it already, by virtue of being in `rendered`. These
# three cover what the file-wide sweep structurally CANNOT see.


def _report_colours():
    """The hex constants `render.py` declares, read off the module."""
    import src.services.report.render as render

    return {name: value for name, value in vars(render).items()
            if isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value)}


def test_every_report_colour_is_actually_reached_by_the_sample(rendered):
    """
    *** A COLOUR THE SAMPLE NEVER RENDERS IS A COLOUR THIS FILE IS NOT MEASURING. ***

    The sweep above measures the colours it FINDS. That is exactly as good as the
    fixture that produced the HTML, which is D-107's whole lesson: a capture fixture
    sent three keys the API never sends, the page rendered `$NaN` eight times, and both
    gates called it clean. `NEGATIVE` is only emitted when an account is in the red and
    `ACCENT` only when somebody owes somebody — so a sample without a credit card and
    without an IOU row would leave two colours unmeasured while this file reported a
    clean pass over the rest.

    This asserts the sample's coverage instead of trusting it, so a colour added to
    `render.py` fails here until the fixture reaches it. `HAIRLINE` is excluded by the
    regex rather than by name: it is `rgba()`, not hex.
    """
    html = rendered['report_monthly'] + rendered['report_weekly']
    unreached = sorted(f'{name}={value}' for name, value in _report_colours().items()
                       if value.lower() not in html.lower())
    assert unreached == [], (
        'render.py declares these colours and the sample never renders them, so their '
        f'contrast is unmeasured: {unreached}')


# `color:` and `background-color:` inside ONE style attribute — a foreground and the
# surface it is painted on, stated together.
STYLE_BLOCK = re.compile(r'style="([^"]*)"')
FG = re.compile(r'(?<![-\w])color:\s*(#[0-9a-fA-F]{6})')
BG = re.compile(r'background-color:\s*(#[0-9a-fA-F]{6})')


def test_colocated_foreground_and_background_pairs_clear_AA(rendered):
    """
    The pairs the surface-based sweep above is blind to, in EVERY template.

    `_surface_of` measures a template's text against the one surface the template
    paints. That is right for body copy and wrong for anything that paints its own
    chip: the report's cadence badge is `color: #ffffff` on `background-color: #15803d`,
    which is **5.02:1** — a pass, but nowhere near the 16.14:1 the sweep credits it with
    by measuring that same `#ffffff` against the card. The two whites are the identical
    string, so the sweep cannot tell them apart even in principle.

    No failure today. The point is that darkening the brand green would break the badge
    and the CTA button while the sweep above stayed green — so this measures the pair
    where the HTML states it, and BRAND is read from `render.py` rather than repeated.
    """
    failures = []
    checked = 0

    for name, html in rendered.items():
        for block in STYLE_BLOCK.findall(html):
            foregrounds = FG.findall(block)
            backgrounds = BG.findall(block)
            if not (foregrounds and backgrounds):
                continue
            for fg in foregrounds:
                for bg in backgrounds:
                    checked += 1
                    ratio = contrast(fg, bg)
                    if ratio < AA_NORMAL:
                        failures.append(f'{name}: {fg} on {bg} = {ratio:.2f}:1')

    assert checked > 0, (
        'no co-located colour pairs found at all. The report badge is one, so either '
        'the regex is stale or the badge lost its own background — and the sweep above '
        'would then be measuring its white against the wrong surface, silently.')
    assert failures == [], (
        'text below WCAG AA against the surface stated beside it:\n  '
        + '\n  '.join(sorted(set(failures))))


def test_the_reports_badge_is_the_pair_that_needs_watching(rendered):
    """The one measured value behind the test above, written out so a palette change
    cannot quietly turn it into a failure the sweep would not report.

    White on the brand green is 5.02:1 — it clears AA and it has the least headroom of
    anything in the report. `render.py`'s own docstring records the other side of the
    same decision: `#15803d` as TEXT on the card is 3.22:1, which is why brand green is
    a surface here and never a foreground.
    """
    colours = _report_colours()
    assert contrast('#ffffff', colours['BRAND']) >= AA_NORMAL, (
        f"white on BRAND={colours['BRAND']} is "
        f"{contrast('#ffffff', colours['BRAND']):.2f}:1 — the cadence badge is now "
        f"below AA, and the file-wide sweep measures that white against the CARD so it "
        f"will not tell you")
    assert contrast(colours['BRAND'], colours['CARD']) < AA_NORMAL, (
        'brand green now clears AA as text on the card. That is good news, but '
        "render.py's docstring says it does not and it is treated as a surface only — "
        'so re-measure and rewrite that note rather than deleting this line.')
