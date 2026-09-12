"""Is this category money in, or money out? — D-189.

*** finPal HAS NEVER HAD A COLUMN FOR THIS, AND THREE PLACES ASK THE QUESTION. ***
Income and expense live on the TRANSACTION (`transaction_type`); the seeded
"Income" tree is a naming convention a user can rename. So `_group_by_spending_type`
could not check, and a budget on *Salary* was accepted, bucketed as `unsorted`
and **summed as planned spending**. Measured on the live demo: `totals.planned`
went 1,400 to **5,900** and `remaining` to **5,554.46** — the page told the user
they had £4,500 of unearned money left to spend — while `left_to_budget`
(`income − planned`) subtracted the same row from income, corrupting it in both
directions at once.

*** THE BACKFILL KEYS ON `DEFAULT_CATEGORIES`, NOT ON A STRING MATCH. *** That
table is finPal's OWN record of what it seeded, so reading it is reading our own
data; matching the word "Income" against a category name would be matching a
user-editable string in a locale finPal does not control, which is exactly what
D-191's account-type inference refuses to do and what D-189 rejected when it was
first designed.

**A category finPal did not seed keeps `kind = NULL`**, which is *not stated* —
counted as an expense in the TOTALS because they have to add up, and never
LABELLED one, because that would be a claim nobody made.
"""

import logging

from src.data.default_categories import DEFAULT_CATEGORIES
from src.extensions import db
from src.models.category import Category

logger = logging.getLogger(__name__)


def _seeded_kinds():
    """`{category name: kind}` for everything the seeder creates.

    A subcategory inherits its parent group's kind: every child of *Income* is
    income, and the seeder has no group that mixes the two.
    """
    out = {}
    for group, spec in DEFAULT_CATEGORIES.items():
        kind = spec.get('kind', 'expense')
        out[group] = kind
        for sub in spec.get('subcategories', []):
            out[sub['name']] = kind
    return out


SEEDED_KINDS = _seeded_kinds()


def kind_for_seeded(name):
    """The kind for a category the seeder created, or `None` if it did not."""
    return SEEDED_KINDS.get((name or '').strip())


def backfill_category_kind():
    """Stamp `kind` on every category written before the column existed.

    *** CONDITION-KEYED ON `kind IS NULL` (D-178), *** which is exactly "written
    before this column existed". Re-running is a no-op, and a user who has set a
    kind keeps it — the importer and this backfill both refuse to overwrite a
    value that is already there.

    *** IT DOES NOT GUESS FOR A CATEGORY finPal DID NOT SEED. *** A user's own
    "Consulting" category is left NULL rather than assumed to be an expense.
    Assuming would be right most of the time and wrong silently, and the whole
    reason this column exists is that a silent wrong answer moved £4,500 into
    the wrong column of somebody's budget.

    Returns how many rows were stamped, for the boot log.
    """
    rows = Category.query.filter(Category.kind.is_(None)).all()
    if not rows:
        return 0

    stamped = 0
    for category in rows:
        kind = kind_for_seeded(category.name)
        if kind is None:
            continue
        category.kind = kind
        stamped += 1

    if stamped:
        db.session.commit()
        logger.info('category kind stamped on %s row(s)', stamped)
    return stamped
