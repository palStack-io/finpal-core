"""
Recurring Service
Business logic for recurring transaction management and detection
"""

from datetime import datetime
from flask import current_app
from src.extensions import db
from src.models.recurring import RecurringExpense, IgnoredRecurringPattern
from src.models.transaction import Expense
from src.utils.split_with import split_with_filter


class RecurringService:
    """Service class for recurring transaction operations"""

    def __init__(self):
        pass

    def get_all_recurring(self, user_id):
        """Get all recurring expenses for a user"""
        from sqlalchemy import or_
        return RecurringExpense.query.filter(
            or_(
                RecurringExpense.user_id == user_id,
                split_with_filter(RecurringExpense.split_with, user_id)
            )
        ).all()

    def get_recurring(self, recurring_id, user_id):
        """Get a specific recurring expense"""
        recurring = db.session.get(RecurringExpense, recurring_id)
        if not recurring or recurring.user_id != user_id:
            return None
        return recurring

    @staticmethod
    def _coerce_start_date(value):
        """A date the model can store, or None if the string is not a date.

        D-80: `create-from-pattern` hands this the DETECTOR's output, and the detector
        serialises its dates -- `GET /recurring/detect` returns
        `start_date: '2026-06-26T00:00:00'`. That string went straight into a `DateTime`
        column and raised `TypeError: SQLite DateTime type only accepts Python datetime
        and date objects`, which the bare `except Exception` below then reported as
        "Could not save the recurring expense". So the whole recurring feature was
        unreachable from the web UI, whose only create path is detection.

        Parsed HERE rather than in the handler because every caller passes through
        `add_recurring`; fixing the one handler would leave the next caller free to make
        the same mistake.
        """
        if value is None or isinstance(value, datetime):
            return value
        if not isinstance(value, str):
            return None
        # `fromisoformat` covers both shapes in play: the detector's full ISO timestamp
        # and the plain `YYYY-MM-DD` an ordinary POST body carries. A trailing `Z` is not
        # accepted before 3.11, so it is normalised rather than assumed.
        try:
            return datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
        except ValueError:
            return None

    def add_recurring(self, user_id, description, amount, frequency, category_id=None,
                     start_date=None, account_id=None, currency_code=None,
                     transaction_type=None, destination_account_id=None):
        """Add a new recurring expense

        `transaction_type` is accepted HERE for the same reason `_coerce_start_date` is
        parsed here: every caller passes through `add_recurring`. It was declared on
        `RecurringInput`, so it survived validation and sat in the handler's `validated`
        dict -- and both handlers then left it out of this call, so the column fell to its
        model default and a rule the user marked **income** was stored as an **expense**
        (#133). Fixing the handlers alone would leave the next caller free to repeat it,
        and there were already two callers making exactly that mistake.
        """
        # Before the try/except, so an unparseable date is a NAMED refusal rather than the
        # generic message that hid this for as long as it existed. The exception's own text
        # still must not reach the caller -- that is D-41.
        if start_date is not None:
            coerced = self._coerce_start_date(start_date)
            if coerced is None:
                return False, 'Start date is not a valid date', None
            start_date = coerced
        try:
            recurring = RecurringExpense(
                user_id=user_id,
                description=description,
                amount=float(amount),
                frequency=frequency,
                category_id=category_id,
                start_date=start_date or datetime.utcnow(),
                account_id=account_id,
                currency_code=currency_code,
                card_used='default',
                split_method='equal',
                paid_by=str(user_id),
                active=True
            )
            # Assigned rather than passed to the constructor so that OMITTING the field
            # still yields the model's `default='expense'`. Passing `transaction_type=None`
            # explicitly would write a NULL and break every client that does not send it.
            if transaction_type is not None:
                recurring.transaction_type = transaction_type
            # Only meaningful on a transfer, and the model's `to_dict` already discards it
            # for other types. Accepted here so a transfer rule can name its destination
            # instead of silently losing it at this same seam.
            if destination_account_id is not None:
                recurring.destination_account_id = destination_account_id

            db.session.add(recurring)
            db.session.commit()
            return True, 'Recurring expense added successfully!', recurring

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error adding recurring expense')
            return False, 'Could not save the recurring expense', None

    def update_recurring(self, recurring_id, user_id, **kwargs):
        """Update a recurring expense

        The date columns are coerced here for the same reason `add_recurring` coerces
        them, and this half was missing: `RecurringDetail.put` forwards the request body
        untouched, so a client's plain `'YYYY-MM-DD'` string reached a `DateTime` column
        and raised the D-80 `TypeError`, which the bare `except` below then reported as
        "Could not update the recurring expense" -- naming nothing.

        *** IT WAS MASKED, NOT ABSENT. *** Mobile's edit form prefilled the API's full ISO
        datetime into a field guarded by `/^\\d{4}-\\d{2}-\\d{2}$/`, so the submit never
        fired (#134) and this line was never reached. Fixing that prefill ARMS this, which
        is why both are fixed together -- a dropped field is also a field nothing can
        corrupt, and un-dropping it without this would have turned a blocked save into a
        failed one.
        """
        recurring = self.get_recurring(recurring_id, user_id)
        if not recurring:
            return False, 'Recurring expense not found'

        # Outside the try/except so a bad date is a NAMED refusal, matching `add_recurring`.
        for date_field in ('start_date', 'end_date'):
            if kwargs.get(date_field) is not None:
                coerced = self._coerce_start_date(kwargs[date_field])
                if coerced is None:
                    label = 'Start date' if date_field == 'start_date' else 'End date'
                    return False, f'{label} is not a valid date'
                kwargs[date_field] = coerced

        try:
            for key, value in kwargs.items():
                if hasattr(recurring, key) and value is not None:
                    setattr(recurring, key, value)

            db.session.commit()
            return True, 'Recurring expense updated successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error updating recurring expense')
            return False, 'Could not update the recurring expense'

    def toggle_recurring(self, recurring_id, user_id):
        """Toggle active status of recurring expense"""
        recurring = self.get_recurring(recurring_id, user_id)
        if not recurring:
            return False, 'Recurring expense not found', None

        try:
            recurring.active = not recurring.active
            db.session.commit()
            status = "activated" if recurring.active else "deactivated"
            return True, f'Recurring expense {status}!', recurring.active

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error toggling recurring expense')
            return False, 'Could not change the recurring expense', None

    def delete_recurring(self, recurring_id, user_id):
        """Delete a recurring expense"""
        recurring = self.get_recurring(recurring_id, user_id)
        if not recurring:
            return False, 'Recurring expense not found'

        try:
            db.session.delete(recurring)
            db.session.commit()
            return True, 'Recurring expense deleted successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error deleting recurring expense')
            return False, 'Could not delete the recurring expense'

    def detect_recurring_patterns(self, user_id):
        """Detect recurring transaction patterns"""
        # This would call the recurring detection integration
        from integrations.recurring.detector import detect_recurring_transactions
        return detect_recurring_transactions(user_id)

    def ignore_pattern(self, user_id, pattern_key):
        """Add a pattern to the ignore list"""
        try:
            ignored = IgnoredRecurringPattern(
                user_id=user_id,
                pattern_key=pattern_key,
                description=pattern_key,
                amount=0,
                frequency='unknown'
            )
            db.session.add(ignored)
            db.session.commit()
            return True, 'Pattern ignored successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error ignoring recurring pattern')
            return False, 'Could not ignore that pattern'
