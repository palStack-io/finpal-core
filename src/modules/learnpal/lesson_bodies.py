"""The lesson prose — the approved drafts, moved into the database.

*** THIS FILE AUTHORS NOTHING. *** Every word below was written into
`docs/superpowers/specs/2026-09-10-learnpal-lesson-drafts.md` and `-2.md` and
READ AND APPROVED by the owner (the first eight on 2026-09-10, the rest on
2026-09-11). It is here verbatim, blockquote markers and emphasis included,
because the drafts live in the OUTER repo: `docs/` is not in this image, so a
runtime read of them would work on this machine and on no deployment. Moving
the text into a module is what makes it shippable.

*** THE SECOND BLOCKQUOTE IN SIX OF THEM IS THE DRAFT'S OWN ASIDE *** -- the
"where this figure comes from" note -- and it stays a `>` block so it keeps
reading as a note rather than as the last paragraph of the lesson.

*** AND FILLING A BODY IS A CHANGE, NOT AN INSERT (D-178). *** The nineteen
rows already exist on every deployment that has booted since C1b, with
`body_md` NULL, so `seed_milestones`'s insert-what-is-missing rule reaches none
of them. `apply_bodies()` is the condition-keyed correction: keyed on the OLD
VALUE, which here is NULL, so it fills a body that was never written and leaves
a body somebody has since edited exactly alone. `FACT_CORRECTIONS` in
`src/data/seed_mountains.py` is the worked example it copies, including where it
is CALLED -- first and unconditionally, because a deployment already holding all
nineteen rows never reaches the insert path at all.

The `£` figures are the drafts' own illustrations and are left as written: they
are approved prose, and rewriting an approved sentence to suit a reader's
currency is an editorial change this file is not entitled to make. It is
recorded in ROADMAP.md as an open question rather than taken here.
"""

import logging

from src.extensions import db
from src.modules.learnpal.models import LearnMilestone

logger = logging.getLogger(__name__)

# slug -> body. Markdown: `###` sub-headline, `**bold**`, `*italic*`, `>` aside.
# The web reader parses exactly those four and its guard test fails on a fifth.
BODIES = {
    'what-a-goal-tracks': """\
### What a goal is actually watching

A goal in finPal can work two ways, and the difference matters more than it sounds.

If you **link it to an account**, the number moves on its own. Your balance changes, the goal
changes. You never update it, and it can't drift away from what's true.

If you **don't link it**, you type the figure in yourself. That's a real option — some things
worth tracking live outside finPal entirely — but the number is only ever as current as the
last time you touched it.

Linked goals are the ones finPal can say anything useful about, because they're the only ones
where it knows it isn't guessing. That's why a linked goal gets a mountain and a typed one
doesn't.

One goal can watch several accounts at once, which is worth knowing if you're paying down two
cards or saving across two places. It adds them up and treats them as one climb.
""",

    'where-your-money-goes': """\
### Where it actually goes

Most people can name their big fixed costs — rent, the car, the phone. What's harder to see is
the shape of everything else, because it arrives in forty small pieces rather than one.

finPal sorts your spending into categories so you can see the shape rather than the pieces.
Not to tell you any of it was wrong. Some of it was groceries. Some of it was a hard week.

The useful part is the surprise. Almost everyone finds one category bigger than they'd have
guessed, and it's almost never the one they were worried about. Often it's a category where
the price moved rather than the habit did — food and energy have both done that to a lot of
people, and it doesn't show up until you look at the shape. Knowing which one it is puts
the decision back in your hands, and that's the whole point — you can't choose about money you
can't see.

Nothing here needs changing today. Looking is the step.
""",

    'a-starter-buffer': """\
### The rope you tie on first

There's a common piece of advice that you want three to six months of expenses saved before
anything else. It's a reasonable target and it is completely out of reach for a lot of people,
which makes it easy to hear as "don't bother starting".

Here's the part that gets left out: **most of the protection comes from the first small bit.**
The gap between nothing and a few hundred is the difference between a flat tyre being annoying
and a flat tyre going on the credit card at 22%. The gap between four months and six months is
real, but it is nothing like as sharp.

So the number to aim at first isn't three months. It's whatever covers the next thing that
breaks.

If money is tight enough that even that feels far away, that isn't a failure of yours. Rent,
food and borrowing have all outrun wages in most places for years, and "save more" is advice
written for a world with more slack in it than this one has. Saying so isn't giving up — it's
the reason the target here is the next thing that breaks rather than three months of expenses.
What's still yours is where anything spare goes, and this is the highest-value place to send
the first of it.

> **Where the 3–6 months figure comes from:** it's a widely repeated rule of thumb in personal
> finance guidance, not a rule finPal applies and not a threshold anyone checks you against.
""",

    'what-your-apr-costs': """\
### What the rate is actually charging you

APR is the yearly interest rate on what you owe. The useful move is to stop reading it as a
percentage and start reading it as a monthly bill, because that's how it arrives.

Take the balance, multiply by the rate, divide by twelve. On $4,200 at 22.9% that's about **$80
a month** — before you've bought anything. It's rent on money you already spent.

Two things follow from that, and they're the reason this lesson comes first.

The first is that **the rate matters more than the size.** A large balance at 4% can cost less
every month than a small one at 25%. When there's a choice about where a spare payment goes,
that's the number to look at.

The second is that **every payment above the minimum reduces the bill permanently**, not just
this month. Pay $300 off that card and the monthly interest drops by about $6 — for good, and
then again next time.

Rates on cards have risen sharply in recent years, so a balance that was manageable at one
rate can quietly stop being manageable at another, without anything about you changing. That
is worth naming, because the monthly bill above is often read as a verdict on the person
paying it, and it isn't one.

This is also why finPal keeps asking for your rate. Without it, a card is just a number. With
it, finPal can tell you what it's costing you.
""",

    'why-minimums-barely-move-it': """\
### Why the minimum feels like standing still

If you've ever paid the minimum every month and watched the balance barely move, you weren't
imagining it, and it wasn't you doing it wrong.

A minimum payment is usually calculated as a small percentage of the balance — often around 1–3%
— plus the interest. Which means most of it goes to the interest, and only what's left touches
what you actually owe. As the balance falls, the minimum falls too, so the payment shrinks just
as it starts to work.

That design isn't a trick aimed at you personally — it's what the product is, and it's the
same for everyone holding one. But it does mean paying exactly the minimum is close to a
stalemate by construction. If it has felt like running to stand still, that's the mechanism
doing what it does, not a measure of your effort.

Anything above the minimum goes **straight** at the balance, because the interest is already
covered. That's why a small consistent extra does more than it looks like it should — $20 a
month is not a rounding error here, it's the entire part that moves.
""",

    'utilisation-and-your-score': """\
### Utilisation, and what it's actually measuring

Utilisation is how much of your available credit you're currently using. A $4,200 balance
against a $12,000 limit is 35%.

The thing that surprises people: it moves the moment a balance moves. You don't have to miss
anything, or do anything wrong. It's a snapshot, not a record — which also means it recovers
as soon as the balance comes down. Nothing about a high month follows you around.

A figure often cited is keeping it under 30%. Treat it as a rough guide rather than a cliff
edge; lower is generally read as better, and there's nothing magic that happens at 29%.

One thing worth knowing, because it's counter-intuitive: closing a card you've paid off removes
its limit from the total, which can push your utilisation **up** even though you now owe less.
Not a reason to keep a card you don't want — just a reason not to be startled.

> **This one is country-specific.** How credit is scored, what's counted, and who does the
> scoring all differ between countries. The arithmetic above — balance ÷ limit — is the same
> everywhere. What that number *does for you* depends on where you are, and finPal doesn't know.
""",

    'avalanche-vs-snowball': """\
### Two ways to choose which one first

When there's more than one thing to pay off and a bit of spare money, there are two well-known
approaches, and the honest answer is that they're good at different things.

**Highest rate first** — sometimes called the avalanche — means putting everything spare at the
most expensive debt while paying minimums on the rest. This costs the least money overall. It
is arithmetically the better answer and it can feel like nothing is happening for a long time,
especially if the priciest debt is also the biggest.

**Smallest balance first** — the snowball — means clearing the smallest one, then the next.
It costs a bit more in total. It also finishes things, and finishing things is not a trivial
benefit; plenty of people stay with a plan they can feel working and abandon one they can't.

There's no correct choice here and finPal isn't going to pick for you. The rates and balances
are on your range, sized by what each is costing. What you know that finPal doesn't is which
of these two you'll actually keep doing.
""",

    'fixed-vs-flexible': """\
### Which of it can you actually change?

Money going out splits into three kinds, and the difference is not about how much you spend.
It's about **how much of it is still a decision.**

**Fixed** is what you're committed to. Rent, the loan, insurance. Changing it means a big
move — a different flat, a refinance — not a different Tuesday.

**Flexible** is what you choose again each month. Groceries, going out, the things that vary
because you vary them.

**Non-monthly** is real, unavoidable and irregular. Car tax, a renewal, presents in December.
It ruins a monthly budget not because it's extravagant but because it doesn't arrive monthly.

None of these is the good or bad one. Flexible spending isn't waste — it's most of what makes
a life. The reason the split matters is that **all of your choices live in one of the three**,
and if finPal can't tell them apart, the only advice it can give you is "spend less", which
is not advice.

Here's the part worth bracing for: for a lot of people the fixed share is most of what comes
in. Rent, food and borrowing have outrun wages for years, and if your fixed costs eat 80% of
your income that is a fact about what things cost, **not a verdict on how you handle money.**
Seeing it written down is uncomfortable and it's still better than not knowing — because it
tells you the honest answer to "why is this hard", and it's the difference between a problem
you can solve by choosing differently and one you can't.

Sort your categories below. You can change any of them whenever you like, and finPal won't
re-sort them behind you.
""",

    'income-vs-what-lands': """\
### The number on the offer letter is not the number

Pay is quoted as a yearly figure before anything comes out of it. What lands in your account
is that figure minus tax, minus whatever is taken at source — pension, insurance, student
loan repayments where those exist. The gap is not small, and it is not the same for two
people on the same headline salary.

**finPal only ever works from what lands.** Every figure in this app — what you spend, what
is left, how long a goal takes — is built from money that actually arrived in an account it
can see. That is deliberate: a budget built on the headline number is a budget that is short
every month and cannot say why.

The practical use of knowing the gap is comparing offers. A raise of £3,000 does not put
£3,000 in your account, and two jobs quoting the same salary can land differently depending
on what each takes at source.

> **What finPal does not know:** it sees deposits, not payslips. It cannot tell you what was
> deducted or whether it was right — only what arrived.
""",

    'debt-to-income': """\
### How steep the ground is

Debt-to-income is one number: what you pay towards debts each month, divided by what lands
each month. Owing £10,000 means something completely different on £1,500 a month than on
£5,000 a month, and this is the ratio that says which situation you are in.

It is the figure lenders lean on most, and it is useful to you for a different reason: it is
the one number that moves when *either* side moves. Paying down a balance lowers it. So does
earning more. Most advice only ever talks about the first.

There is no universal cut-off — the thresholds lenders use differ by country and by product,
and finPal does not check you against any of them. What it can tell you is your own number
and which way it has moved.
""",

    'when-consolidating-helps-and-when-it-doesnt': """\
### Joining two ropes

Consolidating means replacing several debts with one. Whether it helps comes down to
arithmetic you can do yourself, and it is worth doing before anyone sells you anything.

**It helps when the new rate is genuinely lower than what you are paying now**, weighted by
how much sits at each rate — and when any arrangement fee is smaller than the interest you
avoid. Paying 24% on £4,000 and 8% on £1,000, a single 12% loan is cheaper. A single 22% one
is not, however much simpler it looks.

**The part that catches people is the term.** A lower monthly payment over a longer period
can cost more in total while feeling like relief every month. Both things are true at once,
and which matters depends on whether the problem is the total or the monthly squeeze. If the
monthly payment is what is breaking, paying more overall to make this month survivable is a
reasonable trade, made on purpose.

The other quiet risk: clearing cards and leaving them open. The balances come back for a lot
of people, and then there are two debts instead of one.

> **finPal does not recommend products and has no view on any lender.** It can show you the
> rates you have entered and what they cost you. The comparison is yours.
""",

    'why-a-buffer-comes-first': """\
### Why the shelter goes up before the climb

Paying down a 24% card is a guaranteed 24% return, and no savings account will beat it. By
that arithmetic alone you would put every spare pound on the debt and keep nothing back.

The arithmetic is right and the conclusion is wrong, for one reason: **with nothing set
aside, the next unexpected bill goes back on the card.** You pay the debt down and it climbs
again, and the only thing that changed is that it now feels like your fault.

A small buffer is not an investment competing with the debt. It is what stops the debt
regrowing. That is why it comes first even though it earns less — it is not trying to earn
anything.

**Small is the point.** Enough for the next thing that breaks, not three months of expenses.
Once that exists, the case for throwing everything at the highest rate is exactly as strong
as it always was.
""",

    'how-much-is-enough': """\
### Deciding when to stop filling

"Three to six months of expenses" is the usual answer and it is a range, not a number,
because the right amount depends on things only you know.

**What pushes it up:** income that varies, being the only earner, self-employment, a long
notice period being unlikely, dependants, an old car, a rented place with an unpredictable
landlord.

**What pulls it down:** two incomes that do not rise and fall together, secure work, family
who could help, few fixed commitments.

The useful version of the question is not "how many months" but **"how long would it take me
to replace this income, and what does the gap cost?"** Someone whose work is scarce locally
needs a longer runway than someone whose phone rings weekly.

There is also a top. Money past the point where it covers the realistic gap is money doing
very little, and at that point paying down debt or investing it does more. **Having a
stopping point is the thing most people never set**, and without one the buffer quietly
becomes the plan.
""",

    'sinking-funds': """\
### Leaving supplies along the route

Some costs are certain and simply not monthly: car tax, insurance renewals, a boiler
service, Christmas. They are not emergencies — you know they are coming and roughly what
they cost — but they arrive as a lump and land like a shock.

A sinking fund is the unglamorous fix: divide the yearly cost by twelve and set that aside
each month, so the bill is already paid when it arrives. £600 of car tax is £50 a month you
barely notice instead of £600 you did not have in March.

**This is what finPal's Non-Monthly spending group is for.** A cost marked Non-Monthly is
one the app knows will not appear every month, so a month without it is not you doing well
and a month with it is not you overspending.

The honest limitation: this only works if the money is somewhere you will not spend it.
A sinking fund in your current account is a number in your head.
""",

    'paying-yourself-first': """\
### Leaving before dawn

Saving what is left at the end of the month mostly means saving nothing, and not because of
weak will — whatever is available gets spent because there is always something that needs
it. Moving the money on payday, before the month starts, is the whole of this idea.

It works because it changes what the month looks like from the inside. £150 moved on payday
is a month with £150 less in it, which is a thing you can plan around. £150 hoped for at the
end is a month with no constraint and then a disappointment.

**A caution worth stating plainly:** this only helps if the amount is one the month can
actually survive. Moving £400 on payday and pulling £300 back on the 20th is worse than
moving £100 and leaving it — it costs you the habit and teaches you the system does not
work. Starting smaller than feels impressive is the version that lasts.

And if there is genuinely nothing spare after the essentials, that is not a discipline
problem. Rent, food and borrowing have outrun wages in most places for years. What this
lesson is still good for then is the *order*: whenever something does become spare, it moves
first rather than last.
""",

    'what-inflation-does-to-cash': """\
### The slow change you do not feel

Money kept as cash does not lose any pounds. It loses what those pounds buy. At 3% a year,
£10,000 still says £10,000 in twelve months and buys roughly what £9,700 buys today.

Nothing dramatic happens over one year. Over ten it is the difference between a buffer that
still covers three months and one that covers two.

**What this does not mean is that cash is a mistake.** A buffer's job is being there on the
day you need it, and that job requires it to be boring and instantly available. Paying a
little for that is the cost of the guarantee, not a failure to optimise.

**What it does mean is that a large pile of cash with no job is losing quietly.** Once the
buffer covers the gap it is for, money beyond it has somewhere better to be — against debt,
or invested — and leaving it in cash is a decision rather than a default.

This is also why a savings goal set years out and never revisited drifts: the target was
priced in today's money and the thing you are saving for will not be.

> **finPal does not track an inflation rate** and does not adjust any figure for one. Every
> number in the app is in today's money.
""",

    'when-to-stop-saving-and-start-paying-down': """\
### The fork in the trail

Once a buffer covers the next thing that breaks, the next pound has two places to go, and
for once the arithmetic gives a clean answer.

**Money against a debt earns you that debt's rate, guaranteed.** Paying down a card at 22%
is a guaranteed 22% return — no market, no risk, no tax to think about. A savings account
paying 4% is not close, and nothing safe is.

So the ordinary answer is: buffer first, then the highest-rate debt, then everything else.

**Two honest exceptions.** If your employer matches pension contributions, that match is
usually a bigger immediate return than any card rate and comes first. And if a specific
near-term thing genuinely requires cash on a date — a deposit, a visa, a move — then it
needs to be cash on that date, whatever the arithmetic says about rates.

Past those, the rate decides.
""",

    'insurance-as-risk-transfer': """\
### Paying someone else to carry the risk

Insurance is not a product so much as a trade: you hand over a small, certain cost every
month, and somebody else takes on a large, unlikely one. You are meant to "lose" on it most
years. That is what working looks like.

Which makes the useful question not *"will I get my money back?"* but **"could I absorb this
if it happened?"** A £200 phone repair is unpleasant and survivable, so insuring it is
usually paying a premium to avoid an inconvenience. A house burning down, or the income of
the person the household depends on stopping, is not survivable by most people — and that is
the shape worth transferring.

This is why a buffer and insurance do the same job at different sizes. The buffer absorbs
what you can carry. Insurance is for what you cannot.

The excess is the dial between them: a higher excess means a lower premium and more risk kept
by you, which is a sensible trade **exactly to the extent that your buffer can cover the
excess.**

> **What kinds of cover exist, what they are called, and what is required differ by country,
> so this lesson deliberately names none of them.** finPal does not sell insurance, does not
> know what you hold, and has no view on any provider.
""",

    'what-finpal-cannot-tell-you': """\
### Where the guidebook stops

This is the lesson about the edge of what this app is.

**finPal is not financial advice and cannot be.** Advice means someone qualified looking at
your whole situation and taking responsibility for what they tell you. finPal is arithmetic
on the data you gave it. Those are different things, and the difference matters most exactly
when a decision is large.

**What it can do honestly:** add up what you have, show what a rate costs, show what a
payment does, and show which way a number moved. All of that is true as far as your data
goes.

**Where it is blind.** It only knows accounts you have told it about. It cannot see your tax
position, your employer's pension terms, anything in another currency it has no rate for, or
anything that happened before you started using it. It does not know your country's rules —
on credit, on insolvency, on which accounts are tax-advantaged — and *deliberately does not
guess*: your number format is a display preference, not a statement about where you live, and
reading it as one would be the kind of confident wrong answer worth more than a blank.

**When to talk to a person instead.** Anything involving insolvency or bankruptcy. Anything
where a tax outcome is central. Debt you cannot see a route out of — non-profit debt advice
exists in most countries and is usually free. And any decision big enough that being wrong
would be hard to undo.

Knowing where a map stops being accurate is part of reading it.
""",

}


def apply_bodies():
    """Fill `body_md` where it was never written. Returns how many rows changed.

    *** KEYED ON NULL, WHICH IS THE OLD VALUE. *** Not on the slug alone: a row
    an operator has edited through the database does not match and survives the
    next boot, which is the same rule that stops `seed_milestones` from
    overwriting an edited title on every restart.
    """
    changed = 0
    for slug, body in BODIES.items():
        changed += (LearnMilestone.query
                    .filter(LearnMilestone.slug == slug,
                            LearnMilestone.body_md.is_(None))
                    .update({'body_md': body}, synchronize_session=False))
    if changed:
        # *** COMMITTED BY THE FUNCTION THAT MADE THE CHANGE (D-188). *** Its
        # caller commits only when it inserted something, which is False on
        # exactly the deployments this correction exists for. No `else:
        # rollback()` -- the caller's own uncommitted work is not ours to drop.
        db.session.commit()
        logger.info('learnPal: filled %d lesson bodies', changed)
    return changed
