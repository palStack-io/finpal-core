"""Correct matching for the comma-separated `split_with` column.

`split_with` stores participant ids as a comma-separated string, and ids are
email addresses. `LIKE '%id%'` matches any id that merely *contains* the caller's
id, so `a@b.com` matches a row shared only with `aa@b.com` — cross-user financial
data exposure (AUDIT.md S-06).

One implementation, imported everywhere. There were six copies of the buggy LIKE
and one correct-but-unreachable fix; that is how the finding survived being
marked closed.
"""
from sqlalchemy import or_


def split_with_filter(column, user_id):
    """A SQLAlchemy filter matching `user_id` as a whole element of `column`.

    Covers all four positions: the only element, first, middle, last. Anchoring
    on the commas is what makes it exact.
    """
    user_id = str(user_id)
    return or_(
        column == user_id,
        column.like(f'{user_id},%'),
        column.like(f'%,{user_id},%'),
        column.like(f'%,{user_id}'),
    )
