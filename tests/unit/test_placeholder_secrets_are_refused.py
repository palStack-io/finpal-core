"""The app must refuse to boot with the placeholder secrets this repo publishes.

**AUDIT D-97.** `get_config()` rejected only an *empty* `SECRET_KEY`. It accepted
`change_me_run_openssl_rand_hex_32` — **the literal value shipped in `.env.example`, readable by
anyone on GitHub.** So:

    cp .env.example .env
    docker compose up -d

booted a working instance whose Flask session key and JWT signing key are public knowledge.
Anyone could forge a session cookie or a token for that instance. *** AND `JWT_SECRET_KEY` FALLS
BACK TO `SECRET_KEY` (see `test_env_example_reaches_the_container.py`), SO ONE PUBLIC VALUE
COMPROMISES BOTH. ***

*** THIS GOT MORE LIKELY, NOT LESS, WHEN THE QUICKSTART WAS SIMPLIFIED. *** The install guide
now reads "three commands", with `nano .env` in the middle — and a step in the middle is the step
people skip. Making something easy to run obliges you to make it hard to run insecurely. The
fix is a boot-time refusal with a message that says exactly what to do, which costs a careful
operator nothing and stops a careless one from being quietly exposed.

*** THE REJECTED VALUES ARE READ OUT OF `.env.example`, NOT LISTED HERE. *** A hardcoded list
would go stale the moment someone reworded the placeholder — the exact way
`project_guards_keyed_to_a_spelling_go_blind` describes. Whatever the file ships as a placeholder
is what the app refuses, so the two can never drift.
"""
import re
from pathlib import Path

import pytest

from src.config import get_config, placeholder_secret_values

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_EXAMPLE = REPO_ROOT / '.env.example'

REAL_SECRET = 'a3f1c9d24b6e8071f5a2c4d6e8b0a2c4d6e8f0a2c4d6e8b0a2c4d6e8f0a2c4d6'


def _example_value(name):
    for line in ENV_EXAMPLE.read_text().splitlines():
        m = re.match(rf'{name}=(.*)$', line.strip())
        if m:
            return m.group(1).strip()
    pytest.fail(f'{name} is not in .env.example')


def test_the_example_still_ships_a_placeholder_worth_refusing():
    """A guard on the guard. If `.env.example` ever ships a real-looking secret, or none at all,
    the derivation below is empty and every other test here passes vacuously."""
    values = placeholder_secret_values()
    assert values, 'no placeholder values derived from .env.example — the guard is dead'
    assert _example_value('SECRET_KEY') in values


def test_boot_refuses_the_published_placeholder_secret_key(monkeypatch):
    monkeypatch.setenv('SECRET_KEY', _example_value('SECRET_KEY'))
    with pytest.raises(ValueError) as exc:
        get_config()
    message = str(exc.value)
    # The message has to tell the operator what to do, not just that something is wrong.
    assert 'SECRET_KEY' in message
    assert 'placeholder' in message.lower()
    assert 'token_hex' in message or 'openssl' in message


def test_boot_refuses_the_published_placeholder_jwt_key(monkeypatch):
    """`JWT_SECRET_KEY` is checked in its own right: it falls back to `SECRET_KEY`, so a valid
    `SECRET_KEY` beside a placeholder JWT key would otherwise sail through."""
    monkeypatch.setenv('SECRET_KEY', REAL_SECRET)
    monkeypatch.setenv('JWT_SECRET_KEY', _example_value('JWT_SECRET_KEY'))
    with pytest.raises(ValueError) as exc:
        get_config()
    assert 'JWT_SECRET_KEY' in str(exc.value)


def test_an_empty_secret_is_still_refused(monkeypatch):
    """The original check, kept — this test exists so the rewrite cannot drop it."""
    monkeypatch.setenv('SECRET_KEY', '')
    with pytest.raises(ValueError) as exc:
        get_config()
    assert 'SECRET_KEY' in str(exc.value)


def test_a_real_secret_boots(monkeypatch):
    """The inverse, and the one that matters most: over-refusing would brick every install."""
    monkeypatch.setenv('SECRET_KEY', REAL_SECRET)
    monkeypatch.delenv('JWT_SECRET_KEY', raising=False)
    config = get_config()
    assert config.SECRET_KEY == REAL_SECRET


def test_a_secret_that_merely_contains_the_word_change_is_allowed(monkeypatch):
    """Matching is exact, not substring.

    A generated secret can contain any letters; refusing anything with "change" in it would
    reject valid keys at random, and a boot failure nobody can explain is worse than the leak
    this prevents.
    """
    monkeypatch.setenv('SECRET_KEY', 'change' + REAL_SECRET)
    monkeypatch.delenv('JWT_SECRET_KEY', raising=False)
    assert get_config().SECRET_KEY.startswith('change')
