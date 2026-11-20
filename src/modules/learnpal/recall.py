"""Spaced recall: asking one quiz question again a few days after a skill was understood.

Schedule (pinned): right at step 0 -> step 1, due in 21 days; right at step 1 -> done and the
skill's `remembered` mark set; "Not sure" or a miss -> due in 7 days (first miss) then 21, step
unchanged, and the next ask moves to the following question of the skill's lessons; "Not now" ->
due in 2 days, nothing else. Recall awards nothing: no coins, no acts.
"""
from datetime import datetime, timedelta

from src.extensions import db
from src.modules.learnpal.learn_skills import skill_by_id
from src.modules.learnpal.lesson_quizzes import QUIZZES
from src.modules.learnpal.models import LearnRecall

FIRST_RECALL_DAYS = 3
STEP_ONE_DAYS = 21
FIRST_MISS_DAYS = 7
LATER_MISS_DAYS = 21
NOT_NOW_DAYS = 2
CHOICES = ('0', '1', '2', 'not_sure', 'not_now')


class RecallNotFound(LookupError):
    """No open recall with that id for that person (missing, finished, or someone else's).

    The route maps this to 404, so another person's recall id reveals nothing."""


def _free_day(user_id, day):
    """`day`, or the first later day no other open recall of this person is due on."""
    taken = {r.due_on for r in LearnRecall.query.filter(
        LearnRecall.user_id == user_id, LearnRecall.done_at.is_(None),
        LearnRecall.due_on >= day).all()}
    while day in taken:
        day += timedelta(days=1)
    return day


def schedule_first_recall(user_id, skill_id, today):
    """Create the first recall for a skill (step 0, due in 3 days). Idempotent.

    One recall a day: when another open recall is already due on that day, the new one moves to
    the next free day (two skills finished together are asked three and four days later).

    Uses the first question of the skill's first lesson that has a quiz. Returns the
    open LearnRecall, or None when the skill has no quiz at all. Does not commit.
    """
    existing = LearnRecall.query.filter_by(
        user_id=user_id, skill=skill_id, done_at=None).first()
    if existing:
        return existing
    skill = skill_by_id(skill_id)
    if skill is None:
        return None
    for slug in skill['lessons']:
        questions = (QUIZZES.get(slug) or {}).get('questions') or []
        if questions:
            recall = LearnRecall(
                user_id=user_id, skill=skill_id, milestone_slug=slug,
                question_id=questions[0]['id'],
                due_on=_free_day(user_id, today + timedelta(days=FIRST_RECALL_DAYS)), step=0, misses=0)
            db.session.add(recall)
            db.session.flush()
            return recall
    return None


def quiet_day(user_id, today):
    """Is today a day to leave the person alone? Read-only; writes nothing.

    True on a hard-month opening day (off plan last month, or a recent return, and not yet
    dismissed). finPal core has no goal plan-day or fresh-start service (grep of src/ and api/
    finds neither), so those two are not checked here.
    """
    from src.modules.learnpal.marks import request_memo

    memo = request_memo()
    key = ('quiet', user_id, today)
    if memo is not None and key in memo:
        return memo[key]
    quiet = _quiet_day(user_id, today)
    if memo is not None:
        memo[key] = quiet
    return quiet


def _quiet_day(user_id, today):
    from src.services.onboarding.hard_month import (
        RETURN_WINDOW_DAYS, _dismissed, over_budget_last_month)
    from src.models.visit_mark import VisitMark

    over, month_key = over_budget_last_month(user_id, today)
    if over and not _dismissed(user_id, f'hm-month:{month_key}'):
        return True
    mark = db.session.get(VisitMark, user_id)
    if mark is not None and mark.returned_on and 0 <= (today - mark.returned_on).days < RETURN_WINDOW_DAYS:
        return not _dismissed(user_id, f'hm-return:{mark.returned_on.isoformat()}')
    return False


def due_recall(user_id, today):
    """The one recall to ask today (earliest due, not done), or None.

    None when learning is off, on a quiet day (see quiet_day), or when a recall was already
    answered today (at most one a day).
    """
    from src.models.user import User
    from src.modules.learnpal.marks import learning_on

    user = db.session.get(User, user_id)
    if user is None or not learning_on(user) or quiet_day(user_id, today):
        return None
    if LearnRecall.query.filter(LearnRecall.user_id == user_id,
                                LearnRecall.answered_on == today).first() is not None:
        return None
    due = LearnRecall.query.filter(
        LearnRecall.user_id == user_id, LearnRecall.done_at.is_(None),
        LearnRecall.due_on <= today).order_by(LearnRecall.due_on, LearnRecall.id).all()
    for recall in due:
        if _question(recall) is None:
            # Its question was removed from QUIZZES: move to the skill's first question so it
            # never blocks the skill; if the skill has none at all, skip to the next due one.
            _rotate(recall)
            db.session.commit()
            if _question(recall) is None:
                continue
        return recall
    return None


def _question_cycle(skill_id):
    """Every (lesson slug, question id) of the skill's lessons that have a quiz, in order."""
    out = []
    for slug in (skill_by_id(skill_id) or {}).get('lessons', []):
        for q in (QUIZZES.get(slug) or {}).get('questions') or []:
            out.append((slug, q['id']))
    return out


def _question(recall):
    for q in (QUIZZES.get(recall.milestone_slug) or {}).get('questions') or []:
        if q['id'] == recall.question_id:
            return q
    return None


def _rotate(recall):
    cycle = _question_cycle(recall.skill)
    here = (recall.milestone_slug, recall.question_id)
    if here in cycle and len(cycle) > 1:
        recall.milestone_slug, recall.question_id = cycle[(cycle.index(here) + 1) % len(cycle)]
    elif here not in cycle and cycle:
        # The question was removed from QUIZZES: start the skill's cycle over rather than stall.
        recall.milestone_slug, recall.question_id = cycle[0]


def answer_recall(recall_id, user_id, choice, today):
    """Record an answer to a recall. Returns {'right': bool|None, 'why': str, 'marks': {...}}.

    `right` is None for "Not sure" and "Not now" (neither is a wrong answer); an out-of-range choice
    or a question that no longer exists counts as a miss (`right` False, empty `why`). Raises
    RecallNotFound for a recall that is missing, finished, or belongs to someone else, and
    ValueError for an unknown choice. Commits. Awards nothing.
    """
    from src.modules.learnpal.marks import _get_or_create, _progress_row, used_on_money

    if choice not in CHOICES:
        raise ValueError(f'unknown choice: {choice}')
    recall = db.session.get(LearnRecall, recall_id)
    if recall is None or recall.user_id != user_id or recall.done_at is not None:
        raise RecallNotFound(recall_id)
    question = _question(recall)
    recall.answered_on = today
    right, why = None, ''
    if choice == 'not_now':
        recall.due_on = today + timedelta(days=NOT_NOW_DAYS)
    else:
        if choice == 'not_sure':
            why = (question or {}).get('not_sure', '')
        else:
            options = (question or {}).get('options') or []
            index = int(choice)
            # A choice past the options, or a question that no longer exists, is a miss.
            if index < len(options):
                right, why = bool(options[index]['right']), options[index]['why']
            else:
                right = False
        if right:
            if recall.step == 0:
                recall.step = 1
                recall.due_on = today + timedelta(days=STEP_ONE_DAYS)
            else:
                now = datetime.utcnow()
                recall.done_at = now
                mark = _get_or_create(user_id, recall.skill)
                if mark.remembered_at is None:
                    mark.remembered_at = now
        else:
            recall.misses += 1
            recall.due_on = today + timedelta(
                days=FIRST_MISS_DAYS if recall.misses == 1 else LATER_MISS_DAYS)
            _rotate(recall)
    db.session.commit()
    from src.modules.learnpal.marks import clear_request_memo
    clear_request_memo()
    skill = skill_by_id(recall.skill)
    marks = _progress_row(skill, _get_or_create(user_id, recall.skill), used_on_money(user_id, recall.skill))
    db.session.commit()
    return {'right': right, 'why': why, 'marks': marks['marks']}
