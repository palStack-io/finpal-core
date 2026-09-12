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
from src.modules.learnpal.lesson_bodies import (
    BODIES, apply_bodies, strip_currency_symbols)
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


def test_no_body_shows_a_currency_symbol(db):
    """*** THE FIGURES ARE HYPOTHETICALS AND CARRY NO UNIT (owner, 2026-09-12).

    *** A symbol here is read by someone whose own money is in something else,
    and there is no exchange rate in a lesson, so the unit could only ever be
    wrong for most readers. The figures and percentages are untouched.
    """
    for slug, body in BODIES.items():
        for sym in ('£', '$', '€'):
            assert sym not in body, f'{slug} shows {sym}'


def test_it_strips_symbols_from_a_body_already_stored(db):
    """*** THE BODIES WERE LIVE BEFORE THIS WAS DECIDED. ***

    `apply_bodies` only ever fills a NULL, so on every deployment that already
    had the prose this correction is the ONLY thing that runs — D-178 again, one
    layer on from the change that introduced it.
    """
    seed_milestones()
    old = BODIES['what-your-apr-costs'].replace('4,200', '£4,200').replace('80 a month', '£80 a month')
    _db.session.execute(
        text('UPDATE learn_milestones SET body_md = :b WHERE slug = :s'),
        {'b': old, 's': 'what-your-apr-costs'})
    _db.session.commit()
    assert '£' in _body_in_db('what-your-apr-costs'), 'fixture did not make a symbol'

    changed = strip_currency_symbols()

    assert changed == 1
    assert _body_in_db('what-your-apr-costs') == BODIES['what-your-apr-costs']


def test_it_refuses_a_body_somebody_edited(db):
    """*** THE SABOTAGE. *** Stripping blindly would overwrite a real edit."""
    seed_milestones()
    theirs = 'Our own words about APR, with a £4,200 figure we chose.'
    _db.session.execute(
        text('UPDATE learn_milestones SET body_md = :b WHERE slug = :s'),
        {'b': theirs, 's': 'what-your-apr-costs'})
    _db.session.commit()

    assert strip_currency_symbols() == 0
    assert _body_in_db('what-your-apr-costs') == theirs


def test_a_second_boot_strips_nothing(db):
    seed_milestones()

    assert strip_currency_symbols() == 0


# *** THE TWO BODIES THE 2026-09-12 DEPLOY LEFT BEHIND, VERBATIM FROM THE LIVE
# DEMO DATABASE. *** Not written by hand: `strip_currency_symbols` took the demo
# from 10 symbolic bodies to 2, and these are the 2 it refused. They are here so
# the fix is tested against what production actually held, rather than against a
# reconstruction of it.
_LIVE_SINKING_FUNDS = """### Leaving supplies along the route

Some costs are certain and simply not monthly: car tax, insurance renewals, a boiler
service, Christmas. They are not emergencies — you know they are coming and roughly what
they cost — but they arrive as a lump and land like a shock.

A sinking fund is the unglamorous fix: divide the yearly cost by twelve and set that aside
each month, so the bill is already paid when it arrives. £600 of car tax is £50 a month you
barely notice instead of £600 you did not have in March.

**This is what finPal's Non-Monthly spending group is for.** A cost marked Non-Monthly is
one the app knows will not appear every month, so a month without it is not you doing well
and a month with it is not you overspending.

The honest limitation: this only works if the money is somewhere you will not spend it.
A sinking fund in your current account is a number in your head."""

_LIVE_INFLATION = """### The slow change you do not feel

Money kept as cash does not lose any pounds. It loses what those pounds buy. At 3% a year,
£10,000 still says £10,000 in twelve months and buys roughly what £9,700 buys today.

Nothing dramatic happens over one year. Over ten it is the difference between a buffer that
still covers three months and one that covers two.

**What this does not mean is that cash is a mistake.** A buffer's job is being there on the
day you need it, and that job requires it to be boring and instantly available. Paying a
little for that is the cost of the guarantee, not a failure to optimise.

**What it does mean is that a large pile of cash with no job is losing quietly.** Once the
buffer covers the gap it is for, money beyond it has somewhere better to be — against debt,
or invested — and leaving it in cash is a decision rather than a default.

This is also why a savings goal set years out and never revisited drifts: the target was
priced in today's money and the thing you are saving for will not be.

> **finPal does not track an inflation rate** and does not adjust any figure for one. Every
> number in the app is in today's money."""


# *** THE TRAILING NEWLINE IS PART OF THE STORED VALUE. *** `psql -tA` drops it
# and the first version of this fixture lost it, so the correction refused on a
# one-character difference and the test read as a real failure. The rows were
# written from `BODIES`, whose entries end in a newline, so it is restored here
# rather than the correction being loosened to ignore whitespace -- an exact
# comparison is the whole safety property.
@pytest.mark.parametrize('slug,stored', [
    ('sinking-funds', _LIVE_SINKING_FUNDS + '\n'),
    ('what-inflation-does-to-cash', _LIVE_INFLATION + '\n'),
])
def test_it_fixes_the_two_bodies_a_symbol_strip_could_not(db, slug, stored):
    """*** A STRIP ALONE CANNOT REACH A CURRENCY WRITTEN IN WORDS. ***

    The inflation lesson said *"does not lose any pounds ... what those pounds
    buy"*. No symbol rule reaches that, which is why these two needed an explicit
    phrase correction and why the deploy found them rather than the suite.
    """
    seed_milestones()
    _db.session.execute(
        text('UPDATE learn_milestones SET body_md = :b WHERE slug = :s'),
        {'b': stored, 's': slug})
    _db.session.commit()
    assert _body_in_db(slug) != BODIES[slug], 'fixture already matches — proves nothing'

    assert strip_currency_symbols() == 1
    assert _body_in_db(slug) == BODIES[slug]


def test_a_phrase_correction_still_refuses_an_edited_body(db):
    """The safety check survives the new path: land on BODIES or do nothing."""
    seed_milestones()
    theirs = (_LIVE_INFLATION + '\n').replace('The slow change you do not feel',
                                              'Our own heading for this one')
    _db.session.execute(
        text('UPDATE learn_milestones SET body_md = :b WHERE slug = :s'),
        {'b': theirs, 's': 'what-inflation-does-to-cash'})
    _db.session.commit()

    assert strip_currency_symbols() == 0
    assert _body_in_db('what-inflation-does-to-cash') == theirs
