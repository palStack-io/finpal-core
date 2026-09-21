"""The server's surface list and each client's copy are the same list.

*** THE GATE THAT EXISTS BECAUSE THE OTHER GATES COULD NOT SEE THIS. ***
`everySurfaceHasACaller.test.ts` and mobile's `coinParity.test.ts` both
hardcode the surface names, and both are the RIGHT shape for what they check —
"is each surface asked for somewhere". Neither can notice a surface the SERVER
gained, because a hardcoded list cannot know what it does not contain.

Measured 2026-09-17: adding `pointspal` to `SURFACES` left both client gates
green while the new surface had no caller at all.

*** SO THE COMPARISON HAPPENS IN PYTHON, WHICH IS THE ONLY PLACE THAT CAN SEE
BOTH. *** It reads the arrays back out of the TypeScript files. That is uglier
than importing them and it is the only direction that fails closed: a server
surface with no client entry breaks HERE, rather than passing silently there.

Same reasoning as `NAV_GROUP_HEADINGS` being a cross-client contract with a
test: two copies of one list drift, and drift is this project's named failure
mode.
"""
import re
from pathlib import Path

import pytest

from src.services.literacy.acts import SURFACES

ROOT = Path(__file__).resolve().parents[2]

CLIENTS = {
    'web': ROOT / 'web-ui/src/__tests__/unit/everySurfaceHasACaller.test.ts',
    'mobile': ROOT.parent / 'mobile/src/__tests__/coinParity.test.ts',
}


def _surfaces_in(path):
    """Pull the `SERVER_SURFACES` array out of a TypeScript file."""
    text = path.read_text(encoding='utf-8')
    m = re.search(r'const SERVER_SURFACES\s*=\s*\[(.*?)\]', text, re.S)
    assert m, f'no SERVER_SURFACES array found in {path}'
    return set(re.findall(r"'([a-z]+)'", m.group(1)))


@pytest.mark.parametrize('client', sorted(CLIENTS))
def test_the_client_surface_list_matches_the_server(client):
    path = CLIENTS[client]
    if not path.exists():
        pytest.skip(f'{client} client not present at {path}')

    theirs = _surfaces_in(path)
    ours = set(SURFACES)

    assert theirs == ours, (
        f'{client} and the server disagree about the surface list.\n'
        f'  server has, client missing: {sorted(ours - theirs)}\n'
        f'  client has, server missing: {sorted(theirs - ours)}\n'
        f'A surface the client does not know about has NO caller and earns '
        f'coins invisibly; one the server does not know about awards nothing.'
    )


def test_the_arrays_are_actually_found_and_not_empty():
    """Or the parametrised test above passes by comparing two empty sets."""
    for client, path in CLIENTS.items():
        if not path.exists():
            continue
        found = _surfaces_in(path)
        assert len(found) > 5, f'{client}: only found {found}'
