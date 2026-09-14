# Where your money data goes — and where it does not

**The promise:** what you tell finPal about your money stays on the server you
run it on, and is only ever used to answer your own requests.

This page is the evidence for that sentence, because a privacy claim that lives
only in marketing copy stops being true the first time somebody adds a
dependency. Every line below is checked by
`tests/unit/test_no_data_leaves_the_instance.py`, which fails the build if a new
outbound host appears anywhere in `api/`, `src/` or `integrations/` without
being declared — so this page is written **from** that test's allowlist, not
beside it.

## What is true unconditionally

- **There is no analytics, no tracking and no telemetry.** Nothing reports your
  usage, your page views, your balances or your existence to palStack or to
  anyone else. Not in the backend, not in the web UI, not in the mobile app.
  Re-derive: `grep -rliE 'sentry|posthog|mixpanel|segment|amplitude|gtag|googletagmanager' api src integrations web-ui/src`
- **Nothing about your money is sent to an AI model.** There is no LLM in this
  product. No categorisation call, no "insights" call, nothing.
- **Your figures are computed on your own server.** Budgets, analytics, net
  worth, learnPal lessons, coins and the acts behind them are all derived from
  your own rows by your own instance. Nothing is scored elsewhere and sent back.
- **Your data is scoped to your account.** Household sharing is opt-in and
  explicit; the one predicate that decides it is `src/utils/household.py`.
- **Fonts and assets are served from your own instance.** No CDN and no Google
  Fonts, so loading a page does not tell a third party your IP address. Guarded
  by `web-ui/src/__tests__/unit/noRemoteFontOrigin.test.ts`.
- **The mobile app talks only to the server you point it at.** The backend URL
  is yours to set, and the app ships no analytics SDK and no crash reporter.

## The outbound connections that exist, and exactly what they carry

Every one of these is either **opt-in** (you turn the feature on) or
**operator-configured** (whoever runs the server chose it). None of them
receives your transaction history, your balances, or your identity except where
stated.

| Goes out to | When | What it is sent | What it is NOT sent |
|---|---|---|---|
| `bridge.simplefin.org` | Only if you connect a bank | Your SimpleFin access token, to fetch your accounts | finPal never holds a bank credential — that relationship is between you and SimpleFin |
| `api.frankfurter.app` | Currency conversion | A currency code. The request is literally `?from=USD` | No amount, no account, no user |
| `financialmodelingprep.com`, and Yahoo via the `yfinance` library | Only if you use Investments | The **ticker symbol** you hold, to price it | Not how many you hold, not what it is worth, not who you are |
| `raw.githubusercontent.com` | pointsPal's card-programme catalogue | Nothing about you — it is a download | — |
| `accounts.google.com` / `appleid.apple.com` | Only if you sign in with Google or Apple | Your identity, to the provider you chose. **Your server is the OAuth client, not our app** | No financial data |
| Your SMTP server | Only if the operator configured email | Notification and verification emails, addressed to you | Whoever runs the mail server can see those emails — that is the operator's choice, and it is the one path worth knowing about |

`yfinance` is in the table but **not** in the host sweep, because it calls Yahoo
from inside the library rather than through a URL in our code. It is declared in
the test's allowlist by library name for exactly that reason, and it is the
known example of what that sweep cannot see.

## What this page deliberately does not claim

- **It does not say "nothing ever leaves".** Six things can, they are listed
  above, and a blanket claim would be false — which is worse than a narrow one.
- **It does not speak for the operator.** If somebody else runs your instance,
  they control the database, the backups and the mail server. Self-hosting is
  what makes the promise strong; it also means the promise is *theirs* to keep.
  The hosted demo at `findemo.palstack.io` is a demo: it is reset on a schedule
  and is not somewhere to put real money data.
- **It does not claim encryption at rest.** That is the operator's deployment
  decision, not something this code can assert.

## If you are auditing this yourself

```bash
# every outbound host in the backend, with its call site
grep -rnoE 'https?://[A-Za-z0-9._%-]+' api src integrations --include='*.py'

# the guard that pins the list, and what it says each host is sent
./venv/bin/python -m pytest tests/unit/test_no_data_leaves_the_instance.py -v

# the same question of the clients
grep -rnoE 'https?://[A-Za-z0-9._%-]+' web-ui/src
```

finPal is AGPL. You can read every line of this, which is the only privacy
claim that does not depend on trusting us.
