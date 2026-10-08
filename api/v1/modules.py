"""The module catalogue, and the data statement that rides with it.

*** ONE REQUEST, BECAUSE ONE SCREEN NEEDS BOTH. *** Onboarding's module step and
its data statement are drawn in the same flow, and the Settings rows that show
them later are on the same page. A second round trip would buy nothing.

*** THE PROSE LIVES HERE AND NOT IN EITHER CLIENT — OWNER DECISION, 2026-09-13.
*** Copy inside a mobile client needs a store build to reword, and iOS EAS is
withheld. `src/services/onboarding/copy.py` is the only place any of these
strings is spelled; a client that cannot reach this endpoint renders NOTHING
rather than a hardcoded fallback, because a promise is the one string that must
never be a client's guess.

*** WHAT "ENABLED" MEANS HERE IS DEPLOYMENT, NOT ENTITLEMENT AND NOT PREFERENCE.
*** Three different questions, and this endpoint answers only the first:

    is_enabled()          does this DEPLOYMENT run the module  <- this payload
    UserModuleAccess      MAY the user have it                 (entitlement)
    UserModulePreference  does the user WANT to see it          (preference)

So a self-hoster who has not switched learnPal on gets a catalogue without it,
and the onboarding step cannot offer a toggle for something the server does not
run. Effective visibility is still `deployment AND entitled AND preferred`, and
this contributes the first term only.

Returns `{'error': ...}` explicitly, like every other handler here: web-ui reads
`err.response?.data?.error` and restx would answer `{'message': ...}`.
"""
import logging

from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource

from src.services.onboarding.copy import (
    DATA_STATEMENT, MODULE_COPY, ORIENTATION,
)

logger = logging.getLogger(__name__)

ns = Namespace('modules', description='What this deployment runs, and what finPal does with your data')


@ns.route('/catalog')
class ModuleCatalog(Resource):
    @ns.doc('module_catalog')
    def get(self):
        """What this deployment runs, with the intro copy for each — plus the
        data statement.

        *** UNAUTHENTICATED ON PURPOSE. *** It carries no user data at all: the
        same bytes for every caller on a given deployment. Onboarding's first
        screens run before a session is fully settled on mobile, and a 401 on
        the screen that states what finPal does with your money would be the
        least reassuring possible failure mode. Nothing here is a secret — the
        module list is visible in the UI and the copy is in a public repo.
        """
        try:
            from src.modules.registry import module_registry
            enabled = [m for m in module_registry.modules if m.is_enabled()]
        except Exception:
            # An optional-module registry failing must not take down the screen
            # that explains the product. The statement is the important half and
            # it does not depend on the registry at all.
            logger.exception('module catalog: registry unavailable')
            enabled = []

        modules = []
        for module in enabled:
            copy = MODULE_COPY.get(module.name)
            if copy is None:
                # *** A MODULE WITH NO COPY IS OMITTED, NOT SHOWN BLANK. ***
                # pointsPal and learnPal are written; a third module arriving
                # without prose would otherwise render an empty card on the
                # first screen a user sees.
                logger.warning(
                    'module catalog: %r is enabled but has no copy in '
                    'src/services/onboarding/copy.py — omitted', module.name)
                continue
            modules.append({
                'slug': module.name,
                'name': copy['name'],
                'intro': copy['intro'],
                'gives': copy['gives'],
            })

        return {
            'success': True,
            'modules': modules,
            # The key is `data` because that is what the user calls it. The
            # client renders heading + lines verbatim and adds nothing.
            'data': DATA_STATEMENT,
            # The five orientation screens. Same reasoning as the module copy:
            # a client holding it could only be corrected by shipping.
            'orientation': ORIENTATION,
            'first_acts': _first_acts(),
        }


def _first_acts():
    """The three acts base camp offers, taken from the REGISTRY.

    *** DERIVED, NOT RETYPED, SO THE CLOSING SCREEN CANNOT PROMISE AN ACT THAT
    NO LONGER EXISTS. *** These are the three highest-ceiling UNIVERSAL acts —
    universal because base camp's audience is a user with no data at all, and a
    conditional act ("know what your debt costs") is dormant for someone with no
    cards and would read as a task they are failing (§4.2.1).

    *** THE CEILING IS NOT SENT. *** It is a denominator finPal chose, and
    decision 5 forbids one unless the user picked the target; it only orders the
    list here. The title is a statement of what to do, which is all the screen
    needs.
    """
    from src.services.literacy.acts import ACTS
    universal = [a for a in ACTS.values() if a.universal]
    universal.sort(key=lambda a: -a.ceiling)
    return [{'slug': a.slug, 'title': a.title} for a in universal[:3]]


def _enabled_module_names():
    """The modules switched on for this deployment (a module page's guide follows it)."""
    try:
        from src.modules.registry import module_registry
        return {m.name for m in module_registry.modules if m.is_enabled()}
    except Exception:
        # A registry that cannot answer must not take the guides down with it; no module
        # pages is the conservative reading.
        logger.exception('guides: module registry unavailable')
        return set()


@ns.route('/guides')
class Guides(Resource):
    @jwt_required()
    def get(self):
        """Every page guide in the caller's language, and what they have finished.

        *** ONE LANGUAGE, NEVER BOTH. *** The client's `?lang=` first, then the browser's
        header, then English. Core has no saved user locale, and its web UI has no language
        layer, so it asks for `en`; Spanish is served for the day it does.
        """
        from flask import request
        from src.services.onboarding.guide_state import guide_state
        from src.services.onboarding.guides import guides_for, resolve_lang

        user_id = get_jwt_identity()
        lang = resolve_lang(request.args.get('lang'), request.headers.get('Accept-Language'))
        return {'pages': guides_for(lang, _enabled_module_names()), 'lang': lang,
                **guide_state(user_id)}, 200


def _guide_write(action, page):
    from src.services.onboarding import guide_state as state
    try:
        return getattr(state, action)(get_jwt_identity(), page), 200
    except ValueError:
        return {'error': f'No guide for {page!r}'}, 404


@ns.route('/guides/<string:page>/dismiss')
class GuideDismiss(Resource):
    @jwt_required()
    def post(self, page):
        """Dismiss one page's card, for good and on every device. Idempotent."""
        return _guide_write('dismiss_guide', page)


@ns.route('/guides/<string:page>/tour')
class GuideTour(Resource):
    @jwt_required()
    def post(self, page):
        """Record that this user has finished (or skipped) the tour. Idempotent."""
        return _guide_write('complete_tour', page)

