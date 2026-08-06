"""
pointsPal service layer — SimpleFin card linking and wallet management.
"""

import json
import logging
import os
import re
from datetime import datetime

from flask import current_app
from src.extensions import db
from src.modules.pointspal.models import (
    UserCard, SimpleFinCardLink, PointsProgram,
    SpendPeriodTotal, OptimizerAlert,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# pointsPal sync
# ---------------------------------------------------------------------------

def sync_from_pointspal() -> dict:
    """
    Fetch dist/programs.json from the palStack-io/pointsPal GitHub repo and
    upsert all programs, earn categories, and transfer partners into the DB.
    Writes a PointspalSyncLog record on success or failure.
    Returns a stats dict.
    """
    import json
    import requests
    from flask import current_app
    from src.modules.pointspal.models import (
        PointsProgram, PointsEarnCategory, PointsTransferPartner, PointspalSyncLog,
    )

    url = current_app.config.get(
        'POINTSPAL_SYNC_URL',
        'https://raw.githubusercontent.com/palStack-io/pointsPal/main/dist/programs.json'
    )

    # --- Fetch ---
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        # The log keeps the detail; the response must not, because a requests
        # failure names the host, the proxy and any credential in the URL.
        _write_sync_log(status='error', error_message=str(e))
        logger.exception('pointsPal catalogue fetch failed')
        return {'status': 'error', 'error': 'Could not fetch the pointsPal catalogue'}

    programs = data.get('programs', [])
    schema_version = data.get('schema_version')
    upserted = 0

    # --- Upsert ---
    try:
        for p in programs:
            program_id = p.get('program_id')
            if not program_id:
                continue

            prog = PointsProgram.query.filter_by(program_id=program_id).first()
            if not prog:
                prog = PointsProgram(program_id=program_id)
                db.session.add(prog)

            prog.program_name = p.get('program_name', '')
            prog.issuer = p.get('issuer', '')
            prog.network = p.get('network')
            prog.currency_name = p.get('currency_name')
            prog.annual_fee = p.get('annual_fee')
            eff = p.get('effective_annual_fee')
            prog.effective_annual_fee = str(eff) if eff is not None else None
            prog.base_cpp = p.get('base_cpp')
            prog.tpg_cpp = p.get('tpg_cpp')
            prog.has_transfer_fee = p.get('has_transfer_fee')
            prog.expiry_policy = p.get('expiry_policy')
            prog.data_as_of = p.get('data_as_of')
            prog.issuer_effective_date = p.get('issuer_effective_date')
            prog.known_change_event = p.get('known_change_event')
            prog.review_frequency_months = p.get('review_frequency_months')
            prog.notes = p.get('notes')
            prog.source_url = p.get('source_url')
            prog.contributor = p.get('contributor')
            prog.foreign_transaction_fee_pct = p.get('foreign_transaction_fee_pct')
            prog.category_exceptions = p.get('category_exceptions')
            prog.is_stale = False
            prog.updated_at = datetime.utcnow()
            wb = p.get('welcome_bonus')
            prog.welcome_bonus = json.dumps(wb) if wb else None

            db.session.flush()

            # Replace earn categories (delete + re-insert is simpler than diff)
            PointsEarnCategory.query.filter_by(program_id=program_id).delete()
            for ec in p.get('earn_categories', []):
                db.session.add(PointsEarnCategory(
                    program_id=program_id,
                    category=ec.get('category', 'other'),
                    multiplier=float(ec.get('multiplier', 1.0)),
                    cap_amount=ec.get('cap_amount'),
                    cap_period=ec.get('cap_period'),
                    multiplier_fallback=float(ec.get('multiplier_fallback', 1.0)),
                    card_variant=ec.get('card_variant'),
                    notes=ec.get('notes'),
                ))

            # Replace transfer partners
            PointsTransferPartner.query.filter_by(program_id=program_id).delete()
            for tp in p.get('transfer_partners', []):
                db.session.add(PointsTransferPartner(
                    program_id=program_id,
                    partner_name=tp.get('partner_name', ''),
                    ratio=tp.get('ratio'),
                    type=tp.get('type'),
                    est_cpp=tp.get('est_cpp'),
                    notes=tp.get('notes'),
                ))

            upserted += 1

        _write_sync_log(
            status='success',
            programs_upserted=upserted,
            schema_version=schema_version,
        )
        db.session.commit()
        return {'status': 'success', 'programs_upserted': upserted, 'schema_version': schema_version}

    except Exception as e:
        db.session.rollback()
        _write_sync_log(status='error', error_message=str(e))
        logger.error(f"sync_from_pointspal failed: {e}")
        raise


def _write_sync_log(status: str, programs_upserted: int = None,
                    schema_version: str = None, error_message: str = None):
    from src.modules.pointspal.models import PointspalSyncLog
    try:
        db.session.add(PointspalSyncLog(
            synced_at=datetime.utcnow(),
            status=status,
            programs_upserted=programs_upserted,
            schema_version=schema_version,
            error_message=error_message,
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()


# ---------------------------------------------------------------------------
# Wallet / card management
# ---------------------------------------------------------------------------

def get_user_cards(user_id: str) -> list:
    cards = UserCard.query.filter_by(user_id=user_id).all()
    return [_card_to_dict(c) for c in cards]


def add_user_card(user_id: str, data: dict) -> tuple:
    """
    Add a card to the user's wallet.
    Returns (success, message, card_dict | None)
    """
    program_id = data.get('program_id')
    card_nickname = data.get('card_nickname') or data.get('program_name')
    last_four = data.get('last_four')
    confidence_level = data.get('confidence_level', 'medium')
    earn_override = data.get('earn_override')
    association_source = data.get('association_source', 'user_manual')

    if not card_nickname and not program_id:
        return False, 'Provide either program_id or card_nickname', None

    # Validate program exists if supplied
    if program_id:
        program = PointsProgram.query.filter_by(program_id=program_id).first()
        if not program:
            return False, f'Program {program_id!r} not found in pointsPal database', None

    try:
        card = UserCard(
            user_id=user_id,
            program_id=program_id,
            card_nickname=card_nickname,
            last_four=last_four,
            association_source=association_source,
            confidence_level=confidence_level,
        )
        if earn_override and isinstance(earn_override, dict):
            card.earn_override = json.dumps(earn_override)

        db.session.add(card)
        db.session.commit()
        return True, 'Card added to wallet', _card_to_dict(card)

    except Exception:
        db.session.rollback()
        logger.exception('add_user_card error')
        return False, 'Could not add the card to your wallet', None


def update_user_card(card_id: int, user_id: str, data: dict) -> tuple:
    """Returns (success, message, card_dict | None)"""
    card = UserCard.query.get(card_id)
    if not card:
        return False, 'Card not found', None
    if card.user_id != user_id:
        return False, 'Permission denied', None

    try:
        if 'card_nickname' in data:
            card.card_nickname = data['card_nickname']
        if 'last_four' in data:
            card.last_four = data['last_four']
        if 'confidence_level' in data:
            card.confidence_level = data['confidence_level']
        if 'earn_override' in data:
            override = data['earn_override']
            card.earn_override = json.dumps(override) if isinstance(override, dict) else override
        if 'program_id' in data:
            pid = data['program_id']
            if pid and not PointsProgram.query.filter_by(program_id=pid).first():
                return False, f'Program {pid!r} not found', None
            card.program_id = pid

        card.updated_at = datetime.utcnow()
        db.session.commit()
        return True, 'Card updated', _card_to_dict(card)

    except Exception:
        db.session.rollback()
        logger.exception('update_user_card error')
        return False, 'Could not update the card', None


def delete_user_card(card_id: int, user_id: str) -> tuple:
    """Returns (success, message)"""
    card = UserCard.query.get(card_id)
    if not card:
        return False, 'Card not found'
    if card.user_id != user_id:
        return False, 'Permission denied'

    try:
        db.session.delete(card)
        db.session.commit()
        return True, 'Card removed from wallet'
    except Exception:
        db.session.rollback()
        logger.exception('remove_user_card error')
        return False, 'Could not remove the card'


def verify_user_card(card_id: int, user_id: str) -> tuple:
    """Mark a card as user-verified (high confidence). Returns (success, message)."""
    card = UserCard.query.get(card_id)
    if not card:
        return False, 'Card not found'
    if card.user_id != user_id:
        return False, 'Permission denied'

    card.user_last_verified_at = datetime.utcnow()
    card.confidence_level = 'high'
    card.user_stale_flag = False
    db.session.commit()
    return True, 'Card verified'


# ---------------------------------------------------------------------------
# SimpleFin account linking
# ---------------------------------------------------------------------------

def get_unlinked_simplefin_accounts(user_id: str) -> list:
    """
    Return SimpleFin accounts (accounts.import_source='simplefin') that have no
    entry in simplefin_card_links yet.
    """
    from src.models.account import Account

    sf_accounts = Account.query.filter_by(
        user_id=user_id,
        import_source='simplefin'
    ).all()

    linked_ids = {
        link.simplefin_account_id
        for link in SimpleFinCardLink.query.filter_by(user_id=user_id).all()
    }

    unlinked = [a for a in sf_accounts if a.external_id and a.external_id not in linked_ids]
    return [_account_to_dict(a) for a in unlinked]


def get_all_simplefin_links(user_id: str) -> list:
    links = SimpleFinCardLink.query.filter_by(user_id=user_id).all()
    return [_link_to_dict(link) for link in links]


def auto_match_simplefin_accounts(user_id: str) -> list:
    """
    Auto-match the user's SimpleFin accounts against their user_cards using:
      1. Last-four digit extraction from account name (confidence >= AUTO_LINK_THRESHOLD)
      2. Fuzzy account name matching against card nicknames / program names

    Creates or updates SimpleFinCardLink rows.
    Returns list of created/updated link dicts.
    """
    from src.models.account import Account

    threshold_link = float(os.getenv('POINTSPAL_AUTO_LINK_THRESHOLD', 0.95))
    threshold_match = float(os.getenv('POINTSPAL_AUTO_MATCH_THRESHOLD', 0.75))

    sf_accounts = Account.query.filter_by(
        user_id=user_id,
        import_source='simplefin'
    ).all()
    user_cards = UserCard.query.filter_by(user_id=user_id).all()

    results = []

    for account in sf_accounts:
        if not account.external_id:
            continue

        # Skip if already has a confirmed link
        existing = SimpleFinCardLink.query.filter_by(
            user_id=user_id,
            simplefin_account_id=account.external_id
        ).first()
        if existing and existing.user_card_id:
            continue

        is_credit = account.type == 'credit'

        # Try to extract last four from account display name (e.g. "Sapphire Reserve 4111")
        last_four = _extract_last_four(account.name)

        matched_card = None
        match_source = None
        match_confidence = None

        # Strategy 1: last-four match
        if last_four:
            for card in user_cards:
                if card.last_four == last_four:
                    matched_card = card
                    match_source = 'last4'
                    match_confidence = threshold_link
                    break

        # Strategy 2: fuzzy name match
        if not matched_card and user_cards:
            matched_card, match_confidence = _fuzzy_match_card(
                account.name, user_cards, threshold_match
            )
            if matched_card:
                match_source = 'fuzzy_name'

        # Upsert the link
        if existing:
            if matched_card:
                existing.user_card_id = matched_card.id
                existing.match_source = match_source
                existing.match_confidence = match_confidence
                existing.simplefin_last_four = last_four
                existing.is_credit_card = is_credit
            link = existing
        else:
            link = SimpleFinCardLink(
                user_id=user_id,
                user_card_id=matched_card.id if matched_card else None,
                simplefin_account_id=account.external_id,
                simplefin_account_name=account.name,
                simplefin_last_four=last_four,
                match_source=match_source,
                match_confidence=match_confidence,
                is_credit_card=is_credit,
            )
            db.session.add(link)

        results.append(link)

    if results:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"auto_match_simplefin_accounts commit error: {e}")
            return []

    return [_link_to_dict(link) for link in results]


def create_card_link(user_id: str, data: dict) -> tuple:
    """
    Manually link a SimpleFin account to a user_card.
    Returns (success, message, link_dict | None)
    """
    simplefin_account_id = data.get('simplefin_account_id')
    user_card_id = data.get('user_card_id')

    if not simplefin_account_id:
        return False, 'simplefin_account_id is required', None

    # Validate card belongs to user
    if user_card_id:
        card = UserCard.query.get(user_card_id)
        if not card or card.user_id != user_id:
            return False, 'Card not found or permission denied', None

    # Check for existing link
    existing = SimpleFinCardLink.query.filter_by(
        user_id=user_id,
        simplefin_account_id=simplefin_account_id
    ).first()
    if existing:
        return False, 'This SimpleFin account is already linked. Use PUT to update it.', None

    try:
        from src.models.account import Account
        account = Account.query.filter_by(
            user_id=user_id,
            external_id=simplefin_account_id
        ).first()

        link = SimpleFinCardLink(
            user_id=user_id,
            user_card_id=user_card_id,
            simplefin_account_id=simplefin_account_id,
            simplefin_account_name=account.name if account else data.get('simplefin_account_name'),
            simplefin_last_four=_extract_last_four(account.name) if account else None,
            match_source='manual',
            match_confidence=1.0,
            is_credit_card=(account.type == 'credit') if account else data.get('is_credit_card', False),
        )
        db.session.add(link)
        db.session.commit()
        return True, 'Account linked', _link_to_dict(link)

    except Exception:
        db.session.rollback()
        logger.exception('create_card_link error')
        return False, 'Could not link the account', None


def update_card_link(link_id: int, user_id: str, data: dict) -> tuple:
    """
    Update which user_card a SimpleFin account is linked to.
    Pass user_card_id=null to unlink without deleting the record.
    Returns (success, message, link_dict | None)
    """
    link = SimpleFinCardLink.query.get(link_id)
    if not link:
        return False, 'Link not found', None
    if link.user_id != user_id:
        return False, 'Permission denied', None

    try:
        if 'user_card_id' in data:
            new_card_id = data['user_card_id']
            if new_card_id is not None:
                card = UserCard.query.get(new_card_id)
                if not card or card.user_id != user_id:
                    return False, 'Card not found or permission denied', None
            link.user_card_id = new_card_id
            link.match_source = 'manual'
            link.match_confidence = 1.0

        if 'is_credit_card' in data:
            link.is_credit_card = bool(data['is_credit_card'])

        db.session.commit()
        return True, 'Link updated', _link_to_dict(link)

    except Exception:
        db.session.rollback()
        logger.exception('update_card_link error')
        return False, 'Could not update the link', None


def delete_card_link(link_id: int, user_id: str) -> tuple:
    """Returns (success, message)"""
    link = SimpleFinCardLink.query.get(link_id)
    if not link:
        return False, 'Link not found'
    if link.user_id != user_id:
        return False, 'Permission denied'

    try:
        db.session.delete(link)
        db.session.commit()
        return True, 'Link removed'
    except Exception:
        db.session.rollback()
        logger.exception('delete_card_link error')
        return False, 'Could not remove the link'


# ---------------------------------------------------------------------------
# Optimizer
# ---------------------------------------------------------------------------

def get_effective_rate(user_card_id: int, category: str) -> dict:
    """
    Return the effective earn rate for a card + category.

    Priority:
      1. user_cards.earn_override[category]
      2. points_earn_categories.multiplier (matched program + category)
      3. Default 1.0

    Returns dict with keys: multiplier, multiplier_fallback, cap_amount,
    cap_period, tpg_cpp, effective_cpp, source
    """
    card = UserCard.query.get(user_card_id)
    if not card:
        return _default_rate()

    tpg_cpp = card.program.tpg_cpp if card.program else None

    # 1. User override
    override = card.get_earn_override()
    if category in override:
        multiplier, fallback, cap_amount, cap_period = _parse_override_value(override[category])
        return {
            'multiplier': multiplier,
            'multiplier_fallback': fallback,
            'cap_amount': cap_amount,
            'cap_period': cap_period,
            'tpg_cpp': tpg_cpp,
            'effective_cpp': multiplier * tpg_cpp if tpg_cpp else None,
            'source': 'earn_override',
        }

    # 2. Program earn category
    if card.program_id:
        from src.modules.pointspal.models import PointsEarnCategory
        ec = PointsEarnCategory.query.filter_by(
            program_id=card.program_id,
            category=category
        ).first()
        if ec:
            multiplier = ec.multiplier
            fallback = ec.multiplier_fallback if ec.multiplier_fallback is not None else 1.0
            return {
                'multiplier': multiplier,
                'multiplier_fallback': fallback,
                'cap_amount': ec.cap_amount,
                'cap_period': ec.cap_period,
                'tpg_cpp': tpg_cpp,
                'effective_cpp': multiplier * tpg_cpp if tpg_cpp else None,
                'source': 'earn_categories',
            }

    # 3. Default
    return {
        'multiplier': 1.0,
        'multiplier_fallback': 1.0,
        'cap_amount': None,
        'cap_period': None,
        'tpg_cpp': tpg_cpp,
        'effective_cpp': tpg_cpp,
        'source': 'default',
    }


def _parse_override_value(val) -> tuple:
    """
    Parse one value from earn_override JSON.

    Supports two formats:
      - Simple:   3.0                  → (multiplier=3.0, fallback=1.0, cap_amount=None, cap_period=None)
      - Extended: {"multiplier": 3,
                   "cap_amount": 6000,
                   "cap_period": "quarterly",
                   "fallback": 1.0}   → parsed fields

    Returns (multiplier, fallback, cap_amount, cap_period).
    """
    if isinstance(val, (int, float)):
        return float(val), 1.0, None, None
    if isinstance(val, dict):
        multiplier = float(val.get('multiplier', 1.0))
        fallback   = float(val.get('fallback', 1.0))
        cap_amount = val.get('cap_amount')
        cap_period = val.get('cap_period')
        return multiplier, fallback, cap_amount, cap_period
    return 1.0, 1.0, None, None


def _default_rate() -> dict:
    return {
        'multiplier': 1.0,
        'multiplier_fallback': 1.0,
        'cap_amount': None,
        'cap_period': None,
        'tpg_cpp': None,
        'effective_cpp': None,
        'source': 'default',
    }


def build_optimizer(user_id: str) -> list:
    """
    Return per-category card recommendations for the user.

    For each pointsPal category slug where the user has at least one eligible
    card, return the best card ranked by effective_cpp, with cap status.

    Cards with confidence_level='low' are excluded.
    Returns a list of category recommendation dicts, sorted by urgency
    (capped/warning first, then by effective_cpp desc).
    """
    from src.modules.pointspal.models import PointsEarnCategory

    cards = UserCard.query.filter(
        UserCard.user_id == user_id,
        UserCard.confidence_level != 'low',
    ).all()

    if not cards:
        return []

    # Collect all categories that at least one card has a rate for
    categories = set()
    for card in cards:
        override = card.get_earn_override()
        categories.update(override.keys())
        if card.program_id:
            ecs = PointsEarnCategory.query.filter_by(program_id=card.program_id).all()
            categories.update(ec.category for ec in ecs)

    now = datetime.utcnow()
    monthly_key = f"{now.year}-{now.month:02d}"
    quarterly_key = f"{now.year}-Q{(now.month - 1) // 3 + 1}"
    annual_key = str(now.year)

    period_map = {
        'monthly': monthly_key,
        'quarterly': quarterly_key,
        'annual': annual_key,
    }

    results = []

    for category in sorted(categories):
        options = []

        for card in cards:
            rate = get_effective_rate(card.id, category)
            multiplier = rate['multiplier']
            effective_cpp = rate['effective_cpp']

            # Cap status
            cap_status = 'ok'
            spent = 0.0
            cap_pct = None

            if rate['cap_amount'] and rate['cap_period']:
                period_key = period_map.get(rate['cap_period'])
                if period_key:
                    spt = SpendPeriodTotal.query.filter_by(
                        user_card_id=card.id,
                        category=category,
                        period_type=rate['cap_period'],
                        period_key=period_key,
                    ).first()
                    if spt:
                        spent = spt.total_spent or 0.0
                    cap_pct = round((spent / rate['cap_amount']) * 100, 1)
                    if cap_pct >= 100:
                        cap_status = 'capped'
                        multiplier = rate['multiplier_fallback']
                        effective_cpp = multiplier * rate['tpg_cpp'] if rate['tpg_cpp'] else None
                    elif cap_pct >= 80:
                        cap_status = 'warning'

            options.append({
                'user_card_id': card.id,
                'card_nickname': card.card_nickname,
                'program_name': card.program.program_name if card.program else None,
                'issuer': card.program.issuer if card.program else None,
                'multiplier': multiplier,
                'effective_cpp': effective_cpp,
                'tpg_cpp': rate['tpg_cpp'],
                'cap_amount': rate['cap_amount'],
                'cap_period': rate['cap_period'],
                'cap_pct': cap_pct,
                'cap_status': cap_status,
                'spent_in_period': round(spent, 2),
                'rate_source': rate['source'],
            })

        if not options:
            continue

        # Sort: non-capped first, then by effective_cpp desc
        options.sort(key=lambda x: (
            1 if x['cap_status'] == 'capped' else 0,
            -(x['effective_cpp'] or 0),
        ))

        best = options[0]
        results.append({
            'category': category,
            'best_card': best,
            'all_options': options,
            'urgency': (
                'capped' if best['cap_status'] == 'capped'
                else 'warning' if best['cap_status'] == 'warning'
                else 'ok'
            ),
        })

    # Sort results: capped/warning categories first
    urgency_order = {'capped': 0, 'warning': 1, 'ok': 2}
    results.sort(key=lambda x: urgency_order.get(x['urgency'], 2))

    return results


# ---------------------------------------------------------------------------
# Community PR URL
# ---------------------------------------------------------------------------

_COMMUNITY_REPO = 'palStack-io/pointsPal'
_ISSUE_LABEL = 'community-contribution'


def generate_pr_url(card_id: int, user_id: str) -> tuple:
    """
    Build a pre-filled GitHub issue URL for contributing a card's earn-rate
    data to the palStack-io/pointsPal community repo.

    Marks the card as submitted_to_community=True and stores the URL.
    Returns (success, message, url | None).
    """
    import urllib.parse

    card = UserCard.query.get(card_id)
    if not card:
        return False, 'Card not found', None
    if card.user_id != user_id:
        return False, 'Permission denied', None

    program = card.program
    program_name = program.program_name if program else card.card_nickname or f'card-{card_id}'
    issuer = program.issuer if program else 'Unknown'

    # Build a JSON payload that mirrors the programs.json schema
    earn_override = card.get_earn_override()
    earn_categories_preview = []
    if earn_override:
        for cat, multiplier in earn_override.items():
            earn_categories_preview.append({
                'category': cat,
                'multiplier': multiplier,
                'cap_amount': None,
                'cap_period': None,
                'multiplier_fallback': 1.0,
                'notes': 'User-submitted',
            })
    elif program:
        from src.modules.pointspal.models import PointsEarnCategory
        ecs = PointsEarnCategory.query.filter_by(program_id=program.program_id).all()
        for ec in ecs:
            earn_categories_preview.append({
                'category': ec.category,
                'multiplier': ec.multiplier,
                'cap_amount': ec.cap_amount,
                'cap_period': ec.cap_period,
                'multiplier_fallback': ec.multiplier_fallback,
                'notes': ec.notes,
            })

    payload = {
        'program_id': card.program_id or f'user-card-{card_id}',
        'program_name': program_name,
        'issuer': issuer,
        'last_four': card.last_four,
        'earn_categories': earn_categories_preview,
        'contributor_note': 'Submitted via finPal pointsPal wallet',
    }

    title = f'[Community] Card earn rates: {program_name} ({issuer})'
    body = (
        '## Card Contribution\n\n'
        f'**Card:** {program_name}\n'
        f'**Issuer:** {issuer}\n'
        f'**Last four:** {card.last_four or "N/A"}\n\n'
        '### Earn Rate Data\n\n'
        '```json\n'
        + json.dumps(payload, indent=2) +
        '\n```\n\n'
        '_Submitted via finPal — please verify rates before merging._'
    )

    url = (
        f'https://github.com/{_COMMUNITY_REPO}/issues/new'
        f'?title={urllib.parse.quote(title)}'
        f'&body={urllib.parse.quote(body)}'
        f'&labels={urllib.parse.quote(_ISSUE_LABEL)}'
    )

    try:
        card.submitted_to_community = True
        card.community_pr_url = url
        card.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception('generate_pr_url commit error')
        return False, 'Could not record the submission', None

    return True, 'PR URL generated', url


# ---------------------------------------------------------------------------
# Spend / alerts
# ---------------------------------------------------------------------------

def get_spend_summary(user_id: str, period_type: str = None, period_key: str = None) -> list:
    """Return spend totals for all of the user's linked cards."""
    card_ids = [c.id for c in UserCard.query.filter_by(user_id=user_id).all()]
    if not card_ids:
        return []

    query = SpendPeriodTotal.query.filter(SpendPeriodTotal.user_card_id.in_(card_ids))
    if period_type:
        query = query.filter_by(period_type=period_type)
    if period_key:
        query = query.filter_by(period_key=period_key)

    return [_spend_to_dict(s) for s in query.all()]


def get_alerts(user_id: str, include_dismissed: bool = False) -> list:
    query = OptimizerAlert.query.filter_by(user_id=user_id)
    if not include_dismissed:
        query = query.filter_by(dismissed=False)
    return [_alert_to_dict(a) for a in query.order_by(OptimizerAlert.created_at.desc()).all()]


def dismiss_alert(alert_id: int, user_id: str) -> tuple:
    alert = OptimizerAlert.query.get(alert_id)
    if not alert:
        return False, 'Alert not found'
    if alert.user_id != user_id:
        return False, 'Permission denied'
    alert.dismissed = True
    db.session.commit()
    return True, 'Alert dismissed'


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _extract_last_four(name: str):
    """Try to pull the last four card digits from an account display name."""
    if not name:
        return None
    match = re.search(r'\b(\d{4})\b', name)
    return match.group(1) if match else None


def _fuzzy_match_card(account_name: str, user_cards: list, threshold: float):
    """Return (best_card, confidence) or (None, None)."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        return None, None

    best_card = None
    best_score = 0.0

    for card in user_cards:
        candidate = card.card_nickname
        if not candidate and card.program:
            candidate = card.program.program_name
        if not candidate:
            continue

        score = fuzz.token_sort_ratio(account_name.lower(), candidate.lower()) / 100.0
        if score > best_score:
            best_score = score
            best_card = card

    if best_score >= threshold:
        return best_card, round(best_score, 4)
    return None, None


def _card_to_dict(card: UserCard) -> dict:
    program = card.program
    return {
        'id': card.id,
        'user_id': card.user_id,
        'program_id': card.program_id,
        'program_name': program.program_name if program else None,
        'issuer': program.issuer if program else None,
        'card_nickname': card.card_nickname,
        'last_four': card.last_four,
        'association_source': card.association_source,
        'earn_override': card.get_earn_override(),
        'confidence_level': card.confidence_level,
        'user_last_verified_at': card.user_last_verified_at.isoformat() if card.user_last_verified_at else None,
        'user_stale_flag': card.user_stale_flag,
        'submitted_to_community': card.submitted_to_community,
        'community_pr_url': card.community_pr_url,
        'created_at': card.created_at.isoformat() if card.created_at else None,
        'updated_at': card.updated_at.isoformat() if card.updated_at else None,
    }


def _link_to_dict(link: SimpleFinCardLink) -> dict:
    card = link.user_card
    return {
        'id': link.id,
        'user_id': link.user_id,
        'user_card_id': link.user_card_id,
        'card_nickname': card.card_nickname if card else None,
        'simplefin_account_id': link.simplefin_account_id,
        'simplefin_account_name': link.simplefin_account_name,
        'simplefin_last_four': link.simplefin_last_four,
        'match_source': link.match_source,
        'match_confidence': link.match_confidence,
        'is_credit_card': link.is_credit_card,
        'created_at': link.created_at.isoformat() if link.created_at else None,
    }


def _account_to_dict(account) -> dict:
    return {
        'id': account.id,
        'external_id': account.external_id,
        'name': account.name,
        'type': account.type,
        'institution': account.institution,
        'balance': account.balance,
    }


def _spend_to_dict(s: SpendPeriodTotal) -> dict:
    return {
        'id': s.id,
        'user_card_id': s.user_card_id,
        'category': s.category,
        'period_type': s.period_type,
        'period_key': s.period_key,
        'total_spent': s.total_spent,
        'total_pts_earned': s.total_pts_earned,
        'total_pts_missed': s.total_pts_missed,
        'updated_at': s.updated_at.isoformat() if s.updated_at else None,
    }


def _alert_to_dict(a: OptimizerAlert) -> dict:
    card = a.user_card
    return {
        'id': a.id,
        'user_card_id': a.user_card_id,
        'card_nickname': card.card_nickname if card else None,
        'category': a.category,
        'period_type': a.period_type,
        'period_key': a.period_key,
        'alert_type': a.alert_type,
        'pct_used': a.pct_used,
        'dismissed': a.dismissed,
        'created_at': a.created_at.isoformat() if a.created_at else None,
    }
