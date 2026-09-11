"""LearnPalModule — manifest. Registered in src/modules/__init__.py."""

from src.modules.base import ModuleBase


class LearnPalModule(ModuleBase):
    name = 'learnpal'
    enabled_env = 'LEARNPAL_ENABLED'
    version = '1.0.0'

    # *** OFF BY DEFAULT, UNLIKE pointsPal, AND THAT IS DELIBERATE FOR C1b. ***
    # pointsPal is `default_enabled = True` because it is finished. learnPal at
    # C1b is an engine with no UI, so switching it on for every self-hoster
    # would create two tables and a nightly task in exchange for nothing they
    # can see. The module chooser in C1f is where this flips -- and the flip is
    # a one-line change here, which is the point of doing it this way rather
    # than gating the code.
    #
    # `LEARNPAL_ENABLED=true` opts in, which is how the demo runs it.
    default_enabled = False

    def get_namespaces(self):
        # C1c. *** READ ENDPOINTS ONLY, PLUS ONE WRITE THAT CANNOT UNLOCK. ***
        # The engine is still reached from the goal write path and the nightly
        # task; nothing behind a route decides what opens, or a client could
        # award itself every piece of gear by POSTing a list of slugs.
        #
        # These paths 404 when the module is off, because the namespace is only
        # registered from here. A client must read that as "learnPal is not
        # installed" and render nothing -- the same discipline as `peak` being
        # absent from a goal payload.
        from src.modules.learnpal.routes import learnpal_ns
        return [(learnpal_ns, '/learnpal')]

    def on_startup(self, app):
        # Milestones only. *** MOUNTAINS ARE SEEDED BY CORE *** (src/__init__.py),
        # because a goal is drawn as a peak whether or not this module is on.
        from src.modules.learnpal.seed import seed_milestones
        seed_milestones()

        # *** SEEDING A LESSON IS NOT DELIVERING IT — D-187 AND D-178 TOGETHER.
        # *** `seed_milestones` inserts what is missing, so a new slug exists at
        # the next boot and unlocks for NOBODY until something evaluates. Until
        # today the only evaluator was the 04:15 cron below, so every user on a
        # stack with no scheduler service had `read: 0 of 8` for ever -- and the
        # 11 approved drafts, once seeded, would have landed the same way.
        #
        # This is the condition-keyed correction for the rows every previous
        # version wrote: `evaluate_for_user` skips any milestone that already
        # has a completion, so it is idempotent and a no-op on a caught-up
        # instance. It runs AFTER the seeder so a slug added in this very deploy
        # is included.
        #
        # *** IT MUST NOT BREAK BOOT. *** An optional module's catch-up failing
        # is not a reason for finPal not to start, and the cron re-runs it.
        try:
            from src.modules.learnpal.engine import sync_all_users
            sync_all_users(app)
        except Exception:
            app.logger.exception(
                'learnPal startup catch-up failed; lessons already earned are '
                'unaffected and the nightly pass will retry')

    def register_tasks(self, scheduler, app):
        # *** PROGRESS MOVES WITHOUT ANY GOAL BEING WRITTEN. *** It is derived
        # from account balances, so paying a card down changes it with no goal
        # row touched. The write-path hook alone would never see that, which is
        # what this task is for.
        @scheduler.task('cron', id='learnpal_evaluate', hour=4, minute=15)
        def nightly_evaluate():
            with app.app_context():
                try:
                    from src.modules.learnpal.engine import sync_all_users
                    sync_all_users(app)
                except Exception as e:
                    app.logger.error(f'learnPal nightly evaluation failed: {e}')
