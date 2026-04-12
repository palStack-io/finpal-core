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

# Module access control (always imported — table exists regardless of feature flags)
from src.modules.access import UserModuleAccess  # noqa: F401

# pointsPal models — only imported when feature is enabled so Alembic autogenerate
# only picks them up in pointsPal-enabled environments.
import os as _os
if _os.getenv('POINTSPAL_ENABLED', 'false').lower() == 'true':
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
]
