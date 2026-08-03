"""AccountRepository — all SQLAlchemy queries for the Account model."""
from src.models.account import Account
from src.models.transaction import Expense
from src.extensions import db


class AccountRepository:
    def get_all_for_user(self, user_id):
        """All accounts owned by a single user."""
        return Account.query.filter_by(user_id=user_id).all()

    def get_all_for_household(self, user_ids: list):
        """All accounts for a household (list of user IDs)."""
        return Account.query.filter(Account.user_id.in_(user_ids)).all()

    def get_by_id(self, account_id):
        """Account by primary key, or None."""
        return Account.query.get(account_id)

    def get_by_id_and_user(self, account_id, user_id):
        """Account owned by a specific user, or None."""
        return Account.query.filter_by(id=account_id, user_id=user_id).first()

    def get_by_name_and_user(self, name, user_id):
        """Account matched by display name for a user, or None.

        Used by the CSV mapper to resolve an account column to an account id.
        """
        return Account.query.filter_by(name=name, user_id=user_id).first()

    def get_by_external_id(self, external_id, user_id):
        """Account with a matching SimpleFin / external ID."""
        return Account.query.filter_by(external_id=external_id, user_id=user_id).first()

    def get_by_import_source(self, user_id, import_source: str):
        """All accounts with a given import source for a user."""
        return Account.query.filter_by(
            user_id=user_id, import_source=import_source
        ).all()

    def transaction_count(self, account_id) -> int:
        """Number of transactions linked to this account."""
        return Expense.query.filter_by(account_id=account_id).count()

    def save(self, account: Account) -> Account:
        """Persist a new or modified account."""
        db.session.add(account)
        db.session.commit()
        return account

    def delete(self, account: Account) -> None:
        """Delete account (caller must clear FK references first)."""
        db.session.delete(account)
        db.session.commit()

    def nullify_account_on_transactions(self, account_id) -> None:
        """Set account_id = NULL on all transactions before deletion."""
        Expense.query.filter_by(account_id=account_id).update({'account_id': None})
