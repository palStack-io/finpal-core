"""
pointsPal SimpleFin bridge.

Called via a SQLAlchemy after_insert event on Expense. When a new expense is
committed, this checks whether the associated account is linked to a user_card
and, if so, updates the spend_period_totals for the relevant billing periods.

Design notes:
- Uses the raw DBAPI connection passed by the event to avoid ORM session
  re-entrancy issues during flush.
- Wraps all work in a SAVEPOINT (begin_nested equivalent via raw SQL) so a
  pointsPal failure never rolls back the user's transaction.
- Only processes transaction_type='expense' records tied to a known account.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _period_keys(dt: datetime) -> dict:
    """Return the three period keys for a given datetime."""
    quarter = (dt.month - 1) // 3 + 1
    return {
        "monthly": f"{dt.year}-{dt.month:02d}",
        "quarterly": f"{dt.year}-Q{quarter}",
        "annual": str(dt.year),
    }


def handle_new_transaction(connection, expense) -> None:
    """
    Entry point called from the Expense after_insert event.

    Parameters
    ----------
    connection : sqlalchemy.engine.Connection
        The raw connection mid-flush. Use execute() only — no ORM session ops.
    expense : Expense
        The newly inserted Expense ORM instance.
    """
    if expense.transaction_type != 'expense':
        return
    if not expense.account_id:
        return

    try:
        from sqlalchemy import text

        # 1. Find a SimpleFin card link for this account
        row = connection.execute(text("""
            SELECT scl.user_card_id
            FROM simplefin_card_links scl
            JOIN accounts a ON a.external_id = scl.simplefin_account_id
            WHERE a.id = :account_id
              AND scl.user_card_id IS NOT NULL
            LIMIT 1
        """), {"account_id": expense.account_id}).fetchone()

        if not row:
            return

        user_card_id = row[0]

        # 2. Resolve finPal category name → pointsPal slug
        category_name = None
        if expense.category_id:
            cat_row = connection.execute(
                text("SELECT name FROM categories WHERE id = :cid"),
                {"cid": expense.category_id}
            ).fetchone()
            if cat_row:
                category_name = cat_row[0]

        from src.modules.pointspal.category_map import finpal_category_to_slug
        slug = finpal_category_to_slug(category_name)

        # 3. Look up effective earn rates for this card + category
        multiplier, multiplier_fallback, cap_amount, cap_period, tpg_cpp = \
            _get_earn_rates(connection, user_card_id, slug)

        # 4. Upsert spend_period_totals for monthly / quarterly / annual
        now = expense.date if expense.date else datetime.utcnow()
        periods = _period_keys(now)

        for period_type, period_key in periods.items():
            # Determine if capped for this period (use cap_period for cap check)
            pts_earned, pts_missed = _compute_pts(
                connection, user_card_id, slug,
                multiplier, multiplier_fallback, cap_amount, cap_period,
                period_type, period_key, expense.amount,
            )
            _upsert_spend(
                connection, user_card_id, slug,
                period_type, period_key, expense.amount,
                pts_earned, pts_missed,
            )

        # 5. Check caps and fire alerts
        _check_cap_alerts(connection, user_card_id, slug, expense.user_id, periods)

    except Exception as e:
        logger.warning(f"pointsPal bridge error (non-fatal): {e}")


def _get_earn_rates(connection, user_card_id, category):
    """
    Return (multiplier, multiplier_fallback, cap_amount, cap_period, tpg_cpp) for a card+category.
    Priority: earn_override JSON > points_earn_categories > defaults (1.0 / 0.0).
    Safe to call during a flush — uses raw SQL only.
    """
    import json
    from sqlalchemy import text

    card_row = connection.execute(text("""
        SELECT uc.earn_override, uc.program_id, pp.tpg_cpp
        FROM user_cards uc
        LEFT JOIN points_programs pp ON pp.program_id = uc.program_id
        WHERE uc.id = :user_card_id
    """), {"user_card_id": user_card_id}).fetchone()

    if not card_row:
        return 1.0, 1.0, None, None, 0.0

    earn_override_json, program_id, tpg_cpp = card_row
    tpg_cpp = float(tpg_cpp or 0.0)

    # Check earn_override JSON first (supports simple float or extended dict)
    if earn_override_json:
        try:
            override = json.loads(earn_override_json) if isinstance(earn_override_json, str) else earn_override_json
            if category in override:
                val = override[category]
                if isinstance(val, (int, float)):
                    rate = float(val)
                    return rate, 1.0, None, None, tpg_cpp
                elif isinstance(val, dict):
                    multiplier = float(val.get('multiplier', 1.0))
                    fallback   = float(val.get('fallback', 1.0))
                    cap_amount = val.get('cap_amount')
                    cap_period = val.get('cap_period')
                    return multiplier, fallback, cap_amount, cap_period, tpg_cpp
        except (ValueError, TypeError, KeyError):
            pass

    # Fall back to points_earn_categories
    if program_id:
        ec_row = connection.execute(text("""
            SELECT multiplier, multiplier_fallback, cap_amount, cap_period
            FROM points_earn_categories
            WHERE program_id = :program_id AND category = :category
            LIMIT 1
        """), {"program_id": program_id, "category": category}).fetchone()

        if ec_row:
            return (
                float(ec_row[0] or 1.0),
                float(ec_row[1] or 1.0),
                ec_row[2],   # cap_amount (may be None)
                ec_row[3],   # cap_period (may be None)
                tpg_cpp,
            )

    return 1.0, 1.0, None, None, tpg_cpp


def _compute_pts(connection, user_card_id, category,
                 multiplier, multiplier_fallback, cap_amount, cap_period,
                 period_type, period_key, amount):
    """
    Return (pts_earned, pts_missed) for this transaction on a given period row.

    - If there is no cap defined, earn at full multiplier, miss nothing.
    - If there is a cap and the pre-existing spend for the cap period is already
      at or above the cap, earn at fallback rate; missed = (multiplier - fallback) * amount.
    - Otherwise earn at full rate, miss nothing.

    pts_earned / pts_missed are stored as raw points (multiplier × amount),
    not dollar value — CPP conversion can be done at query time.
    """
    if not cap_amount or not cap_period or cap_period != period_type:
        # No cap applicable to this period row
        return round(multiplier * amount, 4), 0.0

    from sqlalchemy import text
    spend_row = connection.execute(text("""
        SELECT total_spent FROM spend_period_totals
        WHERE user_card_id = :user_card_id
          AND category     = :category
          AND period_type  = :period_type
          AND period_key   = :period_key
    """), {
        "user_card_id": user_card_id,
        "category":     category,
        "period_type":  cap_period,
        "period_key":   period_key,
    }).fetchone()

    pre_spend = float(spend_row[0] or 0) if spend_row else 0.0

    if pre_spend >= cap_amount:
        # Already capped — everything earns at fallback
        pts_earned = round(multiplier_fallback * amount, 4)
        pts_missed = round((multiplier - multiplier_fallback) * amount, 4)
    else:
        # Not capped yet — full rate for this transaction
        pts_earned = round(multiplier * amount, 4)
        pts_missed = 0.0

    return pts_earned, pts_missed


def _upsert_spend(connection, user_card_id, category,
                  period_type, period_key, amount,
                  pts_earned=0.0, pts_missed=0.0) -> None:
    from sqlalchemy import text

    connection.execute(text("""
        INSERT INTO spend_period_totals
            (user_card_id, category, period_type, period_key,
             total_spent, total_pts_earned, total_pts_missed, updated_at)
        VALUES
            (:user_card_id, :category, :period_type, :period_key,
             :amount, :pts_earned, :pts_missed, NOW())
        ON CONFLICT (user_card_id, category, period_type, period_key)
        DO UPDATE SET
            total_spent      = spend_period_totals.total_spent      + :amount,
            total_pts_earned = spend_period_totals.total_pts_earned + :pts_earned,
            total_pts_missed = spend_period_totals.total_pts_missed + :pts_missed,
            updated_at       = NOW()
    """), {
        "user_card_id": user_card_id,
        "category":     category,
        "period_type":  period_type,
        "period_key":   period_key,
        "amount":       amount,
        "pts_earned":   pts_earned,
        "pts_missed":   pts_missed,
    })


def _check_cap_alerts(connection, user_card_id, category, user_id, periods) -> None:
    """
    For each period, check whether spending has crossed 80 / 95 / 100 % of the
    cap defined in points_earn_categories. Insert optimizer_alerts where needed,
    ignoring conflicts on the unique constraint.
    """
    from sqlalchemy import text

    # Look up program_id for this user_card and find the earn_category cap
    card_row = connection.execute(text("""
        SELECT uc.program_id
        FROM user_cards uc
        WHERE uc.id = :user_card_id
    """), {"user_card_id": user_card_id}).fetchone()

    if not card_row or not card_row[0]:
        return

    program_id = card_row[0]

    cap_row = connection.execute(text("""
        SELECT cap_amount, cap_period
        FROM points_earn_categories
        WHERE program_id = :program_id AND category = :category
        LIMIT 1
    """), {"program_id": program_id, "category": category}).fetchone()

    if not cap_row or not cap_row[0]:
        return  # No cap defined

    cap_amount = cap_row[0]
    cap_period = cap_row[1]  # 'monthly', 'quarterly', 'annual'

    if cap_period not in periods:
        return

    period_key = periods[cap_period]

    spend_row = connection.execute(text("""
        SELECT total_spent FROM spend_period_totals
        WHERE user_card_id = :user_card_id
          AND category = :category
          AND period_type = :period_type
          AND period_key  = :period_key
    """), {
        "user_card_id": user_card_id,
        "category": category,
        "period_type": cap_period,
        "period_key": period_key,
    }).fetchone()

    if not spend_row:
        return

    total_spent = spend_row[0] or 0
    pct = (total_spent / cap_amount) * 100

    thresholds = [
        (100, "capped"),
        (95,  "warning_95"),
        (80,  "warning_80"),
    ]

    for threshold, alert_type in thresholds:
        if pct >= threshold:
            connection.execute(text("""
                INSERT INTO optimizer_alerts
                    (user_id, user_card_id, category, period_type, period_key,
                     alert_type, pct_used, dismissed, created_at)
                VALUES
                    (:user_id, :user_card_id, :category, :period_type, :period_key,
                     :alert_type, :pct_used, false, NOW())
                ON CONFLICT (user_card_id, category, period_type, period_key, alert_type)
                DO NOTHING
            """), {
                "user_id": user_id,
                "user_card_id": user_card_id,
                "category": category,
                "period_type": cap_period,
                "period_key": period_key,
                "alert_type": alert_type,
                "pct_used": round(pct, 2),
            })
            break  # Only fire the highest applicable threshold per transaction
