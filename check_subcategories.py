#!/usr/bin/env python3
"""Check subcategories for all users"""
from src.models.category import Category
from src.models.user import User
from src.extensions import db
from app import create_app

app = create_app()
with app.app_context():
    users = User.query.all()
    for user in users[:3]:  # Check first 3 users
        print(f'\n=== {user.name} ({user.id}) ===')

        # Get all categories for this user
        all_cats = Category.query.filter_by(user_id=user.id).all()
        parent_cats = [c for c in all_cats if c.parent_id is None]
        sub_cats = [c for c in all_cats if c.parent_id is not None]

        print(f'Total categories: {len(all_cats)}')
        print(f'Parent categories: {len(parent_cats)}')
        print(f'Subcategories: {len(sub_cats)}')

        # Show first 3 parents with their subcategories
        for parent in parent_cats[:3]:
            children = [c for c in all_cats if c.parent_id == parent.id]
            print(f'\n  {parent.icon} {parent.name} ({len(children)} subcategories)')
            for child in children[:5]:  # Show first 5 subcategories
                print(f'    - {child.icon} {child.name}')
            if len(children) > 5:
                print(f'    ... and {len(children) - 5} more')
