"""convert FontAwesome category icons to emoji

web-ui renders `categories.icon` as text, which is correct for an emoji and prints a
class name for anything else. `Category.icon` defaulted to "fa-tag" and every one of the
147 icons in src/data/default_categories.py was a FontAwesome name, so a fresh install
seeded a category tree that displayed "fa-home", "fa-money-bill-wave" and so on as
literal text. FontAwesome has never been a dependency of this project.

The defaults and the seed data are emoji as of this change; this migration is for rows
that already exist. src/data/convert_icons_to_emoji.py was written for exactly this and
never applied — its __main__ printed a message and nothing else.

THE MAP IS COPIED IN RATHER THAN IMPORTED. A migration has to keep doing the same thing
to the same database a year from now, and importing application code makes its behaviour
depend on a file that is free to change. The copy is generated from ICON_MAP.

Unmapped `fa-*` values fall back to 📁 — the same fallback convert_icon() uses, and the
same one web-ui's categoryIcon() applies at render time for anyone who never runs this.

Revision ID: c7e3b5f1a2d8
Revises: 8f2c1a9d4e7b
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7e3b5f1a2d8'
down_revision = '8f2c1a9d4e7b'
branch_labels = None
depends_on = None


FALLBACK = '\U0001F4C1'  # 📁

ICON_MAP = {
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
    'fa-car': '🚗',
    'fa-gas-pump': '⛽',
    'fa-wrench': '🔧',
    'fa-parking': '🅿️',
    'fa-bus': '🚌',
    'fa-taxi': '🚕',
    'fa-road': '🛣️',
    'fa-id-card': '🪪',
    'fa-utensils': '🍽️',
    'fa-shopping-cart': '🛒',
    'fa-hamburger': '🍔',
    'fa-coffee': '☕',
    'fa-wine-glass': '🍷',
    'fa-motorcycle': '🏍️',
    'fa-box': '📦',
    'fa-shopping-bag': '🛍️',
    'fa-tshirt': '👕',
    'fa-mobile-alt': '📱',
    'fa-desktop': '🖥️',
    'fa-book': '📚',
    'fa-dumbbell': '🏋️',
    'fa-spa': '💆',
    'fa-paw': '🐾',
    'fa-film': '🎬',
    'fa-music': '🎵',
    'fa-gamepad': '🎮',
    'fa-football-ball': '⚽',
    'fa-palette': '🎨',
    'fa-camera': '📷',
    'fa-hospital': '🏥',
    'fa-pills': '💊',
    'fa-user-md': '👨\u200d⚕️',
    'fa-tooth': '🦷',
    'fa-eye': '👁️',
    'fa-heartbeat': '💓',
    'fa-running': '🏃',
    'fa-swimming-pool': '🏊',
    'fa-bicycle': '🚴',
    'fa-plane': '✈️',
    'fa-hotel': '🏨',
    'fa-suitcase': '🧳',
    'fa-train': '🚆',
    'fa-graduation-cap': '🎓',
    'fa-school': '🏫',
    'fa-pencil-alt': '✏️',
    'fa-file-invoice': '📄',
    'fa-credit-card': '💳',
    'fa-university': '🏛️',
    'fa-balance-scale': '⚖️',
    'fa-cut': '✂️',
    'fa-soap': '🧼',
    'fa-hand-sparkles': '✨',
    'fa-dog': '🐕',
    'fa-cat': '🐈',
    'fa-seedling': '🌱',
    'fa-leaf': '🍃',
    'fa-tree': '🌳',
    'fa-hand-holding-heart': '❤️',
    'fa-donate': '🤲',
    'fa-hands-helping': '🤝',
    'fa-chart-pie': '📊',
    'fa-file-alt': '📝',
    'fa-envelope': '✉️',
    'fa-print': '🖨️',
    'fa-bullhorn': '📣',
    'fa-shipping-fast': '📮',
    'fa-handshake': '🤝',
    'fa-coins-stacked': '💰',
    'fa-piggy-bank': '🐷',
    'fa-dollar-sign': '💵',
    'fa-wallet': '👛',
    'fa-landmark': '🏛️',
    'fa-bitcoin-sign': '₿',
    'fa-baby': '👶',
    'fa-baby-carriage': '🍼',
    'fa-basketball-ball': '🏀',
    'fa-bitcoin': '₿',
    'fa-bone': '🦴',
    'fa-book-open': '📖',
    'fa-calendar-day': '📅',
    'fa-chalkboard-teacher': '🧑\u200d🏫',
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
    'fa-tag': '🏷️',
    'fa-folder': '📁',
}


def _convert(table):
    """Rewrite every `fa-*` icon in `table` to its emoji. Returns rows changed."""
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(f'SELECT id, icon FROM {table} WHERE icon LIKE :p'), {'p': 'fa-%'}
    ).fetchall()

    changed = 0
    for row_id, icon in rows:
        emoji = ICON_MAP.get((icon or '').strip(), FALLBACK)
        conn.execute(
            sa.text(f'UPDATE {table} SET icon = :i WHERE id = :id'),
            {'i': emoji, 'id': row_id},
        )
        changed += 1
    return changed


def upgrade():
    # `tags` carries no icon column; only categories store one.
    _convert('categories')


def downgrade():
    # Not reversible, and saying so is better than pretending. The FontAwesome name a
    # given emoji came from is not recoverable: the map is many-to-one (fa-wrench and
    # fa-tools are both 🔧, fa-handshake and fa-hands-helping are both 🤝), and an icon
    # the user has since chosen themselves is indistinguishable from a converted one.
    # Nothing downstream reads the old form, so there is nothing to restore it for.
    pass
