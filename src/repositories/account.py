"""AccountRepository — all SQLAlchemy queries for the Account model."""
from src.models.account import Account
from src.models.transaction import Expense
from src.extensions import db


def _scope(user_ids):
    """Coerce a scope argument to a list of user IDs, refusing a bare string.

    `get_by_external_id` and `get_by_import_source` used to take a single `user_id`
    and now take a list. A stale caller passing the string through would not raise:
    `.in_('alice@test.com')` iterates the string **character by character** and
    quietly matches nothing, which is a dedupe failure that creates duplicate
    accounts rather than an error anyone would see. So it is refused loudly.
    """
    if isinstance(user_ids, str):
        raise TypeError(
            'scope must be a list of user IDs, not the string %r — passing a '
            'single id here silently matches nothing' % user_ids)
    return list(user_ids)


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

    def get_by_id_in_household(self, account_id, user_ids: list):
        """Account by primary key, if it belongs to one of `user_ids`, else None.

        The household counterpart of `get_by_id_and_user`. Detail, update, delete and
        balance all used the caller-scoped version while the list route was
        household-scoped, so a housemate saw a row and got a 404 opening it — D-43.
        """
        return Account.query.filter(
            Account.id == account_id, Account.user_id.in_(_scope(user_ids))
        ).first()

    def get_by_external_id(self, external_id, user_ids: list):
        """Account with a matching SimpleFin / external ID, within a scope.

        **Takes a list of user IDs, not one user.** Ownership is reassignable now, so
        keying dedupe to the caller means that after member A assigns an imported
        account to member B, A's next import matches nothing and creates a **second
        row for the same `external_id`**. The scope is passed in rather than resolved
        here so the decision stays visible at the call site.
        """
        return Account.query.filter(
            Account.external_id == external_id,
            Account.user_id.in_(_scope(user_ids)),
        ).first()

    def get_by_import_source(self, user_ids: list, import_source: str):
        """All accounts with a given import source, within a scope.

        **Takes a list of user IDs, not one user** — see `get_by_external_id`. A
        reassigned account would otherwise drop out of every sync: the account moves
        to B while the credential stays with A, and `SimpleFin.user_id` is unique per
        user so B has no token of their own.
        """
        return Account.query.filter(
            Account.user_id.in_(_scope(user_ids)),
            Account.import_source == import_source,
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
