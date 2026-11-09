from anvil import *

from ._anvil_designer import JournalRowTemplate


class JournalRow(JournalRowTemplate):
    """A saved worksheet in the Garage, folded: item = {id, title, when, fields: [{b, text}], sample, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.fields_panel.items = self.item["fields"]
        self.delete_button.visible = not self.item.get("sample")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.item["host"].journal_delete(self.item["id"])
