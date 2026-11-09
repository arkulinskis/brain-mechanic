from anvil import *

from ._anvil_designer import PlanButtonTemplate
from ... import bm


class PlanButton(PlanButtonTemplate):
    """"Add to my repair plan" for a manual entry, pattern or tool (plan_kind = condition | pattern | tool)."""

    def __init__(self, **properties):
        self.plan_kind, self.plan_ref = "", ""
        super().__init__(**properties)

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        if bm.add_to_plan(self.plan_kind, self.plan_ref):
            self.add_button.text = "In your plan"
            self.add_button.role = ["btn", "btn-brass", "ic-check"]
            self.add_button.enabled = False
