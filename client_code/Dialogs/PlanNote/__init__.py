from anvil import *

from ._anvil_designer import PlanNoteTemplate
from ... import state


class PlanNote(PlanNoteTemplate):
    """A note to yourself on a repair plan item. Closes with True when saved."""

    def __init__(self, item_id="", note="", **properties):
        super().__init__(**properties)
        self.item_id = item_id
        self.note_box.text = note or ""
        state.set_control_attr(self.note_box, "aria-label", "Your note")
        state.set_control_attr(self.note_box, "maxlength", 500)

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=False)

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        if state.call("plan_update", self.item_id, None, self.note_box.text or "") is not None:
            self.raise_event("x-close-alert", value=True)
