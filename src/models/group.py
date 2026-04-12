"""
Group and Settlement models
"""

from datetime import datetime
import json
from src.extensions import db
from src.models.associations import group_users

class Group(db.Model):
    __tablename__ = 'groups'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    default_payer = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=True)
    default_split_method = db.Column(db.String(20), default='equal')  # 'equal', 'percentage', 'custom'
    default_split_values = db.Column(db.JSON, nullable=True)  # For PostgreSQL
    auto_include_all = db.Column(db.Boolean, default=True)
    
    # Relationships
    members = db.relationship('User', secondary=group_users, lazy='subquery',
        backref=db.backref('groups', lazy=True))
    
    def calculate_balances(self) -> list:
        """
        Compute net balances within the group.

        For each group expense:
          - The payer is owed money by everyone listed in split_with.
          - Split amounts come from split_details (custom/percentage) or equal division.

        Settlements reduce the balances directly.

        Returns a list of dicts:
          { 'from': user_id, 'to': user_id, 'amount': float }
        representing the minimum set of transfers to settle all debts.
        """
        from collections import defaultdict
        from src.models.transaction import Expense

        # net[a][b] > 0 means 'a' owes 'b' that amount
        net = defaultdict(lambda: defaultdict(float))

        expenses = Expense.query.filter_by(group_id=self.id).all()
        for expense in expenses:
            if not expense.split_with or expense.transaction_type not in ('expense', None):
                continue

            payer = expense.paid_by
            split_ids = [s.strip() for s in expense.split_with.split(',') if s.strip()]
            if not split_ids:
                continue

            # Parse split details
            details = {}
            if expense.split_details:
                try:
                    raw = expense.split_details
                    details = json.loads(raw) if isinstance(raw, str) else raw
                except Exception:
                    details = {}

            if expense.split_method == 'equal':
                all_parties = set(split_ids)
                if payer not in all_parties:
                    all_parties.add(payer)
                per_person = expense.amount / len(all_parties) if all_parties else 0
                for uid in split_ids:
                    if uid != payer:
                        net[uid][payer] += per_person

            elif expense.split_method == 'percentage':
                values = details.get('values', {}) if isinstance(details, dict) else {}
                for uid in split_ids:
                    if uid != payer:
                        pct = float(values.get(uid, 0)) / 100.0
                        net[uid][payer] += expense.amount * pct

            elif expense.split_method == 'custom':
                values = details.get('values', {}) if isinstance(details, dict) else {}
                for uid in split_ids:
                    if uid != payer:
                        net[uid][payer] += float(values.get(uid, 0))

            else:
                # Fallback: equal split
                all_parties = set(split_ids)
                if payer not in all_parties:
                    all_parties.add(payer)
                per_person = expense.amount / len(all_parties) if all_parties else 0
                for uid in split_ids:
                    if uid != payer:
                        net[uid][payer] += per_person

        # Apply settlements: payer_id paid receiver_id → reduces payer's debt to receiver
        from src.models.group import Settlement
        member_ids = {m.id for m in self.members}
        settlements = Settlement.query.filter(
            Settlement.payer_id.in_(member_ids),
            Settlement.receiver_id.in_(member_ids),
        ).all()
        for s in settlements:
            net[s.payer_id][s.receiver_id] = max(
                0.0, net[s.payer_id][s.receiver_id] - s.amount
            )

        # Consolidate: cancel A→B and B→A cross-debts
        all_users = set(net.keys()) | {u for v in net.values() for u in v}
        for a in list(all_users):
            for b in list(all_users):
                if a >= b:
                    continue
                ab = net[a][b]
                ba = net[b][a]
                if ab > ba:
                    net[a][b] = round(ab - ba, 2)
                    net[b][a] = 0.0
                else:
                    net[b][a] = round(ba - ab, 2)
                    net[a][b] = 0.0

        result = []
        for from_user, owed in net.items():
            for to_user, amount in owed.items():
                if amount > 0.005:  # ignore sub-cent rounding noise
                    result.append({
                        'from': from_user,
                        'to': to_user,
                        'amount': round(amount, 2),
                    })

        return result

    # Helper method to handle different storage types (JSON vs TEXT)
    def get_split_values(self):
        """Get split values as a dictionary, handling different DB storage types"""
        if self.default_split_values is None:
            return {}
        
        if isinstance(self.default_split_values, dict):
            # Already a dict (PostgreSQL JSON type)
            return self.default_split_values
            
        # Otherwise, parse from text (SQLite)
        try:
            return json.loads(self.default_split_values)
        except:
            return {}


class Settlement(db.Model):
    __tablename__ = 'settlements'
    id = db.Column(db.Integer, primary_key=True)
    payer_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    description = db.Column(db.String(200), nullable=True, default="Settlement")
    
    # Relationships
    payer = db.relationship('User', foreign_keys=[payer_id], backref=db.backref('settlements_paid', lazy=True))
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref=db.backref('settlements_received', lazy=True))
