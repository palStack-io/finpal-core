"""
Maps finPal category names to pointsPal category slugs.

finPal categories are user-defined free text — this map covers the system defaults
from auto_categorize.py. Anything unrecognised falls back to 'other'.
"""

FINPAL_TO_POINTSPAL = {
    # Groceries
    "groceries": "groceries",
    "grocery": "groceries",
    "supermarket": "groceries",

    # Dining
    "dining": "dining",
    "restaurants": "dining",
    "restaurant": "dining",
    "food": "dining",

    # Transportation (split by sub-type where identifiable)
    "transportation": "gas",        # broad bucket defaults to gas
    "gas": "gas",
    "fuel": "gas",
    "transit": "transit",
    "public transit": "transit",
    "parking": "transit",
    "rideshare": "transit",
    "uber": "transit",
    "lyft": "transit",

    # Entertainment / Streaming
    "entertainment": "entertainment",
    "streaming": "streaming",
    "music": "streaming",
    "gaming": "entertainment",

    # Shopping
    "shopping": "online_shopping",
    "online shopping": "online_shopping",

    # Utilities / Phone / Internet
    "utilities": "phone_internet",
    "phone": "phone_internet",
    "internet": "phone_internet",
    "cable": "phone_internet",
    "phone & internet": "phone_internet",

    # Healthcare / Drugstores
    "healthcare": "drugstores",
    "pharmacy": "drugstores",
    "medical": "drugstores",
    "health": "drugstores",

    # Fitness
    "fitness": "fitness",
    "gym": "fitness",

    # Travel
    "travel": "travel_portal",
    "flights": "flights_direct",
    "airlines": "flights_direct",
    "hotels": "hotels_direct",
    "hotel": "hotels_direct",

    # Advertising
    "advertising": "advertising",

    # Home improvement
    "home & garden": "home_improvement",
    "home improvement": "home_improvement",
    "hardware": "home_improvement",

    # Office supplies
    "office supplies": "office_supplies",
    "office": "office_supplies",

    # Rent / Mortgage
    "bills & fees": "other",        # too broad to assign
    "rent": "rent_mortgage",
    "mortgage": "rent_mortgage",
    "rent & mortgage": "rent_mortgage",

    # Everything else → other
    "education": "other",
    "personal care": "other",
    "pet care": "other",
    "charity": "other",
    "pets": "other",
    "clothing": "other",
    "gifts": "other",
    "insurance": "other",
}

VALID_SLUGS = {
    "travel_portal", "flights_direct", "hotels_direct", "dining", "groceries",
    "gas", "streaming", "transit", "online_shopping", "advertising", "drugstores",
    "home_improvement", "office_supplies", "phone_internet", "fitness",
    "entertainment", "rotating", "mobile_wallet", "rent_mortgage", "other",
}


def finpal_category_to_slug(category_name: str) -> str:
    """Map a finPal category name to a pointsPal slug. Defaults to 'other'."""
    if not category_name:
        return "other"
    slug = FINPAL_TO_POINTSPAL.get(category_name.lower().strip(), "other")
    return slug if slug in VALID_SLUGS else "other"
