"""
CLI commands for database management and utilities
"""

import click
from flask.cli import with_appcontext
from src.extensions import db
from src.models.user import User
from src.models.currency import Currency
from src.data.seed_demo_data import seed_demo_users, delete_demo_users, DEMO_USERS

def register_commands(app):
    """Register all CLI commands with the app"""
    
    @app.cli.command('init-db')
    @with_appcontext
    def init_db_command():
        """Initialize the database"""
        db.drop_all()
        db.create_all()
        
        # Create default currencies
        create_default_currencies()
        
        # Create dev user in development mode
        if app.config.get('DEVELOPMENT_MODE'):
            dev_email = app.config.get('DEV_USER_EMAIL', 'dev@example.com')
            dev_password = app.config.get('DEV_USER_PASSWORD', 'dev')
            
            dev_user = User(
                id=dev_email,
                name='Developer',
                is_admin=True
            )
            dev_user.set_password(dev_password)
            db.session.add(dev_user)
            db.session.commit()
            
            click.echo(f'Development user created: {dev_email}')
        
        click.echo('Database initialized successfully!')
    
    @app.cli.command('reset-db')
    @with_appcontext
    def reset_db_command():
        """Reset the database (drop and recreate)"""
        if click.confirm('This will delete all data. Are you sure?'):
            db.drop_all()
            db.create_all()
            create_default_currencies()
            click.echo('Database reset successfully!')
        else:
            click.echo('Database reset cancelled.')
    
    @app.cli.command('create-admin')
    @click.argument('email')
    @click.argument('password')
    @click.option('--name', default='Admin', help='Admin user name')
    @click.option('--send-email', is_flag=True, help='Send welcome email to the admin')
    @with_appcontext
    def create_admin_command(email, password, name, send_email):
        """Create an admin user"""
        user = User.query.filter_by(id=email).first()
        if user:
            click.echo(f'User {email} already exists!')
            return

        user = User(
            id=email,
            name=name,
            is_admin=True,
            email_verified=True  # Admins are auto-verified
        )
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        click.echo(f'Admin user created: {email}')

        # Send welcome email if requested
        if send_email:
            try:
                from src.services.email_service import EmailService
                email_service = EmailService(app.config)
                base_url = app.config.get('FRONTEND_URL', 'http://localhost')
                login_link = f"{base_url}/login"

                success = email_service.send_welcome_email(
                    to_email=email,
                    user_name=name,
                    login_link=login_link
                )

                if success:
                    click.echo(f'Welcome email sent to {email}')
                else:
                    click.echo('Failed to send welcome email')
            except Exception as e:
                click.echo(f'Error sending welcome email: {str(e)}')

    @app.cli.command('seed-demo')
    @with_appcontext
    def seed_demo_command():
        """Create 3 demo users with mock data (Alice, Bob, Carol)"""
        click.echo('Creating demo users with mock data...')
        result = seed_demo_users()

        if result['success']:
            click.echo(f'\n✅ Successfully created {result["count"]} demo users!\n')
            click.echo('Demo Account Credentials:')
            click.echo('=' * 70)
            for cred in result['credentials']:
                click.echo(f'\n{cred["name"]} - {cred["description"]}')
                click.echo(f'  Email:    {cred["email"]}')
                click.echo(f'  Password: {cred["password"]}')
            click.echo('\n' + '=' * 70)
            click.echo('\nEach account includes:')
            click.echo('  • 100+ default categories and subcategories')
            click.echo('  • 100+ auto-categorization rules')
            click.echo('  • 20+ realistic transactions (Jan-Feb 2025)')
            click.echo('  • 3 bank accounts (checking, savings, credit)')
            click.echo('  • Budget allocations')
            click.echo('\nLogin at http://localhost/ to test!')
        else:
            click.echo(f'\n❌ Failed to create demo data: {result["error"]}')

    @app.cli.command('delete-demo')
    @with_appcontext
    def delete_demo_command():
        """Delete all demo users and their data"""
        demo_emails = ', '.join([user['email'] for user in DEMO_USERS])
        if click.confirm(f'Delete demo users ({demo_emails}) and all their data?'):
            result = delete_demo_users()
            if result['success']:
                click.echo(f'✅ Deleted {result["deleted_count"]} demo users')
            else:
                click.echo(f'❌ Failed to delete: {result["error"]}')
        else:
            click.echo('Cancelled.')

    @app.cli.command('fresh-install')
    @click.option('--force', is_flag=True, help='Skip confirmation prompt')
    @with_appcontext
    def fresh_install_command(force):
        """Complete fresh install: reset DB + seed demo data"""
        click.echo('🚀 Starting fresh installation...\n')

        if not force and not click.confirm('This will DELETE ALL DATA and create a fresh database. Continue?'):
            click.echo('Cancelled.')
            return

        # Step 1: Drop and recreate database
        click.echo('\n[1/3] Resetting database...')
        db.drop_all()
        db.create_all()
        create_default_currencies()
        click.echo('✅ Database reset complete')

        # Step 2: Seed demo users
        click.echo('\n[2/3] Creating demo users with mock data...')
        result = seed_demo_users()

        if not result['success']:
            click.echo(f'❌ Failed to create demo data: {result["error"]}')
            return

        click.echo(f'✅ Created {result["count"]} demo users')

        # Step 3: Show credentials
        click.echo('\n[3/3] Fresh installation complete! 🎉\n')
        click.echo('=' * 70)
        click.echo('DEMO ACCOUNT CREDENTIALS')
        click.echo('=' * 70)
        for cred in result['credentials']:
            click.echo(f'\n📧 {cred["name"]}')
            click.echo(f'   Profile: {cred["description"]}')
            click.echo(f'   Email:    {cred["email"]}')
            click.echo(f'   Password: {cred["password"]}')
        click.echo('\n' + '=' * 70)
        click.echo('\n✨ What\'s included in each demo account:')
        click.echo('   • 18 main categories with 100+ subcategories')
        click.echo('   • 100+ smart auto-categorization rules')
        click.echo('   • 20+ realistic mock transactions')
        click.echo('   • 3 bank accounts with balances')
        click.echo('   • Budget allocations')
        click.echo('   • All transactions auto-categorized by rules!')
        click.echo('\n🌐 Login at: http://localhost/')
        click.echo('   (Make sure Docker containers are running)\n')


def create_default_currencies():
    """Create default currencies in the database"""
    default_currencies = [
        # Base currency
        {'code': 'USD', 'name': 'US Dollar', 'symbol': '$', 'rate_to_base': 1.0, 'is_base': True},

        # Major currencies
        {'code': 'EUR', 'name': 'Euro', 'symbol': '€', 'rate_to_base': 1.1},
        {'code': 'GBP', 'name': 'British Pound', 'symbol': '£', 'rate_to_base': 1.25},
        {'code': 'JPY', 'name': 'Japanese Yen', 'symbol': '¥', 'rate_to_base': 0.0091},
        {'code': 'CAD', 'name': 'Canadian Dollar', 'symbol': 'C$', 'rate_to_base': 0.74},
        {'code': 'AUD', 'name': 'Australian Dollar', 'symbol': 'A$', 'rate_to_base': 0.65},
        {'code': 'CHF', 'name': 'Swiss Franc', 'symbol': 'CHF', 'rate_to_base': 1.12},

        # Asian currencies
        {'code': 'CNY', 'name': 'Chinese Yuan', 'symbol': '¥', 'rate_to_base': 0.14},
        {'code': 'INR', 'name': 'Indian Rupee', 'symbol': '₹', 'rate_to_base': 0.012},
        {'code': 'KRW', 'name': 'South Korean Won', 'symbol': '₩', 'rate_to_base': 0.00075},
        {'code': 'SGD', 'name': 'Singapore Dollar', 'symbol': 'S$', 'rate_to_base': 0.74},
        {'code': 'HKD', 'name': 'Hong Kong Dollar', 'symbol': 'HK$', 'rate_to_base': 0.13},

        # Latin American currencies
        {'code': 'MXN', 'name': 'Mexican Peso', 'symbol': 'Mex$', 'rate_to_base': 0.05},
        {'code': 'BRL', 'name': 'Brazilian Real', 'symbol': 'R$', 'rate_to_base': 0.20},

        # Middle Eastern currencies
        {'code': 'AED', 'name': 'UAE Dirham', 'symbol': 'د.إ', 'rate_to_base': 0.27},
        {'code': 'SAR', 'name': 'Saudi Riyal', 'symbol': 'ر.س', 'rate_to_base': 0.27},

        # Other major economies
        {'code': 'NZD', 'name': 'New Zealand Dollar', 'symbol': 'NZ$', 'rate_to_base': 0.61},
        {'code': 'ZAR', 'name': 'South African Rand', 'symbol': 'R', 'rate_to_base': 0.055},
        {'code': 'SEK', 'name': 'Swedish Krona', 'symbol': 'kr', 'rate_to_base': 0.095},
        {'code': 'NOK', 'name': 'Norwegian Krone', 'symbol': 'kr', 'rate_to_base': 0.093},
        {'code': 'DKK', 'name': 'Danish Krone', 'symbol': 'kr', 'rate_to_base': 0.15},
        {'code': 'PLN', 'name': 'Polish Zloty', 'symbol': 'zł', 'rate_to_base': 0.25},
    ]

    for curr_data in default_currencies:
        existing = Currency.query.filter_by(code=curr_data['code']).first()
        if not existing:
            currency = Currency(**curr_data)
            db.session.add(currency)

    db.session.commit()
