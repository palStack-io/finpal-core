"""Marshmallow schemas for request body validation (load-only).

These schemas validate incoming API request data before it reaches
business logic or the database. They are separate from the output
serialization schemas in __init__.py.
"""
from marshmallow import Schema, fields, validate

TRANSACTION_TYPES = ['expense', 'income', 'transfer']
# Only what `Expense.calculate_splits` actually computes. `shares` was here until D-99 and had
# no branch in the arithmetic, so an expense created with it split to **nobody** — payer 0, others
# empty, total 0.00 — and vanished from every settle-up. D-93 removed it from web-ui and called
# itself web-only; this list is why that was wrong, since the API kept accepting it from scripts,
# tokens and any future mobile build. A method the server cannot honour must be refused here, not
# merely hidden in a dropdown.
SPLIT_METHODS = ['equal', 'custom', 'percentage']
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
    # 200, not 500: `Expense.description` is `db.String(200)`. A validator looser than
    # its column refuses nothing — it just turns marshmallow's clean 400 into
    # Postgres's StringDataRightTruncation 500. See
    # tests/unit/test_validators_fit_their_columns.py and #123.
    description = fields.Str(required=True, validate=validate.Length(min=1, max=200))
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
    # 120 = `User.id`, which is what this holds — `validate_paid_by` refuses anything
    # that is not a real user. The OTHER side was the wrong one here: `Expense.paid_by`
    # was `db.String(50)`, too narrow for an email, so a user whose address exceeded 50
    # characters could not be recorded as the payer at all. Widened to 120 with a
    # migration rather than tightened to 50, because tightening would have refused a
    # legitimate payer with a length error on a field the user never typed — the exact
    # confusion `validate_paid_by`'s own comment records.
    paid_by = fields.Str(validate=validate.Length(max=120))
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
    # 7, matching `Account.color` = `db.String(7)` ("Hex color code"). This said 20,
    # and the web-ui was posting CSS variable references into it — `var(--accent-blue)`
    # is 18 characters, `var(--brand-green-glow)` is 23. So savings and the Green swatch
    # were refused here with a length error (a 400 with nothing in the backend log,
    # because marshmallow rejects before the handler), while checking, credit and cash
    # passed this ceiling and then overran the 7-char column. Only `investment`, whose
    # default was already a hex literal, could be created at all. #123.
    color = fields.Str(validate=validate.Length(max=7))
    status = fields.Str(validate=validate.OneOf(['active', 'inactive', 'closed']))
    # The household member this account is assigned to. Optional, and it must stay
    # optional: omitting it assigns the account to the caller, and the documentation
    # gate proves a field swagger calls required is one the server really refuses
    # without. Membership is checked in AccountService, not here — marshmallow cannot
    # see the database, and a demo account is a valid id that must still be refused.
    owner_id = fields.Str(validate=validate.Length(min=1, max=120))
    # Assigned by `AccountDetail.put` and previously absent from this schema. That was
    # harmless only while the PUT ran no validation at all; once it does, `unknown=EXCLUDE`
    # would have dropped it and the handler would have silently stopped applying it --
    # turning a missing guard into a dropped field, which is #129's exact class. 200 is
    # `Account.external_id = db.String(200)`.
    external_id = fields.Str(allow_none=True, validate=validate.Length(max=200))
    # #129. `Account.description` is `db.Text`, so the ceiling here is a sanity bound on
    # request size rather than a column width -- but it must EXIST, because a field with
    # no declared limit is how an unbounded body reaches the database.
    description = fields.Str(allow_none=True, validate=validate.Length(max=2000))
    # B1. `fields.Decimal`, not `fields.Float`: this is the input side of a
    # `Numeric(5,2)` column that gets multiplied into money, and a float turns
    # 19.99 into 19.989999999999998 before SQLAlchemy ever sees it (D-58).
    #
    # `allow_none` on all three so a value can be CLEARED, not only set --
    # `update_recurring`'s `value is not None` guard is the cautionary sibling,
    # where a field becomes un-emptiable once written (#129's shape).
    #
    # The Range ceilings follow the columns: Numeric(18,2) and Numeric(5,2). A
    # validator looser than its column does not reject anything, it just moves the
    # failure from a clean 400 to Postgres's NumericValueOutOfRange (#123).
    credit_limit = fields.Decimal(allow_none=True, places=2,
                                  validate=validate.Range(min=0))
    apr = fields.Decimal(allow_none=True, places=2,
                         validate=validate.Range(min=0, max=999.99))
    min_payment = fields.Decimal(allow_none=True, places=2,
                                 validate=validate.Range(min=0))


GOAL_KINDS = ['payoff', 'savings', 'custom']
GOAL_SCOPES = ['personal', 'household']
GOAL_STATUSES = ['active', 'achieved', 'archived']


class GoalInput(Schema):
    # 120, matching `Goal.name` = `db.String(120)`. A validator looser than its
    # column moves a clean 400 to a Postgres truncation error (#123).
    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    kind = fields.Str(validate=validate.OneOf(GOAL_KINDS))
    scope = fields.Str(validate=validate.OneOf(GOAL_SCOPES))
    # NULL = a manual goal. Ownership of the named account is checked in the
    # handler: marshmallow cannot see the database, and a raw foreign key from a
    # client cannot be trusted by shape alone.
    account_id = fields.Int(allow_none=True)
    target_amount = fields.Decimal(required=True, places=2)
    # DELIBERATELY NOT ACCEPTED FROM A CLIENT on create: `start_amount` is
    # snapshotted from `account.balance` by the server, and letting a client name it
    # would make every linked goal's denominator a typed number -- which is the one
    # thing linking exists to prevent. Only a MANUAL goal may state one, handled in
    # the handler rather than here so the rule can see `account_id`.
    start_amount = fields.Decimal(allow_none=True, places=2)
    current_manual = fields.Decimal(allow_none=True, places=2)
    currency_code = fields.Str(validate=validate.Length(equal=3))
    start_date = fields.Str(validate=validate.Length(min=1))
    target_date = fields.Str(allow_none=True)
    # `achieved` is NOT settable by a client -- it is stamped by the server when
    # progress reaches 1, and a client that could write it could award itself a
    # badge. Only the archive transition is offered, and it has its own route.
    status = fields.Str(validate=validate.OneOf(['active', 'archived']))


class BudgetInput(Schema):
    # D-78: OPTIONAL, and the ceiling only. `Budget.name` is `VARCHAR(100)` NULLABLE, and
    # the web form has no name input at all -- `BudgetsMinimal.tsx:260` posts `name: ''`,
    # which a `min=1` rejected, so NO user could create a budget from the browser. Same
    # principle as `category_id` below and the opposite conclusion, because the columns
    # differ: the API follows the database. Do not restore a minimum length; do not
    # generate a name from the category either, which invents data the user never typed.
    name = fields.Str(required=False, allow_none=True, validate=validate.Length(max=100))
    amount = fields.Float(required=True, validate=validate.Range(min=0))
    period = fields.Str(required=True, validate=validate.OneOf(BUDGET_PERIODS))
    # D-74: `Budget.category_id` is `nullable=False` with no default, so declaring
    # this optional produced an IntegrityError surfaced as an opaque
    # 400 "Error adding budget". Owner decision 2026-08-10: the API follows the
    # database. Every client already requires a category.
    category_id = fields.Int(required=True)
    start_date = fields.Str()
    is_active = fields.Bool()
    rollover = fields.Bool()
    include_subcategories = fields.Bool()
    transaction_types = fields.Str()


class CategoryInput(Schema):
    # 50, matching `Category.name` = `db.String(50)`. A 51–100 character category name
    # passed this validator and then failed at the column. #123's shape again.
    name = fields.Str(required=True, validate=validate.Length(min=1, max=50))
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
goal_input = GoalInput()
budget_input = BudgetInput()
category_input = CategoryInput()
recurring_input = RecurringInput()
