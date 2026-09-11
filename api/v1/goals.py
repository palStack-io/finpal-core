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
from src.models.goal_account import GoalAccount
from src.services.goal.service import GoalService
from src.services.goal.peak import peak_payload
from src.services.goal.watermark import refresh_watermarks
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
    'account_ids': fields.List(
        fields.Integer,
        description='Several accounts, one goal (B12) -- "pay off my cards", "the '
                    'emergency fund across two savings accounts". Sent INSTEAD of '
                    '`account_id`; sending both uses this list. Every account must '
                    'be on the same side of zero: a card and a savings account net '
                    'to a figure that hides half the goal, and the server refuses '
                    'the set rather than computing it.'),
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


goal_account_model = ns.model('GoalAccountLink', {
    'account_id': fields.Integer(
        required=True,
        description='An account to add to this goal (B12). Its balance is '
                    'snapshotted NOW and extends the goal\'s denominator by that '
                    'amount, so the percentage moves for a stated reason instead '
                    'of jumping. Must be on the same side of zero as the accounts '
                    'already linked.'),
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
        # *** THE PRIMARY LINK, MAINTAINED BY THE SERVER, NEVER NULL FOR A LINKED
        # GOAL. *** Kept beside `accounts` for as long as a deployed client still
        # reads it. See `GoalService.sync_links`.
        'account_id': goal.account_id,
        # Presentational, and the reason a client does not need a second request.
        #
        # *** IT DESCRIBES THE SET, NOT THE PRIMARY, AND THAT IS THE MIGRATION
        # DOING ITS JOB. *** An unmigrated client renders this string; naming one
        # card out of three would be false, and NULL would render "Tracked by
        # hand" for a goal reading three accounts -- D-176's exact shape, where a
        # key a client already read optimistically switched on a wrong answer.
        # "3 accounts" is true on every client, migrated or not.
        'account_name': _account_name(goal),
        # B12. Shipped BESIDE the singular keys, not instead of them: that is what
        # makes this a migration rather than a break. Removing `account_id` and
        # `account_name` is a later, separate change, once both clients read this.
        'accounts': [
            {'id': link.account_id,
             'name': link.account.name,
             'start_amount': float(link.start_amount)}
            for link in sorted(goal.links or [],
                               key=lambda link: link.account_id)
        ],
        'target_amount': float(goal.target_amount),
        'start_amount': float(goal.start_amount),
        'current_manual': (float(goal.current_manual)
                           if goal.current_manual is not None else None),
        'currency_code': goal.currency_code,
        'start_date': goal.start_date.isoformat() if goal.start_date else None,
        'target_date': goal.target_date.isoformat() if goal.target_date else None,
        'status': goal.status,
        'achieved_at': goal.achieved_at.isoformat() if goal.achieved_at else None,
        # C1c. *** THE SERVER DECIDES THE MOUNTAIN BECAUSE THE CLIENT CANNOT. ***
        # The band comes from a SEEDED TABLE and the magnitude from balances and
        # APRs, neither of which a client holds -- the same reason `progress`,
        # `direction` and `current_amount` are computed here. Turning the
        # magnitude into a height is presentational and stays in the clients'
        # `mountainGeometry.ts`.
        #
        # Shipped as a nested block rather than flattened keys so that a client
        # can test for the whole feature at once: `peak` ABSENT means a backend
        # that predates mountains and must render the old card, which is a
        # different state from `unmeasured` and from a magnitude of zero. See
        # `src/services/goal/peak.py`.
        **peak_payload(goal),
        **svc.as_payload(goal),
    }


def _account_name(goal):
    """One name, or a count. Never NULL for a linked goal, never a lie."""
    links = goal.links or []
    if len(links) > 1:
        return f'{len(links)} accounts'
    if links:
        return links[0].account.name
    # The pre-backfill window, and the manual case.
    return goal.account.name if goal.account_id else None


def _load_accounts(caller_id, account_ids):
    """The caller's visible accounts for these ids, in the order given.

    Read scope, not the same-side set: linking is about an OWNED thing, and the
    caller must be able to see an account to point a goal at it.

    Returns `(accounts, error)`. Duplicates in the request are collapsed rather
    than refused -- sending the same card twice is a client bug, and counting its
    balance twice would be the double-counting this feature's index exists to
    stop, arriving through the front door.
    """
    seen, ordered = set(), []
    for account_id in account_ids:
        if account_id in seen:
            continue
        seen.add(account_id)
        ordered.append(account_id)

    accounts = []
    for account_id in ordered:
        account = Account.query.filter(
            Account.id == account_id,
            Account.user_id.in_(visible_user_ids(caller_id))).first()
        if account is None:
            return None, ({'success': False, 'error': 'Account not found'}, 404)
        accounts.append(account)
    return accounts, None


def _snapshot(account):
    """The balance the SERVER reads, never a figure from the body.

    A client-supplied start on a linked goal makes the denominator a typed number,
    which is the one thing linking exists to prevent -- and it cannot be corrected
    later, because the history needed to derive it is gone.
    """
    return account.balance if account.balance is not None else 0


MIXED_DIRECTION_ERROR = (
    'A goal cannot mix accounts you are paying DOWN with accounts you are '
    'building UP -- {debts} would be paid down while {savings} is built up, and '
    'one percentage over both would hide half the goal. Make two goals.'
)


def _mixed_direction_error(accounts, snapshots):
    """The 400 body, or None. Names BOTH sides, because "invalid set" is not
    something a user can act on."""
    if not GoalService.mixed_direction(snapshots):
        return None
    debts = ', '.join(a.name for a, s in zip(accounts, snapshots) if s < 0)
    savings = ', '.join(a.name for a, s in zip(accounts, snapshots) if s >= 0)
    return {'success': False,
            'error': MIXED_DIRECTION_ERROR.format(debts=debts, savings=savings)}


def _collision_report(account_ids, direction, exclude_goal_id=None):
    """Which of these accounts is already held, and by what. '' if none is.

    *** "ARCHIVE THE EXISTING ONE FIRST" WAS ACTIONABLE WHILE A GOAL HELD ONE
    ACCOUNT AND STOPS BEING SO WHEN IT HOLDS THREE. *** The uniqueness rule did
    not change -- one active goal per (account, direction), the same as B5 -- but
    the number of accounts a single refusal can be about did, and a user told
    that one of their three cards is spoken for cannot act on it. Run AFTER the
    rollback, so the session is clean and this is an ordinary read.
    """
    from src.models.goal_account import GoalAccount

    query = (db.select(Account.name, Goal.name)
             .select_from(GoalAccount)
             .join(Account, Account.id == GoalAccount.account_id)
             .join(Goal, Goal.id == GoalAccount.goal_id)
             .where(GoalAccount.account_id.in_(account_ids),
                    GoalAccount.active_direction == direction))
    if exclude_goal_id is not None:
        query = query.where(GoalAccount.goal_id != exclude_goal_id)
    held = db.session.execute(query).all()
    if not held:
        return ''
    return ' ' + ' '.join(
        f'{account_name} is already tracked by the active goal '
        f'“{goal_name}”.' for account_name, goal_name in held)



def _stamp(goal, svc):
    """Everything a goal path must stamp before it answers. D-187's single door.

    *** THREE STAMPS, ONE CALL, BECAUSE FIVE ROUTES EACH REMEMBERING THREE IS
    D-66's SHAPE. *** `stamp_if_achieved` was already called on the two READ
    paths, with a comment saying exactly why: *"nothing else runs when a balance
    moves, so a goal reached by an ordinary transaction would otherwise never be
    marked"*. That reasoning is the whole of D-187 -- and the watermarks, added
    later, were never given the same treatment. They are stamped here for the
    same reason and in the same place.

    *** THE WATERMARKS ARE SAFE ON A READ AND THE UNLOCKS ARE NOT. *** Both
    watermarks are `max(stored, current)`, so sampling them on a GET cannot
    change an answer -- and sampling them often is what makes *"the hardest it
    ever got"* true rather than approximately true, since a balance can spike
    and fall between two writes. A learnPal unlock INSERTS a row and makes
    content appear, so it never runs from here; `engine.py` says so in capitals
    and this respects it.

    Returns True if anything needs committing. The caller commits, because a
    write path already owns a transaction and a read path must not commit on
    every request for ever.
    """
    dirty = refresh_watermarks(goal)
    # `stamp_if_achieved` commits itself, on the transition only. Called second
    # so the watermark of a goal that reaches 100% on this very request is
    # already on the instance when it does.
    svc.stamp_if_achieved(goal)
    return dirty


def _unlock_lessons(goal):
    """learnPal's half, on a WRITE path only. A no-op when the module is off.

    *** THE IMPORT IS INSIDE THE FUNCTION AND THAT IS LOAD-BEARING. *** With
    `LEARNPAL_ENABLED` unset the module's models are never imported
    (`src/models/__init__.py`), so its tables do not exist; importing the engine
    at module scope would make a core route file depend on an optional module
    being installed.

    Does not commit -- the caller's transaction carries the unlocks, so a goal
    write and its unlocks land together or not at all.
    """
    # *** THE SAME READER `src/models/__init__.py` USES, NOT A SECOND ONE. ***
    # That file's conditional import is what decides whether the two learnPal
    # TABLES exist, so asking any other question here could produce "enabled"
    # for a database with no `learn_completions` to write to.
    from src.modules.learnpal.manifest import LearnPalModule
    if not LearnPalModule().is_enabled():
        return []
    try:
        from src.modules.learnpal.engine import evaluate_for_goal
        return evaluate_for_goal(goal)
    except Exception:
        # An optional module must never be the reason a goal write fails. The
        # nightly pass and the startup catch-up both re-run this.
        logger.exception('learnPal evaluation failed for goal %s', goal.id)
        return []


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
        #
        # *** THE TWO WATERMARKS NEEDED THE SAME TREATMENT AND NEVER GOT IT —
        # D-187. *** The sentence above is the entire argument for stamping
        # `highest_progress` and `hardest_band` here too, and they were added
        # later without it. One commit for the whole list rather than one per
        # goal, and only when something actually moved.
        dirty = False
        for goal in goals:
            dirty = _stamp(goal, svc) or dirty
        if dirty:
            db.session.commit()
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

        # B12: `account_ids` wins when both are sent, and an EMPTY list is a
        # manual goal -- not "fall back to the singular". A client that has
        # migrated says what it means with one key.
        if validated.get('account_ids') is not None:
            requested = list(validated['account_ids'])
        elif validated.get('account_id') is not None:
            requested = [validated['account_id']]
        else:
            requested = []

        accounts, error = _load_accounts(caller, requested)
        if error is not None:
            return error

        # *** THE SNAPSHOT, ONE PER ACCOUNT. *** `goals.start_amount` is their sum
        # and is maintained by `sync_links`; the per-row values are the immutable
        # fact underneath it. That is what makes "I forgot a card" answerable
        # later without restating a denominator the user has already seen.
        snapshots = [_snapshot(a) for a in accounts]

        # Refused BEFORE anything is written, and on the per-account signs rather
        # than on their sum -- a card at -1,650 and a savings account at +4,000
        # sum to a perfectly valid +2,350 and describe nothing that happened.
        mixed = _mixed_direction_error(accounts, snapshots)
        if mixed is not None:
            return mixed, 400

        if accounts:
            start_amount = sum(snapshots)
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
            # Overwritten by `sync_links` below with the primary link; set here
            # so a goal is never momentarily inconsistent between the two.
            account_id=accounts[0].id if accounts else None,
            target_amount=validated['target_amount'],
            start_amount=start_amount,
            # Meaningless on a linked goal, so it is not stored on one -- keeping a
            # figure the service will never read is how a stale number ends up
            # rendered by something that forgets which kind of goal it has.
            current_manual=(None if accounts
                            else validated.get('current_manual')),
            currency_code=(validated.get('currency_code')
                           or (accounts[0].currency_code if accounts else None)
                           or default_currency_for(caller)),
            start_date=start_date or datetime.utcnow().date(),
            target_date=target_date,
            status='active',
        )

        for account, snapshot in zip(accounts, snapshots):
            goal.links.append(GoalAccount(account_id=account.id,
                                          start_amount=snapshot,
                                          added_at=datetime.utcnow()))
        svc.sync_links(goal)
        # Captured BEFORE the commit: after a rollback the instance is expired,
        # and re-deriving the rule down in the handler is how a second copy of
        # `direction` gets written.
        attempted_direction = svc.direction(goal)

        try:
            db.session.add(goal)
            # *** FLUSHED, NOT COMMITTED, AND THE ORDER IS THE WHOLE POINT. ***
            # `unlocked_by_goal_id` needs the goal's primary key and a new goal
            # has none until it reaches the database -- and `refresh_watermarks`
            # reads `progress`, which autoflush would trigger anyway. Flushing
            # explicitly keeps the watermarks, the unlocks and the goal itself in
            # ONE transaction, so a collision that rolls the goal back cannot
            # leave a `learn_completions` row attributing a lesson to a goal that
            # does not exist (D-187).
            db.session.flush()
            refresh_watermarks(goal)
            _unlock_lessons(goal)
            db.session.commit()
        except Exception:
            db.session.rollback()
            # The uniqueness index is the likely cause and it is the only one worth
            # naming, because it is a rule the user can act on rather than a fault.
            # B12 widened WHICH account can trip it: the index is now on every
            # linked account and not only the primary, so a goal can be refused
            # because of its second or third card.
            logger.exception('GoalList.post failed')
            return {
                'success': False,
                'error': 'Could not create this goal. An account can carry only one '
                         'active goal in each direction.'
                         + (_collision_report([a.id for a in accounts],
                                              attempted_direction)
                            or ' Archive the existing goal first.'),

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
        if _stamp(goal, svc):
            db.session.commit()
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

        # *** `account_ids` IS REFUSED; `account_id` IS STILL SILENTLY IGNORED,
        # AND THE ASYMMETRY IS DELIBERATE. *** Both would rewrite the denominator
        # of a percentage the user has already been shown, so neither is applied.
        # The difference is who is sending them. `account_id` is on the update
        # payload of BOTH deployed clients today -- `GoalForm.tsx:111` sets it and
        # `Goals.tsx:321` includes it -- so refusing it would turn every goal edit
        # on every installed build into a 400, which is D-99's lesson run
        # backwards: the server must keep accepting what a deployed client
        # already sends. `account_ids` is new, nothing sends it, and the natural
        # way to write "edit this goal's accounts" in a client IS a PUT -- so
        # answering 'Goal updated successfully' having changed nothing would make
        # the client look correct while the goal is not what the screen says.
        # Task 8 is the code that would have written it.
        if 'account_ids' in validated:
            return {'success': False,
                    'error': "A goal's accounts cannot be changed here, because "
                             'that would restate a denominator the user has '
                             'already been shown. Use POST or DELETE on '
                             f'/goals/{id}/accounts.'}, 400

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

        goal_id = goal.id
        # B12: `status` and `target_amount` are both settable above and BOTH feed
        # the derived link fields -- status decides whether the accounts are held
        # at all, and the amounts decide in which direction. Committing without
        # this leaves an archived goal still holding every account it reads.
        svc.sync_links(goal)
        attempted_direction = svc.direction(goal) if goal.status == 'active' else None
        linked_ids = svc.linked_account_ids(goal)

        try:
            # Both watermarks and any unlock ride the SAME transaction as the
            # edit: an edit that moves `target_amount` moves `progress`, so the
            # goal can cross an altitude gate on this very request (D-187).
            refresh_watermarks(goal)
            _unlock_lessons(goal)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('GoalDetail.put failed')
            # Un-archiving, or moving `target_amount` across the direction
            # boundary, can both collide with a goal that took the account in the
            # meantime. Same treatment as create and add-account: name it, or the
            # user is told "could not update" about a goal reading three cards.
            report = (_collision_report(linked_ids, attempted_direction,
                                        exclude_goal_id=goal_id)
                      if attempted_direction else '')
            return {'success': False,
                    'error': 'Could not update this goal.' + (report or '')}, 400

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


@ns.route('/<int:id>/contributions')
class GoalContributions(Resource):
    @ns.doc('goal_contributions', security='Bearer')
    @jwt_required()
    def get(self, id):
        """Who put the money in, from `paid_by`.

        Its own route rather than a key on the goal payload: it is a second query
        per goal, and the list endpoint renders every goal a household has. Folding
        it in would make the common read pay for the rare one.

        Read-scoped like the goal itself -- if you can see the goal you can see who
        contributed to it, which is the whole point of a household goal.

        *** `imported: true` MUST BE SHOWN, NOT DROPPED. *** `paid_by` defaults to
        whoever created the row, so an imported row credits the importer rather
        than the payer. A client that renders the amount and ignores the flag tells
        one partner they contributed money the other actually paid.
        """
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        rows = GoalService().contributions(goal)
        return {
            'success': True,
            'currency_code': goal.currency_code,
            'contributions': [{**row, 'amount': float(row['amount'])}
                              for row in rows],
        }, 200


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
        svc = GoalService()
        # *** THIS IS WHAT "ARCHIVING RELEASES THE ACCOUNT" NOW MEANS. *** It used
        # to be a `WHERE status = 'active'` clause on the index over `goals`; with
        # the accounts on a join table there is no such clause, and the release is
        # `sync_links` writing NULL into every link's `active_direction`, where
        # NULLs do not collide. Drop this call and the goal holds its accounts for
        # ever, with nothing raising.
        svc.sync_links(goal)
        db.session.commit()
        return {'success': True, 'goal': _serialize(goal, svc),
                'message': 'Goal archived successfully'}, 200


@ns.route('/<int:id>/accounts')
class GoalAccounts(Resource):
    """Add an account to an existing goal (B12).

    Same shape and same permission predicate as the co-owner routes
    (`can_manage_owned`, read-scoped fetch first so an invisible goal answers 404
    and a visible-but-unmanageable one answers 403 -- answering 404 to the second
    would mean the read scope had silently narrowed, D-43).

    *** THIS IS THE OPERATION THE SINGLE-ACCOUNT MODEL FLATLY REFUSED, AND IT IS
    ONLY SAFE BECAUSE OF THE PER-ROW SNAPSHOT. *** `PUT /goals/<id>` will not move
    `account_id` and will not restate `start_amount`, because both rewrite the
    denominator of a percentage the user has already been shown. Adding an account
    here does move the denominator -- it grows by that account's balance AT THIS
    MOMENT, snapshotted by the server -- and that is honest in a way a restatement
    is not: the goal got bigger, and the percentage moves for a reason that can be
    named. Take the snapshot away and this route becomes the forbidden operation
    wearing a different hat (spec §2.1).
    """

    @ns.doc('add_goal_account', security='Bearer')
    @ns.expect(goal_account_model)
    @jwt_required()
    def post(self, id):
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        if not can_manage_owned(goal.user_id, caller, account_id=goal.account_id):
            return {'success': False,
                    'error': 'Only the goal owner or a household admin can change '
                             'this goal'}, 403

        data = request.get_json() or {}
        account_id = data.get('account_id')
        if not isinstance(account_id, int):
            return {'success': False, 'error': 'account_id is required'}, 400

        svc = GoalService()
        # *** A MANUAL GOAL CANNOT BE CONVERTED INTO A LINKED ONE HERE. *** Its
        # `start_amount` is a figure the user typed; replacing it with a snapshot
        # sum is exactly the restatement `PUT` refuses, and the typed history is
        # not recoverable afterwards. Archive it and create a linked goal.
        if not svc.linked_account_ids(goal):
            return {'success': False,
                    'error': 'This goal is tracked by hand, so it has no accounts '
                             'to add to. Create a linked goal instead.'}, 400

        accounts, error = _load_accounts(caller, [account_id])
        if error is not None:
            return error
        account = accounts[0]

        # Idempotent, like the co-owner grant next door -- and here it is load
        # bearing rather than merely tidy: re-adding an account that is already
        # linked would add its balance to the denominator a SECOND time, which is
        # the double-counting the index exists to stop, arriving through the
        # front door instead of through a second goal.
        if any(link.account_id == account.id for link in goal.links):
            return {'success': True, 'goal': _serialize(goal, svc),
                    'message': 'Account already linked to this goal'}, 200

        snapshot = _snapshot(account)
        existing = [(link.account, link.start_amount) for link in goal.links]
        mixed = _mixed_direction_error(
            [a for a, _ in existing] + [account],
            [s for _, s in existing] + [snapshot])
        if mixed is not None:
            return mixed, 400

        goal.links.append(GoalAccount(account_id=account.id,
                                      start_amount=snapshot,
                                      added_at=datetime.utcnow()))
        svc.sync_links(goal)
        attempted_direction = svc.direction(goal)
        goal_id = goal.id
        try:
            # *** FLUSHED FIRST, FOR THE SAME REASON THE CREATE PATH IS. *** The
            # `GoalAccount` appended above is a pending object, so `link.account`
            # is None until the row reaches the database -- and
            # `GoalService.current_amount` reads `link.account.balance` with no
            # guard. Without this flush the route raised an AttributeError,
            # caught it, and answered **400 "an account can carry only one
            # active goal in each direction"** -- a confident, specific and
            # entirely wrong explanation of a crash. Caught by
            # `test_adding_an_account_extends_the_denominator_by_ITS_BALANCE_NOW`
            # in the full suite, not by the new tests.
            db.session.flush()
            # Adding a card changes the magnitude the band is read from, so this
            # is one of the paths that can make a goal a harder mountain than it
            # has ever been (D-187).
            refresh_watermarks(goal)
            _unlock_lessons(goal)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('GoalAccounts.post failed')
            return {
                'success': False,
                'error': 'Could not add this account. An account can carry only '
                         'one active goal in each direction.'
                         + (_collision_report([account.id], attempted_direction,
                                              exclude_goal_id=goal_id)
                            or ' Archive the other goal first.'),
            }, 400

        return {'success': True, 'goal': _serialize(goal, svc),
                'message': 'Account added to goal'}, 200


@ns.route('/<int:id>/accounts/<int:account_id>')
class GoalAccountDetail(Resource):
    @ns.doc('remove_goal_account', security='Bearer')
    @jwt_required()
    def delete(self, id, account_id):
        """Unlink an account, shrinking the denominator by ITS OWN snapshot.

        The mirror of the add, and the reason the snapshot is stored per row
        rather than as one total: without the per-account starts, the sum could
        never be corrected downwards and removing an account would be
        unimplementable at any price (spec §2.1).
        """
        caller = get_jwt_identity()
        goal = _find_visible(id, caller)
        if goal is None:
            return {'success': False, 'error': 'Goal not found'}, 404
        if not can_manage_owned(goal.user_id, caller, account_id=goal.account_id):
            return {'success': False,
                    'error': 'Only the goal owner or a household admin can change '
                             'this goal'}, 403

        link = next((l for l in goal.links if l.account_id == account_id), None)
        if link is None:
            return {'success': False,
                    'error': 'That account is not linked to this goal'}, 404
        # *** REMOVING THE LAST ONE IS NOT AN UNLINK, IT IS A CONVERSION. *** The
        # goal would become manual with a denominator nobody typed, and a linked
        # goal's honesty is the whole argument for linking (points are awarded for
        # linked goals only). Archive it instead; the refusal says so.
        if len(goal.links) == 1:
            return {'success': False,
                    'error': "A goal must keep at least one account. Archive the "
                             'goal instead of unlinking its last account.'}, 400

        svc = GoalService()
        goal.links.remove(link)
        svc.sync_links(goal)
        # Unlinking can only lower the current figure, and both watermarks refuse
        # to fall -- so this call cannot shrink a mountain. It is here because
        # `progress` moves too, and the goal may cross an altitude gate upward
        # when the account holding it back is removed (D-187).
        refresh_watermarks(goal)
        _unlock_lessons(goal)
        db.session.commit()
        return {'success': True, 'goal': _serialize(goal, svc),
                'message': 'Account removed from goal'}, 200
