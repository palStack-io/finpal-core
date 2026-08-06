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
    """
    if is_demo_user(caller_id):
        return [caller_id]
    return household_user_ids()
