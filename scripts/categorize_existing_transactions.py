"""
Categorize existing uncategorized transactions using auto-categorization
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.extensions import db
from src.models.transaction import Expense
from src.utils.auto_categorize import auto_categorize_transaction, get_category_by_name
from app import create_app

def categorize_transactions():
    """Categorize all uncategorized transactions"""
    app = create_app()

    with app.app_context():
        # Get all transactions without a category
        uncategorized = Expense.query.filter(
            (Expense.category_id == None) | (Expense.category_id == 0)
        ).all()

        print(f"Found {len(uncategorized)} uncategorized transactions")

        categorized_count = 0
        for transaction in uncategorized:
            # Try to auto-categorize
            category_name = auto_categorize_transaction(
                transaction.description,
                transaction.card_used  # Using card_used as vendor
            )

            if category_name:
                # Get or create category
                category = get_category_by_name(category_name, transaction.user_id)
                transaction.category_id = category.id
                categorized_count += 1
                print(f"  ✓ '{transaction.description}' → {category_name}")

        # Commit changes
        if categorized_count > 0:
            db.session.commit()
            print(f"\n✅ Successfully categorized {categorized_count} transactions")
        else:
            print("\n⚠️  No transactions could be auto-categorized")

if __name__ == '__main__':
    categorize_transactions()
