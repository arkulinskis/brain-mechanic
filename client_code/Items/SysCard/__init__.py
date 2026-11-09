from anvil import *

from ._anvil_designer import SysCardTemplate


class SysCard(SysCardTemplate):
    """An ADHD daily-systems card: item = {icon, title, line, tips: [{text}], chips: [...]}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + (self.item.get("icon") or "sparkle"))
        self.tips_panel.items = self.item["tips"]
        self.chips_panel.items = self.item["chips"]
        self.chips_panel.visible = bool(self.item["chips"])
