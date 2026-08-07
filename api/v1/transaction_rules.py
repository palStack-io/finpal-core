"""Transaction Rules API endpoints"""
import json

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.exceptions import HTTPException

from src.extensions import db
from src.models.transaction_rule import TransactionRule
from src.services.transaction_rule.validation import (
    FieldError, TRANSACTION_TYPES, narrowing_fields,
)
from src.utils.rule_engine import bulk_apply_rules, suggest_rule_from_edit

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('transaction-rules', description='Transaction rule operations')

# TransactionRuleList, TransactionRuleDetail and TestRule are BACK, and this time
# they are the live handlers. #45 deleted the originals because the legacy
# `transaction_rule_api` blueprint claimed byte-identical URLs and won, leaving
# these five paths absent from swagger entirely — an honest gap, but a gap. The
# blueprint is now deleted and its handler bodies live here, so a self-hoster
# reading the API docs finally sees the rules API.
#
# Three things are deliberate rather than incidental:
#
#   * Every handler keeps its own `try/except` and returns `{'error': ...}`
#     explicitly. restx's own error handling answers `{'message': ...}`, and
#     web-ui reads `err.response?.data?.error` — letting restx shape these would
#     silently undo #60 and show users "Request failed with status code 400".
#   * `@ns.route('/')` registers the SLASHED spelling only, and with
#     `url_map.strict_slashes = False` that single rule serves both `/x` and
#     `/x/` once no competing rule exists. Verified against the live
#     `transactions` namespace, which #42 left in exactly this shape and which
#     web-ui calls without the slash in production.
#   * PUT and PATCH shared one decorator on the blueprint. restx needs each verb
#     spelled out, so `patch` delegates to `put` — an absence no duplicate-route
#     guard could have caught.
#
# BulkApplyRules, SuggestRule and RuleStats were never duplicated and are
# unchanged. web-ui calls all three (services/api/transactionRules.ts:93,101,110).

# Declared and referenced, never orphaned: an unreferenced `ns.model` still
# lands in the swagger definitions and would advertise a body no endpoint
# accepts, which is the D-05 failure mode this namespace has hit before.
rule_input = ns.model('TransactionRuleInput', {
    'name': fields.String(required=True, description='Human-readable rule name'),
    'pattern': fields.String(required=True, description='Text or regex to match'),
    'pattern_field': fields.String(
        description='Transaction field to match against', default='description'),
    'is_regex': fields.Boolean(description='Treat pattern as a regex',
                               default=False),
    'case_sensitive': fields.Boolean(default=False),
    'amount_min': fields.Float(
        description='Only match at or above this amount (absolute value)'),
    'amount_max': fields.Float(
        description='Only match at or below this amount (absolute value)'),
    'transaction_type_filter': fields.String(
        description='Only match this transaction type',
        enum=list(TRANSACTION_TYPES)),
    'auto_category_id': fields.Integer(description='Category to apply'),
    'auto_account_id': fields.Integer(description='Account to apply'),
    'auto_transaction_type': fields.String(enum=list(TRANSACTION_TYPES)),
    'auto_tags': fields.List(fields.String, description='Tags to apply'),
    'auto_notes': fields.String(description='Note appended to the transaction'),
    'priority': fields.Integer(description='Higher priority rules run first',
                               default=0),
    'active': fields.Boolean(default=True),
})

rule_output = ns.model('TransactionRule', {
    'id': fields.Integer(readonly=True),
    'name': fields.String(),
    'pattern': fields.String(),
    'pattern_field': fields.String(),
    'is_regex': fields.Boolean(),
    'case_sensitive': fields.Boolean(),
    'amount_min': fields.Float(),
    'amount_max': fields.Float(),
    'transaction_type_filter': fields.String(),
    'auto_category_id': fields.Integer(),
    'auto_category': fields.String(description='Resolved category name'),
    'auto_account_id': fields.Integer(),
    'auto_account': fields.String(description='Resolved account name'),
    'auto_transaction_type': fields.String(),
    'auto_tags': fields.List(fields.String),
    'auto_notes': fields.String(),
    'priority': fields.Integer(),
    'active': fields.Boolean(),
    'match_count': fields.Integer(readonly=True),
    'last_matched': fields.String(readonly=True),
    'created_at': fields.String(readonly=True),
    'updated_at': fields.String(readonly=True),
})

rule_test_input = ns.model('TransactionRuleTestInput', {
    'rule_id': fields.Integer(
        description='Test a saved rule. Omit to test an unsaved definition, in '
                    'which case the rule fields above are read from this body.'),
    'test_transaction': fields.Raw(description='Sample transaction to match'),
    'transaction_data': fields.Raw(description='Alias for test_transaction'),
})


def _rule_fields_from(data):
    """The writable columns a create reads, minus the three narrowing ones."""
    return dict(
        name=data['name'],
        pattern=data['pattern'],
        pattern_field=data.get('pattern_field', 'description'),
        is_regex=data.get('is_regex', False),
        case_sensitive=data.get('case_sensitive', False),
        auto_category_id=data.get('auto_category_id'),
        auto_account_id=data.get('auto_account_id'),
        auto_transaction_type=data.get('auto_transaction_type'),
        auto_tags=json.dumps(data['auto_tags']) if data.get('auto_tags') else None,
        auto_notes=data.get('auto_notes'),
    )


@ns.route('/')
class TransactionRuleList(Resource):
    @ns.doc('list_transaction_rules', security='Bearer')
    @ns.response(200, 'Rules ordered by priority, highest first')
    @jwt_required()
    def get(self):
        """List every rule for the current user, highest priority first"""
        try:
            identity = get_jwt_identity()

            rules = TransactionRule.query.filter_by(
                user_id=identity
            ).order_by(
                TransactionRule.priority.desc(),
                TransactionRule.created_at.desc()
            ).all()

            return {'rules': [rule.to_dict() for rule in rules]}, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('create_transaction_rule', security='Bearer')
    @ns.expect(rule_input)
    @ns.response(201, 'Created')
    @ns.response(400, 'A required field is missing or a value is unusable')
    @jwt_required()
    def post(self):
        """Create a rule"""
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            if not data.get('name'):
                return {'error': 'Rule name is required'}, 400
            if not data.get('pattern'):
                return {'error': 'Pattern is required'}, 400

            try:
                narrowing = narrowing_fields(data)
            except FieldError as exc:
                return {'error': str(exc)}, 400

            rule = TransactionRule(
                user_id=identity,
                **_rule_fields_from(data),
                **narrowing,
                priority=data.get('priority', 0),
                active=data.get('active', True),
            )

            db.session.add(rule)
            db.session.commit()

            return {
                'message': 'Rule created successfully',
                'rule_id': rule.id,
                'rule': rule.to_dict(),
            }, 201

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/<int:rule_id>')
@ns.param('rule_id', 'Transaction rule ID')
class TransactionRuleDetail(Resource):
    @ns.doc('get_transaction_rule', security='Bearer')
    @ns.response(200, 'The rule, unwrapped')
    @ns.response(404, 'No such rule for this user')
    @jwt_required()
    def get(self, rule_id):
        """Fetch one rule.

        Answers the rule object directly, NOT wrapped in a key — asymmetric with
        the list on purpose, and pinned by the contract tests.
        """
        try:
            identity = get_jwt_identity()

            rule = TransactionRule.query.filter_by(
                id=rule_id, user_id=identity).first()

            if not rule:
                return {'error': 'Rule not found'}, 404

            return rule.to_dict(), 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('update_transaction_rule', security='Bearer')
    @ns.expect(rule_input)
    @ns.response(200, 'Updated')
    @ns.response(400, 'A value is unusable')
    @ns.response(404, 'No such rule for this user')
    @jwt_required()
    def put(self, rule_id):
        """Update a rule. Only the fields named in the body are touched."""
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            rule = TransactionRule.query.filter_by(
                id=rule_id, user_id=identity).first()

            if not rule:
                return {'error': 'Rule not found'}, 404

            try:
                narrowing = narrowing_fields(data, rule=rule)
            except FieldError as exc:
                return {'error': str(exc)}, 400

            for field, value in narrowing.items():
                setattr(rule, field, value)

            # Presence, not truthiness — `active: false` and `priority: 0` must
            # both land.
            for field in ('name', 'pattern', 'pattern_field', 'is_regex',
                          'case_sensitive', 'auto_category_id',
                          'auto_account_id', 'auto_transaction_type',
                          'auto_notes', 'priority', 'active'):
                if field in data:
                    setattr(rule, field, data[field])
            if 'auto_tags' in data:
                rule.auto_tags = (json.dumps(data['auto_tags'])
                                  if data['auto_tags'] else None)

            db.session.commit()

            return {
                'message': 'Rule updated successfully',
                'rule': rule.to_dict(),
            }, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

    @ns.doc('patch_transaction_rule', security='Bearer')
    @ns.expect(rule_input)
    @jwt_required()
    def patch(self, rule_id):
        """Alias of PUT.

        The blueprint served both verbs from one decorator; restx needs each
        spelled out, and an absent verb is exactly what no duplicate-route guard
        can see.
        """
        return self.put(rule_id)

    @ns.doc('delete_transaction_rule', security='Bearer')
    @ns.response(200, 'Deleted')
    @ns.response(404, 'No such rule for this user')
    @jwt_required()
    def delete(self, rule_id):
        """Delete a rule"""
        try:
            identity = get_jwt_identity()

            rule = TransactionRule.query.filter_by(
                id=rule_id, user_id=identity).first()

            if not rule:
                return {'error': 'Rule not found'}, 404

            db.session.delete(rule)
            db.session.commit()

            return {'message': 'Rule deleted successfully'}, 200

        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500


@ns.route('/test')
class TestRule(Resource):
    @ns.doc('test_transaction_rule', security='Bearer')
    @ns.expect(rule_test_input)
    @ns.response(200, 'Whether the rule matches, and what it would change')
    @ns.response(400, 'Neither a rule_id nor a pattern was supplied')
    @jwt_required()
    def post(self):
        """Try a rule against a sample transaction, saved or unsaved"""
        try:
            identity = get_jwt_identity()
            data = request.get_json()

            if not data:
                return {'error': 'Request body is required'}, 400

            # Two shapes are accepted, because the live client sends the second
            # one and this handler only ever understood the first.
            #
            # web-ui posts `{...ruleData, test_transaction}` — an *unsaved* rule
            # plus a sample — so that the user can try a rule out before saving
            # it (services/api/transactionRules.ts:84). This handler required
            # `rule_id`, so every one of those calls got `400 rule_id is
            # required` and the "test rule" button never worked.
            rule_id = data.get('rule_id')
            transaction_data = (data.get('transaction_data')
                                or data.get('test_transaction') or {})

            if rule_id:
                rule = TransactionRule.query.filter_by(
                    id=rule_id, user_id=identity).first()
                if not rule:
                    return {'error': 'Rule not found'}, 404
                saved = True
            else:
                if not data.get('pattern'):
                    return {
                        'error': 'Either rule_id, or a pattern to test, is required'
                    }, 400
                # Coerced through the same helper the save path uses. Previewing
                # a definition that `create` would refuse must not report a
                # confident `matches: false`.
                try:
                    narrowing = narrowing_fields(data)
                except FieldError as exc:
                    return {'error': str(exc)}, 400
                # Built, never added to the session, so previewing cannot save
                # a rule.
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
                # `apply` increments `match_count` on the instance. Harmless for
                # an unsaved rule, but it must not be flushed by a later commit
                # in the same request, hence never adding it to the session.
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
                # `result` is what web-ui reads; `applied_changes` is kept for
                # any caller written against the older response.
                result['result'] = applied_data
                result['applied_changes'] = applied_data

            return result, 200

        except HTTPException:
            raise
        except Exception:
            logger.exception('Unhandled error')
            return {'error': 'An internal error occurred'}, 500

bulk_apply_model = ns.model('BulkApplyRules', {
    # Optional: omitted means "apply every rule".
    'rule_ids': fields.List(fields.Integer, required=False,
                            description='Restrict to these rules; omit to apply all'),
})

suggest_rule_model = ns.model('SuggestRule', {
    'transaction_id': fields.Integer(required=True, description='Transaction that was recategorised'),
    'new_category_id': fields.Integer(required=True, description='Category it was moved to'),
})


@ns.route('/bulk-apply')
class BulkApplyRules(Resource):
    @ns.doc('bulk_apply_rules', security='Bearer')
    @ns.expect(bulk_apply_model)
    @jwt_required()
    def post(self):
        """Apply rules to all existing transactions"""
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}

        rule_ids = data.get('rule_ids')  # Optional: specific rules to apply

        try:
            result = bulk_apply_rules(current_user_id, rule_ids)
            return result, 200 if result['success'] else 400

        except Exception as e:
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400




@ns.route('/suggest')
class SuggestRule(Resource):
    @ns.doc('suggest_rule_from_edit', security='Bearer')
    @ns.expect(suggest_rule_model)
    @jwt_required()
    def post(self):
        """Suggest a rule based on transaction edit"""
        current_user_id = get_jwt_identity()
        data = request.get_json()

        try:
            transaction_id = data.get('transaction_id')
            new_category_id = data.get('new_category_id')

            if not transaction_id or not new_category_id:
                return {
                    'success': False,
                    'error': 'transaction_id and new_category_id required'
                }, 400

            # Get transaction
            from src.models.transaction import Expense
            transaction = Expense.query.filter_by(
                id=transaction_id,
                user_id=current_user_id
            ).first()

            if not transaction:
                return {'success': False, 'error': 'Transaction not found'}, 404

            # Generate suggestion
            suggestion = suggest_rule_from_edit(
                transaction,
                new_category_id,
                current_user_id
            )

            if suggestion:
                return {
                    'success': True,
                    'suggestion': suggestion
                }, 200
            else:
                return {
                    'success': False,
                    'message': 'No suggestion available for this transaction'
                }, 200

        except Exception as e:
            return {
                'success': False,
                'error': 'Internal server error'
            }, 400


@ns.route('/stats')
class RuleStats(Resource):
    @ns.doc('get_rule_stats', security='Bearer')
    @jwt_required()
    def get(self):
        """Get statistics about rule usage"""
        current_user_id = get_jwt_identity()

        rules = TransactionRule.query.filter_by(user_id=current_user_id).all()

        total_rules = len(rules)
        active_rules = sum(1 for r in rules if r.active)
        total_matches = sum(r.match_count for r in rules)

        # Find most used rules
        most_used = sorted(rules, key=lambda r: r.match_count, reverse=True)[:5]

        return {
            'success': True,
            'stats': {
                'total_rules': total_rules,
                'active_rules': active_rules,
                'inactive_rules': total_rules - active_rules,
                'total_matches': total_matches,
                'most_used_rules': [
                    {
                        'id': r.id,
                        'name': r.name,
                        'match_count': r.match_count,
                        'last_matched': r.last_matched.isoformat() if r.last_matched else None
                    } for r in most_used
                ]
            }
        }, 200
