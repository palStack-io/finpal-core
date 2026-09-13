"""Everything finPal guessed, in one place, so it can be confirmed or corrected.

*** THREE PATHS, AND THE GET IS THE ONLY ONE THE NAV NEEDS. *** `GET /review`
answers both "what is there to review?" and "is there anything at all?", so the
nav badge costs no extra round trip. Three endpoints answering three counts is
how a badge ends up flickering on every load.

*** A CONFIRM ANSWERS WITH THE WHOLE REFRESHED PAYLOAD, DELIBERATELY. *** The
obvious design returns `{'success': true}` and lets the client decrement its own
count — which is D-101 in miniature: the server owns the totals, and two clients
subtracting independently is two chances to disagree. Handing back the same shape
`GET` returns means the page re-renders from the server after every action and
cannot drift from it.

*** AND THE TWO REFUSALS ARE NOT THE SAME STATUS. ***

  * **403** — `ReviewNotPermitted`: the account belongs to another member. The
    page CORRECTLY shows it (reads stay household-wide, or D-43 comes back), so
    the client needs to say *why* clicking did nothing.
  * **200 with `changed: false`** — there was nothing to confirm. Two tabs open,
    or a second click. That is not an error and must not be dressed as one.

Collapsing those two is the defect this file was written to avoid: silence on a
row the page had just offered. `describe_refusal` (D-161) makes the same
distinction one layer down — two refusals that ask for different actions get two
answers.

Every handler returns `{'error': ...}` explicitly rather than letting restx shape
it: web-ui reads `err.response?.data?.error`, and restx answers `{'message': ...}`.
"""
import logging

from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource

from src.services.review.service import (ReviewNotPermitted, build_review,
                                         confirm_account, confirm_category)

logger = logging.getLogger(__name__)

ns = Namespace('review', description='Confirm or correct what finPal guessed')


def _payload(caller_id, changed=None):
    """The page, optionally with the outcome of the action that just ran."""
    body = build_review(caller_id)
    if changed is not None:
        body['changed'] = changed
    return body


@ns.route('/')
class Review(Resource):
    @jwt_required()
    def get(self):
        """Everything finPal guessed and the caller may answer for."""
        try:
            return _payload(get_jwt_identity()), 200
        except Exception:
            logger.exception('Failed to build the review page')
            return {'error': 'Could not load your review list'}, 500


class _Confirm(Resource):
    """The shared body of both confirmations.

    *** THE TWO CONFIRMATIONS USE OPPOSITE PERMISSION RULES AND THAT LIVES IN THE
    SERVICE, NOT HERE. *** A category is household property with no owner (D-20);
    an account is assignable to a member and is owner-or-admin. Only the HTTP
    translation is shared — putting the predicates here would give a reader two
    routes that look identical and hide the one difference that matters.
    """

    _confirm = None
    _what = 'row'

    @jwt_required()
    def post(self, item_id):
        caller_id = get_jwt_identity()
        try:
            changed = type(self)._confirm(caller_id, item_id)
        except ReviewNotPermitted as refusal:
            # 403, not 200: the page shows this row on purpose, so "nothing
            # happened" without a reason is the thing to avoid.
            return {'error': str(refusal)}, 403
        except Exception:
            logger.exception('Failed to confirm %s %s', self._what, item_id)
            return {'error': f'Could not confirm that {self._what}'}, 500
        return _payload(caller_id, changed=changed), 200


@ns.route('/categories/<int:item_id>/confirm')
class ConfirmCategory(_Confirm):
    _confirm = staticmethod(confirm_category)
    _what = 'category'


@ns.route('/accounts/<int:item_id>/confirm')
class ConfirmAccount(_Confirm):
    _confirm = staticmethod(confirm_account)
    _what = 'account'
