from anvil import *

from ._anvil_designer import CardTemplate
from ... import state


class Card(CardTemplate):
    """A case-file card that links to a manual entry, pattern, tool or check. item = bm.card(...):
    {kind, href, icon, code, b1, b1cls, b1title, b2, title, line, foot, level, level_cls}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        state.set_attr(self, "href", i["href"])
        self.classes[i.get("kind") or "cond"] = True
        self.icon.classes.add("ic-" + (i.get("icon") or "sparkle"))
        self.code.visible = bool(i.get("code"))
        self.b1.visible = bool(i.get("b1"))
        self.b1.role = [r for r in ("bm-st", i.get("b1cls")) if r]
        if i.get("b1title"):
            self.b1.tooltip = i["b1title"]
        self.b2.visible = bool(i.get("b2"))
        self.level.visible = bool(i.get("level"))
        self.level.role = [r for r in ("bm-level", i.get("level_cls")) if r]
        self.foot_box.visible = bool(i.get("foot"))
