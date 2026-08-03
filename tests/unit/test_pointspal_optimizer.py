"""
Unit tests for build_optimizer.

Tests: no cards → empty list, card with no cap (status ok),
card at cap threshold (warning), card over cap (capped),
cards sorted with capped/warning first.
"""

import json
import pytest
from tests.factories import UserFactory


def _make_program(db, program_id='test-card', tpg_cpp=0.02):
    from src.modules.pointspal.models import PointsProgram, PointsEarnCategory
    prog = PointsProgram(
        program_id=program_id,
        program_name=f'Test Card {program_id}',
        issuer='TestBank',
        tpg_cpp=tpg_cpp,
    )
    db.session.add(prog)
    db.session.flush()

    ec = PointsEarnCategory(
        program_id=program_id,
        category='dining',
        multiplier=3.0,
        cap_amount=None,
        cap_period=None,
        multiplier_fallback=1.0,
    )
    db.session.add(ec)
    db.session.commit()
    return prog


def _make_card(db, user_id, program_id='test-card', confidence_level='high'):
    from src.modules.pointspal.models import UserCard
    card = UserCard(
        user_id=user_id,
        program_id=program_id,
        card_nickname='My Test Card',
        confidence_level=confidence_level,
    )
    db.session.add(card)
    db.session.commit()
    return card


def test_build_optimizer_no_cards_returns_empty(app, db):
    with app.app_context():
        user = UserFactory()
        from src.modules.pointspal.service import build_optimizer
        result = build_optimizer(user.id)
        assert result == []


def test_build_optimizer_low_confidence_excluded(app, db):
    with app.app_context():
        user = UserFactory()
        _make_program(db)
        _make_card(db, user.id, confidence_level='low')
        from src.modules.pointspal.service import build_optimizer
        result = build_optimizer(user.id)
        assert result == []


def test_build_optimizer_returns_category_with_ok_status(app, db):
    with app.app_context():
        user = UserFactory()
        _make_program(db)
        _make_card(db, user.id)
        from src.modules.pointspal.service import build_optimizer
        result = build_optimizer(user.id)
        assert len(result) > 0
        dining_rec = next((r for r in result if r['category'] == 'dining'), None)
        assert dining_rec is not None
        assert dining_rec['best_card']['cap_status'] == 'ok'
        assert dining_rec['urgency'] == 'ok'


def test_build_optimizer_cap_warning_status(app, db):
    """When spent >= 80% of cap_amount, cap_status should be 'warning'."""
    with app.app_context():
        user = UserFactory()
        from src.modules.pointspal.models import PointsProgram, PointsEarnCategory, UserCard, SpendPeriodTotal
        from datetime import datetime

        prog = PointsProgram(
            program_id='cap-card',
            program_name='Cap Card',
            issuer='CapBank',
            tpg_cpp=0.02,
        )
        db.session.add(prog)
        db.session.flush()

        ec = PointsEarnCategory(
            program_id='cap-card',
            category='groceries',
            multiplier=5.0,
            cap_amount=500.0,
            cap_period='monthly',
            multiplier_fallback=1.0,
        )
        db.session.add(ec)

        card = UserCard(
            user_id=user.id,
            program_id='cap-card',
            card_nickname='Cap Card',
            confidence_level='high',
        )
        db.session.add(card)
        db.session.flush()

        now = datetime.utcnow()
        period_key = f"{now.year}-{now.month:02d}"
        spt = SpendPeriodTotal(
            user_card_id=card.id,
            category='groceries',
            period_type='monthly',
            period_key=period_key,
            total_spent=430.0,  # 86% of 500 → warning
        )
        db.session.add(spt)
        db.session.commit()

        from src.modules.pointspal.service import build_optimizer
        result = build_optimizer(user.id)
        groceries_rec = next((r for r in result if r['category'] == 'groceries'), None)
        assert groceries_rec is not None
        assert groceries_rec['best_card']['cap_status'] == 'warning'
        assert groceries_rec['urgency'] == 'warning'


def test_build_optimizer_cap_capped_status(app, db):
    """When spent >= 100% of cap_amount, cap_status should be 'capped'."""
    with app.app_context():
        user = UserFactory()
        from src.modules.pointspal.models import PointsProgram, PointsEarnCategory, UserCard, SpendPeriodTotal
        from datetime import datetime

        prog = PointsProgram(
            program_id='capped-card',
            program_name='Capped Card',
            issuer='CappedBank',
            tpg_cpp=0.02,
        )
        db.session.add(prog)
        db.session.flush()

        ec = PointsEarnCategory(
            program_id='capped-card',
            category='gas',
            multiplier=4.0,
            cap_amount=300.0,
            cap_period='monthly',
            multiplier_fallback=1.0,
        )
        db.session.add(ec)

        card = UserCard(
            user_id=user.id,
            program_id='capped-card',
            card_nickname='Capped Card',
            confidence_level='high',
        )
        db.session.add(card)
        db.session.flush()

        now = datetime.utcnow()
        period_key = f"{now.year}-{now.month:02d}"
        spt = SpendPeriodTotal(
            user_card_id=card.id,
            category='gas',
            period_type='monthly',
            period_key=period_key,
            total_spent=310.0,  # 103% of 300 → capped
        )
        db.session.add(spt)
        db.session.commit()

        from src.modules.pointspal.service import build_optimizer
        result = build_optimizer(user.id)
        gas_rec = next((r for r in result if r['category'] == 'gas'), None)
        assert gas_rec is not None
        assert gas_rec['best_card']['cap_status'] == 'capped'
        assert gas_rec['urgency'] == 'capped'
