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
from decimal import Decimal

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource, fields

from src.extensions import db
from src.repositories.coins import CoinRepository
from src.services.literacy.acts import ACTS, award_for_surface
from src.services.literacy.gear import GEAR_PRICES
from src.services.literacy.everest import altitude_for
from src.services.literacy.teaching import ACT_TOPIC, panel_for

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


refresh_request = ns.model('CoinRefreshRequest', {
    'surface': fields.String(
        required=True, example='transactions',
        description='Which page the user just acted on. The server owns the '
                    'surface-to-acts map; an unknown surface awards nothing.'),
})

ack_request = ns.model('CoinAckRequest', {
    'act_slug': fields.String(
        required=True, example='has_a_goal',
        description='The act whose award the user has now been shown.'),
})


def _payoff(user_id, act):
    """One act's sentence, or `None`. *** FAIL-CLOSED, AND THE ONLY CALLER OF
    `act.payoff`. *** No computable consequence, no sentence -- four payoffs
    were caught on 2026-09-14 claiming an act was done beside `coins: 0`, and a
    fallback anywhere would reinstate that.
    """
    if act is None:
        return None
    try:
        return act.payoff(user_id)
    except Exception:
        logger.exception('coins: payoff for %r raised — omitted', act.slug)
        return None


def _teaching_unseen(user_id, topic):
    """`True` when this user has never been shown that explanation.

    *** ASKED PER REQUEST RATHER THAN CACHED. *** It is one indexed lookup, and
    the alternative is a second copy of a fact one table already determines.
    """
    from src.models.act_event import TeachingSeen
    return TeachingSeen.query.filter_by(
        user_id=user_id, topic=topic).first() is None


def _render_awards(user_id, pairs, revealed_by_slug=None):
    """`[(slug, coins)]` -> the award objects both `/refresh` and `unseen` send.

    *** ONE BUILDER, BECAUSE THE FAIL-CLOSED PAYOFF RULE IS LOAD-BEARING. *** A
    second copy would eventually grow a friendly fallback sentence.

    `revealed_by_slug` lets a caller that has ALREADY computed these sentences
    hand them over. The wallet has: it walks every act to build `acts`, and
    `unseen` is a subset of the same list. Payoff functions query the database,
    so recomputing them was a second round of queries for sentences already in
    hand.
    """
    out = []
    # *** ONCE PER REWARD TYPE, SO AT MOST ONE AWARD IN A BATCH CARRIES IT. ***
    # Two awards landing together would otherwise both explain what a coin is.
    teach_coins = _teaching_unseen(user_id, ACT_TOPIC) if pairs else False
    teach_used = False
    for slug, coins in pairs:
        act = ACTS.get(slug)
        if revealed_by_slug is not None and slug in revealed_by_slug:
            revealed = revealed_by_slug[slug]
        else:
            revealed = _payoff(user_id, act)
        # The client's own render condition, mirrored here: `CoinAward` returns
        # null unless there is a sentence AND coins to report.
        renders = bool(revealed) and int(coins) > 0

        out.append({
            'slug': slug,
            'title': act.title if act else slug,
            'coins': int(coins),
            'revealed': revealed,
            # *** THE TEACHING RIDES ON THE AWARD, NOT ON A SECOND REQUEST. ***
            # `CoinAward` renders it as a PANEL inside itself rather than a
            # modal over it (§14.6): the payoff sentence IS the lesson
            # (decision 6), and a popup on top of it competes with the thing
            # it exists to support.
            # *** ATTACHED ONLY TO AN AWARD THAT WILL ACTUALLY RENDER, AND
            # THAT QUALIFIER IS THE WHOLE FIX. *** Found on the demo, in a
            # browser: the award appeared and the panel did not. The first
            # unseen award was `has_a_goal`, whose payoff is `None`, and
            # `CoinAward` renders NOTHING when `revealed` is null — by design,
            # because a sentence finPal cannot justify is worse than silence.
            # The client therefore skipped it and showed the next award, which
            # carried no `teach`. So the one-time explanation was silently
            # DROPPED for any user whose first unseen award happened to have no
            # computable consequence — and it would never come back, because
            # nothing was acked and nothing errored.
            #
            # *** NO TEST COULD HAVE CAUGHT THIS. *** Every unit test asserted
            # `awarded[0]['teach']`, which was correct. The defect lived in the
            # gap between what the server offers and what the client renders.
            'teach': (panel_for(ACT_TOPIC)
                      if teach_coins and not teach_used and renders else None),
        })
        if teach_coins and not teach_used and renders:
            teach_used = True
    return out


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
    # Payoff sentences are database queries. `unseen` is a subset of the acts
    # walked below, so remember each one rather than asking twice.
    revealed_by_slug = {}
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
        revealed = _payoff(user_id, act)
        revealed_by_slug[slug] = revealed

        # *** `open` IS A BIT, NOT A FRACTION, AND THAT IS WHY IT IS ALLOWED.
        # *** The cairn needs to know whether there is still something to do on
        # a page, and the client CANNOT work that out: no ceiling and no
        # coverage go on the wire, by decision 5, so `coins: 600` is
        # indistinguishable from finished. One boolean answers it and leaks
        # nothing — a bit plus an earned total cannot reconstruct a ceiling, so
        # no client can render "14 of 35" from this.
        # *** FAIL OPEN, NOT FAIL FINISHED, AND THE FIRST VERSION OF THIS GOT
        # IT BACKWARDS. *** It set `is_open = False` on a raising predicate
        # while the comment beside it claimed the opposite — a broken act would
        # have told the user the job was done. Telling somebody a thing is
        # finished on the strength of a crash is the one direction that cannot
        # be recovered from: they never go back to the page. A spurious cairn
        # costs a wasted visit; a missing one costs the act.
        try:
            covered = act.coverage(user_id)
            is_open = covered is not None and Decimal(str(covered)) < 1
        except Exception:
            logger.exception('coins: coverage for %r raised — shown as open',
                             slug)
            is_open = True

        acts.append({
            'slug': slug,
            'title': act.title,
            'coins': int(row.coins) if row else 0,
            'open': is_open,
            # The page identities this act can be worked on. A name, not a
            # count: the client uses it to place a cairn, never to score.
            'surfaces': list(act.surfaces),
            # *** THE SENTENCE, NOT A SCORE. *** `None` when finPal cannot
            # compute the consequence, and the client renders nothing.
            'revealed': revealed,
        })

    return {
        'earned': repo.earned(user_id),
        'balance': repo.balance(user_id),
        'acts': acts,
        # *** WHAT GIVES A CRON AWARD ITS MOMENT. *** The user was asleep at
        # 04:30; without this the award simply never happened as far as they
        # could tell. Same objects `/refresh` returns, same builder, so the
        # fail-closed payoff rule cannot drift between the two.
        'unseen': _render_awards(user_id, repo.unseen(user_id),
                                 revealed_by_slug),
        'gear': [
            {'slug': slug, 'price': price, 'owned': slug in owned}
            for slug, price in GEAR_PRICES.items()
        ],
        # *** EVEREST RIDES ON THE WALLET RATHER THAN ITS OWN ENDPOINT. *** Kit
        # and the dashboard both already read this payload and both draw the
        # altitude, so a second round trip would be a latency budget spent on
        # nothing — the same reasoning this function's own docstring gives.
        #
        # *** IT IS THE ONE FIGURE IN THIS PRODUCT ALLOWED A CEILING, AND ONLY
        # BECAUSE OF WHAT IT MEASURES. *** 8,849 m is a shared public fact,
        # identical for every user and derived from nobody's money. Decision 5
        # forbids a denominator finPal chose about the USER'S FINANCES; this one
        # is about effort and says nothing about anyone's money.
        'everest': altitude_for(user_id),
    }


@ns.route('')
class Coins(Resource):
    @jwt_required()
    def get(self):
        """The wallet: coins earned, the acts, the shop and the climb.

        *** A GET THAT WRITES, DELIBERATELY AND NARROWLY. *** `altitude_for`
        raises Everest's watermark, and a ratchet persisted only by a POST
        would lose height every time a user merely looked at the page. The
        write is idempotent and monotonic, so a repeated GET costs nothing and
        can never lower anything.
        """
        payload = _wallet(get_jwt_identity())
        db.session.commit()
        return payload, 200


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


@ns.route('/refresh')
class CoinRefresh(Resource):
    @ns.expect(refresh_request, validate=False)
    @jwt_required()
    def post(self):
        """Award anything this surface just made true, and say what it revealed.

        *** THIS IS THE AWARD MOMENT. *** Before it, the only production caller
        of the award pass was a cron at 04:30, so a user categorised forty
        transactions and the coins arrived overnight on a page they were not
        looking at.

        *** IDEMPOTENT, BECAUSE `upsert_award` IS A RATCHET. *** Calling this
        twice awards nothing twice, which is what makes correctness independent
        of the client: one that forgets loses the MOMENT, never the COINS --
        the 04:30 pass collects them, and is deliberately unchanged.

        *** NO DENOMINATOR ON THE WIRE, SAME AS THE WALLET. *** No ceiling and
        no coverage fraction, so no client can reconstruct "14 of 35".
        """
        user_id = get_jwt_identity()
        payload = request.get_json(silent=True) or {}
        surface = payload.get('surface')
        if not isinstance(surface, str) or not surface:
            return {'error': 'A surface is required.'}, 400

        earned = award_for_surface(user_id, surface)
        db.session.commit()

        repo = CoinRepository()
        return {
            'awarded': _render_awards(user_id, earned),
            'earned': repo.earned(user_id),
            'balance': repo.balance(user_id),
        }, 200


@ns.route('/ack')
class CoinAck(Resource):
    @ns.expect(ack_request, validate=False)
    @jwt_required()
    def post(self):
        """Mark one award as shown. Ratchet-only; it can never un-show."""
        user_id = get_jwt_identity()
        payload = request.get_json(silent=True) or {}
        slug = payload.get('act_slug')

        repo = CoinRepository()
        if not slug or repo.award_row(user_id, slug) is None:
            return {'error': 'No such award.'}, 404

        repo.ack(user_id, slug)

        # *** THE PANEL WAS DISMISSED WITH THE AWARD, SO IT IS SEEN. *** One
        # endpoint rather than two, because the client cannot dismiss one
        # without the other: the teaching is rendered INSIDE the award.
        from src.models.act_event import TeachingSeen
        if _teaching_unseen(user_id, ACT_TOPIC):
            db.session.add(TeachingSeen(user_id=user_id, topic=ACT_TOPIC))

        db.session.commit()
        return {'acknowledged': slug}, 200
