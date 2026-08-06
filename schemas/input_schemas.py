"""Marshmallow schemas for request body validation (load-only).

These schemas validate incoming API request data before it reaches
business logic or the database. They are separate from the output
serialization schemas in __init__.py.
"""
from marshmallow import Schema, fields, validate

TRANSACTION_TYPES = ['expense', 'income', 'transfer']
SPLIT_METHODS = ['equal', 'custom', 'percentage', 'shares']
BUDGET_PERIODS = ['monthly', 'weekly', 'yearly']
RECURRING_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'cash', 'other']


class LoginInput(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=1))


class RegisterInput(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))


class TransactionInput(Schema):
    description = fields.Str(required=True, validate=validate.Length(min=1, max=500))
    amount = fields.Float(required=True, validate=validate.Range(min=0))
    date = fields.Str(required=True, validate=validate.Length(min=1))
    transaction_type = fields.Str(validate=validate.OneOf(TRANSACTION_TYPES))
    currency_code = fields.Str(validate=validate.Length(equal=3))
    category_id = fields.Int(allow_none=True)
    account_id = fields.Int(allow_none=True)
    notes = fields.Str(validate=validate.Length(max=2000))
    card_used = fields.Str(validate=validate.Length(max=100))
    split_method = fields.Str(validate=validate.OneOf(SPLIT_METHODS))
    split_with = fields.Str(validate=validate.Length(max=500))
    paid_by = fields.Str(validate=validate.Length(max=255))
    # `Expense.group_id` is a real, nullable FK to groups.id, but this schema
    # omitted it and `validate_request` loads with `unknown=EXCLUDE`, so a create
    # carrying group_id got a 201 with the group silently stripped. web-ui posts
    # exactly that when recording a settlement (GroupDetail.tsx:108), so every
    # settlement was filed as an ungrouped personal expense and never showed up
    # in the group it was settling. Asserted against the database row in
    # tests/integration/test_route_shadowing.py.
    group_id = fields.Int(allow_none=True)
    # Where a transfer's money goes. A real column with an `incoming_transfers`
    # backref, and the entire point of a transfer, but it was missing here — so a
    # transfer got a 201 and recorded no destination, which also made the transfer
    # branch of the balance arithmetic unreachable. Ownership and
    # source-must-differ are checked in `build_transaction`, since a raw foreign
    # key from a client cannot be trusted by shape alone.
    destination_account_id = fields.Int(allow_none=True)
    # The payer's share of a non-equal split: a percentage when
    # split_method='percentage', an absolute amount when 'custom'. The column's
    # "deprecated" comment is wrong — `Expense.calculate_splits` reads it in both
    # branches, falling back to 0, so dropping it did not omit a field, it
    # mis-divided the money and attributed the payer nothing. The valid range
    # depends on the split method, so it is checked in `build_transaction`.
    split_value = fields.Float(allow_none=True)
    # One transaction attributed across several categories: {category_id: amount},
    # which is the shape `AddTransactionForm` sends. The legacy service read a
    # different one — `category_splits_data`, a JSON *string* holding a *list* —
    # which no client has ever sent. Amounts, ownership and the total are checked in
    # `build_transaction`; `has_category_splits` is deliberately *not* accepted here,
    # because it is derived from whether splits are present rather than trusted.
    category_splits = fields.Dict(
        keys=fields.Str(), values=fields.Float(), allow_none=True)


class AccountInput(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    account_type = fields.Str(required=True, validate=validate.OneOf(ACCOUNT_TYPES))
    balance = fields.Float()
    currency_code = fields.Str(validate=validate.Length(equal=3))
    institution = fields.Str(validate=validate.Length(max=100))
    color = fields.Str(validate=validate.Length(max=20))
    status = fields.Str(validate=validate.OneOf(['active', 'inactive', 'closed']))
    # The household member this account is assigned to. Optional, and it must stay
    # optional: omitting it assigns the account to the caller, and the documentation
    # gate proves a field swagger calls required is one the server really refuses
    # without. Membership is checked in AccountService, not here — marshmallow cannot
    # see the database, and a demo account is a valid id that must still be refused.
    owner_id = fields.Str(validate=validate.Length(min=1, max=120))


class BudgetInput(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    amount = fields.Float(required=True, validate=validate.Range(min=0))
    period = fields.Str(required=True, validate=validate.OneOf(BUDGET_PERIODS))
    category_id = fields.Int(allow_none=True)
    start_date = fields.Str()
    is_active = fields.Bool()
    rollover = fields.Bool()
    include_subcategories = fields.Bool()
    transaction_types = fields.Str()


class CategoryInput(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    icon = fields.Str(validate=validate.Length(max=50))
    color = fields.Str(validate=validate.Length(max=20))
    parent_id = fields.Int(allow_none=True)


class RecurringInput(Schema):
    description = fields.Str(required=True, validate=validate.Length(min=1, max=500))
    amount = fields.Float(required=True, validate=validate.Range(min=0))
    frequency = fields.Str(required=True, validate=validate.OneOf(RECURRING_FREQUENCIES))
    start_date = fields.Str()
    end_date = fields.Str(allow_none=True)
    transaction_type = fields.Str(validate=validate.OneOf(TRANSACTION_TYPES))
    category_id = fields.Int(allow_none=True)
    account_id = fields.Int(allow_none=True)
    destination_account_id = fields.Int(allow_none=True)
    currency_code = fields.Str(validate=validate.Length(equal=3))
    notes = fields.Str(validate=validate.Length(max=2000))


login_input = LoginInput()
register_input = RegisterInput()
transaction_input = TransactionInput()
account_input = AccountInput()
budget_input = BudgetInput()
category_input = CategoryInput()
recurring_input = RecurringInput()
