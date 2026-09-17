"""
PointsPalModule — manifest for the pointsPal finPal module.

Registered in src/modules/__init__.py.
"""

from src.modules.base import ModuleBase


class PointsPalModule(ModuleBase):
    name = 'pointspal'
    enabled_env = 'POINTSPAL_ENABLED'
    version = '1.0.0'

    # pointsPal is part of core, not an add-on to switch on. POINTSPAL_ENABLED
    # still works as an opt-out for an operator who does not want it.
    default_enabled = True

    def get_namespaces(self):
        from src.modules.pointspal.routes import wallet_ns, points_ns, optimizer_ns, pointspal_ns
        return [
            (wallet_ns,     '/wallet'),
            (points_ns,     '/points'),
            (optimizer_ns,  '/optimizer'),
            (pointspal_ns,  '/pointspal'),
        ]



    def get_badges(self) -> dict:
        """pointsPal's contributor badges (owner decision 2026-09-17).

        A BADGE, not coins: §5.1's warning is about paying, where every extra
        submission is worth something again. A badge is once-only and buys
        nothing, so the worst a farmer gets is one spurious submission.

        Earned on SHARING, and the titles say so — finPal cannot know whether a
        contribution was accepted, because nothing links a merge to a user.
        """
        from src.modules.pointspal.badges import get_badges as _badges
        return _badges()

    def get_acts(self) -> dict:
        """pointsPal's own earnable acts (spec §5.1).

        *** THE HOOK THIS USES HAD NO CALLER UNTIL 2026-09-17 — D-187. ***
        `ModuleBase.get_acts()` was defined and `acts.py`'s docstring promised
        it, and nothing invoked it. `registry.py` now registers these beside
        the checks.

        *** `contribution_accepted` IS NOT HERE, AND THE SPEC'S REASON FOR
        EXPECTING IT IS FALSE. *** See `acts.py` in this package: there is no
        identifier linking an accepted contribution to a finPal user, so the
        act could never fire. Owner decision pending.
        """
        from src.modules.pointspal.acts import get_acts as _acts
        return _acts()

    def register_tasks(self, scheduler, app):
        @scheduler.task('cron', id='pointspal_sync', hour=3, minute=0)
        def nightly_sync():
            with app.app_context():
                try:
                    from src.modules.pointspal.service import sync_from_pointspal
                    result = sync_from_pointspal()
                    app.logger.info(
                        f"pointsPal sync complete: {result.get('programs_upserted', 0)} programs"
                    )
                except Exception as e:
                    app.logger.error(f"pointsPal nightly sync failed: {e}")

    def on_startup(self, app):
        from src.modules.pointspal.models import PointsProgram
        from src.modules.pointspal.service import sync_from_pointspal
        if PointsProgram.query.count() == 0:
            result = sync_from_pointspal()
            app.logger.info(
                f"pointsPal initial seed: {result.get('programs_upserted', 0)} programs loaded"
            )

    def on_event(self, event_name, **kwargs):
        if event_name == 'expense_created':
            from src.modules.pointspal.simplefin_bridge import handle_new_transaction
            handle_new_transaction(kwargs['connection'], kwargs['expense'])

    def on_background_sync(self, app, user_id):
        from src.modules.pointspal.models import PointsProgram
        from src.modules.pointspal.service import sync_from_pointspal
        from datetime import datetime, timedelta
        newest = PointsProgram.query.order_by(PointsProgram.updated_at.desc()).first()
        if not newest or (datetime.utcnow() - newest.updated_at) > timedelta(hours=23):
            result = sync_from_pointspal()
            import logging
            logging.getLogger(__name__).info(
                f"Background pointsPal sync complete: {result.get('programs_upserted', 0)} programs"
            )
