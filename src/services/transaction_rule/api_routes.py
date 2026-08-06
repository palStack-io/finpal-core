"""
API Routes for Transaction Rules
JWT-based endpoints for managing auto-categorization rules
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction_rule import TransactionRule
from src.extensions import db
import json

# Werkzeug raises HTTPException from inside handler bodies — BadRequest from a bare
# `request.get_json()` on a malformed body being the common case. Each route-level
# `except Exception` that answers with a 500 is preceded by `except HTTPException:
# raise`, so a correct 4xx is not rewritten as a server fault. Without it
# `POST /api/v1/auth/login` answered a malformed body with a 500.
from werkzeug.exceptions import HTTPException  # noqa: E402
import logging  # noqa: E402

logger = logging.getLogger(__name__)

# Create API Blueprint
api_bp = Blueprint('transaction_rule_api', __name__, url_prefix='/api/v1/transaction-rules')

# The three fields that NARROW a rule. `TransactionRule.matches()` reads all of
# them, but create and update never read them off the request, so every rule
# saved through the API was broader than the user asked for — and `/test`
# accepted them, so the preview and the saved rule disagreed.
TRANSACTION_TYPES = ('expense', 'income', 'transfer')


class _FieldError(ValueError):
    """A client-facing message naming the single field that was wrong."""


def _coerce_amount(data, key):
    """Absent, null and '' all mean "no bound"; anything else must be a number.

    An uncoerced value reaching the `db.Float` column raises on commit, and the
    route's `except Exception` would answer 500 — the shape PR #57 found for
    `int('')`. Refusing by name here keeps it a 400.
    """
    value = data.get(key)
    if value is None or value == '':
        return None
    # bool is an int subclass, so True would otherwise pass float() as 1.0.
    if isinstance(value, (bool, list, dict)):
        raise _FieldError(f'{key} must be a number')
    try:
        return float(value)
    except (TypeError, ValueError):
        raise _FieldError(f'{key} must be a number')


def _coerce_type_filter(data, key='transaction_type_filter'):
    """`matches()` compares this against `transaction_type` verbatim, so a value
    outside the three real types silently stops the rule matching anything."""
    value = data.get(key)
    if value is None or value == '':
        return None
    if value not in TRANSACTION_TYPES:
        raise _FieldError(
            f'{key} must be one of: {", ".join(TRANSACTION_TYPES)}')
    return value


def _reject_inverted_range(amount_min, amount_max):
    if amount_min is not None and amount_max is not None and amount_min > amount_max:
        raise _FieldError('amount_min must not be greater than amount_max')


def _narrowing_fields(data, rule=None):
    """Validate all three together, before anything is mutated.

    Returns the fields the request actually mentions. When `rule` is given only
    keys present in `data` are returned, so a PUT that omits a bound leaves it
    alone rather than widening the rule.
    """
    if rule is None:
        fields = {
            'amount_min': _coerce_amount(data, 'amount_min'),
            'amount_max': _coerce_amount(data, 'amount_max'),
            'transaction_type_filter': _coerce_type_filter(data),
        }
        _reject_inverted_range(fields['amount_min'], fields['amount_max'])
        return fields

    fields = {}
    if 'amount_min' in data:
        fields['amount_min'] = _coerce_amount(data, 'amount_min')
    if 'amount_max' in data:
        fields['amount_max'] = _coerce_amount(data, 'amount_max')
    if 'transaction_type_filter' in data:
        fields['transaction_type_filter'] = _coerce_type_filter(data)
    # The range is checked against what the rule will END UP with, not just what
    # this request carries, so lowering one bound past the stored other is caught.
    _reject_inverted_range(fields.get('amount_min', rule.amount_min),
                           fields.get('amount_max', rule.amount_max))
    return fields


@api_bp.route('', methods=['GET'])
@jwt_required()
def get_rules():
    """Get all transaction rules for the current user"""
    try:
        identity = get_jwt_identity()

        # Get all rules, ordered by priority (highest first)
        rules = TransactionRule.query.filter_by(
            user_id=identity
        ).order_by(
            TransactionRule.priority.desc(),
            TransactionRule.created_at.desc()
        ).all()

        return jsonify({
            'rules': [rule.to_dict() for rule in rules]
        }), 200

    except HTTPException:
        raise
    except Exception:
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/<int:rule_id>', methods=['GET'])
@jwt_required()
def get_rule(rule_id):
    """Get a single transaction rule by ID"""
    try:
        identity = get_jwt_identity()

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        return jsonify(rule.to_dict()), 200

    except HTTPException:
        raise
    except Exception:
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('', methods=['POST'])
@jwt_required()
def create_rule():
    """Create a new transaction rule"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Rule name is required'}), 400
        if not data.get('pattern'):
            return jsonify({'error': 'Pattern is required'}), 400

        try:
            narrowing = _narrowing_fields(data)
        except _FieldError as exc:
            return jsonify({'error': str(exc)}), 400

        # Create rule
        rule = TransactionRule(
            user_id=identity,
            name=data['name'],
            pattern=data['pattern'],
            pattern_field=data.get('pattern_field', 'description'),
            is_regex=data.get('is_regex', False),
            case_sensitive=data.get('case_sensitive', False),
            **narrowing,
            auto_category_id=data.get('auto_category_id'),
            auto_account_id=data.get('auto_account_id'),
            auto_transaction_type=data.get('auto_transaction_type'),
            auto_tags=json.dumps(data['auto_tags']) if data.get('auto_tags') else None,
            auto_notes=data.get('auto_notes'),
            priority=data.get('priority', 0),
            active=data.get('active', True)
        )

        db.session.add(rule)
        db.session.commit()

        return jsonify({
            'message': 'Rule created successfully',
            'rule_id': rule.id,
            'rule': rule.to_dict()
        }), 201

    except HTTPException:
        raise
    except Exception:
        db.session.rollback()
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/<int:rule_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_rule(rule_id):
    """Update a transaction rule"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        # Validated before any assignment, so a refused value leaves the rule
        # exactly as it was rather than half-patched in the open session.
        try:
            narrowing = _narrowing_fields(data, rule=rule)
        except _FieldError as exc:
            return jsonify({'error': str(exc)}), 400

        for field, value in narrowing.items():
            setattr(rule, field, value)

        # Update fields
        if 'name' in data:
            rule.name = data['name']
        if 'pattern' in data:
            rule.pattern = data['pattern']
        if 'pattern_field' in data:
            rule.pattern_field = data['pattern_field']
        if 'is_regex' in data:
            rule.is_regex = data['is_regex']
        if 'case_sensitive' in data:
            rule.case_sensitive = data['case_sensitive']
        if 'auto_category_id' in data:
            rule.auto_category_id = data['auto_category_id']
        if 'auto_account_id' in data:
            rule.auto_account_id = data['auto_account_id']
        if 'auto_transaction_type' in data:
            rule.auto_transaction_type = data['auto_transaction_type']
        if 'auto_tags' in data:
            rule.auto_tags = json.dumps(data['auto_tags']) if data['auto_tags'] else None
        if 'auto_notes' in data:
            rule.auto_notes = data['auto_notes']
        if 'priority' in data:
            rule.priority = data['priority']
        if 'active' in data:
            rule.active = data['active']

        db.session.commit()

        return jsonify({
            'message': 'Rule updated successfully',
            'rule': rule.to_dict()
        }), 200

    except HTTPException:
        raise
    except Exception:
        db.session.rollback()
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/<int:rule_id>', methods=['DELETE'])
@jwt_required()
def delete_rule(rule_id):
    """Delete a transaction rule"""
    try:
        identity = get_jwt_identity()

        rule = TransactionRule.query.filter_by(id=rule_id, user_id=identity).first()

        if not rule:
            return jsonify({'error': 'Rule not found'}), 404

        db.session.delete(rule)
        db.session.commit()

        return jsonify({'message': 'Rule deleted successfully'}), 200

    except HTTPException:
        raise
    except Exception:
        db.session.rollback()
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500


@api_bp.route('/test', methods=['POST'])
@jwt_required()
def test_rule():
    """Test a rule against sample transaction data"""
    try:
        identity = get_jwt_identity()
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Two shapes are accepted, because the live client sends the second one and
        # this handler only ever understood the first.
        #
        # web-ui posts `{...ruleData, test_transaction}` — an *unsaved* rule plus a
        # sample — so that the user can try a rule out before saving it
        # (services/api/transactionRules.ts:84). This handler required `rule_id`, so
        # every one of those calls got `400 rule_id is required` and the "test rule"
        # button never worked. It predates the route consolidation: this blueprint
        # already won `/test` over the flask-restx handler, which did accept the
        # unsaved shape and was therefore dead code.
        rule_id = data.get('rule_id')
        transaction_data = (data.get('transaction_data')
                            or data.get('test_transaction') or {})

        if rule_id:
            rule = TransactionRule.query.filter_by(
                id=rule_id, user_id=identity).first()
            if not rule:
                return jsonify({'error': 'Rule not found'}), 404
            saved = True
        else:
            if not data.get('pattern'):
                return jsonify({
                    'error': 'Either rule_id, or a pattern to test, is required'
                }), 400
            # Coerced through the same helper the save path uses. Previewing a
            # definition that `create` would refuse must not report a confident
            # `matches: false` — that is the divergence this whole fix is about.
            try:
                narrowing = _narrowing_fields(data)
            except _FieldError as exc:
                return jsonify({'error': str(exc)}), 400
            # Built, never added to the session, so previewing cannot save a rule.
            rule = TransactionRule(
                user_id=identity,
                name=data.get('name', 'Test rule'),
                pattern=data['pattern'],
                pattern_field=data.get('pattern_field', 'description'),
                is_regex=data.get('is_regex', False),
                case_sensitive=data.get('case_sensitive', False),
                **narrowing,
                auto_category_id=data.get('auto_category_id'),
                auto_account_id=data.get('auto_account_id'),
                auto_transaction_type=data.get('auto_transaction_type'),
                auto_notes=data.get('auto_notes'),
                priority=data.get('priority', 50),
                active=True,
            )
            # `apply` increments `match_count` on the instance. Harmless for an
            # unsaved rule, but it must not be flushed by a later commit in the same
            # request, hence never adding it to the session.
            saved = False

        matches = rule.matches(transaction_data)

        result = {
            'success': True,
            'matches': matches,
            'test_transaction': transaction_data,
        }
        if saved:
            result['rule'] = rule.to_dict()

        if matches:
            applied_data = rule.apply(dict(transaction_data))
            # `result` is what web-ui reads; `applied_changes` is kept for any caller
            # written against the older response.
            result['result'] = applied_data
            result['applied_changes'] = applied_data

        return jsonify(result), 200

    except HTTPException:
        raise
    except Exception:
        logger.exception('Unhandled error')
        return jsonify({'error': 'An internal error occurred'}), 500
