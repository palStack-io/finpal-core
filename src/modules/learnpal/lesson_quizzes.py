"""The quick check at the end of each lesson (Phase 5d, 2026-10-15; spec: finPal/docs/phase5-learnpal-quiz-spec.md).

Written only from each lesson's own text in `lesson_bodies.py`. The rules this copy follows:

* **"Not sure" is always an answer and is never wrong.** Every question has one, and it explains the idea.
* **Every option is explained in one line**, right or not. Nothing here says "wrong".
* **No score.** The client ends with "You've got this one" or "This is worth another look".
* **One action** per lesson, into the person's own finPal.
* **No coins for answering.** Coins stay with finishing a lesson or using a skill on real data.

English is the draft for the owner's read-aloud (docs/voice.md); Spanish follows once the English settles.
Each question: `prompt`, three `options` ({text, right, why}) and `not_sure` (the line shown for "Not sure").
"""

QUIZZES = {
    'what-a-goal-tracks': {
        'action': {'label': 'Link a goal to an account', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'What makes a goal\'s number move on its own?',
             'options': [
                 {'text': 'Linking it to an account', 'right': True,
                  'why': 'A linked goal follows the balance, so it never drifts from what is true.'},
                 {'text': 'Checking it every day', 'right': False,
                  'why': 'Looking does not move it. Only a linked balance updates by itself.'},
                 {'text': 'Setting a higher target', 'right': False,
                  'why': 'The target is where you are heading; the link is what keeps the progress current.'},
             ],
             'not_sure': 'Linking a goal to an account makes it follow that balance, with nothing to update by hand.'},
            {'id': 'q2', 'prompt': 'You are paying down two cards. Can one goal follow both?',
             'options': [
                 {'text': 'No, each card needs its own goal', 'right': False,
                  'why': 'One goal can watch several accounts and add them up.'},
                 {'text': 'Yes, it adds them up and treats them as one climb', 'right': True,
                  'why': 'That is exactly what a goal watching several accounts does.'},
                 {'text': 'Only if they are with the same bank', 'right': False,
                  'why': 'The bank does not matter; any accounts finPal can see can share a goal.'},
             ],
             'not_sure': 'One goal can watch several accounts at once and treat them as one climb.'},
        ],
    },
    'where-your-money-goes': {
        'action': {'label': 'Look at your spending by category', 'href': '/analytics'},
        'questions': [
            {'id': 'q1', 'prompt': 'What is the point of sorting spending into categories?',
             'options': [
                 {'text': 'To find out what you did wrong', 'right': False,
                  'why': 'It is not a verdict. Some of it was groceries, some of it was a hard week.'},
                 {'text': 'To see the shape of it, so you can choose', 'right': True,
                  'why': 'You cannot choose about money you cannot see; the shape makes it visible.'},
                 {'text': 'To cut every category by the same amount', 'right': False,
                  'why': 'The lesson asks for nothing to change today. Looking is the step.'},
             ],
             'not_sure': 'Categories show the shape of your spending, which puts the decision back in your hands.'},
            {'id': 'q2', 'prompt': 'When one category turns out bigger than expected, what is often the reason?',
             'options': [
                 {'text': 'The price moved, not the habit', 'right': True,
                  'why': 'Food and energy have both done this to a lot of people.'},
                 {'text': 'It is always the category you were worried about', 'right': False,
                  'why': 'It is almost never that one. That is why the surprise is useful.'},
                 {'text': 'finPal sorted it badly', 'right': False,
                  'why': 'You can correct any category, but the usual reason is that prices changed.'},
             ],
             'not_sure': 'Often a category grows because its price moved, not because your habit did.'},
        ],
    },
    'a-starter-buffer': {
        'action': {'label': 'Start a buffer goal', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'Where does most of a buffer\'s protection come from?',
             'options': [
                 {'text': 'The last month you add on the way to six', 'right': False,
                  'why': 'The gap between four and six months is real but nothing like as sharp.'},
                 {'text': 'The first small bit', 'right': True,
                  'why': 'A few hundred is the difference between a flat tyre being annoying and it going on a card.'},
                 {'text': 'Only the full three to six months', 'right': False,
                  'why': 'That target is out of reach for many people, and most of the protection comes well before it.'},
             ],
             'not_sure': 'Most of the protection comes from the first small amount you set aside.'},
            {'id': 'q2', 'prompt': 'What is the first amount worth aiming at?',
             'options': [
                 {'text': 'Whatever covers the next thing that breaks', 'right': True,
                  'why': 'That is the target this lesson sets first.'},
                 {'text': 'Three months of expenses', 'right': False,
                  'why': 'A reasonable later target, but not the first one.'},
                 {'text': 'Nothing until the debt is gone', 'right': False,
                  'why': 'Without a small buffer, the next surprise bill goes back on the card.'},
             ],
             'not_sure': 'Aim first at enough to cover the next thing that breaks.'},
        ],
    },
    'what-your-apr-costs': {
        'action': {'label': 'Add the rate on a card', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': 'Roughly what does 4,200 at 22.9% APR cost each month in interest?',
             'options': [
                 {'text': 'About 8', 'right': False,
                  'why': 'Balance times rate, divided by twelve: 4,200 x 0.229 / 12 is about 80.'},
                 {'text': 'About 80', 'right': True,
                  'why': 'Balance times rate, divided by twelve, comes to about 80 a month.'},
                 {'text': 'About 960', 'right': False,
                  'why': 'That is close to a whole year of interest. Divide by twelve for a month.'},
             ],
             'not_sure': 'Multiply the balance by the rate and divide by twelve to see the monthly cost.'},
            {'id': 'q2', 'prompt': 'You have a spare payment. Which matters more for where it goes?',
             'options': [
                 {'text': 'Which balance is biggest', 'right': False,
                  'why': 'A large balance at 4% can cost less each month than a small one at 25%.'},
                 {'text': 'Which one you opened first', 'right': False,
                  'why': 'Age does not change what a debt costs you each month.'},
                 {'text': 'Which rate is highest', 'right': True,
                  'why': 'The rate decides the monthly cost, so it is the number to look at.'},
             ],
             'not_sure': 'The rate matters more than the size when choosing where a spare payment goes.'},
        ],
    },
    'why-minimums-barely-move-it': {
        'action': {'label': 'See your cards and their minimums', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': 'Where does most of a minimum payment go?',
             'options': [
                 {'text': 'To the interest', 'right': True,
                  'why': 'Only what is left after the interest touches what you owe.'},
                 {'text': 'Straight to the balance', 'right': False,
                  'why': 'That is what happens to money ABOVE the minimum.'},
                 {'text': 'To fees', 'right': False,
                  'why': 'The minimum is mostly interest plus a small slice of the balance.'},
             ],
             'not_sure': 'Most of a minimum payment covers interest; only the rest reduces the balance.'},
            {'id': 'q2', 'prompt': 'Why does an extra 20 a month do more than it looks like?',
             'options': [
                 {'text': 'It earns interest for you', 'right': False,
                  'why': 'It does not earn anything; it stops interest being charged on that part.'},
                 {'text': 'All of it goes straight at the balance', 'right': True,
                  'why': 'The interest is already covered by the minimum, so the extra is the part that moves.'},
                 {'text': 'The bank rewards early payment', 'right': False,
                  'why': 'No reward is involved; the extra simply goes straight at what you owe.'},
             ],
             'not_sure': 'Anything above the minimum goes straight at the balance, because the interest is already paid.'},
        ],
    },
    'utilisation-and-your-score': {
        'action': {'label': 'Check your card limits', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': 'A 4,200 balance on a 12,000 limit. What is the utilisation?',
             'options': [
                 {'text': '35%', 'right': True, 'why': '4,200 divided by 12,000 is 0.35.'},
                 {'text': '12%', 'right': False, 'why': 'Utilisation is balance divided by limit: 4,200 / 12,000.'},
                 {'text': '65%', 'right': False, 'why': 'That is the part you are NOT using.'},
             ],
             'not_sure': 'Utilisation is the balance divided by the limit.'},
            {'id': 'q2', 'prompt': 'You pay off a card and close it. What can happen to your utilisation?',
             'options': [
                 {'text': 'It always goes down', 'right': False,
                  'why': 'Closing removes that card\'s limit from the total, which can push it up.'},
                 {'text': 'It can go up, even though you owe less', 'right': True,
                  'why': 'The total limit shrinks, so the same balances are a bigger share of it.'},
                 {'text': 'It stays the same for a year', 'right': False,
                  'why': 'It is a snapshot, so it changes as soon as the balances or limits do.'},
             ],
             'not_sure': 'Closing a card removes its limit from the total, so utilisation can rise.'},
        ],
    },
    'avalanche-vs-snowball': {
        'action': {'label': 'Look at your debts on the range', 'href': '/dashboard'},
        'questions': [
            {'id': 'q1', 'prompt': 'Which approach costs the least money overall?',
             'options': [
                 {'text': 'Smallest balance first', 'right': False,
                  'why': 'It costs a bit more in total, though it finishes things sooner.'},
                 {'text': 'Splitting spare money evenly', 'right': False,
                  'why': 'Spreading it keeps paying interest on the most expensive debt.'},
                 {'text': 'Highest rate first', 'right': True,
                  'why': 'Paying the most expensive debt first is arithmetically the cheapest.'},
             ],
             'not_sure': 'Highest rate first (the avalanche) costs the least overall.'},
            {'id': 'q2', 'prompt': 'So which one should you choose?',
             'options': [
                 {'text': 'Always the avalanche', 'right': False,
                  'why': 'It is cheaper, but a plan you abandon saves nothing.'},
                 {'text': 'The one you will actually keep doing', 'right': True,
                  'why': 'That is the part only you know, and finPal will not pick for you.'},
                 {'text': 'Always the snowball', 'right': False,
                  'why': 'It helps many people stay with it, but it does cost a bit more.'},
             ],
             'not_sure': 'Both work; the better one is the one you will keep doing.'},
        ],
    },
    'fixed-vs-flexible': {
        'action': {'label': 'Sort your categories', 'href': '/categories'},
        'questions': [
            {'id': 'q1', 'prompt': 'Car tax, a yearly renewal, presents in December. Which kind of spending?',
             'options': [
                 {'text': 'Non-monthly', 'right': True,
                  'why': 'Real and unavoidable, but it does not arrive every month.'},
                 {'text': 'Flexible', 'right': False,
                  'why': 'Flexible is what you choose again each month, like groceries.'},
                 {'text': 'Waste', 'right': False,
                  'why': 'None of the three kinds is waste. This is just irregular.'},
             ],
             'not_sure': 'Costs that are certain but not monthly belong in Non-monthly.'},
            {'id': 'q2', 'prompt': 'Your fixed costs take most of what comes in. What does that tell you?',
             'options': [
                 {'text': 'That you handle money badly', 'right': False,
                  'why': 'It is a fact about what things cost, not a verdict on you.'},
                 {'text': 'Why it feels hard, and which kind of problem it is', 'right': True,
                  'why': 'It separates a problem choices can fix from one they cannot.'},
                 {'text': 'That flexible spending must go to zero', 'right': False,
                  'why': 'Flexible spending is most of what makes a life; it is not the enemy.'},
             ],
             'not_sure': 'A high fixed share explains why things feel hard; it is not a judgement of you.'},
        ],
    },
    'income-vs-what-lands': {
        'action': {'label': 'See what landed this month', 'href': '/dashboard'},
        'questions': [
            {'id': 'q1', 'prompt': 'Which figure does finPal build every number from?',
             'options': [
                 {'text': 'The salary on your contract', 'right': False,
                  'why': 'A budget built on the headline figure is short every month.'},
                 {'text': 'Your salary minus tax only', 'right': False,
                  'why': 'Other things are taken at source too; finPal uses what actually arrives.'},
                 {'text': 'What actually lands in your accounts', 'right': True,
                  'why': 'Every figure comes from money that really arrived where finPal can see it.'},
             ],
             'not_sure': 'finPal works only from what lands in your accounts, not the headline salary.'},
            {'id': 'q2', 'prompt': 'You get a raise of 3,000 a year. How much more lands?',
             'options': [
                 {'text': 'Exactly 3,000', 'right': False,
                  'why': 'Tax and deductions come out of it before it arrives.'},
                 {'text': 'Less than 3,000', 'right': True,
                  'why': 'What lands is the raise minus whatever is taken at source.'},
                 {'text': 'It depends only on your bank', 'right': False,
                  'why': 'It depends on what is deducted, not on where it is paid.'},
             ],
             'not_sure': 'A raise lands smaller than its headline, after tax and deductions.'},
        ],
    },
    'debt-to-income': {
        'action': {'label': 'See your debts and what lands', 'href': '/dashboard'},
        'questions': [
            {'id': 'q1', 'prompt': 'What is debt-to-income?',
             'options': [
                 {'text': 'Monthly debt payments divided by what lands each month', 'right': True,
                  'why': 'That ratio is how steep the ground is.'},
                 {'text': 'Total debt divided by yearly salary', 'right': False,
                  'why': 'It uses monthly payments and monthly money that lands.'},
                 {'text': 'Your credit score', 'right': False,
                  'why': 'It is a ratio you can work out yourself, not a score.'},
             ],
             'not_sure': 'Debt-to-income is what you pay towards debts each month over what lands each month.'},
            {'id': 'q2', 'prompt': 'Which of these lowers it?',
             'options': [
                 {'text': 'Only paying down debt', 'right': False,
                  'why': 'That is one way. It moves when either side moves.'},
                 {'text': 'Paying down debt, or more landing each month', 'right': True,
                  'why': 'It is the one number that moves when either side moves.'},
                 {'text': 'Nothing; it is fixed by lenders', 'right': False,
                  'why': 'It is your own number, and it changes as your figures change.'},
             ],
             'not_sure': 'It falls when debt payments fall or when more lands each month.'},
        ],
    },
    'when-consolidating-helps-and-when-it-doesnt': {
        'action': {'label': 'Check the rates you have entered', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': '24% on 4,000 and 8% on 1,000. Which single loan would help?',
             'options': [
                 {'text': 'One at 22%', 'right': False,
                  'why': 'Weighted by the balances, you pay well under 22% now, so this costs more.'},
                 {'text': 'One at 12%', 'right': True,
                  'why': 'That is lower than the rate you pay overall, so it is cheaper.'},
                 {'text': 'Any single loan, because one is simpler', 'right': False,
                  'why': 'Simpler is not cheaper. Only a genuinely lower rate helps.'},
             ],
             'not_sure': 'Consolidating helps only when the new rate is lower than what you pay now, weighted by balance.'},
            {'id': 'q2', 'prompt': 'A lower monthly payment over a longer term. What can happen?',
             'options': [
                 {'text': 'It always costs less overall', 'right': False,
                  'why': 'More months of interest can cost more in total.'},
                 {'text': 'It can cost more in total while feeling like relief', 'right': True,
                  'why': 'Both are true at once; which matters depends on your problem.'},
                 {'text': 'Nothing changes but the date', 'right': False,
                  'why': 'The total interest changes with the term.'},
             ],
             'not_sure': 'A longer term can lower the monthly payment and still raise the total cost.'},
        ],
    },
    'why-a-buffer-comes-first': {
        'action': {'label': 'Start a buffer goal', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'Paying a 24% card beats any savings rate. So why keep a small buffer first?',
             'options': [
                 {'text': 'Because savings earn more', 'right': False,
                  'why': 'They do not; the buffer is not trying to earn anything.'},
                 {'text': 'So the next surprise bill does not go back on the card', 'right': True,
                  'why': 'The buffer is what stops the debt regrowing.'},
                 {'text': 'Because debt should never be paid early', 'right': False,
                  'why': 'Paying the card down is still the plan, once the buffer exists.'},
             ],
             'not_sure': 'A small buffer stops the next unexpected bill landing back on the card.'},
            {'id': 'q2', 'prompt': 'How big should that first buffer be?',
             'options': [
                 {'text': 'Enough for the next thing that breaks', 'right': True, 'why': 'Small is the point.'},
                 {'text': 'Six months of expenses', 'right': False,
                  'why': 'That delays paying down the card for no extra protection right now.'},
                 {'text': 'As big as the debt', 'right': False,
                  'why': 'The buffer is for surprises, not for matching the balance.'},
             ],
             'not_sure': 'Enough for the next thing that breaks; then the highest rate gets the rest.'},
        ],
    },
    'how-much-is-enough': {
        'action': {'label': 'Set a stopping point on your buffer goal', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'Which of these pushes the right buffer UP?',
             'options': [
                 {'text': 'Two incomes that do not rise and fall together', 'right': False,
                  'why': 'That pulls it down: one can cover while the other cannot.'},
                 {'text': 'Income that varies, or being the only earner', 'right': True,
                  'why': 'Both make a gap more likely and longer.'},
                 {'text': 'Secure work', 'right': False, 'why': 'Secure work pulls it down.'},
             ],
             'not_sure': 'Variable income, being the only earner and dependants all push the buffer up.'},
            {'id': 'q2', 'prompt': 'What do most people never set for their buffer?',
             'options': [
                 {'text': 'A stopping point', 'right': True,
                  'why': 'Past it, money does more against debt or invested.'},
                 {'text': 'A name', 'right': False, 'why': 'Names are easy; the missing piece is when to stop.'},
                 {'text': 'A starting amount', 'right': False,
                  'why': 'Starting is the usual focus. Stopping is the forgotten part.'},
             ],
             'not_sure': 'A stopping point, so the buffer does not quietly become the whole plan.'},
        ],
    },
    'sinking-funds': {
        'action': {'label': 'Mark a cost as Non-monthly', 'href': '/categories'},
        'questions': [
            {'id': 'q1', 'prompt': 'A 600 car-tax bill once a year. What does a sinking fund put aside?',
             'options': [
                 {'text': 'About 50 a month', 'right': True, 'why': '600 divided by twelve.'},
                 {'text': '600 in the month it is due', 'right': False,
                  'why': 'That is the shock a sinking fund exists to avoid.'},
                 {'text': 'Nothing; it is an emergency', 'right': False,
                  'why': 'It is certain and known, so it is not an emergency.'},
             ],
             'not_sure': 'Divide the yearly cost by twelve and set that aside each month.'},
            {'id': 'q2', 'prompt': 'Where should that money sit?',
             'options': [
                 {'text': 'In your current account, mentally set aside', 'right': False,
                  'why': 'A sinking fund in your current account is just a number in your head.'},
                 {'text': 'Somewhere you will not spend it', 'right': True,
                  'why': 'It only works if the money is really set apart.'},
                 {'text': 'In a long-term investment', 'right': False,
                  'why': 'The bill has a date, so the money needs to be there on that date.'},
             ],
             'not_sure': 'Somewhere you will not spend it, so the bill is paid when it arrives.'},
        ],
    },
    'paying-yourself-first': {
        'action': {'label': 'Set up a goal to move money on payday', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'What is the whole idea of paying yourself first?',
             'options': [
                 {'text': 'Saving whatever is left at the end of the month', 'right': False,
                  'why': 'That mostly means saving nothing, because the month finds a use for it.'},
                 {'text': 'Moving the money on payday, before the month starts', 'right': True,
                  'why': 'It changes what the month looks like from the inside.'},
                 {'text': 'Spending less on yourself', 'right': False, 'why': 'It is about the order, not about willpower.'},
             ],
             'not_sure': 'Move the money on payday, before the month starts.'},
            {'id': 'q2', 'prompt': 'Which works better over time?',
             'options': [
                 {'text': 'Moving 400 and pulling 300 back on the 20th', 'right': False,
                  'why': 'That costs you the habit and teaches you the system does not work.'},
                 {'text': 'Moving 100 and leaving it', 'right': True,
                  'why': 'Starting smaller than feels impressive is the version that lasts.'},
                 {'text': 'Waiting until you can move a lot', 'right': False,
                  'why': 'The order matters even for small amounts; start with what the month can survive.'},
             ],
             'not_sure': 'An amount the month can actually survive, and leaving it there.'},
        ],
    },
    'what-inflation-does-to-cash': {
        'action': {'label': 'Look at your buffer goal', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'At 3% a year, what does 10,000 in cash buy after a year?',
             'options': [
                 {'text': 'Roughly what 9,700 buys today', 'right': True,
                  'why': 'The number stays the same; what it buys shrinks.'},
                 {'text': 'Exactly what 10,000 buys today', 'right': False,
                  'why': 'The number keeps; its buying power does not.'},
                 {'text': 'Roughly what 7,000 buys today', 'right': False,
                  'why': 'That would take many years at 3%, not one.'},
             ],
             'not_sure': 'Cash keeps its number while what it buys slowly shrinks.'},
            {'id': 'q2', 'prompt': 'So is keeping a buffer in cash a mistake?',
             'options': [
                 {'text': 'Yes, it is losing money', 'right': False,
                  'why': 'Its job is to be there on the day; that is worth a small cost.'},
                 {'text': 'No, but a big pile with no job is losing quietly', 'right': True,
                  'why': 'Past the buffer, money has somewhere better to be.'},
                 {'text': 'It only matters over one year', 'right': False,
                  'why': 'One year changes little; ten years changes a lot.'},
             ],
             'not_sure': 'A buffer belongs in cash; money beyond it is worth giving another job.'},
        ],
    },
    'when-to-stop-saving-and-start-paying-down': {
        'action': {'label': 'See your highest-rate debt', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': 'Once your buffer is in place, where does the next spare amount usually go?',
             'options': [
                 {'text': 'The highest-rate debt', 'right': True,
                  'why': 'Paying it down earns that rate, guaranteed.'},
                 {'text': 'A savings account at 4%', 'right': False,
                  'why': 'A 22% card paid down beats any safe savings rate.'},
                 {'text': 'The smallest debt', 'right': False,
                  'why': 'You can choose that for motivation, but the rate decides the cost.'},
             ],
             'not_sure': 'Buffer first, then the highest-rate debt, then everything else.'},
            {'id': 'q2', 'prompt': 'Which is one of the two honest exceptions?',
             'options': [
                 {'text': 'An employer that matches pension contributions', 'right': True,
                  'why': 'That match is usually a bigger immediate return than any card rate.'},
                 {'text': 'Wanting to feel richer', 'right': False,
                  'why': 'Understandable, but the rate still decides.'},
                 {'text': 'A debt at 2%', 'right': False,
                  'why': 'A low rate makes it a lower priority, not an exception.'},
             ],
             'not_sure': 'An employer pension match, or cash needed on a set date, comes before the rate rule.'},
        ],
    },
    'insurance-as-risk-transfer': {
        'action': {'label': 'Check your buffer covers your excess', 'href': '/goals'},
        'questions': [
            {'id': 'q1', 'prompt': 'What is the useful question to ask about insuring something?',
             'options': [
                 {'text': 'Will I get my money back?', 'right': False,
                  'why': 'You are meant to "lose" most years. That is what working looks like.'},
                 {'text': 'Could I absorb this if it happened?', 'right': True,
                  'why': 'Insure what you could not carry; your buffer covers the rest.'},
                 {'text': 'Is it the cheapest premium?', 'right': False,
                  'why': 'Price matters, but the first question is whether the risk is one you can carry.'},
             ],
             'not_sure': 'Ask whether you could absorb the loss; insure what you could not.'},
            {'id': 'q2', 'prompt': 'When does a higher excess make sense?',
             'options': [
                 {'text': 'Always, because the premium is lower', 'right': False,
                  'why': 'Only if you could actually pay that excess.'},
                 {'text': 'When your buffer can cover the excess', 'right': True,
                  'why': 'Then the lower premium is a sensible trade.'},
                 {'text': 'Never', 'right': False, 'why': 'It can be a good trade when your buffer covers it.'},
             ],
             'not_sure': 'A higher excess is a sensible trade exactly as far as your buffer can cover it.'},
        ],
    },
    'what-finpal-cannot-tell-you': {
        'action': {'label': 'Review what finPal can see', 'href': '/accounts'},
        'questions': [
            {'id': 'q1', 'prompt': 'Is finPal financial advice?',
             'options': [
                 {'text': 'Yes, for everyday decisions', 'right': False,
                  'why': 'It is arithmetic on your data, not someone qualified taking responsibility.'},
                 {'text': 'No; it is arithmetic on the data you gave it', 'right': True,
                  'why': 'That difference matters most when a decision is large.'},
                 {'text': 'Only for premium users', 'right': False,
                  'why': 'No edition of finPal is financial advice.'},
             ],
             'not_sure': 'finPal is arithmetic on your data, not financial advice.'},
            {'id': 'q2', 'prompt': 'When is it worth talking to a person instead?',
             'options': [
                 {'text': 'When a debt has no route out you can see', 'right': True,
                  'why': 'Non-profit debt advice exists in most countries and is usually free.'},
                 {'text': 'Before every purchase', 'right': False,
                  'why': 'finPal handles the everyday arithmetic; people help with the big, hard-to-undo calls.'},
                 {'text': 'Never; the app knows more', 'right': False,
                  'why': 'It cannot see your tax position, pension terms or your country\'s rules.'},
             ],
             'not_sure': 'Insolvency, central tax questions, debt with no way out, or any big hard-to-undo decision.'},
        ],
    },
}


def quiz_for(slug):
    """The quick check for a lesson, or None. Shaped for the client: options carry their explanation."""
    q = QUIZZES.get(slug)
    if not q:
        return None
    return {'action': q['action'], 'questions': q['questions']}
