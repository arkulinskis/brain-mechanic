from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import OfficeTemplate


class Office(OfficeTemplate):
    """The landing page's drawing: a psychologist's office with a dashboard of warning lights (BM.office in
    bm-engine.js). The dashboard on the wall opens Diagnose."""

    def __init__(self, **properties):
        super().__init__(**properties)
        node = anvil.js.get_dom_node(self.canvas)
        node.innerHTML = window.BM.office()
        node.addEventListener("click", anvil.js.report_exceptions(self._click))

    def _click(self, event):
        hit = event.target.closest("[data-go]") if getattr(event.target, "closest", None) else None
        if hit:
            window.location.hash = "#" + hit.getAttribute("data-go")
