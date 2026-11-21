from anvil import *

from ._anvil_designer import MileageRowTemplate
from ... import state


class MileageRow(MileageRowTemplate):
    """Garage → Mileage: one check taken more than once (or due again): first → latest, a sparkline and when it's due.
    item = {scan_id, title, line, due_text, due, points, label}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.due.text = i.get("due_text") or ""
        self.due.visible = bool(i.get("due_text"))
        self.due.role = ["bm-st", "occ"] if i.get("due") else ["bm-st"]
        state.set_attr(self.recheck, "href", "#scan/" + str(i.get("scan_id") or ""))
        pts = i.get("points") or []
        self.spark.visible = len(pts) > 1
        if len(pts) > 1:
            self.spark.draw(points=pts, label=i.get("label") or "")
