"""learnPal API endpoints — module-local routes.

Registered into Flask-RESTX via `LearnPalModule.get_namespaces()`.

learnpal_ns — /api/v1/learnpal/...

*** C1b DELIBERATELY HAD NO HTTP SURFACE; THIS IS C1c's. *** The engine is
reached from the goal write path and the nightly task, and it stays that way:
nothing here unlocks anything. These are read endpoints over state the engine
produced, plus one explicit "I read it" write.

*** AND "THE GOAL WRITE PATH" WAS FICTION UNTIL D-187. *** The sentence above
was written before anything called `evaluate_for_goal`, so for the whole of
C1b and C1c the nightly cron was the only entry point in existence — and the
llm demo has no scheduler, so every read endpoint here truthfully reported
`read: 0 of 8` to a user with a finished goal. **A route is not evidence that
the thing behind it has ever run.**

*** EVERY ROUTE HERE VANISHES WHEN THE MODULE IS OFF, *** because the namespace
is only registered through the manifest. A client must therefore treat a 404 on
these paths as "learnPal is not installed" and render nothing, NOT as an error --
which is the same discipline as `peak` being absent from a goal payload.
"""

from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from src.extensions import db
from src.modules.learnpal.models import LearnCompletion, LearnMilestone
from src.modules.learnpal.range import range_for_user
from src.modules.learnpal.stats import stats_for_user

learnpal_ns = Namespace('learnpal', description='learnPal lessons, gear and the range')


@learnpal_ns.route('/range')
class LearnRange(Resource):
    @jwt_required()
    def get(self):
        """Every peak grouped by scale, the ground, the strips and the kit.

        One request because four surfaces need the same joins: the range screen,
        the goals-page banner, the per-goal strip and the gear kit.
        """
        user_id = get_jwt_identity()
        return {'success': True, 'range': range_for_user(user_id)}, 200


@learnpal_ns.route('/stats')
class LearnStats(Resource):
    @jwt_required()
    def get(self):
        """The learnPal HOME: progress, the hardest climb, and what is next.

        *** NOT MORE KEYS ON `/range`. *** `range.py` serves four surfaces off
        one payload, including the strip that draws on every goal card; adding
        home-only fields would make all four carry them. See `stats.py`'s header
        for the rest of the reasoning, and for why there is no points figure
        anywhere in it.
        """
        user_id = get_jwt_identity()
        return {'success': True, 'stats': stats_for_user(user_id)}, 200


@learnpal_ns.route('/lessons')
class LearnLessons(Resource):
    @jwt_required()
    def get(self):
        """Every lesson, with whether this user has it. The "see all" surface.

        *** THE BODY IS NOT SENT HERE. *** A list of twenty lessons with their
        prose is a large payload almost none of which gets read, and the reader
        fetches one at a time. `has_body` says whether there is anything to open,
        so the client does not offer a reader for a lesson that has no text yet
        -- eleven approved drafts are not seeded and four are deliberately
        unwritten, so "no body" is a real and expected state.
        """
        user_id = get_jwt_identity()
        earned = {row[0] for row in
                  LearnCompletion.query
                  .with_entities(LearnCompletion.milestone_slug)
                  .filter_by(user_id=user_id).all()}
        rows = LearnMilestone.query.order_by(LearnMilestone.sort_order).all()
        return {
            'success': True,
            'lessons': [{
                'slug': m.slug,
                'title': m.title,
                'gear_slug': m.gear_slug,
                'surface': m.surface,
                'applies_to_direction': m.applies_to_direction,
                'unlock_at_progress': (float(m.unlock_at_progress)
                                       if m.unlock_at_progress is not None else None),
                'earned': m.slug in earned,
                'has_body': bool(m.body_md),
            } for m in rows],
            'read': len([m for m in rows if m.slug in earned]),
            'total': len(rows),
        }, 200


@learnpal_ns.route('/lessons/<string:slug>')
class LearnLesson(Resource):
    @jwt_required()
    def get(self, slug):
        """One lesson, with its body.

        *** A LOCKED LESSON ANSWERS 200 WITH NO BODY, NOT 403. *** Knowing a
        lesson EXISTS is the point of the list -- it is what the user is working
        towards. Refusing the whole row would make the list and the reader
        disagree about what exists, and hiding a title nobody can read yet
        removes the reason to keep going.
        """
        user_id = get_jwt_identity()
        m = LearnMilestone.query.filter_by(slug=slug).first()
        if m is None:
            return {'success': False, 'error': 'Lesson not found'}, 404

        earned = LearnCompletion.query.filter_by(
            user_id=user_id, milestone_slug=slug).first() is not None
        return {
            'success': True,
            'lesson': {
                'slug': m.slug,
                'title': m.title,
                'gear_slug': m.gear_slug,
                'surface': m.surface,
                'earned': earned,
                'body_md': m.body_md if earned else None,
                'locked': not earned,
            },
        }, 200


@learnpal_ns.route('/lessons/<string:slug>/read')
class LearnLessonRead(Resource):
    @jwt_required()
    def post(self, slug):
        """Record that the user read a lesson they had already unlocked.

        *** THIS CANNOT UNLOCK ANYTHING, AND THAT IS THE WHOLE POINT. *** The
        engine decides what opens, from altitude and from predicates. If this
        could create a completion, a client could award itself every piece of
        gear by POSTing a list of slugs. So it refuses a slug the user has not
        earned, and on one they have it is idempotent.

        It exists to move `verified_by` from the engine's `read` to an explicit
        acknowledgement later, and because the daily-lesson queue needs somewhere
        to record "seen" -- points still come from ANSWERING, never from this.
        """
        user_id = get_jwt_identity()
        if LearnMilestone.query.filter_by(slug=slug).first() is None:
            return {'success': False, 'error': 'Lesson not found'}, 404

        row = LearnCompletion.query.filter_by(
            user_id=user_id, milestone_slug=slug).first()
        if row is None:
            return {'success': False,
                    'error': 'This lesson is not unlocked yet'}, 409

        db.session.commit()
        return {'success': True, 'slug': slug, 'verified_by': row.verified_by}, 200
