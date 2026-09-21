"""
Convert FontAwesome icon names to emoji equivalents
Run this to update default_categories.py with emoji icons
"""
import re

#: A FontAwesome class name: ``fa-``, ``fas-``, ``far-``, ``fal-``, ``fab-``, ``fad-``.
_FA_NAME = re.compile(r'^fa[srlbd]?-')

ICON_MAP = {
    # Income & Money
    'fa-money-bill-wave': '💵',
    'fa-briefcase': '💼',
    'fa-laptop-code': '💻',
    'fa-store': '🏪',
    'fa-chart-line': '📈',
    'fa-coins': '🪙',
    'fa-percent': '💹',
    'fa-home': '🏠',
    'fa-gift': '🎁',
    'fa-undo': '↩️',
    'fa-cash-register': '💰',
    'fa-plus-circle': '➕',

    # Housing
    'fa-building': '🏢',
    'fa-file-invoice-dollar': '🧾',
    'fa-shield-alt': '🛡️',
    'fa-users': '👥',
    'fa-bolt': '⚡',
    'fa-tint': '💧',
    'fa-fire': '🔥',
    'fa-wifi': '📡',
    'fa-phone': '📞',
    'fa-tv': '📺',
    'fa-tools': '🔧',
    'fa-couch': '🛋️',
    'fa-paint-brush': '🎨',

    # Transportation
    'fa-car': '🚗',
    'fa-gas-pump': '⛽',
    'fa-wrench': '🔧',
    'fa-parking': '🅿️',
    'fa-bus': '🚌',
    'fa-taxi': '🚕',
    'fa-road': '🛣️',
    'fa-id-card': '🪪',

    # Food
    'fa-utensils': '🍽️',
    'fa-shopping-cart': '🛒',
    'fa-hamburger': '🍔',
    'fa-coffee': '☕',
    'fa-wine-glass': '🍷',
    'fa-motorcycle': '🏍️',
    'fa-box': '📦',

    # Shopping
    'fa-shopping-bag': '🛍️',
    'fa-tshirt': '👕',
    'fa-mobile-alt': '📱',
    'fa-desktop': '🖥️',
    'fa-book': '📚',
    'fa-dumbbell': '🏋️',
    'fa-spa': '💆',
    'fa-paw': '🐾',

    # Entertainment
    'fa-film': '🎬',
    'fa-music': '🎵',
    'fa-gamepad': '🎮',
    'fa-football-ball': '⚽',
    'fa-palette': '🎨',
    'fa-camera': '📷',

    # Healthcare
    'fa-hospital': '🏥',
    'fa-pills': '💊',
    'fa-user-md': '👨‍⚕️',
    'fa-tooth': '🦷',
    'fa-eye': '👁️',
    'fa-heartbeat': '💓',

    # Fitness
    'fa-running': '🏃',
    'fa-swimming-pool': '🏊',
    'fa-bicycle': '🚴',

    # Travel
    'fa-plane': '✈️',
    'fa-hotel': '🏨',
    'fa-suitcase': '🧳',
    'fa-train': '🚆',

    # Education
    'fa-graduation-cap': '🎓',
    'fa-school': '🏫',
    'fa-pencil-alt': '✏️',

    # Bills & Fees
    'fa-file-invoice': '📄',
    'fa-credit-card': '💳',
    'fa-university': '🏛️',
    'fa-balance-scale': '⚖️',

    # Personal Care
    'fa-cut': '✂️',
    'fa-soap': '🧼',
    'fa-hand-sparkles': '✨',

    # Pet Care
    'fa-dog': '🐕',
    'fa-cat': '🐈',

    # Home & Garden
    'fa-seedling': '🌱',
    'fa-leaf': '🍃',
    'fa-tree': '🌳',

    # Charity
    'fa-hand-holding-heart': '❤️',
    'fa-donate': '🤲',
    'fa-hands-helping': '🤝',

    # Business
    'fa-chart-pie': '📊',
    'fa-file-alt': '📝',
    'fa-envelope': '✉️',
    'fa-print': '🖨️',
    'fa-bullhorn': '📣',
    'fa-shipping-fast': '📮',
    'fa-handshake': '🤝',

    # Investments
    'fa-coins-stacked': '💰',
    'fa-piggy-bank': '🐷',
    'fa-dollar-sign': '💵',
    'fa-wallet': '👛',
    'fa-landmark': '🏛️',
    'fa-bitcoin-sign': '₿',

    # ── Added 2026-08-19 while actually applying this map ────────────────────
    # 37 icons used by default_categories.py had no entry here, so a conversion
    # would have collapsed them all onto the 📁 fallback and made a third of the
    # category tree look identical. The map is only useful if it covers the data
    # it is pointed at — checked with a set difference, not by eye.
    'fa-baby': '👶',
    'fa-baby-carriage': '🍼',
    'fa-basketball-ball': '🏀',
    'fa-bitcoin': '₿',
    'fa-bone': '🦴',
    'fa-book-open': '📖',
    'fa-calendar-day': '📅',
    'fa-chalkboard-teacher': '🧑‍🏫',
    'fa-chess': '♟️',
    'fa-child': '🧒',
    'fa-ellipsis-h': '📦',
    'fa-exclamation-triangle': '⚠️',
    'fa-futbol': '⚽',
    'fa-globe': '🌍',
    'fa-hand-holding-usd': '🤲',
    'fa-heart': '❤️',
    'fa-hiking': '🥾',
    'fa-laptop': '💻',
    'fa-life-ring': '🛟',
    'fa-makeup': '💄',
    'fa-map-marker-alt': '📍',
    'fa-money-check-alt': '💳',
    'fa-pen': '🖊️',
    'fa-plane-departure': '✈️',
    'fa-pray': '🙏',
    'fa-pump-soap': '🧼',
    'fa-puzzle-piece': '🧩',
    'fa-question': '❓',
    'fa-receipt': '🧾',
    'fa-shoe-prints': '👟',
    'fa-stethoscope': '🩺',
    'fa-sync': '🔄',
    'fa-ticket-alt': '🎟️',
    'fa-umbrella-beach': '🏖️',
    'fa-user-tie': '👔',
    'fa-watch': '⌚',
    'fa-wheelchair': '♿',

    # *** FIVE NAMES THE SIGNUP SEEDER WRITES THAT THIS MAP DID NOT KNOW. ***
    # Measured 2026-09-16 by running every icon in
    # `auth/service.py::create_default_categories` through this function: 28
    # names, 5 of which came back as the folder. So even a correct, idempotent,
    # once-only conversion left five categories — including Groceries, which is
    # most people's biggest one — sharing the fallback with each other.
    # `default_categories.py` needs none of these: it has 147 icons, 98
    # distinct, and ZERO folders. The gap was only ever in the second seeder.
    'fa-shopping-basket': '🧺',
    'fa-play-circle': '▶️',
    'fa-prescription-bottle': '💊',
    'fa-user': '🧍',
    'fa-question-circle': '❔',

    # Default fallback
    'fa-tag': '🏷️',
    'fa-folder': '📁',
}

#: What a value with no known mapping becomes.
FALLBACK = '📁'


def is_legacy_icon_name(icon):
    """True for a FontAwesome class name, e.g. ``fa-tag`` or ``fas-home``.

    The same predicate `web-ui/src/utils/categoryIcon.ts` uses, deliberately —
    the client already refuses to render a class name and this is the server
    side of the identical question.
    """
    return isinstance(icon, str) and bool(_FA_NAME.match(icon.strip()))


def convert_icon(fa_icon):
    """Convert a FontAwesome icon name to emoji. Anything else passes through.

    *** THIS FUNCTION WAS NOT IDEMPOTENT, AND THAT COLLAPSED EVERY CATEGORY ICON
    ON THE LIVE DEMO TO A FOLDER. ***

    It was ``ICON_MAP.get(fa_icon, '📁')``. `ICON_MAP` is keyed by `fa-*` names,
    so an ALREADY-CONVERTED emoji is not in it and came back as the fallback:

        convert_icon('fa-home')  -> '🏠'
        convert_icon('🏠')       -> '📁'      <- the defect

    Measured on `findemo.palstack.io` 2026-09-16: **275 categories, 275 of them
    `'📁'`** — one distinct value across the whole table.

    *** AND THE TRIGGER WAS NOT A MIGRATION RUNNING TWICE, WHICH IS WHAT THIS
    NOTE FIRST SAID. *** It is a stale conversion call on data that had already
    been converted at the SOURCE. `src/data/default_categories.py` was migrated
    from FontAwesome names to emoji (the reason `categoryIcon.ts` exists), and
    `src/data/seed_defaults.py` kept calling `convert_icon()` on those values —
    two live call sites, both still commented *"Convert FontAwesome to emoji"*,
    describing data that had stopped being FontAwesome. So every FRESH SEED
    wrote 147 folders, before any migration was involved at all. Nothing was
    missing from the map: it knows all 28 names the signup seeder writes, and
    `default_categories.py` holds 147 emoji of which 98 are distinct.

    Which makes idempotence the whole fix rather than half of it: with this
    function returning an emoji unchanged, `seed_defaults.py` needs no edit and
    a fresh install seeds **147 icons, 98 distinct, zero folders**. The
    comments there are now wrong rather than harmful, and are corrected.

    *** AND IT IS THE SHAPE, NOT THE MAP, THAT MATTERS: A CONVERSION THAT IS NOT
    IDEMPOTENT CANNOT SAFELY BE RE-RUN, AND finPal's SCHEMA COMES FROM
    ``create_all()`` RATHER THAN ALEMBIC ON A DEFAULT DEPLOY (D-121). *** So
    "has this migration already run here?" is a question this project cannot
    reliably answer, which makes re-running the safe assumption rather than the
    edge case. A one-way conversion in that setting is a loaded gun.

    Now: an `fa-*` name is mapped, an unmapped `fa-*` name becomes the fallback
    so a class name is never shown to a user, and **anything else is returned
    unchanged** — an emoji, an empty value, or `None`. Converting twice is the
    same as converting once.
    """
    if not isinstance(fa_icon, str):
        return fa_icon
    trimmed = fa_icon.strip()
    if not is_legacy_icon_name(trimmed):
        # Already an emoji, or something this function has no opinion about.
        # Returning the fallback here is what destroyed the demo's icons.
        return fa_icon
    return ICON_MAP.get(trimmed, FALLBACK)

if __name__ == '__main__':
    print("Icon conversion map ready!")
    print(f"Total icons mapped: {len(ICON_MAP)}")
