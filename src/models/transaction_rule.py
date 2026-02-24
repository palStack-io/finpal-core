"""
Transaction Rules model for auto-categorization and automation
Allows users to create rules like "if transaction name contains X, then set category to Y"
"""

from datetime import datetime
from src.extensions import db
import json


class TransactionRule(db.Model):
    __tablename__ = 'transaction_rules'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)

    # Rule name for easy identification
    name = db.Column(db.String(100), nullable=False)

    # Pattern matching
    pattern = db.Column(db.String(200), nullable=False)  # Text or regex pattern to match
    pattern_field = db.Column(db.String(50), default='description')  # Which field to match: description, amount, etc.
    is_regex = db.Column(db.Boolean, default=False)  # Whether pattern is regex
    case_sensitive = db.Column(db.Boolean, default=False)

    # Advanced matching criteria
    amount_min = db.Column(db.Float, nullable=True)  # Minimum amount to match
    amount_max = db.Column(db.Float, nullable=True)  # Maximum amount to match
    transaction_type_filter = db.Column(db.String(20), nullable=True)  # Only match this transaction type

    # Actions to apply when rule matches
    auto_category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    auto_account_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=True)
    auto_transaction_type = db.Column(db.String(20), nullable=True)  # 'expense', 'income', 'transfer'
    auto_tags = db.Column(db.Text, nullable=True)  # JSON array of tag names
    auto_notes = db.Column(db.Text, nullable=True)  # Append notes to transaction

    # Rule metadata
    priority = db.Column(db.Integer, default=0)  # Higher priority rules run first
    active = db.Column(db.Boolean, default=True)
    match_count = db.Column(db.Integer, default=0)  # How many times this rule has matched
    last_matched = db.Column(db.DateTime, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref=db.backref('transaction_rules', lazy=True))
    category = db.relationship('Category', backref=db.backref('rules', lazy=True))
    account = db.relationship('Account', backref=db.backref('rules', lazy=True))

    def __repr__(self):
        return f"<TransactionRule: {self.name} - '{self.pattern}'>"

    def matches(self, transaction_data):
        """
        Check if this rule matches the given transaction data

        Args:
            transaction_data: Dict with transaction fields (description, amount, etc.)

        Returns:
            bool: True if rule matches, False otherwise
        """
        import re

        # Check transaction type filter
        if self.transaction_type_filter:
            tx_type = transaction_data.get('transaction_type', '')
            if tx_type != self.transaction_type_filter:
                return False

        # Check amount range
        if self.amount_min is not None or self.amount_max is not None:
            amount = transaction_data.get('amount', 0)
            try:
                amount = float(abs(amount))  # Use absolute value
                if self.amount_min is not None and amount < self.amount_min:
                    return False
                if self.amount_max is not None and amount > self.amount_max:
                    return False
            except (ValueError, TypeError):
                return False

        # Get the field value to match against
        field_value = transaction_data.get(self.pattern_field, '')
        if not field_value:
            return False

        # Convert to string for matching
        field_value = str(field_value)

        # Apply case sensitivity
        if not self.case_sensitive:
            field_value = field_value.lower()
            pattern = self.pattern.lower()
        else:
            pattern = self.pattern

        # Match using regex or simple substring
        if self.is_regex:
            try:
                return bool(re.search(pattern, field_value))
            except re.error:
                return False
        else:
            return pattern in field_value

    def apply(self, transaction_data):
        """
        Apply this rule's actions to transaction data

        Args:
            transaction_data: Dict with transaction fields

        Returns:
            dict: Updated transaction data with rule actions applied
        """
        # Update match counter
        self.match_count += 1
        self.last_matched = datetime.utcnow()

        # Apply category
        if self.auto_category_id:
            transaction_data['category_id'] = self.auto_category_id

        # Apply account
        if self.auto_account_id:
            transaction_data['account_id'] = self.auto_account_id

        # Apply transaction type
        if self.auto_transaction_type:
            transaction_data['transaction_type'] = self.auto_transaction_type

        # Apply tags
        if self.auto_tags:
            try:
                tags = json.loads(self.auto_tags) if isinstance(self.auto_tags, str) else self.auto_tags
                transaction_data['tags'] = tags
            except:
                pass

        # Append notes
        if self.auto_notes:
            existing_notes = transaction_data.get('notes', '')
            if existing_notes:
                transaction_data['notes'] = f"{existing_notes}\n{self.auto_notes}"
            else:
                transaction_data['notes'] = self.auto_notes

        return transaction_data

    def to_dict(self):
        """Convert rule to dictionary for API responses"""
        return {
            'id': self.id,
            'name': self.name,
            'pattern': self.pattern,
            'pattern_field': self.pattern_field,
            'is_regex': self.is_regex,
            'case_sensitive': self.case_sensitive,
            'amount_min': self.amount_min,
            'amount_max': self.amount_max,
            'transaction_type_filter': self.transaction_type_filter,
            'auto_category_id': self.auto_category_id,
            'auto_category': self.category.name if self.category else None,
            'auto_account_id': self.auto_account_id,
            'auto_account': self.account.name if self.account else None,
            'auto_transaction_type': self.auto_transaction_type,
            'auto_tags': json.loads(self.auto_tags) if self.auto_tags else [],
            'auto_notes': self.auto_notes,
            'priority': self.priority,
            'active': self.active,
            'match_count': self.match_count,
            'last_matched': self.last_matched.isoformat() if self.last_matched else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
