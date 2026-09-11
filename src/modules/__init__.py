"""
Module registration — the only file you edit when adding a new module.

Each registered module is only activated if its enabled_env var is True.
"""

from src.modules.registry import module_registry
from src.modules.pointspal.manifest import PointsPalModule
from src.modules.learnpal.manifest import LearnPalModule

module_registry.register(PointsPalModule())
# learnPal is `default_enabled = False` — see its manifest. Registering an
# instance is harmless either way: the registry checks `is_enabled()` before
# running any hook.
module_registry.register(LearnPalModule())

# To add a new module:
# from src.modules.cryptopal.manifest import CryptoPalModule
# module_registry.register(CryptoPalModule())
