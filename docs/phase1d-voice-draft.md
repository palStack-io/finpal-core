# Phase 1d draft copy for owner review

English and Spanish remain draft. Read the lines aloud; fluent Spanish review remains pending. Data names, keys, poses, targets and reward behavior are preserved.

## Phase 1d first-visit, guide and Nova draft bank (2026-10-13)

Keep existing keys, guide/tour targets, panel titles used as icon lookup keys, poses, dismiss topics and behavior. These are copy-only draft replacements; Spanish remains draft until English settles and is reviewed.

| Existing source/key | Current English | Draft English |
|---|---|---|
| onboarding/copy.py ORIENTATION.welcome.heading (both tiers) | finPal is for making the numbers true. | Start with your own money picture. |
| ORIENTATION.welcome.lines[0] (both tiers) | Most money apps start by telling you what to do. This one starts by getting your own figures straight, because almost every decision people regret was made on a number they had wrong. | finPal starts with your own figures. Add one account and build from there. |
| ORIENTATION.welcome.lines[1] (both tiers) | Rent, food and borrowing have outrun wages, and no app fixes that. What finPal can do is show you your own position without flattering it or scolding you for it. | Money can be hard to keep track of. finPal shows where things stand, so you can choose a next step at your own pace. |
| MODULE_COPY.learnpal.intro (both tiers) | Short lessons that unlock from your own figures: what your debt actually costs, where your money goes, what a month of yours looks like. Nothing generic, and nothing you have to study. | Short lessons that unlock from your own figures: what your debt costs, where your money goes and what a month of yours looks like. Start with one when you're ready. |
| guides.py accounts.copy.en.heading (both tiers) | Accounts: where your money actually sits | Accounts: your money in one place |
| guides.py budgets.copy.en.heading (both tiers) | Budgets: a plan for the month, then the truth | Budgets: a plan you can adjust |
| guides.py budgets.copy.en.lines[2] (both tiers) | Nothing here changes your money. It only measures it against what you said you would do. | A budget compares your spending with your plan. If things change, you can review the plan. |
| guides.py goals.copy.en.heading (both tiers) | Goals: every goal is a mountain | Goals: one thing you're working toward |
| common:nova.reactApproach (premium web) | Welcome to base camp. Let's start the climb. | Welcome to base camp. Start when you're ready. |
| common:nova.reactClimbing (premium web) | Good pace. Keep going. | You're making progress. One step at a time. |
| common:nova.reactRidge (premium web) | Almost at the top. | You're close to the top. Take it at your own pace. |
| common:nova.reactSummit (premium web) | You reached the summit. | You reached the summit. |

The summit line is retained: it credits the person and matches the existing stage. The draft removes unsupported broad economic/regret assertions instead of introducing new research claims. Privacy/data-boundary statements, example labels and coin/badge/altitude rules need a source/contract audit before any change; do not soften their factual conditions. This bank is a first batch, not a complete Phase1d inventory or acceptance claim.

## Phase 1d guide audit additions (2026-10-14; draft bank)

The source audit covered all22 registered page guides and all7 tour steps in each tier. Preserve the other guide lines and tours unless the factual review identifies a necessary correction. These changes preserve keys, targets, data and behavior. Owner read-aloud and Spanish draft review remain pending.

| Existing source/key (both tiers) | Current English | Draft English |
|---|---|---|
| guides.py review.copy.en.heading | Review: everything finPal had to guess | Review: confirm how your transactions are sorted |
| guides.py review.copy.en.lines[1] | Either way it stops being a guess. A confirmed one is yours from then on. | Start with one transaction. Confirm its category or choose a better fit. |
| guides.py kit.copy.en.lines[0] | Coins come from telling finPal the truth about your own money. Not from opening the app, and not from spending less. | Coins come from recording details about your own money. Opening the app or spending less does not earn them. |
| guides.py analytics.copy.en.heading | Analytics: where the money went, and where it is heading | Analytics: understand how your money moves |
| guides.py pointspal-cards.copy.en.lines[1] | Keep these right and every recommendation on the other pages is right. | Review a card's details when its rates or rules change. Recommendations use the details saved here. |
| guides.py learnpal.copy.en.lines[0] | Short lessons that unlock from your own figures: what your debt actually costs, where your money goes, what a month of yours looks like. | Short lessons that unlock from your own figures: what your debt costs, where your money goes and what a month of yours looks like. |
| guides.py learnpal.copy.en.lines[1] | Nothing generic, and nothing you have to study. | Start with one lesson when you're ready. |

The welcome draft now says “Add one account and build from there.” It does not promise a bank connector on deployments where connections are disabled. Keep edition-specific Accounts and Settings descriptions distinct. Kit wording retains the existing distinction between recording facts and opening the app/spending less; award eligibility is not changed by this draft.

## Phase1d Spanish draft bank (2026-10-14)

Draft translations of the revised English only, informal tú, using existing glossary/terms. Fluent review and owner read-aloud remain pending. Preserve keys, placeholders, module names, stage/pose choices and all other Spanish entries. Shared guide keys apply to both server tiers; Nova keys apply only to premium web. This does not translate the server-owned ORIENTATION payload, which currently has no Spanish source contract.

| Existing key | Spanish draft |
|---|---|
| accounts.copy.es.heading | Cuentas: tu dinero en un solo lugar |
| budgets.copy.es.heading | Presupuestos: un plan que puedes ajustar |
| budgets.copy.es.lines[2] | Un presupuesto compara tus gastos con tu plan. Si las cosas cambian, puedes revisar el plan. |
| goals.copy.es.heading | Metas: algo en lo que estás trabajando |
| review.copy.es.heading | Revisión: confirma cómo se clasifican tus transacciones |
| review.copy.es.lines[1] | Empieza con una transacción. Confirma su categoría o elige una que encaje mejor. |
| kit.copy.es.lines[0] | Las monedas vienen de registrar detalles de tu propio dinero. Abrir la app o gastar menos no te da monedas. |
| analytics.copy.es.heading | Analítica: entiende cómo se mueve tu dinero |
| pointspal-cards.copy.es.lines[1] | Revisa los detalles de una tarjeta cuando cambien sus tasas o reglas. Las recomendaciones usan los detalles guardados aquí. |
| learnpal.copy.es.lines[0] | Lecciones cortas que se desbloquean con tus propias cifras: lo que cuesta tu deuda, a dónde va tu dinero y cómo es un mes tuyo. |
| learnpal.copy.es.lines[1] | Empieza con una lección cuando quieras. |
| common:nova.reactApproach | Te damos la bienvenida al campamento base. Empieza cuando quieras. |
| common:nova.reactClimbing | Estás avanzando. Un paso a la vez. |
| common:nova.reactRidge | Estás cerca de la cima. Ve a tu ritmo. |
