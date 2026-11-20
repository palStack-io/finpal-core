"""Spaced recall: asking one quiz question again a few days after a skill was understood.

Task 3 owns `schedule_first_recall` only; later tasks extend this file.
"""
from datetime import timedelta

from src.extensions import db
from src.modules.learnpal.learn_skills import skill_by_id
from src.modules.learnpal.lesson_quizzes import QUIZZES
from src.modules.learnpal.models import LearnRecall

FIRST_RECALL_DAYS = 3


def schedule_first_recall(user_id, skill_id, today):
    """Create the first recall for a skill (step 0, due in 3 days). Idempotent.

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
                due_on=today + timedelta(days=FIRST_RECALL_DAYS), step=0, misses=0)
            db.session.add(recall)
            db.session.flush()
            return recall
    return None
