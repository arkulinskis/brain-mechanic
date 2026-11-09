from anvil import *

from ._anvil_designer import LiTemplate


class Li(LiTemplate):
    """One line of a bullet or numbered list (the panel's role picks the look: bm-list warn/good/bad, bm-steps).
    item = {text, b}: b = an optional bold lead-in."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.lead.visible = bool(self.item.get("b"))
