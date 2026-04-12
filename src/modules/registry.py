"""
ModuleRegistry — singleton that holds all registered modules and exposes
the coordinator API used by core files.

Usage:
    from src.modules.registry import module_registry
    module_registry.register(MyModule())
"""

import logging
from src.modules.base import ModuleBase

logger = logging.getLogger(__name__)


class ModuleRegistry:
    """Coordinator for all registered finPal modules."""

    def __init__(self):
        self.modules: list[ModuleBase] = []

    def register(self, module: ModuleBase) -> None:
        """Register a module instance. Skips if not enabled."""
        if module.is_enabled():
            self.modules.append(module)
            logger.info(f"Module registered: {module.name} v{module.version}")
        else:
            logger.debug(f"Module skipped (disabled): {module.name}")

    # ------------------------------------------------------------------
    # Core lifecycle hooks
    # ------------------------------------------------------------------

    def startup(self, app) -> None:
        """
        Called once inside app_context after db.create_all().
        Delegates to each module's on_startup hook.
        """
        for module in self.modules:
            try:
                module.on_startup(app)
            except Exception as e:
                logger.warning(f"Module {module.name} on_startup failed: {e}")

    def register_api_namespaces(self, api) -> None:
        """Add each module's Flask-RESTX namespaces to the Api."""
        for module in self.modules:
            try:
                for ns, path in module.get_namespaces():
                    api.add_namespace(ns, path=path)
                    logger.debug(f"Namespace registered: {module.name} → {path}")
            except Exception as e:
                logger.warning(f"Module {module.name} namespace registration failed: {e}")

    def register_tasks(self, scheduler, app) -> None:
        """Register each module's APScheduler tasks."""
        for module in self.modules:
            try:
                module.register_tasks(scheduler, app)
            except Exception as e:
                logger.warning(f"Module {module.name} register_tasks failed: {e}")

    def dispatch_event(self, event_name: str, **kwargs) -> None:
        """
        Fire a named event to all registered modules.
        A failing module never blocks the caller.
        """
        for module in self.modules:
            try:
                module.on_event(event_name, **kwargs)
            except Exception as e:
                logger.warning(f"Module {module.name} on_event({event_name}) failed: {e}")

    def background_sync(self, app, user_id: str) -> None:
        """
        Called from the background sync thread on user login.
        Delegates to each module's on_background_sync hook.
        A failing module never blocks other modules.
        """
        for module in self.modules:
            try:
                module.on_background_sync(app, user_id)
            except Exception as e:
                logger.warning(f"Module {module.name} on_background_sync failed for {user_id}: {e}")

    def is_user_enabled(self, module_name: str, user_id: str) -> bool:
        """Return True if the named module is enabled for this user."""
        for module in self.modules:
            if module.name == module_name:
                return module.is_user_enabled(user_id)
        return False


# Singleton — importable everywhere
module_registry = ModuleRegistry()
