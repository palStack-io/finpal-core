"""A feature is not shipped to the demo until the SEED knows about it.

*** THIS GATE EXISTS BECAUSE D-77 HAS NOW RECURRED THREE TIMES AND NOTHING
CAUGHT IT. *** D-77 (Investments and groups empty on the account the tour lands
on), D-175 (the same, plus the backfill without which it reached no live demo),
and D-177 (goals and co-ownership shipped and the seeder never heard about
them). Each time, everything was green: ~1,600 backend tests, three browser
walks, a full CI run and a verified deploy were all consistent with a demo that
showed none of the new feature.

An empty state and a broken page are indistinguishable to someone who has never
seen the working version. That is what cost D-107, where a fixture sent keys the
API never sends, the page rendered `$NaN` eight times, and both gates called it
clean because NaN has a contrast ratio and does not overflow.

HOW IT IS BUILT, AND WHY THAT SHAPE
-----------------------------------
**The table list is derived from `db.metadata`, never hand-written.** A hand-list
is D-127 — *"a gate keyed to a spelling sees only the spellings somebody
remembered"* — and a hand-list is exactly what would have missed `goals`, because
nobody adding a feature remembers to add its table to a checklist in a test file.
Creating the model is what puts it in scope here, and that is the one step nobody
can forget.

**It is a ratchet, not a wall**, the same design as `contrast-walk`:

  * a table in NEITHER dict below **FAILS**. That is the new-feature case, and it
    is the whole point — the failure message tells you to seed it or to say why
    not, and both are cheap.
  * `NO_DEMO_ROWS_BY_DESIGN` — tables a demo structurally cannot fill. Reported
    silently.
  * `KNOWN_DEMO_GAPS` — features that really are demoing themselves empty today.
    **Reported loudly and NOT gated**, because closing them is seeding work
    nobody has scheduled, and turning them into a failure now would mean the gate
    gets skipped rather than the gaps get closed.

**Both dicts are checked for STALE entries.** A table listed as empty that now has
rows fails, because a stale exemption is how a gate quietly stops covering things
— the same reason `src/__init__.py` refuses a stale `_KNOWN_DUPLICATE_ROUTES`.
"""
import pytest
from sqlalchemy import func, select

from src.extensions import db as _db
from src.services.demo.service import DemoService

# Tables a demo instance structurally cannot fill. Each needs a REASON, not just
# a name: the reason is what a future reader checks against reality.
NO_DEMO_ROWS_BY_DESIGN = {
    'revoked_tokens': 'written on logout; a freshly seeded demo has never logged out',
    'login_events': 'written on login; seeding does not log anybody in',
    'personal_access_tokens': 'a PAT is a credential a user mints by hand, and '
                              'seeding one would publish a live token in a public demo',
    'invitations': 'the demo users are created directly; there is no pending invite, '
                   'and a seeded invitation would be an open door on a public instance',
    'user_api_settings': 'holds an FMP API key — a credential, never seeded',
    'SimpleFin': 'holds a bank access URL — a credential, never seeded',
    'simplefin_card_links': 'a join onto SimpleFin, which is never seeded',
    'import_sources': 'a watched folder or mailbox on the host, meaningless on a demo',
    'import_profiles': 'created by running a real CSV import against a real file',
    'import_batches': 'the record of an import that has happened; see import_sources',
    'agent_actions': 'the audit trail of an MCP/agent write, which nothing does at seed',
    'user_module_access': 'entitlements are a Premium concept; core grants by config',
    # Its sibling, and the distinction is the point (owner, 2026-09-11):
    # `user_module_access` is "may you" and adminPal's; this is "do you want to"
    # and the user's. A seeded row would be asserting that a demo persona had
    # opened Settings and hidden something, which nobody did -- and ABSENT means
    # visible, so an empty table is the correct state for a fresh demo.
    'user_module_preferences': 'a choice the user makes in Settings; absent means '
                               'visible, so an empty table IS the default',
    # learnPal, C1b. `learn_milestones` IS seeded -- by the module's own
    # `on_startup`, not by the demo seeder -- so it is empty in a demo-seed
    # fixture that never boots the module. `learn_completions` is genuinely
    # earned: a row appears when a user's goal reaches an altitude band, and
    # seeding one would be fabricating a lesson somebody had read.
    'learn_milestones': 'seeded by LearnPalModule.on_startup at boot, not by the '
                        'demo seeder; the demo stack carries all eight rows',
    'learn_completions': 'earned by a real goal reaching an altitude band — '
                         'seeding one would fabricate a lesson nobody read',
    # Mountains are CORE reference data as of the C1c redesign (they used to be
    # learnPal's). Seeded by `seed_mountains()` from core boot, exactly like
    # `learn_milestones` is seeded by the module's -- so a demo-seed fixture that
    # never boots the app sees them empty while the demo STACK carries all 18 rows.
    # Per-user seeding would be wrong, not just unnecessary: these become
    # adminPal's to edit, and a demo-owned copy would fork from the real one.
    'mountains': 'core reference data seeded by seed_mountains() at boot, not by the '
                 'demo seeder; the demo stack carries all six rows',
    'mountain_bands': 'core reference data seeded alongside mountains at boot; '
                      'the demo stack carries all twelve rows',
    'category_mappings': 'learned from real CSV imports, which a demo does not run',
    'points_transfer_partners': 'reference data shipped by the pointsPal upstream feed, '
                                'not per-user; empty until that feed carries partners',
}

# *** FEATURES THAT ARE DEMOING THEMSELVES EMPTY RIGHT NOW. ***
# This is a to-do list with a gate attached, not an exemption list. Each entry is
# a surface a visitor can reach and find blank, which is the exact condition D-77,
# D-175 and D-177 were opened for. Reported on every run so it cannot be forgotten.
KNOWN_DEMO_GAPS = {
    # `recurring_expenses` WAS here and is now seeded (eight rows per persona,
    # including a weekly and a yearly): the goals ground layer reads it, and with
    # nothing in it the range argued the opposite of its point. Its sibling below
    # used to say "follows recurring_expenses" and can no longer lean on that.
    'ignored_recurring_patterns': 'a pattern the user has told the detector to stop '
                                  'suggesting, so a row means somebody dismissed a '
                                  'suggestion by hand; the demo seeder writes the '
                                  'recurring expenses directly and dismisses nothing',
    'settlements': 'groups have expenses (D-175) but nobody has ever settled up, so '
                   'the settle-up flow shows no history',
    'category_splits': 'a transaction split across categories — the form supports it '
                       'and no demo row uses it',
    'tags': 'the tag picker is empty on every transaction',
    'expense_tags': 'follows tags',
    'investment_transactions': 'holdings exist (D-77) but no buy/sell history behind them',
}


# *** TABLES WHOSE CONTENT DEPENDS ON SOMETHING OUTSIDE THE SEED. ***
# Neither gated nor stale-checked, because they are legitimately empty OR full
# depending on whether a network call succeeded — and a gate whose result depends
# on the network is a gate that goes red for reasons nobody can act on.
#
# Found by this gate failing on its own inputs: `pointspal_sync_log` had a row in
# one run and none in the next, because `_seed_pointspal_data` fetches the program
# catalogue from raw.githubusercontent.com and is wrapped in a SAVEPOINT precisely
# so that failing is survivable. Putting it in either dict above would have made
# the suite flaky in one direction or the other.
NONDETERMINISTIC = {
    'pointspal_sync_log': 'written only when the upstream pointsPal catalogue fetch '
                          'succeeds; the seeder treats failure as survivable',
    'points_programs': 'fetched from the pointsPal upstream feed at seed time',
    'points_earn_categories': 'follows points_programs',
    'user_cards': 'seeded from the fetched programs; empty if the fetch failed',
    'spend_period_totals': 'follows user_cards',
    'optimizer_alerts': 'follows user_cards',
}


@pytest.fixture
def seeded_demo(app, db, monkeypatch):
    monkeypatch.setattr(DemoService, 'is_demo_mode', staticmethod(lambda: True))
    from src.cli import create_default_currencies
    create_default_currencies()
    DemoService.seed_demo_accounts()
    return db


def _row_counts():
    return {
        name: _db.session.execute(select(func.count()).select_from(table)).scalar()
        for name, table in _db.metadata.tables.items()
    }


def test_every_table_is_either_seeded_or_explained(seeded_demo):
    """*** THE ONE THAT WOULD HAVE CAUGHT D-177. ***

    A new model with no demo rows and no entry in either dict fails here. That is
    deliberately annoying: adding four words to a dict is the cost of shipping a
    feature the demo cannot show, and the alternative is finding out from a user.
    """
    counts = _row_counts()
    explained = (set(NO_DEMO_ROWS_BY_DESIGN) | set(KNOWN_DEMO_GAPS)
                 | set(NONDETERMINISTIC))
    unexplained = sorted(name for name, n in counts.items()
                         if n == 0 and name not in explained)

    assert not unexplained, (
        f'These tables have NO demo rows and no entry explaining why: {unexplained}.\n'
        f'A feature the demo cannot show is a feature nobody can evaluate, and an '
        f'empty page is indistinguishable from a broken one (D-77, D-175, D-177).\n'
        f'Either seed it in src/services/demo/service.py — WITH a backfill, or it '
        f'reaches no demo that already exists — or add it to NO_DEMO_ROWS_BY_DESIGN '
        f'/ KNOWN_DEMO_GAPS in this file with a reason.'
    )


def test_no_exemption_is_STALE(seeded_demo):
    """A table listed as empty that now has rows.

    A stale exemption is how a gate quietly stops covering things: the entry stays,
    the reason rots, and the next reader believes it. `src/__init__.py` refuses a
    stale `_KNOWN_DUPLICATE_ROUTES` for the same reason.
    """
    counts = _row_counts()
    stale = sorted(name for name in set(NO_DEMO_ROWS_BY_DESIGN) | set(KNOWN_DEMO_GAPS)
                   if counts.get(name, 0) > 0)
    assert not stale, (
        f'These are listed as having no demo rows and they now have some: {stale}. '
        f'Delete the entry — a gap that has been closed must stop being excused, or '
        f'the list stops describing anything.'
    )


def test_no_exemption_names_a_table_THAT_DOES_NOT_EXIST(seeded_demo):
    """A renamed or dropped table leaves an entry that silently excuses nothing."""
    counts = _row_counts()
    ghosts = sorted(name for name in (set(NO_DEMO_ROWS_BY_DESIGN) | set(KNOWN_DEMO_GAPS)
                                      | set(NONDETERMINISTIC))
                    if name not in counts)
    assert not ghosts, f'These entries name tables that no longer exist: {ghosts}'


def test_the_surfaces_the_TOUR_lands_on_are_not_empty(seeded_demo):
    """Table-level coverage is necessary and not sufficient.

    D-77's actual defect was that all the investments belonged to demo4 while the
    tour lands on **demo1** — so `portfolios` was non-empty and the page a visitor
    saw was still blank. A per-table count cannot see that; this can.
    """
    from src.models.account import Account
    from src.models.budget import Budget
    from src.models.goal import Goal
    from src.models.investment import Portfolio
    from src.models.transaction import Expense

    tour = 'demo1@finpal.demo'
    for model, label in ((Account, 'Accounts'), (Expense, 'Transactions'),
                         (Budget, 'Budgets'), (Portfolio, 'Investments'),
                         (Goal, 'Goals')):
        assert model.query.filter_by(user_id=tour).first() is not None, (
            f'{label} is EMPTY for {tour}, the account the demo tour lands on. '
            f'That is D-77 exactly: the table has rows and the page a visitor '
            f'sees does not.'
        )


def test_report_the_known_gaps(seeded_demo, capsys):
    """Prints the gap list on every run. Never fails.

    A to-do list nobody reads is not a to-do list, and these gaps are invisible
    from anywhere else — the suite is green whether or not they exist.
    """
    counts = _row_counts()
    with capsys.disabled():
        print(f'\n  demo coverage: {sum(1 for n in counts.values() if n)}/{len(counts)} '
              f'tables seeded, {len(KNOWN_DEMO_GAPS)} known gaps')
        for name, reason in sorted(KNOWN_DEMO_GAPS.items()):
            print(f'    GAP  {name:<28} {reason}')
