from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import CrisisBoxTemplate
from ... import bm, state


class CrisisBox(CrisisBoxTemplate):
    """The Emergency brake: emergency numbers and free crisis lines (re-check the numbers when touching them).
    Shown in the Crisis dialog and on the Find a pro page. Raises leave when one of its links is followed.

    Safety rules: the lines are static HTML and show at once. The visitor's region (from the browser's time zone,
    nothing looked up) moves its line to the top. For members, their newest saved safety plan is read AFTER the box
    shows (a Timer + call_s, no spinner) and appears folded near the top; any failure just leaves it out."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.plan_fold.visible = False
        self.plan_data = {}
        try:
            window.BM.regionFirst(anvil.js.get_dom_node(self))
        except Exception:
            pass
        if state.me():
            self.plan_timer.interval = 0.15

    @handle("plan_timer", "tick")
    def plan_timer_tick(self, **event_args):
        self.plan_timer.interval = 0
        try:
            r = anvil.server.call_s("get_safety_plan")
            plan = (r.get("plan") if isinstance(r, dict) and r.get("ok") else None) or {}
            rows = bm.safety_rows(plan.get("data") or {})
        except Exception:
            return  # the lines are already on screen; the plan is a bonus
        if not rows:
            return
        self.plan_data = plan.get("data") or {}
        self.plan_cap.text = "Your safety plan · saved %s" % bm.fmt_date(plan.get("created"))
        self.plan_panel.items = [{"b": row[0], "text": row[1]} for row in rows]
        self.plan_fold.visible = True

    @handle("card_button", "click")
    def card_button_click(self, **event_args):
        if not bm.glovebox(bm.safety_rows(self.plan_data)):
            state.toast("This browser couldn’t make the picture. Try another browser, or take a screenshot.", "error")

    def link_click(self, event):
        self.raise_event("leave")
