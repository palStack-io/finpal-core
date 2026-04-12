# Contributing to finPal

> ## ⚠️ Public Contributions Paused
>
> We have temporarily paused public contributions while we assess how to responsibly handle pull requests that contain significant AI-generated code.
>
> **Why?** Like many teams, we actively use AI tools in our own development workflow. However, with only 2 active PR reviewers, we need to carefully think through how we evaluate AI-assisted contributions at scale — ensuring code quality, security, and long-term maintainability without creating unsustainable review burden.
>
> We're working on updated guidelines that reflect a world where AI is part of the dev process on both sides of a PR. We'll reopen public contributions once those are in place.
>
> In the meantime, feel free to open issues to report bugs or suggest features. Watch this repo for updates.

---

## Development Setup
1. Clone the repo: `git clone https://github.com/palStack-io/finpal-core.git`
2. Copy environment: `cp .env.template .env`
3. Start with Docker: `docker compose -f docker-compose.local.yml up -d`
4. Access at: `http://localhost:8085`

## Database Updates
After pulling updates, run:
```bash
flask db migrate
flask db upgrade
```

## Running Tests
See **[docs/testing.md](./testing.md)** for the full test guide.

Quick start:
```bash
# Backend
source venv/bin/activate && pip install -r requirements-test.txt
pytest

# Frontend
cd web-ui && npx vitest run
```

## Pull Request Requirements
- All PRs require approval from **2 palStack developers**
- Review process typically takes **24-48 hours**
- Include clear description of changes
- Ensure all tests pass and documentation is updated
- Follow existing code patterns and style

## License
By contributing, you agree that your contributions will be licensed under AGPL-3.0.

For detailed contribution guidelines, visit [palstack.io/finpal/docs](https://palstack.io/finpal/docs)
