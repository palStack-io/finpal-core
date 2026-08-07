"""
Helper utility functions
"""

import re
from sqlalchemy import or_
from src.models.transaction import Expense
from src.models.category import CategoryMapping
from src.models.group import Settlement
from src.models.user import User
from src.extensions import db
from src.utils.split_with import split_with_filter

def auto_categorize_transaction(description, user_id):
    """
    Automatically categorize a transaction based on its description
    Returns the best matching category ID or None if no match found
    """
    if not description:
        return None
        
    # Standardize description - lowercase and remove extra spaces
    description = description.strip().lower()
    
    # Get all active category mappings for the user
    mappings = CategoryMapping.query.filter_by(
        user_id=user_id,
        active=True
    ).order_by(CategoryMapping.priority.desc(), CategoryMapping.match_count.desc()).all()
    
    # Keep track of matches and their scores
    matches = []
    
    # Check each mapping
    for mapping in mappings:
        matched = False
        if mapping.is_regex:
            # Use regex pattern matching
            try:
                pattern = re.compile(mapping.keyword, re.IGNORECASE)
                if pattern.search(description):
                    matched = True
            except:
                # If regex is invalid, fall back to simple substring search
                matched = mapping.keyword.lower() in description
        else:
            # Simple substring matching
            matched = mapping.keyword.lower() in description
            
        if matched:
            # Calculate match score
            score = (mapping.priority * 100) + (mapping.match_count * 10) + len(mapping.keyword)
            
            # Adjust score based on position (if simple keyword)
            if not mapping.is_regex:
                position = description.find(mapping.keyword.lower())
                if position == 0:  # Matches at the start
                    score += 50
                elif position > 0:  # Adjust based on how early it appears
                    score += max(0, 30 - position)
                    
            matches.append((mapping, score))
    
    # Sort matches by score, descending
    matches.sort(key=lambda x: x[1], reverse=True)
    
    # If we have any matches, increment the match count for the winner and return its category ID
    if matches:
        best_mapping = matches[0][0]
        best_mapping.match_count += 1
        db.session.commit()
        return best_mapping.category_id
    
    return None


def calculate_balances(user_id):
    """Calculate balances between the current user and all other users"""
    balances = {}
    
    # Step 1: Calculate balances from expenses
    expenses = Expense.query.filter(
        or_(
            Expense.paid_by == user_id,
            split_with_filter(Expense.split_with, user_id)
        )
    ).all()
    
    for expense in expenses:
        splits = expense.calculate_splits()
        
        # If current user paid for the expense
        if expense.paid_by == user_id:
            # Add what others owe to current user
            for split in splits['splits']:
                other_user_id = split['email']
                if other_user_id != user_id:
                    if other_user_id not in balances:
                        other_user = User.query.filter_by(id=other_user_id).first()
                        balances[other_user_id] = {
                            'user_id': other_user_id,
                            'name': other_user.name if other_user else 'Unknown',
                            'email': other_user_id,
                            'amount': 0
                        }
                    balances[other_user_id]['amount'] += split['amount']
        else:
            # If someone else paid and current user owes them
            payer_id = expense.paid_by
            
            # Find current user's portion
            current_user_portion = 0
            
            # Check if current user is in the splits
            for split in splits['splits']:
                if split['email'] == user_id:
                    current_user_portion = split['amount']
                    break
            
            if current_user_portion > 0:
                if payer_id not in balances:
                    payer = User.query.filter_by(id=payer_id).first()
                    balances[payer_id] = {
                        'user_id': payer_id,
                        'name': payer.name if payer else 'Unknown',
                        'email': payer_id,
                        'amount': 0
                    }
                balances[payer_id]['amount'] -= current_user_portion
    
    # Step 2: Adjust balances based on settlements
    settlements = Settlement.query.filter(
        or_(
            Settlement.payer_id == user_id,
            Settlement.receiver_id == user_id
        )
    ).all()
    
    for settlement in settlements:
        if settlement.payer_id == user_id:
            # Current user paid money to someone else
            other_user_id = settlement.receiver_id
            if other_user_id not in balances:
                other_user = User.query.filter_by(id=other_user_id).first()
                balances[other_user_id] = {
                    'user_id': other_user_id,
                    'name': other_user.name if other_user else 'Unknown',
                    'email': other_user_id,
                    'amount': 0
                }
            balances[other_user_id]['amount'] += settlement.amount
            
        elif settlement.receiver_id == user_id:
            # Current user received money from someone else
            other_user_id = settlement.payer_id
            if other_user_id not in balances:
                other_user = User.query.filter_by(id=other_user_id).first()
                balances[other_user_id] = {
                    'user_id': other_user_id,
                    'name': other_user.name if other_user else 'Unknown',
                    'email': other_user_id,
                    'amount': 0
                }
            balances[other_user_id]['amount'] -= settlement.amount
    
    # Return only non-zero balances
    return [balance for balance in balances.values() if abs(balance['amount']) > 0.01]


def get_base_currency(current_user=None):
    """Get the current user's default currency or fall back to base currency if not set"""
    from src.models.currency import Currency

    if current_user and current_user.is_authenticated and current_user.default_currency_code and current_user.default_currency:
        # User has set a default currency, use that
        return {
            'code': current_user.default_currency.code,
            'symbol': current_user.default_currency.symbol,
            'name': current_user.default_currency.name
        }
    else:
        # Fall back to system base currency if user has no preference
        base_currency = Currency.query.filter_by(is_base=True).first()
        if not base_currency:
            # Default to USD if no base currency is set
            return {'code': 'USD', 'symbol': '$', 'name': 'US Dollar'}
        return {
            'code': base_currency.code,
            'symbol': base_currency.symbol,
            'name': base_currency.name
        }


def sync_investments_with_accounts(user_id):
    """Sync investment portfolios with their linked accounts, but only for manually added accounts"""
    from flask import current_app
    from src.models.investment import Portfolio
    from src.models.account import Account

    try:
        # Get all portfolios for the user that are linked to accounts
        portfolios = Portfolio.query.filter(
            Portfolio.user_id == user_id,
            Portfolio.account_id.isnot(None)
        ).all()

        if not portfolios:
            return  # No linked portfolios, nothing to sync

        for portfolio in portfolios:
            # Skip if no linked account
            if not portfolio.account_id:
                continue

            account = db.session.get(Account, portfolio.account_id)
            if not account:
                continue

            # CRITICAL: Skip accounts that came from SimpleFin
            if account.import_source == 'simplefin':
                continue

            # Calculate current portfolio value
            portfolio_value = portfolio.calculate_total_value()

            # Update the account balance to match the portfolio value
            account.balance = portfolio_value

        # Save all changes
        db.session.commit()

    except Exception as e:
        current_app.logger.error(f"Error syncing investments with accounts: {str(e)}")
        db.session.rollback()  # Rollback on error


def calculate_asset_debt_trends(current_user, user_ids=None):
    """Asset and debt trends for a set of members' accounts, including investments.

    `user_ids` is the scope the figures describe. It defaults to the caller alone,
    which is what every existing caller meant and keeps the unit tests honest; the
    dashboard passes the household, or one member when the user has filtered to
    them. Before this, net worth was ALWAYS the caller's own accounts while the
    totals beside it covered the household — the mix D-18 was opened for, and the
    reason a filter had to move every figure together or none of them.
    """
    from datetime import datetime, timedelta
    from src.models.account import Account
    from src.models.investment import Portfolio
    from src.utils.currency_converter import convert_currency

    # Initialize tracking
    monthly_assets = {}
    monthly_debts = {}

    # Get today's date and calculate a reasonable historical range (last 12 months)
    today = datetime.now()
    twelve_months_ago = today - timedelta(days=365)

    scope = list(user_ids) if user_ids else [current_user.id]

    accounts = Account.query.filter(Account.user_id.in_(scope)).all()
    portfolios = Portfolio.query.filter(Portfolio.user_id.in_(scope)).all()

    # Get user's preferred currency code
    user_currency_code = current_user.default_currency_code or 'USD'

    # Calculate true total assets and debts directly from accounts (for accurate current total)
    direct_total_assets = 0
    direct_total_debts = 0
    investment_total = 0

    for account in accounts:
        # Get account's currency code, default to user's preferred currency
        account_currency_code = account.currency_code or user_currency_code

        # Convert account balance to user's currency if needed
        if account_currency_code != user_currency_code:
            converted_balance = convert_currency(account.balance, account_currency_code, user_currency_code)
        else:
            converted_balance = account.balance

        if account.type in ['checking', 'savings', 'investment'] and converted_balance > 0:
            direct_total_assets += converted_balance
        elif account.type in ['credit'] or converted_balance < 0:
            # For credit cards with negative balances (standard convention)
            direct_total_debts += abs(converted_balance)

    # Add investment values to assets - calculate once to avoid duplication
    account_linked_portfolios = []

    # Calculate investment total
    for portfolio in portfolios:
        portfolio_value = portfolio.calculate_total_value()

        # Check if this portfolio is linked to an account
        if portfolio.account_id:
            # If linked to an account, keep track but don't add to assets yet
            account_linked_portfolios.append({
                'account_id': portfolio.account_id,
                'value': portfolio_value
            })
        else:
            # If not linked to an account, add directly to assets
            investment_total += portfolio_value

    # Add investment total to assets - only those not linked to accounts
    direct_total_assets += investment_total

    # Process each account for historical trends
    for account in accounts:
        # Get account's currency code, default to user's preferred currency
        account_currency_code = account.currency_code or user_currency_code

        # Categorize account types
        is_asset = account.type in ['checking', 'savings', 'investment'] and account.balance > 0
        is_debt = account.type in ['credit'] or account.balance < 0

        # Skip accounts with zero or near-zero balance
        if abs(account.balance or 0) < 0.01:
            continue

        # Get monthly transactions for this account
        transactions = Expense.query.filter(
            Expense.account_id == account.id,
            Expense.user_id == current_user.id,
            Expense.date >= twelve_months_ago
        ).order_by(Expense.date).all()

        # Reconstruct each month's closing balance by working *backwards* from the
        # balance we know: today's.
        #
        # This used to seed `current_balance` with today's balance and then walk
        # transactions oldest-to-newest applying `+= income` / `-= expense`, which
        # treats the present balance as the starting balance and replays a year of
        # activity on top of it. The resulting "history" was the current balance
        # plus a forward sum — not a balance at any point in time — and it pushed
        # the whole net-worth trend the wrong way.
        #
        # The balance at the end of month M is:
        #     today's balance − (net effect of every transaction after M)
        # so the walk has to go newest-to-oldest, undoing one month at a time.
        by_month = {}
        for transaction in transactions:
            amount = transaction.amount
            if transaction.currency_code and transaction.currency_code != account_currency_code:
                amount = convert_currency(
                    amount, transaction.currency_code, account_currency_code)

            # Signed effect on the balance, so undoing it is a subtraction.
            if transaction.transaction_type == 'income':
                effect = amount
            elif transaction.transaction_type in ('expense', 'transfer'):
                effect = -amount
            else:
                continue

            by_month.setdefault(transaction.date.strftime('%Y-%m'), 0)
            by_month[transaction.date.strftime('%Y-%m')] += effect

        balance_history = {}
        running = account.balance or 0

        # No activity since the newest transaction, so the current month closes at
        # today's balance. Set explicitly for the case where the newest transaction
        # predates this month.
        balance_history[today.strftime('%Y-%m')] = running

        for month_key in sorted(by_month, reverse=True):
            # `running` is this month's closing balance before we undo its activity.
            balance_history[month_key] = running
            # Having removed this month's transactions, `running` is now the closing
            # balance of the month before it.
            running -= by_month[month_key]

        # Convert balance history to user currency if needed
        if account_currency_code != user_currency_code:
            for month, balance in balance_history.items():
                balance_history[month] = convert_currency(balance, account_currency_code, user_currency_code)

        # Categorize and store balances
        for month, balance in balance_history.items():
            if is_asset:
                # For asset accounts, add positive balances to the monthly total
                monthly_assets[month] = monthly_assets.get(month, 0) + balance
            elif is_debt:
                # For debt accounts or negative balances, add the absolute value to the debt total
                monthly_debts[month] = monthly_debts.get(month, 0) + abs(balance)

    # Add investment values to monthly trends
    # This is a simplification - we don't have historical investment data
    # so we'll just use the current value for all months
    for month in monthly_assets.keys():
        monthly_assets[month] += investment_total

    # Ensure consistent months across both series
    all_months = sorted(set(list(monthly_assets.keys()) + list(monthly_debts.keys())))

    # Fill in missing months with previous values or zero
    assets_trend = []
    debts_trend = []

    for month in all_months:
        assets_trend.append(monthly_assets.get(month, assets_trend[-1] if assets_trend else 0))
        debts_trend.append(monthly_debts.get(month, debts_trend[-1] if debts_trend else 0))

    # Use the directly calculated totals rather than the trend values for accuracy
    total_assets = direct_total_assets
    total_debts = direct_total_debts
    net_worth = total_assets - total_debts

    return {
        'months': all_months,
        'assets': assets_trend,
        'debts': debts_trend,
        'total_assets': total_assets,
        'total_debts': total_debts,
        'net_worth': net_worth,
        'investment_total': investment_total  # Add this to expose investment value
    }
