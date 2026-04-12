"""Load comprehensive demo data for testing groups and splits functionality."""
import sys
import os
from datetime import datetime, timedelta
import json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import create_app, db
from src.models import (
    User, Currency, Account, Category, Expense,
    Group, Settlement, Portfolio, Investment, InvestmentTransaction, Budget
)
from src.modules.pointspal.models import PointsProgram, PointsEarnCategory, UserCard, SpendPeriodTotal, OptimizerAlert
from src.data.seed_defaults import load_default_categories, load_default_rules
from werkzeug.security import generate_password_hash


def load_currencies():
    """Load multiple currencies for testing."""
    currencies = [
        {'code': 'USD', 'name': 'US Dollar', 'symbol': '$'},
        {'code': 'EUR', 'name': 'Euro', 'symbol': '€'},
        {'code': 'GBP', 'name': 'British Pound', 'symbol': '£'},
    ]

    created = []
    for curr_data in currencies:
        curr = Currency.query.filter_by(code=curr_data['code']).first()
        if not curr:
            curr = Currency(**curr_data)
            db.session.add(curr)
            created.append(curr_data['code'])

    if created:
        db.session.commit()
        print(f"✓ Created currencies: {', '.join(created)}")
    return currencies


def load_demo_users():
    """Create three demo users with different currencies."""
    users_data = [
        {
            'id': 'alice@example.com',
            'name': 'Alice Johnson',
            'currency': 'USD'
        },
        {
            'id': 'bob@example.com',
            'name': 'Bob Smith',
            'currency': 'EUR'  # Different currency for testing
        },
        {
            'id': 'carol@example.com',
            'name': 'Carol Williams',
            'currency': 'USD'
        }
    ]

    users = []
    for user_data in users_data:
        user = User.query.filter_by(id=user_data['id']).first()
        if not user:
            user = User(
                id=user_data['id'],
                name=user_data['name'],
                password_hash=generate_password_hash('demo123'),
                default_currency_code=user_data['currency']
            )
            db.session.add(user)
            users.append(user)
        else:
            users.append(user)

    db.session.commit()
    print("✓ Created 3 demo users:")
    print("  - alice@example.com / demo123 (USD)")
    print("  - bob@example.com / demo123 (EUR)")
    print("  - carol@example.com / demo123 (USD)")

    return users


def load_accounts(users):
    """Create bank accounts for users."""
    accounts_data = [
        {'user_id': 'alice@example.com', 'name': 'Chase Checking', 'type': 'checking', 'balance': 5000.00},
        {'user_id': 'alice@example.com', 'name': 'Amex Credit Card', 'type': 'credit', 'balance': -1200.00},
        {'user_id': 'bob@example.com', 'name': 'Deutsche Bank', 'type': 'checking', 'balance': 3500.00},
        {'user_id': 'bob@example.com', 'name': 'Mastercard', 'type': 'credit', 'balance': -800.00},
        {'user_id': 'carol@example.com', 'name': 'Wells Fargo Checking', 'type': 'checking', 'balance': 4200.00},
        {'user_id': 'carol@example.com', 'name': 'Visa Credit', 'type': 'credit', 'balance': -500.00},
    ]

    created_accounts = []
    for acc_data in accounts_data:
        account = Account(
            user_id=acc_data['user_id'],
            name=acc_data['name'],
            type=acc_data['type'],
            balance=acc_data['balance'],
            currency_code=User.query.get(acc_data['user_id']).default_currency_code
        )
        db.session.add(account)
        created_accounts.append(account)

    db.session.commit()
    print(f"✓ Created {len(created_accounts)} bank accounts")
    return created_accounts


def load_categories_and_rules(users):
    """Load default categories and transaction rules for each user."""
    category_maps = {}

    for user in users:
        # Check if user already has categories
        existing = Category.query.filter_by(user_id=user.id).first()
        if not existing:
            # Load categories and get the category map
            category_map = load_default_categories(user.id)
            category_maps[user.id] = category_map

            # Load default transaction rules
            load_default_rules(user.id, category_map)

    db.session.commit()
    print(f"✓ Loaded default categories and rules for {len(users)} users")

    # Return all categories for reference
    return Category.query.all()


def load_groups(users):
    """Create groups with members."""
    alice, bob, carol = users

    groups_data = [
        {
            'name': 'Weekend Trip',
            'description': 'Road trip to the mountains',
            'created_by': alice.id,
            'members': [alice, bob, carol]
        },
        {
            'name': 'Apartment Expenses',
            'description': 'Shared apartment costs',
            'created_by': alice.id,
            'members': [alice, bob]
        },
        {
            'name': 'Book Club',
            'description': 'Monthly book club expenses',
            'created_by': carol.id,
            'members': [alice, carol]
        }
    ]

    created_groups = []
    for group_data in groups_data:
        group = Group(
            name=group_data['name'],
            description=group_data['description'],
            created_by=group_data['created_by'],
            default_split_method='equal'
        )
        group.members = group_data['members']
        db.session.add(group)
        created_groups.append(group)

    db.session.commit()
    print(f"✓ Created {len(created_groups)} groups with members")
    return created_groups


def load_expenses(users, accounts, categories, groups):
    """Create various expenses including split expenses."""
    alice, bob, carol = users

    # Get some accounts for each user
    alice_checking = next(acc for acc in accounts if acc.user_id == alice.id and acc.type == 'checking')
    bob_checking = next(acc for acc in accounts if acc.user_id == bob.id and acc.type == 'checking')
    carol_credit = next(acc for acc in accounts if acc.user_id == carol.id and acc.type == 'credit')

    # Get categories for Alice (since categories are per-user, we'll use Alice's)
    alice_categories = Category.query.filter_by(user_id=alice.id).all()
    food_cat = next((cat for cat in alice_categories if cat.name == 'Food & Dining'), None)
    transport_cat = next((cat for cat in alice_categories if cat.name == 'Transportation'), None)
    entertainment_cat = next((cat for cat in alice_categories if cat.name == 'Entertainment'), None)
    groceries_cat = next((cat for cat in alice_categories if 'Groceries' in cat.name), None)

    # Get categories for Bob
    bob_categories = Category.query.filter_by(user_id=bob.id).all()
    bob_transport_cat = next((cat for cat in bob_categories if cat.name == 'Transportation'), None)

    # Get categories for Carol
    carol_categories = Category.query.filter_by(user_id=carol.id).all()
    carol_food_cat = next((cat for cat in carol_categories if cat.name == 'Food & Dining'), None)
    carol_entertainment_cat = next((cat for cat in carol_categories if cat.name == 'Entertainment'), None)

    # Get groups
    weekend_trip = groups[0]
    apartment = groups[1]

    expenses_data = [
        # Alice's personal expenses
        {
            'description': 'Weekly Grocery Shopping',
            'amount': 87.50,
            'date': datetime.now() - timedelta(days=2),
            'user_id': alice.id,
            'paid_by': alice.id,
            'card_used': alice_checking.name,
            'account_id': alice_checking.id,
            'category_id': groceries_cat.id if groceries_cat else None,
            'split_method': 'none',
            'currency_code': 'USD'
        },
        {
            'description': 'Coffee at Starbucks',
            'amount': 5.75,
            'date': datetime.now() - timedelta(days=1),
            'user_id': alice.id,
            'paid_by': alice.id,
            'card_used': alice_checking.name,
            'account_id': alice_checking.id,
            'category_id': food_cat.id if food_cat else None,
            'split_method': 'none',
            'currency_code': 'USD'
        },
        # Weekend Trip group expenses (all 3 people)
        {
            'description': 'Hotel Booking',
            'amount': 300.00,
            'date': datetime.now() - timedelta(days=5),
            'user_id': alice.id,
            'paid_by': alice.id,
            'card_used': alice_checking.name,
            'account_id': alice_checking.id,
            'category_id': entertainment_cat.id if entertainment_cat else None,
            'split_method': 'equal',
            'group_id': weekend_trip.id,
            'split_with': f'{alice.id},{bob.id},{carol.id}',
            'currency_code': 'USD'
        },
        {
            'description': 'Gas for Road Trip',
            'amount': 120.00,
            'date': datetime.now() - timedelta(days=5),
            'user_id': bob.id,
            'paid_by': bob.id,
            'card_used': bob_checking.name,
            'account_id': bob_checking.id,
            'category_id': bob_transport_cat.id if bob_transport_cat else None,
            'split_method': 'equal',
            'group_id': weekend_trip.id,
            'split_with': f'{alice.id},{bob.id},{carol.id}',
            'currency_code': 'EUR',
            'original_amount': 110.00  # EUR amount
        },
        {
            'description': 'Dinner at Mountain Restaurant',
            'amount': 150.00,
            'date': datetime.now() - timedelta(days=4),
            'user_id': carol.id,
            'paid_by': carol.id,
            'card_used': carol_credit.name,
            'account_id': carol_credit.id,
            'category_id': carol_food_cat.id if carol_food_cat else None,
            'split_method': 'equal',
            'group_id': weekend_trip.id,
            'split_with': f'{alice.id},{bob.id},{carol.id}',
            'currency_code': 'USD'
        },
        # Apartment expenses (Alice and Bob)
        {
            'description': 'Monthly Rent',
            'amount': 2000.00,
            'date': datetime.now() - timedelta(days=10),
            'user_id': alice.id,
            'paid_by': alice.id,
            'card_used': alice_checking.name,
            'account_id': alice_checking.id,
            'category_id': None,
            'split_method': 'equal',
            'group_id': apartment.id,
            'split_with': f'{alice.id},{bob.id}',
            'currency_code': 'USD'
        },
        {
            'description': 'Electricity Bill',
            'amount': 85.00,
            'date': datetime.now() - timedelta(days=7),
            'user_id': bob.id,
            'paid_by': bob.id,
            'card_used': bob_checking.name,
            'account_id': bob_checking.id,
            'category_id': None,
            'split_method': 'equal',
            'group_id': apartment.id,
            'split_with': f'{alice.id},{bob.id}',
            'currency_code': 'EUR',
            'original_amount': 78.00  # EUR amount
        },
        # Bob's personal expenses
        {
            'description': 'Taxi to Airport',
            'amount': 45.00,
            'date': datetime.now() - timedelta(days=3),
            'user_id': bob.id,
            'paid_by': bob.id,
            'card_used': bob_checking.name,
            'account_id': bob_checking.id,
            'category_id': bob_transport_cat.id if bob_transport_cat else None,
            'split_method': 'none',
            'currency_code': 'EUR',
            'original_amount': 42.00
        },
        # Carol's personal expenses
        {
            'description': 'Movie Tickets',
            'amount': 28.00,
            'date': datetime.now() - timedelta(days=6),
            'user_id': carol.id,
            'paid_by': carol.id,
            'card_used': carol_credit.name,
            'account_id': carol_credit.id,
            'category_id': carol_entertainment_cat.id if carol_entertainment_cat else None,
            'split_method': 'none',
            'currency_code': 'USD'
        },
    ]

    created_expenses = []
    for exp_data in expenses_data:
        expense = Expense(**exp_data)
        db.session.add(expense)
        created_expenses.append(expense)

    db.session.commit()
    print(f"✓ Created {len(created_expenses)} expenses (including split expenses)")
    return created_expenses


def load_portfolios_and_stocks(users):
    """Create investment portfolios and stocks."""
    alice, bob, carol = users

    # Create portfolios
    portfolios_data = [
        {'name': 'Retirement Account', 'user_id': alice.id},
        {'name': 'Trading Account', 'user_id': bob.id},
    ]

    portfolios = []
    for port_data in portfolios_data:
        portfolio = Portfolio(**port_data)
        db.session.add(portfolio)
        portfolios.append(portfolio)

    db.session.commit()

    # Create investments (stocks)
    investments_data = [
        # Alice's stocks
        {
            'portfolio_id': portfolios[0].id,
            'symbol': 'AAPL',
            'name': 'Apple Inc.',
            'shares': 10.0,
            'purchase_price': 150.00,
            'current_price': 175.00,
        },
        {
            'portfolio_id': portfolios[0].id,
            'symbol': 'GOOGL',
            'name': 'Alphabet Inc.',
            'shares': 5.0,
            'purchase_price': 2800.00,
            'current_price': 2950.00,
        },
        # Bob's stocks
        {
            'portfolio_id': portfolios[1].id,
            'symbol': 'TSLA',
            'name': 'Tesla Inc.',
            'shares': 8.0,
            'purchase_price': 700.00,
            'current_price': 750.00,
        },
    ]

    investments = []
    for inv_data in investments_data:
        investment = Investment(**inv_data)
        db.session.add(investment)
        investments.append(investment)

    db.session.commit()

    print(f"✓ Created {len(portfolios)} portfolios with {len(investments)} stocks")
    return portfolios, investments


def load_settlements(users):
    """Create some settlements between users."""
    alice, bob, carol = users

    settlements_data = [
        {
            'payer_id': bob.id,
            'receiver_id': alice.id,
            'amount': 50.00,
            'date': datetime.now() - timedelta(days=2),
            'description': 'Weekend Trip Settlement'
        },
        {
            'payer_id': bob.id,
            'receiver_id': alice.id,
            'amount': 1000.00,
            'date': datetime.now() - timedelta(days=8),
            'description': 'Rent Payment - January'
        },
    ]

    settlements = []
    for settle_data in settlements_data:
        settlement = Settlement(**settle_data)
        db.session.add(settlement)
        settlements.append(settlement)

    db.session.commit()
    print(f"✓ Created {len(settlements)} settlements")
    return settlements


def _find_category(user_id, *name_candidates):
    """Return the first Category whose name matches any of the candidates (case-insensitive)."""
    cats = Category.query.filter_by(user_id=user_id).all()
    for candidate in name_candidates:
        match = next((c for c in cats if c.name.lower() == candidate.lower()), None)
        if match:
            return match
    return None


def load_budgets(users):
    """Create sample budgets for users (idempotent — skips existing rows)."""
    alice, bob, carol = users

    # Resolve categories using multiple candidate names to handle different seed variants
    food_cat      = _find_category(alice.id, 'Food & Dining', 'Dining', 'Restaurants', 'Food')
    transport_cat = _find_category(alice.id, 'Transportation', 'Transport', 'Transit')
    grocery_cat   = _find_category(alice.id, 'Groceries', 'Grocery', 'Supermarket')
    bob_food_cat  = _find_category(bob.id,   'Food & Dining', 'Dining', 'Restaurants', 'Food')

    now = datetime.now()
    start_of_month = datetime(now.year, now.month, 1)

    budgets_data = [
        # Alice's budgets
        {
            'user_id': alice.id,
            'name': 'Monthly Food Budget',
            'amount': 500.00,
            'period': 'monthly',
            'start_date': start_of_month,
            'category_id': food_cat.id if food_cat else None,
        },
        {
            'user_id': alice.id,
            'name': 'Transportation Budget',
            'amount': 300.00,
            'period': 'monthly',
            'start_date': start_of_month,
            'category_id': transport_cat.id if transport_cat else None,
        },
        {
            'user_id': alice.id,
            'name': 'Groceries Budget',
            'amount': 400.00,
            'period': 'monthly',
            'start_date': start_of_month,
            'category_id': grocery_cat.id if grocery_cat else None,
        },
        # Bob's budgets
        {
            'user_id': bob.id,
            'name': 'Dining Out Budget',
            'amount': 400.00,
            'period': 'monthly',
            'start_date': start_of_month,
            'category_id': bob_food_cat.id if bob_food_cat else None,
        },
    ]

    budgets = []
    for budget_data in budgets_data:
        existing = Budget.query.filter_by(
            user_id=budget_data['user_id'],
            name=budget_data['name'],
        ).first()
        if existing:
            budgets.append(existing)
            continue
        budget = Budget(**budget_data)
        db.session.add(budget)
        budgets.append(budget)

    db.session.commit()
    print(f"✓ Loaded {len(budgets)} budgets")
    return budgets


def _seed_spend(rows):
    """Idempotently insert SpendPeriodTotal rows."""
    for card_id_val, category, period_type, period_key, spent, pts_earned, pts_missed in rows:
        if not card_id_val:
            continue
        existing = SpendPeriodTotal.query.filter_by(
            user_card_id=card_id_val,
            category=category,
            period_type=period_type,
            period_key=period_key,
        ).first()
        if not existing:
            db.session.add(SpendPeriodTotal(
                user_card_id=card_id_val,
                category=category,
                period_type=period_type,
                period_key=period_key,
                total_spent=spent,
                total_pts_earned=float(pts_earned),
                total_pts_missed=float(pts_missed),
            ))
    db.session.commit()


def _seed_alerts(alert_rows):
    """Idempotently insert OptimizerAlert rows."""
    for user_id_val, card_id_val, category, period_type, period_key, alert_type, pct in alert_rows:
        if not card_id_val:
            continue
        existing = OptimizerAlert.query.filter_by(
            user_card_id=card_id_val,
            category=category,
            period_type=period_type,
            period_key=period_key,
            alert_type=alert_type,
        ).first()
        if not existing:
            db.session.add(OptimizerAlert(
                user_id=user_id_val,
                user_card_id=card_id_val,
                category=category,
                period_type=period_type,
                period_key=period_key,
                alert_type=alert_type,
                pct_used=pct,
                dismissed=False,
            ))
    db.session.commit()


def _get_card_id(user_id, nickname):
    c = UserCard.query.filter_by(user_id=user_id, card_nickname=nickname).first()
    return c.id if c else None


def load_pointspal_demo(users):
    """Create pointsPal programs and wallet cards for Alice, Bob, and Carol."""
    from datetime import datetime as dt
    alice, bob, carol = users[0], users[1], users[2]

    now_month  = '2026-03'
    prev_month = '2026-02'
    now_annual = '2026'
    now_q1     = '2026-Q1'

    # ── Programs ────────────────────────────────────────────────────────────
    programs_data = [
        {'program_id': 'chase_ur',    'issuer': 'Chase',            'program_name': 'Ultimate Rewards',        'base_cpp': 2.0, 'currency_name': 'Ultimate Rewards Points'},
        {'program_id': 'amex_mr',     'issuer': 'American Express', 'program_name': 'Membership Rewards',      'base_cpp': 2.0, 'currency_name': 'Membership Rewards Points'},
        {'program_id': 'cap1_miles',  'issuer': 'Capital One',      'program_name': 'Miles',                   'base_cpp': 1.0, 'currency_name': 'Miles'},
        {'program_id': 'citi_cashback','issuer': 'Citi',            'program_name': 'Cash Back',               'base_cpp': 1.0, 'currency_name': 'Cash Back'},
        {'program_id': 'cap1_savor',  'issuer': 'Capital One',      'program_name': 'Savor Rewards',           'base_cpp': 1.0, 'currency_name': 'Cash Back'},
        {'program_id': 'discover_it', 'issuer': 'Discover',         'program_name': 'Discover it Cash Back',   'base_cpp': 1.0, 'currency_name': 'Cash Back'},
    ]
    for p in programs_data:
        if not PointsProgram.query.filter_by(program_id=p['program_id']).first():
            db.session.add(PointsProgram(**p))
    db.session.commit()

    # ── Earn categories ──────────────────────────────────────────────────────
    earn_cats = [
        # Chase Ultimate Rewards
        {'program_id': 'chase_ur',    'category': 'travel',         'multiplier': 3.0,  'cap_amount': None,  'cap_period': None},
        {'program_id': 'chase_ur',    'category': 'dining',         'multiplier': 3.0,  'cap_amount': None,  'cap_period': None},
        # Amex Membership Rewards
        {'program_id': 'amex_mr',     'category': 'dining',         'multiplier': 4.0,  'cap_amount': 25000, 'cap_period': 'annual'},
        {'program_id': 'amex_mr',     'category': 'groceries',      'multiplier': 4.0,  'cap_amount': 25000, 'cap_period': 'annual'},
        {'program_id': 'amex_mr',     'category': 'travel',         'multiplier': 3.0,  'cap_amount': None,  'cap_period': None},
        # Capital One Miles (Venture X)
        {'program_id': 'cap1_miles',  'category': 'travel',         'multiplier': 10.0, 'cap_amount': None,  'cap_period': None},
        {'program_id': 'cap1_miles',  'category': 'hotels',         'multiplier': 5.0,  'cap_amount': None,  'cap_period': None},
        # Capital One Savor (Carol)
        {'program_id': 'cap1_savor',  'category': 'dining',         'multiplier': 4.0,  'cap_amount': None,  'cap_period': None},
        {'program_id': 'cap1_savor',  'category': 'groceries',      'multiplier': 3.0,  'cap_amount': None,  'cap_period': None},
        {'program_id': 'cap1_savor',  'category': 'entertainment',  'multiplier': 4.0,  'cap_amount': None,  'cap_period': None},
        # Discover it — quarterly rotating 5% (Q1 2026: groceries, capped at $1,500)
        {'program_id': 'discover_it', 'category': 'groceries',      'multiplier': 5.0,  'cap_amount': 1500,  'cap_period': 'quarterly'},
    ]
    for ec in earn_cats:
        if not PointsEarnCategory.query.filter_by(program_id=ec['program_id'], category=ec['category']).first():
            db.session.add(PointsEarnCategory(**ec))
    db.session.commit()

    # ── Alice's cards ────────────────────────────────────────────────────────
    # Story: heavy traveler + dining, Amex Gold dining/groceries caps in warning zone
    alice_cards = [
        {'program_id': 'chase_ur',     'card_nickname': 'Chase Sapphire Reserve', 'last_four': '4521', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 3, 1),  'user_stale_flag': False},
        {'program_id': 'amex_mr',      'card_nickname': 'Amex Gold Card',          'last_four': '1001', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 2, 1),  'user_stale_flag': False},
        {'program_id': 'cap1_miles',   'card_nickname': 'Venture X',               'last_four': '8877', 'confidence_level': 'medium', 'user_last_verified_at': dt(2025, 12, 1), 'user_stale_flag': True},
        {'program_id': 'citi_cashback','card_nickname': 'Citi Double Cash',        'last_four': '3344', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 1, 1),  'user_stale_flag': False},
    ]
    for cd in alice_cards:
        if not UserCard.query.filter_by(user_id=alice.id, card_nickname=cd['card_nickname']).first():
            db.session.add(UserCard(user_id=alice.id, association_source='user_manual', **cd))
    db.session.commit()

    csr_id  = _get_card_id(alice.id, 'Chase Sapphire Reserve')
    amex_id = _get_card_id(alice.id, 'Amex Gold Card')
    venx_id = _get_card_id(alice.id, 'Venture X')
    dc_id   = _get_card_id(alice.id, 'Citi Double Cash')

    _seed_spend([
        # Chase Sapphire Reserve — travel & dining, no caps
        (csr_id, 'travel',    'monthly', now_month,   1240.0,  3720, 0),
        (csr_id, 'dining',    'monthly', now_month,    580.0,  1740, 0),
        (csr_id, 'travel',    'monthly', prev_month,  2100.0,  6300, 0),
        (csr_id, 'dining',    'monthly', prev_month,   490.0,  1470, 0),
        (csr_id, 'travel',    'annual',  now_annual,  8640.0, 25920, 0),
        (csr_id, 'dining',    'annual',  now_annual,  2880.0,  8640, 0),
        # Amex Gold — dining 89% of $25k annual cap + groceries 81% → warnings
        (amex_id,'dining',    'monthly', now_month,   1800.0,  7200, 0),
        (amex_id,'groceries', 'monthly', now_month,    640.0,  2560, 0),
        (amex_id,'travel',    'monthly', now_month,    320.0,   960, 0),
        (amex_id,'dining',    'monthly', prev_month,  1650.0,  6600, 0),
        (amex_id,'groceries', 'monthly', prev_month,   710.0,  2840, 0),
        (amex_id,'dining',    'annual',  now_annual, 22250.0, 89000, 0),
        (amex_id,'groceries', 'annual',  now_annual, 20250.0, 81000, 0),
        (amex_id,'travel',    'annual',  now_annual,  3840.0, 11520, 0),
        # Venture X — stale card, light spend
        (venx_id,'travel',    'monthly', now_month,    420.0,  4200, 0),
        (venx_id,'hotels',    'monthly', now_month,    190.0,   950, 0),
        (venx_id,'travel',    'annual',  now_annual,  3780.0, 37800, 0),
        (venx_id,'hotels',    'annual',  now_annual,  1710.0,  8550, 0),
        # Citi Double Cash — 2% catch-all, opportunity cost visible
        (dc_id,  'dining',    'monthly', now_month,    230.0,   460, 1280),
        (dc_id,  'groceries', 'monthly', now_month,    180.0,   360,  720),
        (dc_id,  'dining',    'annual',  now_annual,  2760.0,  5520, 5520),
        (dc_id,  'groceries', 'annual',  now_annual,  2160.0,  4320, 4320),
    ])
    _seed_alerts([
        (alice.id, amex_id, 'dining',    'annual', now_annual, 'warning_80', 89.0),
        (alice.id, amex_id, 'groceries', 'annual', now_annual, 'warning_80', 81.0),
    ])

    # ── Bob's cards ──────────────────────────────────────────────────────────
    # Story: dining-obsessed, Amex dining annual at 82% → alert firing,
    #        Chase for travel, uses Amex everywhere for dining
    bob_cards = [
        {'program_id': 'amex_mr',   'card_nickname': 'Amex Gold',                'last_four': '2288', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 3, 1),  'user_stale_flag': False},
        {'program_id': 'chase_ur',  'card_nickname': 'Chase Sapphire Preferred', 'last_four': '5599', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 1, 1),  'user_stale_flag': False},
        {'program_id': 'citi_cashback','card_nickname': 'Citi Strata Premier',   'last_four': '7714', 'confidence_level': 'medium', 'user_last_verified_at': dt(2025, 11, 1), 'user_stale_flag': True},
    ]
    for cd in bob_cards:
        if not UserCard.query.filter_by(user_id=bob.id, card_nickname=cd['card_nickname']).first():
            db.session.add(UserCard(user_id=bob.id, association_source='user_manual', **cd))
    db.session.commit()

    b_amex_id  = _get_card_id(bob.id, 'Amex Gold')
    b_csp_id   = _get_card_id(bob.id, 'Chase Sapphire Preferred')
    b_citi_id  = _get_card_id(bob.id, 'Citi Strata Premier')

    _seed_spend([
        # Bob's Amex Gold — dining heavy, 82% annual cap → warning
        (b_amex_id, 'dining',    'monthly', now_month,   2100.0,  8400, 0),
        (b_amex_id, 'groceries', 'monthly', now_month,    420.0,  1680, 0),
        (b_amex_id, 'travel',    'monthly', now_month,    210.0,   630, 0),
        (b_amex_id, 'dining',    'monthly', prev_month,  1980.0,  7920, 0),
        (b_amex_id, 'groceries', 'monthly', prev_month,   380.0,  1520, 0),
        (b_amex_id, 'dining',    'annual',  now_annual, 20500.0, 82000, 0),  # 82% of $25k
        (b_amex_id, 'groceries', 'annual',  now_annual,  5040.0, 20160, 0),  # 20% of $25k — OK
        (b_amex_id, 'travel',    'annual',  now_annual,  2520.0,  7560, 0),
        # Bob's Chase Sapphire Preferred — travel focus
        (b_csp_id,  'travel',    'monthly', now_month,    980.0,  2940, 0),
        (b_csp_id,  'dining',    'monthly', now_month,    310.0,   930, 0),
        (b_csp_id,  'travel',    'monthly', prev_month,  1140.0,  3420, 0),
        (b_csp_id,  'travel',    'annual',  now_annual,  7840.0, 23520, 0),
        (b_csp_id,  'dining',    'annual',  now_annual,  3720.0, 11160, 0),
        # Bob's stale Citi — minimal use
        (b_citi_id, 'dining',    'monthly', now_month,    140.0,   140, 1260),  # missing pts vs Amex
        (b_citi_id, 'dining',    'annual',  now_annual,  1680.0,  1680, 5040),
    ])
    _seed_alerts([
        (bob.id, b_amex_id, 'dining', 'annual', now_annual, 'warning_80', 82.0),
    ])

    # ── Carol's cards ────────────────────────────────────────────────────────
    # Story: suburban spender, Discover it quarterly grocery cap at 94% (nearly capped),
    #        Savor for dining/entertainment with no caps
    carol_cards = [
        {'program_id': 'cap1_savor',  'card_nickname': 'Capital One Savor',  'last_four': '6612', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 2, 1),  'user_stale_flag': False},
        {'program_id': 'discover_it', 'card_nickname': 'Discover it',         'last_four': '9923', 'confidence_level': 'high',   'user_last_verified_at': dt(2026, 3, 1),  'user_stale_flag': False},
        {'program_id': 'citi_cashback','card_nickname': 'Citi Double Cash',   'last_four': '4481', 'confidence_level': 'medium', 'user_last_verified_at': dt(2025, 10, 1), 'user_stale_flag': True},
    ]
    for cd in carol_cards:
        if not UserCard.query.filter_by(user_id=carol.id, card_nickname=cd['card_nickname']).first():
            db.session.add(UserCard(user_id=carol.id, association_source='user_manual', **cd))
    db.session.commit()

    c_savor_id   = _get_card_id(carol.id, 'Capital One Savor')
    c_disc_id    = _get_card_id(carol.id, 'Discover it')
    c_dc_id      = _get_card_id(carol.id, 'Citi Double Cash')

    _seed_spend([
        # Carol's Savor — dining/entertainment, no caps, solid earner
        (c_savor_id, 'dining',        'monthly', now_month,    720.0,  2880, 0),
        (c_savor_id, 'groceries',     'monthly', now_month,    380.0,  1140, 0),
        (c_savor_id, 'entertainment', 'monthly', now_month,    210.0,   840, 0),
        (c_savor_id, 'dining',        'monthly', prev_month,   680.0,  2720, 0),
        (c_savor_id, 'groceries',     'monthly', prev_month,   410.0,  1230, 0),
        (c_savor_id, 'dining',        'annual',  now_annual,  8640.0, 34560, 0),
        (c_savor_id, 'groceries',     'annual',  now_annual,  4560.0, 13680, 0),
        (c_savor_id, 'entertainment', 'annual',  now_annual,  2520.0, 10080, 0),
        # Carol's Discover it — Q1 grocery 5% cap: $1,413 of $1,500 = 94.2% → warning
        (c_disc_id,  'groceries',     'quarterly', now_q1,    1413.0,  7065, 0),
        (c_disc_id,  'groceries',     'monthly',   now_month,  413.0,  2065, 0),
        (c_disc_id,  'groceries',     'monthly',   prev_month, 500.0,  2500, 0),
        # Carol's stale Citi Double Cash — backup card, rarely used
        (c_dc_id,    'dining',        'monthly', now_month,     90.0,    90,  270),
        (c_dc_id,    'groceries',     'monthly', now_month,    120.0,   120,  480),
        (c_dc_id,    'dining',        'annual',  now_annual,  1080.0,  1080, 3240),
        (c_dc_id,    'groceries',     'annual',  now_annual,  1440.0,  1440, 5760),
    ])
    _seed_alerts([
        (carol.id, c_disc_id, 'groceries', 'quarterly', now_q1, 'warning_80', 94.2),
    ])

    total_cards = len(alice_cards) + len(bob_cards) + len(carol_cards)
    print(f"✓ pointsPal: 6 programs, {len(earn_cats)} earn categories, {total_cards} wallet cards, spend history + alerts for Alice, Bob & Carol")


def main():
    """Load all demo data."""
    print("\n🚀 Loading comprehensive demo data...")
    print("=" * 50)

    app = create_app()
    with app.app_context():
        # Load currencies
        load_currencies()

        # Load users
        users = load_demo_users()

        # Load accounts
        accounts = load_accounts(users)

        # Load categories and rules (using default seed system)
        categories = load_categories_and_rules(users)

        # Load budgets
        budgets = load_budgets(users)

        # Load groups
        groups = load_groups(users)

        # Load expenses
        expenses = load_expenses(users, accounts, categories, groups)

        # Load portfolios and stocks
        portfolios, investments = load_portfolios_and_stocks(users)

        # Load settlements
        settlements = load_settlements(users)

        # Load pointsPal demo data
        load_pointspal_demo(users)

        print("=" * 50)
        print("✅ Demo data loaded successfully!")
        print("\n📊 Summary:")
        print(f"  • {len(users)} users (Alice USD, Bob EUR, Carol USD)")
        print(f"  • {len(accounts)} bank accounts")
        print(f"  • {len(categories)} expense categories")
        print(f"  • {len(budgets)} budgets")
        print(f"  • {len(groups)} groups")
        print(f"  • {len(expenses)} expenses (with splits)")
        print(f"  • {len(portfolios)} portfolios with {len(investments)} stocks")
        print(f"  • {len(settlements)} settlements")
        print("  • pointsPal: 10 cards across Alice, Bob & Carol with spend history + alerts")
        print("\n🔐 Login credentials:")
        print("  • alice@example.com / demo123")
        print("  • bob@example.com / demo123")
        print("  • carol@example.com / demo123")


if __name__ == "__main__":
    main()
