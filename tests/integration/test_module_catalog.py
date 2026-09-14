"""The catalogue and the data statement, asserted on the PAYLOAD.

*** EVERY TEST HERE READS THE RESPONSE BODY, NEVER A STATUS CODE. *** Every bug
found in this project across eight sessions returned 200 and rendered fine, and
this endpoint's whole job is to carry prose — a 200 with an empty `data` block
is the exact failure that would ship a first-run screen promising nothing.
"""
import os

import pytest

from src.services.onboarding.copy import DATA_STATEMENT, MODULE_COPY


def test_the_statement_is_served_whole(client):
    payload = client.get('/api/v1/modules/catalog').get_json()
    data = payload['data']

    assert data['heading'] == DATA_STATEMENT['heading']
    assert data['lines'] == DATA_STATEMENT['lines']
    assert data['operator_note'] == DATA_STATEMENT['operator_note']
    # *** THE CLIENT ADDS NOTHING AND THEREFORE MUST BE SENT EVERYTHING. *** If
    # a line is dropped here the screen renders a shorter promise, silently.
    assert len(data['lines']) == 3


def test_the_statement_needs_no_session(client):
    """Unauthenticated, deliberately.

    Onboarding's first screens run before a session has settled on mobile, and a
    401 on the screen that states what finPal does with your money is the least
    reassuring possible failure. Nothing in the payload is user-specific.
    """
    response = client.get('/api/v1/modules/catalog')
    assert response.status_code == 200
    assert 'data' in response.get_json()


def test_the_statement_carries_no_figure_and_no_link(client):
    """*** §6: NEVER INVENT A FIGURE, AND D-109/D-201: NEVER INVENT A URL. ***

    A first-run screen has no data to interpolate — the user has no money in the
    product yet — so a digit here could only have come from somewhere it does
    not belong. And the long form is a REPO document, not a served page: the two
    dead-link defects in this audit both began as a plausible docs URL.
    """
    data = client.get('/api/v1/modules/catalog').get_json()['data']
    prose = ' '.join([data['heading'], *data['lines'], data['operator_note']])
    assert not any(ch.isdigit() for ch in prose), prose
    assert 'http' not in prose


def test_the_statement_does_not_make_the_blanket_claim(client):
    """*** THE ONE ASSERTION IN THIS FILE THAT IS ABOUT HONESTY. ***

    Six things can leave an instance (`docs/DATA_BOUNDARIES.md`), every one
    opt-in or operator-configured, so "nothing ever leaves" would be FALSE. The
    statement therefore keeps its qualifier, and this test fails if somebody
    later tightens the copy into a promise the code does not keep.
    """
    lines = client.get('/api/v1/modules/catalog').get_json()['data']['lines']
    joined = ' '.join(lines).lower()
    assert 'switch on yourself' in joined, (
        'The data statement lost the sentence naming the opt-in connections. '
        'Without it the statement reads as "nothing ever leaves", which is not '
        'true: see docs/DATA_BOUNDARIES.md for the six paths that exist.')


def test_a_module_the_deployment_does_not_run_is_absent(client):
    """Deployment, not entitlement and not preference.

    learnPal is `default_enabled = False`, so a plain test app does not run it
    and the catalogue must not offer it — the module step cannot show a toggle
    for something the server has no code path for.
    """
    slugs = [m['slug'] for m in client.get('/api/v1/modules/catalog').get_json()['modules']]
    assert 'pointspal' in slugs, 'pointsPal is default_enabled = True'
    if os.getenv('LEARNPAL_ENABLED', '').lower() not in ('1', 'true', 'yes'):
        assert 'learnpal' not in slugs


def test_every_listed_module_carries_all_three_strings(client):
    """A blank card on the first screen a user sees is worse than one fewer."""
    for module in client.get('/api/v1/modules/catalog').get_json()['modules']:
        for key in ('slug', 'name', 'intro', 'gives'):
            assert module.get(key), f'{module.get("slug")!r} has no {key}'
        assert len(module['intro']) > 40, module['intro']


@pytest.mark.parametrize('slug', sorted(MODULE_COPY))
def test_the_copy_module_is_the_only_place_the_prose_is_spelled(slug):
    """*** THE SAME SHAPE AS `outboundLinks.test.ts` PINNING `links.ts`. ***

    The clients render this payload and hold none of it. This half of that rule
    is the server's: the prose must not be duplicated inside `api/`, or the
    endpoint stops being the single place a sentence can be corrected without an
    app release — which is the entire reason it lives on the server.
    """
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2]
    intro = MODULE_COPY[slug]['intro']
    needle = intro[:40]
    for path in (root / 'api').rglob('*.py'):
        assert needle not in path.read_text(encoding='utf-8'), (
            f'{path} spells out {slug} copy that belongs only in '
            f'src/services/onboarding/copy.py')


def test_the_orientation_screens_are_all_served(client):
    """Five screens, and each carries what its client renders.

    *** A MISSING SCREEN RENDERS AN EMPTY STEP, NOT AN ERROR *** — the wizard
    would advance onto blank space — so the shape is asserted rather than
    assumed.
    """
    orientation = client.get('/api/v1/modules/catalog').get_json()['orientation']

    assert list(orientation) == ['welcome', 'mountains', 'game', 'modules', 'base_camp']
    for name in ('welcome', 'mountains', 'modules', 'base_camp'):
        assert orientation[name]['heading']
        assert orientation[name]['lines']

    # Step 3 is the one the flow exists for: four panels, four DIFFERENT
    # questions. Two panels answering the same question would leave the user to
    # guess which word means which thing, which is the confusion this replaces.
    panels = orientation['game']['panels']
    assert len(panels) == 4
    assert {p['title'] for p in panels} == {'Mountains', 'Coins', 'Gear', 'Badges'}
    questions = [p['question'] for p in panels]
    assert len(set(questions)) == 4, questions
    assert len(orientation['game']['promises']) == 4


def test_no_figure_anywhere_in_the_orientation(client):
    """*** §6: NEVER INVENT A FIGURE, AND A FIRST-RUN SCREEN HAS NONE TO SHOW.

    *** The user has entered nothing, so any digit here is one finPal made up —
    on the very screens whose job is to establish that the numbers are theirs.
    That is why the mountain examples describe what a height MEANS instead of
    showing one.
    """
    payload = client.get('/api/v1/modules/catalog').get_json()
    prose = str(payload['orientation'])
    digits = sorted({ch for ch in prose if ch.isdigit()})
    assert not digits, f'orientation carries the digits {digits}'


def test_the_mountain_examples_are_marked_as_examples(client):
    """A new user has no goals, so anything shown is illustrative.

    Unlabelled, it reads as something finPal already knows about them.
    """
    mountains = client.get('/api/v1/modules/catalog').get_json()['orientation']['mountains']
    assert len(mountains['examples']) == 2
    for example in mountains['examples']:
        assert example['label'] == 'Example'
        assert example['text']


def test_base_camp_offers_three_universal_acts_from_the_registry(client):
    """*** DERIVED FROM `ACTS`, SO THE SCREEN CANNOT PROMISE A RETIRED ACT. ***

    Universal only: base camp's audience is a user with no data, and a
    conditional act is DORMANT for them (§4.2.1) — offering "know what your debt
    costs" to somebody with no cards is a task they cannot do.
    """
    from src.services.literacy.acts import ACTS

    acts = client.get('/api/v1/modules/catalog').get_json()['first_acts']
    assert len(acts) == 3
    for act in acts:
        assert act['slug'] in ACTS
        assert ACTS[act['slug']].universal, f"{act['slug']} is conditional"
        assert act['title'] == ACTS[act['slug']].title

    # *** NO CEILING ON THE WIRE. *** It orders the list on the server and stays
    # there: a ceiling is a denominator finPal chose, and decision 5 permits one
    # only when the user picked the target.
    assert all('ceiling' not in act for act in acts)
