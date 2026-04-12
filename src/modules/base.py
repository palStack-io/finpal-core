"""
ModuleBase — base class for all finPal modules.

Every module subclasses ModuleBase and overrides only the hooks it needs.
All methods have no-op defaults so modules stay minimal.
"""

import os
import logging

logger = logging.getLogger(__name__)


class ModuleBase:
    """Base class for all finPal plug-in modules."""

    name: str = ''            # unique slug, e.g. 'pointspal'
    enabled_env: str = ''     # env var name, e.g. 'POINTSPAL_ENABLED'
    version: str = '1.0.0'

    # ------------------------------------------------------------------
    # Enablement
    # ------------------------------------------------------------------

    def is_enabled(self) -> bool:
        """Return True if this module is enabled at the deployment level."""
        if not self.enabled_env:
            return False
        return os.getenv(self.enabled_env, 'false').lower() == 'true'

    def is_user_enabled(self, user_id: str) -> bool:
        """
        Return True if this user has access to the module.

        Checks user_module_access table. If no row exists → True (default-open).
        Modules can override this for custom subscription logic.
        """
        try:
            from src.modules.access import UserModuleAccess
            row = UserModuleAccess.query.filter_by(
                user_id=user_id, module_name=self.name
            ).first()
            if row is not None:
                return row.enabled
        except Exception:
            pass
        return True  # default-open

    # ------------------------------------------------------------------
    # Integration hooks — override as needed
    # ------------------------------------------------------------------

    def get_namespaces(self) -> list:
        """
        Return list of (namespace_object, '/url-path') tuples.
        Registered by ModuleRegistry into the Flask-RESTX Api.
        """
        return []

    def register_tasks(self, scheduler, app) -> None:
        """Register APScheduler cron jobs for this module."""
        pass

    def on_startup(self, app) -> None:
        """
        Called inside app_context after db.create_all().
        Use for: first-run seeding, table checks, cache warming.
        """
        pass

    def on_event(self, event_name: str, **kwargs) -> None:
        """
        React to named core events fired by the registry.

        e.g. event_name='expense_created', kwargs={'connection': ..., 'expense': ...}
        """
        pass

    def on_background_sync(self, app, user_id: str) -> None:
        """
        Called from the background sync thread on user login.
        Must be non-blocking and handle its own errors.
        """
        pass
