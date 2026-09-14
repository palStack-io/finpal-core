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


# *** THE ORIENTATION PROSE IS THE SERVER'S TOO, FOR THE REASON THE MODULE COPY
# IS. *** Five screens of product explanation are exactly the copy most likely
# to need a reword after a real person reads it, and mobile cannot reword
# anything without a store build. One source, both clients, no second route.
#
# *** NOT ONE FIGURE ANYWHERE IN HERE, AND A TEST ENFORCES IT. *** §6 of the
# design spec forbids inventing one, and a first-run screen has NO DATA to
# interpolate: the user has not entered anything yet. That is why the mountain
# examples describe what the height MEANS rather than showing a height — a
# plausible "£4,200 to go" on screen two would be a number finPal made up, on
# the screen whose whole job is to establish that the numbers are the user's.
ORIENTATION = {
    'welcome': {
        'heading': 'finPal is for making the numbers true.',
        'lines': [
            'Most money apps start by telling you what to do. This one starts '
            'by getting your own figures straight, because almost every '
            'decision people regret was made on a number they had wrong.',
            # Voice rule 11, in the second paragraph — deliberately.
            'Rent, food and borrowing have outrun wages, and no app fixes '
            'that. What finPal can do is show you your own position without '
            'flattering it or scolding you for it.',
        ],
    },
    'mountains': {
        'heading': 'Anything you are working towards is drawn as a mountain.',
        'lines': [
            'The height is the size of the problem, not how hard you have '
            'tried — so a mountain never shrinks because you had a bad month, '
            'and never grows to make a point.',
        ],
        # *** MARKED AS EXAMPLES, AND CARRYING NO AMOUNTS. *** A new user has no
        # goals, so anything shown here is illustrative; saying so is cheaper
        # than the alternative, which is a user believing finPal already knows
        # something about them.
        'examples': [
            {'label': 'Example',
             'text': 'Paying off a card is a mountain whose height is what the '
                     'debt is costing you every month.'},
            {'label': 'Example',
             'text': 'Saving for something is a mountain whose height is what '
                     'is still left to save.'},
        ],
    },
    # Step 3 is the one this whole flow exists for. Four panels, each answering
    # a DIFFERENT question — if two answered the same one, the user would be
    # left to guess which word meant which thing.
    'game': {
        'heading': 'Four different things, four different questions.',
        'panels': [
            {'title': 'Mountains', 'question': 'What am I climbing?',
             'answer': 'Your goals, at the size of what they ask. Drawn from '
                       'your money and nothing else.'},
            {'title': 'Coins', 'question': 'What do I earn?',
             'answer': 'Coins come for telling finPal the truth about your '
                       'money — naming an account, recording a rate. The '
                       'reward and the benefit are the same act.'},
            {'title': 'Gear', 'question': 'What do I buy?',
             'answer': 'Kit for your climber, bought with coins. It looks '
                       'good and it gates nothing, ever.'},
            {'title': 'Badges', 'question': 'What am I given?',
             'answer': 'For reading a lesson. Given rather than bought, which '
                       'is why a badge is a stamped disc and gear is '
                       'equipment.'},
        ],
        # *** EACH PROMISE IS ENFORCED STRUCTURALLY RATHER THAN BY POLICY,
        # WHICH IS WHAT MAKES IT SAFE TO PRINT. *** The ratchet means an award
        # cannot be revoked; decision 5 means the only denominator is a price
        # the user chose; coverage is computed from the user's own money, not
        # from lessons read; and every act is weighted by what the user DID.
        'promises': [
            'Nothing is ever taken away. No streak to break, no score to decay.',
            'No score you did not ask for. The only progress bar is one whose '
            'target you chose.',
            'Studying cannot flatter your finances. Only your actual money '
            'moves a mountain.',
            'You are never rewarded for your circumstances — only for what '
            'you did.',
        ],
    },
    'modules': {
        'heading': 'Two optional parts, both on.',
        'lines': [
            'You can turn either off now or later, in Settings. Off means '
            'hidden, not lost — nothing you have earned goes away.',
        ],
    },
    'base_camp': {
        'heading': 'You are at base camp.',
        'lines': [
            'Nothing here is locked. These are simply the three things that '
            'tell finPal the most about your position, and each one pays '
            'coins the moment it is true.',
        ],
    },
}
