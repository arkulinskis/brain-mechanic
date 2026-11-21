from anvil import *

from ._anvil_designer import WaitWeekTemplate
from ... import state


class WaitWeek(WaitWeekTemplate):
    """One week of the waiting-room route: item = {badge, title, why, steps: [WaitStep items]}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.heading(self.title, 2)
        self.steps_panel.items = self.item.get("steps") or []
