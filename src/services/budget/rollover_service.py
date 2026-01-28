"""
Budget Rollover Service
Handles automatic rollover of unused budget amounts to the next period
"""

from datetime import datetime, timedelta
from src.extensions import db
from src.models.budget import Budget
import logging

logger = logging.getLogger(__name__)


class BudgetRolloverService:
    """Service for processing budget rollovers"""

    @staticmethod
    def get_next_period_start(budget):
        """Calculate the start date of the next budget period"""
        current_start, current_end = budget.get_current_period_dates()

        if budget.period == 'weekly':
            return current_end + timedelta(seconds=1)
        elif budget.period == 'monthly':
            # Move to first day of next month
            if current_end.month == 12:
                return current_end.replace(year=current_end.year + 1, month=1, day=1,
                                          hour=0, minute=0, second=0, microsecond=0)
            else:
                return current_end.replace(month=current_end.month + 1, day=1,
                                          hour=0, minute=0, second=0, microsecond=0)
        elif budget.period == 'yearly':
            return current_end.replace(year=current_end.year + 1, month=1, day=1,
                                      hour=0, minute=0, second=0, microsecond=0)

        return current_end + timedelta(days=1)

    @staticmethod
    def should_process_rollover(budget):
        """Check if a budget is ready for rollover processing"""
        if not budget.active or not budget.rollover:
            return False

        # Get current period end date
        _, current_end = budget.get_current_period_dates()
        now = datetime.utcnow()

        # Check if we're past the end of the current period
        return now > current_end

    @staticmethod
    def calculate_rollover_amount(budget):
        """Calculate the amount to rollover to the next period"""
        spent = budget.calculate_spent_amount()
        total_budget = budget.get_total_budget()
        unused = total_budget - spent

        # Only rollover positive amounts (unused budget)
        return max(0, unused)

    @staticmethod
    def process_budget_rollover(budget):
        """Process rollover for a single budget"""
        try:
            if not BudgetRolloverService.should_process_rollover(budget):
                return False

            # Calculate unused amount from current period
            rollover_amount = BudgetRolloverService.calculate_rollover_amount(budget)

            logger.info(f"Processing rollover for budget {budget.id}: "
                       f"User={budget.user_id}, Category={budget.category_id}, "
                       f"Amount={rollover_amount}")

            # Update the budget with the new rollover amount
            budget.rollover_amount = rollover_amount
            budget.updated_at = datetime.utcnow()

            # Update start_date to mark the beginning of the new period
            budget.start_date = BudgetRolloverService.get_next_period_start(budget)

            db.session.commit()

            logger.info(f"Rollover completed for budget {budget.id}: "
                       f"Rolled over ${rollover_amount:.2f} to next period starting {budget.start_date}")

            return True

        except Exception as e:
            logger.error(f"Error processing rollover for budget {budget.id}: {str(e)}")
            db.session.rollback()
            return False

    @staticmethod
    def process_all_rollovers():
        """Process rollovers for all eligible budgets"""
        logger.info("Starting budget rollover processing...")

        # Get all active budgets with rollover enabled
        budgets = Budget.query.filter_by(active=True, rollover=True).all()

        processed_count = 0
        error_count = 0

        for budget in budgets:
            try:
                if BudgetRolloverService.process_budget_rollover(budget):
                    processed_count += 1
            except Exception as e:
                logger.error(f"Failed to process budget {budget.id}: {str(e)}")
                error_count += 1

        logger.info(f"Budget rollover processing completed: "
                   f"{processed_count} budgets processed, {error_count} errors")

        return {
            'processed': processed_count,
            'errors': error_count,
            'total': len(budgets)
        }
