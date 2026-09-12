"""C1d — the approved prose reaching the database, on a stack that already booted.

*** THE ONLY INTERESTING CASE IS A ROW THAT ALREADY EXISTS. *** Every deployment
that ran C1b or C1c holds all nineteen milestones with `body_md` NULL, and
`seed_milestones` inserts only what is missing — so a fresh-database test would
pass on the insert path and prove nothing about the stacks this work exists for
(D-178). The NULL rows here are therefore built in **raw SQL**: a Python-side
`default=` on the model fills in for `None` at INSERT, so an ORM-built NULL
asserts nothing (D-155, `feedback_the_orm_cannot_make_the_null_production_has`).

And the correction must be *refusable*: a body somebody edited is not ours to
overwrite, which is the same rule that stops the seeder rewriting an edited
title on every restart. That test was made to fail before it was believed.
"""

import pytest
from sqlalchemy import text

from src.extensions import db as _db
from src.modules.learnpal.lesson_bodies import BODIES, apply_bodies
from src.modules.learnpal.models import LearnMilestone
from src.modules.learnpal.seed import MILESTONES, seed_milestones

SLUGS = [m[0] for m in MILESTONES]


def _body_in_db(slug):
    """Read the column back out, not the object we just wrote."""
    return _db.session.execute(
        text('SELECT body_md FROM learn_milestones WHERE slug = :s'),
        {'s': slug}).scalar()


def _seed_with_null_bodies():
    """The C1b/C1c shape: every row present, every body NULL, written as SQL."""
    seed_milestones()
    _db.session.execute(text('UPDATE learn_milestones SET body_md = NULL'))
    _db.session.commit()
    assert _body_in_db('a-starter-buffer') is None, 'fixture did not make a NULL'


def test_every_seeded_milestone_has_approved_prose(db):
    """A lesson in the seeder with no entry in BODIES ships as unreadable."""
    assert set(BODIES) == set(SLUGS)


def test_it_fills_a_body_that_was_never_written(db):
    _seed_with_null_bodies()

    changed = apply_bodies()

    assert changed == len(SLUGS)
    for slug in SLUGS:
        stored = _body_in_db(slug)
        assert stored == BODIES[slug], slug
    # The prose itself, not just "something non-empty" — a correction that
    # wrote the slug into the column would satisfy a truthiness check.
    assert 'the next thing that breaks' in _body_in_db('a-starter-buffer')


def test_it_leaves_an_edited_body_alone(db):
    """*** THE SABOTAGE. *** Keyed on the slug alone, this test fails."""
    _seed_with_null_bodies()
    edited = 'Our house style says this differently.'
    _db.session.execute(
        text('UPDATE learn_milestones SET body_md = :b WHERE slug = :s'),
        {'b': edited, 's': 'a-starter-buffer'})
    _db.session.commit()

    changed = apply_bodies()

    assert _body_in_db('a-starter-buffer') == edited
    assert changed == len(SLUGS) - 1
    # and the untouched neighbours still got theirs
    assert _body_in_db('where-your-money-goes') == BODIES['where-your-money-goes']


def test_a_second_boot_changes_nothing(db):
    _seed_with_null_bodies()
    apply_bodies()

    assert apply_bodies() == 0


def test_a_fresh_database_gets_the_prose_at_insert(db):
    """The other path: nothing exists yet, so the correction has no work to do."""
    seed_milestones()

    for slug in SLUGS:
        assert _body_in_db(slug) == BODIES[slug], slug
    assert apply_bodies() == 0


def test_the_lesson_reader_serves_the_body_to_whoever_earned_it(db, client, auth_headers):
    """End to end, because a filled column nobody can read is not the item."""
    from src.modules.learnpal.models import LearnCompletion
    from tests.factories import UserFactory

    _seed_with_null_bodies()
    user = UserFactory(id='bodies@test.com', name='Bodies')
    apply_bodies()
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='a-starter-buffer',
                                    verified_by='read'))
    _db.session.commit()

    headers = auth_headers(user)

    listed = client.get('/api/v1/learnpal/lessons', headers=headers).get_json()
    rows = {r['slug']: r for r in listed['lessons']}
    assert all(r['has_body'] for r in rows.values()), 'a lesson offers no reader'

    got = client.get('/api/v1/learnpal/lessons/a-starter-buffer',
                     headers=headers).get_json()['lesson']
    assert got['body_md'] == BODIES['a-starter-buffer']

    # And an unearned one still answers 200 with no body — not 403.
    locked = client.get('/api/v1/learnpal/lessons/sinking-funds',
                        headers=headers)
    assert locked.status_code == 200
    assert locked.get_json()['lesson']['body_md'] is None


@pytest.mark.parametrize('slug', SLUGS)
def test_no_body_carries_an_unrenderable_construct(slug):
    """*** THE READER PARSES FOUR THINGS. *** A fifth renders as raw syntax.

    `LessonBody.tsx` handles `###`, `**bold**`, `*italic*` and `>` asides, and
    its own test asserts nothing leaks through literally. A table or a link
    added to a draft later would render as pipes and brackets in the panel, and
    this is what says so at the moment it lands rather than in a screenshot.
    """
    import re
    body = BODIES[slug]
    for name, pattern in (('table', r'^\|'), ('link', r'\[[^\]]+\]\('),
                          ('code fence', r'^```'), ('image', r'!\['),
                          ('bullet list', r'^[-*+] '), ('numbered list', r'^\d+\. '),
                          ('h1/h2', r'^#{1,2} ')):
        assert not re.search(pattern, body, re.M), f'{slug} uses a {name}'
