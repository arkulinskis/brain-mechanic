from anvil import *

from ._anvil_designer import UsageRowTemplate


class UsageRow(UsageRowTemplate):
    """Admin → Usage: one check's anonymous run counts: item = {name, month, all, saved, demo, head}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["head"] = bool(self.item.get("head"))
