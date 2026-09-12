"""Money moved between two of the user's own accounts is not income.

*** THE LIVE IMPORT PATH HAS NO TRANSFER DETECTION AT ALL. *** The
`detect_transfer_func` logic in `integrations/simplefin/client.py` sits inside
`create_transaction_instance`, which has **zero callers** -- the real sync runs
through `SimpleFinService.sync_account`, which reads `transaction_type` straight
off the feed. So a positive amount always becomes `income`, including a £500
transfer from savings to current, and D-183's inflation is not a risk but a
guarantee.

*** THE STORED SHAPE IS NOT THE FEED'S SHAPE, AND THE SPEC WAS WRITTEN AGAINST
THE WRONG ONE. *** The design says "opposite signs", which is true of the feed:
SimpleFin sends -500 and +500. But the importer does `amount = abs(amount)` and
puts the direction in `transaction_type` (`client.py:191`), so by the time both
legs are rows the signs are GONE and both amounts are positive. Matching on sign
here would match nothing, for ever, and look like a working feature. The rule is
therefore **equal amounts with opposite TYPES**.
"""

import logging
import uuid
from datetime import timedelta

from src.extensions import db
from src.models.transaction import Expense

logger = logging.getLogger(__name__)

# Banks post the two legs of one transfer on different days -- the debit clears
# before the credit lands more often than not. Same-day-only would miss most
# real transfers; a wide window turns unrelated amounts into false pairs.
MATCH_WINDOW_DAYS = 3

_OPPOSITE = {'expense': 'income', 'income': 'expense'}


def _candidates(row, pool):
    """Every row that could be `row`'s other leg.

    Equal amount, opposite TYPE (see the header -- not opposite sign), a
    different account, and within the window. `user_id` is already guaranteed by
    the caller's query.
    """
    want = _OPPOSITE.get(row.transaction_type)
    if want is None:
        return []
    lo = row.date - timedelta(days=MATCH_WINDOW_DAYS)
    hi = row.date + timedelta(days=MATCH_WINDOW_DAYS)
    return [
        other for other in pool
        if other.id != row.id
        and other.transfer_group_id is None
        and other.transaction_type == want
        and other.amount == row.amount
        # *** A DIFFERENT ACCOUNT, AND BOTH MUST BE KNOWN. *** Two rows with no
        # account cannot be shown to be a transfer between two accounts, and
        # pairing them would be a guess dressed as a match.
        and other.account_id is not None
        and row.account_id is not None
        and other.account_id != row.account_id
        and lo <= other.date <= hi
    ]


def match_transfers(user_id, rows=None):
    """Link the two legs of each transfer. Returns the number of PAIRS made.

    *** IF MORE THAN ONE CANDIDATE MATCHES, MATCH NOTHING. *** Two genuine £500
    expenses on one day are indistinguishable from one £500 transfer, and a false
    positive here does not merely mislabel a row -- it DELETES a real expense
    from the user's budget, because budgets exclude transfers. Ambiguity refuses;
    it does not pick the nearest. This is the rule most likely to be wrong in
    practice and it is wrong in the safe direction.

    *** A USER-SET TYPE IS NEVER OVERWRITTEN. *** `type_source == 'user'` means a
    person said what this row is, and an import running afterwards must not
    silently disagree with them.

    Does not commit -- the caller owns the transaction, so a sync and its
    matches land together or not at all.
    """
    query = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.transfer_group_id.is_(None),
        Expense.transaction_type.in_(('expense', 'income')),
    )
    if rows is not None:
        ids = [r.id for r in rows if r.id is not None]
        if not ids:
            return 0
        query = query.filter(Expense.id.in_(ids))

    pool = query.all()
    # The pool must include rows OUTSIDE the batch too: the other leg of a
    # transfer can have arrived in an earlier sync, and a matcher that only ever
    # looks within one batch would miss every pair that straddles two.
    if rows is not None:
        pool = pool + Expense.query.filter(
            Expense.user_id == user_id,
            Expense.transfer_group_id.is_(None),
            Expense.transaction_type.in_(('expense', 'income')),
            ~Expense.id.in_([r.id for r in pool]),
        ).all()

    by_id = {r.id: r for r in pool}
    pairs = 0

    for row in sorted(pool, key=lambda r: (r.date, r.id)):
        fresh = by_id.get(row.id)
        if fresh is None or fresh.transfer_group_id is not None:
            continue
        # *** A USER-SET TYPE IS PROTECTED BY THE CANDIDATE FILTER BELOW, AND
        # THERE USED TO BE A SECOND, REDUNDANT GUARD HERE. *** It read
        # `if fresh.type_source == 'user': continue`, and a sabotage removing it
        # changed nothing: a user-set row is excluded from every OTHER row's
        # candidate list, so the mutual check a few lines down sees `len(back)
        # == 0` and refuses anyway. It was removed rather than kept, because a
        # guard that cannot fail is worse than no guard -- it tells a reader the
        # protection lives here when it actually lives in the two `type_source
        # != 'user'` filters. `test_a_user_set_type_is_respected_FROM_EITHER_SIDE`
        # is what proves both directions really are covered.
        found = [c for c in _candidates(fresh, pool)
                 if c.transfer_group_id is None and c.type_source != 'user']
        if len(found) != 1:
            if len(found) > 1:
                logger.info(
                    'transfer match refused for expense %s: %s candidates',
                    fresh.id, len(found))
            continue

        other = found[0]

        # *** AMBIGUITY IS MUTUAL, AND MY FIRST VERSION CHECKED ONLY ONE SIDE. ***
        # One £500 debit against TWO £500 credits: the debit correctly refuses,
        # because it sees two candidates. But the loop then reaches the FIRST
        # credit, which sees exactly one candidate -- the debit -- and pairs with
        # it. The refusal was real and then quietly undone one iteration later,
        # and the pair it produced was the coin toss the refusal existed to
        # prevent. Caught by `test_AMBIGUITY_REFUSES_RATHER_THAN_PICKING`, which
        # is why that test asserts the TYPES of all three rows rather than just
        # the returned count.
        #
        # A pair is unambiguous only if each leg is the other's only candidate.
        back = [c for c in _candidates(other, pool)
                if c.transfer_group_id is None and c.type_source != 'user']
        if len(back) != 1 or back[0].id != fresh.id:
            logger.info(
                'transfer match refused for expense %s: its candidate %s has %s '
                'of its own', fresh.id, other.id, len(back))
            continue
        group = str(uuid.uuid4())
        for leg in (fresh, other):
            leg.transaction_type = 'transfer'
            leg.transfer_group_id = group
        pairs += 1

    if pairs:
        logger.info('matched %s transfer pair(s) for %s', pairs, user_id)
    return pairs
