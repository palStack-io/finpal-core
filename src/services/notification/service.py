"""Notification Service - Email notifications and alerts"""
from flask import current_app
from flask_mail import Message
from src.extensions import mail
from src.models.user import User

class NotificationService:
    def __init__(self):
        pass

    def send_email(self, to, subject, html_body):
        """Send email notification"""
        try:
            msg = Message(subject=subject, recipients=[to], html=html_body)
            mail.send(msg)
            return True, 'Email sent successfully'
        except Exception as e:
            current_app.logger.error(f"Email error: {str(e)}")
            return False, f'Error: {str(e)}'

    def send_budget_alert(self, user_id, budget):
        """Send budget overspend alert"""
        user = User.query.get(user_id)
        if not user:
            return False, 'User not found'

        subject = f"Budget Alert: {budget.name}"
        html_body = f"""
        <h2>Budget Alert</h2>
        <p>Your budget for {budget.name} has exceeded its limit.</p>
        <p>Budget: ${budget.amount}</p>
        <p>Spent: ${budget.calculate_spent_amount()}</p>
        """
        return self.send_email(user.id, subject, html_body)

    def send_monthly_report(self, user_id, year=None, month=None):
        """Send monthly expense report with real stats"""
        from datetime import datetime
        from calendar import monthrange
        from src.models.transaction import Expense
        from src.services.email_service import email_service

        user = User.query.get(user_id)
        if not user:
            return False, 'User not found'

        today = datetime.utcnow()
        if year is None:
            year = today.year
        if month is None:
            month = today.month

        start_date = datetime(year, month, 1)
        last_day = monthrange(year, month)[1]
        end_date = datetime(year, month, last_day, 23, 59, 59)

        expenses = Expense.query.filter(
            Expense.user_id == user_id,
            Expense.date >= start_date,
            Expense.date <= end_date,
        ).all()

        total_expenses = sum(e.amount for e in expenses if e.transaction_type != 'income')
        total_income = sum(e.amount for e in expenses if e.transaction_type == 'income')
        savings_rate = round((1 - total_expenses / total_income) * 100, 1) if total_income > 0 else 0

        # Top category by spend
        from collections import defaultdict
        category_totals = defaultdict(float)
        for e in expenses:
            if e.transaction_type != 'income' and e.category_id:
                category_totals[e.category_id] += e.amount
        top_category_id = max(category_totals, key=category_totals.get) if category_totals else None
        top_category_name = None
        if top_category_id:
            from src.models.category import Category
            cat = Category.query.get(top_category_id)
            top_category_name = cat.name if cat else None

        report_data = {
            'month': start_date.strftime('%B %Y'),
            'total_expenses': round(total_expenses, 2),
            'total_income': round(total_income, 2),
            'savings_rate': savings_rate,
            'transaction_count': len(expenses),
            'top_category': top_category_name,
        }

        app_url = current_app.config.get('APP_URL', 'http://localhost:3000')
        report_link = f"{app_url}/dashboard"

        return email_service.send_monthly_report_email(
            to_email=user.id,
            user_name=user.name or user.id,
            report_data=report_data,
            report_link=report_link,
        )
