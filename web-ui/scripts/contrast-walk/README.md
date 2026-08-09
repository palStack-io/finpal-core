# The contrast tree-walk — the other half of the contrast gate

`src/__tests__/unit/tokenContrast.test.ts` (#102) validates the **palette**: it proves the
declared token pairs clear WCAG AA. It cannot see **usage**, and nothing could while no
component referenced a token. Concretely: an element setting `color: var(--kt-green)` on a
wash-backed surface is **4.39:1** — a real AA failure — and that gate stays green, because
green-on-wash is classified an `object` and 4.39 clears the 3.0 non-text floor. Every
`absent:` verdict in it has the same hole.

This closes that hole from the other side. It walks a **rendered page** and, for every
element carrying text, resolves that element's own computed colour against its **actual
computed background** — climbing ancestors when a background is transparent. Pairs are
enumerated **from the tree**, never from a list somebody wrote down, because "a list is a
list of the ones somebody remembered" is D-59 and it has already bitten this palette twice.

## Running it

```sh
npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts   # capture the markup
node scripts/contrast-walk/run.mjs                                    # walk it, light + dark
node scripts/contrast-walk/run.mjs --theme dark
node scripts/contrast-walk/run.mjs --capture /path/to/other.html      # A/B a second capture
```

## *** THIS IS NOT YET A CI GATE, AND THAT IS AN OPEN OBLIGATION ***

Do not read "the tree-walk exists" as "contrast is covered" — that is the
✅-means-a-fix-exists-somewhere failure this audit names twice.

It is not in the vitest suite for a reason that is not laziness: **jsdom does not apply an
external stylesheet**, so `getComputedStyle` under jsdom resolves to initial values and
would pass on everything. It needs a real engine. Making the vitest run shell out to Chrome
puts CI one missing binary away from either an unrelated red or — far worse — a silent skip,
and a skipped contrast gate is exactly the "check that inspects nothing" shape this project
has hit four times. So it runs deliberately, and its output goes in the PR.

Closing this properly means a CI job with a browser, and that is its own piece of work.

## What it caught, and what it proves about itself

**Validated against four figures from the canonical token table**, computed independently:
`soft #56685D` on the control track **4.53**, `green #15803d` on card **4.87**,
`clay #AB5437` on wash **4.53 (passing)**, and — the sabotage — `green` on the **wash**
reported at exactly **4.39**, failing. That last one is the precise case `tokenContrast`
cannot see, so the mechanism is doing the job it was built for.

**A bug it had, worth keeping written down:** the first version reported `#ffffff on #ffffff,
1:1` for the Add Transaction button. That button is painted by a `linear-gradient`, so its
`background-color` is `transparent` and the walk climbed straight past it to the page behind.
**A gradient is a background.** It now reads `background-image` too and takes the first colour
stop — an approximation, and the honest direction of one: it is the colour actually under the
label's left edge, and it errs toward the lighter end of this app's gradients rather than
flattering them.

## Scope — read this before filing anything from its output

The implementation plan says in as many words: *"Do not audit the shipped app's existing
contrast pairs as part of this. The failures found were in unshipped design artifacts and
correctly opened no AUDIT row; a live-app contrast sweep is its own item with its own
scope."*

Most of what this reports on Transactions today is **the app's existing palette**
(`--text-muted` at 2.53:1, `--accent-red` on the amount at 3.75:1) and is therefore out of
scope here. The question slice 3 owed was narrower and is answerable by A/B:
**did the restructure make anything worse?** Measured on identical seeded data:

| | distinct failing pairs | failing elements |
|---|---|---|
| before (main `f84cbe7`), light | 12 | 324 |
| after slice 3, light | **10** | **262** |
| before, dark | 7 | 260 |
| after slice 3, dark | **6** | **198** |

**No new failing pair appeared, and every shared pair improved**, because rows now sit on the
card rather than on the `--surface-hover` tint: expense amount 3.44 → 3.75, transfer
3.36 → 3.67, income 2.08 → 2.27, row meta 2.32 → 2.53, owner badge 4.05 → 4.42. The pair that
disappeared entirely was the worst on the page — the Edit button's gold icon on its own gold
tint at **1.46:1**, fifty times over — removed with the tinted action buttons.
