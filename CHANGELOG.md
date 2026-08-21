# Changelog

## Unreleased

> ### ⚠️ Upgrading from an earlier version — read this first
>
> **Pull and restart; the schema catches itself up. Take a backup first anyway.**
>
> ```bash
> docker compose pull && docker compose up -d
> ```
>
> This release adds two database columns (`accounts.description`, `users.number_locale`).
> On previous versions that would have **broken your instance**: finPal builds its schema
> from the models at boot, and that step creates missing *tables* but never adds a *column*
> to a table that already exists. Because the app selects every column its models declare,
> a missing column makes the *query* fail — and a missing column on `users` meant
> **`POST /auth/login` returned a 500 and nobody could log in.** That is what
> [#122](https://github.com/palStack-io/finpal-core/issues/122) and
> [#124](https://github.com/palStack-io/finpal-core/issues/124) were.
>
> **Boot now reconciles the schema automatically**, so this upgrade needs no manual step.
> It is additive only — it adds missing nullable columns and widens narrowed ones, and it
> never drops, renames, narrows or retypes anything. Check what it did:
>
> ```bash
> docker logs finpal-backend | grep -i "applied:"
> ```
>
> **Prefer to do it by hand?** Set `SCHEMA_AUTO_RECONCILE=false` in `.env`, then run the
> read-only reporter, which prints the exact statements and changes nothing:
>
> ```bash
> docker exec finpal-backend python scripts/schema_drift.py
> ```

### Fixed — reported by self-hosters

- **A recurring transaction marked Income was saved as an Expense** ([#133]) — on *every*
  client, not only the phone. The field was validated and then dropped before it reached
  the database, so the API answered `201` with the wrong type. The web app's only way of
  creating a recurring transaction was broken the same way.
  **Rules you already created are not repaired by this.** Open each one and re-select
  Income; editing applies the type correctly, it was only creating that was broken.
- **A recurring transaction could not be edited at all** ([#134]) — the date field was
  pre-filled with a full timestamp (`2026-08-20T00:00:00`) while the form required
  `YYYY-MM-DD`, so the sheet could be opened and never saved. The update endpoint also
  rejected plain dates, which is fixed alongside it.
- **Every account showed the same icon in every dropdown** ([#135]) — the icon was a
  hardcoded constant in three separate forms. There is now one shared set, taken from the
  icons shown when you create an account. *Note: Checking accounts change from 💳 to 🏦 on
  the Accounts tab, which previously showed the same icon for Checking and Credit.*
- **Changing an account's type discarded the colour you had picked** ([#130]) — it reset to
  the incoming type's default. It now only follows the type while you have not chosen a
  colour yourself. Two related problems were found and fixed with it: account updates
  applied no validation at all, and the Accounts page still held an old copy of the colour
  list that could save an invalid value.
- **The account "Description" field was collected and thrown away** ([#129]) — there was no
  column for it, and it was never sent. It is now stored, shown, and editable.
- **Amounts typed with a comma were silently truncated** ([#132]) — `1,50` was recorded as
  `1.00`, with no error, because the value was parsed as a plain number and stopped at the
  separator. **If you have been entering amounts with a comma on the phone, please review
  your recent transactions** — those values were saved as the whole-number part and the
  original cannot be recovered from the data.

### Added

- **Number format preference** ([#132]) — choose `1,234.56`, `1.234,56`, `1 234,56` or
  `1'234.56`. Set during onboarding beside currency and timezone, and changeable any time
  in **Settings → Profile**. It is stored on your account, so it applies on both the web
  app and the phone. Amount fields now accept a comma or a dot whichever you pick.
- **`SCHEMA_AUTO_RECONCILE`** — on by default; see the upgrade note above and
  [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md).

### Internal

- The schema is reconciled at boot instead of drifting silently (D-121). Additive only,
  logged, and skippable with `SCHEMA_AUTO_RECONCILE=false`.
- `scripts/preflight.sh` runs every CI gate locally, including the two browser walks that
  `vitest` alone does not cover.

[#129]: https://github.com/palStack-io/finpal-core/issues/129
[#130]: https://github.com/palStack-io/finpal-core/issues/130
[#132]: https://github.com/palStack-io/finpal-core/issues/132
[#133]: https://github.com/palStack-io/finpal-core/issues/133
[#134]: https://github.com/palStack-io/finpal-core/issues/134
[#135]: https://github.com/palStack-io/finpal-core/issues/135
