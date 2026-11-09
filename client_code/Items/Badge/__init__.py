from anvil import *

from ._anvil_designer import BadgeTemplate


class Badge(BadgeTemplate):
    """A status label: item = {b, cls, title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.badge.role = [r for r in ("bm-st", self.item.get("cls")) if r]
        if self.item.get("title"):
            self.badge.tooltip = self.item["title"]
