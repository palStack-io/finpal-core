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
                # *** CHECKS FIRST, THEN on_startup. *** learnPal's startup hook
                # seeds milestones and then runs a catch-up evaluation, and that
                # evaluation dispatches through `CHECKS`. Registering after it
                # would make the first pass on every boot silently skip the
                # module's own predicate and log an unknown check_type.
                #
                # `self.modules` already holds only ENABLED modules —
                # `register()` gates on `is_enabled()` — so there is no second
                # reader of that decision here.
                from src.services.literacy.checks import register_check
                for check_type, entry in (module.get_checks() or {}).items():
                    fn, reason = entry if isinstance(entry, tuple) else (entry, None)
                    register_check(check_type, fn, reason)

                # *** `get_acts()` HAD NO CALLER AT ALL UNTIL NOW — D-187. ***
                # `ModuleBase` defined the hook, `acts.py`'s own docstring said
                # *"a module may contribute its own acts through
                # `ModuleBase.get_acts()`"*, and nothing ever invoked it. A
                # module returning acts would have been ignored in silence.
                # Registered here beside the checks, for the same reason and in
                # the same order: before `on_startup`, so a startup pass cannot
                # dispatch through a registry the module has not filled yet.
                from src.services.literacy.acts import register_act
                for act in (module.get_acts() or {}).values():
                    register_act(act)

                # The third hook, added 2026-09-17 with pointsPal's contributor
                # badges. Same boundary as the other two: a predicate that needs
                # a module's tables belongs in that module.
                from src.services.literacy.badges import register_badge
                for slug, entry in (module.get_badges() or {}).items():
                    title, predicate = entry
                    register_badge(slug, title, predicate)

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
