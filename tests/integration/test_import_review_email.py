"""The import review email fires only when a human is actually needed.

**The decision this encodes.** One mail per imported batch is noise, and a
notification that arrives whether or not anything is wrong trains people to ignore
it — so a clean auto-import sends *nothing*. Owner decision, 2026-08-07.

**The assertion that matters most is the negative one.** "An email was sent when it
should have been" is easy to get right by accident: a naive implementation that
mails on every batch passes every positive test in this file. Only
`test_a_clean_import_sends_nothing` can tell the two apart, which is why it is
written first and why the fixture counts sends rather than asserting on the last
one.

**And the predicate is shared, which is the structural half.** `batch_needs_review`
is the same function `_serialize_batch` publishes as `needs_review` and the
dashboard banner now reads. Before this, the rule lived only in TypeScript inside
`ImportReviewBanner.tsx`; adding the email would have made a second copy in a
second language, which is the shape behind D-52, D-57, D-64 and the two Categories
implementations. A duplicated predicate does not stay duplicated.
"""
import pytest

from src.extensions import db
from src.models.import_source import ImportBatch, ImportProfile, ImportSource
from src.services.csv_import.review import batch_needs_review
from tests.factories import UserFactory


@pytest.fixture
def user(db):
    u = UserFactory(id='importer@test.com', name='Ada')
    u.notification_email = True
    db.session.commit()
    return u


@pytest.fixture
def sent(monkeypatch):
    """Every send, recorded. Counting is the point — see the module docstring."""
    calls = []
    from src.services import email_service as module

    def record(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(module.email_service, 'send_import_review_email', record)
    return calls


def _profile(user_id, origin, confidence=1.0):
    p = ImportProfile(
        name='Bank', header_fingerprint=f'fp-{origin}-{confidence}',
        mapping={'date': 'Date', 'description': 'Desc', 'amount': 'Amount'},
        date_format='%Y-%m-%d', sign_convention='negative_is_expense',
        origin=origin, confidence=confidence, user_id=user_id)
    db.session.add(p)
    db.session.flush()
    return p


def _batch(user_id, profile=None, errors=0, imported=10, confidence=1.0):
    b = ImportBatch(
        filename='statement.csv', file_hash=f'h{errors}{imported}{confidence}{profile}',
        status='success', user_id=user_id, imported_count=imported,
        error_count=errors, confidence=confidence,
        profile_id=profile.id if profile else None)
    db.session.add(b)
    db.session.flush()
    return b


# --- the predicate itself -----------------------------------------------------

def test_a_clean_import_needs_no_review(db, user):
    """A learned mapping, full confidence, no errors — nothing to look at."""
    batch = _batch(user.id, _profile(user.id, 'manual'))
    assert batch_needs_review(batch) is False


def test_a_guessed_mapping_needs_review_even_at_full_confidence(db, user):
    """The clause `confidence` cannot cover.

    The heuristics legitimately return 1.0 for an unambiguous header, so a guessed
    mapping is indistinguishable from a learned one by confidence alone. Without
    this clause the most important case — finPal met a new bank and guessed —
    would send nothing.
    """
    batch = _batch(user.id, _profile(user.id, 'heuristic', confidence=1.0))
    assert batch_needs_review(batch) is True


def test_low_confidence_needs_review_whatever_its_origin(db, user):
    batch = _batch(user.id, _profile(user.id, 'manual', confidence=0.4), confidence=0.4)
    assert batch_needs_review(batch) is True


def test_failed_rows_need_review(db, user):
    batch = _batch(user.id, _profile(user.id, 'manual'), errors=3)
    assert batch_needs_review(batch) is True


def test_zero_confidence_is_shaky_not_unset(db, user):
    """`if batch.confidence` would treat 0.0 as absent and stay silent."""
    batch = _batch(user.id, _profile(user.id, 'manual', confidence=0.0), confidence=0.0)
    assert batch_needs_review(batch) is True


# --- the notification --------------------------------------------------------

def test_a_clean_import_sends_nothing(db, user, sent):
    """*** THE LOAD-BEARING TEST. ***

    An implementation that mails on every batch passes every other test here.
    """
    from src.services.csv_import.scanner import _notify_if_review_needed

    _notify_if_review_needed(_batch(user.id, _profile(user.id, 'manual')))
    assert sent == [], 'a clean import must not email anybody'


def test_a_guessed_mapping_emails_the_owner(db, user, sent):
    from src.services.csv_import.scanner import _notify_if_review_needed

    _notify_if_review_needed(_batch(user.id, _profile(user.id, 'heuristic')))

    assert len(sent) == 1
    assert sent[0]['to_email'] == user.id
    assert sent[0]['guessed_mapping'] is True
    assert sent[0]['filename'] == 'statement.csv'


def test_failed_rows_email_and_say_how_many(db, user, sent):
    from src.services.csv_import.scanner import _notify_if_review_needed

    _notify_if_review_needed(_batch(user.id, _profile(user.id, 'manual'), errors=4))

    assert len(sent) == 1
    assert sent[0]['errors'] == 4
    # Not a guessed mapping — the two reasons need different actions from the
    # reader, so conflating them would tell the user to check the wrong thing.
    assert sent[0]['guessed_mapping'] is False


def test_a_user_who_turned_email_off_gets_nothing(db, user, sent):
    from src.services.csv_import.scanner import _notify_if_review_needed

    user.notification_email = False
    db.session.commit()

    _notify_if_review_needed(_batch(user.id, _profile(user.id, 'heuristic')))
    assert sent == [], 'notification_email = False must be honoured'


def test_a_failing_mailer_never_fails_the_import(db, user, monkeypatch):
    """The import is already committed by the time we notify.

    A dead SMTP server must not turn a successful import into a failed scan, and
    must not abandon the remaining files in the folder.
    """
    from src.services import email_service as module
    from src.services.csv_import.scanner import _notify_if_review_needed

    def explode(**kwargs):
        raise RuntimeError('smtp is down')

    monkeypatch.setattr(module.email_service, 'send_import_review_email', explode)

    # No exception escapes.
    _notify_if_review_needed(_batch(user.id, _profile(user.id, 'heuristic')))


# --- the shared predicate ----------------------------------------------------

def test_the_api_publishes_needs_review_so_the_banner_need_not_recompute(
        client, db, user, auth_headers):
    """The structural half: one definition, two consumers.

    If this key stops being published, the banner silently falls back to its own
    copy of the rule and the two can drift again — which is exactly what this
    change existed to stop.
    """
    _batch(user.id, _profile(user.id, 'heuristic'))
    db.session.commit()

    resp = client.get('/api/v1/import-batches', headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()

    batches = resp.get_json()['batches']
    assert batches, 'no batches came back, so the assertion below inspects nothing'
    assert 'needs_review' in batches[0], (
        'the API no longer publishes needs_review; ImportReviewBanner will fall '
        'back to its own copy of the rule and the two can drift')
    assert batches[0]['needs_review'] is True
