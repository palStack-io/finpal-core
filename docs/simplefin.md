# SimpleFin bank sync

Connecting bank accounts through SimpleFin Bridge.

## Enable it on the server

SimpleFin is **off by default** — `SIMPLEFIN_ENABLED` defaults to `false`, and the API
answers 503 on every SimpleFin route until you set it:

```
SIMPLEFIN_ENABLED=true
```

`GET /api/v1/auth/config` reports the flag under `features.simplefin`, which is how both
clients decide whether to offer bank sync at all.

## Set it up as a user

1. **Get a setup token**
   - Open [SimpleFin Bridge](https://bridge.simplefin.org/simplefin/create) and create an
     account. It is a paid service — around $1.50 a month, billed by SimpleFin.
   - Connect your bank inside Bridge. Your bank credentials are entered there and never
     reach finPal.
   - Choose to connect a new app. Bridge gives you a **setup token**: one long line of
     letters and numbers.

2. **Paste it into finPal**
   - Go to **Settings → Integrations** and open the SimpleFin panel.
   - Paste the whole token and press Connect.
   - Choose which accounts to import. Transactions then sync automatically.

The Accounts screen shows a pointer to this panel until a connection exists, on web and
on mobile. **Mobile can explain the setup but cannot complete it** — there is no
SimpleFin screen in the app, so the last step happens in a browser.

## What the token is, and why it is only a token

Bridge hands a user exactly one artifact: a base64 setup token, **usable once**. finPal
base64-decodes it to a claim URL, POSTs that URL a single time, and stores the **access
URL** it receives back. That access URL is the long-lived credential every later sync
uses; the token is spent the moment it is claimed.

So a token that has already been used cannot be pasted again — generate a fresh one on
Bridge. `POST /api/v1/accounts/simplefin/connect` also accepts `access_url` directly, for
callers that already hold one.

Nothing is saved until the credential has answered a real request against Bridge. Until
2026-08-15 the endpoint stored whatever string it was sent and reported a healthy
connection, so pasting the token — the only thing anyone actually has — produced a
connection that could never sync and never said so.

**Privacy note:** SimpleFin acts as a bridge to your bank. finPal stores only the access
URL, on your own server — your bank credentials never touch finPal.

---
