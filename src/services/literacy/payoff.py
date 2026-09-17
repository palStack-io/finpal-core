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

*** CURRENCY IS FORMATTED HERE, AND THE FIRST VERSION OF THIS COMMENT ARGUED
THE OPPOSITE. *** It said the clients format money and these should return plain
figures. Reading the real payload disproved it: the money is EMBEDDED IN A
SENTENCE, so a client cannot format it without parsing prose back apart. The
sentence is composed on the server, therefore so is its money.

`src/utils/money.py::format_money` is the same function the rest of the server
uses, taking the user's own `default_currency_code`, so this introduces no
second formatter -- which is what D-101 actually warns about.
"""

from decimal import Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.investment import Investment, Portfolio
from src.models.transaction import Expense


ZERO_MONEY = Decimal('0')


def _currency_for(user_id):
    """The user's own currency code, or USD if they have never set one.

    *** A WRONG UNIT ON A REAL FIGURE IS WORSE THAN NO FIGURE, *** so an unknown
    code is not guessed at: `format_money` raises on one, and `_money` below
    turns that into `None` — no sentence rather than a sentence in the wrong
    currency.
    """
    from src.models.user import User
    user = db.session.get(User, user_id)
    return (user and user.default_currency_code) or 'USD'


def _money(value, currency):
    """Formatted money, or `None` if it cannot be formatted honestly."""
    from src.utils.money import format_money
    try:
        return format_money(Decimal(str(value or 0)).quantize(Decimal('0.01')),
                            currency)
    except Exception:
        return None


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
    return (f'Your biggest line is {name} at '
            f'{_money(amount, _currency_for(user_id))} — {share}% of '
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
    currency = _currency_for(user_id)
    return (f'{_money(fixed or 0, currency)} of your spending arrives whatever '
            f'you do. {_money(flexible or 0, currency)} is the part that is '
            'actually yours to move.')


def has_a_budget(user_id):
    """*** RETURNS NOTHING UNLESS THERE IS ACTUALLY A BUDGET. ***

    This returned its sentence unconditionally until the real payload was read
    back, which showed `coins: 0` beside *"Your budgets now cover..."* — the act
    had earned nothing and the copy claimed it was done. That is precisely the
    bluffing this module's header says it never does, and no test caught it
    because every test asserted the sentence's CONTENT rather than whether it
    should exist at all.
    """
    from src.models.budget import Budget
    if Budget.query.filter(Budget.user_id == user_id,
                           Budget.active.is_(True)).first() is None:
        return None
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
    """Nothing unless a recurring income row actually exists. See `has_a_budget`."""
    from src.models.recurring import RecurringExpense
    row = db.session.query(RecurringExpense.amount).filter(
        RecurringExpense.user_id == user_id,
        RecurringExpense.active.is_(True),
        RecurringExpense.transaction_type == 'income',
    ).first()
    if row is None:
        return None
    amount = _money(row[0], _currency_for(user_id))
    if amount is None:
        return ('finPal now knows what arrives. Everything else it shows you '
                'is measured against it.')
    return (f'finPal now knows {amount} arrives. Everything else it shows you '
            'is measured against it.')


def taught_a_rule(user_id):
    """Nothing unless a rule actually exists. See `has_a_budget`."""
    from src.models.transaction_rule import TransactionRule
    count = db.session.query(func.count(TransactionRule.id)).filter(
        TransactionRule.user_id == user_id,
        TransactionRule.active.is_(True),
    ).scalar() or 0
    if not count:
        return None
    noun = 'rule' if count == 1 else 'rules'
    return (f'finPal has {count} {noun} of yours now, and applies them before '
            'you ever see the transaction.')


def has_a_goal(user_id):
    """What naming a goal made computable: its size, and what is left.

    *** THIS RETURNED `None` DELIBERATELY AND THE REASONING WENT STALE. *** The
    old comment read *"the goal's own peak is the payoff; a sentence would
    repeat it"*, which is true on the Goals PAGE, where the peak is on screen
    beside the words. It stopped being true when the award moment shipped: the
    award is shown wherever the user happens to be, and `CoinAward` renders
    NOTHING when `revealed` is null — by design, because a sentence finPal
    cannot justify is worse than silence. So `has_a_goal` paid 600 coins and
    produced no feedback at all, on any surface.

    *** IT DOES NOT REPEAT THE PEAK; IT NAMES WHAT BECAME COMPUTABLE. *** Before
    a goal exists there is no target, no remaining figure and no peak to draw.
    That is the truth test's second limb — a figure finPal could not compute
    before.

    Fail-closed like the rest: no goal, or no usable target, no sentence.
    """
    from src.models.goal import Goal

    goals = Goal.query.filter_by(user_id=user_id).order_by(
        Goal.created_at.desc()).all()
    if not goals:
        return None

    currency = _currency_for(user_id)
    named = goals[0]
    try:
        target = Decimal(str(named.target_amount or 0))
        start = Decimal(str(named.start_amount or 0))
    except Exception:
        return None
    if target <= 0:
        return None

    remaining = max(Decimal(0), target - start)
    n = len(goals)

    if remaining <= 0:
        return (f'“{named.name}” is drawn on your range at '
                f'{_money(target, currency)}, and it is already covered.')

    if n == 1:
        return (f'“{named.name}” is now drawn at the size of what it asks: '
                f'{_money(remaining, currency)} still to find. finPal could '
                f'not put a figure on that before you named it.')
    return (f'“{named.name}” joins {n - 1} other '
            f'{"goal" if n == 2 else "goals"} on your range, at '
            f'{_money(remaining, currency)} still to find.')


def debt_rates(user_id):
    """*** THE WORKED CASE FROM THE SPEC, AND THE STRONGEST LINE IN THE PRODUCT. ***

    A card at 19.99% owing 800.00 with a 35.00 minimum: 13.33 a month is
    interest, so only 21.67 of the payment comes off the balance. That ratio is
    the number worth carrying around, and it is not a judgement about anybody --
    it is the same arithmetic for everyone at that rate.

    Returns `None` unless every figure it needs is present. **No computable
    consequence, no sentence.**
    """
    card = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(('credit', 'loan')),
        Account.apr.isnot(None),
    ).order_by(Account.balance.asc()).first()
    if card is None:
        return None
    balance = Decimal(str(card.balance or 0))
    if balance >= 0:
        return None                      # nothing owed: no cost to describe
    owed = -balance
    apr = Decimal(str(card.apr))
    monthly = (owed * apr / Decimal('100') / Decimal('12'))
    if monthly <= 0:
        return None

    currency = _currency_for(user_id)
    monthly_s = _money(monthly, currency)
    if monthly_s is None:
        return None
    line = f'{card.name} is at {apr}%, which costs you {monthly_s} a month.'
    minimum = card.min_payment and Decimal(str(card.min_payment))
    if not minimum or minimum <= monthly:
        return line
    principal = minimum - monthly
    share = (monthly / minimum * 100).quantize(Decimal('1'))
    return (f'{line} Of your {_money(minimum, currency)} minimum only '
            f'{_money(principal, currency)} comes off the balance — {share}% of '
            'what you pay is rent on the debt.')


def debt_limits(user_id):
    cards = Account.query.filter(
        Account.user_id == user_id, Account.type == 'credit',
        Account.credit_limit.isnot(None)).all()
    limit = sum(Decimal(str(c.credit_limit or 0)) for c in cards)
    if limit <= 0:
        return None
    used = sum(max(ZERO_MONEY, -Decimal(str(c.balance or 0))) for c in cards)
    currency = _currency_for(user_id)
    pct = (used / limit * 100).quantize(Decimal('1'))
    return (f'You are using {_money(used, currency)} of '
            f'{_money(limit, currency)} — {pct}%. Under 30% is where it stops '
            'counting against you.')


def debt_minimums(user_id):
    """How long the card takes at the minimum — the figure nobody is ever shown.

    *** IT NEEDS BOTH A RATE AND A MINIMUM, AND SAYS NOTHING WITHOUT EITHER. ***
    A fourth bluffing payoff was found here by the parametrised no-bluff test:
    this returned its sentence to a user with no cards at all.

    *** AND THE HONEST ANSWER IS SOMETIMES "NEVER". *** If the minimum does not
    exceed the monthly interest the balance never falls, and saying so plainly
    is far more use than a number. That is not a judgement about the user —
    voice rule 11 — it is arithmetic about the product they were sold.
    """
    import math

    card = Account.query.filter(
        Account.user_id == user_id,
        Account.type == 'credit',
        Account.apr.isnot(None),
        Account.min_payment.isnot(None),
    ).order_by(Account.balance.asc()).first()
    if card is None:
        return None
    balance = Decimal(str(card.balance or 0))
    if balance >= 0:
        return None
    owed = -balance
    rate = Decimal(str(card.apr)) / Decimal('100') / Decimal('12')
    payment = Decimal(str(card.min_payment))
    interest = owed * rate

    currency = _currency_for(user_id)
    payment_s = _money(payment, currency)
    if payment_s is None:
        return None

    if payment <= interest:
        return (f'At {payment_s} a month this card never clears — the interest '
                f'alone is {_money(interest, currency)}. That is the product, '
                'not you.')

    # Standard amortisation. `rate == 0` would divide by zero, and a 0% card is
    # a real thing, so it is handled as plain division.
    if rate == 0:
        months = int(math.ceil(float(owed / payment)))
    else:
        months = int(math.ceil(
            -math.log(1 - float(owed * rate / payment)) / math.log(1 + float(rate))))
    years, rem = divmod(months, 12)
    if years and rem:
        span = f'{years} year{"s" if years > 1 else ""} and {rem} month{"s" if rem > 1 else ""}'
    elif years:
        span = f'{years} year{"s" if years > 1 else ""}'
    else:
        span = f'{months} month{"s" if months > 1 else ""}'
    return (f'Paying {payment_s} a month, this card takes {span} to clear — '
            'which is usually longer than it feels.')


def transfers_confirmed(user_id):
    """*** A TRANSFER COUNTED AS INCOME INFLATES WHAT finPal THINKS YOU EARN. ***"""
    rows = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.transfer_group_id.isnot(None),
        Expense.type_source == 'user',
    ).all()
    if not rows:
        return None
    total = sum(abs(Decimal(str(r.amount or 0))) for r in rows)
    return (f'{_money(total, _currency_for(user_id))} that looked like income '
            'is money you moved between your own accounts. Your income figure '
            'is the real one now.')


def holdings_priced(user_id):
    """What recording the price revealed: the real gain, not the market value.

    *** FAIL-CLOSED. *** No priced holding, or no current price to compare
    against, and there is no sentence -- the same rule `check_reason` follows.
    """
    rows = Investment.query.join(
        Portfolio, Portfolio.id == Investment.portfolio_id).filter(
            Portfolio.user_id == user_id).all()
    priced = [h for h in rows
              if h.purchase_price and h.purchase_price > 0 and h.current_price]
    if not priced:
        return None

    cost = sum(Decimal(str(h.shares)) * Decimal(str(h.purchase_price))
               for h in priced)
    value = sum(Decimal(str(h.shares)) * Decimal(str(h.current_price))
                for h in priced)
    if cost <= 0:
        return None

    currency = _currency_for(user_id)
    gain = value - cost
    verb = 'up' if gain >= 0 else 'down'
    return (f'You paid {_money(cost, currency)} for those holdings and they '
            f'are worth {_money(value, currency)} — {verb} '
            f'{_money(abs(gain), currency)}. Before you recorded the price, '
            f'finPal counted the whole {_money(value, currency)} as gain.')


def splits_confirmed(user_id):
    """What confirming the splits fixed: your own share of the bill.

    *** FAIL-CLOSED. *** Nothing confirmed, nothing to say.
    """
    from src.services.literacy.coverage import _shared_expenses_for
    from src.repositories.act_events import ActEventRepository

    mine = _shared_expenses_for(user_id)
    if not mine:
        return None
    confirmed = ActEventRepository().subject_ids(user_id, 'splits_confirmed')
    done = [e for e in mine if str(e.id) in confirmed]
    if not done:
        return None

    currency = _currency_for(user_id)
    total = sum(Decimal(str(abs(e.amount or 0))) for e in done)
    n = len(done)
    bill = 'bill' if n == 1 else 'bills'
    return (f'{n} shared {bill} worth {_money(total, currency)} now splits the '
            f'way it actually happened. Your spending figures count your share '
            f'of it, not an even guess.')


def settlement_recorded(user_id):
    """What recording a settlement fixed: money owed is money accounted for."""
    from src.models.group import Settlement

    rows = Settlement.query.filter(
        db.or_(Settlement.payer_id == user_id,
               Settlement.receiver_id == user_id)).all()
    if not rows:
        return None

    currency = _currency_for(user_id)
    total = sum(Decimal(str(s.amount or 0)) for s in rows)
    n = len(rows)
    word = 'settlement' if n == 1 else 'settlements'
    return (f'{n} {word} recorded, {_money(total, currency)} in all. Money '
            f'that changed hands is now in your figures instead of sitting '
            f'outside them.')


def budget_adjusted(user_id):
    """What revising a budget did: the plan now matches what you decided.

    *** NO FIGURE IS CLAIMED HERE, AND THAT IS THE POINT. *** This act earns on
    the truth test's EFFORT limb (§14.1), not because it made a number truer,
    so a sentence inventing a consequence would be the bluff the fail-closed
    rule exists to prevent. It names what the user did and stops.
    """
    from src.models.budget import Budget

    n = Budget.query.filter_by(user_id=user_id).count()
    if not n:
        return None
    return ('You came back and changed a budget rather than leaving one that '
            'was not working. A plan you revise is a plan you are using.')
