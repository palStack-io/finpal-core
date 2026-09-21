#!/usr/bin/env python
"""Give every category its icon back, after a non-idempotent conversion took them.

*** READ-ONLY BY DEFAULT. `--apply` IS THE ONLY THING THAT WRITES. *** Same
shape as `scripts/schema_drift.py`, and for the same reason: this touches a
column on every row of a live table, and a script that reports before it acts
can be run by somebody who is not yet sure they want to run it.

WHY THIS IS NEEDED
------------------
`src/data/convert_icons_to_emoji.convert_icon` was `ICON_MAP.get(name, '📁')`.
`ICON_MAP` is keyed by FontAwesome names, so an already-converted emoji was not
a key and came back as the fallback — applying the conversion twice replaced
every icon with a folder. Measured on `findemo.palstack.io` 2026-09-16: **275
categories, one distinct icon, `'📁'`**. The function is idempotent now
(`tests/unit/test_icon_conversion_is_idempotent.py`), so this cannot happen
again — but the databases it already ran over have lost their icons, and
finPal's schema comes from `create_all()` rather than Alembic on a default
deploy (D-121), so there is no migration state to consult about who is affected.

*** RECOVERY IS BY NAME, BECAUSE THE ORIGINAL VALUES ARE GONE. *** There is
nothing left in the row to convert: the `fa-*` name was overwritten. What IS
still known is which icon each default category is SUPPOSED to have, in the two
seed trees. So this rebuilds a name -> emoji index from both of them and repairs
by matching the category's name.

*** WHICH MEANS IT ONLY REPAIRS DEFAULT CATEGORIES, AND IT SAYS SO. *** A
category a user named themselves is not in either seed tree and is left alone —
reporting it rather than guessing. A user who deliberately chose the folder icon
also keeps it if their category's name is not a default one. Both of those are
"we do not know", and inventing an icon for them would be the same class of
mistake as the bug being repaired.

USAGE
-----
    ./venv/bin/python scripts/repair_category_icons.py            # report only
    ./venv/bin/python scripts/repair_category_icons.py --apply    # write
    ./venv/bin/python scripts/repair_category_icons.py --user demo1@finpal.demo
"""
import argparse
import re
import sys
from collections import Counter

sys.path.insert(0, '.')

from src import create_app                                    # noqa: E402
from src.extensions import db                                 # noqa: E402
from src.models.category import Category                      # noqa: E402
from src.data.convert_icons_to_emoji import (                 # noqa: E402
    FALLBACK, convert_icon,
)
from src.data.default_categories import DEFAULT_CATEGORIES    # noqa: E402

#: What a row has to look like to be considered damaged. Deliberately NOT
#: "anything that is not an emoji": a NULL icon is a category with no icon,
#: which is a different statement, and the client renders its own fallback for
#: that. Only the fallback VALUE, stored in the column, is the fingerprint of
#: this particular conversion having run twice.
DAMAGED = FALLBACK


def _from_default_categories():
    """name -> emoji, out of `src/data/default_categories.py` (147 icons).

    `DEFAULT_CATEGORIES` is a DICT keyed by parent name whose values hold a list
    of subcategory dicts — not a list of nodes. Worth saying, because a walker
    written for the other shape iterates the dict's KEYS, calls `.get` on a
    string and raises; and one written defensively would have returned an empty
    index and reported "0 repairable" as a success.
    """
    index = {}
    for parent_name, data in DEFAULT_CATEGORIES.items():
        if data.get('icon'):
            index.setdefault(parent_name, convert_icon(data['icon']))
        for sub in data.get('subcategories', []) or []:
            if sub.get('name') and sub.get('icon'):
                index.setdefault(sub['name'], convert_icon(sub['icon']))
    return index


def _from_signup_seeder():
    """name -> emoji, out of `auth/service.py::create_default_categories`.

    Read from the source rather than called: the tree is a local inside the
    method and there is no seam to reach it without creating a user. The same
    approach `tests/unit/test_icon_conversion_is_idempotent.py` takes, and it
    fails loudly rather than silently returning nothing.
    """
    with open('src/services/auth/service.py', encoding='utf-8') as fh:
        src = fh.read()
    start = src.index('default_categories = [')
    end = src.index(
        'from src.services.category.spending_type import default_for', start)
    pairs = re.findall(r'"name": "([^"]+)", "icon": "([^"]+)"', src[start:end])
    if len(pairs) < 25:
        raise SystemExit(
            f'read only {len(pairs)} name/icon pairs out of auth/service.py — '
            'the literal changed shape and this index would repair almost '
            'nothing while reporting success')
    return {name: convert_icon(icon) for name, icon in pairs}


def build_index():
    """Both seeders, with `default_categories.py` winning a disagreement.

    It is the larger and more specific tree (147 icons, 98 distinct, zero
    folders) and it is the one that has always been converted correctly.
    """
    index = dict(_from_signup_seeder())
    index.update(_from_default_categories())
    index = {k: v for k, v in index.items() if v and v != FALLBACK}
    if len(index) < 100:
        raise SystemExit(
            f'the name index has only {len(index)} entries — one of the two '
            'seed trees changed shape, and repairing from a half-built index '
            'would leave most categories reporting "not a default name"')
    return index


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true',
                    help='write the repairs. Without this, report only.')
    ap.add_argument('--user', help='limit to one user id (an email here).')
    args = ap.parse_args()

    index = build_index()
    print(f'name -> emoji index: {len(index)} names, '
          f'{len(set(index.values()))} distinct icons')

    app = create_app()
    with app.app_context():
        query = Category.query.filter(Category.icon == DAMAGED)
        if args.user:
            query = query.filter(Category.user_id == args.user)
        damaged = query.all()

        total = Category.query.count()
        print(f'{total} categories total, {len(damaged)} holding {DAMAGED!r}')

        repairable = [c for c in damaged if c.name in index]
        unknown = [c for c in damaged if c.name not in index]

        print(f'  repairable by name: {len(repairable)}')
        print(f'  left alone (not a default category name): {len(unknown)}')
        if unknown:
            names = Counter(c.name for c in unknown)
            print('    ' + ', '.join(
                f'{n} x{k}' if k > 1 else n for n, k in names.most_common(12)))

        if not args.apply:
            print()
            print('REPORT ONLY — nothing written. Re-run with --apply to write.')
            for c in repairable[:15]:
                print(f'    would set {c.name!r} -> {index[c.name]}')
            return 0

        for c in repairable:
            c.icon = index[c.name]
        db.session.commit()

        # *** VERIFY BY RE-READING, NOT BY TRUSTING THE COMMIT. *** Asserting on
        # a commit that returned is asserting on a status code; this project's
        # rule is to read the database back.
        remaining = Category.query.filter(Category.icon == DAMAGED).count()
        distinct = db.session.query(Category.icon).distinct().count()
        print(f'wrote {len(repairable)} icons. '
              f'{remaining} rows still {DAMAGED!r}, {distinct} distinct icons now.')
        return 0


if __name__ == '__main__':
    sys.exit(main())
