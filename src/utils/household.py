"""
Household utility
One finPal instance = one household. All users share the same data.

**A demo account is a row on the instance but is NOT a household member**, and that
distinction is the whole subject of this module. `get_all_user_ids()` does not make
it: it returns every user, demo accounts included. Demo accounts ship with a
**published** password (`src/services/demo/service.py`) and sign in through the
ordinary `/auth/login`, so on any instance running `DEMO_MODE=true` anyone who knows
those credentials is inside any permission keyed to that function. That is exactly
how D-42 happened — one hour after D-20 made categories household property, a demo
login could rename and delete the real household's categories.

So there are three functions here and choosing between them is a decision:

  * `get_all_user_ids()` — every user, demo included. It has ~38 callers (accounts,
    budgets, every analytics query) and some of them may want demo rows so the demo
    experience works at all. **Left exactly as it was**; narrowing it globally is a
    change to make with all 38 in view, not a tidy-up.
  * `household_user_ids()` — the real household. Promoted here from
    `CategoryService`, where D-42's fix first introduced it, so that the next
    permission does not re-derive it slightly differently.
  * `visible_user_ids(caller_id)` — what a *particular* caller may see, which is the
    one a route almost always wants. It collapses to the caller alone for a demo
    account, which keeps the sandbox symmetric: a demo visitor must not reach the
    household's data, and the household must not delete the rows a demo persona is
    built from, or the tour breaks for the next visitor.

**Use `visible_user_ids` for both the list and the detail of a resource, or they
disagree.** A list built from `get_all_user_ids()` beside a detail route built from
`household_user_ids()` puts a row on screen that its viewer cannot open — which is
D-43, the defect the account work exists to fix.
"""

from src.models.user import User


def get_all_user_ids():
    """Every user ID on this instance, **including demo accounts**.

    Prefer `household_user_ids()` or `visible_user_ids()` for anything that decides
    a permission. See this module's docstring for why.
    """
    return [u.id for u in User.query.with_entities(User.id).all()]


def household_user_ids():
    """The real household: everyone on the instance except demo accounts."""
    return [u.id for u in User.query.with_entities(User.id)
            .filter(User.is_demo_user.isnot(True)).all()]


def is_demo_user(user_id):
    """Whether this id belongs to a demo account."""
    return bool(User.query.with_entities(User.is_demo_user)
                .filter_by(id=user_id).scalar())


def is_household_member(user_id):
    """Whether an id may be assigned ownership of household property.

    False for a demo account and False for an id that is not on the instance at
    all — an owner picker must refuse both, and refuse them the same way.
    """
    if not user_id:
        return False
    row = User.query.with_entities(User.is_demo_user).filter_by(id=user_id).first()
    if row is None:
        return False
    return not bool(row[0])


def visible_user_ids(caller_id):
    """The user IDs whose data `caller_id` may see.

    The household for a member; the caller alone for a demo account.

    **Reads only.** Seeing a housemate's account and being allowed to change it are
    different questions — see `can_manage_owned`.
    """
    if is_demo_user(caller_id):
        return [caller_id]
    return household_user_ids()


def is_admin(user_id):
    """Whether this id is a household admin.

    `is_admin` is already the household's authority flag: `api/v1/team.py` gates
    adding, removing and re-roling members on it, `api/v1/import_sources.py` gates on
    it, and the first registered user gets it (`api/v1/auth.py`).
    """
    return bool(User.query.with_entities(User.is_admin)
                .filter_by(id=user_id).scalar())


def can_manage_owned(owner_id, caller_id):
    """Whether `caller_id` may MUTATE a thing owned by `owner_id`.

    **Owner or admin — owner decision, 2026-08-06.** Everyone in the household still
    *sees* every account and portfolio; only its owner and the admin may rename,
    reassign or delete it. Between 2026-08-06 and this change the deployed rule was
    "any household member", which let a housemate delete another member's account and
    null `account_id` across its entire transaction history.

    This is deliberately NOT the rule for categories. Categories are household
    property with no owner at all (D-20), so there is nothing for an owner check to
    key on. Accounts and investments are *assignable to a member*, and that is exactly
    what makes an owner check meaningful for them.

    It is also NOT the rule for SimpleFin sync, which stays household-scoped — see
    `SimpleFinService.sync_account`. Refreshing an account is driven by whoever holds
    the credential, not by who owns the money, and `SimpleFin.user_id` is unique per
    user; keying sync to the owner would leave a reassigned account syncable by nobody.

    Demo accounts collapse to plain ownership in both directions, keeping the sandbox
    symmetric (D-42): a demo visitor manages only its own rows, and no demo account is
    ever treated as an admin over real household data.
    """
    if not owner_id or not caller_id:
        return False
    if owner_id == caller_id:
        return True
    if is_demo_user(owner_id) or is_demo_user(caller_id):
        return False
    return is_admin(caller_id)
