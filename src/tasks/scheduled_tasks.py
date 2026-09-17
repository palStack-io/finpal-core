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

    @scheduler.task('cron', id='literacy_award_coins', hour=4, minute=30)
    def award_literacy_coins():
        """Award coins for acts of understanding, nightly at 04:30.

        *** 04:30, DELIBERATELY AFTER learnPal's 04:15 UNLOCK PASS. *** A lesson
        unlocked tonight is already recorded by the time coins are counted, so
        the two never disagree about the same evening.

        *** CORE, NOT A MODULE. *** Coins are earned for understanding your own
        money, and a user who hides learnPal must not lose that — which is the
        whole reason the predicate library moved out of the module.
        """
        with scheduler.app.app_context():
            logger.info("Running literacy coin award pass...")
            try:
                from src.services.literacy.acts import award_all_users
                total = award_all_users(scheduler.app)
                # *** BADGES RIDE THE SAME PASS, AND PAY NOTHING INTO IT. ***
                # They are milestones, recorded once and kept; the coin total
                # above is unaffected by design.
                from src.services.literacy.badges import award_all_badges
                award_all_badges(scheduler.app)
                logger.info(f"Literacy coin pass completed: {total} coin(s)")
            except Exception as e:
                logger.error(f"Literacy coin pass failed: {str(e)}")

    logger.info("Scheduled tasks initialized successfully")
