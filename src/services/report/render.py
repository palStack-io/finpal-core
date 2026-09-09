"""The report as HTML, from the report dict and nothing else.

*** PURE `dict -> str`. NO DATABASE, NO APP CONTEXT, NO QUERIES. *** That is
not an aesthetic preference: it is what lets this function's guard be fed
`build_report`'s **real output** instead of a hand-written fixture. D-107 was a
capture fixture that sent three keys the API never sends — the page rendered
`$NaN` eight times and both gates called it clean, because NaN text has a
contrast ratio and a NaN does not overflow. Here, a key the builder stops
producing raises a KeyError in a test rather than printing into an inbox.

COLOUR RULES, ALL MEASURED RATHER THAN CHOSEN (D-129):

* **Literal hex only.** An email client resolves no `var()`; a variable
  renders unstyled.
* **This template paints its own surface.** `send_import_review_email` is a
  bare fragment with no background of its own, and a file-wide colour sweep
  once took its text to 2.24:1 while improving every other template. Contrast
  here is a property of the template, not of whatever the mail client supplies.
* Every foreground below is ≥ 4.5:1 on `CARD`, measured with the same formula
  `tests/unit/test_email_templates_are_on_brand.py` uses.
* *** `#ef4444`, THE APP'S SEMANTIC RED, IS 4.29:1 ON THIS CARD AND IS
  THEREFORE NOT USED HERE. *** `#fca5a5` is 8.5:1 and says the same thing. The
  rest of the palette can keep the accent it uses on a light web page; this
  surface cannot.
* Brand green is a SURFACE here, not text: `#15803d` as text on the card is
  3.22:1, while white on `#15803d` is 5.02:1.
"""
from html import escape

from src.utils.money import format_money

PAGE = '#0E1711'          # --kt-wash
CARD = '#16241A'          # --kt-card
BRAND = '#15803d'         # a surface; white on it is 5.02:1
HEADING = '#ffffff'       # 16.14:1
BODY = '#e2e8f0'          # 13.09:1
MUTED = '#9CB3A3'         # 7.22:1
ACCENT = '#86efac'        # 11.49:1
BAR = '#22c55e'           # a bar is a surface, and 7.08:1 against the card
NEGATIVE = '#fca5a5'      # 8.5:1 — NOT #ef4444, which is 4.29:1 here
HAIRLINE = 'rgba(255, 255, 255, 0.1)'

FONT = ("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
        "'Helvetica Neue', Arial, sans-serif")

UP, DOWN, FLAT = '▲', '▼', '■'
_ARROWS = {'up': UP, 'down': DOWN, 'flat': FLAT}


def _money(report, amount, **kwargs):
    currency = report['currency']
    return escape(format_money(amount, currency['code'], currency['locale'],
                               **kwargs))


def _section(title, body):
    return f'''
        <tr>
            <td style="padding: 8px 40px 0;">
                <h2 style="margin: 24px 0 12px; color: {HEADING}; font-size: 16px;
                           font-weight: 600; letter-spacing: 0.02em;">{escape(title)}</h2>
                {body}
            </td>
        </tr>'''


def _nothing(message):
    return (f'<p style="margin: 0 0 8px; color: {MUTED}; font-size: 14px;">'
            f'{escape(message)}</p>')


def _tiles(report):
    cells = []
    for tile in report['tiles']:
        delta = ''
        if tile['delta'] is not None and tile['delta_direction']:
            # Factual, not editorial: the arrow says which way the number
            # moved. Whether spending more is bad is a judgement this report
            # does not make, so the colour does not vary with it either.
            delta = (
                f'<div style="margin-top: 4px; color: {MUTED}; font-size: 12px;">'
                f'{_ARROWS[tile["delta_direction"]]} '
                f'{_money(report, abs(tile["delta"]))} vs last period</div>')
        cells.append(f'''
                <td style="width: 50%; padding: 8px; vertical-align: top;">
                    <div style="padding: 16px; background-color: {PAGE};
                                border-radius: 12px; border: 1px solid {HAIRLINE};">
                        <div style="color: {MUTED}; font-size: 12px;
                                    text-transform: uppercase; letter-spacing: 0.06em;"
                        >{escape(tile['label'])}</div>
                        <div style="margin-top: 6px; color: {HEADING};
                                    font-size: 22px; font-weight: 700;"
                        >{_money(report, tile['value'])}</div>
                        {delta}
                    </div>
                </td>''')

    rows = ''.join(
        f'<tr>{"".join(cells[i:i + 2])}</tr>' for i in range(0, len(cells), 2))
    return (f'<table role="presentation" style="width: 100%; '
            f'border-collapse: collapse;">{rows}</table>')


def _spend(report):
    rows = report['spend']['rows']
    if not rows:
        return _nothing('No spending recorded in this period.')

    lines = []
    for row in rows:
        lines.append(f'''
                <tr>
                    <td style="padding: 6px 0; color: {BODY}; font-size: 14px;">{escape(row['name'])}</td>
                    <td style="padding: 6px 0; width: 45%;">
                        <div style="background-color: {PAGE}; border-radius: 6px; height: 10px;">
                            <div style="width: {row['pct']}%; background-color: {BAR};
                                        height: 10px; border-radius: 6px;">&nbsp;</div>
                        </div>
                    </td>
                    <td style="padding: 6px 0 6px 12px; color: {HEADING}; font-size: 14px;
                               font-weight: 600; text-align: right; white-space: nowrap;"
                    >{_money(report, row['amount'])}</td>
                </tr>''')

    total = _money(report, report['spend']['total'])
    return f'''<table role="presentation" style="width: 100%; border-collapse: collapse;">
                {''.join(lines)}
                <tr>
                    <td colspan="2" style="padding: 12px 0 0; border-top: 1px solid {HAIRLINE};
                               color: {MUTED}; font-size: 13px;">Total</td>
                    <td style="padding: 12px 0 0 12px; border-top: 1px solid {HAIRLINE};
                               color: {HEADING}; font-size: 15px; font-weight: 700;
                               text-align: right; white-space: nowrap;">{total}</td>
                </tr>
            </table>'''


def _accounts(report, accounts, empty_message, negative_is_debt=False):
    if not accounts:
        return _nothing(empty_message)
    lines = []
    for account in accounts:
        balance = account['balance']
        colour = NEGATIVE if (negative_is_debt or (balance or 0) < 0) else HEADING
        lines.append(f'''
                <tr>
                    <td style="padding: 6px 0; color: {BODY}; font-size: 14px;">{escape(account['name'])}</td>
                    <td style="padding: 6px 0; color: {colour}; font-size: 14px;
                               font-weight: 600; text-align: right; white-space: nowrap;"
                    >{_money(report, balance)}</td>
                </tr>''')
    return (f'<table role="presentation" style="width: 100%; border-collapse: '
            f'collapse;">{"".join(lines)}</table>')


def _iou(report):
    rows = report['iou']['rows']
    if not rows:
        return _nothing('Nobody owes anybody anything right now.')
    lines = []
    for row in rows:
        lines.append(f'''
                <tr>
                    <td style="padding: 6px 0; color: {BODY}; font-size: 14px;">
                        <strong style="color: {ACCENT};">{escape(row['who'])}</strong>
                        owes {escape(row['owes_whom'])}
                    </td>
                    <td style="padding: 6px 0; color: {HEADING}; font-size: 14px;
                               font-weight: 600; text-align: right; white-space: nowrap;"
                    >{_money(report, row['amount'])}</td>
                </tr>''')
    return (f'<table role="presentation" style="width: 100%; border-collapse: '
            f'collapse;">{"".join(lines)}</table>')


def _trend(report):
    points = report['trend']
    if not points:
        # An empty series is a valid answer. `get_networth_trend` used to
        # manufacture a 12-month series out of current balances and it was
        # inverted; padding this would reinvent that.
        return _nothing('Not enough history yet to show a net-worth trend.')

    biggest = max(abs(point['net_worth']) for point in points) or 1
    lines = []
    for point in points:
        width = int(abs(point['net_worth']) / biggest * 100)
        colour = NEGATIVE if point['net_worth'] < 0 else BAR
        lines.append(f'''
                <tr>
                    <td style="padding: 6px 0; color: {MUTED}; font-size: 13px;
                               white-space: nowrap;">{escape(point['month'])}</td>
                    <td style="padding: 6px 0 6px 12px; width: 55%;">
                        <div style="background-color: {PAGE}; border-radius: 6px; height: 10px;">
                            <div style="width: {width}%; background-color: {colour};
                                        height: 10px; border-radius: 6px;">&nbsp;</div>
                        </div>
                    </td>
                    <td style="padding: 6px 0 6px 12px; color: {BODY}; font-size: 13px;
                               text-align: right; white-space: nowrap;"
                    >{_money(report, point['net_worth'])}</td>
                </tr>''')
    return (f'<table role="presentation" style="width: 100%; border-collapse: '
            f'collapse;">{"".join(lines)}</table>')


def render_html(report):
    """The whole email body for one report payload.

    Every figure goes through `format_money`, which honours the household's
    currency and `number_locale` and refuses `None` — so a missing figure
    raises here rather than rendering as `$0.00`, which would read as a
    measurement (D-108).
    """
    names = ' & '.join(escape(name) for name in report['household']['names'])
    cadence = 'Weekly' if report['cadence'] == 'weekly' else 'Monthly'

    sections = [
        _section('The numbers', _tiles(report)),
        _section('Where it went', _spend(report)),
        _section('Cards', _accounts(report, report['balances']['credit'],
                                    'No credit cards on file.',
                                    negative_is_debt=True)),
        _section('Cash', _accounts(report, report['balances']['cash'],
                                   'No cash accounts on file.')),
        _section('Settling up', _iou(report)),
    ]
    if report['trend'] is not None:
        sections.append(_section('Net worth', _trend(report)))

    return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: {FONT}; background-color: {PAGE};">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto;
                       background-color: {CARD}; border-radius: 16px;
                       border: 1px solid {HAIRLINE}; overflow: hidden;">
                    <tr>
                        <td style="padding: 32px 40px 0;">
                            <div style="display: inline-block; padding: 6px 12px;
                                        background-color: {BRAND}; border-radius: 999px;
                                        color: #ffffff; font-size: 12px; font-weight: 600;
                                        letter-spacing: 0.04em;">finPal · {cadence} report</div>
                            <h1 style="margin: 16px 0 4px; color: {HEADING};
                                       font-size: 24px; font-weight: 700;"
                            >{escape(report['period']['label'])}</h1>
                            <p style="margin: 0; color: {MUTED}; font-size: 14px;">{names}</p>
                        </td>
                    </tr>
                    {''.join(sections)}
                    <tr>
                        <td style="padding: 24px 40px 32px;">
                            <p style="margin: 24px 0 0; padding-top: 16px;
                                      border-top: 1px solid {HAIRLINE};
                                      color: {MUTED}; font-size: 12px; line-height: 1.6;">
                                These are your own figures, straight from finPal. Nothing here
                                is advice.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>'''


# ── The plain-text alternative ───────────────────────────────────────────────
#
# *** THIS IS DELIVERABILITY, NOT COURTESY. OWNER DECISION B8, 2026-09-08. ***
#
# The report went out for its first two real sends as an HTML-only
# `multipart/alternative` with exactly one part. That is a spam signal at most
# large providers, and it is the one thing about this email that could stop it
# arriving at all — which no amount of testing the HTML would ever surface,
# because the message renders perfectly right up until it is filtered.
#
# `EmailService.send_email` has taken a `text_body` since it was written and the
# report was the one caller that never passed one.
#
# *** IT IS A SECOND RENDERER OVER THE SAME PAYLOAD, NOT A STRIPPED COPY OF THE
# HTML. *** Running a tag-stripper over `render_html` would inherit every layout
# table as whitespace and, worse, would go silently stale in the one direction
# that matters: a section added to the HTML would appear in the text as a blob of
# markup rather than not at all, so nothing would look broken.
#
# The guard against the two drifting is `test_report_text.py`, which asserts that
# every money figure in the HTML also appears in the text. A section added to one
# renderer and forgotten in the other fails it.

def _text_money(report, amount, **kwargs):
    """No `escape` — this is the whole difference from `_money`, and it matters.

    `&amp;` in a plain-text part is a bug the HTML part cannot have.
    """
    currency = report['currency']
    return format_money(amount, currency['code'], currency['locale'], **kwargs)


def _text_rows(pairs, width=None):
    """`label .... value`, right-aligned to the longest value in the block.

    Aligned per block rather than to a fixed column: a report in JPY or INR has
    much longer figures than one in USD, and a hardcoded column would wrap them
    onto the next line in exactly the currencies whose users are least likely to
    be reading English.
    """
    if not pairs:
        return []
    width = width or max(len(value) for _, value in pairs)
    return [f'  {label}' + ' ' * max(1, 34 - len(label)) + value.rjust(width)
            for label, value in pairs]


def render_text(report):
    """The same report as `render_html`, as plain text.

    Fed the builder's real output, so it cannot drift from the figures — which is
    the same reason A5 renders the HTML from a payload rather than from the
    database. `format_money` still refuses `None`, so a missing figure raises here
    too rather than printing as `0.00` (D-108).
    """
    cadence = 'Weekly' if report['cadence'] == 'weekly' else 'Monthly'
    out = [
        f"finPal · {cadence} report",
        report['period']['label'],
        ' & '.join(report['household']['names']),
        '',
        'THE NUMBERS',
    ]

    for tile in report['tiles']:
        line = f"  {tile['label']}: {_text_money(report, tile['value'])}"
        if tile['delta'] is not None and tile['delta_direction']:
            # The same words the HTML's arrow means, spelled out. An arrow
            # glyph in a plain-text part is a mojibake risk for no benefit.
            direction = {'up': 'up', 'down': 'down', 'flat': 'level'}[tile['delta_direction']]
            line += (f" ({direction} {_text_money(report, abs(tile['delta']))}"
                     f" vs last period)")
        out.append(line)

    out += ['', 'WHERE IT WENT']
    if report['spend']['rows']:
        out += _text_rows([(row['name'], _text_money(report, row['amount']))
                           for row in report['spend']['rows']]
                          + [('Total', _text_money(report, report['spend']['total']))])
    else:
        out.append('  No spending recorded in this period.')

    for title, accounts, empty in (
            ('CARDS', report['balances']['credit'], 'No credit cards on file.'),
            ('CASH', report['balances']['cash'], 'No cash accounts on file.')):
        out += ['', title]
        if accounts:
            out += _text_rows([(a['name'], _text_money(report, a['balance']))
                               for a in accounts])
        else:
            out.append(f'  {empty}')

    out += ['', 'SETTLING UP']
    if report['iou']['rows']:
        out += [f"  {row['who']} owes {row['owes_whom']}: "
                f"{_text_money(report, row['amount'])}"
                for row in report['iou']['rows']]
    else:
        out.append('  Nobody owes anybody anything right now.')

    # Monthly only, exactly as in the HTML — `trend` is None for a weekly report,
    # which is not the same thing as an empty series.

    if report['trend'] is not None:
        out += ['', 'NET WORTH']
        if report['trend']:
            out += _text_rows([(p['month'], _text_money(report, p['net_worth']))
                               for p in report['trend']])
        else:
            out.append('  Not enough history yet to show a net-worth trend.')

    out += ['', 'These are your own figures, straight from finPal. '
                'Nothing here is advice.']
    return '\n'.join(out) + '\n'
