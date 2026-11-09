from anvil import *

from ._anvil_designer import PickTemplate


class Pick(PickTemplate):
    """A tick box with a line of text: item = {key, text, sub, checked, host, kind}; ticking calls host.pick(kind, key, on)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.box.checked = bool(self.item.get("checked"))
        self.sub.visible = bool(self.item.get("sub"))

    @handle("box", "change")
    def box_change(self, **event_args):
        self.item["host"].pick(self.item.get("kind"), self.item["key"], self.box.checked)
