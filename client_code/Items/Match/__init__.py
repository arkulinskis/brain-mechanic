from anvil import *

from ._anvil_designer import MatchTemplate
from ... import state


class Match(MatchTemplate):
    """A manual entry that shares lights with the ones switched on: item = {id, code, n, pct, hits_text, scan}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.fill.style["width"] = "%d%%" % i["pct"]
        state.set_attr(self.read_link, "href", "#manual/" + i["id"])
        self.scan_link.visible = bool(i.get("scan"))
        if i.get("scan"):
            state.set_attr(self.scan_link, "href", "#scan/" + i["scan"])
