#!/usr/bin/env python3
"""Check budgets for demo users"""
from src.models.budget import Budget
from src.models.user import User
from src.extensions import db
from app import create_app

app = create_app()
with app.app_context():
    users = User.query.all()
    for user in users[:3]:  # Check first 3 users
        print(f'\n=== {user.name} ({user.id}) ===')

        # Get all budgets for this user
        budgets = Budget.query.filter_by(user_id=user.id).all()

        print(f'Total budgets: {len(budgets)}')

        for budget in budgets:
            cat_name = budget.category.name if budget.category else 'No category'
            print(f'  - {cat_name}: ${budget.amount:.2f} ({budget.period})')
