"""The Alembic revision graph must be walkable — AUDIT D-105.

*** THIS DEFECT SURVIVED BECAUSE NOTHING EVER WALKED THE GRAPH. *** The deployed
schema comes from ``db.create_all()``, not from Alembic, so production has never
needed the revision tree to be valid — and an invalid one is completely invisible
until something runs ``flask db upgrade``. Two files declared the same
``revision`` id (``a1b2c3d4e5f6``), which made Alembic collapse two unrelated
nodes into one and close a loop:

    CycleDetected: Cycle is detected in revisions
    (16f9694227d8, 200f76059b3b, 679da3d5b2cc, f5fc4f9672a2)

The consequences were real even though production was fine: **a self-hoster
following the documented install path runs ``flask db upgrade`` and hits this
immediately**, the demo stack could not be rebuilt from scratch, and recreating a
single compose service pulled in ``db-init``, which failed and took the stack
down for 60–90 seconds.

TWO INDEPENDENT CHECKS, AND THE SPLIT IS DELIBERATE
---------------------------------------------------
``test_no_duplicate_revision_ids`` reads the **source files** with a regex.
``test_alembic_can_walk_base_to_heads`` asks **Alembic** to do it, which imports
the modules.

The source-level check exists because *** A STALE ``.pyc`` CAN MAKE ALEMBIC
REPORT A GRAPH THAT DOES NOT MATCH THE SOURCE ON DISK. *** That is not
hypothetical: while fixing D-105, an edit-and-revert cycle landed inside Python's
one-second mtime granularity, so the bytecode cache was considered valid and
Alembic kept reporting the duplicate for a file whose source had already been
corrected. Any check that only imports can be lied to that way; a check that
reads bytes cannot.
"""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

import pytest

VERSIONS = Path(__file__).resolve().parent.parent / "migrations" / "versions"
MIGRATIONS = VERSIONS.parent

REVISION_RE = re.compile(r"^revision\s*=\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
DOWN_RE = re.compile(r"^down_revision\s*=\s*(.+)$", re.MULTILINE)


def _migration_files() -> list[Path]:
    return sorted(p for p in VERSIONS.glob("*.py") if p.name != "__init__.py")


def test_there_are_migrations_to_check():
    """A sweep over an empty list passes every assertion beneath it.

    This project has shipped two gates that inspected nothing — a typecheck that
    compiled zero files (D-45) and a CI guard whose condition could never be
    true — so the sweep asserts its own input first.
    """
    files = _migration_files()
    assert len(files) >= 15, f"only found {len(files)} migration files under {VERSIONS}"


def test_no_duplicate_revision_ids():
    """Read the SOURCE. Immune to a stale ``.pyc``, unlike anything that imports."""
    by_id: dict[str, list[str]] = defaultdict(list)
    for path in _migration_files():
        match = REVISION_RE.search(path.read_text(encoding="utf-8"))
        assert match, f"{path.name} declares no `revision = ...`"
        by_id[match.group(1)].append(path.name)

    duplicates = {rev: names for rev, names in by_id.items() if len(names) > 1}
    assert not duplicates, (
        "Two migrations declare the same revision id, which makes Alembic collapse "
        "unrelated nodes and can manufacture a cycle that is in nobody's intent "
        f"(AUDIT D-105): {duplicates}"
    )


def test_every_down_revision_names_a_migration_that_exists():
    """A dangling parent is a graph that cannot be walked, reported as a KeyError."""
    ids = set()
    edges: dict[str, list[str]] = {}
    for path in _migration_files():
        text = path.read_text(encoding="utf-8")
        rev = REVISION_RE.search(text).group(1)
        ids.add(rev)
        raw = DOWN_RE.search(text)
        assert raw, f"{path.name} declares no `down_revision`"
        value = raw.group(1).strip()
        if value == "None":
            edges[rev] = []
        elif value.startswith("("):
            edges[rev] = re.findall(r"['\"]([^'\"]+)['\"]", value)
        else:
            edges[rev] = [value.strip("'\"")]

    dangling = {
        rev: [p for p in parents if p not in ids]
        for rev, parents in edges.items()
        if any(p not in ids for p in parents)
    }
    assert not dangling, f"down_revision points at revisions that do not exist: {dangling}"


def test_alembic_can_walk_base_to_heads():
    """The check whose failure *defined* D-105 — asked of Alembic itself.

    ``walk_revisions`` is what raises ``CycleDetected``; asserting on a status or
    on our own graph traversal would not be the same claim.
    """
    alembic_script = pytest.importorskip("alembic.script")
    alembic_config = pytest.importorskip("alembic.config")

    config = alembic_config.Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    directory = alembic_script.ScriptDirectory.from_config(config)

    revisions = list(directory.walk_revisions("base", "heads"))
    assert len(revisions) == len(_migration_files()), (
        "Alembic walked a different number of revisions than there are migration "
        f"files: walked {len(revisions)}, files {len(_migration_files())}"
    )


def test_there_is_exactly_one_head():
    """Multiple heads make bare ``alembic upgrade head`` ambiguous and it refuses.

    Not folded into the walk above: a graph can be acyclic and still un-upgradable
    without naming a head, and those are two different complaints.
    """
    alembic_script = pytest.importorskip("alembic.script")
    alembic_config = pytest.importorskip("alembic.config")

    config = alembic_config.Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    directory = alembic_script.ScriptDirectory.from_config(config)

    heads = directory.get_heads()
    assert len(heads) == 1, (
        f"expected a single head so `upgrade head` is unambiguous, found {heads}. "
        "Add a merge migration depending on all of them."
    )
