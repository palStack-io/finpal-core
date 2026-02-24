"""
Demo Mode Service
Handles creation and management of demo accounts with mock data
"""

from datetime import datetime, timedelta
from flask import current_app
from src.extensions import db
from src.models.user import User
from src.models.account import Account
from src.models.transaction import Expense
from src.models.budget import Budget
from src.models.category import Category
from src.models.group import Group
from src.models.investment import Portfolio, Investment
from src.data.seed_defaults import seed_user_defaults
from werkzeug.security import generate_password_hash
import logging
import json
import random

logger = logging.getLogger(__name__)

# Demo account definitions
DEMO_ACCOUNTS = [
    {
        'email': 'demo1@finpal.demo',
        'password': 'demo1234',
        'name': 'Alex Demo',
        'currency': 'USD',
        'persona': 'Personal budgeter',
        'description': 'Personal finance enthusiast tracking daily expenses'
    },
    {
        'email': 'demo2@finpal.demo',
        'password': 'demo1234',
        'name': 'Morgan Demo',
        'currency': 'EUR',
        'persona': 'International user',
        'description': 'Frequent traveler with multi-currency expenses'
    },
    {
        'email': 'demo3@finpal.demo',
        'password': 'demo1234',
        'name': 'Jordan Demo',
        'currency': 'USD',
        'persona': 'Group expense tracker',
        'description': 'Manages shared expenses with roommates and friends'
    },
    {
        'email': 'demo4@finpal.demo',
        'password': 'demo1234',
        'name': 'Taylor Demo',
        'currency': 'GBP',
        'persona': 'Investor',
        'description': 'Active investor tracking portfolio and dividends'
    }
]


class DemoService:
    """Service for managing demo mode functionality"""

    @staticmethod
    def is_demo_mode():
        """Check if demo mode is enabled"""
        return current_app.config.get('DEMO_MODE', False)

    @staticmethod
    def get_demo_timeout_minutes():
        """Get demo session timeout in minutes"""
        return current_app.config.get('DEMO_TIMEOUT_MINUTES', 10)

    @staticmethod
    def get_demo_accounts_info():
        """Get list of demo account credentials (for login page)"""
        return [
            {
                'email': acc['email'],
                'password': acc['password'],
                'name': acc['name'],
                'persona': acc['persona'],
                'currency': acc['currency']
            }
            for acc in DEMO_ACCOUNTS
        ]

    @staticmethod
    def is_demo_user(user_id):
        """Check if a user is a demo user"""
        if not user_id:
            return False
        user = User.query.filter_by(id=user_id).first()
        return user.is_demo_user if user else False

    @staticmethod
    def seed_demo_accounts():
        """
        Create all demo accounts if they don't exist
        Called on app startup when DEMO_MODE=true
        """
        if not DemoService.is_demo_mode():
            logger.info("Demo mode is disabled, skipping demo account seeding")
            return {'success': False, 'message': 'Demo mode is disabled'}

        created_count = 0
        existing_count = 0

        for account_data in DEMO_ACCOUNTS:
            email = account_data['email']

            # Check if user already exists
            existing_user = User.query.filter_by(id=email).first()
            if existing_user:
                # Ensure is_demo_user flag is set
                if not existing_user.is_demo_user:
                    existing_user.is_demo_user = True
                    db.session.commit()
                existing_count += 1
                logger.info(f"Demo user {email} already exists")
                continue

            # Create new demo user
            new_user = User(
                id=email,
                name=account_data['name'],
                default_currency_code=account_data['currency'],
                is_demo_user=True,
                has_completed_onboarding=True,
                email_verified=True,
                created_at=datetime.utcnow()
            )
            new_user.set_password(account_data['password'])

            db.session.add(new_user)
            db.session.flush()

            logger.info(f"Created demo user: {email}")

            # Seed all demo data for this user
            DemoService._seed_user_data(new_user, account_data)

            created_count += 1

        # Create demo groups (involves multiple users)
        DemoService._seed_demo_groups()

        try:
            db.session.commit()
            logger.info(f"Demo seeding complete: {created_count} created, {existing_count} existing")
            return {
                'success': True,
                'created': created_count,
                'existing': existing_count,
                'message': f'Demo accounts ready: {created_count} created, {existing_count} already existed'
            }
        except Exception as e:
            db.session.rollback()
            logger.error(f"Failed to seed demo accounts: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def _seed_user_data(user, account_data):
        """Seed complete demo data for a user"""
        email = user.id
        persona = account_data['persona']

        # Seed default categories and rules
        try:
            seed_user_defaults(user.id)
        except Exception as e:
            logger.warning(f"Failed to seed defaults for {email}: {e}")

        # Create bank accounts based on persona
        DemoService._create_demo_accounts(user, account_data)

        # Create transactions
        DemoService._create_demo_transactions(user, account_data)

        # Create budgets
        DemoService._create_demo_budgets(user, account_data)

        # Create investments for investor persona
        if persona == 'Investor':
            DemoService._create_demo_investments(user)

    @staticmethod
    def _create_demo_accounts(user, account_data):
        """Create bank accounts for a demo user"""
        currency = account_data['currency']
        persona = account_data['persona']

        accounts_config = []

        if persona == 'Personal budgeter':
            accounts_config = [
                {'name': 'Primary Checking', 'type': 'checking', 'balance': 5000.00, 'currency': 'USD'},
                {'name': 'Visa Credit Card', 'type': 'credit', 'balance': -800.00, 'currency': 'USD'}
            ]
        elif persona == 'International user':
            accounts_config = [
                {'name': 'Euro Checking', 'type': 'checking', 'balance': 3500.00, 'currency': 'EUR'},
                {'name': 'USD Credit Card', 'type': 'credit', 'balance': -600.00, 'currency': 'USD'}
            ]
        elif persona == 'Group expense tracker':
            accounts_config = [
                {'name': 'Shared Checking', 'type': 'checking', 'balance': 4200.00, 'currency': 'USD'},
                {'name': 'Personal Credit', 'type': 'credit', 'balance': -500.00, 'currency': 'USD'}
            ]
        elif persona == 'Investor':
            accounts_config = [
                {'name': 'Current Account', 'type': 'checking', 'balance': 6000.00, 'currency': 'GBP'},
                {'name': 'Brokerage Account', 'type': 'investment', 'balance': 45000.00, 'currency': 'GBP'}
            ]

        for acc in accounts_config:
            account = Account(
                user_id=user.id,
                name=acc['name'],
                type=acc['type'],
                balance=acc['balance'],
                currency_code=acc['currency']
            )
            db.session.add(account)

        db.session.flush()

    @staticmethod
    def _create_demo_transactions(user, account_data):
        """Create demo transactions for a user over the past 60 days"""
        persona = account_data['persona']

        # Get user's first checking account
        checking = Account.query.filter_by(user_id=user.id, type='checking').first()
        credit = Account.query.filter_by(user_id=user.id, type='credit').first()

        # Get categories
        categories = Category.query.filter_by(user_id=user.id).all()
        category_map = {cat.name.lower(): cat.id for cat in categories}

        # Generate transactions based on persona
        transactions = DemoService._get_transactions_for_persona(persona)

        for txn in transactions:
            # Find category
            category_id = None
            hint = txn.get('category_hint', '').lower()
            for cat_name, cat_id in category_map.items():
                if hint and cat_name in hint:
                    category_id = cat_id
                    break

            # Select account
            account_id = checking.id if checking else None
            if txn.get('use_credit') and credit:
                account_id = credit.id

            expense = Expense(
                user_id=user.id,
                description=txn['description'],
                amount=txn['amount'],
                transaction_type=txn['type'],
                date=datetime.strptime(txn['date'], '%Y-%m-%d'),
                category_id=category_id,
                account_id=account_id,
                currency_code=account_data['currency'],
                card_used='Demo Data',
                split_method='equal',
                paid_by=user.id
            )
            db.session.add(expense)

    @staticmethod
    def _get_transactions_for_persona(persona):
        """Get transaction list based on persona"""
        today = datetime.utcnow()

        if persona == 'Personal budgeter':
            return [
                # Income
                {'description': 'Salary Deposit', 'amount': 4500, 'type': 'income', 'date': (today - timedelta(days=45)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Salary Deposit', 'amount': 4500, 'type': 'income', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                # Groceries
                {'description': 'Whole Foods Market', 'amount': 127.43, 'type': 'expense', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Trader Joes', 'amount': 89.50, 'type': 'expense', 'date': (today - timedelta(days=10)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Costco', 'amount': 215.67, 'type': 'expense', 'date': (today - timedelta(days=20)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Safeway', 'amount': 67.89, 'type': 'expense', 'date': (today - timedelta(days=35)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                # Dining
                {'description': 'Starbucks Coffee', 'amount': 6.75, 'type': 'expense', 'date': (today - timedelta(days=1)).strftime('%Y-%m-%d'), 'category_hint': 'dining', 'use_credit': True},
                {'description': 'Chipotle', 'amount': 14.50, 'type': 'expense', 'date': (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'category_hint': 'dining', 'use_credit': True},
                {'description': 'Pizza Hut', 'amount': 32.99, 'type': 'expense', 'date': (today - timedelta(days=12)).strftime('%Y-%m-%d'), 'category_hint': 'dining', 'use_credit': True},
                {'description': 'Thai Restaurant', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=18)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                # Transportation
                {'description': 'Shell Gas Station', 'amount': 52.00, 'type': 'expense', 'date': (today - timedelta(days=7)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                {'description': 'Uber Ride', 'amount': 18.50, 'type': 'expense', 'date': (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                {'description': 'Car Insurance', 'amount': 145.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                # Entertainment
                {'description': 'Netflix Subscription', 'amount': 15.99, 'type': 'expense', 'date': (today - timedelta(days=2)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment', 'use_credit': True},
                {'description': 'Spotify Premium', 'amount': 10.99, 'type': 'expense', 'date': (today - timedelta(days=8)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment', 'use_credit': True},
                {'description': 'Movie Tickets AMC', 'amount': 28.00, 'type': 'expense', 'date': (today - timedelta(days=22)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                # Shopping
                {'description': 'Amazon Purchase', 'amount': 67.89, 'type': 'expense', 'date': (today - timedelta(days=4)).strftime('%Y-%m-%d'), 'category_hint': 'shopping', 'use_credit': True},
                {'description': 'Target', 'amount': 89.23, 'type': 'expense', 'date': (today - timedelta(days=11)).strftime('%Y-%m-%d'), 'category_hint': 'shopping'},
                {'description': 'Best Buy Electronics', 'amount': 199.99, 'type': 'expense', 'date': (today - timedelta(days=25)).strftime('%Y-%m-%d'), 'category_hint': 'shopping', 'use_credit': True},
                # Utilities
                {'description': 'Electric Bill', 'amount': 134.50, 'type': 'expense', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'Internet - Comcast', 'amount': 79.99, 'type': 'expense', 'date': (today - timedelta(days=16)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'Water Bill', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=17)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                # Housing
                {'description': 'Rent Payment', 'amount': 1800.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Rent Payment', 'amount': 1800.00, 'type': 'expense', 'date': (today.replace(day=1)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                # Healthcare
                {'description': 'CVS Pharmacy', 'amount': 23.45, 'type': 'expense', 'date': (today - timedelta(days=9)).strftime('%Y-%m-%d'), 'category_hint': 'healthcare'},
                {'description': 'Doctor Visit Copay', 'amount': 30.00, 'type': 'expense', 'date': (today - timedelta(days=40)).strftime('%Y-%m-%d'), 'category_hint': 'healthcare'},
                # Fitness
                {'description': 'Gym Membership', 'amount': 49.99, 'type': 'expense', 'date': (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'category_hint': 'fitness'},
            ]

        elif persona == 'International user':
            return [
                # Income
                {'description': 'Salary - EUR', 'amount': 3800, 'type': 'income', 'date': (today - timedelta(days=45)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Salary - EUR', 'amount': 3800, 'type': 'income', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Freelance USD Payment', 'amount': 500, 'type': 'income', 'date': (today - timedelta(days=20)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                # Travel
                {'description': 'British Airways Flight', 'amount': 450.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'travel', 'use_credit': True},
                {'description': 'Hotel Paris - 3 nights', 'amount': 380.00, 'type': 'expense', 'date': (today - timedelta(days=28)).strftime('%Y-%m-%d'), 'category_hint': 'travel', 'use_credit': True},
                {'description': 'Eurostar London-Paris', 'amount': 120.00, 'type': 'expense', 'date': (today - timedelta(days=25)).strftime('%Y-%m-%d'), 'category_hint': 'travel'},
                {'description': 'Airport Taxi', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                # Dining
                {'description': 'Cafe de Flore Paris', 'amount': 35.50, 'type': 'expense', 'date': (today - timedelta(days=27)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Le Comptoir', 'amount': 68.00, 'type': 'expense', 'date': (today - timedelta(days=26)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Local Bistro', 'amount': 22.50, 'type': 'expense', 'date': (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Coffee Shop', 'amount': 4.50, 'type': 'expense', 'date': (today - timedelta(days=2)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                # Groceries
                {'description': 'Carrefour', 'amount': 87.30, 'type': 'expense', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Monoprix', 'amount': 45.60, 'type': 'expense', 'date': (today - timedelta(days=10)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                # Entertainment
                {'description': 'Netflix EU', 'amount': 12.99, 'type': 'expense', 'date': (today - timedelta(days=8)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                {'description': 'Museum Louvre', 'amount': 17.00, 'type': 'expense', 'date': (today - timedelta(days=26)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                # Shopping
                {'description': 'Zara', 'amount': 89.99, 'type': 'expense', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'shopping', 'use_credit': True},
                {'description': 'Amazon DE', 'amount': 34.99, 'type': 'expense', 'date': (today - timedelta(days=7)).strftime('%Y-%m-%d'), 'category_hint': 'shopping', 'use_credit': True},
                # Utilities
                {'description': 'Mobile Phone', 'amount': 35.00, 'type': 'expense', 'date': (today - timedelta(days=12)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'Internet', 'amount': 40.00, 'type': 'expense', 'date': (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                # Housing
                {'description': 'Apartment Rent', 'amount': 1200.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Apartment Rent', 'amount': 1200.00, 'type': 'expense', 'date': (today.replace(day=1)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
            ]

        elif persona == 'Group expense tracker':
            return [
                # Income
                {'description': 'Bi-weekly Paycheck', 'amount': 2800, 'type': 'income', 'date': (today - timedelta(days=45)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Bi-weekly Paycheck', 'amount': 2800, 'type': 'income', 'date': (today - timedelta(days=31)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Bi-weekly Paycheck', 'amount': 2800, 'type': 'income', 'date': (today - timedelta(days=17)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Bi-weekly Paycheck', 'amount': 2800, 'type': 'income', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                # Regular expenses
                {'description': 'Groceries - Shared', 'amount': 156.78, 'type': 'expense', 'date': (today - timedelta(days=2)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Groceries - Shared', 'amount': 134.50, 'type': 'expense', 'date': (today - timedelta(days=9)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Groceries - Personal', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                # Housing
                {'description': 'Rent - My Share', 'amount': 950.00, 'type': 'expense', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Rent - My Share', 'amount': 950.00, 'type': 'expense', 'date': (today.replace(day=1)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                # Utilities - shared
                {'description': 'Electric Bill - Split', 'amount': 85.00, 'type': 'expense', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'Internet - Split', 'amount': 30.00, 'type': 'expense', 'date': (today - timedelta(days=16)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'Gas Bill - Split', 'amount': 25.00, 'type': 'expense', 'date': (today - timedelta(days=18)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                # Entertainment
                {'description': 'Netflix - Shared Account', 'amount': 5.33, 'type': 'expense', 'date': (today - timedelta(days=4)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                {'description': 'Spotify Family - My Share', 'amount': 3.00, 'type': 'expense', 'date': (today - timedelta(days=6)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                {'description': 'Bar Tab - Group Outing', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment', 'use_credit': True},
                # Dining
                {'description': 'Pizza Night - Shared', 'amount': 15.00, 'type': 'expense', 'date': (today - timedelta(days=7)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Thai Takeout - Group', 'amount': 18.50, 'type': 'expense', 'date': (today - timedelta(days=12)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Coffee Shop', 'amount': 5.75, 'type': 'expense', 'date': (today - timedelta(days=1)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                # Transportation
                {'description': 'Gas Station', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=8)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                {'description': 'Uber Pool - Work', 'amount': 12.50, 'type': 'expense', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                # Shopping
                {'description': 'Amazon - Household Items', 'amount': 34.99, 'type': 'expense', 'date': (today - timedelta(days=10)).strftime('%Y-%m-%d'), 'category_hint': 'shopping', 'use_credit': True},
                {'description': 'Target - Cleaning Supplies', 'amount': 28.50, 'type': 'expense', 'date': (today - timedelta(days=20)).strftime('%Y-%m-%d'), 'category_hint': 'shopping'},
            ]

        elif persona == 'Investor':
            return [
                # Income
                {'description': 'Monthly Salary', 'amount': 5500, 'type': 'income', 'date': (today - timedelta(days=45)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Monthly Salary', 'amount': 5500, 'type': 'income', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Dividend - AAPL', 'amount': 125.50, 'type': 'income', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Dividend - MSFT', 'amount': 89.25, 'type': 'income', 'date': (today - timedelta(days=25)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Dividend - VOO', 'amount': 156.00, 'type': 'income', 'date': (today - timedelta(days=20)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                {'description': 'Interest - Savings', 'amount': 45.75, 'type': 'income', 'date': (today - timedelta(days=10)).strftime('%Y-%m-%d'), 'category_hint': 'income'},
                # Investment transfers
                {'description': 'Transfer to Brokerage', 'amount': 1000.00, 'type': 'transfer', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'transfer'},
                {'description': 'Transfer to ISA', 'amount': 500.00, 'type': 'transfer', 'date': (today - timedelta(days=30)).strftime('%Y-%m-%d'), 'category_hint': 'transfer'},
                # Investment expenses
                {'description': 'Trading Commission', 'amount': 4.95, 'type': 'expense', 'date': (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'category_hint': 'investment'},
                {'description': 'Platform Fee', 'amount': 9.99, 'type': 'expense', 'date': (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'category_hint': 'investment'},
                {'description': 'FT Subscription', 'amount': 35.00, 'type': 'expense', 'date': (today - timedelta(days=8)).strftime('%Y-%m-%d'), 'category_hint': 'entertainment'},
                # Regular expenses
                {'description': 'Tesco Groceries', 'amount': 78.50, 'type': 'expense', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'Sainsburys', 'amount': 56.30, 'type': 'expense', 'date': (today - timedelta(days=10)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                {'description': 'M&S Food', 'amount': 34.99, 'type': 'expense', 'date': (today - timedelta(days=17)).strftime('%Y-%m-%d'), 'category_hint': 'groceries'},
                # Housing
                {'description': 'Mortgage Payment', 'amount': 1450.00, 'type': 'expense', 'date': (today - timedelta(days=28)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Mortgage Payment', 'amount': 1450.00, 'type': 'expense', 'date': (today.replace(day=1)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Council Tax', 'amount': 165.00, 'type': 'expense', 'date': (today - timedelta(days=25)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                # Utilities
                {'description': 'British Gas', 'amount': 95.00, 'type': 'expense', 'date': (today - timedelta(days=12)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                {'description': 'BT Internet', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'category_hint': 'utilities'},
                # Dining
                {'description': 'Pret A Manger', 'amount': 8.50, 'type': 'expense', 'date': (today - timedelta(days=2)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                {'description': 'Wagamama', 'amount': 22.00, 'type': 'expense', 'date': (today - timedelta(days=7)).strftime('%Y-%m-%d'), 'category_hint': 'dining'},
                # Transportation
                {'description': 'Oyster Top-up', 'amount': 50.00, 'type': 'expense', 'date': (today - timedelta(days=6)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
                {'description': 'Uber', 'amount': 15.50, 'type': 'expense', 'date': (today - timedelta(days=9)).strftime('%Y-%m-%d'), 'category_hint': 'transportation'},
            ]

        return []

    @staticmethod
    def _create_demo_budgets(user, account_data):
        """Create budgets for a demo user"""
        persona = account_data['persona']

        # Get categories
        categories = Category.query.filter_by(user_id=user.id).all()
        category_map = {cat.name.lower(): cat for cat in categories}

        budgets_config = []

        if persona == 'Personal budgeter':
            budgets_config = [
                {'category_hint': 'food', 'amount': 500, 'period': 'monthly'},
                {'category_hint': 'entertainment', 'amount': 200, 'period': 'monthly'},
                {'category_hint': 'transportation', 'amount': 300, 'period': 'monthly'},
                {'category_hint': 'shopping', 'amount': 400, 'period': 'monthly'},
            ]
        elif persona == 'International user':
            budgets_config = [
                {'category_hint': 'travel', 'amount': 1000, 'period': 'monthly'},
                {'category_hint': 'dining', 'amount': 300, 'period': 'monthly'},
            ]
        elif persona == 'Group expense tracker':
            budgets_config = [
                {'category_hint': 'food', 'amount': 400, 'period': 'monthly'},
                {'category_hint': 'entertainment', 'amount': 150, 'period': 'monthly'},
                {'category_hint': 'utilities', 'amount': 200, 'period': 'monthly'},
            ]
        elif persona == 'Investor':
            budgets_config = [
                {'category_hint': 'investment', 'amount': 1500, 'period': 'monthly'},
                {'category_hint': 'dining', 'amount': 200, 'period': 'monthly'},
                {'category_hint': 'transportation', 'amount': 150, 'period': 'monthly'},
            ]

        for budget_config in budgets_config:
            # Find matching category
            category = None
            hint = budget_config['category_hint'].lower()
            for cat_name, cat in category_map.items():
                if hint in cat_name:
                    category = cat
                    break

            if category:
                budget = Budget(
                    user_id=user.id,
                    category_id=category.id,
                    amount=budget_config['amount'],
                    period=budget_config['period'],
                    include_subcategories=True,
                    active=True,
                    created_at=datetime.utcnow()
                )
                db.session.add(budget)

    @staticmethod
    def _create_demo_investments(user):
        """Create investment portfolios for investor persona"""
        # Retirement Portfolio
        retirement = Portfolio(
            user_id=user.id,
            name='Retirement',
            description='Long-term retirement savings'
        )
        db.session.add(retirement)
        db.session.flush()

        retirement_investments = [
            {'symbol': 'AAPL', 'name': 'Apple Inc.', 'shares': 50, 'purchase_price': 150.00, 'current_price': 178.50, 'purchase_date': '2024-06-15', 'sector': 'Technology'},
            {'symbol': 'GOOGL', 'name': 'Alphabet Inc.', 'shares': 30, 'purchase_price': 135.00, 'current_price': 142.30, 'purchase_date': '2024-07-10', 'sector': 'Technology'},
            {'symbol': 'MSFT', 'name': 'Microsoft Corp.', 'shares': 40, 'purchase_price': 320.00, 'current_price': 385.25, 'purchase_date': '2024-05-20', 'sector': 'Technology'},
            {'symbol': 'VOO', 'name': 'Vanguard S&P 500 ETF', 'shares': 100, 'purchase_price': 380.00, 'current_price': 415.50, 'purchase_date': '2024-04-01', 'sector': 'Index Fund'},
        ]

        for inv in retirement_investments:
            investment = Investment(
                portfolio_id=retirement.id,
                symbol=inv['symbol'],
                name=inv['name'],
                shares=inv['shares'],
                purchase_price=inv['purchase_price'],
                current_price=inv['current_price'],
                purchase_date=datetime.strptime(inv['purchase_date'], '%Y-%m-%d'),
                sector=inv['sector'],
                last_update=datetime.utcnow()
            )
            db.session.add(investment)

        # Trading Portfolio
        trading = Portfolio(
            user_id=user.id,
            name='Trading',
            description='Active trading account'
        )
        db.session.add(trading)
        db.session.flush()

        trading_investments = [
            {'symbol': 'TSLA', 'name': 'Tesla Inc.', 'shares': 20, 'purchase_price': 210.00, 'current_price': 248.80, 'purchase_date': '2024-10-15', 'sector': 'Automotive'},
            {'symbol': 'NVDA', 'name': 'NVIDIA Corp.', 'shares': 15, 'purchase_price': 450.00, 'current_price': 525.75, 'purchase_date': '2024-09-01', 'sector': 'Technology'},
            {'symbol': 'AMD', 'name': 'AMD Inc.', 'shares': 35, 'purchase_price': 120.00, 'current_price': 142.50, 'purchase_date': '2024-11-01', 'sector': 'Technology'},
        ]

        for inv in trading_investments:
            investment = Investment(
                portfolio_id=trading.id,
                symbol=inv['symbol'],
                name=inv['name'],
                shares=inv['shares'],
                purchase_price=inv['purchase_price'],
                current_price=inv['current_price'],
                purchase_date=datetime.strptime(inv['purchase_date'], '%Y-%m-%d'),
                sector=inv['sector'],
                last_update=datetime.utcnow()
            )
            db.session.add(investment)

    @staticmethod
    def _seed_demo_groups():
        """Create demo groups with multiple demo users"""
        # Get demo users
        demo3 = User.query.filter_by(id='demo3@finpal.demo').first()
        demo1 = User.query.filter_by(id='demo1@finpal.demo').first()
        demo2 = User.query.filter_by(id='demo2@finpal.demo').first()
        demo4 = User.query.filter_by(id='demo4@finpal.demo').first()

        if not demo3:
            return

        # Check if groups already exist
        existing_group = Group.query.filter_by(created_by='demo3@finpal.demo').first()
        if existing_group:
            return

        # Create groups for demo3 (Group expense tracker)
        groups_config = [
            {
                'name': 'Apartment Roommates',
                'description': 'Shared apartment expenses',
                'created_by': demo3.id,
                'members': [demo3.id, demo1.id] if demo1 else [demo3.id],
                'default_split_method': 'equal'
            },
            {
                'name': 'Trip to Vegas',
                'description': 'Bachelor party weekend',
                'created_by': demo3.id,
                'members': [demo3.id, demo1.id, demo2.id, demo4.id] if all([demo1, demo2, demo4]) else [demo3.id],
                'default_split_method': 'equal'
            },
            {
                'name': 'Office Lunch Club',
                'description': 'Weekly lunch orders',
                'created_by': demo3.id,
                'members': [demo3.id, demo1.id, demo4.id] if all([demo1, demo4]) else [demo3.id],
                'default_split_method': 'equal'
            }
        ]

        for group_config in groups_config:
            group = Group(
                name=group_config['name'],
                description=group_config['description'],
                created_by=group_config['created_by'],
                default_split_method=group_config['default_split_method'],
                auto_include_all=True
            )
            db.session.add(group)
            db.session.flush()

            # Add members
            for member_id in group_config['members']:
                member = User.query.filter_by(id=member_id).first()
                if member:
                    group.members.append(member)

    @staticmethod
    def reset_demo_user(user_id):
        """
        Reset a demo user's data to fresh state
        Deletes all transactions, budgets, etc. and re-seeds
        """
        user = User.query.filter_by(id=user_id).first()
        if not user or not user.is_demo_user:
            return {'success': False, 'message': 'Not a demo user'}

        try:
            # Delete existing data
            Expense.query.filter_by(user_id=user_id).delete()
            Budget.query.filter_by(user_id=user_id).delete()
            Account.query.filter_by(user_id=user_id).delete()
            Category.query.filter_by(user_id=user_id).delete()
            Portfolio.query.filter_by(user_id=user_id).delete()

            db.session.commit()

            # Find account config for this user
            account_data = None
            for acc in DEMO_ACCOUNTS:
                if acc['email'] == user_id:
                    account_data = acc
                    break

            if account_data:
                DemoService._seed_user_data(user, account_data)
                db.session.commit()

            return {'success': True, 'message': 'Demo user data reset successfully'}
        except Exception as e:
            db.session.rollback()
            logger.error(f"Failed to reset demo user {user_id}: {str(e)}")
            return {'success': False, 'error': str(e)}
