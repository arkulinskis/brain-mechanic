from anvil import *

from ._anvil_designer import PlanRowTemplate
from ... import state

STATUS = [("Want to try", "want"), ("Trying it", "trying"), ("Works for me", "works"), ("Not for me", "nope")]


class PlanRow(PlanRowTemplate):
    """A repair plan item in the Garage: item = {id, tag, title, href, note, status, sample, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        state.set_attr(self.title_link, "href", i["href"])
        self.note.visible = bool(i.get("note"))
        sample = bool(i.get("sample"))
        self.status_badge.visible = sample
        self.status_badge.text = dict((v, k) for k, v in STATUS).get(i.get("status"), STATUS[0][0])
        self.controls.visible = not sample
        self.status_box.items = STATUS
        self.status_box.selected_value = i.get("status") if i.get("status") in [v for _, v in STATUS] else "want"
        state.set_control_attr(self.status_box, "aria-label", "Status")

    @handle("status_box", "change")
    def status_box_change(self, **event_args):
        if state.call("plan_update", self.item["id"], self.status_box.selected_value, None) is not None:
            state.toast("Updated", "ok")

    @handle("note_button", "click")
    def note_button_click(self, **event_args):
        self.item["host"].plan_note(self.item)

    @handle("remove_button", "click")
    def remove_button_click(self, **event_args):
        self.item["host"].plan_remove(self.item["id"])
