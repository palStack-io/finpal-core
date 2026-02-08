"""Marshmallow schemas for serialization"""
from marshmallow import Schema, fields, validate, post_load


class UserSchema(Schema):
    """User serialization schema"""
    id = fields.Str(dump_only=True)
    username = fields.Str(required=True)
    email = fields.Email(required=True)
    default_currency_code = fields.Str()
    created_at = fields.DateTime(dump_only=True)


class TransactionSchema(Schema):
    """Transaction serialization schema"""
    id = fields.Int(dump_only=True)
    description = fields.Str(required=True)
    amount = fields.Float(required=True)
    date = fields.DateTime(required=True)
    currency_code = fields.Str()
    card_used = fields.Str()
    split_method = fields.Str()
    split_with = fields.Str()
    paid_by = fields.Str()
    user_id = fields.Str(dump_only=True)
    category_id = fields.Int(allow_none=True)
    account_id = fields.Int(allow_none=True)
    recurring_id = fields.Int(allow_none=True)
    transaction_type = fields.Str(allow_none=True)
    notes = fields.Str(allow_none=True)
    created_at = fields.DateTime(dump_only=True)

    # Nested relationships
    category = fields.Nested('CategorySchema', dump_only=True)
    account = fields.Nested('AccountSchema', dump_only=True)
    splits = fields.Method('get_splits', dump_only=True)

    def get_splits(self, obj):
        """Calculate and return split information"""
        return obj.calculate_splits() if hasattr(obj, 'calculate_splits') else None


class CategorySchema(Schema):
    """Category serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    icon = fields.Str()
    color = fields.Str()
    parent_id = fields.Int(allow_none=True)
    is_system = fields.Bool(dump_only=True)
    user_id = fields.Str(dump_only=True)

    # Nested subcategories
    subcategories = fields.Nested('self', many=True, dump_only=True)


class AccountSchema(Schema):
    """Account serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    account_type = fields.Str(required=True)
    balance = fields.Float()
    currency_code = fields.Str()
    institution = fields.Str()
    account_number = fields.Str()
    is_active = fields.Bool()
    color = fields.Str()
    user_id = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)

    # Calculated balance
    current_balance = fields.Method('get_current_balance', dump_only=True)

    def get_current_balance(self, obj):
        """Get calculated balance from transactions"""
        return obj.get_balance() if hasattr(obj, 'get_balance') else obj.balance


class BudgetSchema(Schema):
    """Budget serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    amount = fields.Float(required=True)
    period = fields.Str(required=True, validate=validate.OneOf(['monthly', 'weekly', 'yearly']))
    category_id = fields.Int(allow_none=True)
    user_id = fields.Str(dump_only=True)
    start_date = fields.Date()
    end_date = fields.Date(allow_none=True)
    is_active = fields.Bool()
    created_at = fields.DateTime(dump_only=True)

    # Nested category
    category = fields.Nested(CategorySchema, dump_only=True)

    # Progress calculation
    spent = fields.Method('get_spent', dump_only=True)
    remaining = fields.Method('get_remaining', dump_only=True)
    percentage = fields.Method('get_percentage', dump_only=True)

    def get_spent(self, obj):
        """Calculate spent amount"""
        return obj.get_spent() if hasattr(obj, 'get_spent') else 0

    def get_remaining(self, obj):
        """Calculate remaining amount"""
        return obj.get_remaining() if hasattr(obj, 'get_remaining') else obj.amount

    def get_percentage(self, obj):
        """Calculate percentage used"""
        return obj.get_percentage() if hasattr(obj, 'get_percentage') else 0


class GroupSchema(Schema):
    """Group serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    description = fields.Str()
    created_by = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)

    # Members list
    members = fields.Nested(UserSchema, many=True, dump_only=True)
    member_count = fields.Method('get_member_count', dump_only=True)

    def get_member_count(self, obj):
        """Get number of members"""
        return len(obj.members) if hasattr(obj, 'members') else 0


class RecurringTransactionSchema(Schema):
    """Recurring transaction serialization schema"""
    id = fields.Int(dump_only=True)
    description = fields.Str(required=True)
    amount = fields.Float(required=True)
    frequency = fields.Str(required=True, validate=validate.OneOf(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']))
    start_date = fields.DateTime(allow_none=True)
    end_date = fields.DateTime(allow_none=True)
    last_created = fields.DateTime(allow_none=True)
    active = fields.Bool()
    category_id = fields.Int(allow_none=True)
    account_id = fields.Int(allow_none=True)
    transaction_type = fields.Str(allow_none=True)
    destination_account_id = fields.Int(allow_none=True)
    card_used = fields.Str(allow_none=True)
    split_method = fields.Str(allow_none=True)
    paid_by = fields.Str(allow_none=True)
    user_id = fields.Str(dump_only=True)
    currency_code = fields.Str(allow_none=True)
    original_amount = fields.Float(allow_none=True)

    # Nested relationships
    category = fields.Nested(CategorySchema, dump_only=True)
    account = fields.Nested(AccountSchema, dump_only=True)


class CurrencySchema(Schema):
    """Currency serialization schema"""
    id = fields.Int(dump_only=True)
    code = fields.Str(required=True)
    name = fields.Str(required=True)
    symbol = fields.Str(required=True)
    exchange_rate = fields.Float()
    is_base = fields.Bool()
    last_updated = fields.DateTime()


class TagSchema(Schema):
    """Tag serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    color = fields.Str()
    user_id = fields.Str(dump_only=True)


class PortfolioSchema(Schema):
    """Portfolio serialization schema"""
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True)
    description = fields.Str(allow_none=True)
    user_id = fields.Str(dump_only=True)
    account_id = fields.Int(allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

    # Nested relationships
    account = fields.Nested(AccountSchema, dump_only=True)
    investments = fields.Nested('InvestmentSchema', many=True, dump_only=True)

    # Calculated values
    total_value = fields.Method('get_total_value', dump_only=True)
    total_cost = fields.Method('get_total_cost', dump_only=True)
    gain_loss = fields.Method('get_gain_loss', dump_only=True)
    gain_loss_percentage = fields.Method('get_gain_loss_percentage', dump_only=True)

    def get_total_value(self, obj):
        return obj.calculate_total_value() if hasattr(obj, 'calculate_total_value') else 0

    def get_total_cost(self, obj):
        return obj.calculate_total_cost() if hasattr(obj, 'calculate_total_cost') else 0

    def get_gain_loss(self, obj):
        return obj.calculate_gain_loss() if hasattr(obj, 'calculate_gain_loss') else 0

    def get_gain_loss_percentage(self, obj):
        return obj.calculate_gain_loss_percentage() if hasattr(obj, 'calculate_gain_loss_percentage') else 0


class InvestmentSchema(Schema):
    """Investment serialization schema"""
    id = fields.Int(dump_only=True)
    portfolio_id = fields.Int(required=True)
    symbol = fields.Str(required=True)
    name = fields.Str(allow_none=True)
    shares = fields.Float(required=True)
    purchase_price = fields.Float(required=True)
    current_price = fields.Float()
    purchase_date = fields.DateTime()
    last_update = fields.DateTime()
    notes = fields.Str(allow_none=True)
    sector = fields.Str(allow_none=True)
    industry = fields.Str(allow_none=True)

    # Nested relationships
    portfolio = fields.Nested(PortfolioSchema, dump_only=True, exclude=['investments'])
    transactions = fields.Nested('InvestmentTransactionSchema', many=True, dump_only=True)

    # Calculated properties
    cost_basis = fields.Method('get_cost_basis', dump_only=True)
    current_value = fields.Method('get_current_value', dump_only=True)
    gain_loss = fields.Method('get_gain_loss', dump_only=True)
    gain_loss_percentage = fields.Method('get_gain_loss_percentage', dump_only=True)

    def get_cost_basis(self, obj):
        return obj.cost_basis if hasattr(obj, 'cost_basis') else 0

    def get_current_value(self, obj):
        return obj.current_value if hasattr(obj, 'current_value') else 0

    def get_gain_loss(self, obj):
        return obj.gain_loss if hasattr(obj, 'gain_loss') else 0

    def get_gain_loss_percentage(self, obj):
        return obj.gain_loss_percentage if hasattr(obj, 'gain_loss_percentage') else 0


class InvestmentTransactionSchema(Schema):
    """Investment transaction serialization schema"""
    id = fields.Int(dump_only=True)
    investment_id = fields.Int(required=True)
    transaction_type = fields.Str(required=True, validate=validate.OneOf(['buy', 'sell', 'dividend', 'split']))
    shares = fields.Float(required=True)
    price = fields.Float(required=True)
    date = fields.DateTime()
    fees = fields.Float()
    notes = fields.Str(allow_none=True)

    # Calculated
    transaction_value = fields.Method('get_transaction_value', dump_only=True)

    def get_transaction_value(self, obj):
        return obj.transaction_value if hasattr(obj, 'transaction_value') else 0


# Initialize schema instances for use in API endpoints
user_schema = UserSchema()
users_schema = UserSchema(many=True)

transaction_schema = TransactionSchema()
transactions_schema = TransactionSchema(many=True)

category_schema = CategorySchema()
categories_schema = CategorySchema(many=True)

account_schema = AccountSchema()
accounts_schema = AccountSchema(many=True)

budget_schema = BudgetSchema()
budgets_schema = BudgetSchema(many=True)

group_schema = GroupSchema()
groups_schema = GroupSchema(many=True)

recurring_schema = RecurringTransactionSchema()
recurrings_schema = RecurringTransactionSchema(many=True)

currency_schema = CurrencySchema()
currencies_schema = CurrencySchema(many=True)

tag_schema = TagSchema()
tags_schema = TagSchema(many=True)

portfolio_schema = PortfolioSchema()
portfolios_schema = PortfolioSchema(many=True)

investment_schema = InvestmentSchema()
investments_schema = InvestmentSchema(many=True)

investment_transaction_schema = InvestmentTransactionSchema()
investment_transactions_schema = InvestmentTransactionSchema(many=True)
