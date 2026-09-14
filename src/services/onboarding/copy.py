"""The prose the onboarding screens and the Settings rows render.

*** THE SERVER OWNS THIS COPY AND NEITHER CLIENT HOLDS IT — OWNER DECISION,
2026-09-13 ("ok lets do A on the server"). *** Copy inside a mobile client can
only be corrected by shipping a build, and iOS EAS is withheld, so a clumsy
sentence on the first screen a new user sees would be unfixable for an unknown
period. It is also the reversible direction: server to client later is easy,
client to server needs an app release.

*** AND IT IS WHY THIS FILE IS PLAIN DATA WITH NO FORMATTING IN IT. *** Nothing
here interpolates a figure. §6 of the design spec forbids inventing one, and a
first-run screen has no data to interpolate anyway — a new user has no money in
the product yet. Every string below is true for a user with an empty database.
"""

# *** THE DATA STATEMENT IS WRITTEN AS A STATEMENT, WHICH IS THE OWNER'S WORD
# FOR IT (2026-09-14: "can we also make sure the privacy is more of a
# statement?"). *** So: a declarative heading, three short declarative lines,
# and ONE qualifier — not a table of exceptions and not a page of hedging.
#
# The qualifier stays, because the blanket version would be FALSE and a false
# privacy claim is worse than a narrow true one. Six things can leave an
# instance and every one of them is opt-in or operator-configured; the full
# inventory is `docs/DATA_BOUNDARIES.md`, which is checked by
# `tests/unit/test_no_data_leaves_the_instance.py`.
#
# *** NO LINK IS PRINTED, DELIBERATELY. *** The long form is a repo document,
# not a served page, and inventing a docs URL for it is exactly how D-109 and
# D-201 shipped — a link offered to a user that goes nowhere. When the docs host
# serves it, a link belongs here and nowhere else.
DATA_STATEMENT = {
    'heading': 'Your money stays on your server.',
    'lines': [
        'finPal has no analytics, no tracking and no AI. Nothing you tell it '
        'about your money is sent to us — there is no "us" in the path.',
        'It is used only to answer your own requests, for your own account. '
        'Never sold, never pooled, never used to train anything.',
        'The only things that ever leave are ones you switch on yourself — a '
        'bank connection, a share-price lookup, an email — and each carries '
        'the least it can.',
    ],
    # *** THE OPERATOR CAVEAT IS SEPARATE, AND BELONGS IN SETTINGS RATHER THAN
    # IN ONBOARDING. *** Self-hosting is what makes the statement strong and it
    # is also what makes it somebody's to keep: on first run a user has not yet
    # decided whose server this is, and the sentence would read as a disclaimer
    # attached to a promise. In Settings it reads as what it is — a fact about
    # where they are.
    'operator_note': (
        'finPal is open source and runs on a server somebody chose. If that is '
        'not you, whoever runs it holds the database, the backups and the mail '
        'server — which is worth knowing, and is the same for any app you do '
        'not host yourself. You can read every line of finPal, which is the '
        'only privacy claim that does not depend on trusting anyone.'
    ),
}

# Per-module intro copy. *** THE QUESTION EACH ANSWERS IS "WHAT DOES THIS GIVE
# ME", NOT "WHAT IS IT". *** A module chooser that describes machinery makes the
# user guess the benefit; spec §10.5's step 4 is a chooser with modules already
# ON, so the copy's job is to justify leaving them on.
MODULE_COPY = {
    'learnpal': {
        'name': 'learnPal',
        'intro': (
            'Short lessons that unlock from your own figures — what your debt '
            'actually costs, where your money goes, what a month of yours '
            'looks like. Nothing generic, and nothing you have to study.'
        ),
        'gives': 'badges',
    },
    'pointspal': {
        'name': 'pointsPal',
        'intro': (
            'Which card to pay with, and what your points are worth. Tracks '
            'caps and bonuses so a 5% category does not quietly stop paying '
            'halfway through the quarter.'
        ),
        'gives': 'nothing to collect — it just answers the question',
    },
}
