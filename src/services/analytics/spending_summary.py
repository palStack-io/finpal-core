"""Date-scoped spending aggregation, computed in SQL.

Deliberately not part of AnalyticsService: that class loads rows and sums them in
Python loops (five sites in service.py), which is precisely what this exists to
avoid. An MCP client asking "what did I spend last year" must not pull thousands
of rows into a model's context, and a database can add numbers.
"""
from datetime import datetime

from sqlalchemy import func

from src.extensions import db
from src.models.category import Category
from src.models.transaction import Expense

GROUP_CATEGORY = 'category'
GROUP_MERCHANT = 'merchant'
GROUP_MONTH = 'month'
VALID_GROUPINGS = (GROUP_CATEGORY, GROUP_MERCHANT, GROUP_MONTH)

UNCATEGORISED = 'Uncategorised'


class InvalidSummaryRequest(Exception):
    """The caller's parameters cannot be honoured. Message is client-safe."""


def parse_date(value, field):
    if not value:
        raise InvalidSummaryRequest('%s is required' % field)
    try:
        return datetime.strptime(value[:10], '%Y-%m-%d')
    except (ValueError, TypeError):
        raise InvalidSummaryRequest(
            '%s must be an ISO date such as 2026-03-01' % field)


def spending_summary(user_id, start_date, end_date, group_by=GROUP_CATEGORY):
    """Totals per group over a date range, for one user's expenses.

    Income and transfers are excluded: "spending" means money out. `merchant`
    groups on the description column — there is no merchant field, and callers
    must not be told otherwise.
    """
    if group_by not in VALID_GROUPINGS:
        raise InvalidSummaryRequest(
            'group_by must be one of %s' % ', '.join(VALID_GROUPINGS))
    if end_date < start_date:
        raise InvalidSummaryRequest('end_date must not precede start_date')

    # end_date is inclusive of the whole day.
    end_of_day = end_date.replace(hour=23, minute=59, second=59)

    base = (db.session.query(Expense)
            .filter(Expense.user_id == user_id,
                    Expense.date >= start_date,
                    Expense.date <= end_of_day,
                    Expense.transaction_type == 'expense'))

    if group_by == GROUP_CATEGORY:
        rows = (base.outerjoin(Category, Expense.category_id == Category.id)
                .with_entities(
                    Category.id.label('key'),
                    func.coalesce(Category.name, UNCATEGORISED).label('label'),
                    func.sum(Expense.amount).label('total'),
                    func.count(Expense.id).label('count'))
                .group_by(Category.id, Category.name).all())
    elif group_by == GROUP_MERCHANT:
        rows = (base.with_entities(
                    Expense.description.label('key'),
                    Expense.description.label('label'),
                    func.sum(Expense.amount).label('total'),
                    func.count(Expense.id).label('count'))
                .group_by(Expense.description).all())
    else:
        # There is no portable month-truncation function: strftime is SQLite-only,
        # to_char is Postgres-only. func.cast is special-cased by SQLAlchemy into a
        # real CAST construct, so this compiles to substr(CAST(date AS VARCHAR), 1, 7)
        # on both dialects and yields 'YYYY-MM' from the ISO datetime text. (Postgres
        # renders timestamps ISO-first under its default DateStyle.)
        month = func.substr(func.cast(Expense.date, db.String), 1, 7)
        rows = (base.with_entities(
                    month.label('key'),
                    month.label('label'),
                    func.sum(Expense.amount).label('total'),
                    func.count(Expense.id).label('count'))
                .group_by(month).all())

    groups = [{
        'key': row.key,
        'label': row.label or UNCATEGORISED,
        'total': round(float(row.total or 0), 2),
        'count': int(row.count or 0),
    } for row in rows]
    groups.sort(key=lambda g: g['total'], reverse=True)

    return {
        'groups': groups,
        'total': round(sum(g['total'] for g in groups), 2),
        'count': sum(g['count'] for g in groups),
        'start_date': start_date.strftime('%Y-%m-%d'),
        'end_date': end_date.strftime('%Y-%m-%d'),
        'group_by': group_by,
    }
