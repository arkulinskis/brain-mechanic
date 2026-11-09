from anvil import *

from ._anvil_designer import RecentTemplate
from ... import state


class Recent(RecentTemplate):
    """A saved or recent check result: item = {id, level, label, title, sub, scan_id, host (optional: Delete button)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.level.role = ["bm-level", "l%s" % i.get("level", 0)]
        state.set_attr(self.retake, "href", "#scan/" + str(i.get("scan_id") or ""))
        self.delete_button.visible = bool(i.get("host"))

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.item["host"].delete_scan(self.item["id"])
