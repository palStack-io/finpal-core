# Outfit — where these files came from, and what was checked on them

Bundled 2026-08-08 for the "kitchen table" redesign. **Self-hosted on purpose**: finPal
Core is deployed by people who run it themselves specifically to avoid third-party
calls, and an air-gapped install has no route to `fonts.gstatic.com` at all. A remote
font origin in the built output is a defect here, not a convenience —
`noRemoteFontOrigin.test.ts` fails the build over it.

## The files

| file | weight | bytes | sha256 |
|---|---|---|---|
| `outfit-v15-latin-300.woff2` | 300 | 13956 | `ef88e74f63ce75b54cce4d5a4087c6f180750b9ebae6ab6e5bf2a9939bf6958f` |
| `outfit-v15-latin-regular.woff2` | 400 | 14032 | `71f028fd2349990b3f8aa643abe767e82e0f596be407ae66f0004ff164121bdb` |
| `outfit-v15-latin-500.woff2` | 500 | 13528 | `fc9bff941def6d924a71632bd8a93190528872eae6414844f3c367ff948d92fd` |
| `outfit-v15-latin-600.woff2` | 600 | 14140 | `8cfe15c2c6de6ef8efff3eedbd52a383ac9ef23d6c23f6cd9f9b838f5f37dc36` |

~55 KB total, `latin` subset, Outfit v15 (Google Fonts, last modified 2025-09-05).
Pulled from `https://gwfh.mranftl.com/api/fonts/outfit?download=zip&subsets=latin&variants=300,regular,500,600&formats=woff2`.

**Weight 700 is deliberately absent.** No page in this direction uses it, and an
unused weight is dead payload on a self-hosted app.

## The licence, confirmed on the copies actually pulled

`OFL.txt` is SIL Open Font License 1.1, fetched from `google/fonts` at
`ofl/outfit/OFL.txt`. It was not taken on trust — the `name` table of each of the four
woff2 was read directly:

* name ID 14 (License URL) = `https://scripts.sil.org/OFL` on all four
* name ID 0 (Copyright) = `Copyright 2021 The Outfit Project Authors
  (https://github.com/Outfitio/Outfit-Fonts)` on all four, which is the same line
  `OFL.txt` opens with — so the licence file and the binaries are the same work

**One thing the check found:** name ID 13 (License Description — the full OFL preamble
string) is **empty** in these subsetted copies. The subsetter dropped it and kept only
the URL. That is why `OFL.txt` is vendored beside the binaries rather than being treated
as recoverable from them.

## Two findings about the glyph set, both of which outlive this slice

**1. Outfit has no `₹` (U+20B9), in any subset — including the full upstream font.**
Checked against the upstream variable font (`ofl/outfit/Outfit[wght].ttf`, 360 glyphs):
the rupee sign is absent, so this is not a subsetting choice that could be widened.
`INR` is a first-class currency in this app (`config/branding.ts:49`,
`supportedCurrencies`, and an option in both account forms), so an INR user's currency
symbol falls through to the next family in `--font-sans`. Cosmetic — one glyph in a
different face beside the digits — but it is a real reason the fallback stack must stay,
on top of the "a failed load degrades instead of blanking" reason.
`$ £ € ¥ ¢ % … — ’` are all present.

**2. Outfit's default figures are PROPORTIONAL, not tabular.** Measured advance widths
for `0`–`9` are `660 367 553 550 604 553 568 525 555 568`. The font does carry a `tnum`
feature, and applying it makes every digit `590`, so on the web
`font-variant-numeric: tabular-nums` genuinely aligns the ledger column.

**This is a live warning for the mobile slice.** `fontVariant: ['tabular-nums']` is
iOS-only in React Native and is silently ignored on Android, and the plan's note says
Android therefore "depends on the bundled font's own tabular figures". It cannot —
they are proportional by 293 units between the widest and narrowest digit. Android
needs a different answer (a fixed-width amount column, or per-character measurement),
not a hope.
