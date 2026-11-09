from anvil import *

from ._anvil_designer import LampGroupTemplate


class LampGroup(LampGroupTemplate):
    """One system's warning lights on the Diagnose board: item = {title, icon, lamps}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + (self.item.get("icon") or "sparkle"))
        self.lamps_panel.items = self.item["lamps"]
