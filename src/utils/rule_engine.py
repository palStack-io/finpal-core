"""
Transaction Rule Engine
Applies transaction rules for auto-categorization and automation
"""

from src.models.transaction_rule import TransactionRule
from src.extensions import db
import logging

logger = logging.getLogger(__name__)


def apply_transaction_rules(transaction_data, user_id):
    """
    Apply all active transaction rules to transaction data

    Args:
        transaction_data: Dict with transaction fields (description, amount, etc.)
        user_id: User ID to get rules for

    Returns:
        dict: Updated transaction data with rules applied
    """
    # Get all active rules for user, ordered by priority (highest first)
    rules = TransactionRule.query.filter_by(
        user_id=user_id,
        active=True
    ).order_by(TransactionRule.priority.desc()).all()

    logger.info(f"Applying {len(rules)} rules for user {user_id}")

    # Track which rules matched for logging
    matched_rules = []

    # Apply each rule
    for rule in rules:
        if rule.matches(transaction_data):
            logger.debug(f"Rule matched: {rule.name}")
            matched_rules.append(rule.name)

            # Apply the rule's actions
            transaction_data = rule.apply(transaction_data)

            # Stop after first match if desired (can make this configurable)
            # For now, we'll apply all matching rules in priority order
            # The highest priority rule will set the category first,
            # but lower priority rules can still add tags, notes, etc.

    if matched_rules:
        logger.info(f"Matched rules: {', '.join(matched_rules)}")
    else:
        logger.debug(f"No rules matched for transaction: {transaction_data.get('description', '')}")

    # Commit rule match count updates
    try:
        db.session.commit()
    except Exception as e:
        logger.error(f"Failed to commit rule match counts: {str(e)}")
        db.session.rollback()

    return transaction_data


def get_matching_rule(transaction_data, user_id):
    """
    Get the first matching rule for a transaction (highest priority)

    Args:
        transaction_data: Dict with transaction fields
        user_id: User ID

    Returns:
        TransactionRule: First matching rule or None
    """
    rules = TransactionRule.query.filter_by(
        user_id=user_id,
        active=True
    ).order_by(TransactionRule.priority.desc()).all()

    for rule in rules:
        if rule.matches(transaction_data):
            return rule

    return None


def suggest_rule_from_edit(transaction, new_category_id, user_id):
    """
    Suggest creating a new rule based on user's manual categorization

    Args:
        transaction: Transaction object that was edited
        new_category_id: New category ID the user selected
        user_id: User ID

    Returns:
        dict: Suggested rule data or None
    """
    # Extract a pattern from the transaction description
    description = transaction.description or ''

    if not description:
        return None

    # Simple pattern extraction - take the first word or merchant name
    # This is a basic implementation - can be made smarter
    words = description.strip().split()
    if not words:
        return None

    # Use the first significant word (more than 2 characters)
    pattern = None
    for word in words:
        clean_word = ''.join(c for c in word if c.isalnum())
        if len(clean_word) > 2:
            pattern = clean_word.lower()
            break

    if not pattern:
        return None

    # Check if a similar rule already exists
    existing_rule = TransactionRule.query.filter_by(
        user_id=user_id,
        pattern=pattern,
        auto_category_id=new_category_id
    ).first()

    if existing_rule:
        logger.debug(f"Rule already exists for pattern '{pattern}'")
        return None

    # Get category name for display
    from src.models.category import Category
    category = Category.query.get(new_category_id)

    if not category:
        return None

    # Return suggested rule data
    return {
        'name': f'Auto-categorize {pattern.title()} as {category.name}',
        'pattern': pattern,
        'pattern_field': 'description',
        'is_regex': False,
        'case_sensitive': False,
        'auto_category_id': new_category_id,
        'priority': 50,
        'suggested': True,  # Flag to indicate this is a suggestion
        'example_transaction': description
    }


def bulk_apply_rules(user_id, rule_ids=None):
    """
    Apply rules to all existing transactions for a user
    Useful for re-categorizing after creating new rules

    Args:
        user_id: User ID
        rule_ids: Optional list of specific rule IDs to apply (None = all rules)

    Returns:
        dict: Summary of changes made
    """
    from src.models.transaction import Expense

    # Get transactions
    transactions = Expense.query.filter_by(user_id=user_id).all()

    # Get rules to apply
    if rule_ids:
        rules = TransactionRule.query.filter(
            TransactionRule.id.in_(rule_ids),
            TransactionRule.user_id == user_id,
            TransactionRule.active == True
        ).order_by(TransactionRule.priority.desc()).all()
    else:
        rules = TransactionRule.query.filter_by(
            user_id=user_id,
            active=True
        ).order_by(TransactionRule.priority.desc()).all()

    updated_count = 0

    for transaction in transactions:
        transaction_data = {
            'description': transaction.description,
            'amount': transaction.amount,
            'transaction_type': transaction.transaction_type,
            'category_id': transaction.category_id
        }

        # Track if category was changed
        original_category = transaction.category_id

        # Apply rules
        for rule in rules:
            if rule.matches(transaction_data):
                transaction_data = rule.apply(transaction_data)
                break  # Only apply first matching rule

        # Update transaction if category changed
        if transaction_data.get('category_id') != original_category:
            transaction.category_id = transaction_data['category_id']
            updated_count += 1

    try:
        db.session.commit()
        logger.info(f"Bulk rule application: {updated_count} transactions updated")
        return {
            'success': True,
            'transactions_processed': len(transactions),
            'transactions_updated': updated_count
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Bulk rule application failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }
