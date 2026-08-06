"""
Group Service
Business logic for group management and bill splitting
"""

import json
from flask import current_app
from src.extensions import db
from src.models.group import Group, Settlement
from src.models.user import User
from src.models.transaction import Expense
from src.models.associations import group_users
from src.utils.helpers import calculate_balances


class GroupService:
    """Service class for group operations"""

    def __init__(self):
        pass

    # Group CRUD Methods

    def get_all_groups(self, user_id):
        """Get all groups where user is a member"""
        return Group.query.join(group_users).filter(group_users.c.user_id == user_id).all()

    def get_group(self, group_id, user_id):
        """
        Get a specific group with member validation
        Returns (success, message, group)
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found', None

        # Check if user is member
        user = User.query.get(user_id)
        if user not in group.members:
            return False, 'Access denied. You are not a member of this group.', None

        return True, 'Success', group

    def create_group(self, user_id, name, description, member_ids, default_split_method='equal',
                    default_payer=None, auto_include_all=False, default_split_values=None):
        """
        Create a new group
        Returns (success, message, group)
        """
        # Checked here rather than left to the NOT NULL constraint. Without it
        # `Group(name=None)` reached the database and the IntegrityError became
        # the client's error message, which is how the psycopg2 leak below was
        # found — and `update_group` already refuses an empty name this way.
        if not name or not str(name).strip():
            return False, 'Group name is required', None

        try:
            # Create group
            group = Group(
                name=name,
                description=description,
                created_by=user_id,
                default_split_method=default_split_method,
                default_payer=default_payer,
                auto_include_all=auto_include_all
            )

            # Add creator as a member
            creator = User.query.get(user_id)
            group.members.append(creator)

            # Add selected members
            for member_id in member_ids:
                user = User.query.filter_by(id=member_id).first()
                if user and user.id != user_id:
                    group.members.append(user)

            # Handle custom split values
            if default_split_method != 'equal' and default_split_values:
                if isinstance(default_split_values, str):
                    try:
                        split_values = json.loads(default_split_values)
                        group.default_split_values = split_values
                    except:
                        pass
                else:
                    group.default_split_values = default_split_values

            db.session.add(group)
            db.session.commit()

            return True, 'Group created successfully!', group

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error creating group')
            return False, 'Error creating group', None

    def add_member(self, group_id, user_id, new_member_id):
        """
        Add a member to a group
        Returns (success, message)
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found'

        # Check if current user is creator
        if group.created_by != user_id:
            return False, 'Only the group creator can add members'

        # Get new member
        new_member = User.query.filter_by(id=new_member_id).first()
        if not new_member:
            return False, 'User not found'

        # Check if already a member
        if new_member in group.members:
            return False, 'User is already a member of this group'

        try:
            group.members.append(new_member)
            db.session.commit()
            return True, f'{new_member.name} added to group successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error adding member')
            return False, 'Error adding member'

    def remove_member(self, group_id, user_id, member_id):
        """
        Remove a member from a group
        Returns (success, message)
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found'

        # Check if current user is creator
        if group.created_by != user_id:
            return False, 'Only the group creator can remove members'

        # Can't remove creator
        if member_id == group.created_by:
            return False, 'Cannot remove the group creator'

        member = User.query.filter_by(id=member_id).first()
        if not member or member not in group.members:
            return False, 'Member not found in group'

        try:
            group.members.remove(member)
            db.session.commit()
            return True, f'{member.name} removed from group successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error removing member')
            return False, 'Error removing member'

    def delete_group(self, group_id, user_id):
        """
        Delete a group
        Returns (success, message)
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found'

        # Only creator can delete
        if group.created_by != user_id:
            return False, 'Only the group creator can delete the group'

        try:
            # No settlements to cascade: `Settlement` has no `group_id` column
            # (src/models/group.py:153 links a payer to a receiver and nothing
            # else), and nothing else in the codebase treats settlements as
            # group-scoped — src/utils/helpers.py filters them by payer/receiver,
            # and scripts/load_demo_data.py builds one with no group.
            #
            # There used to be a `Settlement.query.filter_by(group_id=...)` here.
            # It raised `Entity namespace for "settlements" has no property
            # "group_id"` on every call, before deleting anything, and the handler
            # turned that into a 400 — so **no group could ever be deleted**, for
            # any user, while both clients showed a Delete action for it. Found by
            # trying to delete a group on the deployed instance.

            # Update expenses to remove group reference. Deliberately detach
            # rather than delete: these are real financial records that happen to
            # have been shared.
            Expense.query.filter_by(group_id=group_id).update({'group_id': None})

            # Delete the group
            db.session.delete(group)
            db.session.commit()

            return True, 'Group deleted successfully!'

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error deleting group')
            return False, 'Error deleting group'

    def update_group(self, group_id, user_id, name=None, description=None,
                     default_split_method=None, default_payer=None,
                     auto_include_all=None, default_split_values=None):
        """Update a group's name, description and settings.

        `api_routes.update_group` has called this since the initial commit and it
        has never existed, so `PUT`/`PATCH /api/v1/groups/<id>` raised
        AttributeError, was swallowed by the route's `except Exception` and
        answered 500 — for every user, since the first commit. Both clients
        render an edit form against it.

        `update_settings` handled only the four settings fields and nothing ever
        handled `name` or `description`, which is why this is a new method rather
        than a rename. It delegates the settings half so there is one
        implementation of that policy.

        Returns (success, message).
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found'

        # Creator-only, matching `update_settings`' existing stated policy — a
        # group's split rules decide what every member owes, so widening this to
        # any member is a deliberate product decision, not a detail of this fix.
        if group.created_by != user_id:
            return False, 'Only the group creator can update this group'

        if name is not None:
            if not str(name).strip():
                return False, 'Group name cannot be empty'
            group.name = str(name).strip()
        if description is not None:
            group.description = description

        # Only reach the settings path when the request actually named one,
        # so a plain rename cannot fail on settings validation.
        if any(v is not None for v in (default_split_method, default_payer,
                                       auto_include_all, default_split_values)):
            success, message = self.update_settings(
                group_id, user_id,
                default_split_method=default_split_method,
                default_payer=default_payer,
                auto_include_all=auto_include_all,
                default_split_values=default_split_values,
            )
            if not success:
                return False, message
            return True, 'Group updated successfully!'

        try:
            db.session.commit()
            return True, 'Group updated successfully!'
        except Exception:
            db.session.rollback()
            # Deliberately not `str(e)` — CLAUDE.md forbids returning the
            # exception text to a client, and `update_settings` still does.
            current_app.logger.exception('Error updating group')
            return False, 'Error updating group'

    def update_settings(self, group_id, user_id, default_split_method=None, default_payer=None,
                       auto_include_all=None, default_split_values=None):
        """
        Update group settings
        Returns (success, message)
        """
        group = Group.query.get(group_id)
        if not group:
            return False, 'Group not found'

        # Only creator can update settings
        if group.created_by != user_id:
            return False, 'Only the group creator can update settings'

        try:
            if default_split_method is not None:
                group.default_split_method = default_split_method
            if default_payer is not None:
                group.default_payer = default_payer if default_payer else None
            if auto_include_all is not None:
                group.auto_include_all = auto_include_all
            if default_split_values is not None:
                if isinstance(default_split_values, str):
                    try:
                        group.default_split_values = json.loads(default_split_values)
                    except:
                        pass
                else:
                    group.default_split_values = default_split_values

            db.session.commit()
            return True, 'Group settings updated successfully!'

        except Exception:
            db.session.rollback()
            # `update_group` delegates here and propagates this message straight
            # into `jsonify({'error': message})`, so returning `str(e)` sent
            # SQLAlchemy's exception text to the client — which CLAUDE.md forbids
            # and which restoring the edit route made reachable.
            current_app.logger.exception('Error updating group settings')
            return False, 'Error updating settings'

    def get_group_expenses(self, group_id):
        """Get all expenses for a group"""
        return Expense.query.filter_by(group_id=group_id).order_by(Expense.date.desc()).all()

    def calculate_group_balances(self, group_id):
        """Calculate balances between group members"""
        expenses = self.get_group_expenses(group_id)
        group = Group.query.get(group_id)

        if not group:
            return {'member_balances': {}, 'simplified_debts': []}

        # Calculate what each member owes/is owed
        member_balances = {}
        member_ids = [member.id for member in group.members]

        # Initialize balances for all members
        for member_id in member_ids:
            member_balances[member_id] = 0

        # Process each expense
        for expense in expenses:
            if not expense.paid_by or expense.paid_by not in member_ids:
                continue

            # Get the splits for this expense
            splits = expense.calculate_splits() if hasattr(expense, 'calculate_splits') else {'splits': []}

            # The payer paid the full amount
            for split in splits.get('splits', []):
                split_user = split.get('email')
                split_amount = split.get('amount', 0)

                if split_user in member_ids:
                    if split_user == expense.paid_by:
                        # Payer's own share - they don't owe themselves
                        pass
                    else:
                        # This member owes the payer
                        member_balances[split_user] -= split_amount
                        member_balances[expense.paid_by] += split_amount

        # Get settlements and adjust balances
        settlements = Settlement.query.filter(
            Settlement.payer_id.in_(member_ids),
            Settlement.receiver_id.in_(member_ids)
        ).all()

        for settlement in settlements:
            if settlement.payer_id in member_balances and settlement.receiver_id in member_balances:
                # Payer settled their debt
                member_balances[settlement.payer_id] += settlement.amount
                member_balances[settlement.receiver_id] -= settlement.amount

        # Simplify debts (who owes whom)
        simplified_debts = []
        creditors = {k: v for k, v in member_balances.items() if v > 0.01}
        debtors = {k: v for k, v in member_balances.items() if v < -0.01}

        for debtor_id, debt in debtors.items():
            debt = abs(debt)
            for creditor_id, credit in list(creditors.items()):
                if debt <= 0.01:
                    break

                amount_to_settle = min(debt, credit)
                if amount_to_settle > 0.01:
                    debtor = User.query.get(debtor_id)
                    creditor = User.query.get(creditor_id)

                    simplified_debts.append({
                        'from': debtor.name if debtor and hasattr(debtor, 'name') else debtor_id,
                        'to': creditor.name if creditor and hasattr(creditor, 'name') else creditor_id,
                        'amount': round(amount_to_settle, 2)
                    })

                    debt -= amount_to_settle
                    creditors[creditor_id] -= amount_to_settle

                    if creditors[creditor_id] <= 0.01:
                        del creditors[creditor_id]

        return {
            'member_balances': member_balances,
            'simplified_debts': simplified_debts
        }


class SettlementService:
    """Service class for settlement operations"""

    def __init__(self):
        pass

    def get_all_settlements(self, user_id):
        """Get all settlements involving the user"""
        from sqlalchemy import or_
        return Settlement.query.filter(
            or_(Settlement.payer_id == user_id, Settlement.receiver_id == user_id)
        ).order_by(Settlement.date.desc()).all()

    def add_settlement(self, payer_id, receiver_id, amount, group_id=None, description=None):
        """
        Add a settlement payment
        Returns (success, message, settlement)
        """
        try:
            settlement = Settlement(
                payer_id=payer_id,
                receiver_id=receiver_id,
                amount=float(amount),
                group_id=group_id,
                description=description
            )

            db.session.add(settlement)
            db.session.commit()

            return True, 'Settlement recorded successfully!', settlement

        except Exception:
            db.session.rollback()
            current_app.logger.exception('Error adding settlement')
            return False, 'Error recording settlement', None
