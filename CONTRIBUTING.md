# Contributing to finPal Core

finPal Core is the open-source, self-hostable edition of finPal: a Python/Flask
REST API plus a React/TypeScript web UI, packaged with Docker.

## Getting set up

```bash
# Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-test.txt
flask db upgrade
flask run

# Frontend
cd web-ui
npm install
npm run dev
```

## Running the tests

```bash
python -m pytest                 # whole suite
python -m pytest tests/unit      # just the fast ones
```

CI runs the suite on **Python 3.8 and 3.12** (`.github/workflows/tests.yml`). 3.8
is not an accident — the production image is built on `ubuntu:20.04`, whose
`python3` is 3.8.10. If you use a 3.9+ only feature, CI will tell you.

For the web UI:

```bash
cd web-ui
npm run build          # vite only — this does NOT typecheck
npm run build:check    # tsc -b && vite build
```

`npm run build` is bare `vite build`, and esbuild strips types without checking
them. Use `build:check` if you want type errors. Note it currently reports a
number of pre-existing errors; the bar for a change is "adds none," not "zero."

## Project layout

```
api/v1/          Flask-RESTX route handlers, one file per domain
src/
  config.py      App config, read from .env
  extensions.py  Flask extensions (db, jwt, mail, limiter, scheduler)
  models/        SQLAlchemy models
  repositories/  SQLAlchemy queries
  services/      Business logic
  utils/         Helpers
  modules/       Optional modules (pointsPal)
  tasks/         APScheduler background tasks
migrations/      Alembic
web-ui/          React 19 + Vite + TypeScript
integrations/    SimpleFin, OIDC, investments, recurring detection
tests/           pytest
nginx/           Reverse proxy image
```

## Backend conventions

- Route handlers live in `api/v1/`, one file per domain.
- **Business logic belongs in `src/services/`, not in route handlers.**
- Models live in `src/models/` and are exported via `src/models/__init__.py`.
- Call `db.session.commit()` in services, not in route handlers.
- Validation: marshmallow schemas in `src/services/<domain>/schemas.py`. Validate
  before touching the database.
- SQLAlchemy queries belong in `src/repositories/<model>.py`. This is established
  for `Account`; apply it to other models **when you are already touching them**,
  and don't undertake a proactive rollout.

### Do not

- **Do not use `traceback.print_exc()`.** Use `logger.exception(msg)`.
- **Do not return `str(e)` to a client.** Log the exception and return a
  sanitized message. Exception text carries table names, DSNs and hostnames. The
  one deliberate exception is documented inline where it occurs.
- **Do not import one model file from another model file.** Model files may
  import only from `src.extensions` (for `db`) and `src.models.associations`.
  Use string-based relationships (`relationship('User', ...)`) instead — the
  model graph will otherwise develop circular imports.
- **Do not commit `.env`.** Only `.env.example` belongs in version control.
- Do not add inline styles with hardcoded hex colours — use the CSS variables.

## Frontend conventions

- Styling is mixed. Most components use inline `style={{}}` with CSS variables;
  a few (`QuickAddModal`, `Toast`, `common/Button`) use Tailwind. Match the file
  you are editing.
- CSS variables live in `web-ui/src/styles/finpal-theme.css`. `:root` is the
  light theme, `[data-theme="dark"]` holds the dark overrides. Theme is toggled
  by a `data-theme` attribute on `<html>`, managed by `ThemeContext.tsx`.
- Semantic colours (green `#22c55e`, red `#ef4444`, blue `#3b82f6`, amber
  `#f59e0b`) are intentionally **not** variablised — they read correctly on both
  themes.
- `color: 'white'` on a coloured button is intentional. Do not replace it with
  `var(--text-primary)`.
- The axios instance is `web-ui/src/services/api.ts`. Its `baseURL` is `''`
  (relative, through nginx), so service methods write the full path:
  `api.get('/api/v1/...')`.
- `@tanstack/react-query` is in `package.json` but **not wired up** — there is no
  `QueryClientProvider`. Components use `useState`/`useEffect` with the toast
  context. Calling `useQuery` would throw at runtime.

## Two traps worth knowing

**`finpal_core` is its own git repository.** If you are working in a checkout that
also contains the outer `finPal` repo, committing there does *not* change what
ships — the Docker image is built from `finpal_core`. A security fix was once
committed to the outer repo only and the vulnerability shipped for weeks. Check
`git rev-parse --show-toplevel` before you commit.

**Duplicate route registration.** `src/__init__.py` registers five older
blueprints before the flask-restx API, and they claim identical URLs. Werkzeug
resolves duplicates to whichever registered first, so `/api/v1/auth/login` and
friends are served by `src/services/auth/api_routes.py`, not `api/v1/auth.py`.
If you fix something in `api/v1/`, confirm your change is actually reachable:

```python
app.url_map.bind('localhost').match('/api/v1/auth/login', method='POST')
```

## Pull requests

- Write a test that fails without your change. For a bug, reproduce it first.
- Keep the commit message about *why*, not just *what*.
- Run `python -m pytest` before pushing; CI runs it on two Python versions.
- Migrations: generate with `flask db migrate`, then **check the generated
  `down_revision`** and remove any unrelated autogenerated operations. Note that
  `create_all()` runs at app startup, so autogenerate cannot see brand-new
  *tables* — only column and index changes. New tables need hand-written
  `create_table` blocks.
- Never log CSV contents or transaction data. Filenames, hashes and row counts
  only. This is financial data.

## Licence

finPal Core is AGPL-3.0. By contributing you agree your work is licensed under
the same terms. See [`LICENSE`](LICENSE).
