from anvil import *

from ._anvil_designer import QuestionTemplate


class Question(QuestionTemplate):
    """One question of a check: item = {i, n, q, opts: [[label, value]], shade, group, host}. The answers are radio
    buttons; picking one tells the page (host.answer). shade = the lowest value the ASRS screener counts."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.buttons = []
        for label, value in i["opts"]:
            rb = RadioButton(text=label, value=value, group_name=i["group"], role=["sc-opt"])
            if i.get("shade") is not None and value >= i["shade"]:
                rb.role = ["sc-opt", "shade"]
            rb.add_event_handler("change", self._picked)
            self.opts_panel.add_component(rb)
            self.buttons.append(rb)
        i["host"].register(i["i"], self)

    def _picked(self, sender, **event_args):
        if sender.selected:
            self.item["host"].answer(self.item["i"], sender.value)

    def mark(self, done=None, miss=None):
        if done is not None:
            self.classes["done"] = done
        if miss is not None:
            self.classes["miss"] = miss
