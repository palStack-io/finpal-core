"""The tier map is the whole security surface, so it is asserted explicitly."""
from src.services.agent_guard.tiers import (
    AGENT_WRITE_TIERS,
    GATED,
    SAFE,
    tier_for,
)


def test_safe_actions_are_additive_or_reclassifying():
    assert tier_for('update_transaction_category') == SAFE
    assert tier_for('recategorise_transactions') == SAFE
    assert tier_for('create_category') == SAFE


def test_gated_actions_change_limits_or_create_money_shaped_data():
    assert tier_for('create_transaction') == GATED
    assert tier_for('set_budget') == GATED
    assert tier_for('create_budget') == GATED
    assert tier_for('rename_category') == GATED


def test_deletes_are_absent_so_default_deny_refuses_them():
    """delete_category silently NULLs category_id on every transaction that used
    it, and delete_budget is a hard delete. Neither is an agent's decision."""
    assert tier_for('delete_category') is None
    assert tier_for('delete_budget') is None
    assert tier_for('delete_transaction') is None


def test_an_unknown_action_is_refused_rather_than_assumed_safe():
    assert tier_for('transfer_ownership') is None
    assert tier_for('') is None
    assert tier_for(None) is None


def test_every_entry_is_a_known_tier():
    assert set(AGENT_WRITE_TIERS.values()) <= {SAFE, GATED}
