"""Every compose file and env file the docs tell you to use must actually exist.

**AUDIT D-96.** `docs/install.md` — the guide a new self-hoster follows — opened with:

    cp .env.template .env
    docker compose -f docker-compose.local.yml up --build

**Neither file has ever existed in this repo.** The env template is `.env.example`, and there is
no `docker-compose.local.yml`. So the documented install path failed at step 2 and again at step
4, five references in total, and the first thing anyone did with finPal was watch it not work.

*** THIS IS D-05's SHAPE IN THE DOCUMENTATION LAYER *** — something is described, nothing behind
it exists, and no gate noticed because nothing executes a README. The install guide is the one
file whose readers cannot ask us what went wrong: they close the tab.

Scoped to what breaks a reader: `docker-compose*.yml`, `.env*`, and **relative markdown links to
files in this repo**. Not a general link checker — external URLs are not fetched, because a gate
that fails when someone else's site is down gets ignored, and an ignored gate is worse than none.
`.env` itself is exempt because the user creates it.

The link half was added after deleting an unreferenced duplicate `docs/CONTRIBUTING.md`: a
surviving `[CONTRIBUTING.md](CONTRIBUTING.md)` inside `docs/install.md` is **relative to
`docs/`**, so it silently pointed at the file that had just been removed. Relative-link breakage
is invisible to every other gate here and to anyone who does not click.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

DOC_FILES = sorted(
    [REPO_ROOT / 'README.md']
    + [p for p in (REPO_ROOT / 'docs').rglob('*.md')]
    + [REPO_ROOT / 'CONTRIBUTING.md']
)

# `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, …
COMPOSE = re.compile(r'\b(docker-compose[A-Za-z0-9._-]*\.ya?ml)\b')
ENVFILE = re.compile(r'(?<![A-Za-z0-9_.-])(\.env[A-Za-z0-9._-]*)')

# The user creates this one; it is correctly absent from the repo.
EXEMPT = {'.env'}


def _referenced():
    """(doc, name) for every compose/env file the docs name."""
    for doc in DOC_FILES:
        if not doc.is_file():
            continue
        text = doc.read_text(encoding='utf-8')
        for rx in (COMPOSE, ENVFILE):
            for m in rx.finditer(text):
                name = m.group(1)
                if name in EXEMPT:
                    continue
                line = text[:m.start()].count('\n') + 1
                yield doc.relative_to(REPO_ROOT).as_posix(), name, line


REFERENCES = list(_referenced())


def test_the_scan_finds_references_at_all():
    """A guard on the guard — an empty list would make the assertion below vacuous."""
    assert len(REFERENCES) >= 5, f'only {len(REFERENCES)} references found; the scan is not reading the docs'
    assert any(name == 'docker-compose.yml' for _, name, _ in REFERENCES)


def test_every_compose_and_env_file_named_in_the_docs_exists():
    missing = []
    for doc, name, line in REFERENCES:
        # Named at the repo root in practice; accept a match anywhere so a moved file still counts.
        if not (REPO_ROOT / name).exists() and not list(REPO_ROOT.rglob(name)):
            missing.append(f'{doc}:{line} refers to `{name}`, which does not exist')
    assert not missing, (
        'the docs tell users to use files that are not in the repo:\n' + '\n'.join(missing))


# --- relative markdown links -------------------------------------------------------------

# `[text](path)` where path is repo-relative: no scheme, no anchor-only, no mailto.
MD_LINK = re.compile(r'\[[^\]]*\]\(([^)]+)\)')


def _relative_links():
    for doc in DOC_FILES:
        if not doc.is_file():
            continue
        text = doc.read_text(encoding='utf-8')
        for m in MD_LINK.finditer(text):
            target = m.group(1).strip()
            if target.startswith(('http://', 'https://', 'mailto:', '#', 'tel:')):
                continue
            # Strip an in-page anchor: the file must exist, the heading is not checked.
            path = target.split('#', 1)[0]
            if not path:
                continue
            line = text[:m.start()].count('\n') + 1
            yield doc, path, line


LINKS = list(_relative_links())


def test_the_link_scan_finds_links():
    """A guard on the guard, for the same reason as above."""
    assert len(LINKS) >= 10, f'only {len(LINKS)} relative links found; the scan is not working'


def test_every_relative_link_resolves():
    """Resolved from the linking file's own directory, which is what a reader's click does.

    That is the whole point: `docs/install.md` linking to `CONTRIBUTING.md` means
    `docs/CONTRIBUTING.md`, not the one at the repo root.
    """
    broken = []
    for doc, path, line in LINKS:
        if not (doc.parent / path).resolve().exists():
            rel = doc.relative_to(REPO_ROOT).as_posix()
            broken.append(f'{rel}:{line} links to `{path}`, which does not resolve from {doc.parent.name}/')
    assert not broken, 'broken relative links:\n' + '\n'.join(broken)
