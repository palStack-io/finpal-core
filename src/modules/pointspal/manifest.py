"""
PointsPalModule — manifest for the pointsPal finPal module.

Registered in src/modules/__init__.py.
"""

from src.modules.base import ModuleBase


class PointsPalModule(ModuleBase):
    name = 'pointspal'
    enabled_env = 'POINTSPAL_ENABLED'
    version = '1.0.0'

    def get_namespaces(self):
        from src.modules.pointspal.routes import wallet_ns, points_ns, optimizer_ns, pointspal_ns
        return [
            (wallet_ns,     '/wallet'),
            (points_ns,     '/points'),
            (optimizer_ns,  '/optimizer'),
            (pointspal_ns,  '/pointspal'),
        ]

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
