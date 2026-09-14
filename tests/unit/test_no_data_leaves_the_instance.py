"""finPal's data-boundary promise, as a gate rather than a slogan.

*** THE CLAIM THE PRODUCT MAKES TO USERS: "what you tell finPal about your
money stays on the server you run it on, and is only ever used to answer your
own requests." *** (Owner requirement, 2026-09-14.)

A promise like that is worth nothing as copy alone: the copy is written once and
the code changes every week. So this file pins the two halves that CAN be
checked mechanically, and `docs/DATA_BOUNDARIES.md` states the parts that
cannot.

*** HALF ONE: EVERY OUTBOUND HOST IS DECLARED, WITH WHAT IT IS SENT. *** A new
`https://…` anywhere under `api/`, `src/` or `integrations/` fails this test
until somebody adds it below with a reason. The allowlist is therefore also the
inventory — the doc is written FROM it, not beside it, so the two cannot drift.

*** HALF TWO: NO TELEMETRY, NO ANALYTICS, NO MODEL. *** Nothing here reports
usage to palStack or to anyone else, and nothing about a user's money is sent to
an LLM. Measured 2026-09-14: zero occurrences of any such SDK in the backend,
web-ui or mobile. That is the strongest true sentence in the whole claim, and
this is what keeps it true.

*** WHAT THIS GUARD CANNOT SEE, STATED SO NOBODY READS IT AS MORE THAN IT IS.
*** A dependency that calls home with no URL literal in OUR source is invisible
to the host sweep. `yfinance` is exactly that case — it talks to Yahoo's
endpoints from inside the library — so it is declared in the allowlist anyway,
keyed on the library name rather than a host. A future dependency of the same
shape would slip past the sweep and be caught only by reading it. The denylist
in half two is the part that generalises.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TREES = ('api', 'src', 'integrations')

# host (or `lib:name`) -> what leaves the instance, and on whose initiative.
ALLOWED = {
    'localhost': (
        'Never an outbound call — dev defaults and docstring examples only.'),
    'bridge.simplefin.org': (
        'ONLY if the user connects a bank. Their SimpleFin access token goes '
        'out; their transactions come back. The bank relationship is between '
        'the user and SimpleFin — finPal never sees a bank credential.'),
    'beta-bridge.simplefin.org': (
        'The old default for the same flow, kept in a comment recording that it '
        'now 404s. Overridable by SIMPLEFIN_SETUP_TOKEN_URL.'),
    'api.frankfurter.app': (
        'Currency rates. Sends a CURRENCY CODE and nothing else — the request '
        'is `?from=USD`. No amount, no account, no user.'),
    'financialmodelingprep.com': (
        'Investment prices, only if the Investments feature is used. Sends the '
        'TICKER SYMBOL. Not the quantity, not the value, not who holds it.'),
    'lib:yfinance': (
        'Same job as the line above, through a library rather than a URL of '
        'ours, so the host sweep cannot see it. Sends the ticker symbol.'),
    'raw.githubusercontent.com': (
        "pointsPal's public card-programme catalogue. A DOWNLOAD: nothing "
        'about the user is sent. Overridable by POINTSPAL_PROGRAMS_URL.'),
    'github.com': (
        'Source and licence links in docstrings and error messages.'),
    'accounts.google.com': (
        'OIDC discovery and token verification, ONLY for a user who chooses '
        '"sign in with Google". The server is the OAuth client, so identity '
        'goes to the provider the user picked and nothing else does.'),
    'appleid.apple.com': (
        'The same, for Apple.'),
}

# Anything whose whole purpose is to send data somewhere we do not control.
FORBIDDEN_DEPS = (
    'sentry', 'sentry-sdk', 'posthog', 'mixpanel', 'segment', 'analytics-python',
    'amplitude', 'datadog', 'newrelic', 'bugsnag', 'rollbar', 'logrocket',
    'openai', 'anthropic', 'google-generativeai', 'cohere', 'replicate',
)

URL = re.compile(r'https?://([A-Za-z0-9._%-]+)')


def _source_files():
    for tree in TREES:
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, tree)):
            dirnames[:] = [d for d in dirnames if d != '__pycache__']
            for name in filenames:
                if name.endswith('.py'):
                    yield os.path.join(dirpath, name)


def test_the_sweep_reads_the_backend_at_all():
    """A guard that reads no files passes for the wrong reason."""
    files = list(_source_files())
    assert len(files) > 100, f'only found {len(files)} source files'


def test_every_outbound_host_is_declared():
    found = {}
    for path in _source_files():
        with open(path, encoding='utf-8') as fh:
            for lineno, line in enumerate(fh, 1):
                for host in URL.findall(line):
                    host = host.rstrip('.')
                    if host.replace('.', '').isdigit() or host.endswith('example.com'):
                        continue
                    if host in ('www.w3.org', 'www.gnu.org', 'schemas.xmlsoap.org'):
                        continue  # XML namespaces and licence text, not requests
                    found.setdefault(host, []).append(
                        f'{os.path.relpath(path, ROOT)}:{lineno}')

    undeclared = {h: sites for h, sites in found.items() if h not in ALLOWED}
    assert not undeclared, (
        'Undeclared outbound host(s). finPal tells users their financial data '
        'never leaves the server they run it on, so a new host is a change to '
        'that promise and has to be declared in ALLOWED with WHAT IT IS SENT '
        '(and added to docs/DATA_BOUNDARIES.md):\n'
        + '\n'.join(f'  {h} — {", ".join(s)}' for h, s in sorted(undeclared.items()))
    )


def test_nothing_reports_usage_anywhere():
    """No analytics, no crash reporter, no model. The requirements file first."""
    with open(os.path.join(ROOT, 'requirements.txt'), encoding='utf-8') as fh:
        requirements = fh.read().lower()
    hits = [d for d in FORBIDDEN_DEPS
            if re.search(rf'^\s*{re.escape(d)}\b', requirements, re.M)]
    assert not hits, (
        f'requirements.txt pulls in {hits}. finPal ships no telemetry and sends '
        'nothing about a user to a model; both are load-bearing claims in '
        'docs/DATA_BOUNDARIES.md and in onboarding.'
    )


def test_nothing_imports_a_telemetry_or_model_sdk():
    """And the source, because a dependency can arrive transitively."""
    offenders = []
    pattern = re.compile(
        r'^\s*(?:import|from)\s+('
        + '|'.join(re.escape(d.replace('-', '_')) for d in FORBIDDEN_DEPS)
        + r')\b', re.M)
    for path in _source_files():
        with open(path, encoding='utf-8') as fh:
            hit = pattern.search(fh.read())
        if hit:
            offenders.append(f'{os.path.relpath(path, ROOT)} imports {hit.group(1)}')
    assert not offenders, '\n'.join(offenders)
