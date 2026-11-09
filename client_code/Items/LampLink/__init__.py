from anvil import *

from ._anvil_designer import LampLinkTemplate
from ... import state


class LampLink(LampLinkTemplate):
    """A lit "check engine" lamp in the Garage: item = {href, text, cls}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes[self.item.get("cls") or "ok"] = True
        if self.item.get("href"):
            state.set_attr(self, "href", self.item["href"])
