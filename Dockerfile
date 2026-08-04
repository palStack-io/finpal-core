# finPal backend image.
#
# Two stages. The builder owns the compiler and produces /venv; the runtime image
# copies that venv and installs nothing but curl. Previously this was a single
# ubuntu:20.04 stage that apt-installed Python — 145 packages and 444 MB of
# additional disk — and shipped build-essential, python3-dev, libpq-dev,
# libssl-dev, libxml2-dev and libxslt1-dev into production, where none of them are
# used at runtime.
#
# Nothing here needs libpq or libxml: psycopg2-binary bundles libpq, and no
# dependency uses lxml. curl is required because the compose healthcheck is
# `curl -f http://localhost:5001/health`.

# ---------------------------------------------------------------- builder ----
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

# Retry transient mirror failures instead of failing the build. A single
# "Connection failed [IP: 91.189.91.82 80]" from archive.ubuntu.com used to kill
# a whole release, because no layer was cached and every build refetched ~103 MB.
RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' \
      > /etc/apt/apt.conf.d/99-retries

# A safety net only: every current dependency has a cp312 wheel, so nothing is
# expected to compile. It lives here so that if one ever does, the toolchain
# still does not reach the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Copied alone, before the source, so editing application code does not
# invalidate the dependency layer.
COPY requirements.txt ./
RUN pip install --upgrade pip \
 && pip install -r requirements.txt

# ---------------------------------------------------------------- runtime ----
FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' \
      > /etc/apt/apt.conf.d/99-retries

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /venv /venv

ENV PATH="/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=app.py

# Dropped from the previous image, deliberately:
#
#   OPENSSL_CONF=/etc/ssl/openssl-legacy.cnf, OPENSSL_LEGACY_PROVIDER,
#   OPENSSL_ENABLE_MD5_VERIFY — the legacy provider is an OpenSSL 3 concept and
#   the old base shipped OpenSSL 1.1.1, so these never took effect. Passwords are
#   hashed with pbkdf2:sha256 and the only other digest is a non-security md5,
#   both of which live in OpenSSL 3's default provider.
#
#   NODE_OPTIONS=--openssl-legacy-provider — there is no Node in this image.
#
#   pip install scrypt — installed into the *system* interpreter while the app
#   runs from /venv, and nothing in the codebase imports scrypt.
#
#   pip install gunicorn==20.1.0 — this silently downgraded the gunicorn==23.0.0
#   pinned in requirements.txt, so production ran a 2021 release that the
#   requirements file claimed nothing about. gunicorn now comes from
#   requirements.txt alone.
#
#   The generated ssl_fix.py, prepended to app.py, which set
#   ssl._create_default_https_context = ssl._create_unverified_context. That
#   disabled TLS certificate verification for every stdlib HTTPS client in the
#   process — including PyJWT's PyJWKClient, which fetches OIDC signing keys over
#   urllib. Verification is on again.

WORKDIR /app
COPY . .

EXPOSE 5001

# RUN_SCHEDULER is deliberately NOT set here. Deployed stacks inherit this CMD and
# some have no separate scheduler service, so disabling the scheduler at the image
# level would stop every cron job in production. It is set per-service in
# docker-compose.yml instead, which fails open: an un-updated stack keeps running
# jobs.
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers=3", "--timeout=120", "app:app"]
