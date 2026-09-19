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
from src.models.transaction import CategorySplit, Expense
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



def _shape(rows, group_by, start_date, end_date):
    """One shape for every grouping, so the drill-down cannot drift from them.

    *** THE TOTAL IS SUMMED FROM THE GROUPS, NOT QUERIED SEPARATELY. *** A
    second query for the total is a second chance to disagree with the rows
    beside it, which is the whole class of defect this module's docstring is
    about.
    """
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


def spending_summary(user_id, start_date, end_date, group_by=GROUP_CATEGORY,
                     category_ids=None):
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

    # ── attribution, and why it is not just `Expense.category_id` ────────────
    #
    # *** A SPLIT ROW BELONGS TO SEVERAL CATEGORIES AND THIS FILE USED TO
    # PRETEND IT BELONGED TO ONE — D-272. *** `_get_category_spending`, which
    # draws the dashboard pie and the flow diagram, apportions an expense
    # across `category_splits`. This function grouped raw `Expense.amount` by
    # `Expense.category_id` and never looked at the split table, so the two
    # disagreed about what a category cost for any user who had ever split a
    # row — D-101's shape, and the rule this project already applies to goal
    # progress.
    #
    # It is invisible on the demo (0 of 108 expenses carry a split), which is
    # exactly why it needed a test rather than a screenshot.
    #
    # *** THE UNION IS `has splits` XOR `has none`, WHICH IS WHAT STOPS IT
    # DOUBLE COUNTING. *** A split row contributes its SPLITS and not its own
    # `category_id`; an unsplit row contributes itself. Anything that counted
    # both would report more money than left the account.
    def attributions():
        split_rows = (base.join(CategorySplit, CategorySplit.expense_id == Expense.id)
                      .with_entities(
                          CategorySplit.category_id.label('category_id'),
                          CategorySplit.amount.label('amount'),
                          Expense.description.label('description'),
                          Expense.id.label('expense_id')))
        plain_rows = (base.filter(~Expense.category_splits.any())
                      .with_entities(
                          Expense.category_id.label('category_id'),
                          Expense.amount.label('amount'),
                          Expense.description.label('description'),
                          Expense.id.label('expense_id')))
        return split_rows.union_all(plain_rows).subquery()

    if category_ids is not None:
        # *** THE FILTER ATTRIBUTES TOO, OR A SPLIT ROW ENTERS WHOLE. ***
        # Drilling into Food on a row split half Food, half Travel must show
        # the Food half — counting the whole row would make the panel add up
        # to more than the slice it was opened from.
        #
        # *** AND IT TAKES THE CALLER'S EXACT SET, WITH NO PARENT ROLLUP. ***
        # The flow diagram's slices are LEAF categories keyed by NAME, so a
        # slice can merge two housemates' "Groceries" and never contains a
        # parent's children. A single id would miss the housemate's rows; a
        # rollup would add children the slice never counted. Either way the
        # panel stops summing to the slice it came from, which is the one
        # thing a drill-down must never do. The node sends what it merged.
        att = attributions()
        cond = (att.c.category_id.is_(None) if category_ids == [0]
                else att.c.category_id.in_(category_ids))
        rows = (db.session.query(
                    att.c.description.label('key'),
                    att.c.description.label('label'),
                    func.sum(att.c.amount).label('total'),
                    func.count(att.c.expense_id).label('count'))
                .filter(cond)
                .group_by(att.c.description).all())
        return _shape(rows, group_by, start_date, end_date)

    if group_by == GROUP_CATEGORY:
        # *** OVER THE ATTRIBUTIONS, NOT OVER `Expense.category_id` — D-272. ***
        # This is the branch the dashboard pie and the flow diagram have to
        # agree with, and it is the one that was wrong: a row split across two
        # categories was counted whole against the one named on the expense.
        att = attributions()
        rows = (db.session.query(
                    Category.id.label('key'),
                    func.coalesce(Category.name, UNCATEGORISED).label('label'),
                    func.sum(att.c.amount).label('total'),
                    func.count(att.c.expense_id).label('count'))
                .select_from(att)
                .outerjoin(Category, att.c.category_id == Category.id)
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

    return _shape(rows, group_by, start_date, end_date)
