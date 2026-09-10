"""
Seed Default Categories and Rules
Loads comprehensive default data for new users
"""

from src.extensions import db
from src.models.category import Category
from src.models.transaction_rule import TransactionRule
from src.data.default_categories import DEFAULT_CATEGORIES
from src.data.default_rules import DEFAULT_RULES
from src.data.convert_icons_to_emoji import convert_icon
from src.services.category.spending_type import default_for
import logging

logger = logging.getLogger(__name__)


def load_default_categories(user_id):
    """
    Load default categories and subcategories for a user

    Args:
        user_id: User ID to create categories for

    Returns:
        dict: Mapping of category names to category IDs
    """
    category_map = {}

    try:
        logger.info(f"Loading default categories for user {user_id}")

        for parent_name, parent_data in DEFAULT_CATEGORIES.items():
            # Create parent category
            parent_category = Category(
                name=parent_name,
                icon=convert_icon(parent_data['icon']),  # Convert FontAwesome to emoji
                color=parent_data['color'],
                user_id=user_id,
                # *** D-182: ONLY "Other" IS A SYSTEM CATEGORY. ***
                # This seeder used to flag ALL 147, while
                # `create_default_categories` flags only "Other" -- so the two
                # seeders disagreed about what the flag means and the DEMO, the
                # one instance anyone browses, could not edit a single category.
                # `CategoryManagement.tsx` renders an Edit pencil on every row,
                # so the page offered an action the server refused every time.
                #
                # The flag's real job is narrow: "Other" is where orphaned
                # transactions land when a category is deleted
                # (`category/service.py`), so renaming or deleting it breaks
                # that lookup. Nothing else needs protecting.
                #
                # Owner approved 2026-09-10, knowing the side effect: the other
                # 146 demo categories become deletable. The demo reseeds, so
                # that is recoverable.
                is_system=(parent_name == 'Other'),
                # D-177: the demo is the one instance anyone browses, and it uses
                # THIS seeder rather than create_default_categories. A feature
                # shipping while the demo seed does not know about it is the
                # defect that row records.
                spending_type=default_for(parent_name)
            )
            db.session.add(parent_category)
            db.session.flush()  # Get the ID without committing

            # Store parent in map
            category_map[parent_name] = parent_category.id

            # Create subcategories
            for subcat in parent_data.get('subcategories', []):
                subcategory = Category(
                    name=subcat['name'],
                    icon=convert_icon(subcat['icon']),  # Convert FontAwesome to emoji
                    color=subcat['color'],
                    parent_id=parent_category.id,
                    user_id=user_id,
                    # See the note on the parent above. The demo tree's only
                    # "Other" is `Miscellaneous/Other`, a CHILD -- so the flag
                    # has to be settable here too, not just at top level.
                    is_system=(subcat['name'] == 'Other'),
                    spending_type=default_for(subcat['name'], parent_name)
                )
                db.session.add(subcategory)
                db.session.flush()

                # Store subcategory in map with format "Parent/Subcategory"
                full_name = f"{parent_name}/{subcat['name']}"
                category_map[full_name] = subcategory.id

        db.session.commit()
        logger.info(f"Successfully loaded {len(category_map)} categories for user {user_id}")

        return category_map

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error loading default categories: {str(e)}")
        raise


def load_default_rules(user_id, category_map):
    """
    Load default transaction rules for a user

    Args:
        user_id: User ID to create rules for
        category_map: Dictionary mapping category names to IDs

    Returns:
        int: Number of rules created
    """
    rules_created = 0

    try:
        logger.info(f"Loading default rules for user {user_id}")

        for rule_data in DEFAULT_RULES:
            # Get category ID from map
            category_name = rule_data.get('category')
            category_id = category_map.get(category_name)

            if not category_id:
                logger.warning(f"Category '{category_name}' not found in map, skipping rule '{rule_data['name']}'")
                continue

            # Create rule
            rule = TransactionRule(
                user_id=user_id,
                name=rule_data['name'],
                pattern=rule_data['pattern'],
                pattern_field=rule_data.get('pattern_field', 'description'),
                is_regex=rule_data.get('is_regex', False),
                case_sensitive=rule_data.get('case_sensitive', False),
                auto_category_id=category_id,
                priority=rule_data.get('priority', 50),
                active=True
            )

            db.session.add(rule)
            rules_created += 1

        db.session.commit()
        logger.info(f"Successfully loaded {rules_created} rules for user {user_id}")

        return rules_created

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error loading default rules: {str(e)}")
        raise


def seed_user_defaults(user_id):
    """
    Seed all default data for a new user

    Args:
        user_id: User ID to seed data for

    Returns:
        dict: Summary of what was created
    """
    try:
        logger.info(f"Seeding defaults for user {user_id}")

        # Load categories first
        category_map = load_default_categories(user_id)

        # Then load rules
        rules_count = load_default_rules(user_id, category_map)

        summary = {
            'success': True,
            'categories_count': len(category_map),
            'rules_count': rules_count,
            'message': f'Successfully loaded {len(category_map)} categories and {rules_count} auto-categorization rules'
        }

        logger.info(f"Seeding complete for user {user_id}: {summary}")
        return summary

    except Exception:
        logger.exception('Error seeding defaults for user %s', user_id)
        return {
            'success': False,
            'error': 'Failed to load default data',
            'message': 'Failed to load default data'
        }


def has_existing_categories(user_id):
    """
    Check if user already has categories

    Args:
        user_id: User ID to check

    Returns:
        bool: True if user has categories, False otherwise
    """
    count = Category.query.filter_by(user_id=user_id).count()
    return count > 0
