"""Transaction Rules API endpoints"""
from flask import request
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.models.transaction_rule import TransactionRule
from src.utils.rule_engine import bulk_apply_rules, suggest_rule_from_edit

import logging

logger = logging.getLogger(__name__)


# Create namespace
ns = Namespace('transaction-rules', description='Transaction rule operations')

# The `TransactionRule` swagger model went with them. It was referenced only by
# the deleted resources, but an unreferenced `ns.model` still lands in the
# swagger definitions, so leaving it would have kept advertising a request body
# for endpoints this namespace no longer serves — the D-05 failure mode.


# TransactionRuleList, TransactionRuleDetail and TestRule used to live here and
# have been retired. Every one of them was dead code: the legacy
# `transaction_rule_api` blueprint (src/services/transaction_rule/api_routes.py)
# registers first and claims byte-identical URLs for the list and /test, and
# `/<int:rule_id>` there matches the same requests as `/<int:id>` did here — the
# converter variable name plays no part in matching. So none of the three ever
# served a request under either spelling, which is why they are deleted outright
# rather than reconciled: there is no behaviour to preserve and no client to
# migrate.
#
# BulkApplyRules, SuggestRule and RuleStats below are *not* duplicated — the
# blueprint has no /bulk-apply, /suggest or /stats — so they are the live
# handlers for those three paths and stay. web-ui calls all three
# (services/api/transactionRules.ts:93,101,110).
#
# Consequence worth stating plainly: the rules list, detail and test endpoints
# are now absent from the swagger document, because the blueprint that serves
# them is plain Flask and carries no restx annotations. An honest gap in the docs
# is better than the previous state, where swagger described these handlers and
# a request never reached them. Porting the blueprint onto restx properly is
# tracked in AUDIT.md rather than done here.

@ns.route('/bulk-apply')
class BulkApplyRules(Resource):
    @ns.doc('bulk_apply_rules', security='Bearer')
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
