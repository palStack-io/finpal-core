"""The four explanations, and the rule that each one is shown ONCE.

*** ONCE PER REWARD TYPE, NOT A COUNT OF N POPUPS (spec §14.6). *** A counter
spends itself badly: three awards in one evening can all be coins, so the user
would hear about coins three times and never learn what gear is. Keyed to the
OBJECT, gear is explained the first time gear is relevant and the sequence ends
on its own with nothing to tune.

*** THE COPY LIVES HERE, ON THE SERVER, AND THAT WAS DECIDED FOR A CONCRETE
REASON. *** Copy inside a client can only be corrected by shipping a build, and
iOS EAS is withheld, so a clumsy sentence on the first coin a user ever earns
would be unfixable for an unknown period. Same decision as the module catalog
took on 2026-09-13, and it is the reversible direction: server to client later
is easy, client to server needs an app release.

*** NO EM DASHES AND NO EN DASHES. *** Owner rule for served copy;
`test_module_catalog.py` enforces it on the module intros and
`test_teaching_copy.py` enforces it here.

*** AND THE COPY OBEYS VOICE RULE 11: *** name the conditions, then name what
is still yours. Nothing here implies the user lacks discipline, and nothing
promises a reward for a circumstance.
"""

# topic -> the panel shown the first time that reward type is met.
TOPICS = {
    'coins': {
        'title': 'That is a coin',
        'body': (
            'Coins come from telling finPal the truth about your own money. '
            'Not from opening the app, and not from spending less. You earned '
            'that one by making a figure here truer than it was, which is why '
            'the reward and the benefit are the same act.'
        ),
    },
    'gear': {
        'title': 'Coins buy gear',
        'body': (
            'Gear is kit for your climber, and it is the only thing coins are '
            'for. It unlocks nothing. Every part of finPal works exactly the '
            'same whether your climber is carrying a rope or standing there in '
            'their socks.'
        ),
    },
    'badges': {
        'title': 'Badges are given, not bought',
        'body': (
            'A badge comes from reading a lesson. You cannot buy one and you '
            'cannot lose one. That is the difference between a badge and a '
            'piece of gear: a badge is a stamped disc somebody handed you, and '
            'gear is equipment you paid for.'
        ),
    },
    'mountains': {
        'title': 'Your goals are mountains',
        'body': (
            'Each goal is drawn at the size of what it asks of you, from your '
            'money and nothing else. No amount of studying, earning or buying '
            'moves a peak. That is deliberate: the picture of your finances '
            'has to stay honest even on a bad month.'
        ),
    },
}

# Which topic an act's award should teach. Only `coins` has one today, because
# gear, badges and mountains are met on their own surfaces rather than through
# a coin award. Milestones 5 to 7 attach the other three.
ACT_TOPIC = 'coins'


def panel_for(topic):
    """The topic's copy, or `None` for a topic that does not exist.

    *** FAIL-CLOSED LIKE EVERY OTHER SERVED SENTENCE HERE. *** An unknown topic
    renders nothing rather than an empty box.
    """
    entry = TOPICS.get(topic)
    if entry is None:
        return None
    return {'topic': topic, 'title': entry['title'], 'body': entry['body']}
