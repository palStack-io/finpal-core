#!/usr/bin/env python3
"""
Add dummy data for testing
Creates test users, transactions, groups, budgets, etc.
"""

import sys
import os
from datetime import datetime, timedelta
import random

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import create_app
from src.extensions import db
from src.models.user import User
from src.models.transaction import Expense
from src.models.category import Category
from src.models.account import Account
from src.models.budget import Budget
from src.models.group import Group
from src.models.recurring import RecurringExpense
from src.models.currency import Currency
from datetime import datetime, timedelta

def create_dummy_data():
    """Create comprehensive dummy data for testing"""

    app = create_app()

    with app.app_context():
        print("Creating dummy data...")

        # Get or create base currency
        usd = Currency.query.filter_by(code='USD').first()
        if not usd:
            usd = Currency(code='USD', name='US Dollar', symbol='$', is_base=True)
            db.session.add(usd)
            db.session.commit()

        # Create test users
        print("Creating test users...")
        test_users = [
            {'email': 'alice@example.com', 'name': 'Alice Smith', 'password': 'password123'},
            {'email': 'bob@example.com', 'name': 'Bob Johnson', 'password': 'password123'},
            {'email': 'charlie@example.com', 'name': 'Charlie Brown', 'password': 'password123'},
        ]

        users = []
        for user_data in test_users:
            user = User.query.filter_by(id=user_data['email']).first()
            if not user:
                user = User(id=user_data['email'], name=user_data['name'])
                user.set_password(user_data['password'])
                user.default_currency_code = 'USD'
                user.has_completed_onboarding = True
                db.session.add(user)
                print(f"  Created user: {user.name} ({user.id})")
            users.append(user)

        db.session.commit()

        # Create categories for each user
        print("Creating categories...")
        category_data = [
            {'name': 'Groceries', 'icon': '🛒'},
            {'name': 'Transportation', 'icon': '🚗'},
            {'name': 'Entertainment', 'icon': '🎬'},
            {'name': 'Utilities', 'icon': '💡'},
            {'name': 'Dining Out', 'icon': '🍽️'},
            {'name': 'Healthcare', 'icon': '🏥'},
            {'name': 'Shopping', 'icon': '🛍️'},
            {'name': 'Income', 'icon': '💰'},
        ]

        categories_by_user = {}
        for user in users:
            user_categories = []
            for cat_data in category_data:
                category = Category.query.filter_by(
                    user_id=user.id,
                    name=cat_data['name']
                ).first()

                if not category:
                    category = Category(
                        user_id=user.id,
                        name=cat_data['name'],
                        icon=cat_data['icon']
                    )
                    db.session.add(category)
                user_categories.append(category)

            categories_by_user[user.id] = user_categories
            print(f"  Created {len(user_categories)} categories for {user.name}")

        db.session.commit()

        # Create accounts for each user
        print("Creating accounts...")
        account_types = ['Checking', 'Savings', 'Credit Card', 'Cash']
        accounts_by_user = {}

        for user in users:
            user_accounts = []
            for i, acc_type in enumerate(account_types):
                account = Account.query.filter_by(
                    user_id=user.id,
                    name=f"{user.name.split()[0]}'s {acc_type}"
                ).first()

                if not account:
                    account = Account(
                        user_id=user.id,
                        name=f"{user.name.split()[0]}'s {acc_type}",
                        type=acc_type.lower().replace(' ', '_'),
                        balance=random.randint(500, 5000),
                        currency_code='USD',
                        status='active'
                    )
                    db.session.add(account)
                user_accounts.append(account)

            accounts_by_user[user.id] = user_accounts
            print(f"  Created {len(user_accounts)} accounts for {user.name}")

        db.session.commit()

        # Create transactions for the past 90 days
        print("Creating transactions...")
        transaction_templates = [
            ('Whole Foods Market', 'Groceries', 45.67, 125.50),
            ('Uber Ride', 'Transportation', 12.50, 35.00),
            ('Netflix Subscription', 'Entertainment', 15.99, 15.99),
            ('Electric Bill', 'Utilities', 80.00, 120.00),
            ('Coffee Shop', 'Dining Out', 5.50, 15.00),
            ('Gas Station', 'Transportation', 40.00, 60.00),
            ('Restaurant', 'Dining Out', 35.00, 85.00),
            ('Amazon Purchase', 'Shopping', 25.00, 150.00),
            ('Pharmacy', 'Healthcare', 15.00, 50.00),
            ('Movie Theater', 'Entertainment', 25.00, 40.00),
            ('Grocery Store', 'Groceries', 55.00, 95.00),
            ('Salary Deposit', 'Income', 3000.00, 5000.00),
        ]

        for user in users:
            user_categories = categories_by_user[user.id]
            user_accounts = accounts_by_user[user.id]

            transaction_count = 0
            for days_ago in range(90):
                date = datetime.now() - timedelta(days=days_ago)

                # Create 1-4 transactions per day
                daily_transactions = random.randint(1, 4)

                for _ in range(daily_transactions):
                    template = random.choice(transaction_templates)
                    desc, cat_name, min_amt, max_amt = template

                    # Find category
                    category = next(
                        (c for c in user_categories if c.name == cat_name),
                        user_categories[0]
                    )

                    # Random account
                    account = random.choice(user_accounts)

                    # Random amount in range
                    amount = round(random.uniform(min_amt, max_amt), 2)

                    # Determine transaction type
                    trans_type = 'income' if cat_name == 'Income' else 'expense'

                    expense = Expense(
                        user_id=user.id,
                        description=desc,
                        amount=amount,
                        date=date,
                        card_used=account.name,
                        split_method='none',
                        paid_by=user.id,
                        category_id=category.id,
                        account_id=account.id,
                        transaction_type=trans_type,
                        currency_code='USD',
                        import_source='manual'
                    )
                    db.session.add(expense)
                    transaction_count += 1

            print(f"  Created {transaction_count} transactions for {user.name}")

        db.session.commit()

        # Create a test group
        print("Creating test group...")
        group = Group.query.filter_by(name='Roommates Expenses').first()
        if not group:
            group = Group(
                name='Roommates Expenses',
                description='Shared apartment expenses',
                created_by=users[0].id,
                default_split_method='equal',
                auto_include_all=True
            )
            db.session.add(group)
            db.session.flush()

            # Add all test users as members
            for user in users:
                group.members.append(user)

            print(f"  Created group: {group.name} with {len(users)} members")

        db.session.commit()

        # Create group expenses
        print("Creating group expenses...")
        group_expense_templates = [
            ('Rent Payment', 1200.00),
            ('Electricity Bill', 85.00),
            ('Internet Bill', 60.00),
            ('Groceries (Shared)', 120.00),
            ('Cleaning Supplies', 35.00),
        ]

        group_transaction_count = 0
        for days_ago in range(0, 60, 15):  # Every 15 days for 60 days
            date = datetime.now() - timedelta(days=days_ago)

            for desc, amount in group_expense_templates:
                # Random payer
                payer = random.choice(users)
                category = random.choice(categories_by_user[payer.id])
                account = random.choice(accounts_by_user[payer.id])

                expense = Expense(
                    user_id=payer.id,
                    description=desc,
                    amount=amount,
                    date=date,
                    card_used=account.name,
                    split_method='equal',
                    paid_by=payer.id,
                    group_id=group.id,
                    split_with=','.join([u.id for u in users if u.id != payer.id]),
                    category_id=category.id,
                    account_id=account.id,
                    transaction_type='expense',
                    currency_code='USD'
                )
                db.session.add(expense)
                group_transaction_count += 1

        print(f"  Created {group_transaction_count} group expenses")
        db.session.commit()

        # Create budgets
        print("Creating budgets...")
        budget_data = [
            ('Groceries', 400.00),
            ('Dining Out', 200.00),
            ('Entertainment', 150.00),
            ('Transportation', 300.00),
        ]

        for user in users:
            user_categories = categories_by_user[user.id]
            budget_count = 0

            for cat_name, amount in budget_data:
                category = next(
                    (c for c in user_categories if c.name == cat_name),
                    None
                )

                if category:
                    budget = Budget.query.filter_by(
                        user_id=user.id,
                        category_id=category.id,
                        period='monthly'
                    ).first()

                    if not budget:
                        budget = Budget(
                            user_id=user.id,
                            name=f"{cat_name} Budget",
                            amount=amount,
                            period='monthly',
                            category_id=category.id,
                            start_date=datetime.now().replace(day=1),
                            active=True
                        )
                        db.session.add(budget)
                        budget_count += 1

            print(f"  Created {budget_count} budgets for {user.name}")

        db.session.commit()

        # Create recurring expenses
        print("Creating recurring expenses...")
        recurring_data = [
            ('Netflix Subscription', 15.99, 'monthly', 'Entertainment'),
            ('Spotify Premium', 9.99, 'monthly', 'Entertainment'),
            ('Gym Membership', 45.00, 'monthly', 'Healthcare'),
            ('Internet Bill', 60.00, 'monthly', 'Utilities'),
        ]

        for user in users:
            user_categories = categories_by_user[user.id]
            user_accounts = accounts_by_user[user.id]
            recurring_count = 0

            for desc, amount, freq, cat_name in recurring_data:
                category = next(
                    (c for c in user_categories if c.name == cat_name),
                    user_categories[0]
                )
                account = random.choice(user_accounts)

                recurring = RecurringExpense.query.filter_by(
                    user_id=user.id,
                    description=desc
                ).first()

                if not recurring:
                    recurring = RecurringExpense(
                        user_id=user.id,
                        description=desc,
                        amount=amount,
                        frequency=freq,
                        start_date=datetime.now().replace(day=1),
                        active=True,
                        card_used=account.name,
                        split_method='none',
                        paid_by=user.id,
                        category_id=category.id,
                        account_id=account.id,
                        currency_code='USD'
                    )
                    db.session.add(recurring)
                    recurring_count += 1

            print(f"  Created {recurring_count} recurring expenses for {user.name}")

        db.session.commit()

        print("\n✅ Dummy data created successfully!")
        print(f"\nTest user credentials:")
        for user_data in test_users:
            print(f"  Email: {user_data['email']}")
            print(f"  Password: {user_data['password']}")
            print()


if __name__ == '__main__':
    create_dummy_data()
