from anvil import *

from ._anvil_designer import CrisisBoxTemplate


class CrisisBox(CrisisBoxTemplate):
    """The Emergency brake: emergency numbers and free crisis lines (re-check the numbers when touching them).
    Shown in the Crisis dialog and on the Find a pro page. Raises leave when one of its links is followed."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def link_click(self, event):
        self.raise_event("leave")
