"""
Module registration — the only file you edit when adding a new module.

Each registered module is only activated if its enabled_env var is True.
"""

from src.modules.registry import module_registry
from src.modules.pointspal.manifest import PointsPalModule

module_registry.register(PointsPalModule())

# To add a new module:
# from src.modules.cryptopal.manifest import CryptoPalModule
# module_registry.register(CryptoPalModule())
