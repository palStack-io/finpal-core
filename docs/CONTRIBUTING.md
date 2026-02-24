# Contributing to finPal

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

## Pull Request Requirements
- All PRs require approval from **2 palStack developers**
- Review process typically takes **24-48 hours**
- Include clear description of changes
- Ensure all tests pass and documentation is updated
- Follow existing code patterns and style

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.

For detailed contribution guidelines, visit [finpal.palstack.io/docs](https://finpal.palstack.io/docs)
