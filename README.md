# FinPal Backend

The backend API service for FinPal - a modern, privacy-first financial management platform.

## Overview

This is the Flask-based backend for FinPal, providing a RESTful API for expense tracking, budgeting, bill splitting, and portfolio management. The architecture follows a modular service-based design for scalability and maintainability.

## Architecture

```
backend/
├── app.py                 # Application entry point
├── src/
│   ├── __init__.py        # Application factory
│   ├── config.py          # Configuration management
│   ├── extensions.py      # Flask extensions
│   ├── cli.py             # CLI commands
│   ├── models/            # Database models
│   │   ├── user.py
│   │   ├── transaction.py
│   │   ├── account.py
│   │   ├── category.py
│   │   ├── budget.py
│   │   ├── group.py
│   │   ├── investment.py
│   │   └── ...
│   ├── services/          # Business logic services
│   │   ├── auth/
│   │   ├── transaction/
│   │   ├── account/
│   │   ├── budget/
│   │   ├── currency/
│   │   └── ...
│   └── utils/             # Utility functions
├── integrations/          # External service integrations
│   ├── simplefin/         # Bank account sync
│   ├── oidc/              # OpenID Connect auth
│   ├── investments/       # Stock price APIs
│   └── recurring/         # Recurring transaction detection
├── migrations/            # Database migrations (Alembic)
├── tests/                 # Test suite
└── scripts/               # Utility scripts
```

## Technology Stack

- **Framework**: Flask 3.x
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Migrations**: Flask-Migrate (Alembic)
- **Authentication**: Flask-Login + JWT + OIDC
- **Task Queue**: Background jobs for syncing and notifications
- **API**: RESTful JSON API

## Development Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 14+
- pip or pipenv

### Local Development

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. Initialize the database:
   ```bash
   flask db upgrade
   ```

5. Run the development server:
   ```bash
   flask run --debug
   ```

The API will be available at `http://localhost:5001`.

### Docker Development

```bash
docker-compose -f docker-compose.dev.yml up
```

## Database Management

### Run migrations:
```bash
flask db upgrade
```

### Create a new migration:
```bash
flask db migrate -m "Description of changes"
```

### Reset database (development only):
```bash
python scripts/reset.py
```

## Configuration

Key environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `SECRET_KEY` | Flask secret key | - |
| `JWT_SECRET_KEY` | JWT signing key | - |
| `DEFAULT_CURRENCY` | Default currency code | `USD` |
| `INVESTMENT_TRACKING_ENABLED` | Enable portfolio features | `false` |
| `OIDC_ENABLED` | Enable OIDC authentication | `false` |

See `.env.example` for all available options.

## API Endpoints

The backend exposes RESTful APIs for:

- `/api/auth/*` - Authentication (login, register, OIDC)
- `/api/transactions/*` - Transaction management
- `/api/accounts/*` - Account management
- `/api/budgets/*` - Budget tracking
- `/api/categories/*` - Category management
- `/api/groups/*` - Group expense splitting
- `/api/investments/*` - Portfolio management
- `/api/currency/*` - Currency conversion

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src

# Run specific test file
pytest tests/test_transactions.py
```

## Scripts

Utility scripts in the `scripts/` directory:

- `reset.py` - Reset database to initial state
- `init_db.py` - Initialize database with seed data
- `update_currencies.py` - Update currency exchange rates

## License

GNU Affero General Public License v3.0 - See [license.txt](license.txt) for details.
