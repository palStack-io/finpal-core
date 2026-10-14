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
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@finpal.app')
        self.from_name = os.getenv('FROM_NAME', 'finPal')
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
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0E1711;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16241A 0%, #0E1711 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Your finPal invitation
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                <strong style="color: #86efac;">{inviter_name}</strong> has invited you to join the group <strong style="color: #86efac;">"{group_name}"</strong> on finPal.
                            </p>
                            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                                Open your invitation to join the group and see its shared expenses.
                            </p>

                            <!-- Features -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Track shared expenses
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Split bills automatically
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    Settle shared balances
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{invite_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Open invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #9CB3A3; font-size: 13px; margin: 24px 0 0; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{invite_link}" style="color: #22c55e; word-break: break-all;">{invite_link}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #9CB3A3; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
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
                            <p style="color: #7E9488; font-size: 12px; margin: 0;">
                                © 2026 finPal
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
Your finPal invitation

{inviter_name} has invited you to join the group "{group_name}" on finPal.

Open your invitation to join the group and see its shared expenses.

What you can do:
- Track shared expenses
- Split bills automatically
- Settle shared balances

Accept your invitation here:
{invite_link}

This invitation was sent to {to_email}
If you don't want to join this group, you can safely ignore this email.

© 2026 finPal
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_welcome_email(
        self,
        to_email: str,
        user_name: str,
        login_link: str
    ) -> bool:
        """Send welcome email to new user"""
        subject = f"Welcome to finPal, {user_name}"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0E1711;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16241A 0%, #0E1711 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Welcome to finPal
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
                                Thanks for joining finPal. Sign in when you're ready to start with your accounts.
                            </p>

                            <!-- Features -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <h3 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px;">
                                    Here's what you can do:
                                </h3>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Track your income and expenses
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Manage multiple accounts
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Set and monitor budgets
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Split expenses with groups
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    View detailed analytics
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{login_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Sign in
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #9CB3A3; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                Start with one account. You can add the others when you're ready.
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #7E9488; font-size: 12px; margin: 0;">
                                © 2026 finPal
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
Welcome to finPal

Hi {user_name},

Thanks for joining finPal. Sign in when you're ready to start with your accounts.

Here's what you can do:
- Track your income and expenses
- Manage multiple accounts
- Set and monitor budgets
- Split expenses with groups
- View detailed analytics

Sign in: {login_link}

Start with one account. You can add the others when you're ready.

© 2026 finPal
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_verification_email(
        self,
        to_email: str,
        user_name: str,
        verification_link: str
    ) -> bool:
        """Send email verification email"""
        subject = "Verify your email address"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0E1711;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16241A 0%, #0E1711 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Verify your email address
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
                                Verify your email address to finish setting up your finPal account.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 0 0 24px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{verification_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Verify your email address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #9CB3A3; font-size: 13px; margin: 0 0 16px; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{verification_link}" style="color: #22c55e; word-break: break-all;">{verification_link}</a>
                            </p>

                            <!-- Info Box -->
                            <div style="background: rgba(34, 197, 94, 0.1); border-left: 3px solid #22c55e; padding: 16px; margin: 24px 0;">
                                <p style="color: #22c55e; font-size: 14px; font-weight: 600; margin: 0 0 8px;">
                                    Why verify?
                                </p>
                                <p style="color: #e2e8f0; font-size: 13px; margin: 0; line-height: 1.5;">
                                    This confirms that this email address belongs to you.
                                </p>
                            </div>

                            <p style="color: #9CB3A3; font-size: 13px; margin: 24px 0 0; text-align: center; line-height: 1.5;">
                                This link expires in 24 hours. If you didn't sign up for finPal, you can ignore this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #9CB3A3; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                If the button doesn't open, copy the link into your browser.
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #7E9488; font-size: 12px; margin: 0;">
                                © 2026 finPal
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
Verify your email address

Hi {user_name},

Verify your email address to finish setting up your finPal account.

Verify your email: {verification_link}

Why verify?
This confirms that this email address belongs to you.

This link expires in 24 hours. If you didn't sign up for finPal, you can ignore this email.

If the button doesn't open, copy the link into your browser.

© 2026 finPal
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
        subject = "Reset your finPal password"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0E1711;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16241A 0%, #0E1711 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Reset your finPal password
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
                                You can choose a new password for your finPal account using the link below.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 0 0 24px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{reset_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Reset your finPal password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #9CB3A3; font-size: 13px; margin: 0 0 16px; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{reset_link}" style="color: #22c55e; word-break: break-all;">{reset_link}</a>
                            </p>

                            <!-- Security Notice -->
                            <div style="background: rgba(251, 191, 36, 0.1); border-left: 3px solid #fbbf24; padding: 16px; margin: 24px 0;">
                                <p style="color: #fbbf24; font-size: 14px; font-weight: 600; margin: 0 0 8px;">
                                    About this link
                                </p>
                                <p style="color: #e2e8f0; font-size: 13px; margin: 0; line-height: 1.5;">
                                    This link expires in <strong>{expires_in}</strong>. If you didn't request a reset, you can ignore this email. Your password will stay the same.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #9CB3A3; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                finPal never sends your password by email.
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #7E9488; font-size: 12px; margin: 0;">
                                © 2026 finPal
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
Reset your finPal password

Hi {user_name},

You can choose a new password for your finPal account using the link below.

Reset your password: {reset_link}

About this link
This link expires in {expires_in}. If you didn't request a reset, you can ignore this email. Your password will stay the same.

finPal never sends your password by email.

© 2026 finPal
"""

        return self.send_email(to_email, subject, html_body, text_body)

    def send_import_review_email(
        self,
        to_email: str,
        user_name: str,
        filename: str,
        imported: int,
        errors: int,
        guessed_mapping: bool,
        review_link: str,
    ) -> bool:
        """Tell the user an automatic import needs their eyes.

        **Only sent when the batch actually needs review** — a guessed mapping or
        failed rows. A clean auto-import sends nothing, deliberately: the owner's
        decision was that one mail per batch is noise, and a notification that
        arrives whether or not anything is wrong trains people to ignore it. The
        caller decides via `batch_needs_review`; this method only renders.

        The two reasons are named separately in the body because they need
        different actions from the reader — a guessed mapping means "check the
        columns landed in the right fields", while failed rows mean "some data did
        not arrive at all".

        *** THIS TEMPLATE IS A BARE FRAGMENT AND ITS COLOURS FOLLOW DIFFERENT RULES.
        There is no <html>, no <body> and no surface of its own, so it renders on
        whatever background the mail client supplies — in practice white. The other six
        templates paint their own dark card, and their muted text is #9CB3A3 (7.22:1 on
        that card, 2.24:1 on white). A sweep that set the muted colour across the whole
        file therefore made THIS one unreadable, which is why the value here is #56685D:
        5.94:1 on white, and the same --kt-soft the light theme uses. Caught by
        test_email_templates_are_on_brand.py, which measures each template against the
        surface it actually has rather than assuming one background for the file. ***

        It also carries no brand colour at all, deliberately left alone: giving it the
        header, badge and card the others have is a redesign, not a colour fix.
        """
        reasons = []
        if guessed_mapping:
            reasons.append(
                '<li><strong>The columns were guessed.</strong> Check that the '
                'date, description and amount landed in the right fields.</li>')
        if errors:
            reasons.append(
                f'<li><strong>{errors} row(s) were not imported.</strong> '
                'Review these rows to see what needs correcting.</li>')

        subject = f"Check your import: {filename}"
        html_body = f"""
        <p>Hi {user_name},</p>
        <p>finPal imported <strong>{filename}</strong> and brought in
           <strong>{imported}</strong> transaction(s). Review the items below before relying on this import.</p>
        <ul>{''.join(reasons)}</ul>
        <p><a href="{review_link}">Review this import</a></p>
        <p>If it looks wrong, you can undo this batch from the review screen. Other transactions in your account are not affected.</p>
        <p style="color:#56685D;font-size:13px">You are getting this because an
           automatic import needed attention. finPal does not email you about
           imports that go through cleanly.</p>
        """
        text_lines = [f"Hi {user_name},", "",
                      f"finPal imported {filename} and brought in {imported} transaction(s). "
                      "Review the items below before relying on this import.", ""]
        if guessed_mapping:
            text_lines.append("- The columns were guessed. Check that the date, description and amount landed in the right fields.")
        if errors:
            text_lines.append(f"- {errors} row(s) were not imported. Review these rows to see what needs correcting.")
        text_lines += ["", f"Review this import: {review_link}", "",
                       "If it looks wrong, you can undo this batch from the review screen. Other transactions in your account are not affected.", "",
                       "finPal does not email you about imports that go through cleanly."]

        return self.send_email(to_email, subject, html_body, "\n".join(text_lines))

    def send_invite_email(
        self,
        to_email: str,
        inviter_name: str,
        invite_link: str
    ) -> bool:
        """Send household invitation email"""
        subject = f"{inviter_name} invited you to join their household on finPal"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0E1711;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16241A 0%, #0E1711 100%); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 0; text-align: center;">
                            <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 700;">
                                Your finPal invitation
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                <strong style="color: #86efac;">{inviter_name}</strong> has invited you to join their household on finPal.
                            </p>
                            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                                Open your invitation to join the household and see its shared finances.
                            </p>

                            <!-- Features -->
                            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 0 0 32px;">
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Shared expense tracking
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px; line-height: 1.6;">
                                    Household budgets
                                </p>
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0; line-height: 1.6;">
                                    Financial insights for everyone
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{invite_link}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #15803d 0%, #166534 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                            Open invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #9CB3A3; font-size: 13px; margin: 24px 0 0; text-align: center;">
                                Or copy and paste this link into your browser:<br>
                                <a href="{invite_link}" style="color: #22c55e; word-break: break-all;">{invite_link}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 40px 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                            <p style="color: #9CB3A3; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                                This invitation was sent to {to_email}<br>
                                If you don't want to join, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Footer branding -->
                <table role="presentation" style="max-width: 600px; margin: 24px auto 0;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="color: #7E9488; font-size: 12px; margin: 0;">
                                &copy; 2026 finPal
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
Your finPal invitation

{inviter_name} has invited you to join their household on finPal.

Open your invitation to join the household and see its shared finances.

What you can do:
- Shared expense tracking
- Household budgets
- Financial insights for everyone

Accept your invitation here:
{invite_link}

This invitation was sent to {to_email}
If you don't want to join, you can safely ignore this email.

(c) 2026 finPal
"""

        return self.send_email(to_email, subject, html_body, text_body)


# Global instance
email_service = EmailService()
