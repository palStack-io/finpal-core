"""learnPal's own predicate — the only one whose subject is a lesson.

*** THE OTHER TWELVE LIVE IN CORE, AT `src/services/literacy/checks.py`. ***
They read `Account`, `Category`, `Budget`, `Expense` and `Goal`, so a user who
hid this module was losing an engine that has nothing to do with learning.

This one genuinely belongs here: its subject IS lessons. It reaches the core
registry through `LearnPalModule.get_checks()`, which is the same hook
pointsPal uses for its community acts.
"""

from sqlalchemy import func

from src.extensions import db


def has_completed_three_lessons(user_id, args=None):
    """At least `n` lessons already unlocked. Default 3.

    Lesson 19 is *what finPal cannot tell you*, and it is deliberately last: it
    is the one that says the product has limits, and saying that to somebody
    who has read nothing is a disclaimer rather than a lesson.

    *** IT CANNOT COUNT ITSELF. *** `evaluate_for_user` snapshots `already`
    BEFORE the loop and adds to it as it goes, so a milestone unlocked earlier
    in the same pass is already in the database when this runs -- which is
    correct, and is why the threshold is a floor rather than an equality.
    """
    n = int((args or {}).get('n', 3))
    from src.modules.learnpal.models import LearnCompletion
    count = db.session.query(func.count(LearnCompletion.id)).filter(
        LearnCompletion.user_id == user_id).scalar() or 0
    return count >= n


# `(sentence, defaults)`, the shape `check_reason` renders.
CHECK_REASON = ('Read {n} lessons first', {'n': 3})
