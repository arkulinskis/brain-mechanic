from anvil import *

from ._anvil_designer import ChipTemplate
from ... import state


class Chip(ChipTemplate):
    """A small link chip: item = {href, code, text, icon}. External links (http...) open in a new tab."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        state.set_attr(self, "href", i["href"])
        if str(i["href"]).startswith("http"):
            state.set_attr(self, "target", "_blank")
            state.set_attr(self, "rel", "noopener")
        self.code.visible = bool(i.get("code"))
        self.icon.visible = bool(i.get("icon"))
        if i.get("icon"):
            self.icon.classes.add("ic-" + i["icon"])
