"""B12 -- one goal, several accounts.

*** EVERY ASSERTION READS THE DATABASE OR THE PAYLOAD, NEVER A STATUS CODE. ***
Every bug found across eight passes of this project returned 200 and rendered
fine, and this feature's whole failure mode is a figure that is computed
correctly and describes the wrong thing.

The file is organised around the four things that can silently go wrong:

  1. the sum -- a two-account goal reading one account's money;
  2. the release -- an archived or achieved goal still holding its accounts,
     which raises nothing and forbids a new goal for ever;
  3. the denormalised `active_direction` drifting from `GoalService.direction`,
     which raises nothing and constrains the wrong pairs;
  4. the mixed set -- a card and a savings account summed into one honest-looking
     percentage that hides half the goal.
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from src.extensions import db as _db
from src.models.goal import Goal
from src.models.goal_account import GoalAccount
from src.services.goal.service import GoalService
from tests.factories import AccountFactory, ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/goals/'


@pytest.fixture
def user(db):
    return UserFactory(id='multi@test.com', name='Multi')


def _card(user, name, balance):
    return AccountFactory(user_id=user.id, name=name, type='credit',
                          balance=Decimal(balance))


def _savings(user, name, balance):
    return AccountFactory(user_id=user.id, name=name, type='savings',
                          balance=Decimal(balance))


def _create(client, auth_headers, user, **body):
    return client.post(ENDPOINT, headers=auth_headers(user), json=body)


# --------------------------------------------------------------- the sum ----

def test_a_two_account_goal_sums_both_snapshots_and_both_balances(
        client, auth_headers, user):
    """*** THE FEATURE. *** Two cards, one payoff goal, one percentage.

    Asserted on the arithmetic and not merely on "there are two links": a goal
    that stored both links and summed only the first would pass a link count and
    tell the user they are twice as far along as they are.
    """
    visa = _card(user, 'Visa', '-1000.00')
    amex = _card(user, 'Amex', '-500.00')
    _db.session.commit()

    resp = _create(client, auth_headers, user, name='Pay off my cards',
                   kind='payoff', account_ids=[visa.id, amex.id],
                   target_amount='0.00')
    assert resp.status_code == 201, resp.get_json()
    payload = resp.get_json()['goal']

    assert payload['start_amount'] == -1500.00, 'the snapshot is not the sum'
    assert payload['current_amount'] == -1500.00
    assert payload['direction'] == 'paydown'
    assert payload['progress'] == 0.0

    # Now pay $600 off the Visa. One account moved; the goal is 40% done.
    visa.balance = Decimal('-400.00')
    _db.session.commit()

    goal = _db.session.get(Goal, payload['id'])
    svc = GoalService()
    assert svc.current_amount(goal) == Decimal('-900.00')
    assert float(svc.progress(goal)) == pytest.approx(0.4)


def test_each_link_carries_its_OWN_snapshot_not_a_share_of_the_total(
        client, auth_headers, user):
    """The per-row snapshot is what makes add and remove implementable at all.

    A single stored total would be indistinguishable from this on a freshly
    created goal and unrecoverable the moment an account is removed -- the same
    shape as `account_id` being un-updatable, which exists because the history
    needed to undo it is gone.
    """
    visa = _card(user, 'Visa', '-1000.00')
    amex = _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']

    links = {l.account_id: l.start_amount
             for l in _db.session.get(Goal, goal_id).links}
    assert links == {visa.id: Decimal('-1000.00'), amex.id: Decimal('-500.00')}


# ----------------------------------------------------------- the release ----

def test_archiving_releases_EVERY_account_not_just_the_primary(
        client, auth_headers, user):
    """*** THE RULE THAT USED TO BE A `WHERE status = 'active'` CLAUSE. ***

    With the accounts on a join table there is no such clause; the release is
    `sync_links` writing NULL into every link. If it only cleared the primary,
    the second card would be held for ever by an archived goal and nothing
    would raise -- the user would just be told they cannot make a new goal.
    """
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']
    assert all(l.active_direction == 'paydown'
               for l in _db.session.get(Goal, goal_id).links)

    client.post(f'{ENDPOINT}{goal_id}/archive', headers=auth_headers(user))

    links = _db.session.get(Goal, goal_id).links
    assert [l.active_direction for l in links] == [None, None], (
        'an archived goal is still holding an account')

    # And the release is real: a new goal on the SECOND card now succeeds.
    resp = _create(client, auth_headers, user, name='Amex again', kind='payoff',
                   account_ids=[amex.id], target_amount='0.00')
    assert resp.status_code == 201, resp.get_json()


def test_ACHIEVING_a_goal_releases_its_accounts_too(client, auth_headers, user):
    """`stamp_if_achieved` is a second writer of `status` and it is easy to miss.

    The archive route is the obvious one; this transition happens on a READ, when
    a balance has moved, and forgetting `sync_links` there leaves a finished goal
    holding its accounts with nothing ever raising.
    """
    pot = _savings(user, 'Fund', '0.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Fund',
                      account_ids=[pot.id],
                      target_amount='500.00').get_json()['goal']['id']

    pot.balance = Decimal('500.00')
    _db.session.commit()
    # Stamped on read -- nothing else runs when a balance moves.
    client.get(ENDPOINT, headers=auth_headers(user))

    goal = _db.session.get(Goal, goal_id)
    assert goal.status == 'achieved'
    assert [l.active_direction for l in goal.links] == [None]


def test_deleting_a_goal_takes_its_links_with_it(client, auth_headers, user):
    """Otherwise the account stays held by a goal that no longer exists, and on
    Postgres the delete raises an IntegrityError nothing explains."""
    visa = _card(user, 'Visa', '-1000.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Visa', kind='payoff',
                      account_ids=[visa.id],
                      target_amount='0.00').get_json()['goal']['id']

    client.delete(f'{ENDPOINT}{goal_id}', headers=auth_headers(user))
    assert _db.session.query(GoalAccount).filter_by(goal_id=goal_id).count() == 0


# ------------------------------------------------------- double counting ----

def test_two_active_goals_cannot_share_a_NON_PRIMARY_account(
        client, auth_headers, user):
    """*** THE CASE THE OLD INDEX ON `goals` CANNOT SEE, AND THE WHOLE REASON
    THE CONSTRAINT MOVED. ***

    `goals.account_id` holds the PRIMARY link only. Two goals whose primaries
    differ but which share a second card would pass the old index untouched and
    both count the same dollars -- which is the gaming vector B5 closed, reopened
    by B12 unless the constraint follows the accounts onto the join table.
    """
    visa = _card(user, 'Visa', '-1000.00')
    amex = _card(user, 'Amex', '-500.00')
    store = _card(user, 'Store card', '-200.00')
    _db.session.commit()

    first = _create(client, auth_headers, user, name='Cards A', kind='payoff',
                    account_ids=[visa.id, amex.id], target_amount='0.00')
    assert first.status_code == 201, first.get_json()

    second = _create(client, auth_headers, user, name='Cards B', kind='payoff',
                     account_ids=[store.id, amex.id], target_amount='0.00')
    assert second.status_code == 400, (
        'Amex is counted by two active goals: ' + str(second.get_json()))
    # Refused in the SCHEMA, so no half-written goal is left behind.
    assert Goal.query.filter_by(name='Cards B').count() == 0
    # *** AND THE REFUSAL SAYS WHICH CARD, WHICH ONLY BECAME NECESSARY WITH B12.
    # *** "An account can carry only one active goal" was actionable while a goal
    # held one account. Told that one of three is spoken for, and not which, a
    # user cannot do anything at all.
    error = second.get_json()['error']
    assert 'Amex' in error and 'Cards A' in error, error
    assert 'Store card' not in error, f'it named the innocent account too: {error}'


def test_the_constraint_is_in_the_schema_where_an_application_check_would_race(
        db):
    """An application check reads before it writes; two requests can each see
    "no existing goal" and both succeed. Driven at the model, below the API, so
    the assertion is about the index and not about a handler."""
    a, b = UserFactory(id='ra@test.com'), UserFactory(id='rb@test.com')
    joint = AccountFactory(user_id=a.id, name='Joint', type='savings',
                           balance=Decimal('0'))
    _db.session.commit()

    def _goal(owner):
        g = Goal(user_id=owner.id, name='g', kind='savings', scope='personal',
                 target_amount=Decimal('5000'), start_amount=Decimal('0'),
                 currency_code='USD', status='active')
        g.links.append(GoalAccount(account_id=joint.id,
                                   start_amount=Decimal('0'),
                                   active_direction='accumulate'))
        _db.session.add(g)
        _db.session.commit()

    _goal(a)
    with pytest.raises(IntegrityError):
        _goal(b)
    _db.session.rollback()


def test_the_SAME_account_may_still_carry_one_goal_of_EACH_direction(
        client, auth_headers, user):
    """The index is on `(account_id, active_direction)` and not on `account_id`
    alone, so this must keep working -- forbidding it would be stricter than the
    spec asks and would break an offset account."""
    flex = AccountFactory(user_id=user.id, name='Flex', type='checking',
                          balance=Decimal('0'))
    _db.session.commit()
    up = _create(client, auth_headers, user, name='Build it',
                 account_ids=[flex.id], target_amount='5000.00')
    assert up.status_code == 201, up.get_json()
    # A paydown on the same account: start 0, target below it.
    down = _create(client, auth_headers, user, name='Draw it down',
                   account_ids=[flex.id], target_amount='-5000.00')
    assert down.status_code == 201, down.get_json()


# ----------------------------------------------------- the derived column ----

def test_active_direction_tracks_GoalService_direction_through_every_change(
        client, auth_headers, user):
    """*** THE DRIFT TEST, AND IT IS THE MITIGATION FOR DENORMALISING AT ALL. ***

    `active_direction` is a copy of a derived value. A stale copy does not raise;
    it silently constrains the wrong pairs. This drives the transitions that can
    change either input -- status and the amounts -- and asserts the column
    against the function after each one. It is the same mitigation
    `DIRECTION_SQL` carries in `test_goal_double_counting.py`, applied to the
    second copy B12 introduces.
    """
    pot = _savings(user, 'Fund', '100.00')
    _db.session.commit()
    svc = GoalService()
    goal_id = _create(client, auth_headers, user, name='Fund',
                      account_ids=[pot.id],
                      target_amount='5000.00').get_json()['goal']['id']

    def _assert_agrees(why):
        goal = _db.session.get(Goal, goal_id)
        expected = svc.direction(goal) if goal.status == 'active' else None
        actual = [l.active_direction for l in goal.links]
        assert actual == [expected], f'{why}: {actual!r} != {expected!r}'
        return goal

    _assert_agrees('on create')

    # target below start flips the direction to paydown, through PUT.
    client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
               json={'target_amount': '-50.00'})
    goal = _assert_agrees('after the target moved below the start')
    assert goal.links[0].active_direction == 'paydown', (
        'the flip did not actually happen, so this test proved nothing')

    client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
               json={'target_amount': '5000.00'})
    _assert_agrees('after the target moved back above the start')

    client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
               json={'status': 'archived'})
    _assert_agrees('after PUT set status to archived')

    client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
               json={'status': 'active'})
    _assert_agrees('after PUT set status back to active')


def test_goals_start_amount_stays_equal_to_the_sum_of_its_links(
        client, auth_headers, user):
    """The second denormalised value. `progress`, `validate` and `DIRECTION_SQL`
    all read the column, so if it drifts from the links every one of them is
    computing from a number the join table disagrees with."""
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']

    goal = _db.session.get(Goal, goal_id)
    assert goal.start_amount == sum(l.start_amount for l in goal.links)
    # And the primary is never NULL, which is what keeps the legacy readers and
    # the old index honest rather than inert.
    assert goal.account_id in (visa.id, amex.id)


# ---------------------------------------------------------- the mixed set ----

def test_a_card_and_a_savings_account_are_REFUSED_and_the_error_names_BOTH(
        client, auth_headers, user):
    """*** THEY SUM TO A PERFECTLY VALID NUMBER, WHICH IS THE PROBLEM. ***

    -1,650 and +4,000 net to +2,350, so the goal presents as an accumulation
    while half of it is a debt. The check is therefore on the per-account signs
    and NOT on the sum -- a check on the sum passes this exact pair.
    """
    card = _card(user, 'Chase Amazon', '-1650.00')
    pot = _savings(user, 'Emergency fund', '4000.00')
    _db.session.commit()

    resp = _create(client, auth_headers, user, name='Everything',
                   account_ids=[card.id, pot.id], target_amount='10000.00')
    assert resp.status_code == 400
    error = resp.get_json()['error']
    assert 'Chase Amazon' in error and 'Emergency fund' in error, (
        f'the refusal does not say which accounts disagree: {error}')
    assert Goal.query.filter_by(name='Everything').count() == 0


def test_the_sign_check_is_per_account_and_a_sum_check_would_pass_this(db):
    """Stated as arithmetic so nobody 'simplifies' it into a check on the total.

    Coupled to the summing on purpose: summing snapshots is only honest while
    every account is on one side of zero. Relax this and the sums silently
    become lies.
    """
    assert GoalService.mixed_direction([Decimal('-1650'), Decimal('4000')])
    # What a check on the sum would have concluded about the same pair:
    assert Decimal('-1650') + Decimal('4000') > 0
    # Two cards, or two savings accounts, are fine.
    assert not GoalService.mixed_direction([Decimal('-1650'), Decimal('-500')])
    assert not GoalService.mixed_direction([Decimal('0'), Decimal('4000')])
    # A brand-new savings account at exactly zero joins a savings goal.
    assert not GoalService.mixed_direction([Decimal('0'), Decimal('0')])


# ----------------------------------------------------- add and remove ----

def test_adding_an_account_extends_the_denominator_by_ITS_BALANCE_NOW(
        client, auth_headers, user):
    """*** THIS IS THE OPERATION THE SINGLE-ACCOUNT MODEL FLATLY REFUSED, AND
    THE SNAPSHOT IS WHAT MAKES IT HONEST. ***

    Without a snapshot, adding a $500 card to a goal that is 60% done would
    recompute the percentage against a denominator that pretends the card was
    always there. With it, both numerator and denominator grow by the same
    $500 and the percentage moves for a reason that can be named.
    """
    visa = _card(user, 'Visa', '-1000.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id],
                      target_amount='0.00').get_json()['goal']['id']
    visa.balance = Decimal('-400.00')
    _db.session.commit()
    before = client.get(f'{ENDPOINT}{goal_id}',
                        headers=auth_headers(user)).get_json()['goal']
    assert before['progress'] == pytest.approx(0.6)

    amex = _card(user, 'Amex', '-500.00')
    _db.session.commit()
    resp = client.post(f'{ENDPOINT}{goal_id}/accounts',
                       headers=auth_headers(user), json={'account_id': amex.id})
    assert resp.status_code == 200, resp.get_json()
    after = resp.get_json()['goal']

    assert after['start_amount'] == -1500.00, 'the denominator ignored the add'
    assert after['current_amount'] == -900.00
    # 600 paid of 1500 owed. The percentage moved DOWN, and honestly.
    assert after['progress'] == pytest.approx(0.4)
    assert after['account_name'] == '2 accounts'


def test_adding_an_account_that_is_already_linked_does_not_count_it_twice(
        client, auth_headers, user):
    """Idempotent like the co-owner grant it mirrors -- and here that is load
    bearing, not tidy: a second insert would add the balance to the denominator
    again, which is the double counting the index exists to stop, arriving
    through the front door."""
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.post(f'{ENDPOINT}{goal_id}/accounts',
                       headers=auth_headers(user), json={'account_id': amex.id})
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['goal']['start_amount'] == -1500.00
    assert len(_db.session.get(Goal, goal_id).links) == 2


def test_removing_an_account_shrinks_the_denominator_by_ITS_OWN_snapshot(
        client, auth_headers, user):
    """The mirror of the add, and the reason the snapshot is per row: with one
    stored total the sum could never be corrected downwards."""
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.delete(f'{ENDPOINT}{goal_id}/accounts/{amex.id}',
                         headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['goal']['start_amount'] == -1000.00
    assert resp.get_json()['goal']['account_name'] == 'Visa'
    # And Amex is released: a new goal may now use it.
    assert _create(client, auth_headers, user, name='Amex alone', kind='payoff',
                   account_ids=[amex.id],
                   target_amount='0.00').status_code == 201


def test_the_LAST_account_cannot_be_unlinked(client, auth_headers, user):
    """That is a conversion to a manual goal, not an unlink: the goal would keep
    a denominator nobody typed, and a linked goal's honesty is the whole argument
    for linking. The refusal says to archive instead."""
    visa = _card(user, 'Visa', '-1000.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Visa', kind='payoff',
                      account_ids=[visa.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.delete(f'{ENDPOINT}{goal_id}/accounts/{visa.id}',
                         headers=auth_headers(user))
    assert resp.status_code == 400
    assert 'Archive' in resp.get_json()['error']
    assert len(_db.session.get(Goal, goal_id).links) == 1


def test_a_MANUAL_goal_cannot_gain_an_account(client, auth_headers, user):
    """Its `start_amount` is a typed figure; replacing it with a snapshot sum is
    exactly the restatement `PUT` refuses, and the typed history is gone
    afterwards."""
    goal_id = _create(client, auth_headers, user, name='By hand',
                      target_amount='1000.00', start_amount='0.00',
                      current_manual='250.00').get_json()['goal']['id']
    pot = _savings(user, 'Fund', '4000.00')
    _db.session.commit()

    resp = client.post(f'{ENDPOINT}{goal_id}/accounts',
                       headers=auth_headers(user), json={'account_id': pot.id})
    assert resp.status_code == 400
    assert _db.session.get(Goal, goal_id).start_amount == Decimal('0.00')


def test_a_mixed_set_is_refused_on_ADD_as_well_as_on_CREATE(
        client, auth_headers, user):
    """D-99's lesson: a rule enforced at one entry point is not enforced. The
    create path refusing a card-plus-savings set means nothing if the add path
    will assemble the same set one account at a time."""
    card = _card(user, 'Chase Amazon', '-1650.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[card.id],
                      target_amount='0.00').get_json()['goal']['id']
    pot = _savings(user, 'Emergency fund', '4000.00')
    _db.session.commit()

    resp = client.post(f'{ENDPOINT}{goal_id}/accounts',
                       headers=auth_headers(user), json={'account_id': pot.id})
    assert resp.status_code == 400
    error = resp.get_json()['error']
    assert 'Chase Amazon' in error and 'Emergency fund' in error
    assert len(_db.session.get(Goal, goal_id).links) == 1


def test_the_add_and_remove_routes_are_refused_to_someone_who_may_only_READ(
        client, auth_headers, db):
    """Seeing a household goal and being allowed to change it are different.

    404 for a goal you cannot see, 403 for one you can see but may not manage --
    answering 404 to the second would mean the read scope had silently narrowed
    (D-43).
    """
    owner = UserFactory(id='owner@test.com', name='Owner')
    other = UserFactory(id='other@test.com', name='Other')
    pot = _savings(owner, 'Fund', '100.00')
    spare = _savings(owner, 'Spare', '50.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, owner, name='Household fund',
                      scope='household', account_ids=[pot.id],
                      target_amount='5000.00').get_json()['goal']['id']

    resp = client.post(f'{ENDPOINT}{goal_id}/accounts',
                       headers=auth_headers(other), json={'account_id': spare.id})
    assert resp.status_code == 403, resp.get_json()
    assert len(_db.session.get(Goal, goal_id).links) == 1


# ------------------------------------------------------- contributions ----

def test_contributions_cover_EVERY_linked_account(client, auth_headers, db):
    """*** THE SPEC SAID THESE 'WIDEN FOR FREE -- BUT VERIFY, DO NOT ASSUME'.
    THEY DO NOT. ***

    The query names `account_id` and `destination_account_id` explicitly, so a
    two-account goal left alone would show who contributed to ONE account under a
    total covering BOTH -- one partner's money unreported beside a figure that
    counts it.
    """
    alex = UserFactory(id='alex@test.com', name='Alex')
    morgan = UserFactory(id='morgan@test.com', name='Morgan')
    first = _savings(alex, 'Fund A', '0.00')
    second = _savings(alex, 'Fund B', '0.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, alex, name='Emergency fund',
                      account_ids=[first.id, second.id],
                      target_amount='5000.00').get_json()['goal']['id']

    # Alex pays into the FIRST account, Morgan into the SECOND. A goal reading
    # only its primary reports Alex alone.
    ExpenseFactory(user_id=alex.id, account_id=first.id, paid_by=alex.id,
                   amount=400.0, transaction_type='income',
                   description='Alex pays in', date=date(2026, 5, 1))
    ExpenseFactory(user_id=alex.id, account_id=second.id, paid_by=morgan.id,
                   amount=300.0, transaction_type='income',
                   description='Morgan pays in', date=date(2026, 5, 2))
    _db.session.commit()

    rows = client.get(f'{ENDPOINT}{goal_id}/contributions',
                      headers=auth_headers(alex)).get_json()['contributions']
    by_user = {r['user_id']: r['amount'] for r in rows}
    assert by_user == {alex.id: 400.0, morgan.id: 300.0}, (
        f'a contributor to the second account is missing: {rows}')


# ------------------------------------------------------------ the payload ----

def test_the_payload_ships_accounts_BESIDE_the_singular_keys(
        client, auth_headers, user):
    """*** SHIPPING THE LIST BESIDE THE SINGULAR IS THE MIGRATION. ***

    Both clients read `account_name` today and mobile reads it in
    `goalService.ts`. Removing it in the release that adds `accounts` would break
    every deployed build -- D-176 is the row about a key a client already read
    optimistically, and this is the same hazard approached deliberately.
    """
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    payload = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']

    assert payload['accounts'] == [
        {'id': min(visa.id, amex.id),
         'name': 'Visa' if visa.id < amex.id else 'Amex',
         'start_amount': -1000.00 if visa.id < amex.id else -500.00},
        {'id': max(visa.id, amex.id),
         'name': 'Amex' if visa.id < amex.id else 'Visa',
         'start_amount': -500.00 if visa.id < amex.id else -1000.00},
    ]
    # NEVER null and never one card's name out of two: an unmigrated client
    # renders this string, and "Visa" would be false while null reads as
    # "Tracked by hand" for a goal that reads two cards.
    assert payload['account_name'] == '2 accounts'
    assert payload['account_id'] is not None


def test_a_single_account_goal_still_reads_exactly_as_it_did(
        client, auth_headers, user):
    """*** THE MIGRATION IS INVISIBLE OR IT IS NOT A MIGRATION. *** Every
    existing goal is a one-row join now, and nothing about it may move."""
    card = _card(user, 'Chase Amazon', '-1125.41')
    _db.session.commit()
    payload = _create(client, auth_headers, user, name='Pay off Chase',
                      kind='payoff', account_id=card.id,
                      target_amount='0.00').get_json()['goal']

    assert payload['account_id'] == card.id
    assert payload['account_name'] == 'Chase Amazon'
    assert payload['start_amount'] == -1125.41
    assert payload['accounts'] == [{'id': card.id, 'name': 'Chase Amazon',
                                    'start_amount': -1125.41}]


# --------------------------------------------------------------- backfill ----

def test_the_backfill_gives_an_EXISTING_goal_its_link_without_moving_anything(
        db):
    """*** `create_all()` CREATES A MISSING TABLE AND CANNOT PUT A ROW IN IT.
    THAT IS THE RELEASE-GATING HALF. ***

    Built the way a pre-B12 database holds it -- an `account_id` and no link --
    and asserted on the denominator, because re-snapshotting from the balance
    instead of carrying the goal's own `start_amount` across would move every
    existing user's percentage at once, silently.
    """
    from src.services.goal.backfill import backfill_goal_accounts

    owner = UserFactory(id='old@test.com', name='Old')
    card = AccountFactory(user_id=owner.id, name='Card', type='credit',
                          balance=Decimal('-450.00'))
    _db.session.commit()
    legacy = Goal(user_id=owner.id, name='Legacy', kind='payoff',
                  scope='personal', account_id=card.id,
                  target_amount=Decimal('0.00'),
                  start_amount=Decimal('-1125.41'),
                  currency_code='USD', status='active')
    _db.session.add(legacy)
    _db.session.commit()
    assert legacy.links == [], 'the fixture is not a pre-B12 goal'

    assert backfill_goal_accounts() == 1

    _db.session.refresh(legacy)
    assert [(l.account_id, l.start_amount, l.active_direction)
            for l in legacy.links] == [(card.id, Decimal('-1125.41'), 'paydown')]
    # The snapshot is the goal's own, NOT the balance re-read today.
    assert legacy.start_amount == Decimal('-1125.41')
    # (-450 + 1125.41) / 1125.41 -- the figure this goal showed before B12, to
    # the last cent, because the migration may not move it.
    assert float(GoalService().progress(legacy)) == pytest.approx(675.41 / 1125.41)


def test_the_backfill_is_condition_keyed_and_therefore_idempotent(db):
    """D-178: a seed or reconcile change is not shipped until a condition-keyed
    correction exists for the rows the old version wrote. Keyed to "names an
    account, has no link" rather than to a version stamp, so it runs safely on
    every boot AND fixes an instance that was already running."""
    from src.services.goal.backfill import backfill_goal_accounts

    owner = UserFactory(id='idem@test.com', name='Idem')
    pot = AccountFactory(user_id=owner.id, name='Fund', type='savings',
                         balance=Decimal('100.00'))
    _db.session.commit()
    _db.session.add(Goal(user_id=owner.id, name='Legacy', kind='savings',
                         scope='personal', account_id=pot.id,
                         target_amount=Decimal('5000.00'),
                         start_amount=Decimal('0.00'),
                         currency_code='USD', status='active'))
    _db.session.commit()

    assert backfill_goal_accounts() == 1
    assert backfill_goal_accounts() == 0, 'a second boot inserted a second link'
    assert _db.session.query(GoalAccount).count() == 1


def test_the_backfill_leaves_a_MANUAL_goal_alone(db):
    """A manual goal has no account, so it has no link -- and giving it one
    would convert a typed figure into a computed one behind the user's back."""
    from src.services.goal.backfill import backfill_goal_accounts

    owner = UserFactory(id='manual@test.com', name='Manual')
    _db.session.add(Goal(user_id=owner.id, name='By hand', kind='savings',
                         scope='personal', account_id=None,
                         target_amount=Decimal('1000.00'),
                         start_amount=Decimal('0.00'),
                         current_manual=Decimal('250.00'),
                         currency_code='USD', status='active'))
    _db.session.commit()

    assert backfill_goal_accounts() == 0
    assert _db.session.query(GoalAccount).count() == 0


def test_an_ARCHIVED_legacy_goal_is_backfilled_holding_NOTHING(db):
    """Its link must carry `active_direction = NULL`, or the migration itself
    would hand every archived goal its accounts back and lock them."""
    from src.services.goal.backfill import backfill_goal_accounts

    owner = UserFactory(id='arch@test.com', name='Arch')
    pot = AccountFactory(user_id=owner.id, name='Fund', type='savings',
                         balance=Decimal('100.00'))
    _db.session.commit()
    _db.session.add(Goal(user_id=owner.id, name='Old goal', kind='savings',
                         scope='personal', account_id=pot.id,
                         target_amount=Decimal('5000.00'),
                         start_amount=Decimal('0.00'),
                         currency_code='USD', status='archived'))
    _db.session.commit()

    backfill_goal_accounts()
    link = _db.session.query(GoalAccount).one()
    assert link.active_direction is None


# ------------------------------------------------- deleting the account ----

def test_deleting_a_goals_ONLY_account_is_REFUSED_and_names_the_goal(
        client, auth_headers, user):
    """*** D-181, PROVEN ON `main` BEFORE IT WAS OPENED. ***

    On the deployed commit (`9aef753`) this answered *"Account deleted
    successfully"* and left the goal reading **0%** where it had read 60%: the
    relationship de-associates rather than cascading, `account_id` goes NULL, the
    goal becomes manual, `current_manual` is NULL, and `current_amount` falls back
    to `start_amount`. Every figure in the payload consistent, and the user's
    progress silently gone.

    Refused rather than converted, and for the same reason unlinking a goal's last
    account is refused: there is no honest figure left once the balance the
    denominator was snapshotted from stops existing.
    """
    card = _card(user, 'Chase Amazon', '-450.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Pay off Chase',
                      kind='payoff', account_ids=[card.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.delete(f'/api/v1/accounts/{card.id}', headers=auth_headers(user))
    assert resp.status_code == 400, resp.get_json()
    error = resp.get_json()['error']
    assert 'Pay off Chase' in error and 'Chase Amazon' in error, error

    goal = _db.session.get(Goal, goal_id)
    assert goal.account_id == card.id, 'the goal was detached anyway'
    assert len(goal.links) == 1


def test_deleting_ONE_of_a_goals_accounts_unlinks_it_and_shrinks_the_denominator(
        client, auth_headers, user):
    """The other half, and it is why the refusal above is not simply "no".

    A goal reading three cards has somewhere to stand when one of them goes, so
    the account is unlinked and the denominator shrinks by ITS OWN snapshot --
    exactly what `DELETE /goals/<id>/accounts` does. Left alone, the join table's
    cascade would take the link and leave that card's snapshot inside
    `goals.start_amount`, so the goal would go on computing against an account
    that no longer exists.
    """
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id, amex.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.delete(f'/api/v1/accounts/{amex.id}', headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()

    payload = client.get(f'{ENDPOINT}{goal_id}',
                         headers=auth_headers(user)).get_json()['goal']
    assert payload['start_amount'] == -1000.00, (
        'the deleted account is still in the denominator')
    assert payload['accounts'] == [{'id': visa.id, 'name': 'Visa',
                                    'start_amount': -1000.00}]
    assert payload['account_id'] == visa.id
    assert payload['account_name'] == 'Visa'


def test_PUT_refuses_to_change_the_account_set_instead_of_ignoring_it(
        client, auth_headers, user):
    """A PUT that answers 'Goal updated successfully' having changed nothing is
    worse than a refusal: the client looks correct and the goal is not what the
    screen says. `account_id` has always been dropped here deliberately, but the
    natural way to write "edit this goal's accounts" is a PUT, and task 8 is the
    code that will write it."""
    visa, amex = _card(user, 'Visa', '-1000.00'), _card(user, 'Amex', '-500.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Cards', kind='payoff',
                      account_ids=[visa.id],
                      target_amount='0.00').get_json()['goal']['id']

    resp = client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
                      json={'account_ids': [visa.id, amex.id]})
    assert resp.status_code == 400, resp.get_json()
    assert '/accounts' in resp.get_json()['error']
    assert len(_db.session.get(Goal, goal_id).links) == 1


def test_PUT_still_ACCEPTS_and_ignores_the_singular_account_id(
        client, auth_headers, user):
    """*** THE ASYMMETRY WITH THE TEST ABOVE IS DELIBERATE AND LOAD-BEARING. ***

    `account_ids` is refused because nothing deployed sends it. `account_id` is
    on the update payload of BOTH shipped clients today — `GoalForm.tsx:111` sets
    it, `Goals.tsx:321` includes it — so refusing it would turn every goal edit on
    every installed build into a 400. That is D-99's lesson run backwards: a
    server may stop honouring what a client sends, but it may not start rejecting
    it in the same release. It is ignored, exactly as before, and the goal keeps
    its account.
    """
    a = _savings(user, 'A', '100.00')
    b = _savings(user, 'B', '900.00')
    _db.session.commit()
    goal_id = _create(client, auth_headers, user, name='Fund',
                      account_ids=[a.id],
                      target_amount='500.00').get_json()['goal']['id']

    resp = client.put(f'{ENDPOINT}{goal_id}', headers=auth_headers(user),
                      json={'name': 'Renamed', 'account_id': b.id})
    assert resp.status_code == 200, resp.get_json()
    goal = _db.session.get(Goal, goal_id)
    assert goal.name == 'Renamed'
    assert goal.account_id == a.id, 'the goal was re-pointed'
    assert [l.account_id for l in goal.links] == [a.id]
