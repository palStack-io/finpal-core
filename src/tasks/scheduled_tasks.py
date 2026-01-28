"""
Scheduled Tasks
Defines all scheduled background tasks for the application
"""

from src.extensions import scheduler
from src.services.budget.rollover_service import BudgetRolloverService
import logging

logger = logging.getLogger(__name__)


def init_scheduled_tasks():
    """Initialize all scheduled tasks"""

    @scheduler.task('cron', id='budget_rollover', hour=1, minute=0)
    def process_budget_rollovers():
        """
        Process budget rollovers daily at 1:00 AM
        Checks all active budgets with rollover enabled and processes them
        """
        with scheduler.app.app_context():
            logger.info("Running scheduled budget rollover task...")
            try:
                result = BudgetRolloverService.process_all_rollovers()
                logger.info(f"Budget rollover task completed: {result}")
            except Exception as e:
                logger.error(f"Budget rollover task failed: {str(e)}")

    logger.info("Scheduled tasks initialized successfully")
