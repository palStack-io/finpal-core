"""Coins: what you have earned, what each act revealed, and what you can buy.

*** NO DENOMINATOR GOES ON THE WIRE. *** No act's ceiling, no total, no `n of m`
— **a client must not be able to reconstruct one**, which is why the coverage
fraction is not sent either. Design decision 5 says no denominator unless the
user chose the target, and `SECTION_LIMIT` was kept off the Review payload on
exactly this reasoning. What IS sent is the coins earned so far and the sentence
the act revealed, because both are statements rather than scores.

*** A DORMANT ACT IS ABSENT FROM THE LIST, NOT PRESENT WITH A ZERO. *** A
debt-free user has no `debt_rates` row at all. Sending one at zero would render
as something they are failing at.

**The one price that IS sent is gear**, because a gear price is a target the
user chose — the only place decision 5 permits a progress bar.

Every handler returns `{'error': ...}` explicitly rather than letting restx shape
it: web-ui reads `err.response?.data?.error`, and restx answers `{'message': ...}`.
"""
import logging

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource, fields

from src.extensions import db
from src.repositories.coins import CoinRepository
from src.services.literacy.acts import ACTS
from src.services.literacy.gear import GEAR_PRICES

logger = logging.getLogger(__name__)

ns = Namespace('coins', description='Coins earned for understanding your own money')

# *** DECLARED SO A GENERATED CLIENT KNOWS WHAT TO SEND. ***
# `test_every_request_body_is_documented.py` fails on a handler that reads a
# body and documents none — a route a client can find and cannot call is worse
# than one it cannot find. And D-151 is what happens when the declared shape and
# the handler disagree: a client followed the docs, got 200, and had every field
# silently discarded. **This declares what the handler actually reads.**
purchase_request = ns.model('CoinPurchaseRequest', {
    'gear_slug': fields.String(
        required=True, example='rope',
        description='Which piece of gear to buy. Must be a slug in GEAR_PRICES.'),
})


def _wallet(user_id):
    """Everything the purse, the act list and the shop need, in one payload.

    One request rather than three, for the same reason `range_for_user` is one:
    the client draws these together and three round trips to paint one screen is
    a latency budget spent on nothing.
    """
    repo = CoinRepository()
    awarded = {row.act_slug: row for row in repo.awards(user_id)}
    owned = repo.owned_gear(user_id)

    acts = []
    for slug, act in ACTS.items():
        row = awarded.get(slug)
        if row is None:
            # Never earned. It is either dormant or untouched; ask the coverage
            # function which, so a dormant act stays absent.
            try:
                if act.coverage(user_id) is None:
                    continue
            except Exception:
                logger.exception('coins: coverage for %r raised — omitted', slug)
                continue
        try:
            revealed = act.payoff(user_id)
        except Exception:
            logger.exception('coins: payoff for %r raised — omitted', slug)
            revealed = None
        acts.append({
            'slug': slug,
            'title': act.title,
            'coins': int(row.coins) if row else 0,
            # *** THE SENTENCE, NOT A SCORE. *** `None` when finPal cannot
            # compute the consequence, and the client renders nothing.
            'revealed': revealed,
        })

    return {
        'earned': repo.earned(user_id),
        'balance': repo.balance(user_id),
        'acts': acts,
        'gear': [
            {'slug': slug, 'price': price, 'owned': slug in owned}
            for slug, price in GEAR_PRICES.items()
        ],
    }


@ns.route('')
class Coins(Resource):
    @jwt_required()
    def get(self):
        """The wallet: coins earned, the acts, and the shop."""
        return _wallet(get_jwt_identity()), 200


@ns.route('/purchase')
class CoinPurchaseResource(Resource):
    @ns.expect(purchase_request, validate=False)
    @jwt_required()
    def post(self):
        """Buy one piece of gear.

        *** 402 AND 409 ARE DIFFERENT ANSWERS AND MUST NOT BE COLLAPSED. ***
        *you cannot afford this yet* and *you already own this* ask the user for
        completely different things, and a single 400 would leave the client
        guessing — the same distinction the Review page draws between a refusal
        and a no-op.
        """
        user_id = get_jwt_identity()
        payload = request.get_json(silent=True) or {}
        slug = payload.get('gear_slug')

        price = GEAR_PRICES.get(slug)
        if price is None:
            return {'error': 'No such piece of gear.'}, 404

        repo = CoinRepository()
        if slug in repo.owned_gear(user_id):
            return {'error': 'You already own that.'}, 409
        if repo.balance(user_id) < price:
            return {'error': 'Not enough coins yet.'}, 402

        if not repo.purchase(user_id, slug, price):
            db.session.rollback()
            return {'error': 'That purchase could not be completed.'}, 409

        db.session.commit()
        return {'gear_slug': slug, 'balance': repo.balance(user_id)}, 200
