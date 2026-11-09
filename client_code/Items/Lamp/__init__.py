from anvil import *
import anvil.js

from ._anvil_designer import LampTemplate
from ... import state


class Lamp(LampTemplate):
    """A warning light on the Diagnose board: item = {id, label, crisis, on, host}. A click asks the page
    (host.toggle_light(id, on)) after lighting itself, so the keyboard focus stays put."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["crisis"] = bool(self.item.get("crisis"))
        self._show(bool(self.item.get("on")))
        anvil.js.get_dom_node(self).addEventListener("click", anvil.js.report_exceptions(self._click))

    def _show(self, on):
        self._on = on
        self.classes["on"] = on
        state.set_attr(self, "aria-pressed", "true" if on else "false")

    def _click(self, event):
        self._show(not self._on)
        self.item["host"].toggle_light(self.item["id"], self._on)
