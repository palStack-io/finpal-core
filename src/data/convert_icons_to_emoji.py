"""
Convert FontAwesome icon names to emoji equivalents
Run this to update default_categories.py with emoji icons
"""

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

    # Default fallback
    'fa-tag': '🏷️',
    'fa-folder': '📁',
}

def convert_icon(fa_icon):
    """Convert FontAwesome icon name to emoji"""
    return ICON_MAP.get(fa_icon, '📁')  # Default to folder emoji

if __name__ == '__main__':
    print("Icon conversion map ready!")
    print(f"Total icons mapped: {len(ICON_MAP)}")
