"""Row-level CSV → Expense mapping.

Shared by the manual upload endpoint (api/v1/csv_import.py) and the folder-watch
scanner, so date parsing, sign handling and duplicate detection exist once.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable

from src.extensions import db
from src.models.category import Category
from src.models.transaction import Expense
from src.repositories.account import AccountRepository

logger = logging.getLogger(__name__)

_accounts = AccountRepository()


@dataclass
class Mapping:
    date: str
    description: str
    amount: str
    category: str | None = None
    account: str | None = None
    notes: str | None = None


@dataclass
class MapperConfig:
    date_format: str = '%Y-%m-%d'
    skip_duplicates: bool = True
    amount_multiplier: float = 1.0
    account_id: int | None = None


@dataclass
class RowResult:
    expense: Expense | None = None
    error: str | None = None
    duplicate: bool = False


@dataclass
class MapperResult:
    imported: int = 0
    skipped: int = 0
    errors: int = 0
    error_details: list[str] = field(default_factory=list)


_PAREN = re.compile(r'^\((.*)\)$')


def parse_amount(raw: str) -> float:
    """Parse a bank-formatted amount. Raises ValueError on junk.

    Handles currency symbols, thousands separators, parenthesised negatives and
    the European 1.234,56 convention.
    """
    s = (raw or '').strip()
    if not s:
        raise ValueError('empty amount')

    negative = False
    m = _PAREN.match(s)
    if m:
        negative, s = True, m.group(1).strip()

    s = re.sub(r'[^\d,.\-+]', '', s)

    # European convention: comma is the decimal separator when it is last.
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        # A single comma with exactly two trailing digits is a decimal comma.
        s = s.replace(',', '.') if re.search(r',\d{2}$', s) else s.replace(',', '')

    value = float(s)
    return -value if negative else value


def _resolve_account(row, mapping, config, user_id):
    if not mapping.account:
        return config.account_id
    name = (row.get(mapping.account) or '').strip()
    if not name:
        return config.account_id
    account = _accounts.get_by_name_and_user(name, user_id)
    return account.id if account else config.account_id


def _resolve_category(row, mapping, user_id):
    if not mapping.category:
        return None
    name = (row.get(mapping.category) or '').strip()
    if not name:
        return None
    category = Category.query.filter_by(name=name, user_id=user_id).first()
    if category:
        return category.id
    category = Category(name=name, user_id=user_id)
    db.session.add(category)
    db.session.flush()
    return category.id


def map_row(row, mapping, config, user_id, batch_id=None) -> RowResult:
    """Map one CSV row to an unsaved Expense, or report why it could not be."""
    date_str = (row.get(mapping.date) or '').strip()
    description = (row.get(mapping.description) or '').strip()
    amount_str = (row.get(mapping.amount) or '').strip()

    try:
        transaction_date = datetime.strptime(date_str, config.date_format)
    except ValueError:
        return RowResult(error=f"Invalid date '{date_str}' for format '{config.date_format}'")

    try:
        amount = parse_amount(amount_str) * config.amount_multiplier
    except ValueError:
        return RowResult(error=f"Invalid amount '{amount_str}'")

    abs_amount = abs(amount)
    transaction_type = 'expense' if amount < 0 else 'income'

    if config.skip_duplicates:
        exists = Expense.query.filter_by(
            user_id=user_id, description=description,
            amount=abs_amount, date=transaction_date,
        ).first()
        if exists:
            return RowResult(duplicate=True)

    notes = (row.get(mapping.notes) or '').strip() if mapping.notes else ''

    expense = Expense(
        description=description,
        amount=abs_amount,
        date=transaction_date,
        transaction_type=transaction_type,
        account_id=_resolve_account(row, mapping, config, user_id),
        category_id=_resolve_category(row, mapping, user_id),
        notes=notes,
        user_id=user_id,
        paid_by=user_id,
        import_source='csv',
        # Legacy NOT NULL columns with no server default.
        card_used='',
        split_method='equal',
    )
    if batch_id is not None:
        expense.import_batch_id = batch_id
    return RowResult(expense=expense)


def import_rows(rows: Iterable[dict], mapping, config, user_id,
                batch_id=None, max_rows: int | None = None) -> MapperResult:
    """Map and persist rows. Commits once at the end."""
    result = MapperResult()
    for row_num, row in enumerate(rows, start=2):  # row 1 is the header
        if max_rows is not None and row_num - 2 >= max_rows:
            result.error_details.append(
                f'Import limited to {max_rows} rows — remaining rows skipped')
            break
        try:
            outcome = map_row(row, mapping, config, user_id, batch_id)
        except Exception:
            logger.exception('Unexpected error mapping CSV row %s', row_num)
            result.errors += 1
            result.error_details.append(f'Row {row_num}: could not be processed')
            continue

        if outcome.duplicate:
            result.skipped += 1
        elif outcome.error:
            result.errors += 1
            result.error_details.append(f'Row {row_num}: {outcome.error}')
        else:
            db.session.add(outcome.expense)
            result.imported += 1

    db.session.commit()
    return result
