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

> Generate secrets with: `openssl rand -hex 32`

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
| `OIDC_CLIENT_SECRET` | _(none)_ | OAuth2 client secret |
| `OIDC_ISSUER` | _(none)_ | Issuer URL (e.g. `https://auth.example.com`) |
| `OIDC_DISCOVERY_URL` | Auto from issuer | `.well-known/openid-configuration` URL |
| `OIDC_PROVIDER_NAME` | `SSO` | Button label on login page |
| `OIDC_LOGOUT_URI` | Auto from discovery | Logout endpoint override |
| `APP_URL` | `http://localhost:5006` | Your app's public URL (for OIDC redirect) |
| `LOCAL_LOGIN_DISABLE` | `False` | Hide local login form when OIDC is active |

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
# APP_URL=https://finpal.yourdomain.com
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
