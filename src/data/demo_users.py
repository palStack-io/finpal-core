"""
Demo Users and Mock Data
Creates 3 demo accounts with realistic transaction data
"""

DEMO_USERS = [
    {
        'email': 'alice@example.com',
        'password': 'demo123',  # Will be hashed
        'first_name': 'Alice',
        'last_name': 'Johnson',
        'default_currency_code': 'USD',
        'profile_type': 'personal',
        'description': 'Personal finance enthusiast, tracks groceries and dining carefully'
    },
    {
        'email': 'bob@example.com',
        'password': 'demo123',
        'first_name': 'Bob',
        'last_name': 'Smith',
        'default_currency_code': 'USD',
        'profile_type': 'business',
        'description': 'Small business owner, tracks business expenses and income'
    },
    {
        'email': 'carol@example.com',
        'password': 'demo123',
        'first_name': 'Carol',
        'last_name': 'Williams',
        'default_currency_code': 'USD',
        'profile_type': 'investor',
        'description': 'Active investor, tracks portfolio and investment income'
    }
]

# Mock transactions for Alice (Personal Finance User)
ALICE_TRANSACTIONS = [
    # November transactions
    {'description': 'Salary - Tech Corp', 'amount': 5000, 'type': 'income', 'date': '2025-11-15', 'category_hint': 'Income/Salary'},
    {'description': 'Whole Foods Market', 'amount': 127.43, 'type': 'expense', 'date': '2025-11-16', 'category_hint': 'Groceries'},
    {'description': 'Netflix Subscription', 'amount': 15.99, 'type': 'expense', 'date': '2025-11-17', 'category_hint': 'Entertainment/Streaming Services'},
    {'description': 'Starbucks Coffee', 'amount': 5.75, 'type': 'expense', 'date': '2025-11-17', 'category_hint': 'Dining/Coffee Shops'},
    {'description': 'Shell Gas Station', 'amount': 45.00, 'type': 'expense', 'date': '2025-11-18', 'category_hint': 'Transportation/Fuel'},
    {'description': 'Target', 'amount': 89.23, 'type': 'expense', 'date': '2025-11-19', 'category_hint': 'Shopping'},
    {'description': 'Electric Bill - PG&E', 'amount': 134.50, 'type': 'expense', 'date': '2025-11-20', 'category_hint': 'Utilities/Electricity'},
    {'description': 'Chipotle', 'amount': 12.50, 'type': 'expense', 'date': '2025-11-20', 'category_hint': 'Dining/Fast Food'},
    {'description': 'Amazon Prime', 'amount': 14.99, 'type': 'expense', 'date': '2025-11-21', 'category_hint': 'Shopping/Online'},
    {'description': 'CVS Pharmacy', 'amount': 23.45, 'type': 'expense', 'date': '2025-11-22', 'category_hint': 'Healthcare/Pharmacy'},

    # December transactions
    {'description': 'Rent Payment', 'amount': 1500, 'type': 'expense', 'date': '2025-12-01', 'category_hint': 'Housing/Rent'},
    {'description': 'Verizon Wireless', 'amount': 75.00, 'type': 'expense', 'date': '2025-12-10', 'category_hint': 'Utilities/Phone'},
    {'description': 'LA Fitness Membership', 'amount': 29.99, 'type': 'expense', 'date': '2025-12-12', 'category_hint': 'Fitness/Gym'},
    {'description': 'Salary - Tech Corp', 'amount': 5000, 'type': 'income', 'date': '2025-12-15', 'category_hint': 'Income/Salary'},
    {'description': 'Trader Joes', 'amount': 95.67, 'type': 'expense', 'date': '2025-12-16', 'category_hint': 'Groceries'},
    {'description': 'Spotify Premium', 'amount': 10.99, 'type': 'expense', 'date': '2025-12-17', 'category_hint': 'Entertainment/Music Streaming'},
    {'description': 'Uber Ride', 'amount': 18.25, 'type': 'expense', 'date': '2025-12-18', 'category_hint': 'Transportation/Rideshare'},
    {'description': 'Panera Bread', 'amount': 14.75, 'type': 'expense', 'date': '2025-12-19', 'category_hint': 'Dining/Casual Dining'},
    {'description': 'Costco', 'amount': 156.89, 'type': 'expense', 'date': '2025-12-20', 'category_hint': 'Groceries/Wholesale'},
    {'description': 'Freelance Project Payment', 'amount': 750, 'type': 'income', 'date': '2025-12-25', 'category_hint': 'Income/Freelance'},

    # January 2026 transactions (current month)
    {'description': 'Rent Payment', 'amount': 1500, 'type': 'expense', 'date': '2026-01-01', 'category_hint': 'Housing/Rent'},
    {'description': 'Safeway', 'amount': 112.35, 'type': 'expense', 'date': '2026-01-05', 'category_hint': 'Groceries'},
    {'description': 'Starbucks', 'amount': 6.50, 'type': 'expense', 'date': '2026-01-06', 'category_hint': 'Dining/Coffee Shops'},
    {'description': 'Shell Gas', 'amount': 52.00, 'type': 'expense', 'date': '2026-01-07', 'category_hint': 'Transportation/Fuel'},
    {'description': 'Amazon Purchase', 'amount': 43.99, 'type': 'expense', 'date': '2026-01-08', 'category_hint': 'Shopping/Online'},
    {'description': 'Netflix', 'amount': 15.99, 'type': 'expense', 'date': '2026-01-09', 'category_hint': 'Entertainment/Streaming Services'},
    {'description': 'Verizon Wireless', 'amount': 75.00, 'type': 'expense', 'date': '2026-01-10', 'category_hint': 'Utilities/Phone'},
    {'description': 'Chipotle', 'amount': 13.25, 'type': 'expense', 'date': '2026-01-11', 'category_hint': 'Dining/Fast Food'},
    {'description': 'Target', 'amount': 67.89, 'type': 'expense', 'date': '2026-01-12', 'category_hint': 'Shopping'},
    {'description': 'LA Fitness', 'amount': 29.99, 'type': 'expense', 'date': '2026-01-13', 'category_hint': 'Fitness/Gym'},
    {'description': 'Whole Foods', 'amount': 89.45, 'type': 'expense', 'date': '2026-01-14', 'category_hint': 'Groceries'},
    {'description': 'Salary - Tech Corp', 'amount': 5000, 'type': 'income', 'date': '2026-01-15', 'category_hint': 'Income/Salary'},
    {'description': 'Uber Eats', 'amount': 32.50, 'type': 'expense', 'date': '2026-01-16', 'category_hint': 'Dining/Delivery'},
    {'description': 'CVS Pharmacy', 'amount': 18.75, 'type': 'expense', 'date': '2026-01-17', 'category_hint': 'Healthcare/Pharmacy'},
    {'description': 'Spotify Premium', 'amount': 10.99, 'type': 'expense', 'date': '2026-01-18', 'category_hint': 'Entertainment/Music Streaming'},
    {'description': 'Trader Joes', 'amount': 78.23, 'type': 'expense', 'date': '2026-01-19', 'category_hint': 'Groceries'},
    {'description': 'Electric Bill', 'amount': 145.50, 'type': 'expense', 'date': '2026-01-20', 'category_hint': 'Utilities/Electricity'},
    {'description': 'Movies AMC', 'amount': 28.00, 'type': 'expense', 'date': '2026-01-21', 'category_hint': 'Entertainment/Movies'},
    {'description': 'Shell Gas', 'amount': 48.00, 'type': 'expense', 'date': '2026-01-22', 'category_hint': 'Transportation/Fuel'},
]

# Mock transactions for Bob (Business Owner)
BOB_TRANSACTIONS = [
    # November transactions
    {'description': 'Office Rent', 'amount': 1200, 'type': 'expense', 'date': '2025-11-01', 'category_hint': 'Business/Rent'},
    {'description': 'LinkedIn Premium', 'amount': 39.99, 'type': 'expense', 'date': '2025-11-07', 'category_hint': 'Business/Subscriptions'},
    {'description': 'Client Invoice #1001', 'amount': 3500, 'type': 'income', 'date': '2025-11-10', 'category_hint': 'Income/Business Income'},
    {'description': 'Office Supplies - Staples', 'amount': 245.67, 'type': 'expense', 'date': '2025-11-11', 'category_hint': 'Business/Office Supplies'},
    {'description': 'Software Subscription - Adobe', 'amount': 52.99, 'type': 'expense', 'date': '2025-11-12', 'category_hint': 'Business/Software'},
    {'description': 'Business Lunch - Client Meeting', 'amount': 87.50, 'type': 'expense', 'date': '2025-11-13', 'category_hint': 'Business/Meals'},
    {'description': 'AWS Cloud Services', 'amount': 125.00, 'type': 'expense', 'date': '2025-11-14', 'category_hint': 'Business/Cloud Services'},
    {'description': 'Internet - Comcast Business', 'amount': 99.99, 'type': 'expense', 'date': '2025-11-15', 'category_hint': 'Utilities/Internet'},
    {'description': 'Marketing Ads - Google', 'amount': 450.00, 'type': 'expense', 'date': '2025-11-16', 'category_hint': 'Business/Marketing'},
    {'description': 'Client Invoice #1002', 'amount': 2800, 'type': 'income', 'date': '2025-11-20', 'category_hint': 'Income/Business/Income'},

    # December transactions
    {'description': 'Client Invoice #1003', 'amount': 4200, 'type': 'income', 'date': '2025-12-05', 'category_hint': 'Income/Business Income'},
    {'description': 'Business Insurance', 'amount': 275.00, 'type': 'expense', 'date': '2025-12-10', 'category_hint': 'Business/Insurance'},
    {'description': 'Office Supplies - Amazon', 'amount': 156.43, 'type': 'expense', 'date': '2025-12-12', 'category_hint': 'Business/Office Supplies'},
    {'description': 'Conference Registration', 'amount': 499.00, 'type': 'expense', 'date': '2025-12-15', 'category_hint': 'Business/Education'},
    {'description': 'Client Invoice #1004', 'amount': 3100, 'type': 'income', 'date': '2025-12-18', 'category_hint': 'Income/Business Income'},
    {'description': 'Zoom Pro Subscription', 'amount': 14.99, 'type': 'expense', 'date': '2025-12-20', 'category_hint': 'Business/Software'},
    {'description': 'FedEx Shipping', 'amount': 35.25, 'type': 'expense', 'date': '2025-12-22', 'category_hint': 'Business/Shipping'},
    {'description': 'Contract Work Payment', 'amount': 1500, 'type': 'income', 'date': '2025-12-22', 'category_hint': 'Income/Contract'},
    {'description': 'Parking Downtown', 'amount': 25.00, 'type': 'expense', 'date': '2025-12-23', 'category_hint': 'Transportation/Parking'},
    {'description': 'Business Dinner', 'amount': 145.75, 'type': 'expense', 'date': '2025-12-25', 'category_hint': 'Business/Meals'},

    # January 2026 transactions (current month)
    {'description': 'Office Rent', 'amount': 1200, 'type': 'expense', 'date': '2026-01-01', 'category_hint': 'Business/Rent'},
    {'description': 'Client Invoice #1005', 'amount': 3800, 'type': 'income', 'date': '2026-01-05', 'category_hint': 'Income/Business Income'},
    {'description': 'LinkedIn Premium', 'amount': 39.99, 'type': 'expense', 'date': '2026-01-07', 'category_hint': 'Business/Subscriptions'},
    {'description': 'Office Supplies', 'amount': 178.50, 'type': 'expense', 'date': '2026-01-08', 'category_hint': 'Business/Office Supplies'},
    {'description': 'AWS Services', 'amount': 135.00, 'type': 'expense', 'date': '2026-01-10', 'category_hint': 'Business/Cloud Services'},
    {'description': 'Adobe Creative Cloud', 'amount': 52.99, 'type': 'expense', 'date': '2026-01-12', 'category_hint': 'Business/Software'},
    {'description': 'Client Invoice #1006', 'amount': 4500, 'type': 'income', 'date': '2026-01-15', 'category_hint': 'Income/Business Income'},
    {'description': 'Marketing Ads', 'amount': 380.00, 'type': 'expense', 'date': '2026-01-16', 'category_hint': 'Business/Marketing'},
    {'description': 'Business Lunch', 'amount': 95.50, 'type': 'expense', 'date': '2026-01-17', 'category_hint': 'Business/Meals'},
    {'description': 'Internet Bill', 'amount': 99.99, 'type': 'expense', 'date': '2026-01-18', 'category_hint': 'Utilities/Internet'},
    {'description': 'Zoom Subscription', 'amount': 14.99, 'type': 'expense', 'date': '2026-01-20', 'category_hint': 'Business/Software'},
    {'description': 'FedEx Shipping', 'amount': 42.75, 'type': 'expense', 'date': '2026-01-21', 'category_hint': 'Business/Shipping'},
    {'description': 'Parking', 'amount': 30.00, 'type': 'expense', 'date': '2026-01-22', 'category_hint': 'Transportation/Parking'},
]

# Mock transactions for Carol (Investor)
CAROL_TRANSACTIONS = [
    # November transactions
    {'description': 'HOA Fee', 'amount': 150.00, 'type': 'expense', 'date': '2025-11-01', 'category_hint': 'Housing/HOA'},
    {'description': 'Rental Income - Property A', 'amount': 2200, 'type': 'income', 'date': '2025-11-05', 'category_hint': 'Income/Rental'},
    {'description': 'Property Tax', 'amount': 450.00, 'type': 'expense', 'date': '2025-11-10', 'category_hint': 'Housing/Property Tax'},
    {'description': 'Dividend - Tesla', 'amount': 67.30, 'type': 'income', 'date': '2025-11-10', 'category_hint': 'Income/Dividends'},
    {'description': 'Transfer to Brokerage - TSLA Purchase', 'amount': 1500, 'type': 'transfer', 'date': '2025-11-12', 'category_hint': 'Transfers'},
    {'description': 'Transfer to Brokerage - NVDA Purchase', 'amount': 2000, 'type': 'transfer', 'date': '2025-11-12', 'category_hint': 'Transfers'},
    {'description': 'Brokerage Fee - Fidelity', 'amount': 4.95, 'type': 'expense', 'date': '2025-11-12', 'category_hint': 'Investments/Fees'},
    {'description': 'Dividend - Apple Inc', 'amount': 125.50, 'type': 'income', 'date': '2025-11-15', 'category_hint': 'Income/Dividends'},
    {'description': 'Property Maintenance', 'amount': 275.00, 'type': 'expense', 'date': '2025-11-18', 'category_hint': 'Housing/Maintenance'},
    {'description': 'Interest - Savings Account', 'amount': 45.75, 'type': 'income', 'date': '2025-11-20', 'category_hint': 'Income/Interest'},

    # December transactions
    {'description': 'Rental Income - Property A', 'amount': 2200, 'type': 'income', 'date': '2025-12-05', 'category_hint': 'Income/Rental'},
    {'description': 'Interest - CD Account', 'amount': 125.00, 'type': 'income', 'date': '2025-12-15', 'category_hint': 'Income/Interest'},
    {'description': 'Dividend - Microsoft', 'amount': 89.25, 'type': 'income', 'date': '2025-12-16', 'category_hint': 'Income/Dividends'},
    {'description': 'Transfer to Crypto Exchange - BTC', 'amount': 1000, 'type': 'transfer', 'date': '2025-12-18', 'category_hint': 'Transfers'},
    {'description': 'Property Insurance', 'amount': 185.00, 'type': 'expense', 'date': '2025-12-20', 'category_hint': 'Housing/Insurance'},
    {'description': 'Investment Advisory Fee', 'amount': 250.00, 'type': 'expense', 'date': '2025-12-22', 'category_hint': 'Investments/Advisory'},
    {'description': 'Brokerage Fee', 'amount': 6.95, 'type': 'expense', 'date': '2025-12-22', 'category_hint': 'Investments/Fees'},
    {'description': 'Consulting Income', 'amount': 3500, 'type': 'income', 'date': '2025-12-25', 'category_hint': 'Income/Consulting'},
    {'description': 'Consulting Project', 'amount': 4200, 'type': 'income', 'date': '2025-12-25', 'category_hint': 'Income/Consulting'},
    {'description': 'Property Utilities', 'amount': 95.50, 'type': 'expense', 'date': '2025-12-28', 'category_hint': 'Utilities'},

    # January 2026 transactions (current month)
    {'description': 'HOA Fee', 'amount': 150.00, 'type': 'expense', 'date': '2026-01-01', 'category_hint': 'Housing/HOA'},
    {'description': 'Rental Income - Property A', 'amount': 2200, 'type': 'income', 'date': '2026-01-05', 'category_hint': 'Income/Rental'},
    {'description': 'Dividend - Tesla', 'amount': 72.50, 'type': 'income', 'date': '2026-01-10', 'category_hint': 'Income/Dividends'},
    {'description': 'Property Tax', 'amount': 450.00, 'type': 'expense', 'date': '2026-01-12', 'category_hint': 'Housing/Property Tax'},
    {'description': 'Brokerage Fee', 'amount': 5.95, 'type': 'expense', 'date': '2026-01-14', 'category_hint': 'Investments/Fees'},
    {'description': 'Dividend - Apple', 'amount': 135.75, 'type': 'income', 'date': '2026-01-15', 'category_hint': 'Income/Dividends'},
    {'description': 'Property Maintenance', 'amount': 285.00, 'type': 'expense', 'date': '2026-01-16', 'category_hint': 'Housing/Maintenance'},
    {'description': 'Investment Advisory Fee', 'amount': 250.00, 'type': 'expense', 'date': '2026-01-18', 'category_hint': 'Investments/Advisory'},
    {'description': 'Interest - Savings', 'amount': 52.25, 'type': 'income', 'date': '2026-01-20', 'category_hint': 'Income/Interest'},
    {'description': 'Consulting Project', 'amount': 4800, 'type': 'income', 'date': '2026-01-22', 'category_hint': 'Income/Consulting'},
]

# Map user email to their transactions
DEMO_TRANSACTIONS = {
    'alice@example.com': ALICE_TRANSACTIONS,
    'bob@example.com': BOB_TRANSACTIONS,
    'carol@example.com': CAROL_TRANSACTIONS,
}

# Demo accounts for each user
DEMO_ACCOUNTS = {
    'alice@example.com': [
        {'name': 'Chase Checking', 'type': 'checking', 'balance': 2500.00, 'currency': 'USD'},
        {'name': 'Chase Savings', 'type': 'savings', 'balance': 10000.00, 'currency': 'USD'},
        {'name': 'Credit Card', 'type': 'credit', 'balance': -450.00, 'currency': 'USD'},
    ],
    'bob@example.com': [
        {'name': 'Business Checking', 'type': 'checking', 'balance': 15000.00, 'currency': 'USD'},
        {'name': 'Business Savings', 'type': 'savings', 'balance': 25000.00, 'currency': 'USD'},
        {'name': 'Business Credit', 'type': 'credit', 'balance': -2500.00, 'currency': 'USD'},
    ],
    'carol@example.com': [
        {'name': 'Personal Checking', 'type': 'checking', 'balance': 8500.00, 'currency': 'USD'},
        {'name': 'Investment Account', 'type': 'investment', 'balance': 125000.00, 'currency': 'USD'},
        {'name': 'High-Yield Savings', 'type': 'savings', 'balance': 50000.00, 'currency': 'USD'},
    ],
}

# Demo budgets
DEMO_BUDGETS = {
    'alice@example.com': [
        {'name': 'Groceries', 'amount': 400.00, 'period': 'monthly'},
        {'name': 'Food & Dining', 'amount': 200.00, 'period': 'monthly'},
        {'name': 'Entertainment', 'amount': 100.00, 'period': 'monthly'},
        {'name': 'Transportation', 'amount': 300.00, 'period': 'monthly'},
    ],
    'bob@example.com': [
        {'name': 'Business', 'amount': 1000.00, 'period': 'monthly'},
        {'name': 'Marketing', 'amount': 500.00, 'period': 'monthly'},
        {'name': 'Software & Tools', 'amount': 300.00, 'period': 'monthly'},
    ],
    'carol@example.com': [
        {'name': 'Investments', 'amount': 5000.00, 'period': 'monthly'},
        {'name': 'Housing', 'amount': 1000.00, 'period': 'monthly'},
        {'name': 'Entertainment', 'amount': 200.00, 'period': 'monthly'},
    ],
}

# Investment Portfolios and Holdings
DEMO_INVESTMENTS = {
    'carol@example.com': {
        'portfolios': [
            {
                'name': 'Growth Portfolio',
                'description': 'Long-term growth stocks and ETFs',
                'investments': [
                    {
                        'symbol': 'AAPL',
                        'name': 'Apple Inc.',
                        'shares': 50,
                        'purchase_price': 150.00,
                        'current_price': 175.50,
                        'purchase_date': '2024-06-15',
                        'sector': 'Technology',
                        'industry': 'Consumer Electronics',
                        'notes': 'Core tech holding'
                    },
                    {
                        'symbol': 'MSFT',
                        'name': 'Microsoft Corporation',
                        'shares': 30,
                        'purchase_price': 320.00,
                        'current_price': 380.25,
                        'purchase_date': '2024-07-10',
                        'sector': 'Technology',
                        'industry': 'Software',
                        'notes': 'Cloud computing growth'
                    },
                    {
                        'symbol': 'NVDA',
                        'name': 'NVIDIA Corporation',
                        'shares': 25,
                        'purchase_price': 400.00,
                        'current_price': 520.75,
                        'purchase_date': '2024-08-05',
                        'sector': 'Technology',
                        'industry': 'Semiconductors',
                        'notes': 'AI and GPU market leader'
                    },
                    {
                        'symbol': 'GOOGL',
                        'name': 'Alphabet Inc.',
                        'shares': 40,
                        'purchase_price': 135.00,
                        'current_price': 142.30,
                        'purchase_date': '2024-09-20',
                        'sector': 'Technology',
                        'industry': 'Internet Services',
                        'notes': 'Search and advertising dominance'
                    },
                    {
                        'symbol': 'VOO',
                        'name': 'Vanguard S&P 500 ETF',
                        'shares': 100,
                        'purchase_price': 380.00,
                        'current_price': 412.50,
                        'purchase_date': '2024-05-01',
                        'sector': 'Index Fund',
                        'industry': 'ETF',
                        'notes': 'Broad market exposure'
                    },
                ]
            },
            {
                'name': 'Income Portfolio',
                'description': 'Dividend-paying stocks and bonds',
                'investments': [
                    {
                        'symbol': 'JNJ',
                        'name': 'Johnson & Johnson',
                        'shares': 60,
                        'purchase_price': 155.00,
                        'current_price': 162.40,
                        'purchase_date': '2024-04-15',
                        'sector': 'Healthcare',
                        'industry': 'Pharmaceuticals',
                        'notes': 'Dividend aristocrat, stable income'
                    },
                    {
                        'symbol': 'PG',
                        'name': 'Procter & Gamble',
                        'shares': 45,
                        'purchase_price': 140.00,
                        'current_price': 152.80,
                        'purchase_date': '2024-06-01',
                        'sector': 'Consumer Goods',
                        'industry': 'Consumer Staples',
                        'notes': 'Consistent dividend payer'
                    },
                    {
                        'symbol': 'VYM',
                        'name': 'Vanguard High Dividend Yield ETF',
                        'shares': 80,
                        'purchase_price': 95.00,
                        'current_price': 102.25,
                        'purchase_date': '2024-03-10',
                        'sector': 'Index Fund',
                        'industry': 'ETF',
                        'notes': 'High yield dividend ETF'
                    },
                    {
                        'symbol': 'KO',
                        'name': 'Coca-Cola Company',
                        'shares': 100,
                        'purchase_price': 58.00,
                        'current_price': 61.50,
                        'purchase_date': '2024-05-20',
                        'sector': 'Consumer Goods',
                        'industry': 'Beverages',
                        'notes': 'Global brand, steady dividends'
                    },
                ]
            },
            {
                'name': 'Speculative Portfolio',
                'description': 'High-risk, high-reward investments',
                'investments': [
                    {
                        'symbol': 'TSLA',
                        'name': 'Tesla Inc.',
                        'shares': 20,
                        'purchase_price': 210.00,
                        'current_price': 245.80,
                        'purchase_date': '2024-10-15',
                        'sector': 'Automotive',
                        'industry': 'Electric Vehicles',
                        'notes': 'EV market leader, volatile'
                    },
                    {
                        'symbol': 'COIN',
                        'name': 'Coinbase Global Inc.',
                        'shares': 15,
                        'purchase_price': 85.00,
                        'current_price': 92.30,
                        'purchase_date': '2024-11-01',
                        'sector': 'Financial Services',
                        'industry': 'Cryptocurrency',
                        'notes': 'Crypto exchange exposure'
                    },
                    {
                        'symbol': 'ARKK',
                        'name': 'ARK Innovation ETF',
                        'shares': 50,
                        'purchase_price': 45.00,
                        'current_price': 48.75,
                        'purchase_date': '2024-09-01',
                        'sector': 'Innovation',
                        'industry': 'ETF',
                        'notes': 'Disruptive innovation focus'
                    },
                ]
            }
        ]
    }
}

# Demo Groups - All three users in various groups
DEMO_GROUPS = [
    {
        'name': 'Weekend Trip to Vegas',
        'description': 'Las Vegas bachelor party weekend',
        'created_by': 'alice@example.com',
        'members': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'default_split_method': 'equal',
        'auto_include_all': True,
    },
    {
        'name': 'Startup Coworking',
        'description': 'Shared office space and supplies',
        'created_by': 'bob@example.com',
        'members': ['alice@example.com', 'bob@example.com'],
        'default_split_method': 'percentage',
        'default_split_values': {
            'alice@example.com': 40,
            'bob@example.com': 60
        },
        'auto_include_all': True,
    },
    {
        'name': 'Monthly Book Club',
        'description': 'Book purchases and coffee meetups',
        'created_by': 'carol@example.com',
        'members': ['alice@example.com', 'carol@example.com'],
        'default_split_method': 'equal',
        'auto_include_all': True,
    },
    {
        'name': 'Investment Club',
        'description': 'Group investment research and subscriptions',
        'created_by': 'carol@example.com',
        'members': ['bob@example.com', 'carol@example.com'],
        'default_split_method': 'custom',
        'auto_include_all': False,
    },
]

# Demo Group Transactions with Splits
# Format: group_index refers to index in DEMO_GROUPS array
DEMO_GROUP_TRANSACTIONS = [
    # Vegas Trip (Group 0) - All three users, equal splits
    {
        'group_index': 0,
        'description': 'Hotel Bellagio - 3 Nights',
        'amount': 900.00,
        'date': '2025-12-01',
        'paid_by': 'alice@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Travel/Lodging'
    },
    {
        'group_index': 0,
        'description': 'Cirque du Soleil Tickets',
        'amount': 450.00,
        'date': '2025-12-02',
        'paid_by': 'bob@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Entertainment/Shows'
    },
    {
        'group_index': 0,
        'description': 'Dinner at Gordon Ramsay Steak',
        'amount': 375.00,
        'date': '2025-12-02',
        'paid_by': 'carol@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Dining/Fine Dining'
    },
    {
        'group_index': 0,
        'description': 'Uber from Airport',
        'amount': 45.00,
        'date': '2025-12-01',
        'paid_by': 'alice@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Transportation/Rideshare'
    },
    {
        'group_index': 0,
        'description': 'Breakfast Buffet - Bacchanal',
        'amount': 135.00,
        'date': '2025-12-03',
        'paid_by': 'bob@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Dining/Breakfast'
    },

    # Coworking Space (Group 1) - Alice and Bob, percentage split (40/60)
    {
        'group_index': 1,
        'description': 'WeWork Monthly Membership',
        'amount': 500.00,
        'date': '2025-12-01',
        'paid_by': 'bob@example.com',
        'split_method': 'percentage',
        'split_with': ['alice@example.com', 'bob@example.com'],
        'split_details': {
            'type': 'percentage',
            'values': {
                'alice@example.com': 40,
                'bob@example.com': 60
            }
        },
        'type': 'expense',
        'category_hint': 'Business/Office Space'
    },
    {
        'group_index': 1,
        'description': 'Office Supplies - Staples',
        'amount': 125.00,
        'date': '2025-12-05',
        'paid_by': 'alice@example.com',
        'split_method': 'percentage',
        'split_with': ['alice@example.com', 'bob@example.com'],
        'split_details': {
            'type': 'percentage',
            'values': {
                'alice@example.com': 40,
                'bob@example.com': 60
            }
        },
        'type': 'expense',
        'category_hint': 'Business/Office Supplies'
    },
    {
        'group_index': 1,
        'description': 'Coffee Machine - Nespresso',
        'amount': 200.00,
        'date': '2025-12-10',
        'paid_by': 'bob@example.com',
        'split_method': 'percentage',
        'split_with': ['alice@example.com', 'bob@example.com'],
        'split_details': {
            'type': 'percentage',
            'values': {
                'alice@example.com': 40,
                'bob@example.com': 60
            }
        },
        'type': 'expense',
        'category_hint': 'Business/Equipment'
    },

    # Book Club (Group 2) - Alice and Carol, equal split
    {
        'group_index': 2,
        'description': 'Book: "Atomic Habits" x2',
        'amount': 32.00,
        'date': '2025-11-15',
        'paid_by': 'carol@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Entertainment/Books'
    },
    {
        'group_index': 2,
        'description': 'Coffee Meetup - Starbucks',
        'amount': 12.50,
        'date': '2025-11-20',
        'paid_by': 'alice@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Dining/Coffee Shops'
    },
    {
        'group_index': 2,
        'description': 'Book: "The Psychology of Money" x2',
        'amount': 28.00,
        'date': '2025-12-10',
        'paid_by': 'alice@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Entertainment/Books'
    },
    {
        'group_index': 2,
        'description': 'Book Club Lunch - Panera',
        'amount': 26.50,
        'date': '2025-12-15',
        'paid_by': 'carol@example.com',
        'split_method': 'equal',
        'split_with': ['alice@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Dining/Casual Dining'
    },

    # Investment Club (Group 3) - Bob and Carol, custom splits (varies per transaction)
    {
        'group_index': 3,
        'description': 'Bloomberg Terminal Subscription',
        'amount': 300.00,
        'date': '2025-12-01',
        'paid_by': 'carol@example.com',
        'split_method': 'custom',
        'split_with': ['bob@example.com', 'carol@example.com'],
        'split_details': {
            'type': 'custom',
            'values': {
                'bob@example.com': 100.00,
                'carol@example.com': 200.00
            }
        },
        'type': 'expense',
        'category_hint': 'Investments/Research Tools'
    },
    {
        'group_index': 3,
        'description': 'WSJ Digital Subscription',
        'amount': 39.99,
        'date': '2025-12-05',
        'paid_by': 'bob@example.com',
        'split_method': 'equal',
        'split_with': ['bob@example.com', 'carol@example.com'],
        'type': 'expense',
        'category_hint': 'Business/Subscriptions'
    },
    {
        'group_index': 3,
        'description': 'Investment Conference Tickets',
        'amount': 800.00,
        'date': '2025-12-20',
        'paid_by': 'carol@example.com',
        'split_method': 'custom',
        'split_with': ['bob@example.com', 'carol@example.com'],
        'split_details': {
            'type': 'custom',
            'values': {
                'bob@example.com': 350.00,
                'carol@example.com': 450.00
            }
        },
        'type': 'expense',
        'category_hint': 'Business/Education'
    },
]
