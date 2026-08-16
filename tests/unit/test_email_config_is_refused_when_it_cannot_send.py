"""
An install that says email is on must not boot pointed at a dev mail catcher.

*** WHY THIS GUARD EXISTS — D-118. *** The deployed stack ran for its whole life with
`EMAIL_ENABLED=true` and no `SMTP_*` variables at all, because `finpal.yml` configured
the `MAIL_*` namespace that `flask_mail` reads while `src/services/email_service.py` —
the thing that actually sends **verification and password-reset** mail — reads `SMTP_*`.
With those unset it fell back to its own defaults, `localhost:1025`, which is MailHog's
port. Nothing was listening. Every send failed with `[Errno 111] Connection refused`,
and the only place that surfaced was a log line.

The user-visible shape is the quiet one: a password reset that silently never arrives.
The person waiting for it cannot tell it from a slow mail server, and the operator sees
a healthy container.

That was fixed by configuration, and configuration is exactly what regresses without a
guard — which is why this test exists rather than only a corrected compose file. It is
D-97's placeholder-secret refusal one namespace over: fail loudly at boot rather than
swallow every outbound message.

*** DELIBERATELY NOT REFUSED: `EMAIL_ENABLED=false`. *** A self-hoster who does not want
email must be able to boot with nothing configured at all. The guard only fires when the
operator has *claimed* email works.
"""

import pytest

from src.config import email_config_error


class TestTheGuardFires:
    """Cases where the operator said email is on and it demonstrably cannot send."""

    def test_localhost_is_refused(self):
        """The exact D-118 state: EMAIL_ENABLED=true and the MailHog fallback."""
        err = email_config_error({'EMAIL_ENABLED': 'true'})
        assert err, 'the defaulted localhost:1025 config booted without complaint'
        assert 'SMTP_HOST' in err
        assert '1025' in err or 'localhost' in err

    def test_an_explicitly_written_mailhog_is_refused_too(self):
        """
        Spelling the dev catcher out must fail the same way defaulting into it does.

        *** THIS TEST ORIGINALLY ASSERTED THAT `localhost:587` SHOULD BE REFUSED, AND IT
        CONTRADICTED `test_a_local_relay_on_a_normal_smtp_port_is_allowed` DIRECTLY. ***
        The guard was right and the test was wrong: a real MTA on loopback is a normal
        self-hosted setup, so refusing all of loopback would block working installs to
        prevent a broken one. What is refusable is the **MailHog port specifically**.
        Kept as a note because the contradiction was between two of my own assertions,
        and only the guard's own reasoning settled which one to believe.
        """
        err = email_config_error({'EMAIL_ENABLED': 'true', 'SMTP_HOST': 'localhost',
                                  'SMTP_PORT': '1025', 'SMTP_USER': 'a@b.c',
                                  'SMTP_PASSWORD': 'x'})
        assert err, 'an explicitly configured MailHog relay was accepted'

    def test_127_0_0_1_is_refused(self):
        """Spelling it as an IP is the same mistake; a guard keyed to one spelling goes blind."""
        err = email_config_error({'EMAIL_ENABLED': 'true', 'SMTP_HOST': '127.0.0.1'})
        assert err, '127.0.0.1 slipped past a guard that only knows the word localhost'

    def test_a_real_host_with_no_password_is_refused(self):
        """
        The other half of D-118: `MAIL_USERNAME`/`MAIL_PASSWORD` were empty strings, so
        even the path that had a real relay could not authenticate.
        """
        err = email_config_error({'EMAIL_ENABLED': 'true',
                                  'SMTP_HOST': 'witcher.mxrouting.net',
                                  'SMTP_PORT': '587', 'SMTP_USER': 'support@palstack.io',
                                  'SMTP_PASSWORD': ''})
        assert err, 'a relay with empty credentials was accepted'
        assert 'SMTP_PASSWORD' in err

    def test_implicit_tls_port_without_ssl_support_is_refused(self):
        """
        *** THE TRAP THAT COST THIS SESSION THE MOST TIME. *** `email_service.send_email`
        only ever constructs `smtplib.SMTP` — plain, or STARTTLS when `SMTP_USE_TLS` is
        set — and **never `smtplib.SMTP_SSL`. So port 465, implicit TLS, cannot work**,
        and it is precisely the port a reader copies from the `MAIL_*` block sitting
        directly above it in the same file. It fails as a hang or a timeout, which reads
        as a network problem rather than a config error.
        """
        err = email_config_error({'EMAIL_ENABLED': 'true', 'SMTP_HOST': 'smtp.example.com',
                                  'SMTP_PORT': '465', 'SMTP_USER': 'a@b.c',
                                  'SMTP_PASSWORD': 'x', 'SMTP_USE_TLS': 'true'})
        assert err, 'port 465 was accepted by code that cannot speak implicit TLS'
        assert '465' in err


class TestTheGuardStaysQuiet:
    """Cases that must keep booting. A guard that blocks a valid install is worse."""

    def test_email_disabled_needs_no_configuration_at_all(self):
        assert email_config_error({'EMAIL_ENABLED': 'false'}) is None
        assert email_config_error({}) is None, 'an unset EMAIL_ENABLED must default to off'

    def test_the_configuration_this_session_deployed_is_accepted(self):
        """Exactly what now runs on the core stack."""
        assert email_config_error({
            'EMAIL_ENABLED': 'true',
            'SMTP_HOST': 'witcher.mxrouting.net',
            'SMTP_PORT': '587',
            'SMTP_USER': 'support@palstack.io',
            'SMTP_PASSWORD': 'a-real-secret',
            'SMTP_USE_TLS': 'true',
        }) is None

    def test_a_local_relay_on_a_normal_smtp_port_is_allowed(self):
        """
        A self-hoster running a real MTA on the same box is a legitimate setup. The
        refusal is about **1025**, MailHog's port, not about loopback in general —
        otherwise this guard would block a working install to prevent a broken one.
        """
        assert email_config_error({
            'EMAIL_ENABLED': 'true', 'SMTP_HOST': 'localhost', 'SMTP_PORT': '25',
            'SMTP_USER': 'finpal', 'SMTP_PASSWORD': 'x',
        }) is None

    def test_a_relay_that_needs_no_auth_is_allowed(self):
        """An internal relay keyed on IP takes no credentials; empty user means empty pass."""
        assert email_config_error({
            'EMAIL_ENABLED': 'true', 'SMTP_HOST': 'internal-relay.lan',
            'SMTP_PORT': '25', 'SMTP_USER': '', 'SMTP_PASSWORD': '',
        }) is None
