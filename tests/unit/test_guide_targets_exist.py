"""Every tour step must point at something that exists in the page source.

The client skips a missing target at runtime, which keeps a tour from breaking; this
gate is what stops the skip from hiding a step that was DELETED by a refactor.
"""
import pathlib
import re

from src.services.onboarding.guides import PAGE_GUIDES

SRC = pathlib.Path(__file__).resolve().parents[2] / 'web-ui' / 'src'
PAGE_FILES = {
    'accounts': 'pages/Accounts.tsx', 'budgets': 'pages/BudgetsMinimal.tsx', 'goals': 'pages/Goals.tsx',
    'dashboard': 'pages/Dashboard.tsx', 'transactions': 'pages/Transactions.tsx',
    'investments': 'pages/Investments.tsx', 'review': 'pages/Review.tsx', 'kit': 'pages/Kit.tsx',
    'analytics': 'pages/Analytics.tsx', 'groups': 'pages/Groups.tsx', 'settings': 'pages/Settings.tsx',
    'recurring': 'components/RecurringTransactions.tsx',
    'categories': 'components/CategoryManagement.tsx',
    'rules': 'components/TransactionRules.tsx',
    'pointspal': 'modules/pointspal/pages/Overview.tsx',
    'pointspal-caps': 'modules/pointspal/pages/CapTracker.tsx',
    'pointspal-recommend': 'modules/pointspal/pages/BestCard.tsx',
    'pointspal-cards': 'modules/pointspal/pages/MyCards.tsx',
    'pointspal-redeem': 'modules/pointspal/pages/Redeem.tsx',
    'learnpal': 'modules/learnpal/pages/Home.tsx',
    'learnpal-lessons': 'modules/learnpal/pages/Lessons.tsx',
    'learnpal-range': 'modules/learnpal/pages/Range.tsx',
}


def test_every_tour_target_is_a_data_guide_on_its_page():
    for page, entry in PAGE_GUIDES.items():
        source = (SRC / PAGE_FILES[page]).read_text()
        for step in entry.get('tour', []):
            target = re.escape(step['target'])
            # `data-guide="x"`, or a conditional `data-guide={cond ? 'x' : undefined}` (a target
            # that must exist only when there is something to point at, e.g. a non-empty list).
            literal = rf'data-guide=["\']{target}["\']'
            conditional = rf'data-guide=\{{[^}}]*["\']{target}["\'][^}}]*\}}'
            assert re.search(literal, source) or re.search(conditional, source), (
                page, step['target'])


def test_every_guided_page_declares_its_guide():
    for page, filename in PAGE_FILES.items():
        source = (SRC / filename).read_text()
        # `guide="x"` on a PageHead, or a direct `<PageGuide page="x" />` where a page has no
        # PageHead (Settings is a two-pane layout).
        assert re.search(rf'(?:guide=|<PageGuide\s+page=)["\']{page}["\']', source), page


def test_every_registry_page_has_a_source_file_mapped():
    """A page added to the registry without a file here would be silently ungated."""
    assert set(PAGE_FILES) == set(PAGE_GUIDES)
