"""
Seed Demo Data
Creates 3 demo user accounts with mock transactions, accounts, and budgets
"""

from src.models.user import User
from src.models.transaction import Expense
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.investment import Portfolio, Investment
from src.models.group import Group
from src.extensions import db
from src.data.demo_users import (
    DEMO_USERS,
    DEMO_TRANSACTIONS,
    DEMO_ACCOUNTS,
    DEMO_BUDGETS,
    DEMO_INVESTMENTS,
    DEMO_GROUPS,
    DEMO_GROUP_TRANSACTIONS
)
from src.data.seed_defaults import seed_user_defaults
from werkzeug.security import generate_password_hash
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def seed_demo_users():
    """
    Create 3 demo users with complete mock data
    Returns dict with demo user credentials
    """
    demo_credentials = []

    for user_data in DEMO_USERS:
        email = user_data['email']

        # Check if user already exists
        existing_user = User.query.filter_by(id=email).first()
        if existing_user:
            logger.info(f"Demo user {email} already exists, skipping...")
            demo_credentials.append({
                'email': email,
                'password': user_data['password'],
                'name': f"{user_data['first_name']} {user_data['last_name']}"
            })
            continue

        # Create user (id field is email in this schema)
        new_user = User(
            id=email,
            password_hash=generate_password_hash(user_data['password']),
            name=f"{user_data['first_name']} {user_data['last_name']}",
            default_currency_code=user_data['default_currency_code'],
            created_at=datetime.utcnow()
        )

        db.session.add(new_user)
        db.session.flush()  # Get user ID

        logger.info(f"Created demo user: {email}")

        # Seed default categories and rules
        try:
            seed_result = seed_user_defaults(new_user.id)
            logger.info(f"Seeded defaults for {email}: {seed_result}")
        except Exception as e:
            logger.error(f"Failed to seed defaults for {email}: {str(e)}")

        # Create demo accounts
        if email in DEMO_ACCOUNTS:
            for account_data in DEMO_ACCOUNTS[email]:
                account = Account(
                    user_id=new_user.id,
                    name=account_data['name'],
                    type=account_data['type'],  # Field is 'type' not 'account_type'
                    balance=account_data['balance'],
                    currency_code=account_data['currency']
                )
                db.session.add(account)

            db.session.flush()
            logger.info(f"Created {len(DEMO_ACCOUNTS[email])} accounts for {email}")

        # Create demo transactions with auto-categorization
        if email in DEMO_TRANSACTIONS:
            # Get user's categories
            categories = Category.query.filter_by(user_id=new_user.id).all()
            category_map = {cat.name: cat.id for cat in categories}

            # Get first checking account for transactions
            checking_account = Account.query.filter_by(
                user_id=new_user.id,
                type='checking'  # Field is 'type' not 'account_type'
            ).first()

            for txn_data in DEMO_TRANSACTIONS[email]:
                # Try to find matching category
                category_id = None
                if 'category_hint' in txn_data:
                    # Try exact match first
                    if txn_data['category_hint'] in category_map:
                        category_id = category_map[txn_data['category_hint']]
                    else:
                        # Try to find by matching substring
                        hint_parts = txn_data['category_hint'].split('/')
                        for part in hint_parts:
                            matching_cats = [cat for cat in categories if part.lower() in cat.name.lower()]
                            if matching_cats:
                                category_id = matching_cats[0].id
                                break

                transaction = Expense(
                    user_id=new_user.id,
                    description=txn_data['description'],
                    amount=txn_data['amount'],
                    transaction_type=txn_data['type'],
                    date=datetime.strptime(txn_data['date'], '%Y-%m-%d'),
                    category_id=category_id,
                    account_id=checking_account.id if checking_account else None,
                    currency_code='USD',
                    # Required fields
                    card_used='Demo Data',
                    split_method='equal',
                    paid_by=new_user.id
                )
                db.session.add(transaction)

            logger.info(f"Created {len(DEMO_TRANSACTIONS[email])} transactions for {email}")

        # Create demo budgets
        if email in DEMO_BUDGETS:
            for budget_data in DEMO_BUDGETS[email]:
                # Find matching category
                matching_cat = None
                for cat in categories:
                    if budget_data['name'].lower() in cat.name.lower():
                        matching_cat = cat
                        break

                if matching_cat:
                    budget = Budget(
                        user_id=new_user.id,
                        category_id=matching_cat.id,
                        amount=budget_data['amount'],
                        period=budget_data['period'],
                        created_at=datetime.utcnow()
                    )
                    db.session.add(budget)

            logger.info(f"Created budgets for {email}")

        # Create investment portfolios if user has them
        if email in DEMO_INVESTMENTS:
            user_investments = DEMO_INVESTMENTS[email]
            for portfolio_data in user_investments['portfolios']:
                # Create portfolio
                portfolio = Portfolio(
                    user_id=new_user.id,
                    name=portfolio_data['name'],
                    description=portfolio_data['description']
                )
                db.session.add(portfolio)
                db.session.flush()  # Get portfolio ID

                # Create investments in this portfolio
                for inv_data in portfolio_data['investments']:
                    investment = Investment(
                        portfolio_id=portfolio.id,
                        symbol=inv_data['symbol'],
                        name=inv_data['name'],
                        shares=inv_data['shares'],
                        purchase_price=inv_data['purchase_price'],
                        current_price=inv_data['current_price'],
                        purchase_date=datetime.strptime(inv_data['purchase_date'], '%Y-%m-%d'),
                        sector=inv_data.get('sector'),
                        industry=inv_data.get('industry'),
                        notes=inv_data.get('notes'),
                        last_update=datetime.utcnow()
                    )
                    db.session.add(investment)

            logger.info(f"Created {len(user_investments['portfolios'])} investment portfolios for {email}")

        # Store credentials
        demo_credentials.append({
            'email': email,
            'password': user_data['password'],
            'name': f"{user_data['first_name']} {user_data['last_name']}",
            'description': user_data['description']
        })

    # Create demo groups
    logger.info("Creating demo groups...")
    created_groups = []
    for group_data in DEMO_GROUPS:
        # Get creator user
        creator = User.query.filter_by(id=group_data['created_by']).first()
        if not creator:
            logger.warning(f"Creator {group_data['created_by']} not found for group {group_data['name']}")
            continue

        # Create group
        group = Group(
            name=group_data['name'],
            description=group_data.get('description'),
            created_by=group_data['created_by'],
            default_split_method=group_data.get('default_split_method', 'equal'),
            auto_include_all=group_data.get('auto_include_all', True)
        )

        # Set default split values if provided
        if 'default_split_values' in group_data:
            import json
            group.default_split_values = json.dumps(group_data['default_split_values'])

        db.session.add(group)
        db.session.flush()  # Get group ID

        # Add members
        for member_email in group_data['members']:
            member = User.query.filter_by(id=member_email).first()
            if member:
                group.members.append(member)

        created_groups.append(group)
        logger.info(f"Created group: {group.name} with {len(group.members)} members")

    db.session.flush()  # Flush groups before creating transactions

    # Create demo group transactions
    logger.info("Creating demo group transactions...")
    for txn_data in DEMO_GROUP_TRANSACTIONS:
        group_index = txn_data.get('group_index')
        if group_index is None or group_index >= len(created_groups):
            logger.warning(f"Invalid group_index {group_index} for transaction {txn_data['description']}")
            continue

        group = created_groups[group_index]
        payer = User.query.filter_by(id=txn_data['paid_by']).first()
        if not payer:
            logger.warning(f"Payer {txn_data['paid_by']} not found for transaction {txn_data['description']}")
            continue

        # Get first checking account for the payer
        payer_account = Account.query.filter_by(
            user_id=payer.id,
            type='checking'
        ).first()

        # Try to match category
        category_id = None
        if 'category_hint' in txn_data:
            categories = Category.query.filter_by(user_id=payer.id).all()
            for cat in categories:
                if cat.name.lower() in txn_data['category_hint'].lower():
                    category_id = cat.id
                    break

        # Parse date
        txn_date = datetime.strptime(txn_data['date'], '%Y-%m-%d')

        # Create split_with comma-separated string
        split_with_list = txn_data.get('split_with', [])
        split_with_str = ','.join(split_with_list)

        # Handle split_details
        split_details_str = None
        if 'split_details' in txn_data:
            import json
            split_details_str = json.dumps(txn_data['split_details'])

        # Create transaction
        expense = Expense(
            description=txn_data['description'],
            amount=txn_data['amount'],
            date=txn_date,
            card_used=payer_account.name if payer_account else 'Cash',
            split_method=txn_data.get('split_method', 'equal'),
            paid_by=txn_data['paid_by'],
            user_id=payer.id,
            group_id=group.id,
            split_with=split_with_str,
            split_details=split_details_str,
            transaction_type=txn_data.get('type', 'expense'),
            account_id=payer_account.id if payer_account else None,
            category_id=category_id,
            currency_code='USD'
        )

        db.session.add(expense)

    logger.info(f"Created {len(DEMO_GROUP_TRANSACTIONS)} group transactions")

    # Commit all changes
    try:
        db.session.commit()
        logger.info("Successfully created all demo users and data")
        return {
            'success': True,
            'credentials': demo_credentials,
            'count': len(demo_credentials)
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to create demo data: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


def delete_demo_users():
    """
    Delete all demo users and their data
    Useful for testing/resetting
    """
    demo_emails = [user['email'] for user in DEMO_USERS]
    deleted_count = 0

    for email in demo_emails:
        user = User.query.filter_by(id=email).first()
        if user:
            # Delete all related data (cascade should handle this)
            db.session.delete(user)
            deleted_count += 1
            logger.info(f"Deleted demo user: {email}")

    try:
        db.session.commit()
        logger.info(f"Successfully deleted {deleted_count} demo users")
        return {
            'success': True,
            'deleted_count': deleted_count
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to delete demo users: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == '__main__':
    # Can be run standalone for testing
    from src.extensions import create_app

    app = create_app()
    with app.app_context():
        print("Seeding demo data...")
        result = seed_demo_users()

        if result['success']:
            print(f"\n✅ Successfully created {result['count']} demo users!\n")
            print("Demo Account Credentials:")
            print("=" * 60)
            for cred in result['credentials']:
                print(f"\n{cred['name']} ({cred['description']})")
                print(f"  Email:    {cred['email']}")
                print(f"  Password: {cred['password']}")
            print("\n" + "=" * 60)
        else:
            print(f"\n❌ Failed to create demo data: {result['error']}")
