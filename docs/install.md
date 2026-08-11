# Installation and Usage Guide for finPal

## Prerequisites

### System Requirements
- Docker (version 20.10 or later)
- Docker Compose (version 1.29 or later)
- Minimum 2GB RAM
- Web browser (Chrome, Firefox, Safari, or Edge)

### Recommended Hardware
- 4GB RAM
- 10GB disk space
- Internet connection for initial setup

### NOTE: The first user to signup will become the admin

## Installation Methods

### 1. Docker Deployment (Recommended)

#### Quick Start

Three commands. Nothing to build — `docker-compose.yml` pulls prebuilt images.

```bash
git clone https://github.com/palStack-io/finpal-core.git && cd finpal-core
./scripts/setup-env.sh        # writes .env with generated secrets
docker compose up -d
```

Then open **http://localhost**. The first account to sign up becomes the admin.

`docker-compose.yml` is the default filename, so no `-f` flag is needed. Port 80 is the
default; set `HTTP_PORT=8085` in `.env` to serve elsewhere.

`setup-env.sh` generates `SECRET_KEY`, `JWT_SECRET_KEY` and `DB_PASSWORD` for you, and
refuses to overwrite an existing `.env`. If you would rather do it by hand, copy
`.env.example` to `.env` and replace every `change_me_*` value — **the app refuses to start
on the placeholders**, because they are published in this repo and anyone could forge
sessions and tokens signed with them. Everything else in `.env.example` is optional; see
[ENV_REFERENCE.md](ENV_REFERENCE.md).

#### Which compose file?

| File | Use it when |
|---|---|
| `docker-compose.yml` | **Normal self-hosting.** Prebuilt images, Postgres, nginx, backups. This is the one you want. |
| `docker-compose.dev.yml` | You are changing the code and want it built from source (`--build`), on port 8085. |
| `docker-compose.portainer.yml` | You deploy through Portainer's web editor and cannot use an `.env` file. |
| `docker-compose.backup.yml` | You already have finPal running and want to add the backup service on its own. |

#### Detailed Configuration

1. **Environment Variables**
   - `SECRET_KEY`: Generate a random, secure string
   - `DEVELOPMENT_MODE`: Set to `False` for production
   - `DISABLE_SIGNUPS`: Control user registration
   - Configure email settings if needed

2. **Access the Application**
   - Open http://localhost in your web browser (or `HTTP_PORT` if you changed it)
   - First registered user becomes the admin

### 2. Local Development Setup

#### Requirements
- Python 3.9+
- PostgreSQL 13+
- pip
- virtualenv (recommended)

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
flask db upgrade

# Run the application
flask run
```

## Security Considerations

- Use strong, unique passwords
- Enable OIDC/SSO authentication if possible
- Regularly update the application
- Keep your Docker and dependencies updated
- Use a reverse proxy with SSL in production

## Troubleshooting

### Common Issues
- Ensure Docker is running
- Check container logs
- Verify environment variables
- Restart containers

```bash
# View container logs
docker compose logs backend

# Restart services
docker compose down
docker compose up -d
```

## Backup and Restore

### Database Backup
```bash
# Backup PostgreSQL database
docker compose exec db pg_dump -U finpal finpal > backup.sql

# Restore database
docker compose exec -T db psql -U finpal finpal < backup.sql
```

## Upgrade Process

1. Pull latest version
2. Update dependencies
3. Run database migrations
4. Rebuild and restart containers

```bash
git pull origin main
docker compose down
docker compose up -d
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

AGPL-3.0 - See [LICENSE](../LICENSE) file for details.

For comprehensive documentation, visit [finpal.palstack.io/docs](https://finpal.palstack.io/docs)
