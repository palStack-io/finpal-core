"""
Category Service
Business logic for category and category mapping management
"""

from datetime import datetime, timedelta
from flask import current_app
from src.extensions import db
from src.models.category import Category, CategoryMapping
from src.models.transaction import Expense
from src.models.recurring import RecurringExpense
from src.models.budget import Budget
from src.utils.helpers import auto_categorize_transaction

class CategoryService:
    """Service class for category and mapping operations"""

    def __init__(self):
        pass

    # Category Management Methods

    def get_all_categories(self, user_id, parent_id='__all__'):
        """Get all categories for a user

        Args:
            user_id: The user ID
            parent_id: Filter by parent_id. Use '__all__' (default) to get all categories,
                      None to get only parent categories, or an int to get subcategories of that parent.
        """
        query = Category.query.filter_by(user_id=user_id)

        if parent_id != '__all__':
            query = query.filter_by(parent_id=parent_id)

        return query.order_by(Category.name).all()

    def get_category(self, category_id):
        """Get a specific category"""
        return Category.query.get(category_id)

    def has_default_categories(self, user_id):
        """Check if user already has default categories"""
        default_names = ["Housing", "Food", "Transportation", "Shopping", "Entertainment", "Health"]
        match_count = Category.query.filter(
            Category.user_id == user_id,
            Category.name.in_(default_names),
            Category.parent_id == None
        ).count()
        return match_count >= 4

    def add_category(self, user_id, name, icon='fa-tag', color='#6c757d', parent_id=None):
        """Add a new category - Returns (success, message, category)"""
        if not name:
            return False, 'Category name is required', None

        if parent_id:
            parent = self.get_category(parent_id)
            if not parent or parent.user_id != user_id:
                return False, 'Invalid parent category', None

        category = Category(
            name=name,
            icon=icon,
            color=color,
            parent_id=parent_id,
            user_id=user_id
        )

        try:
            db.session.add(category)
            db.session.commit()
            return True, 'Category added successfully', category
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error adding category')
            return False, 'Error adding category', None

    def can_manage(self, category, user_id):
        """Whether `user_id` may view, edit or delete `category`.

        Categories are **household property** — owner decision 2026-08-06, and the
        ruling that closed D-20: "budget, categories and rest is for household".
        So this replaces `category.user_id != user_id`, which made a household-wide
        list and a per-user detail view disagree about the same row: mobile listed a
        housemate's category and then answered 403 when it was opened, and once
        web-ui's list became household-wide its delete button would have started
        answering 400. `user_id` stays on the row as a record of who created it,
        not as a permission.

        **Demo accounts are on the instance but are NOT household members**, and
        that distinction is the whole reason this is not a one-line
        `category.user_id in get_all_user_ids()`. It was written that way first and
        it was a privilege escalation: `get_all_user_ids()` has no `is_demo_user`
        filter, demo accounts ship with a **published** password
        (`src/services/demo/service.py`), and they sign in through the ordinary
        `/auth/login` — so anyone who knew the demo credentials could rename and
        delete the real household's categories on any instance running
        `DEMO_MODE=true`. Watched answering 200 with the row gone before this fix.

        Sandboxing is symmetric, and each direction protects something different:
        a demo visitor must not touch the household's data, and the household must
        not delete the rows a demo persona is built from, or the tour breaks for the
        next visitor.

        Scoped deliberately to this service rather than to `get_all_user_ids()`
        itself. That function has 38 callers — accounts, budgets, every analytics
        query — and some may include demo rows on purpose for the demo experience to
        work. Narrowing it globally is a change for the D-18 build to make with all
        38 in view; narrowing it here is contained to the permission this port
        widened.
        """
        from src.models.user import User

        owner_is_demo = bool(
            User.query.with_entities(User.is_demo_user)
            .filter_by(id=category.user_id).scalar())
        caller_is_demo = bool(
            User.query.with_entities(User.is_demo_user)
            .filter_by(id=user_id).scalar())

        if owner_is_demo or caller_is_demo:
            # Either side being a demo account collapses this to plain ownership.
            return category.user_id == user_id

        return category.user_id in self.household_user_ids()

    def household_user_ids(self):
        """The real household: everyone on the instance except demo accounts.

        Delegates to `src.utils.household`, where this was promoted during item A of
        the D-18 build. It was defined here first, by D-42's fix; the account and
        portfolio permissions needed the same list, and two hand-rolled copies of
        "who is in the household" is how the definition drifts. Kept as a method so
        #71's guard — which pins that this differs from `get_all_user_ids()` — keeps
        watching the same thing.
        """
        from src.utils.household import household_user_ids
        return household_user_ids()

    def update_category(self, category_id, user_id, name=None, icon=None, color=None):
        """Update a category - Returns (success, message)"""
        category = self.get_category(category_id)
        if not category:
            return False, 'Category not found'

        if not self.can_manage(category, user_id):
            return False, 'You don\'t have permission to edit this category'

        if category.is_system:
            return False, 'System categories cannot be edited'

        if name:
            category.name = name
        if icon:
            category.icon = icon
        if color:
            category.color = color

        try:
            db.session.commit()
            return True, 'Category updated successfully'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error updating category')
            return False, 'Error updating category'

    def delete_category(self, category_id, user_id):
        """Delete a category - Returns (success, message)"""
        category = self.get_category(category_id)
        if not category:
            return False, 'Category not found'

        if not self.can_manage(category, user_id):
            return False, 'You don\'t have permission to delete this category'

        if category.is_system:
            return False, 'System categories cannot be deleted'

        try:
            # The fallback category for orphaned transactions is looked up across
            # the household, not just under `user_id`. Deleting a housemate's
            # category is allowed now, and their transactions must land in a real
            # 'Other' — scoping this to the caller would have found *their* Other,
            # or nothing, and `category_id` would go NULL. Prefers the owner's own
            # 'Other' so rows stay with their member where one exists.
            other_category = Category.query.filter_by(
                name='Other',
                user_id=category.user_id,
                is_system=True
            ).first() or Category.query.filter(
                Category.name == 'Other',
                Category.is_system.is_(True),
                # Household only — a demo account's 'Other' must never become the
                # home for a real member's orphaned transactions, or the demo
                # seeder wiping its own rows would take them along.
                Category.user_id.in_(self.household_user_ids()),
            ).first()

            if category.subcategories:
                for subcategory in category.subcategories:
                    Expense.query.filter_by(category_id=subcategory.id).update({
                        'category_id': other_category.id if other_category else None
                    })
                    RecurringExpense.query.filter_by(category_id=subcategory.id).update({
                        'category_id': other_category.id if other_category else None
                    })
                    CategoryMapping.query.filter_by(category_id=subcategory.id).delete()
                    db.session.delete(subcategory)

            Expense.query.filter_by(category_id=category_id).update({
                'category_id': other_category.id if other_category else None
            })
            RecurringExpense.query.filter_by(category_id=category_id).update({
                'category_id': other_category.id if other_category else None
            })
            Budget.query.filter_by(category_id=category_id).update({
                'category_id': other_category.id if other_category else None
            })
            CategoryMapping.query.filter_by(category_id=category_id).delete()

            db.session.delete(category)
            db.session.commit()

            return True, 'Category deleted successfully'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error deleting category')
            return False, 'Error deleting category'

    # Category Mapping Methods

    def get_all_mappings(self, user_id):
        """Get all category mappings for a user"""
        return CategoryMapping.query.filter_by(user_id=user_id).order_by(
            CategoryMapping.active.desc(),
            CategoryMapping.priority.desc(),
            CategoryMapping.match_count.desc()
        ).all()

    def add_mapping(self, user_id, keyword, category_id, is_regex=False, priority=0):
        """Add a new category mapping - Returns (success, message)"""
        if not keyword or not category_id:
            return False, 'Keyword and category are required'

        keyword = keyword.strip()

        existing = CategoryMapping.query.filter_by(
            user_id=user_id,
            keyword=keyword
        ).first()

        if existing:
            return False, 'A mapping with this keyword already exists'

        mapping = CategoryMapping(
            user_id=user_id,
            keyword=keyword,
            category_id=category_id,
            is_regex=is_regex,
            priority=priority,
            active=True
        )

        try:
            db.session.add(mapping)
            db.session.commit()
            return True, 'Category mapping rule added successfully'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error adding category mapping')
            return False, 'Error adding mapping'

    def update_mapping(self, mapping_id, user_id, keyword=None, category_id=None, is_regex=None, priority=None):
        """Update a category mapping - Returns (success, message)"""
        mapping = CategoryMapping.query.get(mapping_id)
        if not mapping:
            return False, 'Mapping not found'

        if mapping.user_id != user_id:
            return False, 'You don\'t have permission to edit this mapping'

        if keyword:
            mapping.keyword = keyword.strip()
        if category_id:
            mapping.category_id = category_id
        if is_regex is not None:
            mapping.is_regex = is_regex
        if priority is not None:
            mapping.priority = priority

        try:
            db.session.commit()
            return True, 'Category mapping updated successfully'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error updating category mapping')
            return False, 'Error updating mapping'

    def toggle_mapping(self, mapping_id, user_id):
        """Toggle mapping active status - Returns (success, message, new_status)"""
        mapping = CategoryMapping.query.get(mapping_id)
        if not mapping:
            return False, 'Mapping not found', None

        if mapping.user_id != user_id:
            return False, 'You don\'t have permission to modify this mapping', None

        mapping.active = not mapping.active

        try:
            db.session.commit()
            status = "activated" if mapping.active else "deactivated"
            return True, f'Category mapping {status} successfully', mapping.active
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error toggling category mapping')
            return False, 'Error toggling mapping', None

    def delete_mapping(self, mapping_id, user_id):
        """Delete a category mapping - Returns (success, message)"""
        mapping = CategoryMapping.query.get(mapping_id)
        if not mapping:
            return False, 'Mapping not found'

        if mapping.user_id != user_id:
            return False, 'You don\'t have permission to delete this mapping'

        try:
            db.session.delete(mapping)
            db.session.commit()
            return True, 'Category mapping deleted successfully'
        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error deleting category mapping')
            return False, 'Error deleting mapping'

    def bulk_categorize_transactions(self, user_id):
        """Categorize all uncategorized transactions - Returns (success, message, categorized_count, total_count)"""
        try:
            uncategorized = Expense.query.filter_by(
                user_id=user_id,
                category_id=None
            ).all()

            total_count = len(uncategorized)
            categorized_count = 0

            for expense in uncategorized:
                if not expense.description:
                    continue

                category_id = auto_categorize_transaction(expense.description, user_id)

                if category_id:
                    expense.category_id = category_id
                    categorized_count += 1

            db.session.commit()
            return True, f'Successfully categorized {categorized_count} out of {total_count} transactions', categorized_count, total_count

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error bulk-categorizing transactions')
            return False, 'Could not categorize transactions', 0, 0
