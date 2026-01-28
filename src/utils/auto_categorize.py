"""
Auto-categorization utility for transactions
Maps common merchants and keywords to categories
"""

# Merchant and keyword mappings to category names
CATEGORY_MAPPINGS = {
    'Groceries': [
        'walmart', 'costco', 'target', 'whole foods', 'trader joe', 'safeway',
        'kroger', 'publix', 'aldi', 'food lion', 'giant', 'wegmans',
        'grocery', 'supermarket', 'market', 'albertsons', 'stop & shop'
    ],
    'Dining': [
        'restaurant', 'cafe', 'coffee', 'starbucks', 'dunkin', 'mcdonald',
        'burger king', 'wendy', 'taco bell', 'chipotle', 'subway', 'pizza',
        'panera', 'chick-fil-a', 'domino', 'kfc', 'popeyes', 'dining',
        'bar & grill', 'bistro', 'diner', 'food court', 'doordash', 'uber eats',
        'grubhub', 'postmates'
    ],
    'Transportation': [
        'uber', 'lyft', 'gas', 'shell', 'chevron', 'exxon', 'mobil', 'bp',
        'arco', 'citgo', 'parking', 'toll', 'metro', 'bus', 'train',
        'taxi', 'car wash', 'oil change', 'auto repair', 'dmv'
    ],
    'Entertainment': [
        'netflix', 'hulu', 'spotify', 'apple music', 'youtube', 'disney',
        'hbo', 'amazon prime', 'movie', 'theater', 'cinema', 'concert',
        'spotify', 'pandora', 'steam', 'playstation', 'xbox', 'nintendo',
        'twitch', 'amusement park', 'zoo', 'museum'
    ],
    'Shopping': [
        'amazon', 'ebay', 'etsy', 'best buy', 'apple store', 'microsoft store',
        'nordstrom', 'macy', 'tj maxx', 'ross', 'marshalls', 'gap', 'old navy',
        'h&m', 'zara', 'forever 21', 'kohls', 'jcpenney', 'sears', 'wayfair',
        'ikea', 'home depot', 'lowes', 'ace hardware', 'staples', 'office depot'
    ],
    'Utilities': [
        'electric', 'electricity', 'gas bill', 'water bill', 'utility',
        'pg&e', 'edison', 'duke energy', 'comcast', 'xfinity', 'at&t',
        'verizon', 't-mobile', 'sprint', 'internet', 'phone bill', 'cable'
    ],
    'Healthcare': [
        'pharmacy', 'cvs', 'walgreens', 'rite aid', 'hospital', 'clinic',
        'doctor', 'dental', 'dentist', 'medical', 'health', 'urgent care',
        'lab corp', 'quest diagnostics', 'insurance'
    ],
    'Fitness': [
        'gym', 'fitness', '24 hour fitness', 'la fitness', 'planet fitness',
        'equinox', 'yoga', 'pilates', 'crossfit', 'orange theory', 'peloton'
    ],
    'Travel': [
        'airline', 'hotel', 'airbnb', 'expedia', 'booking.com', 'hotels.com',
        'delta', 'united', 'american airlines', 'southwest', 'jetblue',
        'marriott', 'hilton', 'hyatt', 'rental car', 'hertz', 'enterprise'
    ],
    'Education': [
        'tuition', 'school', 'university', 'college', 'course', 'udemy',
        'coursera', 'textbook', 'bookstore', 'library'
    ],
    'Bills & Fees': [
        'subscription', 'membership', 'fee', 'charge', 'payment', 'insurance',
        'rent', 'mortgage', 'loan', 'credit card', 'bank fee', 'late fee'
    ],
    'Personal Care': [
        'salon', 'barber', 'spa', 'nail', 'hair', 'beauty', 'cosmetic',
        'sephora', 'ulta', 'bath & body works'
    ],
    'Pet Care': [
        'pet', 'petco', 'petsmart', 'vet', 'veterinary', 'dog', 'cat',
        'pet food', 'pet store', 'grooming'
    ],
    'Home & Garden': [
        'furniture', 'decor', 'garden', 'lawn', 'plant', 'nursery',
        'bed bath beyond', 'crate and barrel', 'pier 1', 'west elm'
    ],
    'Charity': [
        'donation', 'charity', 'foundation', 'nonprofit', 'red cross',
        'salvation army', 'goodwill', 'church', 'temple', 'mosque'
    ]
}


def auto_categorize_transaction(description, vendor=None):
    """
    Auto-categorize a transaction based on description and vendor

    Args:
        description: Transaction description
        vendor: Optional vendor name

    Returns:
        Category name if match found, None otherwise
    """
    if not description:
        return None

    # Combine description and vendor for matching
    search_text = f"{description} {vendor or ''}".lower()

    # Check each category's keywords
    for category_name, keywords in CATEGORY_MAPPINGS.items():
        for keyword in keywords:
            if keyword.lower() in search_text:
                return category_name

    return None


def get_category_by_name(category_name, user_id):
    """
    Get category object by name for a user
    Creates the category if it doesn't exist

    Args:
        category_name: Name of the category
        user_id: User ID

    Returns:
        Category object
    """
    from src.models.category import Category
    from src.extensions import db

    # Try to find existing category
    category = Category.query.filter_by(
        user_id=user_id,
        name=category_name
    ).first()

    if not category:
        # Create new category
        # Define default icons and colors for categories
        category_defaults = {
            'Groceries': {'icon': '🛒', 'color': '#10b981'},
            'Dining': {'icon': '🍽️', 'color': '#f59e0b'},
            'Transportation': {'icon': '🚗', 'color': '#6366f1'},
            'Entertainment': {'icon': '🎬', 'color': '#ec4899'},
            'Shopping': {'icon': '🛍️', 'color': '#8b5cf6'},
            'Utilities': {'icon': '⚡', 'color': '#3b82f6'},
            'Healthcare': {'icon': '🏥', 'color': '#ef4444'},
            'Fitness': {'icon': '💪', 'color': '#06b6d4'},
            'Travel': {'icon': '✈️', 'color': '#14b8a6'},
            'Education': {'icon': '📚', 'color': '#f97316'},
            'Bills & Fees': {'icon': '📄', 'color': '#64748b'},
            'Personal Care': {'icon': '💅', 'color': '#a855f7'},
            'Pet Care': {'icon': '🐾', 'color': '#84cc16'},
            'Home & Garden': {'icon': '🏡', 'color': '#22c55e'},
            'Charity': {'icon': '❤️', 'color': '#f43f5e'}
        }

        defaults = category_defaults.get(category_name, {'icon': '📊', 'color': '#6c757d'})

        category = Category(
            user_id=user_id,
            name=category_name,
            icon=defaults['icon'],
            color=defaults['color'],
            is_system=False
        )
        db.session.add(category)
        db.session.commit()

    return category
