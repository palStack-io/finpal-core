"""
Account and SimpleFin models
"""

from datetime import datetime
from src.extensions import db

class Account(db.Model):
    __tablename__ = 'accounts'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # checking, savings, credit, etc.

    # *** WHERE `type` CAME FROM, BECAUSE A GUESS AND A FACT MUST NOT LOOK ALIKE
    # (D-191). *** SimpleFin sends NO account type -- measured against the live
    # bridge, 0 of 25 real accounts carried a `type` key -- so every imported
    # account was written `checking`, and a Visa carrying 5,544.12 of debt was
    # invisible to every feature that filters on this column.
    #
    #   'user'      the person chose it. NEVER overwritten by an import.
    #   'inferred'  finPal guessed, from evidence (holdings -> investment,
    #               negative balance at import -> credit).
    #   'default'   nothing was known and something had to be written.
    #
    # The clients render the second and third as a question rather than a fact:
    # *"we think this is a credit card -- change it"*. Rendering a guess as a
    # fact is D-77 and D-108, and the mountain design refuses the same thing in
    # another form -- *"a missing APR must never draw a molehill"*.
    #
    # NULL means "written before this column existed" and is treated as
    # `default` by readers; the boot backfill resolves it.
    type_source = db.Column(db.String(10), nullable=True)
    institution = db.Column(db.String(100), nullable=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id', name='fk_account_user'), nullable=False)
    balance = db.Column(db.Numeric(18, 2), default=0)
    currency_code = db.Column(db.String(3), db.ForeignKey('currencies.code', name='fk_account_currency'), nullable=True)
    last_sync = db.Column(db.DateTime, nullable=True)
    import_source = db.Column(db.String(50), nullable=True)
    external_id = db.Column(db.String(200), nullable=True)
    status = db.Column(db.String(20), nullable=True)
    color = db.Column(db.String(7), nullable=True)  # Hex color code (e.g., #3b82f6)
    # #129: the create form has asked for this since it was written and there was nowhere
    # to put it -- the value was discarded on every save. Text, not String(n): it is a
    # free-form note ("Joint account - rent, bills and the shared food shop") and a
    # ceiling here would only re-create the validator-vs-column mismatch of #123.
    # NOTE: adding a column to an EXISTING table is invisible to `create_all()`, so no
    # deployed instance gets this from a redeploy -- see scripts/schema_drift.py (D-121).
    description = db.Column(db.Text, nullable=True)

    # B1. learnPal cannot teach credit utilisation or interest cost without these, and
    # debtPal would otherwise ask the user to re-enter debts finPal already holds --
    # two sources of truth for what someone owes.
    #
    # All NULLABLE: an untouched row must not change meaning. A default of 0 is a
    # CLAIM ("this card has a $0 limit"), which would make every pre-existing card
    # look maxed out; NULL is the absence of a claim.
    #
    # Numeric(5,2) on apr, not Float: 19.99 is not representable in binary and this
    # number is multiplied into money (D-58 removed exactly that error). 5 digits
    # holds 999.99%, which is above any real card and below where a typo is silent.
    #
    # NOTE: adding a column to an EXISTING table is invisible to `create_all()`, so no
    # deployed instance gets these from a redeploy alone -- the boot reconcile
    # (`src/utils/schema_reconcile.py`, D-121) is what applies them, and it has to be
    # confirmed on a real old database, not a fresh one.
    credit_limit = db.Column(db.Numeric(18, 2), nullable=True)
    apr = db.Column(db.Numeric(5, 2), nullable=True)
    min_payment = db.Column(db.Numeric(18, 2), nullable=True)

    # Relationships
    user = db.relationship('User', backref=db.backref('accounts', lazy=True))
    currency = db.relationship('Currency', backref=db.backref('accounts', lazy=True))
    
    def __repr__(self):
        return f"<Account {self.name} ({self.type})>"


class SimpleFin(db.Model):
    """
    Stores SimpleFin connection settings for a user
    """
    __tablename__ = 'SimpleFin'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(120), db.ForeignKey('users.id'), nullable=False, unique=True)
    #: *** FERNET-ENCRYPTED AT REST SINCE D-280. USE THE ACCESSORS BELOW. ***
    #: This line used to say "Encoded/encrypted access URL" while the write
    #: path (`services/account/service.py`) assigned the pasted string
    #: straight in. The comment is why it survived review for so long: it
    #: reads as answered. A SimpleFin access URL embeds a bearer token that
    #: grants read access to the holder's bank transactions.
    #:
    #: Rows written before D-280 hold plaintext; `get_access_url()` still
    #: reads them and the boot backfill re-encrypts them.
    access_url = db.Column(db.Text, nullable=False)
    last_sync = db.Column(db.DateTime, nullable=True)
    enabled = db.Column(db.Boolean, default=True)
    sync_frequency = db.Column(db.String(20), default='daily')  # 'daily', 'weekly', etc.
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    temp_accounts = db.Column(db.Text, nullable=True)
    
    # Relationship with User
    user = db.relationship('User', backref=db.backref('SimpleFin', uselist=False, lazy=True))
    
    def __repr__(self):
        return f"<SimpleFin settings for user {self.user_id}>"


    def __init__(self, **kwargs):
        """`SimpleFin(access_url=...)` encrypts, exactly like the setter.

        The constructor is a real write path. Leaving it as the one that
        bypasses encryption means every caller has to remember to build the
        row empty and then call `set_access_url` — and the one that forgets
        writes a plaintext credential with no error.

        SQLAlchemy does not call `__init__` when loading a row, so an
        already-stored value is never re-encrypted.
        """
        url = kwargs.pop('access_url', None)
        super().__init__(**kwargs)
        if url is not None:
            self.set_access_url(url)

    def set_access_url(self, url):
        """Encrypt and store the SimpleFin access URL."""
        from src.utils.credential_crypto import encrypt
        self.access_url = encrypt(url)

    def get_access_url(self):
        """Decrypt the stored access URL, or None.

        Reads pre-D-280 plaintext rows too — see `credential_crypto.decrypt`.
        """
        from src.utils.credential_crypto import decrypt
        return decrypt(self.access_url, context=f'SimpleFin user={self.user_id}')
