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

@pytest.fixture
def rendered(app, monkeypatch):
    """
    The HTML each send method actually produces, keyed by method name.

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
        'send_monthly_report_email': dict(
            to_email='a@b.test', user_name='Ann', report_link='https://example.test/m',
            report_data={'total_income': 100, 'total_expenses': 50, 'net': 50,
                         'month': 'August', 'year': 2026, 'savings_rate': 50,
                         'top_categories': [], 'transaction_count': 3}),
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
    assert len(rendered) >= 7, (
        f'only rendered {sorted(rendered)} — this gate is measuring almost nothing'
    )
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
