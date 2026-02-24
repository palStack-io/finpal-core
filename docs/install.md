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
```bash
# Clone the repository
git clone https://github.com/palStack-io/finpal-core.git
cd finpal-core

# Copy environment template
cp .env.template .env

# Edit .env file with your configurations
nano .env

# Build and run the application
docker compose -f docker-compose.local.yml up --build
```

#### Detailed Configuration

1. **Environment Variables**
   - `SECRET_KEY`: Generate a random, secure string
   - `DEVELOPMENT_MODE`: Set to `False` for production
   - `DISABLE_SIGNUPS`: Control user registration
   - Configure email settings if needed

2. **Access the Application**
   - Open http://localhost:8085 in your web browser
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
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up --build
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
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up --build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

AGPL-3.0 - See [LICENSE](../LICENSE) file for details.

For comprehensive documentation, visit [finpal.palstack.io/docs](https://finpal.palstack.io/docs)
