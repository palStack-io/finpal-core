"""Everything finPal guessed, in one place, so it can be confirmed or corrected.

*** THE DESIGN IS `docs/superpowers/specs/2026-09-13-needs-review-page-design.md`
IN THE OUTER REPO, AND ITS MOST USEFUL FINDING WAS A ROW KIND TO *REMOVE*. ***
The roadmap proposed four sections; checking them against the code found that
matched transfers do not belong here at all — the transfers spec already records
*"OWNER: auto-apply with a visible undo, not a review queue"*, so putting them on
a queue would be reading past a decision rather than implementing one.

So there are three sections, and **they are not the same shape as each other**:

  * a CATEGORY whose spending group finPal guessed  -> confirm or correct
  * an ACCOUNT whose type finPal inferred           -> confirm or correct
  * an UNCATEGORISED transaction                    -> *choose*, not confirm

*** THE THIRD IS DELIBERATELY DIFFERENT AND MUST NOT BE MADE TO MATCH. *** The
first two say "finPal decided X; was it right?", and confirming moves an existing
`*_source` from `'inferred'` to `'user'`. An uncategorised transaction says
"finPal has no opinion": there is nothing to confirm, no third state, and
inventing a `category_source` to make the sections look alike would be a marker
with no question behind it.

*** NO NEW STORAGE. *** Both confirmations are one existing column changing
value, and in both cases the thing that would overwrite it already checks for
`'user'` — `backfill_spending_type_source` skips a row it does not own, and
`backfill_account_type_source` likewise. A confirmation is permanent by
construction rather than by a rule somebody has to remember.

*** AND NO DENOMINATOR. *** Counts are "3 to review", never "3 of 47". The first
is momentum; the second is a report card about your own mistakes, and this app's
stated purpose includes not making people feel worse (voice rule 11).
"""

import logging

from src.extensions import db
from src.utils.household import can_manage_owned, visible_user_ids

logger = logging.getLogger(__name__)

class ReviewNotPermitted(Exception):
    """The caller may SEE this row but may not write it.

    *** A REFUSAL AND "NOTHING TO CONFIRM" MUST NOT BE THE SAME ANSWER. *** They
    ask for different things: one means *somebody else owns this*, the other
    means *it is already done*. Collapsed into one `False`, the route cannot tell
    a 403 from a benign 200, and a housemate clicking Confirm on another
    member's account — which the page correctly SHOWS them — would get silence
    and a row that stays put.

    This is `describe_refusal`'s rule (D-161) in a second place: two refusals
    that ask for different actions get two answers.
    """


#: The value a `*_source` column carries when finPal decided, not the user.
INFERRED = 'inferred'
#: What it becomes once a person has confirmed or corrected it.
USER = 'user'

#: How many rows a section returns at most.
#:
#: *** A SimpleFin IMPORT LANDS EVERY ACCOUNT WITH AN INFERRED TYPE (D-191), ***
#: and a household can hold hundreds of uncategorised transactions. Returning all
#: of them makes the page a wall and the payload large; the count beside each
#: section is the honest total, and the list is what you can act on now.
#:
#: *** IT IS DELIBERATELY NOT IN THE PAYLOAD. *** Shipping the count AND the page
#: size hands a client everything it needs to render "showing 50 of 237" — which
#: is the denominator this page exists without. The count alone is momentum; the
#: pair is a report card about your own mistakes.
SECTION_LIMIT = 50


def _category_rows(user_ids):
    """Categories whose spending group finPal guessed."""
    from src.models.category import Category

    rows = (Category.query
            .filter(Category.user_id.in_(user_ids),
                    Category.spending_type_source == INFERRED)
            .order_by(Category.name)
            .limit(SECTION_LIMIT).all())
    out = []
    for c in rows:
        parent = c.parent.name if getattr(c, 'parent', None) else None
        out.append({
            'id': c.id,
            'name': c.name,
            'parent_name': parent,
            'spending_type': c.spending_type,
            # *** WHY finPal GUESSED, IN THE PAYLOAD. *** A row that says only
            # "we guessed" asks the user to re-derive the question. D-77 and
            # D-108 are both an inference rendered without its reason.
            'reason': ('finPal sorted this by its name. Whether it is fixed or '
                       'flexible depends on you — a gym contract is fixed, '
                       'pay-as-you-go is not.'),
        })
    return out


def _account_rows(user_ids):
    """Accounts whose type finPal inferred rather than being told (D-191)."""
    from src.models.account import Account

    rows = (Account.query
            .filter(Account.user_id.in_(user_ids),
                    Account.type_source == INFERRED)
            .order_by(Account.name)
            .limit(SECTION_LIMIT).all())
    return [{
        'id': a.id,
        'name': a.name,
        'type': a.type,
        'balance': float(a.balance) if a.balance is not None else None,
        'reason': ('Your bank did not say what kind of account this is, so '
                   'finPal read it from the balance and the name.'),
    } for a in rows]


def _uncategorised_rows(user_ids):
    """Transactions with no category.

    *** TRANSFERS ARE EXCLUDED. *** A transfer between your own accounts is not
    spending and has nothing to categorise, so listing one here would be asking a
    question with no right answer — and budgets already exclude them (D-183).
    """
    from src.models.transaction import Expense

    rows = (Expense.query
            .filter(Expense.user_id.in_(user_ids),
                    Expense.category_id.is_(None),
                    Expense.transaction_type != 'transfer')
            .order_by(Expense.date.desc())
            .limit(SECTION_LIMIT).all())
    return [{
        'id': e.id,
        'description': e.description,
        'amount': float(e.amount) if e.amount is not None else None,
        'currency_code': e.currency_code,
        'date': e.date.isoformat() if e.date else None,
        'transaction_type': e.transaction_type,
    } for e in rows]


def _count(model, *filters):
    return db.session.query(db.func.count(model.id)).filter(*filters).scalar() or 0


def build_review(caller_id):
    """The whole page's payload: three typed sections and their counts.

    *** ONE ENDPOINT, NOT THREE. *** Three clients calling three endpoints is how
    a page becomes inconsistent, and the nav needs ONE answer to "is there
    anything to review at all?" — three round trips to decide whether to render a
    link is the shape that ends with the link flickering on every load.

    *** THE SERVER OWNS EVERY COUNT (D-101). *** Two clients deriving "3 to
    review" independently is two chances to disagree.
    """
    from src.models.account import Account
    from src.models.category import Category
    from src.models.transaction import Expense

    user_ids = visible_user_ids(caller_id)

    categories = _category_rows(user_ids)
    accounts = _account_rows(user_ids)
    uncategorised = _uncategorised_rows(user_ids)

    counts = {
        'categories': _count(Category,
                             Category.user_id.in_(user_ids),
                             Category.spending_type_source == INFERRED),
        'accounts': _count(Account,
                           Account.user_id.in_(user_ids),
                           Account.type_source == INFERRED),
        'uncategorised': _count(Expense,
                                Expense.user_id.in_(user_ids),
                                Expense.category_id.is_(None),
                                Expense.transaction_type != 'transfer'),
    }
    total = sum(counts.values())

    return {
        'total': total,
        'counts': counts,
        'sections': {
            # Each section carries its own verb, because they are different
            # questions — see the module docstring.
            'categories': {'action': 'confirm', 'rows': categories},
            'accounts': {'action': 'confirm', 'rows': accounts},
            'uncategorised': {'action': 'choose', 'rows': uncategorised},
        },
    }


def confirm_category(caller_id, category_id):
    """The user agrees with, or has corrected, a guessed spending group.

    *** HOUSEHOLD-SCOPED, AND THAT IS NOT LAZINESS. *** `can_manage_owned` is
    "deliberately NOT the rule for categories" in as many words: categories are
    household property with **no owner at all** (D-20), so there is nothing for
    an owner check to key on. Accounts are different — see `confirm_account`.

    Returns True when a row changed, False when there was nothing to confirm —
    which is not an error: two tabs open, or a second click.
    """
    from src.models.category import Category

    row = Category.query.filter(
        Category.id == category_id,
        Category.user_id.in_(visible_user_ids(caller_id)),
    ).first()
    if row is None or row.spending_type_source != INFERRED:
        return False
    row.spending_type_source = USER
    db.session.commit()
    return True


def confirm_account(caller_id, account_id):
    """The user agrees with, or has corrected, an inferred account type.

    *** THE OWNER, NOT THE HOUSEHOLD — AND THIS IS THE OPPOSITE RULE FROM
    `confirm_category`. *** `visible_user_ids` is documented **reads only**:
    *"Seeing a housemate's account and being allowed to change it are different
    questions."* An account is assignable to a member, which is exactly what
    makes an owner check meaningful for it, and the deployed rule was once "any
    household member" — which let a housemate delete another member's account
    and null `account_id` across its whole transaction history.

    So the row is FOUND household-wide (the page shows the household's accounts)
    and WRITTEN only by somebody entitled to write it.
    """
    from src.models.account import Account

    row = Account.query.filter(
        Account.id == account_id,
        Account.user_id.in_(visible_user_ids(caller_id)),
    ).first()
    if row is None or row.type_source != INFERRED:
        return False
    if not can_manage_owned(row.user_id, caller_id, account_id=row.id):
        raise ReviewNotPermitted(
            'That account belongs to somebody else in your household. '
            'They can confirm it.')
    row.type_source = USER
    db.session.commit()
    return True
