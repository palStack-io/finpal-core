"""Category icons are KEYS, not emoji (Wave 0 of the revamp, 2026-11-20; design standard: no emoji icons).

`categories.icon` stores a stable key such as ``coffee`` or ``piggy-bank``. Each key is the kebab-case name of the
lucide line icon the clients draw for it (lucide-react on the web, lucide-react-native on the phone), so a client maps
a key to a component with no table of its own. The key for each old emoji is the icon web-ui's `CategoryGlyph` already
drew for it, so the web looks the same after the switch.

*** THE API'S `icon` FIELD STILL CARRIES AN EMOJI, AND `icon_key` CARRIES THE KEY. *** Phone builds already in the
stores and today's web read `icon` and draw it as text (or map the emoji themselves), so `icon` keeps answering an
emoji for every key (`legacy_text`) and a person's own emoji unchanged. New clients read `icon_key` (null for a
person's own emoji). Writes accept either: a key, or one of the emoji below, is stored as the key (`to_key`);
anything else is the person's own icon and is stored as typed.

`LEGACY_EMOJI` is every emoji a finPal seeder, default or the old FontAwesome conversion has ever written (the
default tree, the signup tree via `convert_icons_to_emoji.ICON_MAP`, `auto_categorize.py`, the `🏷️` default, the
`📁` fallback) plus the web picker's suggestions. Its first emoji for a key is the one `legacy_text` answers. The
boot-time correction that rewrites existing rows (`src/services/category/icon_keys.py`) reads this table
directly; premium does the same with an Alembic migration.
"""

#: Old emoji -> key. Matching ignores U+FE0F (the emoji presentation selector), which some writers dropped.
LEGACY_EMOJI = {
    '💵': 'banknote', '💼': 'briefcase', '💻': 'laptop', '🏪': 'store', '📈': 'trending-up', '🪙': 'coins',
    '💹': 'chart-line', '🏠': 'house', '🎁': 'gift', '↩️': 'undo-2', '💰': 'wallet', '➕': 'plus', '🏢': 'building-2',
    '🧾': 'receipt', '🛡️': 'shield', '👥': 'users', '⚡': 'zap', '💧': 'droplet', '🔥': 'flame', '📡': 'wifi',
    '📞': 'phone', '📺': 'tv', '🔧': 'wrench', '🛋️': 'sofa', '🎨': 'palette', '🚗': 'car', '⛽': 'fuel',
    '🅿️': 'square-parking', '🚌': 'bus', '🚕': 'car-taxi-front', '🛣️': 'route', '🪪': 'id-card', '🍽️': 'utensils',
    '🛒': 'shopping-cart', '🍔': 'hamburger', '☕': 'coffee', '🍷': 'wine', '🏍️': 'bike', '📦': 'package',
    '🛍️': 'shopping-bag', '👕': 'shirt', '👟': 'footprints', '⌚': 'watch', '📚': 'book-open', '🌍': 'globe',
    '🖊️': 'pen-line', '💓': 'heart-pulse', '👨\u200d⚕️': 'stethoscope', '🦷': 'smile', '💊': 'pill', '🏋️': 'dumbbell',
    '🏃': 'person-standing', '🏀': 'volleyball', '💆': 'sparkles', '👁️': 'eye', '🎮': 'gamepad-2', '🎬': 'clapperboard',
    '🎵': 'music', '🎟️': 'ticket', '♟️': 'crown', '🔄': 'repeat', '📅': 'calendar-days', '✂️': 'scissors',
    '💄': 'brush', '🧼': 'droplet', '✨': 'sparkles', '🎓': 'graduation-cap', '🏫': 'school', '📖': 'book',
    '🧑\u200d🏫': 'graduation-cap', '✈️': 'plane', '🏨': 'hotel', '🥾': 'mountain', '🐾': 'paw-print', '🦴': 'bone',
    '🩺': 'stethoscope', '👶': 'baby', '🧒': 'baby', '🍼': 'milk', '🧩': 'puzzle', '⚽': 'volleyball', '🤲': 'hand-heart',
    '💳': 'credit-card', '📄': 'file-text', '🐷': 'piggy-bank', '🛟': 'life-buoy', '🏖️': 'tree-palm', '₿': 'bitcoin',
    '❤️': 'heart', '♿': 'accessibility', '🏛️': 'landmark', '📍': 'map-pin', '🤝': 'handshake', '🙏': 'hand-helping',
    '📣': 'megaphone', '👔': 'shirt', '⚠️': 'triangle-alert', '❓': 'circle-help', '▶️': 'play', '⚖️': 'scale',
    '✉️': 'mail', '✏️': 'pencil', '❔': 'circle-help', '🌱': 'sprout', '🌳': 'tree-deciduous', '🍃': 'leaf',
    '🎥': 'film', '🏊': 'waves', '🏡': 'house', '🏥': 'hospital', '🏷️': 'tag', '🐈': 'cat', '🐕': 'dog', '👛': 'wallet',
    '💅': 'sparkles', '💪': 'dumbbell', '📁': 'folder', '📊': 'chart-column', '📝': 'notebook-pen', '📮': 'mailbox',
    '📱': 'smartphone', '📷': 'camera', '🖥️': 'monitor', '🖨️': 'printer', '🚆': 'train-front', '🚴': 'bike',
    '🧍': 'person-standing', '🧳': 'luggage', '🧺': 'shopping-basket',
}

#: Every key a category icon can hold.
ICON_KEYS = frozenset(LEGACY_EMOJI.values())

#: The key a category gets when nothing is chosen (was the emoji 🏷️).
DEFAULT_ICON_KEY = 'tag'

_VS16 = '\ufe0f'
_BY_STRIPPED = {emoji.replace(_VS16, ''): key for emoji, key in LEGACY_EMOJI.items()}
_TEXT = {}
for _emoji, _key in LEGACY_EMOJI.items():
    _TEXT.setdefault(_key, _emoji)


def to_key(value):
    """The key to store for an incoming icon: a key stays, an old finPal emoji becomes its key, else unchanged."""
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if trimmed in ICON_KEYS:
        return trimmed
    return _BY_STRIPPED.get(trimmed.replace(_VS16, ''), value)


def icon_key(stored):
    """The key a client draws, or None when the stored value is a person's own icon."""
    return stored if stored in ICON_KEYS else None


def legacy_text(stored):
    """What the old `icon` field answers: the emoji for a key, anything else as stored."""
    return _TEXT.get(stored, stored)
