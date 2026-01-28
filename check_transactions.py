#!/usr/bin/env python3
"""Check transaction types for Carol"""
from src.models.transaction import Expense
from src.models.user import User
from src.extensions import db
from app import create_app

app = create_app()
with app.app_context():
    user = User.query.filter_by(id='carol@example.com').first()
    if user:
        txns = Expense.query.filter_by(user_id=user.id).order_by(Expense.date.desc()).all()
        print(f'Found {len(txns)} transactions for Carol\n')

        types_count = {}
        for t in txns:
            tt = t.transaction_type or 'None'
            if tt not in types_count:
                types_count[tt] = 0
            types_count[tt] += 1

            cat_name = t.category.name if t.category else 'No category'
            if cat_name == 'Investments' or 'investment' in t.description.lower() or 'stock' in t.description.lower():
                print(f'{t.description}: type={t.transaction_type}, category={cat_name}, amount={t.amount}')

        print(f'\nTransaction type counts:')
        for tt, count in types_count.items():
            print(f'  {tt}: {count}')
    else:
        print('Carol not found')
