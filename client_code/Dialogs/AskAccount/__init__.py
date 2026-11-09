from anvil import *

from ._anvil_designer import AskAccountTemplate


class AskAccount(AskAccountTemplate):
    """"Keep a logbook": why an account helps (why = the reason for this moment), Sign in / Create a free account."""

    def __init__(self, why="", **properties):
        super().__init__(**properties)
        self.why.text = (why or "Your repair plan, gauge readings and saved worksheets live in your private logbook.") + \
            " A free account keeps them safe across devices. Only you see them."

    def _close(self, event=None):
        self.raise_event("x-close-alert", value=None)

    def link_click(self, event):
        self._close()

    @handle("later_button", "click")
    def later_button_click(self, **event_args):
        self._close()
