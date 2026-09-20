"""Which goal a user's own figures argue for — from predicates that exist.

*** THE SITUATION PREDICATES WERE ALREADY WRITTEN, FOR A DIFFERENT CONSUMER.
*** `services/literacy/checks.py` is a registry of facts about a user's
circumstances, and `acts.py` says so in as many words: *"about half of `CHECKS`
describes a user's SITUATION rather than something they did"*. Today they
decide which lesson opens. A suggestion is the same predicate with a second
reader, which is why this file contains no new arithmetic about debt or
buffers — only the map from a condition to the goal it argues for.

*** A SUGGESTION PAYS NOTHING, AND THAT IS STRUCTURAL. *** `acts.py` refuses
to pay for a situation by construction —
`has_two_or_more_debt_accounts -> paying for it rewards a second loan`. This
module returns descriptions; it never awards, and nothing here is wired to the
coin engine. Accepting a suggestion may pay later, because CREATING a goal
makes a figure computable; having the condition may not.

*** AND IT NAMES THE CONDITION BEFORE THE ACTION — VOICE RULE 11. *** "You
have debt and no savings goal" is a fact about circumstances, and one step from
a scolding. Every `because` below states what finPal observed, so the user can
disagree with the premise rather than just the advice.
"""
import logging

logger = logging.getLogger(__name__)


# (check_type, goal kind, headline, because). Ordered: the first that fires is
# the most useful thing to say, not merely the first written.
#
# *** SHELTER BEFORE THE CLIMB. *** Lesson 12 (`why-a-buffer-comes-first`)
# argues a starter buffer precedes aggressive paydown, so the buffer
# suggestion outranks the payoff one for somebody who has neither. Changing
# this order changes advice, not presentation.
SUGGESTIONS = (
    (
        'has_debt_and_no_savings_goal', None, 'savings',
        'Start a buffer',
        'You are carrying debt and have no savings goal. A small buffer is what '
        'stops the next unexpected bill becoming more debt.',
        'why-a-buffer-comes-first',
    ),
    (
        'has_buffer_and_debt', None, 'payoff',
        'Turn to the debt',
        'You have a buffer and you are carrying debt. This is the point the '
        'arithmetic changes: the interest costs more than the savings earn.',
        'when-to-stop-saving-and-start-paying-down',
    ),
    (
        'has_debt_account_with_a_rate', None, 'payoff',
        'Name the debt you are clearing',
        'One of your accounts charges interest. A goal over it is what lets '
        'finPal show what it costs and how long it takes.',
        'what-your-apr-costs',
    ),
    (
        'has_non_monthly_spending', None, 'savings',
        'Set aside for the bills that are not monthly',
        'Some of your spending arrives once or twice a year. Setting aside a '
        'twelfth each month is what stops it landing as a surprise.',
        'sinking-funds',
    ),
)


def suggestions_for(user_id, limit=2):
    """The goals this user's figures argue for. `[]` is a fine answer.

    *** IT SUGGESTS NOTHING WHEN NOTHING APPLIES, AND THAT IS THE POINT. ***
    A page that always has advice is a page whose advice means nothing; the
    same reason `coverage` returns `None` for a dormant act rather than zero.

    *** AND IT NEVER SUGGESTS A GOAL THAT ALREADY EXISTS. *** The predicates
    mostly check for absence already, but `has_debt_account_with_a_rate` does
    not — it describes the account, not the goal — so a payoff suggestion is
    withheld once any payoff goal is live. Telling somebody to do a thing they
    have done is how a prompt becomes noise.
    """
    from src.models.goal import Goal
    from src.services.literacy.checks import run_check

    live = Goal.query.filter(Goal.user_id == user_id,
                             Goal.status != 'archived').all()
    kinds = {g.kind for g in live}

    out = []
    for check_type, args, kind, headline, because, lesson in SUGGESTIONS:
        if kind == 'payoff' and 'payoff' in kinds:
            continue
        if not run_check(check_type, user_id, args):
            continue
        out.append({
            'kind': kind,
            'headline': headline,
            'because': because,
            'lesson_slug': lesson,
            'check': check_type,
        })
        if len(out) >= limit:
            break
    return out
