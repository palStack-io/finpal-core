"""Email service for sending transactional emails"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST', 'localhost')
        self.smtp_port = int(os.getenv('SMTP_PORT', '1025'))  # MailHog default
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.smtp_use_tls = os.getenv('SMTP_USE_TLS', 'false').lower() == 'true'
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@dollardollar.app')
        self.from_name = os.getenv('FROM_NAME', 'DollarDollar')
        self.enabled = os.getenv('EMAIL_ENABLED', 'false').lower() == 'true'

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None
    ) -> bool:
        """Send an email"""
        if not self.enabled:
            logger.info(f"Email disabled. Would send to {to_email}: {subject}")
            logger.debug(f"Email body:\n{html_body}")
            return True

        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            # Add text version if provided
            if text_body:
                part1 = MIMEText(text_body, 'plain')
                msg.attach(part1)

            # Add HTML version
            part2 = MIMEText(html_body, 'html')
            msg.attach(part2)

            # Send email
            if self.smtp_use_tls:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)
                server.starttls()
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)

            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)

            server.send_message(msg)
            server.quit()

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def send_group_invite(
        self,
        to_email: str,
        inviter_name: str,
        group_name: str,
        group_id: int,
        invite_link: str
    ) -> bool:
        """Send group invitation email"""
        subject = f"{inviter_name} invited you to join {group_name}"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">👥</span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                You're Invited!
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                <strong style="color: #86efac;">{inviter_name}</strong> has invited you to join the group <strong style="color: #86efac;">"{group_name}"</strong> on DollarDollar.
                            </p>
                            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                                DollarDollar makes it easy to track shared expenses, split bills, and manage group finances. Join now to start collaborating!
                            </p>

                            <!-- Features -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    📊 Track shared expenses
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    💸 Split bills automatically
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    ✅ Settle up with ease
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{invite_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Accept Invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #64748b; font-size: 13px; margin: 24px 0 0; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{invite_link}" style="color: #3b82f6; word-break: break-all;">{invite_link}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                This invitation was sent to {to_email}<br>
                                If you don't want to join this group, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Footer branding -->
                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2025 DollarDollar. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_body = f"""
You're Invited!

{inviter_name} has invited you to join the group "{group_name}" on DollarDollar.

DollarDollar makes it easy to track shared expenses, split bills, and manage group finances.

What you can do:
- Track shared expenses
- Split bills automatically
- Settle up with ease

Accept your invitation here:
{invite_link}

This invitation was sent to {to_email}
If you don't want to join this group, you can safely ignore this email.

© 2025 DollarDollar. All rights reserved.
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_welcome_email(
        self,
        to_email: str,
        user_name: str,
        login_link: str
    ) -> bool:
        """Send welcome email to new user"""
        subject = f"Welcome to DollarDollar, {user_name}!"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">💰</span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Welcome to DollarDollar!
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                Hi <strong style="color: #86efac;">{user_name}</strong>,
                            </p>
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                                Thank you for signing up! We're excited to help you take control of your finances.
                            </p>

                            <!-- Features -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <h3 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px;">
                                    Here's what you can do:
                                </h3>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    📊 Track your income and expenses
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    💳 Manage multiple accounts
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    🎯 Set and monitor budgets
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    👥 Split expenses with groups
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    📈 View detailed analytics
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{login_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Get Started
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                Need help getting started? Check out our <a href="#" style="color: #3b82f6;">guides</a> or <a href="#" style="color: #3b82f6;">contact support</a>.
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2025 DollarDollar. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_body = f"""
Welcome to DollarDollar!

Hi {user_name},

Thank you for signing up! We're excited to help you take control of your finances.

Here's what you can do:
- Track your income and expenses
- Manage multiple accounts
- Set and monitor budgets
- Split expenses with groups
- View detailed analytics

Get started: {login_link}

Need help? Check out our guides or contact support.

© 2025 DollarDollar. All rights reserved.
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_verification_email(
        self,
        to_email: str,
        user_name: str,
        verification_link: str
    ) -> bool:
        """Send email verification email"""
        subject = "Verify Your Email Address"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">✉️</span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Verify Your Email
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                Hi <strong style="color: #86efac;">{user_name}</strong>,
                            </p>
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                                Thanks for signing up for DollarDollar! Please verify your email address to get started.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 0 0 24px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{verification_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #64748b; font-size: 13px; margin: 0 0 16px; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{verification_link}" style="color: #3b82f6; word-break: break-all;">{verification_link}</a>
                            </p>

                            <!-- Info Box -->
                            <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; padding: 16px; margin: 24px 0;">
                                <p style="color: #3b82f6; font-size: 14px; font-weight: 600; margin: 0 0 8px;">
                                    ℹ️ Why verify?
                                </p>
                                <p style="color: #e2e8f0; font-size: 13px; margin: 0; line-height: 1.5;">
                                    Verifying your email helps us keep your account secure and ensures you receive important notifications.
                                </p>
                            </div>

                            <p style="color: #64748b; font-size: 13px; margin: 24px 0 0; text-align: center; line-height: 1.5;">
                                This link will expire in 24 hours. If you didn't sign up for DollarDollar, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                Having trouble? <a href="#" style="color: #3b82f6;">Contact support</a>
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2025 DollarDollar. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_body = f"""
Verify Your Email Address

Hi {user_name},

Thanks for signing up for DollarDollar! Please verify your email address to get started.

Verify your email: {verification_link}

ℹ️ Why verify?
Verifying your email helps us keep your account secure and ensures you receive important notifications.

This link will expire in 24 hours. If you didn't sign up for DollarDollar, you can safely ignore this email.

Having trouble? Contact support.

© 2025 DollarDollar. All rights reserved.
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_password_reset_email(
        self,
        to_email: str,
        user_name: str,
        reset_link: str,
        expires_in: str = "1 hour"
    ) -> bool:
        """Send password reset email"""
        subject = "Reset Your DollarDollar Password"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">🔐</span>
                            </div>
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Password Reset Request
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                Hi <strong style="color: #86efac;">{user_name}</strong>,
                            </p>
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                                We received a request to reset your password for your DollarDollar account.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 0 0 24px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{reset_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #64748b; font-size: 13px; margin: 0 0 16px; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{reset_link}" style="color: #3b82f6; word-break: break-all;">{reset_link}</a>
                            </p>

                            <!-- Security Notice -->
                            <div style="background: rgba(251, 191, 36, 0.1); border-left: 3px solid #fbbf24; padding: 16px; margin: 24px 0;">
                                <p style="color: #fbbf24; font-size: 14px; font-weight: 600; margin: 0 0 8px;">
                                    ⚠️ Security Notice
                                </p>
                                <p style="color: #e2e8f0; font-size: 13px; margin: 0; line-height: 1.5;">
                                    This link will expire in <strong>{expires_in}</strong>. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                For security reasons, we never send your password via email.
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2025 DollarDollar. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_body = f"""
Password Reset Request

Hi {user_name},

We received a request to reset your password for your DollarDollar account.

Reset your password: {reset_link}

⚠️ Security Notice
This link will expire in {expires_in}. If you didn't request a password reset, please ignore this email or contact support if you have concerns.

For security reasons, we never send your password via email.

© 2025 DollarDollar. All rights reserved.
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_monthly_report_email(
        self,
        to_email: str,
        user_name: str,
        report_data: dict,
        report_link: str
    ) -> bool:
        """Send monthly financial report email"""
        subject = f"Your Monthly Financial Report - {report_data.get('month', 'This Month')}"

        total_income = report_data.get('total_income', 0)
        total_expenses = report_data.get('total_expenses', 0)
        net_balance = total_income - total_expenses
        top_category = report_data.get('top_category', {})
        savings_rate = report_data.get('savings_rate', 0)

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">📊</span>
                            </div>
                            <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Monthly Report
                            </h1>
                            <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                                {report_data.get('month', 'This Month')}
                            </p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                                Hi <strong style="color: #86efac;">{user_name}</strong>, here's your financial summary:
                            </p>

                            <!-- Stats Grid -->
                            <table role="presentation" style="width: 100%; margin: 0 0 24px;">
                                <tr>
                                    <td style="width: 50%; padding-right: 8px;">
                                        <div style="background: rgba(134, 239, 172, 0.1); border: 1px solid rgba(134, 239, 172, 0.2); border-radius: 12px; padding: 16px;">
                                            <p style="color: #86efac; font-size: 12px; font-weight: 600; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                Income
                                            </p>
                                            <p style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0;">
                                                ${total_income:,.2f}
                                            </p>
                                        </div>
                                    </td>
                                    <td style="width: 50%; padding-left: 8px;">
                                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 16px;">
                                            <p style="color: #fca5a5; font-size: 12px; font-weight: 600; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                Expenses
                                            </p>
                                            <p style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0;">
                                                ${total_expenses:,.2f}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Net Balance -->
                            <div style="background: {'rgba(134, 239, 172, 0.1)' if net_balance >= 0 else 'rgba(239, 68, 68, 0.1)'}; border: 1px solid {'rgba(134, 239, 172, 0.2)' if net_balance >= 0 else 'rgba(239, 68, 68, 0.2)'}; border-radius: 12px; padding: 20px; margin: 0 0 24px; text-align: center;">
                                <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px;">
                                    Net Balance
                                </p>
                                <p style="color: {'#86efac' if net_balance >= 0 else '#fca5a5'}; font-size: 32px; font-weight: 700; margin: 0;">
                                    ${net_balance:,.2f}
                                </p>
                            </div>

                            <!-- Insights -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <h3 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px;">
                                    Key Insights
                                </h3>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    💰 Savings Rate: <strong style="color: #86efac;">{savings_rate:.1f}%</strong>
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    📌 Top Spending: <strong style="color: #86efac;">{top_category.get('name', 'N/A')}</strong> (${top_category.get('amount', 0):,.2f})
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{report_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            View Full Report
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                Want to change your report preferences? Visit <a href="#" style="color: #3b82f6;">Settings</a>
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #475569; font-size: 12px; margin: 0;">
                                © 2025 DollarDollar. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

        text_body = f"""
Monthly Financial Report - {report_data.get('month', 'This Month')}

Hi {user_name}, here's your financial summary:

Income: ${total_income:,.2f}
Expenses: ${total_expenses:,.2f}
Net Balance: ${net_balance:,.2f}

Key Insights:
- Savings Rate: {savings_rate:.1f}%
- Top Spending: {top_category.get('name', 'N/A')} (${top_category.get('amount', 0):,.2f})

View full report: {report_link}

Want to change your report preferences? Visit Settings.

© 2025 DollarDollar. All rights reserved.
"""

        return self.send_email(to_email, subject, html_body, text_body)


# Global instance
email_service = EmailService()
