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
