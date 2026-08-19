"""
Database models package
Import all models here for easy access
"""

from src.models.associations import group_users, expense_tags
from src.models.currency import Currency
from src.models.user import User, UserApiSettings, LoginEvent, RevokedToken
from src.models.category import Category, CategoryMapping, Tag
from src.models.account import Account, SimpleFin
from src.models.transaction import Expense, CategorySplit
from src.models.transaction_rule import TransactionRule
from src.models.group import Group, Settlement
from src.models.recurring import RecurringExpense, IgnoredRecurringPattern
from src.models.budget import Budget
from src.models.investment import Portfolio, Investment, InvestmentTransaction
from src.models.invitation import Invitation
from src.models.import_source import ImportSource, ImportProfile, ImportBatch
from src.models.personal_access_token import PersonalAccessToken  # noqa: F401
from src.models.agent_action import AgentAction  # noqa: F401

# Module access control (always imported — table exists regardless of feature flags)
from src.modules.access import UserModuleAccess  # noqa: F401

# pointsPal models — imported when the module is enabled, so that Alembic
# autogenerate and db.create_all() both see them in exactly the environments that
# serve pointsPal's routes.
#
# ASK THE MODULE, DO NOT RE-DERIVE THE FLAG. This line read
# `_os.getenv('POINTSPAL_ENABLED', 'false')` and that default was the opposite of
# `ModuleBase.is_enabled()`'s, which falls back to `default_enabled = True` because
# pointsPal ships as part of core. On any instance that simply never set the
# variable — the documented default for a self-hoster — the two readers disagreed:
# the routes were registered and none of the eight tables were created, so
# /api/v1/optimizer/alerts answered 500 `relation "optimizer_alerts" does not
# exist` on the dashboard at login. Reported as palStack-io/finpal-core#122.
#
# It survived because `src/config.py` calls `load_dotenv()` and this repo's own
# `.env` sets POINTSPAL_ENABLED=true, so the suite — including the test that
# exists to prove create_all() builds these tables — never ran the default it
# claimed to cover. `test_pointspal_in_core.py` now pins both readers to one
# source of truth instead.
from src.modules.pointspal.manifest import PointsPalModule as _PointsPalModule
if _PointsPalModule().is_enabled():
    from src.modules.pointspal.models import (
        PointsProgram, PointsEarnCategory, PointsTransferPartner,
        PointspalSyncLog, UserCard, SimpleFinCardLink,
        SpendPeriodTotal, OptimizerAlert,
    )

__all__ = [
    'group_users',
    'expense_tags',
    'Currency',
    'User',
    'UserApiSettings',
    'LoginEvent',
    'RevokedToken',
    'Category',
    'CategoryMapping',
    'Tag',
    'Account',
    'SimpleFin',
    'Expense',
    'CategorySplit',
    'TransactionRule',
    'Group',
    'Settlement',
    'RecurringExpense',
    'IgnoredRecurringPattern',
    'Budget',
    'Portfolio',
    'Investment',
    'InvestmentTransaction',
    'Invitation',
    'ImportSource',
    'ImportProfile',
    'ImportBatch',
    'PersonalAccessToken',
    'AgentAction',
]
