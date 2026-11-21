"""Correct category icons the old seeders wrote as emoji into line-icon keys (Wave 0, 2026-11-20).

*** EDITING THE SEEDERS CHANGED NOTHING ALREADY IN A DATABASE (D-178). *** The default tree and the other writers
hold keys from this release on (`src/models/category_icons.py`); this is the condition-keyed correction for the rows
every earlier version wrote. Core's schema comes from `create_all()`, not Alembic, so it runs at boot, beside the
`is_system` correction, the way core does every data correction.

*** KEYED ON THE OLD VALUE. *** A row changes only when its icon is one of the emoji finPal itself wrote
(`LEGACY_EMOJI`, compared without U+FE0F), and it is set to exactly that emoji's key. A person's own icon (any other
emoji or text) is left alone, and nothing stores "this ran": a second boot matches nothing because a key is not an
old emoji. The API's `icon` field still answers the same emoji for a key, so no client sees a change.
"""

import logging

logger = logging.getLogger(__name__)


def _rows_to_correct():
    """(row, key) for every category whose stored icon is an old finPal emoji."""
    from src.models.category import Category
    from src.models.category_icons import ICON_KEYS, to_key

    candidates = Category.query.filter(Category._icon.isnot(None), Category._icon.notin_(ICON_KEYS)).all()
    return [(row, to_key(row._icon)) for row in candidates if to_key(row._icon) in ICON_KEYS]


def correct_seeded_icon_emoji():
    """Store the key for every category still holding an emoji finPal seeded. Returns the count.

    Commits its own change (D-188). Never raises: this runs at boot and a bad row must not stop the app starting.
    """
    from src.extensions import db

    try:
        rows = _rows_to_correct()
        if not rows:
            return 0
        for row, key in rows:
            row._icon = key
        db.session.commit()
        logger.info('Category icons: %d seeded emoji turned into line-icon keys.', len(rows))
        return len(rows)
    except Exception:
        db.session.rollback()
        logger.exception('category icon key correction failed; continuing boot.')
        return 0
