"""
Category and CategoryMapping models
"""

from datetime import datetime
from src.extensions import db

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    icon = db.Column(db.String(50), default="🏷️")  # An EMOJI, not a FontAwesome name.
    # web-ui renders this value as text (CategoryManagement.tsx), so "fa-tag" printed
    # the literal string "fa-tag" where the icon belongs. FontAwesome has never been a
    # dependency here; src/data/convert_icons_to_emoji.py was written for this and its
    # __main__ only printed a message, so it was never applied.
    color = db.Column(db.String(20), default="#6c757d")
    parent_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    is_system = db.Column(db.Boolean, default=False)  # System categories can't be deleted

    # Fixed / Flexible / Non-Monthly. NULLABLE, and NULL is a real state that
    # renders as "Unsorted" rather than being folded into a group -- a guess
    # presented as a fact is D-77's shape.
    #
    # NOTE: adding a column to an EXISTING table is invisible to `create_all()`,
    # so no deployed instance gets this from a redeploy alone. The boot reconcile
    # (`src/utils/schema_reconcile.py`, D-121) applies it, and that has to be
    # confirmed on a real old database rather than a fresh one.
    #
    # *** DO NOT INFER THIS FROM `name` AT RUNTIME. *** Names are user-editable.
    # The defaults are applied ONCE, at seed time or by the boot backfill, and
    # read from the column thereafter -- see services/category/spending_type.py.
    spending_type = db.Column(db.String(12), nullable=True)

    # *** IS THIS CATEGORY MONEY IN OR MONEY OUT? D-189. ***
    # finPal could not tell, because it has never had a column for it: income
    # and expense live on the TRANSACTION (`transaction_type`), and the seeded
    # "Income" tree is a naming convention a user can rename. So a budget on
    # *Salary* was accepted, bucketed as `unsorted` and SUMMED AS PLANNED
    # SPENDING -- measured on the live demo, `totals.planned` went 1,400 to
    # 5,900 and `remaining` to 5,554.46, telling the user they had £4,500 of
    # unearned money left to spend. `left_to_budget` then subtracts the same row
    # from income, corrupting it in both directions at once.
    #
    #   'income'   money arriving. Drives PLANNED INCOME, never planned spending.
    #   'expense'  money leaving.
    #   NULL       NOT STATED -- and that is a real state, not a missing value.
    #
    # *** NULL IS COUNTED AS AN EXPENSE IN THE TOTALS AND IS NEVER LABELLED ONE.
    # *** Owner decision, 2026-09-12. The totals have to put it somewhere and
    # expense is the safe default; calling it one on screen would be a claim
    # nobody made. The user can set it, and once set it is never overwritten.
    kind = db.Column(db.String(10), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref=db.backref('categories', lazy=True))
    parent = db.relationship('Category', remote_side=[id], backref=db.backref('subcategories', lazy=True))

    def __repr__(self):
        return f"<Category: {self.name}>"


class CategoryMapping(db.Model):
    __tablename__ = 'category_mappings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    keyword = db.Column(db.String(100), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=False)
    is_regex = db.Column(db.Boolean, default=False)  # Whether the keyword is a regex pattern
    priority = db.Column(db.Integer, default=0)  # Higher priority mappings take precedence
    match_count = db.Column(db.Integer, default=0)  # How many times this mapping has been used
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    user = db.relationship('User', backref=db.backref('category_mappings', lazy=True))
    category = db.relationship('Category', backref=db.backref('mappings', lazy=True))
    
    def __repr__(self):
        return f"<CategoryMapping: '{self.keyword}' → {self.category.name}>"


class Tag(db.Model):
    __tablename__ = 'tags'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    color = db.Column(db.String(20), default="#6c757d")  # Default color gray
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    user = db.relationship('User', backref=db.backref('tags', lazy=True))
