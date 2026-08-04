"""Which writes an API-token caller may apply, and which need a human.

The rule is reversibility, not importance: add and reclassify freely because both
can be undone; ask before changing a limit or rewriting a label; never delete.
"""
SAFE = 'safe'
GATED = 'gated'

AGENT_WRITE_TIERS = {
    # SAFE — additive or reclassifying, and reversible from undo_state.
    'update_transaction_category': SAFE,
    'recategorise_transactions': SAFE,
    'create_category': SAFE,

    # GATED — changes a limit, or rewrites a label historical reporting reads.
    'create_transaction': GATED,
    'set_budget': GATED,
    'create_budget': GATED,
    'rename_category': GATED,

    # Deliberately absent, so tier_for() returns None and the guard refuses:
    #
    #   delete_category — Category.expenses is a backref with no cascade and
    #     Expense.category_id is nullable, so deleting a category sets
    #     category_id = NULL on every transaction that used it. Verified against
    #     this codebase: the rows survive but lose their categorisation across
    #     all history, with no undo, and every category-grouped report shifts.
    #   delete_budget — hard db.session.delete(), no soft delete, no undo.
    #
    # Also absent by construction: anything touching auth, users, household
    # membership, bank credentials or billing.
}

# Largest number of rows one bulk action may touch. Bounds the undo_state
# payload and stops "recategorise everything" being one click.
BULK_ROW_CAP = 200


def tier_for(action):
    """SAFE, GATED, or None when the action is not exposed to agents."""
    if not action:
        return None
    return AGENT_WRITE_TIERS.get(action)
