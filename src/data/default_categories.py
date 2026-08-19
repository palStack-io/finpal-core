"""
Default Categories and Subcategories
Comprehensive category structure loaded on fresh install
"""

DEFAULT_CATEGORIES = {
    # Income Categories
    'Income': {
        'icon': '💵',
        'color': '#10b981',  # Green
        'subcategories': [
            {'name': 'Salary', 'icon': '💼', 'color': '#059669'},
            {'name': 'Freelance', 'icon': '💻', 'color': '#34d399'},
            {'name': 'Business', 'icon': '🏪', 'color': '#6ee7b7'},
            {'name': 'Investments', 'icon': '📈', 'color': '#a7f3d0'},
            {'name': 'Dividends', 'icon': '🪙', 'color': '#d1fae5'},
            {'name': 'Interest', 'icon': '💹', 'color': '#10b981'},
            {'name': 'Rental Income', 'icon': '🏠', 'color': '#059669'},
            {'name': 'Gifts Received', 'icon': '🎁', 'color': '#34d399'},
            {'name': 'Refunds', 'icon': '↩️', 'color': '#6ee7b7'},
            {'name': 'Cashback', 'icon': '💰', 'color': '#a7f3d0'},
            {'name': 'Other Income', 'icon': '➕', 'color': '#d1fae5'},
        ]
    },

    # Housing & Utilities
    'Housing': {
        'icon': '🏠',
        'color': '#3b82f6',  # Blue
        'subcategories': [
            {'name': 'Rent', 'icon': '🏢', 'color': '#2563eb'},
            {'name': 'Mortgage', 'icon': '🏠', 'color': '#60a5fa'},
            {'name': 'Property Tax', 'icon': '🧾', 'color': '#93c5fd'},
            {'name': 'Home Insurance', 'icon': '🛡️', 'color': '#dbeafe'},
            {'name': 'HOA Fees', 'icon': '👥', 'color': '#3b82f6'},
            {'name': 'Electricity', 'icon': '⚡', 'color': '#2563eb'},
            {'name': 'Water', 'icon': '💧', 'color': '#60a5fa'},
            {'name': 'Gas', 'icon': '🔥', 'color': '#93c5fd'},
            {'name': 'Internet', 'icon': '📡', 'color': '#dbeafe'},
            {'name': 'Phone', 'icon': '📞', 'color': '#3b82f6'},
            {'name': 'Cable/Streaming', 'icon': '📺', 'color': '#2563eb'},
            {'name': 'Home Maintenance', 'icon': '🔧', 'color': '#60a5fa'},
            {'name': 'Furniture', 'icon': '🛋️', 'color': '#93c5fd'},
            {'name': 'Home Decor', 'icon': '🎨', 'color': '#dbeafe'},
        ]
    },

    # Transportation
    'Transportation': {
        'icon': '🚗',
        'color': '#f59e0b',  # Orange
        'subcategories': [
            {'name': 'Gas/Fuel', 'icon': '⛽', 'color': '#d97706'},
            {'name': 'Car Payment', 'icon': '🚗', 'color': '#fbbf24'},
            {'name': 'Car Insurance', 'icon': '🛡️', 'color': '#fcd34d'},
            {'name': 'Car Maintenance', 'icon': '🔧', 'color': '#fde68a'},
            {'name': 'Parking', 'icon': '🅿️', 'color': '#f59e0b'},
            {'name': 'Public Transit', 'icon': '🚌', 'color': '#d97706'},
            {'name': 'Ride Share', 'icon': '🚕', 'color': '#fbbf24'},
            {'name': 'Tolls', 'icon': '🛣️', 'color': '#fcd34d'},
            {'name': 'Vehicle Registration', 'icon': '🪪', 'color': '#fde68a'},
        ]
    },

    # Food & Dining
    'Food & Dining': {
        'icon': '🍽️',
        'color': '#ef4444',  # Red
        'subcategories': [
            {'name': 'Groceries', 'icon': '🛒', 'color': '#dc2626'},
            {'name': 'Restaurants', 'icon': '🍽️', 'color': '#f87171'},
            {'name': 'Fast Food', 'icon': '🍔', 'color': '#fca5a5'},
            {'name': 'Coffee Shops', 'icon': '☕', 'color': '#fecaca'},
            {'name': 'Bars & Alcohol', 'icon': '🍷', 'color': '#ef4444'},
            {'name': 'Food Delivery', 'icon': '🏍️', 'color': '#dc2626'},
            {'name': 'Meal Kits', 'icon': '📦', 'color': '#f87171'},
        ]
    },

    # Shopping
    'Shopping': {
        'icon': '🛍️',
        'color': '#ec4899',  # Pink
        'subcategories': [
            {'name': 'Clothing', 'icon': '👕', 'color': '#db2777'},
            {'name': 'Shoes', 'icon': '👟', 'color': '#f472b6'},
            {'name': 'Accessories', 'icon': '⌚', 'color': '#f9a8d4'},
            {'name': 'Electronics', 'icon': '💻', 'color': '#fbcfe8'},
            {'name': 'Books', 'icon': '📚', 'color': '#ec4899'},
            {'name': 'Hobbies', 'icon': '🎨', 'color': '#db2777'},
            {'name': 'Gifts', 'icon': '🎁', 'color': '#f472b6'},
            {'name': 'Online Shopping', 'icon': '🌍', 'color': '#f9a8d4'},
            {'name': 'Office Supplies', 'icon': '🖊️', 'color': '#fbcfe8'},
        ]
    },

    # Health & Fitness
    'Health & Fitness': {
        'icon': '💓',
        'color': '#06b6d4',  # Cyan
        'subcategories': [
            {'name': 'Doctor Visits', 'icon': '👨‍⚕️', 'color': '#0891b2'},
            {'name': 'Dentist', 'icon': '🦷', 'color': '#22d3ee'},
            {'name': 'Pharmacy', 'icon': '💊', 'color': '#67e8f9'},
            {'name': 'Health Insurance', 'icon': '🛡️', 'color': '#a5f3fc'},
            {'name': 'Gym Membership', 'icon': '🏋️', 'color': '#06b6d4'},
            {'name': 'Fitness Classes', 'icon': '🏃', 'color': '#0891b2'},
            {'name': 'Sports Equipment', 'icon': '🏀', 'color': '#22d3ee'},
            {'name': 'Wellness', 'icon': '💆', 'color': '#67e8f9'},
            {'name': 'Vision Care', 'icon': '👁️', 'color': '#a5f3fc'},
        ]
    },

    # Entertainment
    'Entertainment': {
        'icon': '🎮',
        'color': '#8b5cf6',  # Purple
        'subcategories': [
            {'name': 'Movies', 'icon': '🎬', 'color': '#7c3aed'},
            {'name': 'Concerts', 'icon': '🎵', 'color': '#a78bfa'},
            {'name': 'Sports Events', 'icon': '🎟️', 'color': '#c4b5fd'},
            {'name': 'Streaming Services', 'icon': '📺', 'color': '#ede9fe'},
            {'name': 'Gaming', 'icon': '🎮', 'color': '#8b5cf6'},
            {'name': 'Hobbies', 'icon': '♟️', 'color': '#7c3aed'},
            {'name': 'Subscriptions', 'icon': '🔄', 'color': '#a78bfa'},
            {'name': 'Events', 'icon': '📅', 'color': '#c4b5fd'},
        ]
    },

    # Personal Care
    'Personal Care': {
        'icon': '✂️',
        'color': '#14b8a6',  # Teal
        'subcategories': [
            {'name': 'Hair Care', 'icon': '✂️', 'color': '#0d9488'},
            {'name': 'Salon/Spa', 'icon': '💆', 'color': '#2dd4bf'},
            {'name': 'Cosmetics', 'icon': '💄', 'color': '#5eead4'},
            {'name': 'Toiletries', 'icon': '🧼', 'color': '#99f6e4'},
            {'name': 'Skincare', 'icon': '✨', 'color': '#14b8a6'},
        ]
    },

    # Education
    'Education': {
        'icon': '🎓',
        'color': '#6366f1',  # Indigo
        'subcategories': [
            {'name': 'Tuition', 'icon': '🏫', 'color': '#4f46e5'},
            {'name': 'Books & Supplies', 'icon': '📖', 'color': '#818cf8'},
            {'name': 'Online Courses', 'icon': '💻', 'color': '#a5b4fc'},
            {'name': 'Student Loans', 'icon': '🧾', 'color': '#c7d2fe'},
            {'name': 'Workshops', 'icon': '🧑‍🏫', 'color': '#6366f1'},
        ]
    },

    # Travel & Vacation
    'Travel': {
        'icon': '✈️',
        'color': '#f97316',  # Orange-Red
        'subcategories': [
            {'name': 'Flights', 'icon': '✈️', 'color': '#ea580c'},
            {'name': 'Hotels', 'icon': '🏨', 'color': '#fb923c'},
            {'name': 'Car Rental', 'icon': '🚗', 'color': '#fdba74'},
            {'name': 'Activities', 'icon': '🥾', 'color': '#fed7aa'},
            {'name': 'Travel Insurance', 'icon': '🛡️', 'color': '#f97316'},
            {'name': 'Souvenirs', 'icon': '🛍️', 'color': '#ea580c'},
        ]
    },

    # Pets
    'Pets': {
        'icon': '🐾',
        'color': '#84cc16',  # Lime
        'subcategories': [
            {'name': 'Pet Food', 'icon': '🦴', 'color': '#65a30d'},
            {'name': 'Veterinary', 'icon': '🩺', 'color': '#a3e635'},
            {'name': 'Pet Supplies', 'icon': '🐾', 'color': '#bef264'},
            {'name': 'Grooming', 'icon': '✂️', 'color': '#d9f99d'},
            {'name': 'Pet Insurance', 'icon': '🛡️', 'color': '#84cc16'},
        ]
    },

    # Family & Kids
    'Family & Kids': {
        'icon': '👶',
        'color': '#fbbf24',  # Amber
        'subcategories': [
            {'name': 'Childcare', 'icon': '🧒', 'color': '#f59e0b'},
            {'name': 'Diapers & Baby Care', 'icon': '🍼', 'color': '#fcd34d'},
            {'name': 'Toys', 'icon': '🧩', 'color': '#fde68a'},
            {'name': 'Child Activities', 'icon': '⚽', 'color': '#fbbf24'},
            {'name': 'Allowance', 'icon': '🤲', 'color': '#f59e0b'},
        ]
    },

    # Debt & Loans
    'Debt & Loans': {
        'icon': '🧾',
        'color': '#dc2626',  # Dark Red
        'subcategories': [
            {'name': 'Credit Card Payment', 'icon': '💳', 'color': '#b91c1c'},
            {'name': 'Student Loan', 'icon': '🎓', 'color': '#dc2626'},
            {'name': 'Personal Loan', 'icon': '🤲', 'color': '#ef4444'},
            {'name': 'Car Loan', 'icon': '🚗', 'color': '#f87171'},
            {'name': 'Other Debt', 'icon': '📄', 'color': '#fca5a5'},
        ]
    },

    # Savings & Investments
    'Savings & Investments': {
        'icon': '🐷',
        'color': '#059669',  # Emerald
        'subcategories': [
            {'name': 'Emergency Fund', 'icon': '🛟', 'color': '#047857'},
            {'name': 'Retirement', 'icon': '🏖️', 'color': '#10b981'},
            {'name': 'Stocks', 'icon': '📈', 'color': '#34d399'},
            {'name': 'Crypto', 'icon': '₿', 'color': '#6ee7b7'},
            {'name': 'Real Estate', 'icon': '🏢', 'color': '#a7f3d0'},
            {'name': 'Other Investments', 'icon': '🪙', 'color': '#d1fae5'},
        ]
    },

    # Insurance
    'Insurance': {
        'icon': '🛡️',
        'color': '#0ea5e9',  # Sky Blue
        'subcategories': [
            {'name': 'Life Insurance', 'icon': '❤️', 'color': '#0284c7'},
            {'name': 'Health Insurance', 'icon': '💓', 'color': '#38bdf8'},
            {'name': 'Auto Insurance', 'icon': '🚗', 'color': '#7dd3fc'},
            {'name': 'Home Insurance', 'icon': '🏠', 'color': '#bae6fd'},
            {'name': 'Disability Insurance', 'icon': '♿', 'color': '#0ea5e9'},
        ]
    },

    # Taxes
    'Taxes': {
        'icon': '🧾',
        'color': '#78716c',  # Stone
        'subcategories': [
            {'name': 'Federal Tax', 'icon': '🏛️', 'color': '#57534e'},
            {'name': 'State Tax', 'icon': '📍', 'color': '#78716c'},
            {'name': 'Property Tax', 'icon': '🏠', 'color': '#a8a29e'},
            {'name': 'Sales Tax', 'icon': '🛒', 'color': '#d6d3d1'},
        ]
    },

    # Charity & Donations
    'Charity': {
        'icon': '🤝',
        'color': '#d946ef',  # Fuchsia
        'subcategories': [
            {'name': 'Religious', 'icon': '🙏', 'color': '#c026d3'},
            {'name': 'Non-Profit', 'icon': '❤️', 'color': '#e879f9'},
            {'name': 'Gifts', 'icon': '🎁', 'color': '#f0abfc'},
            {'name': 'Crowdfunding', 'icon': '👥', 'color': '#fae8ff'},
        ]
    },

    # Business Expenses
    'Business': {
        'icon': '💼',
        'color': '#64748b',  # Slate
        'subcategories': [
            {'name': 'Office Rent', 'icon': '🏢', 'color': '#475569'},
            {'name': 'Equipment', 'icon': '💻', 'color': '#64748b'},
            {'name': 'Software & Tools', 'icon': '🔧', 'color': '#94a3b8'},
            {'name': 'Marketing', 'icon': '📣', 'color': '#cbd5e1'},
            {'name': 'Professional Services', 'icon': '👔', 'color': '#e2e8f0'},
            {'name': 'Business Travel', 'icon': '✈️', 'color': '#64748b'},
            {'name': 'Meals & Entertainment', 'icon': '🍽️', 'color': '#475569'},
        ]
    },

    # Miscellaneous
    'Miscellaneous': {
        'icon': '📦',
        'color': '#9ca3af',  # Gray
        'subcategories': [
            {'name': 'Bank Fees', 'icon': '🏛️', 'color': '#6b7280'},
            {'name': 'ATM Fees', 'icon': '💳', 'color': '#9ca3af'},
            {'name': 'Late Fees', 'icon': '⚠️', 'color': '#d1d5db'},
            {'name': 'Other', 'icon': '❓', 'color': '#e5e7eb'},
        ]
    },
}
