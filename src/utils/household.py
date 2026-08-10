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


def current_viewer_ids():
    """`visible_user_ids` for whoever is making THIS request.

    Exists because the budget **arithmetic** needs the caller's scope and cannot be
    handed it: `spent` is produced inside `BudgetSchema.get_spent`, which marshmallow
    calls with the model instance and nothing else. The obvious alternative — stashing
    the caller on the schema's `context` — is not available, because `budgets_schema`
    is a module-level singleton shared across requests.

    **This is what D-66 got wrong.** `calculate_spent_amount` called
    `household_user_ids()` regardless of whose budget it was, so on an instance with
    demo accounts *and* one real user, every budget — including a demo's own —
    reported the REAL household's spending, and on an all-demo instance the set was
    empty and every budget read $0.00 and "on track" forever.

    Falls back to `household_user_ids()` outside a request (schedulers, shell), which
    is the pre-existing behaviour for those callers and is correct: no caller means no
    sandbox to respect.
    """
    try:
        from flask_jwt_extended import get_jwt_identity
        caller = get_jwt_identity()
    except Exception:
        caller = None
    return visible_user_ids(caller) if caller else household_user_ids()


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


# --- Attribution ------------------------------------------------------------
#
# Promoted here from `api/v1/transactions.py` during D-18 item E, for the reason
# that file's own docstring gives: the predicate has to be written ONCE. The
# transactions list, the member filter and now the dashboard's figures are all
# built from it, so they cannot disagree about which rows a member owns. A second
# copy inside the analytics service is exactly what would let the list and the
# totals drift, which is the shape D-18 was opened for.


def owner_scope_filter(user_ids):
    """Rows attributed to any of `user_ids`.

    **A row belongs to whoever owns its ACCOUNT, full stop** — owner decision,
    2026-08-06. `split_with` stays in the product for settling up, and the group
    and settlement screens still read it, but it no longer answers "whose
    transaction is this". A row Alice paid for on her card and split with Bob is
    Alice's; Bob's share is a settlement matter, not an attribution one.

    The second clause is the orphan rule, and it is not defensive padding.
    `Expense.account_id` is nullable and
    `AccountRepository.nullify_account_on_transactions` nulls it across an
    account's entire history when the account is deleted, so account-less rows are
    reachable and permanent. They fall back to `Expense.user_id` — who entered the
    row — which is the only non-null field that can carry them.

    Because it reads `Account.user_id`, every caller must join `Account` in — see
    `scope_query`.
    """
    from sqlalchemy import and_, or_

    from src.models.account import Account
    from src.models.transaction import Expense

    return or_(
        Account.user_id.in_(user_ids),
        and_(Expense.account_id.is_(None), Expense.user_id.in_(user_ids)),
    )


def scope_query(user_ids):
    """`owner_scope_filter` with the outer join it depends on.

    The join must be OUTER: an inner join drops every account-less row before the
    orphan clause can catch it, which would silently hide rows rather than
    misattribute them. The ON clause is explicit because `Expense` has two foreign
    keys to `accounts` (`account_id` and `destination_account_id`) and SQLAlchemy
    cannot choose between them.
    """
    from src.models.account import Account
    from src.models.transaction import Expense

    return (Expense.query
            .outerjoin(Account, Expense.account_id == Account.id)
            .filter(owner_scope_filter(user_ids)))


def read_scope(user_id):
    """The user IDs a *read* by `user_id` may cover.

    `visible_user_ids`, never `household_user_ids` — it collapses to the caller
    alone for a demo account. Demo accounts ship with a published password, so a
    read keyed to the household puts the real household's money behind credentials
    that are in the repository. That is D-42, and this is the same guard one level
    down.

    **A personal access token stays caller-scoped — D-50.** Widening reads to the
    household would otherwise have widened them for PATs too, silently, as a side
    effect rather than a decision. `AgentAccess.tsx:386` promises the user in as
    many words: *"A token reads only your own data."* A PAT is a long-lived
    credential pasted into an MCP client or a script, so quietly handing it a
    housemate's money breaks a stated promise on exactly the surface where the
    promise matters most. `g.pat` is set by `api_auth_required` and is None for an
    ordinary session, which is what makes the two cases distinguishable at all.

    **This is what `analytics` was missing.** Every query in the analytics service
    scoped on `get_all_user_ids()`, which has no `is_demo_user` filter at all — so
    a demo login's figures covered the real household's money and vice versa. Same
    hole as D-42, one service over, and it had never been narrowed because nothing
    in analytics had a scope decision written down.
    """
    from flask import g

    if getattr(g, 'pat', None) is not None:
        return [user_id]
    return visible_user_ids(user_id)


def member_read_scope(user_id, member_id):
    """`read_scope`, optionally narrowed to one member.

    Returns `None` when `member_id` names someone outside the caller's scope. The
    caller answers **403** for that, never an empty list: an empty list is
    indistinguishable from "that member has nothing", and a filter that silently
    returns nothing for an id it refuses to honour is the affordance-that-lies
    shape D-18 exists to remove.
    """
    scope = read_scope(user_id)
    if member_id is None:
        return scope
    return [member_id] if member_id in scope else None
