"""Repository layer — thin wrappers around SQLAlchemy queries.

Pattern:
    Each repository handles ONE model. It provides named query methods so that:
    - Services never write raw .query.filter() calls
    - DB access is in one place per model, easy to mock in unit tests
    - Route handlers never touch the ORM directly

Usage:
    from src.repositories.account import AccountRepository
    repo = AccountRepository()
    account = repo.get_by_id(account_id)
"""
