"""A preference the UI offers must be one that something READS.

*** THIS EXISTS BECAUSE THE FIX FOR D-148 REINTRODUCED THE DEFECT D-148 WAS ABOUT. ***

web-ui's Settings once rendered four hardcoded toggles — `budgetAlerts`,
`monthlyReports`, `transactionNotifications`, `goalReminders` — that were never
loaded and never sent, and two of which named features that do not exist. D-148
replaced them with three real column names and wired them to `PUT /users/profile`.

That was better and still wrong. `notification_budget_alerts` and
`notification_transaction_alerts` are read by **nothing**, so two of the three
toggles persisted a value no code path would ever consult. Worse than the fakes
they replaced, because they now save and the screen looks like it worked — which
is B2's own sentence ("a control that persists nothing is worse than no control")
and D-167's shape, arriving through the fix rather than around it. That is D-172.

*** THE CHECK IS CROSS-REPO BY NECESSITY, AND THAT IS THE WHOLE POINT. *** The
claim lives in a `.tsx` file and the truth lives in Python. No web-ui test can see
the consumers and no ordinary backend test looks at the client, so the gap between
them is exactly where this class of defect survives — twice now.

**It asserts the direction that matters.** Offering a preference nothing reads is
the defect. Reading a preference the UI does not offer is NOT: the API accepts all
four so a script or a future client can set them, and `notification_push` is
deliberately settable and deliberately not shown.
"""
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SETTINGS = REPO_ROOT / 'web-ui' / 'src' / 'pages' / 'Settings.tsx'

# The key the client uses -> the column it writes. Mirrors NOTIFICATION_COLUMNS in
# api/v1/users.py, which is the map the handler and the published model both read.
KEY_TO_COLUMN = {
    'email': 'notification_email',
    'push': 'notification_push',
    'budgetAlerts': 'notification_budget_alerts',
    'transactionAlerts': 'notification_transaction_alerts',
}

# Where a consumer could plausibly live. The model declares the columns and the
# auth/users endpoints read and write them by definition, so neither counts as
# "something acts on this preference".
SEARCH_DIRS = ('src', 'api')
NOT_A_CONSUMER = ('src/models/user.py', 'api/v1/auth.py', 'api/v1/users.py')


def offered_keys():
    """The preference keys Settings actually renders, read from the source."""
    text = SETTINGS.read_text(encoding='utf-8')
    block = re.search(r'const NOTIFICATION_LABELS = \{(.*?)\}', text, re.S)
    assert block, 'NOTIFICATION_LABELS not found — this test is reading the wrong shape'
    return re.findall(r'^\s*(\w+):', block.group(1), re.M)


def consumers_of(column):
    """Files that act on the column, excluding the model and the two endpoints."""
    hits = []
    for d in SEARCH_DIRS:
        for path in (REPO_ROOT / d).rglob('*.py'):
            rel = path.relative_to(REPO_ROOT).as_posix()
            if rel in NOT_A_CONSUMER:
                continue
            try:
                if column in path.read_text(encoding='utf-8'):
                    hits.append(rel)
            except (UnicodeDecodeError, OSError):
                continue
    return hits


def test_the_test_can_see_the_settings_file():
    """Proof this inspects something. A path that has moved would make every
    assertion below vacuously true, which is how four gates in this repo came to
    report green while checking nothing."""
    assert SETTINGS.exists(), f'{SETTINGS} is gone — this file needs updating, not deleting'
    keys = offered_keys()
    assert keys, 'no preference keys parsed out of Settings.tsx'
    assert set(keys) <= set(KEY_TO_COLUMN), (
        f'Settings offers keys this test does not know how to map: '
        f'{set(keys) - set(KEY_TO_COLUMN)}')


def test_the_control_group_proves_the_search_works():
    """`notification_email` MUST have consumers.

    Without this, a broken search returns nothing for every column and the real
    assertion below passes by finding no offered key with no consumer — a green
    test that has verified the absence of its own evidence.
    """
    assert consumers_of('notification_email'), (
        'notification_email has no consumers, which cannot be true — the CSV import '
        'review and both report emails read it. The search is broken, not the code.')


@pytest.mark.parametrize('key', offered_keys())
def test_every_offered_preference_is_read_by_something(key):
    column = KEY_TO_COLUMN[key]
    found = consumers_of(column)
    assert found, (
        f"Settings offers a '{key}' toggle, but nothing reads {column}.\n"
        f"A control that saves and changes nothing is worse than one that saves nothing, "
        f"because the screen looks like it worked (D-148, D-167, D-172).\n"
        f"Either give it a consumer or stop offering it.")
