"""pointsPal's community acts, and the two rules that govern them.

*** RULE ONE: COINS ARE NEVER AWARDED ON `submitted_to_community`. *** §5.1
proved that flag means "a URL was built" and nothing more — `generate_pr_url`
sets it in the same function that builds the link, with no outbound call
anywhere. Paying on it would mint currency for pressing a button, and a
community dataset's entire value is accuracy. You get volume, not accuracy.

*** RULE TWO: THE PRIVACY RULE, WHICH §5.1 ASKS FOR AS A TEST RATHER THAN A
COMMENT. *** D-91 put the card's last four in a PUBLIC issue, twice, while the
UI promised "No personal data is shared." Paying people to share raises the
stakes on that promise, so no act here may read, send or reward a card
identifier.
"""
from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.modules.pointspal import acts as pp_acts
from src.modules.pointspal.models import PointsProgram, UserCard
from src.services.literacy.acts import ACTS
from tests.factories import UserFactory

USER = 'pp@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='PP', password_plain='testpassword')
    _db.session.commit()
    return u


def _card(user_id, program_id=None, override=None, verified=None,
          submitted=False):
    c = UserCard(user_id=user_id, program_id=program_id,
                 submitted_to_community=submitted,
                 user_last_verified_at=verified)
    if override:
        c.set_earn_override(override)
    _db.session.add(c)
    _db.session.commit()
    return c


# ══════════════════════════════════════════════════════════════════════
# The hook itself — D-187's shape, three times over
# ══════════════════════════════════════════════════════════════════════

def test_the_module_acts_ACTUALLY_REACH_the_registry(app):
    """*** `get_acts()` HAD NO CALLER AT ALL BEFORE 2026-09-17. ***

    `ModuleBase` defined the hook and `acts.py`'s docstring promised modules
    could contribute through it, and nothing ever invoked it — so a module
    returning acts would have been ignored in silence. That is D-187's shape
    inside the very mechanism built to extend the registry.
    """
    assert 'card_rewards_recorded' in ACTS
    assert 'program_verified' in ACTS


def test_the_module_acts_are_CONDITIONAL(app):
    """A user who does not own pointsPal must still afford the whole kit
    (§7.2), so neither of these may be universal."""
    assert ACTS['card_rewards_recorded'].universal is False
    assert ACTS['program_verified'].universal is False


def test_they_declare_the_pointspal_surface(app):
    from src.services.literacy.acts import SURFACES, surface_acts
    assert 'pointspal' in SURFACES
    slugs = {a.slug for a in surface_acts('pointspal')}
    assert {'card_rewards_recorded', 'program_verified'} <= slugs


# ══════════════════════════════════════════════════════════════════════
# card_rewards_recorded
# ══════════════════════════════════════════════════════════════════════

def test_a_user_with_no_cards_is_DORMANT(owner):
    assert pp_acts.coverage_card_rewards_recorded(owner.id) is None
    assert pp_acts.coverage_program_verified(owner.id) is None


def test_an_unrecorded_card_scores_zero(owner):
    _card(owner.id)
    assert pp_acts.coverage_card_rewards_recorded(owner.id) == Decimal(0)


def test_recording_the_rates_earns_it(owner):
    _card(owner.id, override={'dining': 3})
    assert pp_acts.coverage_card_rewards_recorded(owner.id) == Decimal(1)


def test_half_the_cards_scores_a_half(owner):
    _card(owner.id, override={'dining': 3})
    _card(owner.id)
    assert pp_acts.coverage_card_rewards_recorded(owner.id) == Decimal('0.5')


# ══════════════════════════════════════════════════════════════════════
# program_verified
# ══════════════════════════════════════════════════════════════════════

def test_verifying_a_card_earns_it(owner):
    _card(owner.id, verified=datetime.utcnow())
    assert pp_acts.coverage_program_verified(owner.id) == Decimal(1)


def test_an_unverified_card_scores_zero(owner):
    _card(owner.id)
    assert pp_acts.coverage_program_verified(owner.id) == Decimal(0)


# ══════════════════════════════════════════════════════════════════════
# *** RULE ONE: SUBMITTING MUST PAY NOTHING ***
# ══════════════════════════════════════════════════════════════════════

def test_SUBMITTING_TO_THE_COMMUNITY_PAYS_NOTHING(owner):
    """*** THE RULE THE WHOLE SECTION TURNS ON. ***

    `submitted_to_community` means a URL was built, not that anything was sent
    or accepted. A card flagged as submitted, with nothing recorded and nothing
    verified, must score exactly zero on both acts.
    """
    _card(owner.id, submitted=True)

    assert pp_acts.coverage_card_rewards_recorded(owner.id) == Decimal(0)
    assert pp_acts.coverage_program_verified(owner.id) == Decimal(0)


def test_NO_ACT_READS_submitted_to_community_AT_ALL(app):
    """Stronger than the behavioural test above, and it survives somebody
    rewriting the coverage functions: the flag must not be referenced by the
    acts module's executable code at all.

    AST-based, so the module docstring — which names the flag in order to
    forbid it — cannot trip the guard.
    """
    assert 'submitted_to_community' not in _code_names(pp_acts)


def test_contribution_accepted_IS_NOT_REGISTERED(app):
    """*** §5.1's PREMISE FOR IT IS FALSE, MEASURED. ***

    The spec says "the schema already closes that loop" through
    `PointsProgram.contributor`. That column holds a free-text handle from the
    dataset JSON, there is no identifier of any kind on `User`, and the
    submitted payload carries no user identity — which is D-91's privacy fix
    working. So nothing can connect an accepted contribution to a finPal user,
    and registering the act would be a predicate that can never fire.

    This test exists so the absence is a recorded decision rather than an
    omission somebody quietly fills in wrongly.
    """
    assert 'contribution_accepted' not in ACTS


def test_the_contributor_column_holds_no_finpal_user(app, db):
    """The measurement behind the test above, kept as a test so it cannot rot.

    If `contributor` ever starts holding something that matches a finPal user,
    this goes red and the act becomes buildable.
    """
    from src.models.user import User
    _db.session.add(PointsProgram(program_id='p1', program_name='P',
                                  issuer='I', contributor='palstack-team'))
    UserFactory(id='someone@test.com', name='S', password_plain='testpassword')
    _db.session.commit()

    handles = {p.contributor for p in PointsProgram.query.all() if p.contributor}
    user_ids = {u.id for u in User.query.all()}
    assert not (handles & user_ids), (
        'a contributor handle now matches a user id — contribution_accepted '
        'may be buildable; re-read the act docstring')


# ══════════════════════════════════════════════════════════════════════
# *** RULE TWO: THE PRIVACY RULE, AS A TEST ***
# ══════════════════════════════════════════════════════════════════════

def _code_names(module):
    """Every attribute, name and string LITERAL in a module's executable code.

    *** KEYED ON THE AST, NOT ON A SPELLING, AND THAT IS NOT PEDANTRY. *** A
    first version of this guard scanned the source text and failed on the
    module's own DOCSTRING, which mentions `last_four` precisely to explain why
    it is never read. A text scan cannot tell a prohibition from a violation.
    This project has been here before: the module-boundary guard was moved onto
    the AST after a spelling-keyed sweep missed an import shape, and that is the
    third time a spelling-keyed gate has gone blind.
    """
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(module))
    # Drop every docstring before walking, so prose cannot trip the guard.
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef)):
            body = getattr(node, 'body', [])
            if (body and isinstance(body[0], ast.Expr)
                    and isinstance(body[0].value, ast.Constant)
                    and isinstance(body[0].value.value, str)):
                node.body = body[1:]

    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, ast.Name):
            found.add(node.id)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            found.add(node.value)
    return found


def test_NO_ACT_TOUCHES_A_CARD_IDENTIFIER(app):
    """*** D-91 IS A SCAR ON THIS EXACT FEATURE. *** It put the card's last four
    in a public issue twice while the UI promised no personal data was shared.
    Paying people to share raises the stakes, so §5.1 makes this a test rather
    than a comment."""
    names = _code_names(pp_acts)
    for forbidden in ('last_four', 'card_number', 'cardholder', 'holder_name'):
        assert forbidden not in names, (
            f'{forbidden} is referenced by an act that pays for sharing')


def test_the_payoffs_name_no_card_identifier(owner):
    _card(owner.id, override={'dining': 3}, verified=datetime.utcnow())

    for sentence in (pp_acts.payoff_card_rewards_recorded(owner.id),
                     pp_acts.payoff_program_verified(owner.id)):
        assert sentence
        # A payoff is served prose; it must not carry anything identifying.
        assert 'last four' not in sentence.lower()
        assert '****' not in sentence


def test_the_payoffs_are_NONE_when_there_is_nothing_to_say(owner):
    _card(owner.id)
    assert pp_acts.payoff_card_rewards_recorded(owner.id) is None
    assert pp_acts.payoff_program_verified(owner.id) is None
