"""
Correct the `is_system` flag on categories the old demo seeder over-flagged.

*** THIS EXISTS BECAUSE FIXING THE SEEDER FIXED NOTHING THAT WAS ALREADY IN A
DATABASE — D-178. *** `load_default_categories` now flags only "Other", but
`seed_demo_accounts` SKIPS users that already exist, so a redeploy re-seeds
nothing and the 588 rows already on the live demo would have stayed uneditable
behind a defect marked fixed. A seed change is not shipped until a
condition-keyed correction exists for the rows the old version wrote.

*** CONDITION-KEYED, NOT DEMO-KEYED AND NOT VERSION-KEYED. *** The condition is
"a system category whose name is not 'Other'". Any instance seeded through
`load_default_categories` carries these, not only the demo, so a self-hoster who
used that path is corrected too; on a signup-seeded instance it matches nothing
and is a no-op. Nothing stores "this ran" — re-running is a no-op because the
condition stops matching.

*** WHY IT CANNOT OVER-REACH. *** The only writers of `is_system=True` are the
two seeders: `AuthService.create_default_categories`, which sets it on "Other"
alone, and `load_default_categories`. Nothing in the API or the UI lets a user
create one — `api/v1/categories.py`'s POST does not accept the field — so a
`True` on any other name can only have come from the old seeder.

"Other" keeps its flag, and that is the whole point of the flag: it is where
orphaned transactions land when a category is deleted
(`src/services/category/service.py`), so a user who could delete it would send
those rows to `category_id` NULL.
"""

import logging

logger = logging.getLogger(__name__)

#: The one name the flag legitimately protects.
FALLBACK_CATEGORY_NAME = 'Other'


def _rows_to_correct():
    from src.models.category import Category
    return Category.query.filter(
        Category.is_system.is_(True),
        Category.name != FALLBACK_CATEGORY_NAME,
    ).all()


def correct_system_category_flag():
    """Clear `is_system` on every category except "Other". Returns the count.

    Never raises: this runs at boot and a bad row must not stop the app
    starting.
    """
    from src.extensions import db

    try:
        rows = _rows_to_correct()
        if not rows:
            return 0
        for row in rows:
            row.is_system = False
        db.session.commit()
        logger.info(
            'Cleared is_system on %d categories the old seeder over-flagged; '
            'only "%s" keeps it.', len(rows), FALLBACK_CATEGORY_NAME)
        return len(rows)
    except Exception:
        db.session.rollback()
        logger.exception('is_system correction failed; continuing boot.')
        return 0
