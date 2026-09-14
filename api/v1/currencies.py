"""The currencies this deployment actually stocks.

*** THERE WAS NO CURRENCY ROUTE AT ALL, AND THAT IS WHY THREE LISTS DISAGREED
(D-215, D-217). *** Checked against a real `url_map` rather than by grepping:
`[r for r in app.url_map.iter_rules() if 'curren' in str(r)]` returned nothing.
`currencies` is seeded by `create_default_currencies()` and re-seeded on every
boot by `_seed_reference_data`, so the server has always known the answer and
has never been able to say it. Each client therefore hardcoded its own guess:

    src/cli.py                        22 codes   (the seed, and the truth)
    mobile/src/utils/money.ts         20 codes   (derived from a symbol table)
    web-ui/src/config/branding.ts      6 codes   (a union of 7, minus JPY)

Two of mobile's twenty had no row at all, so picking Turkish Lira or Russian
Ruble was a foreign-key violation — a 500 that left onboarding incomplete
(D-215). A list that is not the server's list cannot be kept right by review.

*** SO THIS ENDPOINT IS THE PICKER'S SOURCE, AND THE SEED IS ITS SOURCE. ***
Owner instruction, 2026-09-14: *"we need to stick the number of currencies thats
on our backend, i think we manually seed it right"*. Yes — manually seeded, and
now served.

*** AUTHENTICATED, UNLIKE THE MODULE CATALOGUE. *** That one is unauthenticated
because a first-run screen states what finPal does with your money before a
session has settled. Nothing signed-out asks for a currency: registration does
not offer one, and both clients' pickers are behind a login. The narrower
default is the right one when no surface needs the wider.
"""
import logging

from flask_jwt_extended import jwt_required
from flask_restx import Namespace, Resource

from src.models.currency import Currency

logger = logging.getLogger(__name__)

ns = Namespace('currencies', description='The currency codes this deployment stocks')


@ns.route('/')
class CurrencyList(Resource):
    @ns.doc('list_currencies', security='Bearer')
    @jwt_required()
    def get(self):
        """Every currency a user may choose, straight off the table the foreign
        keys point at.

        *** READ FROM THE TABLE, NOT FROM THE SEED LIST. *** An operator can add
        a row — `CurrencyService.add_currency` exists — and a picker built from
        `create_default_currencies()` would not show it while
        `is_a_known_currency()` accepted it. The FK is what decides, so the FK's
        table is what is served.

        *** ONE RULE, WITH THE TRAILING SLASH, LIKE EVERY OTHER LIST HERE
        (`/accounts/`, `/goals/`). *** Declaring both spellings is two handlers
        for one path, and `_assert_no_new_duplicate_routes` refuses it — it
        caught this on the first run and the answer is to comply, not to add an
        exemption. Flask redirects the slashless spelling onto this rule, so a
        client that omits it still arrives; the reverse would 404.
        """
        try:
            rows = Currency.query.order_by(Currency.code).all()
        except Exception:
            logger.exception('currency list: query failed')
            return {'error': 'Could not read the currency list'}, 500

        return {
            'success': True,
            'currencies': [
                {
                    'code': row.code,
                    'name': row.name,
                    # The symbol is the server's too, for the same reason the
                    # code is: a client rendering '₺' from its own table while
                    # the server calls it something else is the drift this
                    # endpoint exists to end.
                    'symbol': row.symbol,
                }
                for row in rows
            ],
        }
