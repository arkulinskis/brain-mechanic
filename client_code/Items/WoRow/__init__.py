from anvil import *

from ._anvil_designer import WoRowTemplate


class WoRow(WoRowTemplate):
    """A row of the work order's results table: item = {check, note, score, label, date, head}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["head"] = bool(self.item.get("head"))
        self.note.visible = bool(self.item.get("note"))
