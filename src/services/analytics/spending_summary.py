"""Date-scoped spending aggregation, computed in SQL.

Deliberately not part of AnalyticsService: that class loads rows and sums them in
Python loops (five sites in service.py), which is precisely what this exists to
avoid. An MCP client asking "what did I spend last year" must not pull thousands
of rows into a model's context, and a database can add numbers.
"""
from datetime import datetime

from sqlalchemy import func

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.transaction import Expense
from src.models.user import User

GROUP_CATEGORY = 'category'
GROUP_MERCHANT = 'merchant'
GROUP_MONTH = 'month'
GROUP_OWNER = 'owner'
VALID_GROUPINGS = (GROUP_CATEGORY, GROUP_MERCHANT, GROUP_MONTH, GROUP_OWNER)

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
    """Totals per group over a date range, for the spending `user_id` may read.

    Income and transfers are excluded: "spending" means money out. `merchant`
    groups on the description column — there is no merchant field, and callers
    must not be told otherwise.

    ── THE SCOPE WIDENED, AND IT IS A PERMISSION CHANGE ────────────────────────

    This used to filter `Expense.user_id == user_id` — the caller's own rows and
    nothing else. That made `group_by=owner` meaningless, because grouping one
    user's rows by owner always returns exactly one group. But the narrow scope
    was wrong on its own terms too, and in two ways:

      1. **It disagreed with the transactions list**, which has been
         household-scoped since D-18 (`api/v1/transactions.py` builds from
         `_scope_query(_member_scope(...))`). The same money answered two
         different totals depending on which screen asked. This change is a
         CONVERGENCE onto the list's own predicate, not a new exposure — every
         row now counted here was already visible there.
      2. **It would have made this endpoint contradict itself.** Widening only
         for the `owner` branch would mean `total` differs between
         `group_by=category` and `group_by=owner` over the same date range. A
         summary whose total depends on how you slice it is not a summary.

    *** THE HELPER IS `read_scope`, NOT `visible_user_ids`, AND THE DIFFERENCE
    MATTERS MOST HERE. *** Both the plan and the design doc said
    `visible_user_ids`; that has no personal-access-token clause. This endpoint
    is `@api_auth_required(scope=SCOPE_READ)` and its own comment calls it the
    endpoint an MCP client relies on — so it is *the* PAT surface. `read_scope`
    returns `[user_id]` when `g.pat` is set, which is what keeps
    `AgentAccess.tsx`'s promise that "a token reads only your own data" (D-50).
    It collapses to the caller for a demo account too (D-42). Every other call
    site in this package already uses it; this function was the outlier.
    """
    from src.utils.household import read_scope, scope_query

    if group_by not in VALID_GROUPINGS:
        raise InvalidSummaryRequest(
            'group_by must be one of %s' % ', '.join(VALID_GROUPINGS))
    if end_date < start_date:
        raise InvalidSummaryRequest('end_date must not precede start_date')

    # end_date is inclusive of the whole day.
    end_of_day = end_date.replace(hour=23, minute=59, second=59)

    # `scope_query` carries the OUTER join to Account that `owner_scope_filter`
    # depends on. Outer because `Expense.account_id` is nullable and permanently
    # so — an inner join would silently drop account-less rows instead of
    # attributing them to whoever entered them.
    base = (scope_query(read_scope(user_id))
            .filter(Expense.date >= start_date,
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
    elif group_by == GROUP_OWNER:
        # *** THE KEY IS THE ACCOUNT'S OWNER, NOT `Expense.user_id`. ***
        #
        # Owner decision, 2026-08-06 (D-18): a row belongs to whoever owns its
        # ACCOUNT, full stop. `split_with` settles up; it does not decide
        # attribution. So a row Alice paid on her card and split with Bob is
        # Alice's, and grouping on `Expense.user_id` — who typed it in — would
        # COMPILE, RETURN PLAUSIBLE NUMBERS, and DISAGREE WITH THE TRANSACTIONS
        # LIST for exactly the split case D-18 was opened for. That is the whole
        # reason the predicate lives in one place.
        #
        # This is the same COALESCE that `owner_scope_filter` selects ON, reused
        # rather than re-derived: the second clause catches rows whose account
        # was deleted (`nullify_account_on_transactions`), which fall back to
        # whoever entered them because that is the only non-null id left.
        owner_key = func.coalesce(Account.user_id, Expense.user_id)
        rows = (base.outerjoin(User, User.id == owner_key)
                .with_entities(
                    owner_key.label('key'),
                    # The id is a fallback label, not a decoration: a household
                    # member with no name row still has to appear as a group
                    # rather than as a blank one.
                    func.coalesce(User.name, owner_key).label('label'),
                    func.sum(Expense.amount).label('total'),
                    func.count(Expense.id).label('count'))
                .group_by(owner_key, User.name).all())
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
