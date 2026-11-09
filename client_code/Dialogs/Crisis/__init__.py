from anvil import *

from ._anvil_designer import CrisisTemplate


class Crisis(CrisisTemplate):
    """The Emergency brake in a dialog (Components.CrisisBox)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.crisis_box.add_event_handler("leave", self._close)

    def _close(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self._close()
