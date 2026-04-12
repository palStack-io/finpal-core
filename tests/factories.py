"""
factory_boy factories for finPal models.

All factories use SQLAlchemy strategy so objects are saved to the test DB.
Use create() to persist, build() for in-memory only.

Usage:
    user = UserFactory()               # persisted, password='testpassword'
    user = UserFactory(id='x@y.com')   # custom email
    expense = ExpenseFactory(user_id=user.id, amount=50.0)
"""

import factory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime

from src.extensions import db
from src.models.user import User
from src.models.category import Category
from src.models.transaction import Expense
from src.models.budget import Budget
from src.models.account import Account
from src.modules.access import UserModuleAccess


class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    id = factory.Sequence(lambda n: f'user{n}@test.com')
    name = factory.Sequence(lambda n: f'Test User {n}')
    default_currency_code = 'USD'
    has_completed_onboarding = True
    is_demo_user = False

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop('password_plain', 'testpassword')
        obj = model_class(*args, **kwargs)
        obj.set_password(password)
        db.session.add(obj)
        db.session.commit()
        return obj


class CategoryFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Category
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Category {n}')
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)


class AccountFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Account
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Account {n}')
    type = 'checking'
    balance = 1000.0
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    currency_code = 'USD'


class ExpenseFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Expense
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    description = factory.Sequence(lambda n: f'Expense {n}')
    amount = 50.0
    date = factory.LazyFunction(datetime.utcnow)
    card_used = 'Test Card'
    split_method = 'none'
    paid_by = factory.LazyAttribute(lambda o: o.user_id)
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    transaction_type = 'expense'
    currency_code = 'USD'


class BudgetFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Budget
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Budget {n}')
    amount = 500.0
    period = 'monthly'
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    category_id = factory.LazyAttribute(lambda o: CategoryFactory().id)
    active = True
    is_recurring = True


class UserModuleAccessFactory(SQLAlchemyModelFactory):
    class Meta:
        model = UserModuleAccess
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    module_name = 'pointspal'
    enabled = True
    granted_by = 'manual'
