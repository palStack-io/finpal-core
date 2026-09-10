"""
Demo Mode Service
Handles creation and management of demo accounts with mock data
"""

from datetime import datetime, timedelta
from decimal import Decimal
from flask import current_app
from src.extensions import db
from src.models.user import User
from src.models.account import Account
from src.models.associations import account_owners
from src.models.transaction import Expense
from src.models.budget import Budget
from src.models.category import Category
from src.models.goal import Goal
from src.models.group import Group
from src.models.investment import Portfolio, Investment
from src.data.seed_defaults import seed_user_defaults
try:
    from src.modules.pointspal.models import (
        PointsProgram, PointsEarnCategory, UserCard,
        SpendPeriodTotal, OptimizerAlert,
    )
    POINTSPAL_AVAILABLE = True
except Exception:
    POINTSPAL_AVAILABLE = False
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

        # Co-ownership needs two users to exist, so it runs here rather than in
        # `_seed_user_data`, for the same reason groups do.
        DemoService._seed_demo_co_owners()

        # *** AND BACKFILL, OR THE FIX ABOVE NEVER REACHES A LIVE DEMO. ***
        #
        # `seed_demo_accounts` does `continue` for a user that already exists, and
        # `_seed_demo_groups` returns early once any group exists. Both are correct —
        # this runs on every boot and must not duplicate. But together they mean the
        # B9 work would have applied to a FRESH install only, and never to the one
        # deployed demo it was written for, which was seeded months ago.
        #
        # A delete-and-reseed would also have worked and is the wrong tool: it
        # destroys live data on a public service to close a gap that is purely
        # additive.
        DemoService._backfill_demo_gaps()

        try:
            db.session.commit()
            logger.info(f"Demo seeding complete: {created_count} created, {existing_count} existing")
            return {
                'success': True,
                'created': created_count,
                'existing': existing_count,
                'message': f'Demo accounts ready: {created_count} created, {existing_count} already existed'
            }
        except Exception:
            db.session.rollback()
            logger.exception('Failed to seed demo accounts')
            return {'success': False, 'error': 'Could not seed the demo accounts'}

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

        # *** THE TOUR LANDS ON demo1, AND demo1 OWNED NO INVESTMENTS. D-77. ***
        #
        # This was `persona == 'Investor'` alone, so all portfolios belonged to
        # demo4 and the Investments page demoed itself EMPTY on the account a
        # visitor actually sees. That is not a cosmetic gap: an empty state and a
        # broken page are indistinguishable to someone who has never seen the
        # working version, and it has hidden three defects that way — most
        # expensively D-107, where a fixture sent keys the API never sends and the
        # page rendered `$NaN` eight times while both gates called it clean.
        #
        # demo4 keeps the richer two-portfolio set; demo1 gets a smaller, plainer
        # one, so the two accounts still demonstrate different things.
        if persona == 'Investor':
            DemoService._create_demo_investments(user)
        elif persona == 'Personal budgeter':
            DemoService._create_starter_portfolio(user)


        # B1/B4. Credit terms first, then goals: a payoff goal is only legible
        # beside a limit, and the Available Credit block needs the limit anyway.
        DemoService._seed_demo_credit_terms(user)
        DemoService._seed_demo_goals(user)

        # Seed pointsPal wallet cards + spend history
        if POINTSPAL_AVAILABLE:
            # SAVEPOINT, not a bare try. pointsPal's tables only exist when the
            # module is enabled, so this step legitimately fails when it is off. On
            # Postgres a failed statement aborts the entire transaction, so catching
            # the error without rolling back left every later insert failing with
            # InFailedSqlTransaction — the final commit then died and the demo user
            # ended up with no accounts, expenses, groups or budgets at all. The
            # savepoint confines the failure to this optional step.
            try:
                with db.session.begin_nested():
                    DemoService._seed_pointspal_data(user, account_data)
            except Exception as e:
                logger.warning(f"pointsPal seeding skipped for {email}: {e}")

    @staticmethod
    def _create_demo_accounts(user, account_data):
        """Create bank accounts for a demo user"""
        currency = account_data['currency']
        persona = account_data['persona']

        accounts_config = []

        if persona == 'Personal budgeter':
            accounts_config = [
                {'name': 'Primary Checking', 'type': 'checking', 'balance': 5000.00, 'currency': 'USD'},
                {'name': 'Visa Credit Card', 'type': 'credit', 'balance': -800.00, 'currency': 'USD'},
                # B12. The tour persona needs a SECOND account on the same side of
                # zero, or a goal spanning several accounts has nowhere to be
                # demonstrated -- and a feature the demo cannot show is one nobody
                # can evaluate (D-77, D-177). Savings rather than a second card
                # because it is the owner's own example: *"emergency fund but
                # multiple accounts for it"*.
                {'name': 'High-Yield Savings', 'type': 'savings', 'balance': 3000.00, 'currency': 'USD'},
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
            # Find category — hint must be a substring of the category name
            category_id = None
            hint = txn.get('category_hint', '').lower()
            for cat_name, cat_id in category_map.items():
                if hint and hint in cat_name:
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
    def _get_transactions_for_persona(persona, today=None):
        """Get transaction list based on persona.

        `today` is injectable so the seed can be checked on **every day of the
        month**. It is not decoration: the rent rows below used to mix a relative
        offset with a date pinned to the 1st, so whether the demo's recurring
        detection worked at all depended on the day it happened to be seeded, and a
        fixture that seeds once cannot see that.
        """
        today = today or datetime.utcnow()

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
                {'description': 'Electric Bill', 'amount': 134.50, 'type': 'expense', 'date': (today - timedelta(days=15)).strftime('%Y-%m-%d'), 'category_hint': 'electricity'},
                {'description': 'Internet - Comcast', 'amount': 79.99, 'type': 'expense', 'date': (today - timedelta(days=16)).strftime('%Y-%m-%d'), 'category_hint': 'internet'},
                {'description': 'Water Bill', 'amount': 45.00, 'type': 'expense', 'date': (today - timedelta(days=17)).strftime('%Y-%m-%d'), 'category_hint': 'water'},
                # Housing
                # Rent is the demo's showcase for recurring DETECTION, so its spacing
                # has to be a real monthly cadence on every seed date. The second row
                # used to be `today.replace(day=1)` -- pinned to the 1st while the
                # first row slid with `today` -- so the gap was `today.day - 1` days
                # off a month. Seeded on the 10th that is 21 days, which falls between
                # determine_frequency()'s biweekly (13-16) and monthly (25-35) bands
                # and returns None, so rent was never detected. Three fixed 30-day
                # offsets: a real cadence, and three occurrences read as higher
                # confidence than two.
                #
                # *** THE OFFSETS MUST ALSO FIT THE DETECTOR'S WINDOW. *** It runs with
                # `lookback_days=60` and `min_occurrences=2`, so a cadence that is
                # perfectly monthly still goes undetected unless at least TWO rows land
                # inside the last 60 days. A first attempt at -90/-60/-30 was a real
                # monthly series and was still invisible, because only one row cleared
                # the boundary. -63/-33/-3 puts two comfortably inside.
                {'description': 'Rent Payment', 'amount': 1800.00, 'type': 'expense', 'date': (today - timedelta(days=63)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Rent Payment', 'amount': 1800.00, 'type': 'expense', 'date': (today - timedelta(days=33)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                {'description': 'Rent Payment', 'amount': 1800.00, 'type': 'expense', 'date': (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'category_hint': 'housing'},
                # Healthcare
                # *** THE DEMO MUST DEMONSTRATE Unsorted, NOT JUST HAVE IT. ***
                # D-177: a feature shipping while the demo seed does not know is
                # a defect, and the demo is where the budget page gets looked at.
                # A bank fee is deliberately unclassified in the default map --
                # a monthly account charge is committed and a one-off penalty is
                # not, and finPal has no way to tell which this is. So it lands
                # in Unsorted, beside the health rows, and the section shows two
                # different REASONS a category can be unsorted rather than one.
                {'description': 'Monthly Account Fee', 'amount': 12.00, 'type': 'expense', 'date': (today - timedelta(days=6)).strftime('%Y-%m-%d'), 'category_hint': 'bank fees'},
                {'description': 'CVS Pharmacy', 'amount': 23.45, 'type': 'expense', 'date': (today - timedelta(days=9)).strftime('%Y-%m-%d'), 'category_hint': 'pharmacy'},
                {'description': 'Doctor Visit Copay', 'amount': 30.00, 'type': 'expense', 'date': (today - timedelta(days=40)).strftime('%Y-%m-%d'), 'category_hint': 'doctor visits'},
                # Fitness
                # A subscription is the other thing recurring detection is FOR, and a
                # single row cannot demonstrate it -- with only one occurrence there is
                # no interval to measure. Three monthly charges give the demo a second
                # detected pattern beside rent.
                {'description': 'Gym Membership', 'amount': 49.99, 'type': 'expense', 'date': (today - timedelta(days=65)).strftime('%Y-%m-%d'), 'category_hint': 'fitness'},
                {'description': 'Gym Membership', 'amount': 49.99, 'type': 'expense', 'date': (today - timedelta(days=35)).strftime('%Y-%m-%d'), 'category_hint': 'fitness'},
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
    def _seed_pointspal_data(user, account_data):
        """Seed pointsPal programs, wallet cards, spend history and alerts for a demo user."""
        persona = account_data['persona']

        # ── Compute period keys dynamically ─────────────────────────────────
        now = datetime.utcnow()
        now_month  = now.strftime('%Y-%m')
        now_annual = str(now.year)
        prev = (now.replace(day=1) - timedelta(days=1))
        prev_month = prev.strftime('%Y-%m')
        q = (now.month - 1) // 3 + 1
        now_q = f"{now.year}-Q{q}"

        # ── Ensure shared programs exist (idempotent) ────────────────────────
        programs = [
            {'program_id': 'chase_ur',    'issuer': 'Chase',            'program_name': 'Ultimate Rewards',       'base_cpp': 2.0, 'currency_name': 'Ultimate Rewards Points'},
            {'program_id': 'amex_mr',     'issuer': 'American Express', 'program_name': 'Membership Rewards',     'base_cpp': 2.0, 'currency_name': 'Membership Rewards Points'},
            {'program_id': 'cap1_miles',  'issuer': 'Capital One',      'program_name': 'Miles',                  'base_cpp': 1.0, 'currency_name': 'Miles'},
            {'program_id': 'citi_cashback','issuer': 'Citi',            'program_name': 'Cash Back',              'base_cpp': 1.0, 'currency_name': 'Cash Back'},
            {'program_id': 'cap1_savor',  'issuer': 'Capital One',      'program_name': 'Savor Rewards',          'base_cpp': 1.0, 'currency_name': 'Cash Back'},
            {'program_id': 'discover_it', 'issuer': 'Discover',         'program_name': 'Discover it Cash Back',  'base_cpp': 1.0, 'currency_name': 'Cash Back'},
        ]
        for p in programs:
            if not PointsProgram.query.filter_by(program_id=p['program_id']).first():
                db.session.add(PointsProgram(**p))
        db.session.flush()

        earn_cats = [
            {'program_id': 'chase_ur',    'category': 'travel',         'multiplier': 3.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'chase_ur',    'category': 'dining',         'multiplier': 3.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'amex_mr',     'category': 'dining',         'multiplier': 4.0,  'cap_amount': 25000,'cap_period': 'annual'},
            {'program_id': 'amex_mr',     'category': 'groceries',      'multiplier': 4.0,  'cap_amount': 25000,'cap_period': 'annual'},
            {'program_id': 'amex_mr',     'category': 'travel',         'multiplier': 3.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'cap1_miles',  'category': 'travel',         'multiplier': 10.0, 'cap_amount': None, 'cap_period': None},
            {'program_id': 'cap1_miles',  'category': 'hotels',         'multiplier': 5.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'cap1_savor',  'category': 'dining',         'multiplier': 4.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'cap1_savor',  'category': 'groceries',      'multiplier': 3.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'cap1_savor',  'category': 'entertainment',  'multiplier': 4.0,  'cap_amount': None, 'cap_period': None},
            {'program_id': 'discover_it', 'category': 'groceries',      'multiplier': 5.0,  'cap_amount': 1500, 'cap_period': 'quarterly'},
        ]
        for ec in earn_cats:
            if not PointsEarnCategory.query.filter_by(program_id=ec['program_id'], category=ec['category']).first():
                db.session.add(PointsEarnCategory(**ec))
        db.session.flush()

        # ── Per-persona card + spend config ─────────────────────────────────
        if persona == 'Personal budgeter':
            # Alex: Chase Sapphire Preferred + Citi Double Cash
            # Story: moderate spender, dining 3x on track, no caps
            cards = [
                {'program_id': 'chase_ur',     'card_nickname': 'Chase Sapphire Preferred', 'last_four': '1142', 'confidence_level': 'high',   'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
                {'program_id': 'citi_cashback','card_nickname': 'Citi Double Cash',          'last_four': '8820', 'confidence_level': 'medium', 'user_last_verified_at': datetime(now.year - 1, 11, 1),    'user_stale_flag': True},
            ]
            for cd in cards:
                if not UserCard.query.filter_by(user_id=user.id, card_nickname=cd['card_nickname']).first():
                    db.session.add(UserCard(user_id=user.id, association_source='user_manual', **cd))
            db.session.flush()

            def cid(nick): return (UserCard.query.filter_by(user_id=user.id, card_nickname=nick).first() or type('', (), {'id': None})()).id
            sp_id = cid('Chase Sapphire Preferred')
            dc_id = cid('Citi Double Cash')

            spend_rows = [
                (sp_id, 'dining',    'monthly', now_month,   480.0, 1440, 0),
                (sp_id, 'travel',    'monthly', now_month,   620.0, 1860, 0),
                (sp_id, 'dining',    'monthly', prev_month,  510.0, 1530, 0),
                (sp_id, 'travel',    'monthly', prev_month,  390.0, 1170, 0),
                (sp_id, 'dining',    'annual',  now_annual, 5760.0,17280, 0),
                (sp_id, 'travel',    'annual',  now_annual, 7440.0,22320, 0),
                (dc_id, 'dining',    'monthly', now_month,   210.0,  210,  840),
                (dc_id, 'groceries', 'monthly', now_month,   340.0,  340,  680),
                (dc_id, 'dining',    'annual',  now_annual, 2520.0, 2520, 5040),
                (dc_id, 'groceries', 'annual',  now_annual, 4080.0, 4080, 4080),
            ]
            alerts = []

        elif persona == 'International user':
            # Morgan: Amex Gold + Chase Sapphire Reserve
            # Story: Amex dining annual at 58% — healthy, no alerts
            cards = [
                {'program_id': 'amex_mr',  'card_nickname': 'Amex Gold',             'last_four': '3317', 'confidence_level': 'high', 'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
                {'program_id': 'chase_ur', 'card_nickname': 'Chase Sapphire Reserve','last_four': '7756', 'confidence_level': 'high', 'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
            ]
            for cd in cards:
                if not UserCard.query.filter_by(user_id=user.id, card_nickname=cd['card_nickname']).first():
                    db.session.add(UserCard(user_id=user.id, association_source='user_manual', **cd))
            db.session.flush()

            def cid(nick): return (UserCard.query.filter_by(user_id=user.id, card_nickname=nick).first() or type('', (), {'id': None})()).id
            am_id  = cid('Amex Gold')
            csr_id = cid('Chase Sapphire Reserve')

            spend_rows = [
                (am_id,  'dining',    'monthly', now_month,  1100.0, 4400, 0),
                (am_id,  'groceries', 'monthly', now_month,   290.0, 1160, 0),
                (am_id,  'travel',    'monthly', now_month,   880.0, 2640, 0),
                (am_id,  'dining',    'monthly', prev_month,  980.0, 3920, 0),
                (am_id,  'dining',    'annual',  now_annual,14500.0,58000, 0),  # 58% of $25k — on track
                (am_id,  'groceries', 'annual',  now_annual, 3480.0,13920, 0),
                (am_id,  'travel',    'annual',  now_annual,10560.0,31680, 0),
                (csr_id, 'travel',    'monthly', now_month,  1650.0, 4950, 0),
                (csr_id, 'dining',    'monthly', now_month,   320.0,  960, 0),
                (csr_id, 'travel',    'monthly', prev_month, 2200.0, 6600, 0),
                (csr_id, 'travel',    'annual',  now_annual,19800.0,59400, 0),
                (csr_id, 'dining',    'annual',  now_annual, 3840.0,11520, 0),
            ]
            alerts = []

        elif persona == 'Group expense tracker':
            # Jordan: Capital One Savor + Discover it
            # Story: Discover grocery quarterly cap at 94% → warning alert
            cards = [
                {'program_id': 'cap1_savor',  'card_nickname': 'Capital One Savor', 'last_four': '4490', 'confidence_level': 'high', 'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
                {'program_id': 'discover_it', 'card_nickname': 'Discover it',        'last_four': '6671', 'confidence_level': 'high', 'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
            ]
            for cd in cards:
                if not UserCard.query.filter_by(user_id=user.id, card_nickname=cd['card_nickname']).first():
                    db.session.add(UserCard(user_id=user.id, association_source='user_manual', **cd))
            db.session.flush()

            def cid(nick): return (UserCard.query.filter_by(user_id=user.id, card_nickname=nick).first() or type('', (), {'id': None})()).id
            sv_id   = cid('Capital One Savor')
            disc_id = cid('Discover it')

            spend_rows = [
                (sv_id,   'dining',        'monthly', now_month,    690.0, 2760, 0),
                (sv_id,   'groceries',     'monthly', now_month,    310.0,  930, 0),
                (sv_id,   'entertainment', 'monthly', now_month,    175.0,  700, 0),
                (sv_id,   'dining',        'monthly', prev_month,   720.0, 2880, 0),
                (sv_id,   'dining',        'annual',  now_annual,  8280.0,33120, 0),
                (sv_id,   'groceries',     'annual',  now_annual,  3720.0,11160, 0),
                (sv_id,   'entertainment', 'annual',  now_annual,  2100.0, 8400, 0),
                (disc_id, 'groceries',     'quarterly', now_q,     1410.0, 7050, 0),  # 94% of $1,500 cap
                (disc_id, 'groceries',     'monthly', now_month,    410.0, 2050, 0),
                (disc_id, 'groceries',     'monthly', prev_month,   500.0, 2500, 0),
            ]
            alerts = [(user.id, disc_id, 'groceries', 'quarterly', now_q, 'warning_80', 94.0)]

        elif persona == 'Investor':
            # Taylor: Amex Gold (dining, 71% annual cap) + Venture X (heavy travel)
            # Story: frequent business travel + restaurant dining, Amex at 71% → approaching warning
            cards = [
                {'program_id': 'amex_mr',    'card_nickname': 'Amex Gold',  'last_four': '9934', 'confidence_level': 'high',   'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
                {'program_id': 'cap1_miles', 'card_nickname': 'Venture X',  'last_four': '2281', 'confidence_level': 'high',   'user_last_verified_at': datetime(now.year, now.month, 1), 'user_stale_flag': False},
                {'program_id': 'chase_ur',   'card_nickname': 'CSR',        'last_four': '5503', 'confidence_level': 'medium', 'user_last_verified_at': datetime(now.year - 1, 9, 1),     'user_stale_flag': True},
            ]
            for cd in cards:
                if not UserCard.query.filter_by(user_id=user.id, card_nickname=cd['card_nickname']).first():
                    db.session.add(UserCard(user_id=user.id, association_source='user_manual', **cd))
            db.session.flush()

            def cid(nick): return (UserCard.query.filter_by(user_id=user.id, card_nickname=nick).first() or type('', (), {'id': None})()).id
            am_id   = cid('Amex Gold')
            venx_id = cid('Venture X')
            csr_id  = cid('CSR')

            spend_rows = [
                (am_id,   'dining',    'monthly', now_month,  1950.0,  7800, 0),
                (am_id,   'groceries', 'monthly', now_month,   280.0,  1120, 0),
                (am_id,   'travel',    'monthly', now_month,   540.0,  1620, 0),
                (am_id,   'dining',    'monthly', prev_month, 1820.0,  7280, 0),
                (am_id,   'dining',    'annual',  now_annual,17750.0, 71000, 0),  # 71% of $25k
                (am_id,   'groceries', 'annual',  now_annual, 3360.0, 13440, 0),
                (am_id,   'travel',    'annual',  now_annual, 6480.0, 19440, 0),
                (venx_id, 'travel',    'monthly', now_month,  2400.0, 24000, 0),
                (venx_id, 'hotels',    'monthly', now_month,   680.0,  3400, 0),
                (venx_id, 'travel',    'monthly', prev_month, 2850.0, 28500, 0),
                (venx_id, 'hotels',    'monthly', prev_month,  490.0,  2450, 0),
                (venx_id, 'travel',    'annual',  now_annual,28800.0,288000, 0),
                (venx_id, 'hotels',    'annual',  now_annual, 6120.0, 30600, 0),
                (csr_id,  'dining',    'monthly', now_month,   180.0,   180,  540),
                (csr_id,  'dining',    'annual',  now_annual, 2160.0,  2160, 5400),
            ]
            alerts = []
        else:
            return

        # ── Persist spend rows ───────────────────────────────────────────────
        for card_id_val, category, period_type, period_key, spent, pts_earned, pts_missed in spend_rows:
            if not card_id_val:
                continue
            if not SpendPeriodTotal.query.filter_by(
                user_card_id=card_id_val, category=category,
                period_type=period_type, period_key=period_key,
            ).first():
                db.session.add(SpendPeriodTotal(
                    user_card_id=card_id_val, category=category,
                    period_type=period_type, period_key=period_key,
                    total_spent=spent,
                    total_pts_earned=float(pts_earned),
                    total_pts_missed=float(pts_missed),
                ))

        # ── Persist alerts ───────────────────────────────────────────────────
        for u_id, card_id_val, category, period_type, period_key, alert_type, pct in alerts:
            if not card_id_val:
                continue
            if not OptimizerAlert.query.filter_by(
                user_card_id=card_id_val, category=category,
                period_type=period_type, period_key=period_key, alert_type=alert_type,
            ).first():
                db.session.add(OptimizerAlert(
                    user_id=u_id, user_card_id=card_id_val,
                    category=category, period_type=period_type,
                    period_key=period_key, alert_type=alert_type,
                    pct_used=pct, dismissed=False,
                ))

        db.session.flush()
        logger.info(f"pointsPal seeded for {user.id} ({persona})")

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
            members = []
            for member_id in group_config['members']:
                member = User.query.filter_by(id=member_id).first()
                if member:
                    group.members.append(member)
                    members.append(member)

            # *** ALL THREE GROUPS HELD ZERO EXPENSES. D-77. ***
            # Members and no money, so every split-expense surface — the group
            # detail page, the IOU tracker, "who owes whom" — demoed itself empty.
            # Measured on the live demo before this: 3 groups, 0 expenses between
            # them.
            DemoService._seed_group_expenses(group, members)

    @staticmethod
    def _backfill_demo_gaps():
        """Add what an already-seeded demo is missing. Idempotent and additive.

        *** THIS IS THE HALF THAT MAKES B9 REACH PRODUCTION. *** The seeder skips
        users it has already created, so a fix to what it creates is invisible on
        any instance seeded before the fix — which is every instance that matters.

        Keyed to the GAP rather than to a version marker: "this user has no
        portfolio" is checkable and self-correcting, whereas a flag saying "B9 has
        run" is a second source of truth that goes stale the moment somebody edits
        the seed by hand.

        The two `continue`s are the idempotence, and this runs on EVERY boot — drop
        either one and the demo grows a portfolio and nine group expenses every time
        the container restarts.
        """
        for account_data in DEMO_ACCOUNTS:
            if account_data.get('persona') != 'Personal budgeter':
                continue
            user = User.query.filter_by(id=account_data['email']).first()
            if not user:
                continue
            if Portfolio.query.filter_by(user_id=user.id).first():
                continue
            logger.info('Backfilling a starter portfolio for %s (D-77)', user.id)
            DemoService._create_starter_portfolio(user)

        # B1/B4/B3. Same shape and the same reason: goals, co-owners and credit
        # terms all arrived AFTER the deployed demo was seeded, so the seeding
        # above reaches a fresh install only. Each check is keyed to the gap.
        for account_data in DEMO_ACCOUNTS:
            user = User.query.filter_by(id=account_data['email']).first()
            if not user:
                continue
            DemoService._seed_demo_credit_terms(user)
            if not Goal.query.filter_by(user_id=user.id).first():
                logger.info('Backfilling demo goals for %s', user.id)
                DemoService._seed_demo_goals(user)
        DemoService._backfill_non_tour_household_goals()
        DemoService._backfill_multi_account_demo_goal()
        DemoService._seed_demo_co_owners()

        for group in Group.query.all():
            if Expense.query.filter_by(group_id=group.id).first():
                continue
            members = list(group.members)
            if not members:
                continue
            logger.info('Backfilling expenses for demo group %r (D-77)', group.name)
            DemoService._seed_group_expenses(group, members)

    @staticmethod
    def _backfill_non_tour_household_goals():
        """Demote a household goal owned by anyone but the tour persona.

        *** THIS IS THE THIRD TIME IN ONE DAY THAT A SEED FIX REACHED NO LIVE
        DEMO, AND THE REASON IS ALWAYS THE SAME. *** Making `_seed_demo_goals`
        give only demo1 the household goal fixed FRESH installs. The deployed
        demo already had goals for all four personas, so the gap check above
        (`if not Goal.query...`) correctly skipped every one of them and the
        change landed nowhere. `goals 15 -> 15`, four rows still reading
        "Emergency fund" on the page a visitor lands on.

        A household goal is visible to everyone on the same side of the demo
        boundary, and all four demo users are — so four personas each owning one
        put FOUR identically-named rows on demo1's Goals page. Correct by the
        model, and indistinguishable from a duplication bug to anybody looking at
        it, which is the same "looks broken" failure D-77 is about.

        Keyed to the CONDITION rather than to a version marker, like every other
        backfill here: "a non-tour persona owns a household goal" is checkable and
        self-correcting. Converts rather than deletes — the goal, its snapshot and
        its progress are all still true, and only the scope and the name were
        wrong. Deleting live rows to fix a labelling problem is the wrong tool.
        """
        stale = Goal.query.filter(
            Goal.scope == 'household',
            Goal.user_id != 'demo1@finpal.demo',
            Goal.user_id.in_([a['email'] for a in DEMO_ACCOUNTS]),
        ).all()
        for goal in stale:
            owner = User.query.filter_by(id=goal.user_id).first()
            first_name = (owner.name or goal.user_id).split()[0].split('@')[0]
            goal.scope = 'personal'
            goal.name = f'{first_name}’s savings target'
            logger.info('Demoted a duplicate household demo goal owned by %s',
                        goal.user_id)

    @staticmethod
    def _backfill_multi_account_demo_goal():
        """Give the DEPLOYED demo the second account its Emergency fund needs (B12).

        *** A SEED CHANGE IS NOT SHIPPED UNTIL A CONDITION-KEYED CORRECTION
        EXISTS FOR THE ROWS THE OLD VERSION WROTE. THIS HAS NOW GONE WRONG THREE
        TIMES IN ONE DAY (D-177, D-178). *** `_create_demo_accounts` and
        `_seed_demo_goals` both skip a persona that already has rows, so adding
        `High-Yield Savings` to the config and a second link to the goal fixes a
        FRESH install and reaches the live demo nowhere at all. The multi-account
        feature would then ship to a demo that cannot show it, which is the exact
        failure D-177 records.

        Two conditions, each checkable and self-correcting, neither a version
        marker: *the tour persona has no savings account*, and *its Emergency
        fund reads fewer than two accounts*.

        *** THE TARGET MOVES, AND THAT IS ALLOWED HERE FOR A REASON THAT DOES NOT
        GENERALISE. *** Adding an account extends the denominator honestly, so
        leaving the old $10,000 target would jump the bar from 37.5% to 70.6% --
        true, and a worse demo. These are FIXTURE rows in a public sandbox, not a
        user's goal being restated behind their back; the API still refuses to
        move a real user's `start_amount`, and nothing here goes through it.
        """
        from src.models.goal_account import GoalAccount
        from src.services.goal.service import GoalService

        user = User.query.filter_by(id='demo1@finpal.demo').first()
        if user is None:
            return

        savings = Account.query.filter_by(user_id=user.id,
                                          type='savings').first()
        if savings is None:
            savings = Account(user_id=user.id, name='High-Yield Savings',
                              type='savings', balance=3000.00,
                              currency_code='USD')
            db.session.add(savings)
            db.session.flush()
            logger.info('Backfilled a savings account for the demo tour persona '
                        'so a multi-account goal has somewhere to live (B12)')

        goal = Goal.query.filter_by(user_id=user.id,
                                    name='Emergency fund').first()
        if goal is None or len(goal.links) >= 2:
            return
        if any(link.account_id == savings.id for link in goal.links):
            return

        pots = [link.account for link in goal.links] + [savings]
        goal.links.append(GoalAccount(
            account_id=savings.id,
            # 0.4x the balance, matching how every other demo snapshot is built:
            # a plausible figure from four months ago, not today's balance, so the
            # bar shows a legible fraction exactly as a real snapshot would.
            start_amount=(Decimal(savings.balance or 0)
                          * Decimal('0.4')).quantize(Decimal('1')),
            added_at=datetime.utcnow()))
        goal.target_amount = (sum(Decimal(p.balance or 0) for p in pots)
                              * 2).quantize(Decimal('1'))
        GoalService().sync_links(goal)
        logger.info('Backfilled the demo Emergency fund to span %d accounts (B12)',
                    len(goal.links))

    @staticmethod
    def _create_starter_portfolio(user):
        """One small portfolio for the persona the demo tour lands on. D-77.

        Deliberately smaller than the Investor's two portfolios: demo1 should show
        that the Investments page WORKS, not compete with the account whose whole
        point is investing.
        """
        portfolio = Portfolio(
            user_id=user.id,
            name='Starter Portfolio',
            description='A first index fund and a little cash',
        )
        db.session.add(portfolio)
        db.session.flush()

        for symbol, name, shares, purchase, current in (
            ('VTI', 'Vanguard Total Stock Market ETF', 12, 218.40, 241.10),
            ('VXUS', 'Vanguard Total International Stock ETF', 20, 58.10, 61.75),
        ):
            db.session.add(Investment(
                portfolio_id=portfolio.id,
                symbol=symbol,
                name=name,
                shares=shares,
                purchase_price=purchase,
                current_price=current,
                purchase_date=datetime.utcnow() - timedelta(days=240),
            ))

    @staticmethod
    def _seed_demo_credit_terms(user):
        """B1's three columns, on every demo credit card. Idempotent.

        Without them the "Available Credit" block on the Accounts page never
        renders — it is gated on `creditLimit` — so the demo shows a credit card
        with no limit and no utilisation, which is the state D-77 is about: an
        empty surface is indistinguishable from a broken one.

        *** THE LIMIT IS ALWAYS COMFORTABLY ABOVE THE DEBT. *** A limit below the
        balance renders a negative available credit, which reads as a defect rather
        than as a maxed-out card, and a demo that looks broken is worse than one
        that is empty.

        Keyed to the gap (`credit_limit is None`), never to a version flag, so a
        card somebody edits by hand is left alone and a reboot changes nothing.
        """
        for card in Account.query.filter_by(user_id=user.id, type='credit').all():
            if card.credit_limit is not None:
                continue
            owed = abs(card.balance or 0)
            # A round limit near 4x the debt: enough headroom to read as healthy,
            # tight enough that the utilisation figure is not trivially zero.
            limit = max(Decimal('1000'), (Decimal(owed) * 4).quantize(Decimal('1000')))
            card.credit_limit = limit
            # Numeric(5,2), and a realistic US card rate. Not a round 20: a figure
            # with cents is the one that would expose a float column (D-58), and
            # this is the value a screenshot of the demo will show.
            card.apr = Decimal('19.99')
            card.min_payment = Decimal('35.00')
            logger.info('Demo credit terms set on %s (limit %s)', card.name, limit)

    @staticmethod
    def _seed_demo_goals(user):
        """Goals for a demo user, in every shape the page can render.

        *** THE TOUR LANDS ON demo1, SO demo1 GETS THE FULL SET. *** D-77's lesson,
        applied to the feature that just shipped: a Goals page that demos itself
        empty teaches a visitor nothing and hides any defect in it.

        Every state the page has a branch for is represented — linked and manual,
        payoff and savings, personal and household, in-progress and achieved —
        because a state with no fixture is a state nothing exercises.

        *** AND EVERY IN-PROGRESS GOAL SITS BETWEEN 5% AND 95%. *** A bar that
        renders empty for every goal demonstrates nothing and cannot be told apart
        from a figure that never arrived; one that renders full hides the
        arithmetic. `start_amount` is chosen to put the CURRENT balance at a
        legible fraction, exactly as a real snapshot would have.

        No two active linked goals share an (account, direction) pair, because the
        product enforces that with a partial unique index — a seed that needs the
        constraint absent is a fixture describing a product that does not exist,
        and on Postgres the IntegrityError would abort the whole boot transaction.
        """
        if Goal.query.filter_by(user_id=user.id).first():
            return

        checking = Account.query.filter_by(user_id=user.id, type='checking').first()
        credit = Account.query.filter_by(user_id=user.id, type='credit').first()
        currency = user.default_currency_code or 'USD'
        today = datetime.utcnow().date()

        planned = []

        # *** ONLY THE TOUR PERSONA GETS THE FULL SET, AND THE E2E SUITE IS WHAT
        # FORCED THAT. *** Giving every persona the same four goals put FOUR goals
        # named "Emergency fund" on demo1's page, because a household goal is
        # visible to everyone on the same side of the demo boundary and all four
        # demo users are. Correct by the model and unreadable on screen: a visitor
        # sees four identical rows and reads it as a duplication bug, which is the
        # same "looks broken" failure D-77 is about, arriving from the opposite
        # direction. Same reason `_create_starter_portfolio` is persona-gated.
        is_tour_persona = user.id == 'demo1@finpal.demo'

        if not is_tour_persona:
            # One personal goal, distinctly named, so the other accounts are not
            # empty and nothing they own shows up on demo1's page.
            if checking is not None:
                balance = Decimal(checking.balance or 0)
                planned.append(dict(
                    name=f'{user.name.split()[0]}’s savings target', kind='savings',
                    scope='personal',
                    links=[(checking,
                            (balance * Decimal('0.5')).quantize(Decimal('1')))],
                    target_amount=(balance * 2).quantize(Decimal('1')),
                ))
            DemoService._add_planned_goals(user, planned, currency, today)
            return

        if credit is not None:
            # A payoff goal: card debt is a NEGATIVE balance, so this runs from the
            # snapshot UP toward zero and `direction` reads `paydown`.
            # (-800 - -1200) / (0 - -1200) = 33%.
            planned.append(dict(
                name=f'Pay off the {credit.name}', kind='payoff', scope='personal',
                links=[(credit,
                        Decimal(abs(credit.balance or 0)) * -2 - Decimal('50'))],
                target_amount=Decimal('0.00'),
            ))

        if checking is not None:
            # Household, and on the account that is co-owned below — so this is the
            # joint goal, and its contribution breakdown has two payers.
            #
            # *** AND IT IS THE B12 CASE: TWO ACCOUNTS, ONE PERCENTAGE. *** With
            # the savings account it runs (8000 - 3200) / (16000 - 3200) = 37.5%,
            # which is deliberately the SAME legible fraction the single-account
            # version showed. A demo whose only multi-account goal also changed
            # its number would make the two changes indistinguishable to anyone
            # comparing screenshots.
            #
            # Both accounts are on the same side of zero, which is not a
            # coincidence to be relied on: the API refuses a mixed set, and a seed
            # that writes a row the API would refuse is a fixture describing a
            # product that does not exist (D-107's shape).
            savings = Account.query.filter_by(user_id=user.id,
                                              type='savings').first()
            pots = [checking] + ([savings] if savings is not None else [])
            planned.append(dict(
                name='Emergency fund', kind='savings', scope='household',
                links=[(pot, (Decimal(pot.balance or 0)
                              * Decimal('0.4')).quantize(Decimal('1')))
                       for pot in pots],
                target_amount=(sum(Decimal(pot.balance or 0) for pot in pots)
                               * 2).quantize(Decimal('1')),
            ))

        # Manual, in progress. Deliberately unlinked: the page says "Tracked by
        # hand" for these and offers no contribution breakdown, and that branch
        # needs a case too.
        planned.append(dict(
            name='New laptop', kind='savings', scope='personal', links=[],
            start_amount=Decimal('0.00'), target_amount=Decimal('2000.00'),
            current_manual=Decimal('650.00'),
        ))

        # Achieved, so the badge and a full bar have a case. Stamped here rather
        # than left for `stamp_if_achieved` to do on first read, so the demo looks
        # the same to the first visitor as to the hundredth.
        planned.append(dict(
            name='Holiday fund', kind='savings', scope='personal', links=[],
            start_amount=Decimal('0.00'), target_amount=Decimal('500.00'),
            current_manual=Decimal('500.00'), status='achieved',
        ))

        DemoService._add_planned_goals(user, planned, currency, today)
        logger.info('Seeded %d demo goals for %s', len(planned), user.id)

    @staticmethod
    def _add_planned_goals(user, planned, currency, today):
        """Write the planned goals AND their `goal_accounts` links (B12).

        *** THE LINKS ARE WRITTEN HERE AND NOT LEFT TO THE BOOT BACKFILL. ***
        `backfill_goal_accounts` runs before the demo seeder in `create_app`, so a
        FRESH install seeded after it would carry goals with no links until the
        next restart -- goals that read correctly through the legacy fallback and
        cannot gain a second account, which is precisely the half-migrated state
        that gets discovered by a user rather than by a test.

        Everything derived goes through `GoalService.sync_links`, the one writer:
        `goals.start_amount` as the sum of the snapshots, `goals.account_id` as the
        primary, and each link's `active_direction`. A seeder that wrote those
        three by hand would be a second writer of a denormalised column, which is
        the drift the single-writer rule exists to prevent.
        """
        from src.models.goal_account import GoalAccount
        from src.services.goal.service import GoalService

        svc = GoalService()
        base = datetime.utcnow()
        for spec in planned:
            links = spec.pop('links', [])
            status = spec.pop('status', 'active')
            primary = links[0][0] if links else None
            goal = Goal(
                user_id=user.id,
                account_id=primary.id if primary is not None else None,
                currency_code=(primary.currency_code if primary is not None
                               else currency),
                start_date=today - timedelta(days=120),
                target_date=today + timedelta(days=240),
                status=status,
                achieved_at=datetime.utcnow() if status == 'achieved' else None,
                **spec,
            )
            for offset, (account, snapshot) in enumerate(links):
                # `added_at` is what decides the primary, so it is set explicitly
                # and in list order rather than left to collide on one timestamp.
                goal.links.append(GoalAccount(
                    account_id=account.id, start_amount=snapshot,
                    added_at=base + timedelta(seconds=offset)))
            svc.sync_links(goal)
            db.session.add(goal)
        db.session.flush()

    @staticmethod
    def _seed_demo_co_owners():
        """One co-owned account, so "Joint" and the contribution breakdown render.

        *** PERMISSION AND PRESENTATION ONLY — ATTRIBUTION IS UNCHANGED. *** Adding
        a co-owner moves no figure anywhere: every total still belongs to
        `Account.user_id` (D-18). That is what makes this safe to backfill onto a
        live demo.

        demo1 and demo2 are BOTH demo users, which matters: the API's own predicate
        is `on_the_same_side`, so a real member could not be added here. A seed that
        writes a row the API would refuse is a fixture describing a product that
        does not exist, which is D-107's shape.

        Contributions come from money moving INTO the account from two different
        payers. One payer would show a single bar and demonstrate nothing — the same
        reason `_seed_group_expenses` rotates who paid.
        """
        owner = User.query.filter_by(id='demo1@finpal.demo').first()
        partner = User.query.filter_by(id='demo2@finpal.demo').first()
        if owner is None or partner is None:
            return
        account = Account.query.filter_by(user_id=owner.id, type='checking').first()
        if account is None:
            return

        already = db.session.execute(db.select(account_owners.c.user_id).where(
            account_owners.c.account_id == account.id,
            account_owners.c.user_id == partner.id)).first()
        if already is not None:
            return

        db.session.execute(account_owners.insert().values(
            account_id=account.id, user_id=partner.id))
        logger.info('Demo account %r co-owned by %s', account.name, partner.id)

        # Two payers into the joint account. `transaction_type='income'` because a
        # contribution is money arriving; a TRANSFER would also count (the service
        # reads `destination_account_id` too) but needs a source account on the
        # other side, and the payer here does not own one in this currency.
        for index, (payer, amount, days_ago) in enumerate((
            (owner, Decimal('400.00'), 45),
            (partner, Decimal('300.00'), 30),
            (owner, Decimal('250.00'), 12),
        )):
            db.session.add(Expense(
                user_id=account.user_id,
                description='Transfer into the emergency fund',
                amount=amount,
                transaction_type='income',
                date=datetime.utcnow() - timedelta(days=days_ago),
                account_id=account.id,
                currency_code=account.currency_code or 'USD',
                card_used='Demo Data',
                split_method='equal',
                # Who FRONTED the cash, which is not attribution — the account's
                # owner still owns every one of these rows for every figure the app
                # computes. Both answers are correct to different questions.
                paid_by=payer.id,
            ))
        db.session.flush()

    @staticmethod
    def _seed_group_expenses(group, members):
        """Money in a group, so the split surfaces have something to show. D-77.

        *** SPREAD ACROSS DIFFERENT PAYERS ON PURPOSE. *** If one member pays for
        everything the IOU tracker shows a single one-way debt, which is the least
        informative arrangement possible and would still look like a bug to anyone
        checking whether settling up works. Rotating the payer makes the balances
        cross, which is what the feature is for.

        `paid_by` is who fronted the cash, NOT attribution — attribution is the
        account's owner (D-18). Both are correct answers to different questions.
        """
        if not members:
            return

        plans = {
            'Apartment Roommates': [
                ('Electricity — March', 142.60, 3),
                ('Internet — March', 79.00, 9),
                ('Weekly shop', 213.45, 14),
            ],
            'Trip to Vegas': [
                ('Hotel, three nights', 912.00, 21),
                ('Show tickets', 448.00, 20),
                ('Dinner at the Bellagio', 286.30, 19),
            ],
            'Office Lunch Club': [
                ('Thai place', 68.20, 2),
                ('Pizza Friday', 54.75, 9),
                ('Sandwiches', 41.90, 16),
            ],
        }

        for index, (description, amount, days_ago) in enumerate(
                plans.get(group.name, [])):
            payer = members[index % len(members)]
            payer_account = Account.query.filter_by(
                user_id=payer.id, type='checking').first()
            db.session.add(Expense(
                user_id=payer.id,
                description=description,
                amount=amount,
                transaction_type='expense',
                date=datetime.utcnow() - timedelta(days=days_ago),
                account_id=payer_account.id if payer_account else None,
                group_id=group.id,
                currency_code=payer_account.currency_code if payer_account else 'USD',
                card_used='Demo Data',
                split_method='equal',
                # Everyone in the group shares it, which is what `auto_include_all`
                # on these groups already implies.
                split_with=','.join(m.id for m in members),
                paid_by=payer.id,
            ))

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
            # *** DELETED IN DEPENDENCY ORDER, AND THE ORDER IS THE WHOLE FIX. ***
            #
            # This function was called by NOTHING and had never been run, which
            # is how it survived: it deleted `Expense`, `Budget`, `Account`,
            # `Category`, `Portfolio` in that order while SIXTEEN foreign keys
            # point at `accounts` and `categories` and every one is `NO ACTION`.
            # Measured on real Postgres, it raised
            #     ForeignKeyViolation: update or delete on table "expenses"
            #     violates constraint "category_splits_expense_id_fkey"
            # on the FIRST statement, rolled back, and returned success=False
            # having deleted nothing.
            #
            # *** AND THE SUITE COULD NOT SEE IT. *** `tests/conftest.py` pins
            # SQLite in memory and SQLite does not enforce foreign keys without
            # `PRAGMA foreign_keys=ON`, so seven tests passed against the broken
            # version. The order below is asserted directly, on any engine, by
            # `tests/integration/test_demo_reset_fk_order.py`.
            #
            # `Query.delete()` is a BULK delete: one statement, no ORM cascade
            # and no service-layer guard -- including the one D-181 added so an
            # account deletion cannot silently reset a linked goal. Nothing here
            # may lean on those; every dependant is removed explicitly.
            from src.models.goal import Goal
            from src.models.goal_account import GoalAccount
            from src.models.transaction import CategorySplit
            from src.models.transaction_rule import TransactionRule
            from src.models.recurring import RecurringExpense

            expense_ids = [row.id for row in Expense.query
                           .filter_by(user_id=user_id).with_entities(Expense.id)]
            goal_ids = [row.id for row in Goal.query
                        .filter_by(user_id=user_id).with_entities(Goal.id)]

            # 1. Leaves first -- rows that reference an expense or a goal.
            if expense_ids:
                CategorySplit.query.filter(
                    CategorySplit.expense_id.in_(expense_ids)).delete(
                        synchronize_session=False)
            if goal_ids:
                GoalAccount.query.filter(
                    GoalAccount.goal_id.in_(goal_ids)).delete(
                        synchronize_session=False)

            # 2. Rows that reference an account or a category. `transaction_rules`
            #    points at BOTH, and there were 208 of them on the live demo.
            TransactionRule.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            RecurringExpense.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            Goal.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            Expense.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            Budget.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            Portfolio.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)

            # 3. The two tables everything else pointed at. Subcategories before
            #    parents -- `categories.parent_id` is a self-reference and is
            #    also NO ACTION.
            Account.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)
            Category.query.filter(
                Category.user_id == user_id,
                Category.parent_id.isnot(None)).delete(synchronize_session=False)
            Category.query.filter_by(user_id=user_id).delete(
                synchronize_session=False)

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
        except Exception:
            db.session.rollback()
            logger.exception('Failed to reset demo user %s', user_id)
            return {'success': False, 'error': 'Could not reset the demo user'}
