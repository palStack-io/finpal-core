"""A demo reset must leave the user looking NEW, not merely leave the FKs happy.

*** THIS ASKS THE QUESTION `test_demo_reset_fk_order` DOES NOT. *** That guard
asks "can this delete FAIL?" and derives its closure from FKs that can refuse a
delete. It is correct, and it is structurally blind to this defect:
`learn_completions.unlocked_by_goal_id` is `ON DELETE SET NULL` — deliberately,
so an optional learning module can never block deleting a goal — so it can never
refuse, so it is excluded from the closure and always will be.

**Measured on the public demo on 2026-09-12: demo1 had 16 lesson completions
before a reset and 16 after.** Accounts were wiped and re-seeded; learnPal
progress was not touched. A visitor met the shop window with 16 of 19 lessons
already read and the gear already earned.

Unlocks being permanent is right for a real user (`models.py` says so, and means
it) and wrong for a reset, whose entire purpose is to restore the first-run
state. The two are different questions about the same row.

*** THE POINT OF THIS FILE IS THE NEXT MODULE, NOT THIS ONE. *** Any module that
adds a user-scoped table with a non-blocking FK lands in exactly the same blind
spot. The sweep below fails on the table name, so the next one is caught by
existing code rather than by someone noticing on a demo.
"""

import pytest
from sqlalchemy import text

from src.extensions import db as _db
from src.services.demo.service import DemoService
from tests.factories import UserFactory


# Tables that legitimately survive a reset, each with the reason. Anything else
# holding rows for the user after a reset is a defect.
#
# *** A BARE SET WOULD LET ANYTHING IN. *** The value is the justification, and
# a new entry without one is the thing to argue about in review.
SURVIVES_A_RESET = {
    'users': 'the user itself — a reset resets their DATA, it does not delete them',
    'login_events': 'an audit trail; wiping it would destroy the record of the reset',
    'personal_access_tokens': 'a token the tester created deliberately, outside the demo data',
    'user_api_settings': 'preferences, not demo content',
    'user_module_access': 'entitlement, written by adminPal — not ours to clear',
    'user_module_preferences': 'the user\'s own show/hide choice, not seeded content',
    'agent_actions': 'an audit trail of what an agent did, same reason as login_events',
}


def _user_scoped_tables():
    """Every mapped table carrying a `user_id`, from `db.metadata`.

    *** NOT `information_schema` — THE SUITE RUNS ON SQLite, WHICH HAS NONE. ***
    The first version of this query worked against the Postgres demo and failed
    against every test database. `db.metadata` is also the more honest source:
    it is what the application believes exists, so a model added without a
    migration still shows up here.
    """
    return sorted(t.name for t in _db.metadata.sorted_tables
                  if 'user_id' in t.columns)


def _rows_for(table, user_id):
    return _db.session.execute(
        text(f'select count(*) from {table} where user_id = :u'),  # noqa: S608
        {'u': user_id}).scalar()


@pytest.fixture
def demo_user(db):
    """A demo user with seeded data AND a lesson unlock."""
    from src.modules.learnpal.models import LearnCompletion
    from src.modules.learnpal.seed import seed_milestones

    seed_milestones()
    user = UserFactory(id='demo-reset@finpal.demo', name='Reset')
    # *** `reset_demo_user` REFUSES A NON-DEMO USER, AND THE FIRST VERSION OF
    # THIS FIXTURE FORGOT. *** It returned `{'success': False, 'message': 'Not a
    # demo user'}`, the reset did nothing at all, and the assertion below was
    # measuring a no-op rather than the bug.
    user.is_demo_user = True
    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='a-starter-buffer',
                                    verified_by='read'))
    _db.session.commit()
    return user


def test_a_reset_clears_learnpal_progress(demo_user):
    """*** THE DEFECT, IN ONE ASSERTION. *** 16 before and 16 after, on the
    live demo, is what this would have caught."""
    from src.modules.learnpal.models import LearnCompletion

    before = LearnCompletion.query.filter_by(user_id=demo_user.id).count()
    assert before == 1, 'fixture did not create an unlock — the test proves nothing'

    result = DemoService.reset_demo_user(demo_user.id)
    assert result['success'] is True, result  # not a silent "Not a demo user"

    assert LearnCompletion.query.filter_by(user_id=demo_user.id).count() == 0


def test_the_reset_survives_learnpal_being_absent(demo_user, monkeypatch):
    """*** THE MODULE IS OPTIONAL AND A SELF-HOSTER MAY NOT HAVE IT. ***

    A reset must not fail on an import for a module this deployment never
    enabled. The helper swallows the ImportError; this is what says so.
    """
    import builtins
    real_import = builtins.__import__

    def refuse_learnpal(name, *args, **kwargs):
        if 'learnpal' in name:
            raise ImportError('learnPal is not installed here')
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, '__import__', refuse_learnpal)
    result = DemoService.reset_demo_user(demo_user.id)
    monkeypatch.undo()

    assert result['success'] is True


def test_no_user_scoped_table_keeps_rows_through_a_reset(demo_user):
    """*** THE SWEEP, AND IT IS THE POINT OF THE FILE. ***

    Derived from the live schema, so a module that adds a user-scoped table
    lands here automatically rather than being noticed on a demo months later.
    A table that legitimately survives belongs in `SURVIVES_A_RESET` with its
    reason written down.
    """
    assert DemoService.reset_demo_user(demo_user.id)['success'] is True
    _db.session.expire_all()

    leftover = {}
    for table in _user_scoped_tables():
        if table in SURVIVES_A_RESET:
            continue
        try:
            n = _rows_for(table, demo_user.id)
        except Exception:
            continue  # a table this build does not have
        if n:
            leftover[table] = n

    assert leftover == {}, (
        'these kept rows through a reset — delete them in `reset_demo_user`, or '
        f'add them to SURVIVES_A_RESET with a reason: {leftover}')


def test_every_exemption_names_a_reason(db):
    """A bare set would let anything in; the value is the argument."""
    for table, why in SURVIVES_A_RESET.items():
        assert len(why) > 20, f'{table} needs a real reason, not "{why}"'
