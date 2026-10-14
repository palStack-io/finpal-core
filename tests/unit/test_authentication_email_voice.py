"""Capture real template output without allowing SMTP delivery."""
import re
import pytest
from src.services.email_service import EmailService


@pytest.mark.parametrize("kind", ["verify", "reset"])
def test_authentication_mail_keeps_name_action_and_expiry_without_emoji(kind):
    service = EmailService.__new__(EmailService)
    captured = []

    def capture(to, subject, html, text, **kwargs):
        captured.append((to, subject, html, text))
        return True

    service.send_email = capture
    url = f"https://example.test/{kind}?token=synthetic"
    if kind == "verify":
        assert service.send_verification_email("recipient@example.test", "Ann", url)
    else:
        assert service.send_password_reset_email("recipient@example.test", "Ann", url, "30 minutes")
    assert len(captured) == 1
    recipient, subject, html, text = captured[0]
    visible = re.sub("<[^>]+>", " ", html)
    assert recipient == "recipient@example.test"
    for body in (visible, text):
        assert "Ann" in body
        assert url in body
        assert ("24 hours" if kind == "verify" else "30 minutes") in body
        assert ("finish setting up" if kind == "verify" else "Your password will stay the same.") in body
        assert not any(char in body for char in ("✉", "🔐", "ℹ", "⚠"))
    assert subject == ("Verify your email address" if kind == "verify" else "Reset your finPal password")


@pytest.mark.parametrize("kind", ["welcome", "group", "household"])
def test_invitation_and_welcome_give_named_next_step_without_emoji(kind):
    service = EmailService.__new__(EmailService)
    captured = []

    def capture(to, subject, html, text, **kwargs):
        if hasattr(service, "_with_signoff"):
            html, text = service._with_signoff(html, text, kwargs.get("signoff", "plain"))
        captured.append((subject, html, text))
        return True

    service.send_email = capture
    url = "https://example.test/invitation?token=synthetic"
    if kind == "welcome":
        service.send_welcome_email("recipient@example.test", "Ann", url)
    elif kind == "group":
        service.send_group_invite("recipient@example.test", "Ann", "Flat", 42, url)
    else:
        service.send_invite_email("recipient@example.test", "Ann", url)
    assert len(captured) == 1
    subject, html, text = captured[0]
    assert url in html and url in text
    for body in (re.sub("<[^>]+>", " ", html), text):
        assert "Ann" in body
        assert ("Sign in" if kind == "welcome" else "invitation") in body
        if kind == "group":
            assert "Flat" in body
        assert not any(char in body for char in ("👥", "💰", "📊", "💳", "🎯", "📈", "💸", "✅", "🏠", "🐾"))


@pytest.mark.parametrize("guessed,errors", [(True, 0), (False, 2), (True, 2)])
def test_import_review_names_the_problem_and_next_step(guessed, errors):
    service = EmailService.__new__(EmailService)
    captured = []
    service.send_email = lambda to, subject, html, text, **kw: captured.append((html, text)) or True
    service.send_import_review_email("recipient@example.test", "Ann", "bank.csv", 3, errors, guessed, "https://example.test/review")
    html, text = captured[0]
    for body in (re.sub("<[^>]+>", " ", html), text):
        assert "Ann" in body and "bank.csv" in body
        assert "before relying on this import" in body
        assert "Other transactions in your account are not affected." in body
        assert ("The columns were guessed." in body) == guessed
        assert ("Review these rows to see what needs correcting." in body) == bool(errors)
    assert "https://example.test/review" in html and "https://example.test/review" in text
