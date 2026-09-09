"""Goals API endpoints.

*** CORE, NOT UNDER A MODULE PREFIX. *** `/api/v1/goals`, never
`/api/v1/learnpal/goals`: debtPal, retirementPal and firePal all read goals and
none of them may depend on a learning module (owner decision, 2026-09-08).

Two rules run through every handler here:

**Progress is computed server-side and shipped in the payload.** A client must
never derive it. Two clients deriving the same figure is D-101's shape --
`mobile/src/services/analyticsService.ts` and web-ui disagreed about the same
numbers for months, and a green typecheck was reassuring throughout.

**A household goal is a SHARED thing, so its read predicate is the same-side
one, not `is_household_member` on both sides.** The latter is correct for
*ownership* (D-81) and here would forbid demo->demo, breaking the public demo
whose personas are all demo accounts -- invisibly to any test that only builds
real users.
"""
import logging
from datetime import datetime

from flask import request
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_restx import Namespace, Resource, fields

from schemas.input_schemas import goal_input
from src.extensions import db
from src.models.account import Account
from src.models.goal import Goal
from src.services.goal.service import GoalService
from src.utils.household import (
    can_manage_owned, default_currency_for, read_scope, same_side_user_ids,
    visible_user_ids,
)
from src.utils.validation import validate_request, validation_error_response

logger = logging.getLogger(__name__)

ns = Namespace('goals', description='Savings and payoff goals')

goal_model = ns.model('Goal', {
    'name': fields.String(required=True, description='Goal name'),
    'kind': fields.String(description="'payoff' | 'savings' | 'custom'"),
    'scope': fields.String(
        description="'personal' (default) or 'household'. A household goal is "
                    'visible to, and counts for, every member.'),
    'account_id': fields.Integer(
        description='Account to link the goal to. Omit for a manual goal. A linked '
                    'goal reads its current figure from the balance, which is what '
                    'makes it honest -- a typed figure can be inflated.'),
    'target_amount': fields.Float(required=True, description='Target figure'),
    'start_amount': fields.Float(
        description='Manual goals only. A LINKED goal snapshots this from the '
                    "account's balance at creation and ignores anything sent here."),
    'current_manual': fields.Float(
        description='Manual goals only. Ignored for a linked goal.'),
    'currency_code': fields.String(description='ISO 4217; defaults to the profile'),
    'start_date': fields.String(description='YYYY-MM-DD; defaults to today'),
    'target_date': fields.String(description='YYYY-MM-DD, optional'),
    'status': fields.String(
        description="'active' or 'archived'. 'achieved' is STAMPED BY THE SERVER "
                    'when progress reaches 1 and cannot be set by a client.'),
})


def _parse_date(value, field):
    """A date string, or None. Raises ValueError with the field named."""
    if value in (None, ''):
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValueError(f'{field} must be YYYY-MM-DD')


def _serialize(goal, svc):
    """The payload.

    Numbers, not pre-formatted strings, and `currency_code` beside them -- matching
    every other endpoint in this API, so the clients' existing money formatter
    renders a goal exactly as it renders an account. Adding a `*_formatted` string
    here would be a second rendering of one number with no consumer, which is how a
    payload field becomes a lie (D-05).

    `progress`, `direction` and `current_amount` ARE computed here, because those
    three are the ones a client must not derive.
    """
    return {
        'id': goal.id,
        'user_id': goal.user_id,
        'name': goal.name,
        'kind': goal.kind,
        'scope': goal.scope,
        'account_id': goal.account_id,
        # Presentational, and the reason a client does not need a second request.
        'account_name': goal.account.name if goal.account_id else None,
        'target_amount': float(goal.target_amount),
        'start_amount': float(goal.start_amount),
        'current_manual': (float(goal.current_manual)
                           if goal.current_manual is not None else None),
        'currency_code': goal.currency_code,
        'start_date': goal.start_date.isoformat() if goal.start_date else None,
        'target_date': goal.target_date.isoformat() if goal.target_date else None,
        'status': goal.status,
        'achieved_at': goal.achieved_at.isoformat() if goal.achieved_at else None,
        **svc.as_payload(goal),
    }


def _visible_goals(caller_id):
    """Own personal goals, plus every household goal on the caller's side.

    Two different predicates on purpose:

    * personal -> `Goal.user_id == caller`. An owned thing; nobody else's business.
    * household -> `same_side_user_ids(caller)`. A SHARED thing. `read_scope` would
      be wrong here: it collapses a demo caller to itself, so on the public demo one
      persona could not see another's shared goal -- and that is invisible to any
      test built only from real users, which is why `test_goal_scope_contract.py`
      asserts both demo directions.
    """
    return Goal.query.filter(
        db.or_(
            db.and_(Goal.user_id == caller_id, Goal.scope != 'household'),
            db.and_(Goal.scope == 'household',
                    Goal.user_id.in_(same_side_user_ids(caller_id))),
        )
    )


def _find_visible(goal_id, caller_id):
    """A goal the caller may READ, or None. Reads are wider than writes."""
    return _visible_goals(caller_id).filter(Goal.id == goal_id).first()


@ns.route('/')
class GoalList(Resource):
    """ONE rule, serving both spellings.

    web-ui omits the trailing slash and mobile includes it, and the app sets
    `url_map.strict_slashes = False` (`src/__init__.py:134`) so this single rule
    answers both. Registering `''` as well makes two rules for one path, which the
    boot-time duplicate-route guard refuses -- and rightly: two handlers on one
    path is how a trailing slash silently picks a different one.
    """

    @ns.doc('list_goals', security='Bearer')
    @jwt_required()
    def get(self):
        """Every goal the caller may see, with progress computed."""
        caller = get_jwt_identity()
        svc = GoalService()
        goals = _visible_goals(caller).order_by(Goal.created_at.desc()).all()
        # Stamped on read, which is where the spec puts the achieved predicate:
        # nothing else runs when a balance moves, so a goal reached by an ordinary
        # transaction would otherwise never be marked.
        for goal in goals:
            svc.stamp_if_achieved(goal)
        return {'success': True,
                'goals': [_serialize(g, svc) for g in goals]}, 200

    @ns.doc('create_goal', security='Bearer')
    @ns.expect(goal_model)
    @jwt_required()
    def post(self):
        """Create a goal, snapshotting `start_amount` for a linked one."""
        caller = get_jwt_identity()
        data = request.get_json() or {}

        validated, errors = validate_request(goal_input, data)
        if errors:
            return validation_error_response(errors)

        account = None
        if validated.get('account_id') is not None:
            # Read scope, not the same-side set: linking is about an OWNED thing,
            # and the caller must be able to see the account to point a goal at it.
            account = Account.query.filter(
                Account.id == validated['account_id'],
                Account.user_id.in_(visible_user_ids(caller))).first()
            if account is None:
                return {'success': False, 'error': 'Account not found'}, 404

        # *** THE SNAPSHOT. *** Taken from the balance the server reads, never from
        # the body, and never recomputed afterwards. A client-supplied start on a
        # linked goal would make the denominator a typed number, which is the one
        # thing linking exists to prevent -- and it cannot be corrected later,
        # because the history needed to derive it is gone.
        if account is not None:
            start_amount = account.balance if account.balance is not None else 0
        elif validated.get('start_amount') is not None:
            start_amount = validated['start_amount']
        else:
            start_amount = 0

        svc = GoalService()
        try:
            svc.validate(start_amount=start_amount,
                         target_amount=validated['target_amount'])
            start_date = _parse_date(validated.get('start_date'), 'start_date')
            target_date = _parse_date(validated.get('target_date'), 'target_date')
        except ValueError as exc:
            return {'success': False, 'error': str(exc)}, 400

        goal = Goal(
            user_id=caller,
            name=validated['name'],
            kind=validated.get('kind', 'savings'),
            scope=validated.get('scope', 'personal'),
            account_id=account.id if account else None,
            target_amount=validated['target_amount'],
            start_amount=start_amount,
            # Meaningless on a linked goal, so it is not stored on one -- keeping a
            # figure the service will never read is how a stale number ends up
            # rendered by something that forgets which kind of goal it has.
            current_manual=(None if account is not None
                            else validated.get('current_manual')),
            currency_code=(validated.get('currency_code')
                           or (account.currency_code if account else None)
                           or default_currency_for(caller)),
            start_date=start_date or datetime.utcnow().date(),
            target_date=target_date,
            status='active',
        )

        try:
            db.session.add(goal)
            db.session.commit()
        except Exception:
            db.session.rollback()
            # The uniqueness index is the likely cause and it is the only one worth
            # naming, because it is a rule the user can act on rather than a fault.
            logger.exception('GoalList.post failed')
            return {
                'success': False,
                'error': 'Could not create this goal. An account can carry only one '
                         'active goal in each direction -- archive the existing one '
                         'first.',
            }, 400

        return {'success': True, 'goal': _serialize(goal, svc),
                'message': 'Goal created successfully'}, 201


@ns.route('/<int:id>')
class GoalDetail(Resource):
    @ns.doc('get_goal', security='Bearer')
    @jwt_required()
    def get(self, id):
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        svc = GoalService()
        svc.stamp_if_achieved(goal)
        return {'success': True, 'goal': _serialize(goal, svc)}, 200

    @ns.doc('update_goal', security='Bearer')
    @ns.expect(goal_model)
    @jwt_required()
    def put(self, id):
        """Update a goal. Seeing one and being allowed to change it differ.

        Checked AFTER the fetch, so a goal the caller cannot see answers 404 and a
        goal they can see but may not change answers 403 -- answering 404 to the
        second would mean the read scope had silently narrowed (D-43).
        """
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        if not can_manage_owned(goal.user_id, caller, account_id=goal.account_id):
            return {'success': False,
                    'error': 'Only the goal owner or a household admin can change '
                             'this goal'}, 403

        data = request.get_json() or {}
        if not data:
            return {'success': False, 'error': 'Request body required'}, 400
        validated, errors = validate_request(goal_input, data, partial=True)
        if errors:
            return validation_error_response(errors)

        svc = GoalService()
        try:
            if 'target_amount' in validated:
                svc.validate(start_amount=goal.start_amount,
                             target_amount=validated['target_amount'])
            start_date = ('start_date' in validated
                          and _parse_date(validated['start_date'], 'start_date'))
            target_date = ('target_date' in validated
                           and _parse_date(validated['target_date'], 'target_date'))
        except ValueError as exc:
            return {'success': False, 'error': str(exc)}, 400

        for field in ('name', 'kind', 'scope', 'target_amount', 'status'):
            if field in validated:
                setattr(goal, field, validated[field])
        # *** `start_amount` AND `account_id` ARE NOT UPDATABLE. *** Re-pointing a
        # goal at another account, or restating its start, silently rewrites the
        # denominator of a percentage the user has already been shown -- and for a
        # linked goal the original snapshot cannot be recovered. Archive and create.
        if 'current_manual' in validated and goal.account_id is None:
            goal.current_manual = validated['current_manual']
        if 'start_date' in validated:
            goal.start_date = start_date or goal.start_date
        if 'target_date' in validated:
            goal.target_date = target_date

        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('GoalDetail.put failed')
            return {'success': False, 'error': 'Could not update this goal'}, 400

        return {'success': True, 'goal': _serialize(goal, svc),
                'message': 'Goal updated successfully'}, 200

    @ns.doc('delete_goal', security='Bearer')
    @jwt_required()
    def delete(self, id):
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        if not can_manage_owned(goal.user_id, caller, account_id=goal.account_id):
            return {'success': False,
                    'error': 'Only the goal owner or a household admin can delete '
                             'this goal'}, 403
        db.session.delete(goal)
        db.session.commit()
        return {'success': True, 'message': 'Goal deleted successfully'}, 200


@ns.route('/<int:id>/archive')
class GoalArchive(Resource):
    @ns.doc('archive_goal', security='Bearer')
    @jwt_required()
    def post(self, id):
        """Archive a goal.

        Its own route rather than a status write, because archiving is the one
        transition a client may make and `status` also carries 'achieved', which the
        server stamps. A client that could write `status` freely could award itself
        a badge.

        Archiving is also what RELEASES the account for a new goal in the same
        direction -- the uniqueness index is `WHERE status = 'active'`.
        """
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        if not can_manage_owned(goal.user_id, caller, account_id=goal.account_id):
            return {'success': False,
                    'error': 'Only the goal owner or a household admin can archive '
                             'this goal'}, 403
        goal.status = 'archived'
        db.session.commit()
        return {'success': True, 'goal': _serialize(goal, GoalService()),
                'message': 'Goal archived successfully'}, 200
