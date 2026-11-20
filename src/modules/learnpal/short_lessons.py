"""Short lessons: a card, one worked number and a try-it step, per skill.

Copy follows finPal/docs/voice.md (section "Learn as you use it"). `card` and
`number` are `str.format` templates; Task 2 supplies the figures. Money values
arrive as ready-formatted strings. Placeholder keys per lesson:

    month        card: {month}                      number: {income} {spent} {biggest_category} {biggest_amount}
    fixed-share  card: {month}                      number: {fixed_share} {fixed_amount} {income}
    non-monthly  card: {item}                       number: {yearly} {monthly} {item}
    buffer       card: {account}                    number: {buffer_amount} {buffer_months}
    interest     card: {account} {month}            number: {interest_month} {balance} {apr} {account}
    debt-order   card: {count}                      number: {highest_rate_account} {smallest_account}

Dict order is the priority order for "This week".
"""

NOT_NOW_LINE = "Fine. It'll be here when you want it."
UNDERSTOOD_LINE = "You've got the idea. Use it once on your own money and this one fills in."
WHEN_PROMPT = "When would you like to do this: on payday, or on the 1st?"

SHORT_LESSONS = {
    'interest': {
        'skill': 'interest',
        'long_lesson': 'what-your-apr-costs',
        'card': "Your {account} payment is doing more than it shows. Here's where {month}'s interest went.",
        'number': "{interest_month} of {month}'s payment went to interest on {account}: {balance} at {apr}, divided into twelve.",
        'explain': [
            "Most people were never taught how card interest works. Here it is, with your numbers.",
            "Interest arrives like a monthly bill: the balance, times the rate, divided by twelve. It is charged before you buy anything.",
            "Every payment above the minimum cuts that bill for good, so the next month's is smaller too.",
        ],
        'try_kind': 'interest',
        'action': {'label': 'See your cards', 'href': '/accounts'},
        'when': True,
    },
    'buffer': {
        'skill': 'buffer',
        'long_lesson': 'a-starter-buffer',
        'card': "A small cushion in {account} changes what the next surprise costs. Here's what a first one looks like.",
        'number': "{buffer_amount} is {buffer_months} of your usual month. That covers the next thing that breaks.",
        'explain': [
            "Three to six months of expenses is a long way off for most people. Most of the protection comes from the first small bit.",
            "The first target is whatever covers the next thing that breaks, so it does not land on a card.",
            "Where anything spare goes is still yours to decide. This is a good first place for it.",
        ],
        'try_kind': 'buffer',
        'action': {'label': 'Set a buffer goal', 'href': '/goals'},
        'when': True,
    },
    'fixed-share': {
        'skill': 'fixed-costs',
        'long_lesson': 'fixed-vs-flexible',
        'card': "Some of {month} is already decided. Here's how much of it you can still change.",
        'number': "{fixed_amount} of what came in, {fixed_share} of it, is fixed. The rest is yours to choose again.",
        'explain': [
            "Money going out comes in three kinds: fixed, flexible and non-monthly. The difference is how much is still a decision.",
            "A big fixed share is a fact about what things cost, not a verdict on how you handle money.",
            "Once finPal can tell the kinds apart, it can point at the part you can change.",
        ],
        'try_kind': 'fixed_share',
        'action': {'label': 'Sort your budget lines', 'href': '/budgets'},
        'when': False,
    },
    'non-monthly': {
        'skill': 'non-monthly',
        'long_lesson': 'sinking-funds',
        'card': "{item} comes once a year, and you can see it coming. Here's how to make it a small monthly thing.",
        'number': "{yearly} a year for {item} is {monthly} a month, set aside so the bill is already paid when it arrives.",
        'explain': [
            "Some costs are certain and just not monthly. They are not emergencies, though they can land like one.",
            "Divide the yearly cost by twelve and set that aside each month.",
            "Keep it somewhere you will not spend it. A fund in your everyday account is only a number in your head.",
        ],
        'try_kind': 'sinking',
        'action': {'label': 'Plan it in budgets', 'href': '/budgets'},
        'when': True,
    },
    'month': {
        'skill': 'read-your-month',
        'long_lesson': 'where-your-money-goes',
        'card': "{month} is easier to read as a shape than as many small pieces. Here's yours.",
        'number': "{biggest_category} was your biggest category at {biggest_amount}, from {income} that came in.",
        'explain': [
            "Most people find one category bigger than they would have guessed, and it is often a different one than they expected.",
            "Often the price moved, not the habit. You can only choose about money you can see.",
            "Nothing here needs changing today. Looking is the step.",
        ],
        'try_kind': 'month',
        'action': {'label': 'Open your dashboard', 'href': '/dashboard'},
        'when': False,
    },
    'debt-order': {
        'skill': 'pay-down',
        'long_lesson': 'avalanche-vs-snowball',
        'card': "With {count} balances to pay down, you get to pick which goes first. Both ways work.",
        'number': "Highest rate first starts with {highest_rate_account}. Smallest balance first starts with {smallest_account}.",
        'explain': [
            "Highest rate first costs the least overall. Smallest balance first finishes things sooner, and that keeps people going.",
            "finPal will not pick for you. What you know is which one you will keep doing.",
        ],
        'try_kind': 'debt_order',
        'action': {'label': 'Look at your balances', 'href': '/accounts'},
        'when': True,
    },
}
