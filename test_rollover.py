"""
Test script for budget rollover functionality
"""

from datetime import datetime, timedelta
from app import app
from src.extensions import db
from src.models.budget import Budget
from src.models.user import User
from src.models.category import Category
from src.services.budget.rollover_service import BudgetRolloverService


def test_rollover():
    """Test budget rollover functionality"""
    with app.app_context():
        print("=" * 60)
        print("Testing Budget Rollover Functionality")
        print("=" * 60)

        # Get or create a test user
        test_user = User.query.filter_by(email='test@example.com').first()
        if not test_user:
            print("No test user found. Please create a user with email 'test@example.com' first.")
            return

        print(f"\nUsing test user: {test_user.email}")

        # Get user's budgets
        budgets = Budget.query.filter_by(user_id=test_user.id, active=True, rollover=True).all()

        if not budgets:
            print("\nNo active budgets with rollover enabled found for this user.")
            print("Please create a budget with rollover enabled in the UI first.")
            return

        print(f"\nFound {len(budgets)} budget(s) with rollover enabled:")

        for budget in budgets:
            print(f"\n--- Budget: {budget.name or 'Unnamed'} ---")
            print(f"  Category: {budget.category.name}")
            print(f"  Amount: ${budget.amount:.2f}")
            print(f"  Period: {budget.period}")
            print(f"  Current Rollover Amount: ${budget.rollover_amount:.2f}")
            print(f"  Start Date: {budget.start_date}")

            # Get current period dates
            start_date, end_date = budget.get_current_period_dates()
            print(f"  Current Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

            # Calculate spent and remaining
            spent = budget.calculate_spent_amount()
            total_budget = budget.get_total_budget()
            remaining = budget.get_remaining_amount()

            print(f"  Spent: ${spent:.2f}")
            print(f"  Total Budget (with rollover): ${total_budget:.2f}")
            print(f"  Remaining: ${remaining:.2f}")

            # Check if rollover should process
            should_process = BudgetRolloverService.should_process_rollover(budget)
            print(f"  Should process rollover? {should_process}")

            if should_process:
                print(f"  -> This budget is past its period end and will be processed")
                rollover_amount = BudgetRolloverService.calculate_rollover_amount(budget)
                print(f"  -> Will rollover ${rollover_amount:.2f} to next period")
            else:
                now = datetime.utcnow()
                if now <= end_date:
                    days_remaining = (end_date - now).days
                    print(f"  -> Budget period is still active ({days_remaining} days remaining)")

        # Test the service
        print("\n" + "=" * 60)
        print("Testing Rollover Service")
        print("=" * 60)

        # Ask for confirmation before processing
        print("\nWould you like to run the rollover processing? (This will modify the database)")
        print("Type 'yes' to proceed, or anything else to skip:")
        # For automated testing, we'll skip the actual processing
        print("Skipping actual processing in automated test mode.")
        print("\nTo manually trigger rollover processing:")
        print("1. Via API: POST /budgets/process-rollover")
        print("2. Via scheduled task: Runs daily at 12:30 AM")

        print("\n" + "=" * 60)
        print("Test completed!")
        print("=" * 60)


if __name__ == '__main__':
    test_rollover()
