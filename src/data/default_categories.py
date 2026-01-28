"""
Default Categories and Subcategories
Comprehensive category structure loaded on fresh install
"""

DEFAULT_CATEGORIES = {
    # Income Categories
    'Income': {
        'icon': 'fa-money-bill-wave',
        'color': '#10b981',  # Green
        'subcategories': [
            {'name': 'Salary', 'icon': 'fa-briefcase', 'color': '#059669'},
            {'name': 'Freelance', 'icon': 'fa-laptop-code', 'color': '#34d399'},
            {'name': 'Business', 'icon': 'fa-store', 'color': '#6ee7b7'},
            {'name': 'Investments', 'icon': 'fa-chart-line', 'color': '#a7f3d0'},
            {'name': 'Dividends', 'icon': 'fa-coins', 'color': '#d1fae5'},
            {'name': 'Interest', 'icon': 'fa-percent', 'color': '#10b981'},
            {'name': 'Rental Income', 'icon': 'fa-home', 'color': '#059669'},
            {'name': 'Gifts Received', 'icon': 'fa-gift', 'color': '#34d399'},
            {'name': 'Refunds', 'icon': 'fa-undo', 'color': '#6ee7b7'},
            {'name': 'Cashback', 'icon': 'fa-cash-register', 'color': '#a7f3d0'},
            {'name': 'Other Income', 'icon': 'fa-plus-circle', 'color': '#d1fae5'},
        ]
    },

    # Housing & Utilities
    'Housing': {
        'icon': 'fa-home',
        'color': '#3b82f6',  # Blue
        'subcategories': [
            {'name': 'Rent', 'icon': 'fa-building', 'color': '#2563eb'},
            {'name': 'Mortgage', 'icon': 'fa-home', 'color': '#60a5fa'},
            {'name': 'Property Tax', 'icon': 'fa-file-invoice-dollar', 'color': '#93c5fd'},
            {'name': 'Home Insurance', 'icon': 'fa-shield-alt', 'color': '#dbeafe'},
            {'name': 'HOA Fees', 'icon': 'fa-users', 'color': '#3b82f6'},
            {'name': 'Electricity', 'icon': 'fa-bolt', 'color': '#2563eb'},
            {'name': 'Water', 'icon': 'fa-tint', 'color': '#60a5fa'},
            {'name': 'Gas', 'icon': 'fa-fire', 'color': '#93c5fd'},
            {'name': 'Internet', 'icon': 'fa-wifi', 'color': '#dbeafe'},
            {'name': 'Phone', 'icon': 'fa-phone', 'color': '#3b82f6'},
            {'name': 'Cable/Streaming', 'icon': 'fa-tv', 'color': '#2563eb'},
            {'name': 'Home Maintenance', 'icon': 'fa-tools', 'color': '#60a5fa'},
            {'name': 'Furniture', 'icon': 'fa-couch', 'color': '#93c5fd'},
            {'name': 'Home Decor', 'icon': 'fa-paint-brush', 'color': '#dbeafe'},
        ]
    },

    # Transportation
    'Transportation': {
        'icon': 'fa-car',
        'color': '#f59e0b',  # Orange
        'subcategories': [
            {'name': 'Gas/Fuel', 'icon': 'fa-gas-pump', 'color': '#d97706'},
            {'name': 'Car Payment', 'icon': 'fa-car', 'color': '#fbbf24'},
            {'name': 'Car Insurance', 'icon': 'fa-shield-alt', 'color': '#fcd34d'},
            {'name': 'Car Maintenance', 'icon': 'fa-wrench', 'color': '#fde68a'},
            {'name': 'Parking', 'icon': 'fa-parking', 'color': '#f59e0b'},
            {'name': 'Public Transit', 'icon': 'fa-bus', 'color': '#d97706'},
            {'name': 'Ride Share', 'icon': 'fa-taxi', 'color': '#fbbf24'},
            {'name': 'Tolls', 'icon': 'fa-road', 'color': '#fcd34d'},
            {'name': 'Vehicle Registration', 'icon': 'fa-id-card', 'color': '#fde68a'},
        ]
    },

    # Food & Dining
    'Food & Dining': {
        'icon': 'fa-utensils',
        'color': '#ef4444',  # Red
        'subcategories': [
            {'name': 'Groceries', 'icon': 'fa-shopping-cart', 'color': '#dc2626'},
            {'name': 'Restaurants', 'icon': 'fa-utensils', 'color': '#f87171'},
            {'name': 'Fast Food', 'icon': 'fa-hamburger', 'color': '#fca5a5'},
            {'name': 'Coffee Shops', 'icon': 'fa-coffee', 'color': '#fecaca'},
            {'name': 'Bars & Alcohol', 'icon': 'fa-wine-glass', 'color': '#ef4444'},
            {'name': 'Food Delivery', 'icon': 'fa-motorcycle', 'color': '#dc2626'},
            {'name': 'Meal Kits', 'icon': 'fa-box', 'color': '#f87171'},
        ]
    },

    # Shopping
    'Shopping': {
        'icon': 'fa-shopping-bag',
        'color': '#ec4899',  # Pink
        'subcategories': [
            {'name': 'Clothing', 'icon': 'fa-tshirt', 'color': '#db2777'},
            {'name': 'Shoes', 'icon': 'fa-shoe-prints', 'color': '#f472b6'},
            {'name': 'Accessories', 'icon': 'fa-watch', 'color': '#f9a8d4'},
            {'name': 'Electronics', 'icon': 'fa-laptop', 'color': '#fbcfe8'},
            {'name': 'Books', 'icon': 'fa-book', 'color': '#ec4899'},
            {'name': 'Hobbies', 'icon': 'fa-palette', 'color': '#db2777'},
            {'name': 'Gifts', 'icon': 'fa-gift', 'color': '#f472b6'},
            {'name': 'Online Shopping', 'icon': 'fa-globe', 'color': '#f9a8d4'},
            {'name': 'Office Supplies', 'icon': 'fa-pen', 'color': '#fbcfe8'},
        ]
    },

    # Health & Fitness
    'Health & Fitness': {
        'icon': 'fa-heartbeat',
        'color': '#06b6d4',  # Cyan
        'subcategories': [
            {'name': 'Doctor Visits', 'icon': 'fa-user-md', 'color': '#0891b2'},
            {'name': 'Dentist', 'icon': 'fa-tooth', 'color': '#22d3ee'},
            {'name': 'Pharmacy', 'icon': 'fa-pills', 'color': '#67e8f9'},
            {'name': 'Health Insurance', 'icon': 'fa-shield-alt', 'color': '#a5f3fc'},
            {'name': 'Gym Membership', 'icon': 'fa-dumbbell', 'color': '#06b6d4'},
            {'name': 'Fitness Classes', 'icon': 'fa-running', 'color': '#0891b2'},
            {'name': 'Sports Equipment', 'icon': 'fa-basketball-ball', 'color': '#22d3ee'},
            {'name': 'Wellness', 'icon': 'fa-spa', 'color': '#67e8f9'},
            {'name': 'Vision Care', 'icon': 'fa-eye', 'color': '#a5f3fc'},
        ]
    },

    # Entertainment
    'Entertainment': {
        'icon': 'fa-gamepad',
        'color': '#8b5cf6',  # Purple
        'subcategories': [
            {'name': 'Movies', 'icon': 'fa-film', 'color': '#7c3aed'},
            {'name': 'Concerts', 'icon': 'fa-music', 'color': '#a78bfa'},
            {'name': 'Sports Events', 'icon': 'fa-ticket-alt', 'color': '#c4b5fd'},
            {'name': 'Streaming Services', 'icon': 'fa-tv', 'color': '#ede9fe'},
            {'name': 'Gaming', 'icon': 'fa-gamepad', 'color': '#8b5cf6'},
            {'name': 'Hobbies', 'icon': 'fa-chess', 'color': '#7c3aed'},
            {'name': 'Subscriptions', 'icon': 'fa-sync', 'color': '#a78bfa'},
            {'name': 'Events', 'icon': 'fa-calendar-day', 'color': '#c4b5fd'},
        ]
    },

    # Personal Care
    'Personal Care': {
        'icon': 'fa-cut',
        'color': '#14b8a6',  # Teal
        'subcategories': [
            {'name': 'Hair Care', 'icon': 'fa-cut', 'color': '#0d9488'},
            {'name': 'Salon/Spa', 'icon': 'fa-spa', 'color': '#2dd4bf'},
            {'name': 'Cosmetics', 'icon': 'fa-makeup', 'color': '#5eead4'},
            {'name': 'Toiletries', 'icon': 'fa-pump-soap', 'color': '#99f6e4'},
            {'name': 'Skincare', 'icon': 'fa-hand-sparkles', 'color': '#14b8a6'},
        ]
    },

    # Education
    'Education': {
        'icon': 'fa-graduation-cap',
        'color': '#6366f1',  # Indigo
        'subcategories': [
            {'name': 'Tuition', 'icon': 'fa-school', 'color': '#4f46e5'},
            {'name': 'Books & Supplies', 'icon': 'fa-book-open', 'color': '#818cf8'},
            {'name': 'Online Courses', 'icon': 'fa-laptop-code', 'color': '#a5b4fc'},
            {'name': 'Student Loans', 'icon': 'fa-file-invoice-dollar', 'color': '#c7d2fe'},
            {'name': 'Workshops', 'icon': 'fa-chalkboard-teacher', 'color': '#6366f1'},
        ]
    },

    # Travel & Vacation
    'Travel': {
        'icon': 'fa-plane',
        'color': '#f97316',  # Orange-Red
        'subcategories': [
            {'name': 'Flights', 'icon': 'fa-plane-departure', 'color': '#ea580c'},
            {'name': 'Hotels', 'icon': 'fa-hotel', 'color': '#fb923c'},
            {'name': 'Car Rental', 'icon': 'fa-car', 'color': '#fdba74'},
            {'name': 'Activities', 'icon': 'fa-hiking', 'color': '#fed7aa'},
            {'name': 'Travel Insurance', 'icon': 'fa-shield-alt', 'color': '#f97316'},
            {'name': 'Souvenirs', 'icon': 'fa-shopping-bag', 'color': '#ea580c'},
        ]
    },

    # Pets
    'Pets': {
        'icon': 'fa-paw',
        'color': '#84cc16',  # Lime
        'subcategories': [
            {'name': 'Pet Food', 'icon': 'fa-bone', 'color': '#65a30d'},
            {'name': 'Veterinary', 'icon': 'fa-stethoscope', 'color': '#a3e635'},
            {'name': 'Pet Supplies', 'icon': 'fa-paw', 'color': '#bef264'},
            {'name': 'Grooming', 'icon': 'fa-cut', 'color': '#d9f99d'},
            {'name': 'Pet Insurance', 'icon': 'fa-shield-alt', 'color': '#84cc16'},
        ]
    },

    # Family & Kids
    'Family & Kids': {
        'icon': 'fa-baby',
        'color': '#fbbf24',  # Amber
        'subcategories': [
            {'name': 'Childcare', 'icon': 'fa-child', 'color': '#f59e0b'},
            {'name': 'Diapers & Baby Care', 'icon': 'fa-baby-carriage', 'color': '#fcd34d'},
            {'name': 'Toys', 'icon': 'fa-puzzle-piece', 'color': '#fde68a'},
            {'name': 'Child Activities', 'icon': 'fa-futbol', 'color': '#fbbf24'},
            {'name': 'Allowance', 'icon': 'fa-hand-holding-usd', 'color': '#f59e0b'},
        ]
    },

    # Debt & Loans
    'Debt & Loans': {
        'icon': 'fa-file-invoice-dollar',
        'color': '#dc2626',  # Dark Red
        'subcategories': [
            {'name': 'Credit Card Payment', 'icon': 'fa-credit-card', 'color': '#b91c1c'},
            {'name': 'Student Loan', 'icon': 'fa-graduation-cap', 'color': '#dc2626'},
            {'name': 'Personal Loan', 'icon': 'fa-hand-holding-usd', 'color': '#ef4444'},
            {'name': 'Car Loan', 'icon': 'fa-car', 'color': '#f87171'},
            {'name': 'Other Debt', 'icon': 'fa-file-invoice', 'color': '#fca5a5'},
        ]
    },

    # Savings & Investments
    'Savings & Investments': {
        'icon': 'fa-piggy-bank',
        'color': '#059669',  # Emerald
        'subcategories': [
            {'name': 'Emergency Fund', 'icon': 'fa-life-ring', 'color': '#047857'},
            {'name': 'Retirement', 'icon': 'fa-umbrella-beach', 'color': '#10b981'},
            {'name': 'Stocks', 'icon': 'fa-chart-line', 'color': '#34d399'},
            {'name': 'Crypto', 'icon': 'fa-bitcoin', 'color': '#6ee7b7'},
            {'name': 'Real Estate', 'icon': 'fa-building', 'color': '#a7f3d0'},
            {'name': 'Other Investments', 'icon': 'fa-coins', 'color': '#d1fae5'},
        ]
    },

    # Insurance
    'Insurance': {
        'icon': 'fa-shield-alt',
        'color': '#0ea5e9',  # Sky Blue
        'subcategories': [
            {'name': 'Life Insurance', 'icon': 'fa-heart', 'color': '#0284c7'},
            {'name': 'Health Insurance', 'icon': 'fa-heartbeat', 'color': '#38bdf8'},
            {'name': 'Auto Insurance', 'icon': 'fa-car', 'color': '#7dd3fc'},
            {'name': 'Home Insurance', 'icon': 'fa-home', 'color': '#bae6fd'},
            {'name': 'Disability Insurance', 'icon': 'fa-wheelchair', 'color': '#0ea5e9'},
        ]
    },

    # Taxes
    'Taxes': {
        'icon': 'fa-receipt',
        'color': '#78716c',  # Stone
        'subcategories': [
            {'name': 'Federal Tax', 'icon': 'fa-landmark', 'color': '#57534e'},
            {'name': 'State Tax', 'icon': 'fa-map-marker-alt', 'color': '#78716c'},
            {'name': 'Property Tax', 'icon': 'fa-home', 'color': '#a8a29e'},
            {'name': 'Sales Tax', 'icon': 'fa-shopping-cart', 'color': '#d6d3d1'},
        ]
    },

    # Charity & Donations
    'Charity': {
        'icon': 'fa-hands-helping',
        'color': '#d946ef',  # Fuchsia
        'subcategories': [
            {'name': 'Religious', 'icon': 'fa-pray', 'color': '#c026d3'},
            {'name': 'Non-Profit', 'icon': 'fa-hand-holding-heart', 'color': '#e879f9'},
            {'name': 'Gifts', 'icon': 'fa-gift', 'color': '#f0abfc'},
            {'name': 'Crowdfunding', 'icon': 'fa-users', 'color': '#fae8ff'},
        ]
    },

    # Business Expenses
    'Business': {
        'icon': 'fa-briefcase',
        'color': '#64748b',  # Slate
        'subcategories': [
            {'name': 'Office Rent', 'icon': 'fa-building', 'color': '#475569'},
            {'name': 'Equipment', 'icon': 'fa-laptop', 'color': '#64748b'},
            {'name': 'Software & Tools', 'icon': 'fa-tools', 'color': '#94a3b8'},
            {'name': 'Marketing', 'icon': 'fa-bullhorn', 'color': '#cbd5e1'},
            {'name': 'Professional Services', 'icon': 'fa-user-tie', 'color': '#e2e8f0'},
            {'name': 'Business Travel', 'icon': 'fa-plane', 'color': '#64748b'},
            {'name': 'Meals & Entertainment', 'icon': 'fa-utensils', 'color': '#475569'},
        ]
    },

    # Miscellaneous
    'Miscellaneous': {
        'icon': 'fa-ellipsis-h',
        'color': '#9ca3af',  # Gray
        'subcategories': [
            {'name': 'Bank Fees', 'icon': 'fa-university', 'color': '#6b7280'},
            {'name': 'ATM Fees', 'icon': 'fa-money-check-alt', 'color': '#9ca3af'},
            {'name': 'Late Fees', 'icon': 'fa-exclamation-triangle', 'color': '#d1d5db'},
            {'name': 'Other', 'icon': 'fa-question', 'color': '#e5e7eb'},
        ]
    },
}
