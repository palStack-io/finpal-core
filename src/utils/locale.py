"""Number-locale preference validation (#132).

The stored tag is handed straight to `Intl.NumberFormat` in web-ui and in mobile, and
`Intl` THROWS a `RangeError` on a malformed tag. So an unvalidated string here is not a
cosmetic problem: it is a crash on every screen that renders money, in two clients, for as
long as the value sits in the row. It is validated at the door instead.

Deliberately a shape check and not a whitelist of locales. A whitelist would have to be
kept in step with whatever `Intl` supports in two runtimes and would refuse legitimate
tags nobody thought of; the shape is what `Intl` actually requires.
"""
import re

# BCP-47, restricted to the subtags that matter for formatting a number: language,
# optional script, optional region, optional variants. Deliberately not the full grammar
# (no extensions or private-use), because none of it changes a decimal separator and a
# looser pattern is a wider hole.
_BCP47 = re.compile(
    r'^[a-z]{2,3}'          # language
    r'(-[A-Z][a-z]{3})?'     # script, e.g. Latn
    r'(-([A-Z]{2}|\d{3}))?'  # region, e.g. DE or 419
    r'(-[0-9a-zA-Z]{5,8}|-\d[0-9a-zA-Z]{3})*$'  # variants
)

NUMBER_LOCALE_MAX_LENGTH = 35


def is_a_usable_number_locale(value):
    """True if `Intl.NumberFormat` will accept this tag rather than throwing."""
    if not isinstance(value, str) or not value:
        return False
    if len(value) > NUMBER_LOCALE_MAX_LENGTH:
        return False
    return bool(_BCP47.match(value))
