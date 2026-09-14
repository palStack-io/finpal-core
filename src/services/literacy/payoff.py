"""The payoff line: what an act just revealed, in the user's own figures.

*** THE COIN AWARD IS THE LESSON. *** Not `+50 coins`, but

    finPal now knows that card is 19.99%. It is costing you $13.33 a month, so
    of your $35.00 minimum only $21.67 comes off the balance.

Three properties, each load-bearing:

1. **It is their money, not an example.** A lesson about APR is a concept; your
   card costing you $13.33 a month is a fact you cannot unlearn.
2. **It lands at the moment of maximum relevance** -- they typed the number ten
   seconds ago.
3. *** IT NEVER BLUFFS. *** No computable consequence, **no sentence**. The same
   fail-closed rule `check_reason` follows when it returns `None` rather than a
   plausible line about a condition nobody tested.

`check_reason` says what an act WANTS. These say what it REVEALED. Same shape,
opposite direction, and keeping them as mirrors means adding an act without a
payoff line is a visible omission rather than a silent one.

*** CURRENCY IS NOT FORMATTED HERE. *** The server does not know the user's
symbol placement conventions and the clients already format money. These return
plain figures; the client renders them. Doing otherwise is D-101's shape -- two
places computing one presentation.
"""

from decimal import Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.transaction import Expense


def _q(value):
    """Two decimal places, as money."""
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def bank_connected(user_id):
    live = Account.query.filter(
        Account.user_id == user_id, Account.import_source.isnot(None)).count()
    if not live:
        return None
    return (f'{live} of your accounts now update themselves. Every balance on '
            'your range is today’s, not the one you last remembered to type.')


def transactions_categorised(user_id):
    rows = db.session.query(
        Category.name, func.coalesce(func.sum(func.abs(Expense.amount)), 0)
    ).join(Category, Category.id == Expense.category_id).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
    ).group_by(Category.name).order_by(
        func.sum(func.abs(Expense.amount)).desc()).first()
    if rows is None:
        return None
    name, amount = rows
    total = db.session.query(
        func.coalesce(func.sum(func.abs(Expense.amount)), 0)).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense').scalar()
    if not total:
        return None
    share = (Decimal(str(amount)) / Decimal(str(total)) * 100).quantize(Decimal('1'))
    return (f'Your biggest line is {name} at {_q(amount)} — {share}% of '
            'everything that went out.')


def categories_classified(user_id):
    """What is actually yours to move this month, as opposed to what simply arrives."""
    totals = {}
    rows = db.session.query(
        Category.spending_type, func.coalesce(func.sum(func.abs(Expense.amount)), 0)
    ).join(Category, Category.id == Expense.category_id).filter(
        Expense.user_id == user_id,
        Expense.transaction_type == 'expense',
        Category.kind.isnot(None) | Category.kind.is_(None),
    ).group_by(Category.spending_type).all()
    for spending_type, amount in rows:
        totals[spending_type] = Decimal(str(amount or 0))
    fixed = totals.get('fixed')
    flexible = totals.get('flexible')
    if fixed is None and flexible is None:
        return None
    return (f'{_q(fixed or 0)} of your spending arrives whatever you do. '
            f'{_q(flexible or 0)} is the part that is actually yours to move.')


def has_a_budget(user_id):
    return ('Your budgets now cover the part of your spending that can '
            'actually move. The rest was never yours to cut.')


def accounts_confirmed(user_id):
    inferred = Account.query.filter(
        Account.user_id == user_id, Account.type_source == 'inferred').count()
    if inferred:
        return None      # not finished; nothing true to say yet
    total = Account.query.filter_by(user_id=user_id).count()
    if not total:
        return None
    return (f'All {total} of your accounts are the type you say they are. Your '
            'net worth and your debt figures are both built on that.')


def income_recorded(user_id):
    return ('finPal now knows what arrives. Everything else it shows you is '
            'measured against it.')


def taught_a_rule(user_id):
    return ('finPal will sort that one for you from now on, before you ever '
            'see it.')


def has_a_goal(user_id):
    return None      # the goal's own peak is the payoff; a sentence would repeat it
