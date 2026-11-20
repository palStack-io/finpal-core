"""Short lessons: the person's own figures, and whether a lesson applies to them at all.

`figures_for(user_id, short_id)` returns the placeholder values of one lesson's
`card` / `number` templates (see the docstring of `short_lessons.py` for the keys)
plus a `try` block for the read-only slider, or `None` when the lesson is not
relevant to this person. `None` means "never shown", not "zero".

Formatting rules, so the rendered sentence reads like a person wrote it:
  * money placeholders go through `format_money` ("$1,860.00"), in the account's
    currency where one account is the subject, else the person's default;
  * `buffer_months` is a phrase ("about two weeks", "about 3 months");
  * `fixed_share` is plain words ("about a third") or a whole percent ("34%");
  * `apr` is "25%" when whole, else two places ("19.99%").
The `try` block carries raw money as 2-place strings (D-58) for the clients to format.

*** Interest slider arithmetic is a small month-by-month loop here, not
`months_to_clear`. *** The slider needs total interest paid as well as months, and
the closed form only gives months. The loop charges interest on the balance each
month (rounded half-up to cents), takes the payment, and stops when the balance
is gone. It is capped at 600 months; a payment that does not outrun the interest,
or that hits the cap, is reported as `months: None, interest_total: None` (never
cleared), which is true, rather than a made-up number.
"""
from calendar import month_name
from datetime import datetime, timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.budget import Budget
from src.models.category import Category
from src.models.recurring import RecurringExpense
from src.models.transaction import Expense
from src.models.user import User
from src.modules.learnpal.short_lessons import SHORT_LESSONS
from src.services.budget.sinking import is_sinking_fund, monthly_set_aside
from src.services.goal.buffer import buffer_picture
from src.services.goal.projection import AVALANCHE, SNOWBALL, order_debts
from src.utils.money import format_money

CENTS = Decimal('0.01')
MAX_MONTHS = 600
SLIDER_EXTRAS = range(0, 301, 10)
MIN_MONTH_TRANSACTIONS = 10
# Fallback minimum when the account records none: max(25, one month's interest + 1% of
# balance), rounded up to the cent (the common card-minimum shape; it always outruns interest).
FALLBACK_MIN_FLOOR = Decimal('25')
FALLBACK_MIN_PRINCIPAL_RATE = Decimal('0.01')


# --------------------------------------------------------------------- helpers

def _d(value):
    return Decimal(str(value or 0))


def _q(value):
    return _d(value).quantize(CENTS, rounding=ROUND_HALF_UP)


def _plain(value):
    """2-place string for the `try` block."""
    return f'{_q(value):.2f}'


def _user_format(user_id):
    user = db.session.get(User, user_id)
    code = (user and user.default_currency_code) or 'USD'
    locale = getattr(user, 'number_locale', None) if user else None
    return code, locale


def _money(value, user_id, currency=None):
    code, locale = _user_format(user_id)
    return format_money(_q(value), currency or code, locale)


def _month_bounds():
    """(start, end) of the last full calendar month, and this month's start."""
    this_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = this_start - timedelta(seconds=1)
    start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, end, this_start


def _owed_accounts(user_id, rated_only=False):
    """Cards and loans with a balance owed (balance < 0), optionally only those with apr > 0."""
    rows = Account.query.filter(
        Account.user_id == user_id,
        Account.type.in_(('credit', 'loan')),
    ).all()
    rows = [a for a in rows if _d(a.balance) < 0]
    if rated_only:
        rows = [a for a in rows if a.apr is not None and _d(a.apr) > 0]
    return rows


def _apr_words(apr):
    apr = _d(apr)
    return f'{apr:.0f}%' if apr == apr.to_integral_value() else f'{apr:.2f}%'


def _share_words(ratio):
    """Plain words near the common fractions, else a whole percent."""
    r = float(ratio)
    for low, high, words in ((0.30, 0.37, 'about a third'), (0.23, 0.27, 'about a quarter'),
                             (0.46, 0.54, 'about half'), (0.63, 0.70, 'about two thirds'),
                             (0.73, 0.77, 'about three quarters')):
        if low <= r <= high:
            return words
    return f'{round(r * 100)}%'


def _months_phrase(months):
    """`months` is a float number of months of essentials."""
    if months < 0.2:
        return 'about a week'
    if months < 0.75:
        return 'about two weeks'
    whole = max(1, round(months))
    return 'about 1 month' if whole == 1 else f'about {whole} months'


def _interest_run(balance, apr, payment):
    """Month-by-month payoff. Returns (months, interest_total) or (None, None) if never cleared."""
    rate = apr / Decimal('100') / Decimal('12')
    owed = balance
    total = Decimal('0')
    for month in range(1, MAX_MONTHS + 1):
        interest = (owed * rate).quantize(CENTS, rounding=ROUND_HALF_UP)
        if payment <= interest:
            return None, None
        total += interest
        owed = owed + interest - payment
        if owed <= 0:
            return month, total
    return None, None


# ------------------------------------------------------------------ per lesson

def _interest(user_id):
    cards = _owed_accounts(user_id, rated_only=True)
    if not cards:
        return None
    card = max(cards, key=lambda a: -_d(a.balance))
    balance, apr = -_d(card.balance), _d(card.apr)
    if balance <= 0:
        return None
    interest = (balance * apr / Decimal('100') / Decimal('12')).quantize(CENTS, rounding=ROUND_HALF_UP)
    if card.min_payment and _d(card.min_payment) > 0:
        base = _q(card.min_payment)
    else:
        base = max(FALLBACK_MIN_FLOOR, interest + balance * FALLBACK_MIN_PRINCIPAL_RATE
                   ).quantize(CENTS, rounding=ROUND_CEILING)
    points = []
    for extra in SLIDER_EXTRAS:
        months, total = _interest_run(balance, apr, base + extra)
        points.append({'extra': extra, 'months': months,
                       'interest_total': None if total is None else _plain(total)})
    _, end, _ = _month_bounds()
    return {
        'account': card.name,
        'month': month_name[end.month],
        'interest_month': _money(interest, user_id, card.currency_code),
        'balance': _money(balance, user_id, card.currency_code),
        'apr': _apr_words(apr),
        'try': {'kind': 'interest', 'balance': _plain(balance), 'apr': f'{apr:.2f}',
                'interest_month': _plain(interest), 'base_payment': _plain(base),
                'covers_interest': base > interest,
                'points': points},
    }


def _buffer(user_id):
    pic = buffer_picture(user_id)
    if not pic:
        return None
    monthly = _d(pic['essential_monthly'])
    if monthly <= 0:
        return None
    # A first cushion, not the three-to-six months of the long lesson: half a month
    # of essentials, in whole tens.
    target = (monthly / 2 / 10).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * 10
    if target <= 0:
        return None
    savings = Account.query.filter(Account.user_id == user_id, Account.type == 'savings').all()
    account = max(savings, key=lambda a: _d(a.balance)).name if savings else 'a savings account'
    return {
        'account': account,
        'buffer_amount': _money(target, user_id),
        'buffer_months': _months_phrase(float(target / monthly)),
        'try': {'kind': 'buffer', 'essential_monthly': _plain(monthly),
                'held': _plain(pic['held']), 'buffer_amount': _plain(target),
                'targets': [{'months': t['months'], 'target': _plain(t['target'])}
                            for t in pic['targets']]},
    }


def _month_income(user_id, start, end):
    return _d(db.session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        Expense.user_id == user_id, Expense.transaction_type == 'income',
        Expense.date >= start, Expense.date <= end).scalar())


def _fixed_share(user_id):
    start, end, this_start = _month_bounds()
    income = _month_income(user_id, start, end)
    if income <= 0:
        return None
    fixed = Decimal('0')
    budgets = db.session.query(Budget, Category).join(
        Category, Category.id == Budget.category_id).filter(
        Budget.user_id == user_id, Budget.active.is_(True),
        Category.spending_type == 'fixed').all()
    for budget, _cat in budgets:
        period = (budget.period or 'monthly').lower()
        if period == 'weekly':
            fixed += _d(budget.amount) * 52 / 12
        else:
            fixed += _d(monthly_set_aside(budget.amount, period))
    if fixed <= 0:
        return None
    ratio = fixed / income
    if ratio >= 1:  # "the rest is yours to choose" would not be true
        return None
    return {
        'month': month_name[this_start.month],
        'fixed_share': _share_words(ratio),
        'fixed_amount': _money(fixed, user_id),
        'income': _money(income, user_id),
        'try': {'kind': 'fixed_share', 'income': _plain(income), 'fixed_amount': _plain(fixed),
                'share_percent': f'{round(ratio * 100)}'},
    }


def _non_monthly(user_id):
    rows = db.session.query(Budget, Category).join(
        Category, Category.id == Budget.category_id).filter(
        Budget.user_id == user_id, Budget.active.is_(True),
        Category.spending_type == 'non_monthly').all()
    item = yearly = None
    # A Non-Monthly budget not yet set up as a yearly sinking fund: the figure is the lump.
    open_ones = [(b, c) for b, c in rows
                 if not is_sinking_fund(c.spending_type, b.period)
                 and (b.period or 'monthly').lower() != 'weekly' and _d(b.amount) > 0]
    if open_ones:
        b, c = max(open_ones, key=lambda r: _d(r[0].amount))
        item, yearly = (b.name or c.name), _d(b.amount)
    elif not rows:
        recurring = RecurringExpense.query.filter(
            RecurringExpense.user_id == user_id, RecurringExpense.active.is_(True),
            RecurringExpense.frequency == 'yearly').all()
        recurring = [r for r in recurring if _d(r.amount) > 0]
        if recurring:
            r = max(recurring, key=lambda r: _d(r.amount))
            item, yearly = r.description, _d(r.amount)
    if item is None:
        return None
    monthly = yearly / 12
    return {
        'item': item,
        'yearly': _money(yearly, user_id),
        'monthly': _money(monthly, user_id),
        'try': {'kind': 'sinking', 'item': item, 'yearly': _plain(yearly),
                'monthly': _plain(monthly)},
    }


def _month(user_id):
    start, end, _ = _month_bounds()
    base = [Expense.user_id == user_id, Expense.date >= start, Expense.date <= end]
    count = db.session.query(func.count(Expense.id)).filter(
        *base, Expense.transaction_type.in_(('expense', 'income'))).scalar()
    if count < MIN_MONTH_TRANSACTIONS:
        return None
    income = _month_income(user_id, start, end)
    spent = _d(db.session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        *base, Expense.transaction_type == 'expense').scalar())
    top = db.session.query(Category.name, func.sum(Expense.amount).label('total')).join(
        Category, Category.id == Expense.category_id).filter(
        *base, Expense.transaction_type == 'expense').group_by(Category.id, Category.name
        ).order_by(func.sum(Expense.amount).desc()).first()
    # The number line quotes income and a biggest category; without both it would say nothing true.
    if income <= 0 or not top or _d(top.total) <= 0:
        return None
    return {
        'month': month_name[end.month],
        'income': _money(income, user_id),
        'spent': _money(spent, user_id),
        'biggest_category': top.name,
        'biggest_amount': _money(top.total, user_id),
        'try': {'kind': 'month', 'income': _plain(income), 'spent': _plain(spent),
                'biggest_category': top.name, 'biggest_amount': _plain(top.total)},
    }


def _debt_order(user_id):
    debts = _owed_accounts(user_id, rated_only=True)
    if len(debts) < 2:
        return None
    highest = order_debts(debts, AVALANCHE)[0]
    smallest = order_debts(debts, SNOWBALL)[0]
    return {
        'count': str(len(debts)),
        'highest_rate_account': highest.name,
        'smallest_account': smallest.name,
        'try': {'kind': 'debt_order', 'debts': [
            {'name': a.name, 'balance': _plain(-_d(a.balance)), 'apr': f'{_d(a.apr):.2f}'}
            for a in debts]},
    }


_BUILDERS = {
    'interest': _interest, 'buffer': _buffer, 'fixed-share': _fixed_share,
    'non-monthly': _non_monthly, 'month': _month, 'debt-order': _debt_order,
}


def figures_for(user_id, short_id):
    """The lesson's template values plus its `try` block, or None when not relevant."""
    build = _BUILDERS.get(short_id)
    if build is None or short_id not in SHORT_LESSONS:
        return None
    try:
        return build(user_id)
    except (ValueError, TypeError):
        # format_money refuses an unknown currency; no sentence beats one in the wrong unit.
        return None


def relevant_short_lessons(user_id):
    """Short-lesson ids that apply to this person, in SHORT_LESSONS (priority) order."""
    return [sid for sid in SHORT_LESSONS if figures_for(user_id, sid) is not None]
