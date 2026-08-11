# Architecture

What runs where, and why. See [install.md](install.md) for getting it running.

## Architecture

Built with a microservices architecture:

```
nginx (reverse proxy)
├── backend (Flask/Python)    # RESTful API, business logic
│   ├── Authentication        # JWT, OIDC, user management
│   ├── Transactions          # Expense tracking, categorization
│   ├── Budgets               # Budget management, alerts
│   ├── Accounts              # Multi-account support
│   ├── Groups                # Bill splitting, settlements
│   ├── Investments           # Portfolio tracking
│   ├── Modules               # pointsPal, and future plug-ins
│   └── Integrations          # SimpleFin, Yahoo Finance
├── postgres                  # PostgreSQL database
├── web-ui (React)            # Dashboard interface
└── backup                    # Nightly pg_dumpall → local + optional remote (rclone)
```

**Tech Stack:**
- **Backend**: Python 3.11+ / Flask 2.2
- **Frontend**: React 19 + TypeScript 5.9 + Vite 7
- **Mobile**: React Native 0.74 + Expo SDK 51 (in development)
- **Database**: PostgreSQL 15
- **ORM**: SQLAlchemy 1.4 + Alembic migrations
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts 3
- **State**: Zustand 5 + TanStack React Query 5
- **Reverse Proxy**: nginx
- **Bank Sync**: SimpleFin API
- **Investments**: Yahoo Finance API
- **Multi-arch**: AMD64 + ARM64 Docker images

---

## System Requirements

**Minimum:**
- 2GB RAM
- 10GB disk space
- Docker & Docker Compose
- (Optional) SMTP for email notifications

**Recommended:**
- 4GB RAM for better performance
- 20GB disk space (includes historical data)
- Home server, NAS, or VPS
- Reverse proxy with SSL (Nginx, Caddy, Traefik)

---

