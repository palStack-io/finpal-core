"""Lock the field set the four token-readable endpoints emit.

An MCP server will hand these responses to an LLM, possibly a third-party hosted
one. The audit behind this file (ROADMAP: "Audit REST serializers for fields that
must never reach an LLM") found that no bank credential and no `account_number`
is reachable by a read-scoped personal access token today. These are
characterization tests: they do not fix a leak, they stop one from appearing
silently.

Two distinct guards:

  1. DENY — a set of column names that must never appear as response keys. This
     catches the easy mistake: adding `external_id` to AccountSchema, or a
     handler that dumps a model with `__dict__`.

  2. EXACT KEY SETS — the full contract. A DENY list only catches names someone
     thought of in advance; the exact set catches a new sensitive column with a
     name nobody predicted. When you deliberately add a field, update the set
     here and consider whether the MCP redaction layer needs to know about it.

Note that seeding uses a SimpleFin-shaped account name ("Chase Checking ...4242")
on purpose: the last four digits of a real account travel in `Account.name` and
in the `card_used` copied from it, and that IS reachable by a read token. That is
a redaction requirement for the MCP layer, not a bug here, so it is asserted as
present rather than absent — if it ever stops being true the MCP layer can relax.
"""
from datetime import datetime, timedelta

from src.extensions import db
from src.models.account import Account, SimpleFin
from src.models.budget import Budget
from src.models.category import Category
from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken
from src.models.transaction import Expense
from src.models.user import UserApiSettings
from tests.factories import UserFactory

# Column names that identify a real financial account or are a credential.
# Matched against response keys at every depth.
FORBIDDEN_KEYS = {
    'account_number',
    'access_url',
    'simplefin_access_url',
    'access_token',
    'setup_token',
    'refresh_token',
    'fmp_api_key',
    'fmpApiKey',
    'password_hash',
    'oidc_id',
    'verification_token',
    'reset_token',
    'token_hash',
    'external_id',
    'last_four',
    'simplefin_last_four',
    'temp_accounts',
}
# Deliberately NOT forbidden: `import_source` ('csv' | 'simplefin' | 'manual')
# is institution-linkage metadata, not a credential or an identifier, and a
# legitimate "synced from SimpleFin" badge may want it.

ACCOUNT_KEYS = {
    'id', 'name', 'account_type', 'balance', 'currency_code', 'institution',
    'status', 'color', 'user_id', 'current_balance',
    # Added deliberately in item A of the D-18 build, and the redaction question
    # was considered rather than waved through, because this file asks for that.
    #
    # `owner` is `{id, name, color, emoji}` for the household member the account is
    # assigned to. It exists because the transactions page has to show *whose*
    # account each row is, and `user_id` — already in this set, so already reachable
    # by a read token — is an email address rather than something to put on screen.
    #
    # **The increment is a display name, a hex colour and an emoji.** The email was
    # already here, so this does not newly expose an identifier; it does mean a
    # member's *name* now reaches an LLM through the same path. That is PII and not a
    # credential, it is the minimum needed for the label, and it is flagged here as a
    # redaction candidate for the MCP layer rather than being assumed harmless: an
    # MCP client summarising spending needs "whose account", not who they are, so
    # `owner.name` is the field to consider dropping there first.
    #
    # Note this also arrives inside `TRANSACTION_KEYS['account']`, which nests
    # AccountSchema — that nesting is what makes the per-row label possible without
    # a second request.
    'owner',
}
CATEGORY_KEYS = {
    'id', 'name', 'icon', 'color', 'parent_id', 'is_system', 'user_id',
    'subcategories',
}
# Note: TransactionSchema declares `created_at`, but Expense has no such
# column, so marshmallow silently omits it. Declared-but-absent, hence not
# listed here.
TRANSACTION_KEYS = {
    'id', 'description', 'amount', 'date', 'currency_code', 'card_used',
    'split_method', 'split_with', 'paid_by', 'user_id', 'category_id',
    'account_id', 'recurring_id', 'transaction_type', 'notes',
    'category', 'account', 'splits',
    # Added deliberately: `group_id` is accepted on create, so omitting it from
    # the response meant a create reported `group_id: null` for a row it had just
    # filed into a group. Safe to expose — it is an opaque integer, not PII, and
    # `build_transaction` now refuses a group the caller is not a member of, so a
    # value here always names a group the reader already sees in /groups.
    'group_id',
    # Added 2026-08-06 for AUDIT D-54, and reviewed against the redaction layer
    # rather than just appended. `category_splits` is `{category_id: amount}`:
    # opaque integer keys naming categories the reader already sees in
    # `/categories/` — `_validated_category_splits` refuses any category that is
    # not theirs — and float amounts that are a partition of the `amount` already
    # in this same payload. So it exposes **no value the reader could not already
    # compute**, and nothing account-identifying. `has_category_splits` is the
    # boolean the server derives from it. **Nothing for the MCP layer to redact.**
    # The reason for adding them is that they were write-only: the server refused
    # an amount change on a split transaction until the splits were restated, and
    # no client could learn what they were.
    'category_splits', 'has_category_splits',
    # Added with the same reasoning: an account id the caller must already own for
    # the write to have been accepted, so it exposes nothing new, and omitting it
    # made a transfer's response claim the money went nowhere.
    'destination_account_id',
    # The payer's share of a non-equal split. Not PII, and it is the caller's own
    # figure; `AddTransactionForm` reads it back when editing, so omitting it blanked
    # the payer share on every edit of a percentage split.
    'split_value',
}
BUDGET_KEYS = {
    'id', 'name', 'amount', 'period', 'category_id', 'user_id', 'start_date',
    'is_active', 'created_at', 'category', 'rollover', 'rollover_amount',
    'spent', 'remaining', 'percentage',
}


def _walk_keys(node, found=None):
    """Every dict key appearing anywhere in a JSON structure."""
    if found is None:
        found = set()
    if isinstance(node, dict):
        for key, value in node.items():
            found.add(key)
            _walk_keys(value, found)
    elif isinstance(node, list):
        for item in node:
            _walk_keys(item, found)
    return found


def _read_token(user):
    _, plaintext = PersonalAccessToken.generate(
        user_id=user.id, name='mcp-reader', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()
    return plaintext


def _seed_everything():
    """A user whose every sensitive column is populated and recognisable."""
    owner = UserFactory(id='owner@example.com', name='Owner Person')
    owner.oidc_id = 'OIDCSUB-00u1a2b3c4d5'
    owner.oidc_provider = 'authelia'

    # Name shaped the way the SimpleFin bridge supplies it — see
    # integrations/simplefin/client.py process_raw_accounts, and
    # src/modules/pointspal/service.py _extract_last_four, which regexes four
    # digits back out of exactly this.
    account = Account(
        name='Chase Checking ...4242', type='checking',
        institution='JPMorgan Chase Bank, N.A.', user_id=owner.id,
        balance=1234.56, currency_code='USD', import_source='simplefin',
        external_id='ACT-98765432101234', status='active', color='#3b82f6')
    db.session.add(account)

    category = Category(name='Groceries', icon='fa-cart', user_id=owner.id)
    db.session.add(category)
    db.session.flush()

    db.session.add(Expense(
        description='Whole Foods', amount=88.10, date=datetime(2026, 7, 1),
        # Copied from account.name by the SimpleFin and CSV import paths.
        card_used=account.name, split_method='none', paid_by=owner.id,
        user_id=owner.id, currency_code='USD', category_id=category.id,
        account_id=account.id, transaction_type='expense',
        external_id='sf-txn-11223344', import_source='simplefin',
        notes='Groceries for the week'))

    db.session.add(Budget(
        name='Food', amount=500.0, period='monthly', user_id=owner.id,
        category_id=category.id, active=True))

    # The actual bank credentials. Without these rows in the DB the
    # value-level assertion below would pass vacuously.
    db.session.add(SimpleFin(
        user_id=owner.id,
        access_url='https://SFUSER:SFSECRET@bridge.simplefin.org/simplefin'))
    api_settings = UserApiSettings(user_id=owner.id, simplefin_enabled=True)
    api_settings.set_api_key('FMPKEY-abcdef123456')
    api_settings.simplefin_access_url = (
        'https://SFUSER:SFSECRET@bridge.simplefin.org/simplefin')
    db.session.add(api_settings)

    db.session.commit()
    return owner


def _get(client, owner, path):
    resp = client.get(path, headers={'X-API-Key': _read_token(owner)})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    return resp


def test_no_credential_or_account_identifier_key_is_emitted(client, db):
    """The decisive assertion: a read token cannot see a bank credential."""
    owner = _seed_everything()
    for path in ['/api/v1/transactions/', '/api/v1/accounts',
                 '/api/v1/categories/', '/api/v1/budgets/']:
        keys = _walk_keys(_get(client, owner, path).get_json())
        leaked = keys & FORBIDDEN_KEYS
        assert not leaked, '%s emits forbidden key(s): %s' % (path, sorted(leaked))


def test_no_credential_value_appears_in_any_body(client, db):
    """Keys can be renamed; check the values too.

    SFSECRET is the SimpleFin access-URL password and FMPKEY- the Financial
    Modeling Prep API key — the two live bank/market credentials in the schema.
    _seed_everything() persists both, so this assertion is load-bearing.
    """
    owner = _seed_everything()
    secrets = [
        'SFSECRET',              # SimpleFin access_url credential
        'FMPKEY-',               # decrypted FMP API key
        'bridge.simplefin.org',  # the access URL itself
        'ACT-98765432101234',    # Account.external_id
        'sf-txn-11223344',       # Expense.external_id
        'OIDCSUB-',              # User.oidc_id
        'pbkdf2:',               # User.password_hash
    ]
    for path in ['/api/v1/transactions/', '/api/v1/accounts',
                 '/api/v1/categories/', '/api/v1/budgets/']:
        body = _get(client, owner, path).get_data(as_text=True)
        for secret in secrets:
            assert secret not in body, (
                '%s leaked the value %r' % (path, secret))


def test_accounts_response_shape_is_exactly_this(client, db):
    owner = _seed_everything()
    account = _get(client, owner, '/api/v1/accounts').get_json()['accounts'][0]
    assert set(account) == ACCOUNT_KEYS, (
        'Account response shape changed — review whether the MCP redaction '
        'layer needs to know. Added: %s Removed: %s'
        % (sorted(set(account) - ACCOUNT_KEYS),
           sorted(ACCOUNT_KEYS - set(account))))


def test_categories_response_shape_is_exactly_this(client, db):
    owner = _seed_everything()
    category = _get(
        client, owner, '/api/v1/categories/').get_json()['categories'][0]
    assert set(category) == CATEGORY_KEYS, (
        'Added: %s Removed: %s'
        % (sorted(set(category) - CATEGORY_KEYS),
           sorted(CATEGORY_KEYS - set(category))))


def test_transactions_response_shape_is_exactly_this(client, db):
    owner = _seed_everything()
    txn = _get(
        client, owner, '/api/v1/transactions/').get_json()['transactions'][0]
    assert set(txn) == TRANSACTION_KEYS, (
        'Added: %s Removed: %s'
        % (sorted(set(txn) - TRANSACTION_KEYS),
           sorted(TRANSACTION_KEYS - set(txn))))
    # The nested account is a second serializer reached through this endpoint.
    assert set(txn['account']) == ACCOUNT_KEYS


def test_budgets_response_shape_is_exactly_this(client, db):
    owner = _seed_everything()
    budget = _get(client, owner, '/api/v1/budgets/').get_json()['budgets'][0]
    assert set(budget) == BUDGET_KEYS, (
        'Added: %s Removed: %s'
        % (sorted(set(budget) - BUDGET_KEYS),
           sorted(BUDGET_KEYS - set(budget))))


def test_last_four_digits_do_reach_a_read_token_via_name_and_card_used(
        client, db):
    """Documented, deliberate: the MCP layer must redact these itself.

    `account_number` is not a column and is not emitted, but the last four
    digits of a real account arrive in `Account.name` straight from the
    SimpleFin bridge, and `card_used` is copied from that name. An LLM handed
    this response sees them.
    """
    owner = _seed_everything()

    account = _get(client, owner, '/api/v1/accounts').get_json()['accounts'][0]
    assert '4242' in account['name']
    assert 'Chase' in account['institution']

    txn = _get(
        client, owner, '/api/v1/transactions/').get_json()['transactions'][0]
    assert '4242' in txn['card_used']
    assert '4242' in txn['account']['name']


def test_household_emails_reach_a_read_token(client, db):
    """Also deliberate: `user_id` is an email address, so it is PII.

    User.id IS the email (src/models/user.py:16), so every `user_id` in every
    one of these four responses is a real address, and `split_with` plus the
    `splits` block carry OTHER household members' names and addresses.
    """
    owner = _seed_everything()
    housemate = UserFactory(id='housemate@example.com', name='House Mate')
    db.session.add(Expense(
        description='Shared dinner', amount=60.0, date=datetime(2026, 7, 3),
        card_used='Chase Checking ...4242', split_method='equal',
        paid_by=owner.id, user_id=owner.id, split_with=housemate.id,
        currency_code='USD'))
    db.session.commit()

    account = _get(client, owner, '/api/v1/accounts').get_json()['accounts'][0]
    assert account['user_id'] == 'owner@example.com'

    shared = [t for t in _get(client, owner, '/api/v1/transactions/')
              .get_json()['transactions']
              if t['description'] == 'Shared dinner'][0]
    assert shared['split_with'] == 'housemate@example.com'
    # calculate_splits() resolves those IDs into names + addresses.
    assert shared['splits']['payer']['email'] == 'owner@example.com'
    assert shared['splits']['splits'][0]['email'] == 'housemate@example.com'
    assert shared['splits']['splits'][0]['name'] == 'House Mate'


def test_free_text_notes_reach_a_read_token_unfiltered(client, db):
    """`notes` is the one field a user can put a full account number in.

    Text column, no length cap on the model, no validation beyond a 2000-char
    limit on input. Nothing here can stop it, which is precisely why the MCP
    layer needs its own scrubbing rather than a field allow-list.
    """
    owner = _seed_everything()
    db.session.add(Expense(
        description='Wire transfer', amount=2500.0, date=datetime(2026, 7, 4),
        card_used='Chase Checking ...4242', split_method='none',
        paid_by=owner.id, user_id=owner.id, currency_code='USD',
        notes='routing 021000021 acct 5555666677778888'))
    db.session.commit()

    wire = [t for t in _get(client, owner, '/api/v1/transactions/')
            .get_json()['transactions']
            if t['description'] == 'Wire transfer'][0]
    assert '5555666677778888' in wire['notes']


def test_accounts_are_instance_wide_not_token_owner_scoped(client, db):
    """A read token's blast radius is every user on the instance.

    get_all_user_ids() (src/utils/household.py) returns every row in `users`,
    so one member's read token exposes another member's accounts — including
    the last four digits in their account names. Transactions differ: they are
    filtered to the owner plus split_with.
    """
    owner = _seed_everything()
    housemate = UserFactory(id='housemate@example.com', name='House Mate')
    db.session.add(Account(
        name='Housemate Amex ...9876', type='credit',
        institution='American Express', user_id=housemate.id,
        balance=-50.0, currency_code='USD'))
    db.session.commit()

    names = [a['name']
             for a in _get(client, owner, '/api/v1/accounts')
             .get_json()['accounts']]
    assert 'Housemate Amex ...9876' in names, (
        'Scoping changed to per-user — good, but the MCP design notes assume '
        'instance-wide reads; update docs/MCP_DESIGN.md.')
