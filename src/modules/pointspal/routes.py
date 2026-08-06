"""
pointsPal API endpoints — module-local routes.

Registered into Flask-RESTX via PointsPalModule.get_namespaces().

wallet_ns    — /api/v1/wallet/...    user's credit card wallet + SimpleFin linking
points_ns    — /api/v1/points/...    card program database + sync
optimizer_ns — /api/v1/optimizer/... per-category card recommendations
pointspal_ns — /api/v1/pointspal/... unified facade for frontend
"""

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity

# ---------------------------------------------------------------------------
# Namespaces
# ---------------------------------------------------------------------------

wallet_ns = Namespace('wallet', description='Credit card wallet and SimpleFin linking')
points_ns = Namespace('points', description='pointsPal card program database')

# ---------------------------------------------------------------------------
# wallet_ns — user cards
# ---------------------------------------------------------------------------

card_input = wallet_ns.model('CardInput', {
    'program_id': fields.String(description='pointsPal program_id (optional)'),
    'card_nickname': fields.String(description='Display name for this card'),
    'last_four': fields.String(description='Last 4 digits of card number'),
    'confidence_level': fields.String(
        description='high | medium | low', default='medium'
    ),
    'earn_override': fields.Raw(description='JSON override: {category_slug: multiplier}'),
    'association_source': fields.String(default='user_manual'),
})


@wallet_ns.route('/cards')
class CardList(Resource):
    @wallet_ns.doc('list_cards', security='Bearer')
    @jwt_required()
    def get(self):
        """List all cards in the user's wallet."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import get_user_cards
        return get_user_cards(user_id), 200

    @wallet_ns.doc('add_card', security='Bearer')
    @wallet_ns.expect(card_input)
    @jwt_required()
    def post(self):
        """Add a credit card to the wallet."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import add_user_card
        success, message, card = add_user_card(user_id, data)
        if success:
            return {'message': message, 'card': card}, 201
        return {'message': message}, 400


@wallet_ns.route('/cards/<int:card_id>')
class CardItem(Resource):
    @wallet_ns.doc('update_card', security='Bearer')
    @wallet_ns.expect(card_input)
    @jwt_required()
    def put(self, card_id):
        """Update a card in the wallet."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import update_user_card
        success, message, card = update_user_card(card_id, user_id, data)
        if success:
            return {'message': message, 'card': card}, 200
        return {'message': message}, 400 if 'not found' not in message.lower() else 404

    @wallet_ns.doc('delete_card', security='Bearer')
    @jwt_required()
    def delete(self, card_id):
        """Remove a card from the wallet."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import delete_user_card
        success, message = delete_user_card(card_id, user_id)
        if success:
            return {'message': message}, 200
        return {'message': message}, 404 if 'not found' in message.lower() else 403


@wallet_ns.route('/cards/<int:card_id>/verify')
class CardVerify(Resource):
    @wallet_ns.doc('verify_card', security='Bearer')
    @jwt_required()
    def post(self, card_id):
        """Mark card earn rates as user-verified (sets confidence=high)."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import verify_user_card
        success, message = verify_user_card(card_id, user_id)
        return {'message': message}, 200 if success else 404


@wallet_ns.route('/cards/<int:card_id>/pr-url')
class CardPrUrl(Resource):
    @wallet_ns.doc('get_pr_url', security='Bearer')
    @jwt_required()
    def get(self, card_id):
        """
        Generate (or return existing) community contribution URL for this card.
        Posts a pre-filled GitHub issue to palStack-io/pointsPal with the card's
        earn-rate data. Marks the card as submitted_to_community=True.
        """
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import generate_pr_url
        success, message, url = generate_pr_url(card_id, user_id)
        if success:
            return {'message': message, 'pr_url': url}, 200
        return {'message': message}, 400 if 'not found' not in message.lower() else 404


# ---------------------------------------------------------------------------
# wallet_ns — SimpleFin account linking
# ---------------------------------------------------------------------------

link_input = wallet_ns.model('SimplefinLinkInput', {
    'simplefin_account_id': fields.String(required=True, description='accounts.external_id value'),
    'user_card_id': fields.Integer(description='UserCard to link to (null = create unlinked)'),
    'is_credit_card': fields.Boolean(default=False),
    'simplefin_account_name': fields.String(description='Display name (optional override)'),
})

link_update = wallet_ns.model('SimplefinLinkUpdate', {
    'user_card_id': fields.Integer(description='New card to link to (null = unlink)'),
    'is_credit_card': fields.Boolean(),
})


@wallet_ns.route('/simplefin/accounts')
class SimpleFinAccountList(Resource):
    @wallet_ns.doc('list_simplefin_accounts', security='Bearer')
    @jwt_required()
    def get(self):
        """
        List SimpleFin accounts that are not yet linked to a card.
        Use ?all=1 to see all accounts including already-linked ones.
        """
        user_id = get_jwt_identity()
        show_all = request.args.get('all', '0') == '1'

        if show_all:
            from src.models.account import Account
            accounts = Account.query.filter_by(
                user_id=user_id,
                import_source='simplefin'
            ).all()
            from src.modules.pointspal.service import _account_to_dict
            return [_account_to_dict(a) for a in accounts], 200

        from src.modules.pointspal.service import get_unlinked_simplefin_accounts
        return get_unlinked_simplefin_accounts(user_id), 200


@wallet_ns.route('/simplefin/links')
class SimpleFinLinkList(Resource):
    @wallet_ns.doc('list_simplefin_links', security='Bearer')
    @jwt_required()
    def get(self):
        """List all SimpleFin ↔ card links for the current user."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import get_all_simplefin_links
        return get_all_simplefin_links(user_id), 200

    @wallet_ns.doc('create_simplefin_link', security='Bearer')
    @wallet_ns.expect(link_input)
    @jwt_required()
    def post(self):
        """Manually link a SimpleFin account to a card."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import create_card_link
        success, message, link = create_card_link(user_id, data)
        if success:
            return {'message': message, 'link': link}, 201
        return {'message': message}, 400


@wallet_ns.route('/simplefin/links/<int:link_id>')
class SimpleFinLinkItem(Resource):
    @wallet_ns.doc('update_simplefin_link', security='Bearer')
    @wallet_ns.expect(link_update)
    @jwt_required()
    def put(self, link_id):
        """Update which card a SimpleFin account is linked to."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import update_card_link
        success, message, link = update_card_link(link_id, user_id, data)
        if success:
            return {'message': message, 'link': link}, 200
        return {'message': message}, 400 if 'not found' not in message.lower() else 404

    @wallet_ns.doc('delete_simplefin_link', security='Bearer')
    @jwt_required()
    def delete(self, link_id):
        """Remove a SimpleFin ↔ card link."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import delete_card_link
        success, message = delete_card_link(link_id, user_id)
        return {'message': message}, 200 if success else 404


@wallet_ns.route('/simplefin/auto-match')
class SimpleFinAutoMatch(Resource):
    @wallet_ns.doc('auto_match', security='Bearer')
    @jwt_required()
    def post(self):
        """
        Auto-match unlinked SimpleFin accounts to user_cards using last-four
        digit extraction and fuzzy name matching.
        """
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import auto_match_simplefin_accounts
        links = auto_match_simplefin_accounts(user_id)
        return {
            'message': f'{len(links)} account(s) processed',
            'links': links,
        }, 200


# ---------------------------------------------------------------------------
# wallet_ns — spend & alerts
# ---------------------------------------------------------------------------

@wallet_ns.route('/spend')
class SpendSummary(Resource):
    @wallet_ns.doc('spend_summary', security='Bearer')
    @jwt_required()
    def get(self):
        """
        Return spend period totals for the user's cards.
        Optional query params: ?period_type=monthly&period_key=2026-03
        """
        user_id = get_jwt_identity()
        period_type = request.args.get('period_type')
        period_key = request.args.get('period_key')
        from src.modules.pointspal.service import get_spend_summary
        return get_spend_summary(user_id, period_type, period_key), 200


@wallet_ns.route('/alerts')
class AlertList(Resource):
    @wallet_ns.doc('list_alerts', security='Bearer')
    @jwt_required()
    def get(self):
        """
        Return cap alerts for the user.
        Pass ?include_dismissed=1 to see dismissed alerts too.
        """
        user_id = get_jwt_identity()
        include_dismissed = request.args.get('include_dismissed', '0') == '1'
        from src.modules.pointspal.service import get_alerts
        return get_alerts(user_id, include_dismissed), 200


@wallet_ns.route('/alerts/<int:alert_id>/dismiss')
class AlertDismiss(Resource):
    @wallet_ns.doc('dismiss_alert', security='Bearer')
    @jwt_required()
    def post(self, alert_id):
        """Dismiss a cap alert."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import dismiss_alert
        success, message = dismiss_alert(alert_id, user_id)
        return {'message': message}, 200 if success else 404


# ---------------------------------------------------------------------------
# points_ns — card program database (stub — sync implementation is next)
# ---------------------------------------------------------------------------

@points_ns.route('/sync/status')
class SyncStatus(Resource):
    @points_ns.doc('sync_status', security='Bearer')
    @jwt_required()
    def get(self):
        """Return the most recent pointsPal sync status."""
        from src.modules.pointspal.models import PointspalSyncLog
        log = PointspalSyncLog.query.order_by(PointspalSyncLog.synced_at.desc()).first()
        if not log:
            return {'status': 'never_synced', 'last_synced_at': None}, 200
        return {
            'status': log.status,
            'last_synced_at': log.synced_at.isoformat(),
            'programs_upserted': log.programs_upserted,
            'schema_version': log.schema_version,
        }, 200


@points_ns.route('/sync')
class SyncTrigger(Resource):
    @points_ns.doc('trigger_sync', security='Bearer')
    @jwt_required()
    def post(self):
        """Manually trigger a pointsPal sync from GitHub."""
        from src.modules.pointspal.service import sync_from_pointspal
        from flask import current_app
        try:
            result = sync_from_pointspal()
            return result, 200
        except Exception:
            current_app.logger.exception('Manual pointsPal sync failed')
            return {'status': 'error',
                    'error': 'pointsPal sync failed — see the server log'}, 500


@points_ns.route('/programs')
class ProgramList(Resource):
    @points_ns.doc('list_programs', security='Bearer')
    @jwt_required()
    def get(self):
        """Search/list card programs. Optional: ?q=chase&issuer=Chase"""
        from src.modules.pointspal.models import PointsProgram
        q = request.args.get('q', '').strip()
        issuer = request.args.get('issuer', '').strip()

        from sqlalchemy import or_
        query = PointsProgram.query
        if q:
            # Search across program name, issuer, and currency name so
            # "capital one", "amex", "venture", etc. all resolve correctly.
            pattern = f'%{q}%'
            query = query.filter(or_(
                PointsProgram.program_name.ilike(pattern),
                PointsProgram.issuer.ilike(pattern),
                PointsProgram.currency_name.ilike(pattern),
            ))
        if issuer:
            query = query.filter(PointsProgram.issuer.ilike(f'%{issuer}%'))

        programs = query.order_by(PointsProgram.program_name).limit(50).all()
        return [_program_to_dict(p) for p in programs], 200


@points_ns.route('/programs/<string:program_id>')
class ProgramItem(Resource):
    @points_ns.doc('get_program', security='Bearer')
    @jwt_required()
    def get(self, program_id):
        """Return a single program with its earn categories and transfer partners."""
        from src.modules.pointspal.models import PointsProgram
        program = PointsProgram.query.filter_by(program_id=program_id).first()
        if not program:
            return {'message': 'Program not found'}, 404
        d = _program_to_dict(program)
        d['earn_categories'] = [
            {
                'category': ec.category,
                'multiplier': ec.multiplier,
                'cap_amount': ec.cap_amount,
                'cap_period': ec.cap_period,
                'multiplier_fallback': ec.multiplier_fallback,
                'notes': ec.notes,
            }
            for ec in program.earn_categories
        ]
        d['transfer_partners'] = [
            {
                'partner_name': tp.partner_name,
                'ratio': tp.ratio,
                'type': tp.type,
                'est_cpp': tp.est_cpp,
            }
            for tp in program.transfer_partners
        ]
        return d, 200


# ---------------------------------------------------------------------------
# optimizer_ns — per-category card recommendations
# ---------------------------------------------------------------------------

optimizer_ns = Namespace('optimizer', description='Card spend optimizer')


@optimizer_ns.route('')
class OptimizerView(Resource):
    @optimizer_ns.doc('get_optimizer', security='Bearer')
    @jwt_required()
    def get(self):
        """
        Return per-category card recommendations for the current user.
        Capped/warning categories are surfaced first.
        """
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import build_optimizer
        return build_optimizer(user_id), 200


@optimizer_ns.route('/best-card')
class BestCard(Resource):
    @optimizer_ns.doc('best_card', security='Bearer')
    @jwt_required()
    def get(self):
        """
        Return the best card to use for a specific category.
        Required query param: ?category=dining
        """
        user_id = get_jwt_identity()
        category = request.args.get('category', '').strip()
        if not category:
            return {'message': 'category query param is required'}, 400

        from src.modules.pointspal.service import build_optimizer
        recommendations = build_optimizer(user_id)
        match = next((r for r in recommendations if r['category'] == category), None)
        if not match:
            return {'message': f'No cards found for category {category!r}'}, 404
        return match, 200


def _program_to_dict(p) -> dict:
    return {
        'program_id': p.program_id,
        'program_name': p.program_name,
        'issuer': p.issuer,
        'network': p.network,
        'annual_fee': p.annual_fee,
        'effective_annual_fee': p.effective_annual_fee,
        'base_cpp': p.base_cpp,
        'tpg_cpp': p.tpg_cpp,
        'data_as_of': p.data_as_of,
        'is_stale': p.is_stale,
        'review_frequency_months': p.review_frequency_months,
    }


# ---------------------------------------------------------------------------
# pointspal_ns — unified facade namespace matching frontend expectations
# Mounted at /api/v1/pointspal
# ---------------------------------------------------------------------------

pointspal_ns = Namespace('pointspal', description='pointsPal unified frontend API')

_CATEGORY_EMOJI = {
    'dining': '🍽️', 'travel': '✈️', 'groceries': '🛒', 'hotels': '🏨',
    'gas': '⛽', 'streaming': '📺', 'transit': '🚇', 'other': '💳',
}

_DOT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6']


def _issuer_color(issuer: str) -> str:
    if not issuer:
        return 'default'
    low = issuer.lower()
    if 'chase' in low:
        return 'chase'
    if 'american express' in low or 'amex' in low:
        return 'amex'
    if 'citi' in low:
        return 'citi'
    if 'capital one' in low or 'cap1' in low:
        return 'cap1'
    return 'default'


def _period_key_for(period_type: str) -> str:
    from datetime import datetime
    now = datetime.utcnow()
    if period_type == 'monthly':
        return f'{now.year}-{now.month:02d}'
    if period_type == 'quarterly':
        return f'{now.year}-Q{(now.month - 1) // 3 + 1}'
    return str(now.year)


def _get_period_key(period: str) -> tuple:
    """Return (period_type, period_key) for 'monthly'/'quarterly'/'annual'."""
    from datetime import datetime
    now = datetime.utcnow()
    if period == 'quarterly':
        return 'quarterly', f'{now.year}-Q{(now.month - 1) // 3 + 1}'
    if period == 'annual':
        return 'annual', str(now.year)
    return 'monthly', f'{now.year}-{now.month:02d}'


def _wallet_card_dict(card) -> dict:
    """Transform UserCard → WalletCard shape expected by frontend."""
    from src.modules.pointspal.models import PointsEarnCategory, SpendPeriodTotal
    program = card.program
    issuer = program.issuer if program else ''
    annual_fee = program.annual_fee if program else 0
    tpg_cpp = (program.tpg_cpp or program.base_cpp or 1.0) if program else 1.0

    # Earn caps — from linked program first, then from earn_override for manual entries
    earn_caps = []
    if program:
        ecs = PointsEarnCategory.query.filter_by(program_id=program.program_id).all()
        for ec in ecs:
            earn_caps.append({
                'category': ec.category,
                'rate': ec.multiplier,
                'cap_amount': ec.cap_amount,
                'cap_period': ec.cap_period,
            })

    # For manually-entered cards (or overrides), surface earn_override rates + caps
    override = card.get_earn_override()
    if override:
        override_cats = {c['category'] for c in earn_caps}
        for slug, val in override.items():
            if slug in override_cats:
                continue  # program definition takes precedence for display
            if isinstance(val, (int, float)):
                earn_caps.append({'category': slug, 'rate': float(val), 'cap_amount': None, 'cap_period': None})
            elif isinstance(val, dict):
                earn_caps.append({
                    'category': slug,
                    'rate': float(val.get('multiplier', 1.0)),
                    'cap_amount': val.get('cap_amount'),
                    'cap_period': val.get('cap_period'),
                })

    # Estimate total points from YTD spend totals
    ytd_key = _period_key_for('annual')
    totals = SpendPeriodTotal.query.filter_by(
        user_card_id=card.id, period_type='annual', period_key=ytd_key
    ).all()
    total_pts = sum(t.total_pts_earned or 0 for t in totals)
    est_value = round(total_pts * tpg_cpp / 100, 2)

    # Average earn rate YTD
    all_monthly = SpendPeriodTotal.query.filter_by(
        user_card_id=card.id, period_type='monthly'
    ).all()
    total_spent = sum(t.total_spent or 0 for t in all_monthly)
    avg_rate = round(total_pts / total_spent, 2) if total_spent > 0 else 1.0

    # Stale status
    stale_status = 'ok'
    if card.user_stale_flag:
        stale_status = 'stale'

    return {
        'id': card.id,
        'card_name': card.card_nickname or (program.program_name if program else 'Unknown'),
        'issuer': issuer,
        'program': program.program_name if program else '',
        'issuer_color': _issuer_color(issuer),
        'last_four': card.last_four or '',
        'points': int(total_pts),
        'est_value_usd': est_value,
        'annual_fee': annual_fee or 0,
        'avg_rate_ytd': avg_rate,
        'verified_at': card.user_last_verified_at.isoformat() if card.user_last_verified_at else None,
        'stale_status': stale_status,
        'expiry_alert': None,
        'earn_caps': earn_caps,
    }


@pointspal_ns.route('/overview')
class OverviewView(Resource):
    @pointspal_ns.doc('overview', security='Bearer')
    @jwt_required()
    def get(self):
        """Dashboard overview: KPIs, cards, action items, recent activity."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.models import UserCard, SpendPeriodTotal, OptimizerAlert

        cards = UserCard.query.filter_by(user_id=user_id).all()
        now_key = _period_key_for('monthly')

        # KPIs from spend totals this month
        pts_earned = 0.0
        pts_missed = 0.0
        for card in cards:
            monthly = SpendPeriodTotal.query.filter_by(
                user_card_id=card.id, period_type='monthly', period_key=now_key
            ).all()
            pts_earned += sum(t.total_pts_earned or 0 for t in monthly)
            pts_missed += sum(t.total_pts_missed or 0 for t in monthly)

        alerts = OptimizerAlert.query.filter_by(user_id=user_id, dismissed=False).all()

        # Total value across all cards
        total_value = 0.0
        overview_cards = []
        for card in cards:
            d = _wallet_card_dict(card)
            total_value += d['est_value_usd']
            overview_cards.append({
                'id': d['id'],
                'card_name': d['card_name'],
                'program': d['program'],
                'issuer_color': d['issuer_color'],
                'points': d['points'],
                'est_value_usd': d['est_value_usd'],
                'annual_fee': d['annual_fee'],
                'expiry_alert': d['expiry_alert'],
                'stale': d['stale_status'] != 'ok',
            })

        stale_cards = [
            {
                'id': c.id,
                'card_name': c.card_nickname or '',
                'stale_status': 'stale',
                'issuer_updated_at': c.user_last_verified_at.isoformat() if c.user_last_verified_at else None,
            }
            for c in cards if c.user_stale_flag
        ]

        # Action items from alerts
        action_items = []
        for a in alerts[:5]:
            card = a.user_card
            card_name = card.card_nickname if card else 'Unknown'
            pct = int(a.pct_used or 0)
            if a.alert_type == 'capped':
                action_items.append({
                    'type': 'capped',
                    'emoji': _CATEGORY_EMOJI.get(a.category, '💳'),
                    'title': f'{a.category.title()} cap hit on {card_name}',
                    'description': f'Switch cards to keep earning points',
                    'value': '0x',
                    'value_label': 'effective rate',
                    'link_to': '/pointspal/caps',
                })
            else:
                action_items.append({
                    'type': 'warning',
                    'emoji': _CATEGORY_EMOJI.get(a.category, '💳'),
                    'title': f'{a.category.title()} cap at {pct}% on {card_name}',
                    'description': f'Approaching spend cap',
                    'value': f'{pct}%',
                    'value_label': 'cap used',
                    'link_to': '/pointspal/caps',
                })

        # Recent activity from spend totals
        recent_activity = []
        all_totals = (
            SpendPeriodTotal.query
            .filter(SpendPeriodTotal.user_card_id.in_([c.id for c in cards]))
            .filter_by(period_type='monthly', period_key=now_key)
            .all()
        )
        for idx, t in enumerate(all_totals[:6]):
            card = next((c for c in cards if c.id == t.user_card_id), None)
            card_name = card.card_nickname if card else 'Unknown'
            recent_activity.append({
                'card_name': card_name,
                'dot_color': _DOT_COLORS[idx % len(_DOT_COLORS)],
                'description': f'{t.category.title()} spend',
                'subtitle': f'${t.total_spent:.0f} this month',
                'pts_earned': int(t.total_pts_earned or 0),
                'pts_missed': int(t.total_pts_missed or 0),
            })

        return {
            'total_value_usd': round(total_value, 2),
            'pts_earned_this_month': int(pts_earned),
            'pts_missed_this_month': int(pts_missed),
            'active_cap_alerts': len(alerts),
            'max_redeemable_usd': round(total_value * 1.25, 2),
            'cards': overview_cards,
            'stale_cards': stale_cards,
            'action_items': action_items,
            'recent_activity': recent_activity,
        }, 200


@pointspal_ns.route('/caps')
class CapsView(Resource):
    @pointspal_ns.doc('caps', security='Bearer')
    @jwt_required()
    def get(self):
        """Cap tracker: per-card per-category cap status."""
        user_id = get_jwt_identity()
        period = request.args.get('period', 'monthly')
        period_type, period_key = _get_period_key(period)

        from src.modules.pointspal.models import UserCard, PointsEarnCategory, SpendPeriodTotal

        cards = UserCard.query.filter_by(user_id=user_id).all()
        results = []

        for card in cards:
            if not card.program_id:
                continue
            ecs = PointsEarnCategory.query.filter_by(program_id=card.program_id).all()
            for ec in ecs:
                if not ec.cap_amount:
                    continue
                spt = SpendPeriodTotal.query.filter_by(
                    user_card_id=card.id,
                    category=ec.category,
                    period_type=period_type,
                    period_key=period_key,
                ).first()
                spent = spt.total_spent if spt else 0.0
                cap_pct = round((spent / ec.cap_amount) * 100, 1) if ec.cap_amount else 0
                status = 'ok'
                if cap_pct >= 100:
                    status = 'capped'
                elif cap_pct >= 80:
                    status = 'warning'

                effective_rate = ec.multiplier if status != 'capped' else (ec.multiplier_fallback or 1.0)
                room_left = max(0, ec.cap_amount - spent) if ec.cap_amount else 0

                results.append({
                    'category': ec.category,
                    'emoji': _CATEGORY_EMOJI.get(ec.category, '💳'),
                    'card_name': card.card_nickname or '',
                    'cap_amount': ec.cap_amount,
                    'cap_period': period_type,
                    'spent': round(spent, 2),
                    'cap_pct': cap_pct,
                    'status': status,
                    'effective_rate': effective_rate,
                    'normal_rate': ec.multiplier,
                    'room_left': round(room_left, 2),
                    'resets_at': '',
                    'recommended_switch': None,
                })

        # Sort: capped → warning → ok
        order = {'capped': 0, 'warning': 1, 'ok': 2}
        results.sort(key=lambda x: order[x['status']])
        return results, 200


@pointspal_ns.route('/caps/summary')
class CapSummaryView(Resource):
    @pointspal_ns.doc('caps_summary', security='Bearer')
    @jwt_required()
    def get(self):
        """Aggregated cap stats for the period."""
        user_id = get_jwt_identity()
        period = request.args.get('period', 'monthly')
        period_type, period_key = _get_period_key(period)

        from src.modules.pointspal.models import UserCard, SpendPeriodTotal, OptimizerAlert

        card_ids = [c.id for c in UserCard.query.filter_by(user_id=user_id).all()]
        totals = SpendPeriodTotal.query.filter(
            SpendPeriodTotal.user_card_id.in_(card_ids),
            SpendPeriodTotal.period_type == period_type,
            SpendPeriodTotal.period_key == period_key,
        ).all() if card_ids else []

        pts_earned = sum(t.total_pts_earned or 0 for t in totals)
        pts_missed = sum(t.total_pts_missed or 0 for t in totals)
        alerts_count = OptimizerAlert.query.filter_by(
            user_id=user_id, dismissed=False
        ).count()

        return {
            'period': period_key,
            'pts_earned': int(pts_earned),
            'pts_at_normal': int(pts_earned + pts_missed),
            'pts_at_fallback': int(pts_earned),
            'pts_missed': int(pts_missed),
            'value_missed_usd': round(pts_missed * 0.01, 2),
            'active_alerts': alerts_count,
            'upcoming_resets': [],
        }, 200


@pointspal_ns.route('/cards')
class FacadeCardList(Resource):
    @pointspal_ns.doc('list_wallet_cards', security='Bearer')
    @jwt_required()
    def get(self):
        """List all cards in the user's wallet (WalletCard shape)."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.models import UserCard
        cards = UserCard.query.filter_by(user_id=user_id).all()
        return [_wallet_card_dict(c) for c in cards], 200

    @pointspal_ns.doc('add_wallet_card', security='Bearer')
    @jwt_required()
    def post(self):
        """Add a card to the wallet."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import add_user_card
        success, message, card = add_user_card(user_id, data)
        if success:
            return {'message': message, 'card': card}, 201
        return {'message': message}, 400


@pointspal_ns.route('/cards/<int:card_id>')
class FacadeCardItem(Resource):
    @pointspal_ns.doc('update_wallet_card', security='Bearer')
    @jwt_required()
    def put(self, card_id):
        """Update a card in the wallet."""
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        from src.modules.pointspal.service import update_user_card
        success, message, card = update_user_card(card_id, user_id, data)
        if success:
            return {'message': message, 'card': card}, 200
        return {'message': message}, 400 if 'not found' not in message.lower() else 404

    @pointspal_ns.doc('delete_wallet_card', security='Bearer')
    @jwt_required()
    def delete(self, card_id):
        """Remove a card from the wallet."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import delete_user_card
        success, message = delete_user_card(card_id, user_id)
        return {'message': message}, 200 if success else (404 if 'not found' in message.lower() else 403)


@pointspal_ns.route('/cards/<int:card_id>/pr-url')
class FacadeCardPrUrl(Resource):
    @pointspal_ns.doc('wallet_card_pr_url', security='Bearer')
    @jwt_required()
    def get(self, card_id):
        """Generate (or return existing) community contribution URL for this card."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import generate_pr_url
        success, message, url = generate_pr_url(card_id, user_id)
        if success:
            return {'message': message, 'pr_url': url}, 200
        return {'message': message}, 400 if 'not found' not in message.lower() else 404


@pointspal_ns.route('/cards/<int:card_id>/verify')
class FacadeCardVerify(Resource):
    @pointspal_ns.doc('verify_wallet_card', security='Bearer')
    @jwt_required()
    def post(self, card_id):
        """Mark card earn rates as user-verified."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import verify_user_card
        success, message = verify_user_card(card_id, user_id)
        return {'message': message}, 200 if success else 404


@pointspal_ns.route('/cards/<int:card_id>/transactions')
class CardTransactions(Resource):
    @pointspal_ns.doc('card_transactions', security='Bearer')
    @jwt_required()
    def get(self, card_id):
        """Recent transactions with estimated points for this card."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.models import UserCard, PointsEarnCategory
        from src.modules.pointspal.category_map import FINPAL_TO_POINTSPAL
        from src.models.transaction import Expense
        from src.models.category import Category
        from src.extensions import db
        from datetime import datetime, timedelta

        card = UserCard.query.filter_by(id=card_id, user_id=user_id).first()
        if not card:
            return {'message': 'Card not found'}, 404

        # Build slug → multiplier map for this card's earn categories
        earn_cats = PointsEarnCategory.query.filter_by(program_id=card.program_id).all() if card.program_id else []
        slug_to_rate = {ec.category: ec.multiplier for ec in earn_cats}

        # Map finPal category names → earn rate
        cat_name_to_rate = {}
        for finpal_name, slug in FINPAL_TO_POINTSPAL.items():
            if slug in slug_to_rate:
                cat_name_to_rate[finpal_name.lower()] = slug_to_rate[slug]

        cutoff = (datetime.utcnow() - timedelta(days=60)).date()
        rows = (
            db.session.query(Expense, Category)
            .outerjoin(Category, Expense.category_id == Category.id)
            .filter(Expense.user_id == user_id)
            .filter(Expense.date >= cutoff)
            .filter(Expense.transaction_type == 'expense')
            .order_by(Expense.date.desc())
            .limit(30)
            .all()
        )

        result = []
        for expense, category in rows:
            cat_name = (category.name if category else 'Other').lower().strip()
            rate = cat_name_to_rate.get(cat_name, 1.0)
            amt = abs(float(expense.amount or 0))
            result.append({
                'id': expense.id,
                'date': str(expense.date),
                'description': expense.description or '',
                'category': category.name if category else 'Other',
                'amount': round(amt, 2),
                'rate': rate,
                'pts_earned': round(amt * rate),
            })

        return result, 200


@pointspal_ns.route('/recommend')
class RecommendView(Resource):
    @pointspal_ns.doc('recommend', security='Bearer')
    @jwt_required()
    def get(self):
        """Best card for a category + amount."""
        user_id = get_jwt_identity()
        category = request.args.get('category', '').strip()
        amount = float(request.args.get('amount', 100))
        if not category:
            return {'message': 'category param required'}, 400

        from src.modules.pointspal.service import build_optimizer
        recs = build_optimizer(user_id)
        match = next((r for r in recs if r['category'] == category), None)

        if not match:
            return {'message': f'No cards found for {category!r}'}, 404

        tpg_cpp = match['best_card'].get('tpg_cpp') or 1.0
        best = match['best_card']
        winner_pts = round(amount * (best['multiplier'] or 1.0))
        winner_value = round(winner_pts * tpg_cpp / 100, 2)

        all_cards = []
        displaced = None
        for i, opt in enumerate(match['all_options']):
            pts = round(amount * (opt['multiplier'] or 1.0))
            val = round(pts * (opt['tpg_cpp'] or 1.0) / 100, 2)
            tag = 'best' if i == 0 and opt['cap_status'] != 'capped' else (
                'capped' if opt['cap_status'] == 'capped' else
                'good' if i == 1 else 'ok'
            )
            all_cards.append({
                'card_name': opt['card_nickname'] or '',
                'program': opt['program_name'] or '',
                'nominal_rate': opt.get('multiplier', 1.0),
                'effective_rate': opt['multiplier'],
                'pts_earned': pts,
                'value_usd': val,
                'status': opt['cap_status'],
                'cap_pct': opt.get('cap_pct'),
                'tag': tag,
            })
            if i == 0 and opt['cap_status'] == 'capped' and len(match['all_options']) > 1:
                displaced = {
                    'card_name': opt['card_nickname'] or '',
                    'normal_rate': opt['multiplier'],
                    'status': 'capped',
                    'cap_note': f'Cap at {opt.get("cap_pct", 100):.0f}%',
                }

        return {
            'category': category,
            'amount': amount,
            'winner': {
                'card_name': best['card_nickname'] or '',
                'pts_earned': winner_pts,
                'value_usd': winner_value,
                'effective_rate': best['multiplier'],
                'cap_note': None,
            },
            'displaced_winner': displaced,
            'all_cards': all_cards,
        }, 200


@pointspal_ns.route('/alerts')
class FacadeAlertList(Resource):
    @pointspal_ns.doc('list_alerts', security='Bearer')
    @jwt_required()
    def get(self):
        """Return cap alerts for the user in frontend Alert shape."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.models import OptimizerAlert
        include_dismissed = request.args.get('include_dismissed', '0') == '1'
        query = OptimizerAlert.query.filter_by(user_id=user_id)
        if not include_dismissed:
            query = query.filter_by(dismissed=False)
        alerts = query.order_by(OptimizerAlert.created_at.desc()).all()
        result = []
        for a in alerts:
            card = a.user_card
            card_name = card.card_nickname if card else 'Unknown'
            pct = int(a.pct_used or 0)
            if a.alert_type == 'capped':
                msg = f'{a.category.title()} cap hit on {card_name} — switch cards to keep earning'
            else:
                msg = f'{a.category.title()} spend on {card_name} is at {pct}% of cap'
            result.append({
                'id': a.id,
                'type': a.alert_type,
                'message': msg,
                'dismissed': a.dismissed,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            })
        return result, 200


@pointspal_ns.route('/alerts/<int:alert_id>/dismiss')
class FacadeAlertDismiss(Resource):
    @pointspal_ns.doc('dismiss_alert', security='Bearer')
    @jwt_required()
    def post(self, alert_id):
        """Dismiss a cap alert."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.service import dismiss_alert
        success, message = dismiss_alert(alert_id, user_id)
        return {'message': message}, 200 if success else 404


@pointspal_ns.route('/redeem')
class RedeemView(Resource):
    @pointspal_ns.doc('redeem', security='Bearer')
    @jwt_required()
    def get(self):
        """Redemption optimizer overview."""
        user_id = get_jwt_identity()
        from src.modules.pointspal.models import UserCard, SpendPeriodTotal

        cards = UserCard.query.filter_by(user_id=user_id).all()
        ytd_key = _period_key_for('annual')

        programs_map = {}
        total_pts = 0
        total_value = 0.0

        for idx, card in enumerate(cards):
            program = card.program
            if not program:
                continue
            tpg_cpp = program.tpg_cpp or program.base_cpp or 1.0

            totals = SpendPeriodTotal.query.filter_by(
                user_card_id=card.id, period_type='annual', period_key=ytd_key
            ).all()
            pts = int(sum(t.total_pts_earned or 0 for t in totals))
            val = round(pts * tpg_cpp / 100, 2)
            total_pts += pts
            total_value += val

            pid = program.program_id
            if pid not in programs_map:
                partners = program.transfer_partners
                options = []
                for tp in partners[:4]:
                    cpp = tp.est_cpp or tpg_cpp
                    tag = 'Best' if cpp >= 2.0 else ('Good' if cpp >= 1.5 else ('OK' if cpp >= 1.0 else 'Avoid'))
                    options.append({
                        'partner': tp.partner_name,
                        'description': f'Transfer at {tp.ratio or "1:1"}',
                        'type': 'Transfer',
                        'cpp': cpp,
                        'tag': tag,
                    })
                # Always add portal option
                options.append({
                    'partner': f'{program.issuer} Travel Portal',
                    'description': 'Book through issuer portal',
                    'type': 'Portal',
                    'cpp': tpg_cpp,
                    'tag': 'OK' if tpg_cpp < 1.5 else 'Good',
                })
                programs_map[pid] = {
                    'program_name': program.program_name,
                    'points': pts,
                    'dot_color': _DOT_COLORS[idx % len(_DOT_COLORS)],
                    'options': options,
                }
            else:
                programs_map[pid]['points'] += pts

        tips = [
            {'type': 'tip', 'title': 'Transfer Bonuses', 'body': 'Watch for limited-time transfer bonuses — issuers often offer 20-30% extra points.'},
            {'type': 'tip', 'title': 'Avoid Cash Back', 'body': 'Points are typically worth 1.5–2.5x more through travel transfers than cash redemptions.'},
        ]

        return {
            'total_value_usd': round(total_value, 2),
            'max_redeemable_usd': round(total_value * 1.4, 2),
            'total_points': total_pts,
            'card_count': len(cards),
            'programs': list(programs_map.values()),
            'tips': tips,
        }, 200
