"""The six skills a person builds through "learn as you use it".

Each skill groups the long lessons that teach it and names the screen where it
is practised. Order here is the order they are shown on the skills page.
"""

LEARN_SKILLS = [
    {'id': 'read-your-month', 'title': 'Read your month',
     'lessons': ['where-your-money-goes', 'income-vs-what-lands'], 'screen': 'dashboard'},
    {'id': 'fixed-costs', 'title': 'Know your fixed costs',
     'lessons': ['fixed-vs-flexible'], 'screen': 'budgets'},
    {'id': 'non-monthly', 'title': 'Plan for non-monthly costs',
     'lessons': ['sinking-funds'], 'screen': 'budgets'},
    {'id': 'buffer', 'title': 'Build a buffer',
     'lessons': ['a-starter-buffer', 'why-a-buffer-comes-first', 'how-much-is-enough'],
     'screen': 'goals'},
    {'id': 'interest', 'title': 'Understand interest',
     'lessons': ['what-your-apr-costs', 'why-minimums-barely-move-it'], 'screen': 'debt'},
    {'id': 'pay-down', 'title': 'Pay down debt',
     'lessons': ['avalanche-vs-snowball'], 'screen': 'debt'},
]


def skill_by_id(skill_id):
    """The skill dict for an id, or None."""
    for skill in LEARN_SKILLS:
        if skill['id'] == skill_id:
            return skill
    return None
