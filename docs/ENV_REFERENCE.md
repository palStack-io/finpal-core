# finPal Environment Variable Reference

> Quick reference for configuring finPal in Portainer.
> Copy-paste the variables you need into your stack's environment section.

---

## Required (App won't work without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_USER` | PostgreSQL username | `finpal` |
| `DB_PASSWORD` | PostgreSQL password | `changeme_strong_password` |
| `DB_NAME` | PostgreSQL database name | `finpal` |
| `SECRET_KEY` | Flask session encryption key (random string) | `a4f8e2...long-random-string` |
| `JWT_SECRET_KEY` | JWT token signing key (random string) | `b7c9d1...long-random-string` |

| `SQLALCHEMY_DATABASE_URI` | Full PostgreSQL connection string. Set this *or* the `DB_*` variables above | `postgresql://finpal:pass@db:5432/finpal` |
| `ENCRYPTION_KEY` | Fernet key encrypting stored API keys and tokens. Derived from `SECRET_KEY` if unset, which is weaker — set a dedicated key in production | generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

> Generate secrets with: `openssl rand -hex 32`, or run `./scripts/setup-env.sh` to write a
> complete `.env` with generated values.
>
> **The app refuses to start on the `change_me_*` placeholders from `.env.example`** — they are
> published in this repository, so anyone could forge sessions and tokens signed with them.

---

## Optional - Application Behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_ENV` | `production` | Set to `development` for debug toolbar |
| `DEBUG` | `False` | Enable Flask debug mode |
| `DEVELOPMENT_MODE` | `True` | Development flag (disable in prod) |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `DISABLE_SIGNUPS` | `False` | Set `True` to block new user registrations |
| `DEFAULT_CURRENCY` | `USD` | Default currency for new users |
| `HTTP_PORT` | `8085` | External port Nginx listens on |
| `JWT_ACCESS_TOKEN_EXPIRES` | `86400` | Token expiry in seconds (24h) |

---

## Optional - Email (password reset, notifications)

Leave blank to disable email features. Only needed if you want password reset emails.

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_ENABLED` | `false` | Master switch for email sending |
| `MAIL_SERVER` | `smtp.gmail.com` | SMTP server hostname |
| `MAIL_PORT` | `587` | SMTP port |
| `MAIL_USE_TLS` | `True` | Use TLS |
| `MAIL_USE_SSL` | `False` | Use SSL (don't enable both TLS and SSL) |
| `MAIL_USERNAME` | _(none)_ | SMTP login username |
| `MAIL_PASSWORD` | _(none)_ | SMTP login password / app password |
| `MAIL_DEFAULT_SENDER` | Falls back to `MAIL_USERNAME` | From address on outgoing mail |

---

## Optional - Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMPLEFIN_ENABLED` | `true` (prod compose) / `false` (local) | Enable SimpleFin bank account sync |
| `INVESTMENT_TRACKING_ENABLED` | `true` | Enable investment portfolio tracking |
| `FMP_API_KEY` | _(none)_ | Financial Modeling Prep API key (for stock data) |
| `POINTSPAL_ENABLED` | `false` | Enable the pointsPal card-rewards module |
| `POINTSPAL_SYNC_INTERVAL_HOURS` | `1` | How often to auto-sync the pointsPal card database |

---

## Optional - Demo Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_MODE` | `False` | Enable demo mode (sandboxed sessions) |
| `DEMO_TIMEOUT_MINUTES` | `10` | Minutes before a demo session expires |
| `MAX_CONCURRENT_DEMO_SESSIONS` | `10` | Max simultaneous demo users |

---

## Optional - OIDC / SSO

Only set these if you use an identity provider (Authelia, Keycloak, etc.).

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ENABLED` | `false` | Master switch for OIDC |
| `OIDC_CLIENT_ID` | _(none)_ | OAuth2 client ID |
| `GOOGLE_CLIENT_ID` | _(none)_ | Google OAuth client ID. Enables native Google sign-in via `POST /api/v1/auth/oidc` and makes the button appear in the mobile app |
| `OIDC_CLIENT_SECRET` | _(none)_ | OAuth2 client secret |
| `OIDC_ISSUER` | _(none)_ | Issuer URL (e.g. `https://auth.example.com`) |
| `OIDC_DISCOVERY_URL` | Auto from issuer | `.well-known/openid-configuration` URL |
| `OIDC_PROVIDER_NAME` | `SSO` | Button label on login page (e.g. `Google`) |
| `OIDC_LOGOUT_URI` | Auto from discovery | Logout endpoint override |
| `APP_URL` | `http://localhost:5006` | Your app's public URL (for OIDC redirect) |
| `LOCAL_LOGIN_DISABLE` | `False` | Hide local login form when OIDC is active |

**Mobile OIDC:** The mobile app opens `/login/oidc?mobile=1` in an in-app browser. When authentication completes the backend redirects to `finpal://oidc/callback?access_token=...&refresh_token=...` instead of creating a Flask-Login session.

---

## Optional - Apple Sign In (Mobile)

Only needed if you want Apple Sign In on the iOS app. Requires an Apple Developer account.

| Variable | Default | Description |
|----------|---------|-------------|
| `APPLE_SIGNIN_ENABLED` | `False` | Enable Apple Sign In on the mobile app |
| `APPLE_CLIENT_ID` | _(none)_ | Apple bundle ID — must match `app.json` (e.g. `io.palstack.finpal`) |

> **Note:** `APPLE_CLIENT_ID` is used as the JWT `audience` when verifying Apple identity tokens. It must exactly match the bundle identifier in `mobile/app.json`.

---

## Backups

The backup service runs nightly and keeps dumps locally unless a remote bucket is configured.

| Variable | Description | Example |
|----------|-------------|---------|
| `BACKUP_SCHEDULE` | Cron expression for backup runs | `0 3 * * *` (nightly, 3 AM) |
| `BACKUP_RETENTION_DAYS` | Days of local dumps to keep | `14` |
| `BACKUP_REMOTE_BUCKET` | Remote bucket name — leave blank for local-only | `finpal-backups` |
| `RCLONE_CONFIG_REMOTE_TYPE` | `b2` (Backblaze B2) or `s3` (R2 / S3-compatible) | `b2` |
| `BACKUP_HEALTHCHECK_URL` | Pinged after each successful backup (healthchecks.io etc.) | `https://hc-ping.com/<uuid>` |

---

## CSV folder import

finPal can watch a folder and import statements dropped into it. See the
[CSV import guide](csv-import.md) for the whole flow.

| Variable | Description | Example |
|----------|-------------|---------|
| `CSV_IMPORT_ROOT` | Root that watched folders must sit inside — anything outside is **rejected**. This is a confinement boundary, not a convenience | `/data/inbox` |
| `CSV_IMPORT_MAX_BYTES` | Largest CSV accepted; bigger files are quarantined, not imported | `10485760` (10 MB) |
| `RUN_SCHEDULER` | Must be `true` in **exactly one** process, or folder scanning does not run at all | `true` |

---

## Rate limiting

| Variable | Description | Example |
|----------|-------------|---------|
| `RATELIMIT_STORAGE_URI` | Where login/register rate-limit counters live. **The default is per-worker**, so with `--workers=3` a "10 per minute" limit is really ~30/min. Set a shared store to enforce it exactly (needs the `redis` package) | `redis://redis:6379/0` |

---

## Portainer Quick-Copy: Production Stack

```env
# === REQUIRED ===
DB_USER=finpal
DB_PASSWORD=CHANGE_ME
DB_NAME=finpal
SECRET_KEY=CHANGE_ME
JWT_SECRET_KEY=CHANGE_ME

# === APP SETTINGS ===
FLASK_ENV=production
DEVELOPMENT_MODE=False
DISABLE_SIGNUPS=False
LOG_LEVEL=INFO
DEFAULT_CURRENCY=USD
HTTP_PORT=8085

# === FEATURES ===
SIMPLEFIN_ENABLED=true
INVESTMENT_TRACKING_ENABLED=true
DEMO_MODE=False

# === EMAIL (optional, remove if not needed) ===
# EMAIL_ENABLED=true
# MAIL_SERVER=smtp.gmail.com
# MAIL_PORT=587
# MAIL_USE_TLS=True
# MAIL_USERNAME=you@gmail.com
# MAIL_PASSWORD=your_app_password
# MAIL_DEFAULT_SENDER=you@gmail.com

# === OIDC (optional, remove if not needed) ===
# OIDC_ENABLED=false
# OIDC_CLIENT_ID=
# OIDC_CLIENT_SECRET=
# OIDC_ISSUER=
# OIDC_PROVIDER_NAME=Google
# APP_URL=https://finpal.yourdomain.com

# === APPLE SIGN IN (optional, iOS mobile only) ===
# APPLE_SIGNIN_ENABLED=False
# APPLE_CLIENT_ID=io.palstack.finpal
```

---

## Portainer Quick-Copy: Demo Stack

```env
# === REQUIRED ===
DB_USER=finpal
DB_PASSWORD=demo_password
DB_NAME=finpal
SECRET_KEY=demo-secret-key
JWT_SECRET_KEY=demo-jwt-secret

# === APP SETTINGS ===
FLASK_ENV=production
DEVELOPMENT_MODE=False
DISABLE_SIGNUPS=False
LOG_LEVEL=INFO
DEFAULT_CURRENCY=USD
HTTP_PORT=8086

# === DEMO MODE ===
DEMO_MODE=True
DEMO_TIMEOUT_MINUTES=10
MAX_CONCURRENT_DEMO_SESSIONS=10

# === FEATURES ===
SIMPLEFIN_ENABLED=false
INVESTMENT_TRACKING_ENABLED=true
```

---

## What changes between Prod and Demo?

| Variable | Production | Demo |
|----------|-----------|------|
| `SECRET_KEY` | Strong random value | Can be simpler |
| `JWT_SECRET_KEY` | Strong random value | Can be simpler |
| `DB_PASSWORD` | Strong password | Simple is fine |
| `DEMO_MODE` | `False` | `True` |
| `DEMO_TIMEOUT_MINUTES` | _(not set)_ | `10` |
| `MAX_CONCURRENT_DEMO_SESSIONS` | _(not set)_ | `10` |
| `SIMPLEFIN_ENABLED` | `true` | `false` |
| `HTTP_PORT` | `8085` | `8086` (or different) |
| `DISABLE_SIGNUPS` | Your choice | `False` (let demo users in) |
| Email vars | Configured | Not needed |
| OIDC vars | If using SSO | Not needed |

Everything else stays the same between the two stacks.
