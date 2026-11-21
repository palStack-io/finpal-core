"""
Default Categories and Subcategories
Comprehensive category structure loaded on fresh install

`icon` is a KEY from `src/models/category_icons.py` (the lucide line icon's name), never an emoji.
"""

DEFAULT_CATEGORIES = {
    # Income Categories
    'Income': {
        # *** THE ONE GROUP THAT IS MONEY IN. *** Read by `Category.kind`'s
        # backfill, which keys on THIS TABLE rather than on a string match --
        # the same reason the SimpleFin account-type inference refuses to look
        # at an account's name (D-191). A name is user-editable; this table is
        # finPal's own record of what it seeded.
        'kind': 'income',
        'icon': 'banknote',
        'color': '#10b981',  # Green
        'subcategories': [
            {'name': 'Salary', 'icon': 'briefcase', 'color': '#059669'},
            {'name': 'Freelance', 'icon': 'laptop', 'color': '#34d399'},
            {'name': 'Business', 'icon': 'store', 'color': '#6ee7b7'},
            {'name': 'Investments', 'icon': 'trending-up', 'color': '#a7f3d0'},
            {'name': 'Dividends', 'icon': 'coins', 'color': '#d1fae5'},
            {'name': 'Interest', 'icon': 'chart-line', 'color': '#10b981'},
            {'name': 'Rental Income', 'icon': 'house', 'color': '#059669'},
            {'name': 'Gifts Received', 'icon': 'gift', 'color': '#34d399'},
            {'name': 'Refunds', 'icon': 'undo-2', 'color': '#6ee7b7'},
            {'name': 'Cashback', 'icon': 'wallet', 'color': '#a7f3d0'},
            {'name': 'Other Income', 'icon': 'plus', 'color': '#d1fae5'},
        ]
    },

    # Housing & Utilities
    'Housing': {
        'icon': 'house',
        'color': '#3b82f6',  # Blue
        'subcategories': [
            {'name': 'Rent', 'icon': 'building-2', 'color': '#2563eb'},
            {'name': 'Mortgage', 'icon': 'house', 'color': '#60a5fa'},
            {'name': 'Property Tax', 'icon': 'receipt', 'color': '#93c5fd'},
            {'name': 'Home Insurance', 'icon': 'shield', 'color': '#dbeafe'},
            {'name': 'HOA Fees', 'icon': 'users', 'color': '#3b82f6'},
            {'name': 'Electricity', 'icon': 'zap', 'color': '#2563eb'},
            {'name': 'Water', 'icon': 'droplet', 'color': '#60a5fa'},
            {'name': 'Gas', 'icon': 'flame', 'color': '#93c5fd'},
            {'name': 'Internet', 'icon': 'wifi', 'color': '#dbeafe'},
            {'name': 'Phone', 'icon': 'phone', 'color': '#3b82f6'},
            {'name': 'Cable/Streaming', 'icon': 'tv', 'color': '#2563eb'},
            {'name': 'Home Maintenance', 'icon': 'wrench', 'color': '#60a5fa'},
            {'name': 'Furniture', 'icon': 'sofa', 'color': '#93c5fd'},
            {'name': 'Home Decor', 'icon': 'palette', 'color': '#dbeafe'},
        ]
    },

    # Transportation
    'Transportation': {
        'icon': 'car',
        'color': '#f59e0b',  # Orange
        'subcategories': [
            {'name': 'Gas/Fuel', 'icon': 'fuel', 'color': '#d97706'},
            {'name': 'Car Payment', 'icon': 'car', 'color': '#fbbf24'},
            {'name': 'Car Insurance', 'icon': 'shield', 'color': '#fcd34d'},
            {'name': 'Car Maintenance', 'icon': 'wrench', 'color': '#fde68a'},
            {'name': 'Parking', 'icon': 'square-parking', 'color': '#f59e0b'},
            {'name': 'Public Transit', 'icon': 'bus', 'color': '#d97706'},
            {'name': 'Ride Share', 'icon': 'car-taxi-front', 'color': '#fbbf24'},
            {'name': 'Tolls', 'icon': 'route', 'color': '#fcd34d'},
            {'name': 'Vehicle Registration', 'icon': 'id-card', 'color': '#fde68a'},
        ]
    },

    # Food & Dining
    'Food & Dining': {
        'icon': 'utensils',
        'color': '#ef4444',  # Red
        'subcategories': [
            {'name': 'Groceries', 'icon': 'shopping-cart', 'color': '#dc2626'},
            {'name': 'Restaurants', 'icon': 'utensils', 'color': '#f87171'},
            {'name': 'Fast Food', 'icon': 'hamburger', 'color': '#fca5a5'},
            {'name': 'Coffee Shops', 'icon': 'coffee', 'color': '#fecaca'},
            {'name': 'Bars & Alcohol', 'icon': 'wine', 'color': '#ef4444'},
            {'name': 'Food Delivery', 'icon': 'bike', 'color': '#dc2626'},
            {'name': 'Meal Kits', 'icon': 'package', 'color': '#f87171'},
        ]
    },

    # Shopping
    'Shopping': {
        'icon': 'shopping-bag',
        'color': '#ec4899',  # Pink
        'subcategories': [
            {'name': 'Clothing', 'icon': 'shirt', 'color': '#db2777'},
            {'name': 'Shoes', 'icon': 'footprints', 'color': '#f472b6'},
            {'name': 'Accessories', 'icon': 'watch', 'color': '#f9a8d4'},
            {'name': 'Electronics', 'icon': 'laptop', 'color': '#fbcfe8'},
            {'name': 'Books', 'icon': 'book-open', 'color': '#ec4899'},
            {'name': 'Hobbies', 'icon': 'palette', 'color': '#db2777'},
            {'name': 'Gifts', 'icon': 'gift', 'color': '#f472b6'},
            {'name': 'Online Shopping', 'icon': 'globe', 'color': '#f9a8d4'},
            {'name': 'Office Supplies', 'icon': 'pen-line', 'color': '#fbcfe8'},
        ]
    },

    # Health & Fitness
    'Health & Fitness': {
        'icon': 'heart-pulse',
        'color': '#06b6d4',  # Cyan
        'subcategories': [
            {'name': 'Doctor Visits', 'icon': 'stethoscope', 'color': '#0891b2'},
            {'name': 'Dentist', 'icon': 'smile', 'color': '#22d3ee'},
            {'name': 'Pharmacy', 'icon': 'pill', 'color': '#67e8f9'},
            {'name': 'Health Insurance', 'icon': 'shield', 'color': '#a5f3fc'},
            {'name': 'Gym Membership', 'icon': 'dumbbell', 'color': '#06b6d4'},
            {'name': 'Fitness Classes', 'icon': 'person-standing', 'color': '#0891b2'},
            {'name': 'Sports Equipment', 'icon': 'volleyball', 'color': '#22d3ee'},
            {'name': 'Wellness', 'icon': 'sparkles', 'color': '#67e8f9'},
            {'name': 'Vision Care', 'icon': 'eye', 'color': '#a5f3fc'},
        ]
    },

    # Entertainment
    'Entertainment': {
        'icon': 'gamepad-2',
        'color': '#8b5cf6',  # Purple
        'subcategories': [
            {'name': 'Movies', 'icon': 'clapperboard', 'color': '#7c3aed'},
            {'name': 'Concerts', 'icon': 'music', 'color': '#a78bfa'},
            {'name': 'Sports Events', 'icon': 'ticket', 'color': '#c4b5fd'},
            {'name': 'Streaming Services', 'icon': 'tv', 'color': '#ede9fe'},
            {'name': 'Gaming', 'icon': 'gamepad-2', 'color': '#8b5cf6'},
            {'name': 'Hobbies', 'icon': 'crown', 'color': '#7c3aed'},
            {'name': 'Subscriptions', 'icon': 'repeat', 'color': '#a78bfa'},
            {'name': 'Events', 'icon': 'calendar-days', 'color': '#c4b5fd'},
        ]
    },

    # Personal Care
    'Personal Care': {
        'icon': 'scissors',
        'color': '#14b8a6',  # Teal
        'subcategories': [
            {'name': 'Hair Care', 'icon': 'scissors', 'color': '#0d9488'},
            {'name': 'Salon/Spa', 'icon': 'sparkles', 'color': '#2dd4bf'},
            {'name': 'Cosmetics', 'icon': 'brush', 'color': '#5eead4'},
            {'name': 'Toiletries', 'icon': 'droplet', 'color': '#99f6e4'},
            {'name': 'Skincare', 'icon': 'sparkles', 'color': '#14b8a6'},
        ]
    },

    # Education
    'Education': {
        'icon': 'graduation-cap',
        'color': '#6366f1',  # Indigo
        'subcategories': [
            {'name': 'Tuition', 'icon': 'school', 'color': '#4f46e5'},
            {'name': 'Books & Supplies', 'icon': 'book', 'color': '#818cf8'},
            {'name': 'Online Courses', 'icon': 'laptop', 'color': '#a5b4fc'},
            {'name': 'Student Loans', 'icon': 'receipt', 'color': '#c7d2fe'},
            {'name': 'Workshops', 'icon': 'graduation-cap', 'color': '#6366f1'},
        ]
    },

    # Travel & Vacation
    'Travel': {
        'icon': 'plane',
        'color': '#f97316',  # Orange-Red
        'subcategories': [
            {'name': 'Flights', 'icon': 'plane', 'color': '#ea580c'},
            {'name': 'Hotels', 'icon': 'hotel', 'color': '#fb923c'},
            {'name': 'Car Rental', 'icon': 'car', 'color': '#fdba74'},
            {'name': 'Activities', 'icon': 'mountain', 'color': '#fed7aa'},
            {'name': 'Travel Insurance', 'icon': 'shield', 'color': '#f97316'},
            {'name': 'Souvenirs', 'icon': 'shopping-bag', 'color': '#ea580c'},
        ]
    },

    # Pets
    'Pets': {
        'icon': 'paw-print',
        'color': '#84cc16',  # Lime
        'subcategories': [
            {'name': 'Pet Food', 'icon': 'bone', 'color': '#65a30d'},
            {'name': 'Veterinary', 'icon': 'stethoscope', 'color': '#a3e635'},
            {'name': 'Pet Supplies', 'icon': 'paw-print', 'color': '#bef264'},
            {'name': 'Grooming', 'icon': 'scissors', 'color': '#d9f99d'},
            {'name': 'Pet Insurance', 'icon': 'shield', 'color': '#84cc16'},
        ]
    },

    # Family & Kids
    'Family & Kids': {
        'icon': 'baby',
        'color': '#fbbf24',  # Amber
        'subcategories': [
            {'name': 'Childcare', 'icon': 'baby', 'color': '#f59e0b'},
            {'name': 'Diapers & Baby Care', 'icon': 'milk', 'color': '#fcd34d'},
            {'name': 'Toys', 'icon': 'puzzle', 'color': '#fde68a'},
            {'name': 'Child Activities', 'icon': 'volleyball', 'color': '#fbbf24'},
            {'name': 'Allowance', 'icon': 'hand-heart', 'color': '#f59e0b'},
        ]
    },

    # Debt & Loans
    'Debt & Loans': {
        'icon': 'receipt',
        'color': '#dc2626',  # Dark Red
        'subcategories': [
            {'name': 'Credit Card Payment', 'icon': 'credit-card', 'color': '#b91c1c'},
            {'name': 'Student Loan', 'icon': 'graduation-cap', 'color': '#dc2626'},
            {'name': 'Personal Loan', 'icon': 'hand-heart', 'color': '#ef4444'},
            {'name': 'Car Loan', 'icon': 'car', 'color': '#f87171'},
            {'name': 'Other Debt', 'icon': 'file-text', 'color': '#fca5a5'},
        ]
    },

    # Savings & Investments
    'Savings & Investments': {
        'icon': 'piggy-bank',
        'color': '#059669',  # Emerald
        'subcategories': [
            {'name': 'Emergency Fund', 'icon': 'life-buoy', 'color': '#047857'},
            {'name': 'Retirement', 'icon': 'tree-palm', 'color': '#10b981'},
            {'name': 'Stocks', 'icon': 'trending-up', 'color': '#34d399'},
            {'name': 'Crypto', 'icon': 'bitcoin', 'color': '#6ee7b7'},
            {'name': 'Real Estate', 'icon': 'building-2', 'color': '#a7f3d0'},
            {'name': 'Other Investments', 'icon': 'coins', 'color': '#d1fae5'},
        ]
    },

    # Insurance
    'Insurance': {
        'icon': 'shield',
        'color': '#0ea5e9',  # Sky Blue
        'subcategories': [
            {'name': 'Life Insurance', 'icon': 'heart', 'color': '#0284c7'},
            {'name': 'Health Insurance', 'icon': 'heart-pulse', 'color': '#38bdf8'},
            {'name': 'Auto Insurance', 'icon': 'car', 'color': '#7dd3fc'},
            {'name': 'Home Insurance', 'icon': 'house', 'color': '#bae6fd'},
            {'name': 'Disability Insurance', 'icon': 'accessibility', 'color': '#0ea5e9'},
        ]
    },

    # Taxes
    'Taxes': {
        'icon': 'receipt',
        'color': '#78716c',  # Stone
        'subcategories': [
            {'name': 'Federal Tax', 'icon': 'landmark', 'color': '#57534e'},
            {'name': 'State Tax', 'icon': 'map-pin', 'color': '#78716c'},
            {'name': 'Property Tax', 'icon': 'house', 'color': '#a8a29e'},
            {'name': 'Sales Tax', 'icon': 'shopping-cart', 'color': '#d6d3d1'},
        ]
    },

    # Charity & Donations
    'Charity': {
        'icon': 'handshake',
        'color': '#d946ef',  # Fuchsia
        'subcategories': [
            {'name': 'Religious', 'icon': 'hand-helping', 'color': '#c026d3'},
            {'name': 'Non-Profit', 'icon': 'heart', 'color': '#e879f9'},
            {'name': 'Gifts', 'icon': 'gift', 'color': '#f0abfc'},
            {'name': 'Crowdfunding', 'icon': 'users', 'color': '#fae8ff'},
        ]
    },

    # Business Expenses
    'Business': {
        'icon': 'briefcase',
        'color': '#64748b',  # Slate
        'subcategories': [
            {'name': 'Office Rent', 'icon': 'building-2', 'color': '#475569'},
            {'name': 'Equipment', 'icon': 'laptop', 'color': '#64748b'},
            {'name': 'Software & Tools', 'icon': 'wrench', 'color': '#94a3b8'},
            {'name': 'Marketing', 'icon': 'megaphone', 'color': '#cbd5e1'},
            {'name': 'Professional Services', 'icon': 'shirt', 'color': '#e2e8f0'},
            {'name': 'Business Travel', 'icon': 'plane', 'color': '#64748b'},
            {'name': 'Meals & Entertainment', 'icon': 'utensils', 'color': '#475569'},
        ]
    },

    # Miscellaneous
    'Miscellaneous': {
        'icon': 'package',
        'color': '#9ca3af',  # Gray
        'subcategories': [
            {'name': 'Bank Fees', 'icon': 'landmark', 'color': '#6b7280'},
            {'name': 'ATM Fees', 'icon': 'credit-card', 'color': '#9ca3af'},
            {'name': 'Late Fees', 'icon': 'triangle-alert', 'color': '#d1d5db'},
            {'name': 'Other', 'icon': 'circle-help', 'color': '#e5e7eb'},
        ]
    },
}
