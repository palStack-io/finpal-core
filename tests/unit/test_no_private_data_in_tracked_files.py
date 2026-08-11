"""Nothing private ships in a public repo.

finpal_core is published to `palStack-io/finpal-core`. Everything `git ls-files` reports is
world-readable the moment it is pushed, and **a leak cannot be taken back** — it stays in the
history and in every clone and fork whether or not the file is later edited. That is the same
reasoning as AUDIT D-91, where a card's last four went into a public GitHub issue.

A cleanup swept four real instances on 2026-08-11: two plan documents carrying the maintainer's
absolute paths (`/Users/<name>/...`, which leaks a username and a directory layout), and two
references to an internal host alias. This exists so the fifth does not need a human to notice it.

*** THE FILE LIST COMES FROM `git ls-files`, NOT FROM A WALK OF THE WORKING TREE. *** Only tracked
files are published; `venv/`, `node_modules/`, `instance/` and local scratch files are not, and
scanning them would produce noise that trains people to ignore this test. It also means a file
added tomorrow is covered with no edit here.

**Scoped deliberately.** This is not a general secret scanner and does not pretend to be. It
catches the classes that have actually occurred or would be unambiguous:

  1. absolute home-directory paths — a username plus a local layout, and useless to a reader
  2. this project's internal host aliases and CGNAT/Tailscale range
  3. a tracked environment file that is not an `.example`
  4. an assignment that looks like a real credential rather than a placeholder

What it does NOT do is guess at entropy in ordinary strings, because a scanner that cries wolf
gets deleted. Public contact details (`palstack4u@gmail.com`) and documentation examples
(`192.168.1.50`, `10.0.0.5`) are intentional and stay.
"""
import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Binary and vendored files: scanning them is slow and finds only dependency noise.
SKIP_SUFFIXES = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.woff', '.woff2', '.ttf',
                 '.zip', '.gz', '.db', '.sqlite', '.sqlite3')
SKIP_NAMES = ('package-lock.json', 'yarn.lock', 'poetry.lock')

# This file names the very patterns it bans, so it must exempt itself. Nothing else is exempt.
SELF = Path(__file__).name


def tracked_text_files():
    """Every tracked file that is plausibly text, as published."""
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=REPO_ROOT,
                         capture_output=True, text=True, check=True).stdout
    for rel in filter(None, out.split('\0')):
        path = REPO_ROOT / rel
        if path.name == SELF or path.name in SKIP_NAMES:
            continue
        if path.suffix.lower() in SKIP_SUFFIXES or not path.is_file():
            continue
        try:
            yield rel, path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue  # genuinely binary; nothing to read


FILES = list(tracked_text_files())


def test_the_scan_actually_reads_the_repo():
    """A guard on the guard: an empty file list would make every test below vacuous.

    `git ls-files` returning nothing (wrong cwd, no git) must fail loudly rather than pass.
    """
    assert len(FILES) > 100, f'only {len(FILES)} tracked text files found — the scan is not reading the repo'
    assert any(rel == 'README.md' for rel, _ in FILES)


def _offences(pattern, flags=0):
    rx = re.compile(pattern, flags)
    found = []
    for rel, text in FILES:
        for n, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                found.append(f'{rel}:{n}: {line.strip()[:120]}')
    return found


def test_no_absolute_home_directory_paths():
    """`/Users/<name>/...` or `/home/<name>/...` leaks a username and a local layout.

    It is also worthless to a reader, who cannot have that path. Use a relative path or a
    placeholder such as `<repo>`.
    """
    offences = _offences(r'(?:/Users/|/home/)[A-Za-z0-9._-]+/')
    assert not offences, 'absolute home paths in published files:\n' + '\n'.join(offences)


def test_no_internal_host_aliases_or_private_ranges():
    """Internal aliases name our infrastructure and mean nothing to anyone else.

    The CGNAT range `100.64.0.0/10` is included because Tailscale addresses live there and one
    was in this project's operational notes.
    """
    offences = _offences(r'\bubuntuloco\b|\bbasestation\b|\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\b',
                         re.IGNORECASE)
    assert not offences, 'internal host references in published files:\n' + '\n'.join(offences)


def test_no_environment_files_are_tracked_except_examples():
    """A real `.env` is the single worst thing that can be committed here."""
    tracked = subprocess.run(['git', 'ls-files', '-z'], cwd=REPO_ROOT,
                             capture_output=True, text=True, check=True).stdout
    bad = [rel for rel in filter(None, tracked.split('\0'))
           if Path(rel).name.startswith('.env') and not Path(rel).name.endswith('.example')]
    assert not bad, f'environment files are tracked: {bad}'


def test_no_assignments_that_look_like_real_credentials():
    """A long opaque value assigned to a secret-shaped name.

    Placeholders are the norm in `.env.example` and in tests, so they are excluded by wordlist
    rather than by length — the point is to catch a value someone pasted, not to police examples.
    """
    secret_name = r'(?:SECRET_KEY|JWT_SECRET_KEY|API_KEY|ENCRYPTION_KEY|PASSWORD|ACCESS_TOKEN)'
    rx = re.compile(secret_name + r'["\']?\s*[:=]\s*["\']([A-Za-z0-9+/_=-]{20,})["\']')
    allowed = re.compile(r'example|test|fake|dummy|changeme|placeholder|your[-_]|replace|xxx|sample|'
                         r'generate|token_hex|secret_key_here|s3cr3t', re.IGNORECASE)
    offences = []
    for rel, text in FILES:
        for n, line in enumerate(text.splitlines(), 1):
            m = rx.search(line)
            if m and not allowed.search(line):
                offences.append(f'{rel}:{n}: {secret_name} assigned a {len(m.group(1))}-char literal')
    assert not offences, 'possible real credentials in published files:\n' + '\n'.join(offences)
