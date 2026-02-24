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


def load_budgets(users):
    """Create sample budgets for users."""
    alice, bob, carol = users

    # Get some categories for budgets
    alice_categories = Category.query.filter_by(user_id=alice.id).all()
    food_cat = next((cat for cat in alice_categories if cat.name == 'Food & Dining'), None)
    transport_cat = next((cat for cat in alice_categories if cat.name == 'Transportation'), None)

    bob_categories = Category.query.filter_by(user_id=bob.id).all()
    bob_food_cat = next((cat for cat in bob_categories if cat.name == 'Food & Dining'), None)

    # Get current month
    now = datetime.now()
    start_of_month = datetime(now.year, now.month, 1)

    # Calculate next month
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1)
    else:
        next_month = datetime(now.year, now.month + 1, 1)

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
        budget = Budget(**budget_data)
        db.session.add(budget)
        budgets.append(budget)

    db.session.commit()
    print(f"✓ Created {len(budgets)} budgets")
    return budgets


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
        print("\n🔐 Login credentials:")
        print("  • alice@example.com / demo123")
        print("  • bob@example.com / demo123")
        print("  • carol@example.com / demo123")


if __name__ == "__main__":
    main()
