"""The six skills a person builds through "learn as you use it".

Each skill groups the long lessons that teach it and names the screens whose figures it teaches: those screens'
"Why?" slot (GET /learnpal/why?screen=...) can show its short lesson. Order here is the order they are shown on
the skills page.

Screen -> lesson map (Wave 0 of the revamp, 2026-11-20; critique-2026-11-20 C2):

    screen        own skills (short lesson)                        fallback, one card, only when none of its own is open
    ------------  -----------------------------------------------  ------------------------------------------------------
    dashboard     read-your-month (month)                          -
    transactions  read-your-month (month)                          -
    analytics     read-your-month (month), fixed-costs             -
                  (fixed-share)
    budgets       fixed-costs (fixed-share), non-monthly           read-your-month
                  (non-monthly)
    categories    fixed-costs (fixed-share)                        -
    recurring     fixed-costs (fixed-share), non-monthly           -
                  (non-monthly)
    goals         buffer (buffer)                                  non-monthly, fixed-costs, read-your-month
    debt          interest (interest), pay-down (debt-order)       buffer, read-your-month
    (Accounts)

The fallback exists because a screen's own lesson is often closed for a given person (used on their money, set
aside, or not relevant to their figures), and the slot then vanished on the page where it teaches most (Goals and
Accounts were empty for the demo persona). It is drawn from the same open lessons as every other card, so the
"used" and "set aside for 30 days" rules hold for it unchanged.
"""

LEARN_SKILLS = [
    {'id': 'read-your-month', 'title': 'Read your month',
     'lessons': ['where-your-money-goes', 'income-vs-what-lands'],
     'screens': ('dashboard', 'transactions', 'analytics')},
    {'id': 'fixed-costs', 'title': 'Know your fixed costs',
     'lessons': ['fixed-vs-flexible'], 'screens': ('budgets', 'categories', 'recurring', 'analytics')},
    {'id': 'non-monthly', 'title': 'Plan for non-monthly costs',
     'lessons': ['sinking-funds'], 'screens': ('budgets', 'recurring')},
    {'id': 'buffer', 'title': 'Build a buffer',
     'lessons': ['a-starter-buffer', 'why-a-buffer-comes-first', 'how-much-is-enough'],
     'screens': ('goals',)},
    {'id': 'interest', 'title': 'Understand interest',
     'lessons': ['what-your-apr-costs', 'why-minimums-barely-move-it'], 'screens': ('debt',)},
    {'id': 'pay-down', 'title': 'Pay down debt',
     'lessons': ['avalanche-vs-snowball'], 'screens': ('debt',)},
]

#: Every screen with a "Why?" slot, in first-mention order. Derived, so a screen exists only if a skill names it.
WHY_SCREENS = tuple(dict.fromkeys(screen for skill in LEARN_SKILLS for screen in skill['screens']))

#: The skills a screen falls back to, most relevant first, when none of its own lessons is open (table above).
WHY_FALLBACKS = {
    'goals': ('non-monthly', 'fixed-costs', 'read-your-month'),
    'debt': ('buffer', 'read-your-month'),
    'budgets': ('read-your-month',),
}


def skill_by_id(skill_id):
    """The skill dict for an id, or None."""
    for skill in LEARN_SKILLS:
        if skill['id'] == skill_id:
            return skill
    return None


def teaches_screen(skill_id, screen):
    """True when the skill is one of the screen's own lessons (not a fallback)."""
    return screen in skill_by_id(skill_id)['screens']

