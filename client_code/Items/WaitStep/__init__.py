from anvil import *

from ._anvil_designer import WaitStepTemplate
from ... import bm, state


class WaitStep(WaitStepTemplate):
    """One step of the waiting-room route: item = {n, kind, title, line, href, go, done, status, status_cls}.
    Check steps tick themselves (done) from results on this device and, for members, the logbook. The brake step
    opens the Emergency brake straight away."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        done = bool(i.get("done"))
        self.tick.classes["on"] = done
        self.classes["done"] = done
        self.status.text = i.get("status") or ""
        self.status.visible = bool(i.get("status"))
        self.status.role = ["bm-st"] + ([i["status_cls"]] if i.get("status_cls") else [])
        brake = i.get("kind") == "brake"
        self.brake_wrap.visible = brake
        self.go_link.visible = bool(i.get("href")) and not brake
        if i.get("href"):
            state.set_attr(self.go_link, "href", i["href"])
            self.go_text.text = i.get("go") or "Open"
            state.set_attr(self.go_link, "aria-label", "%s: %s" % (i.get("go") or "Open", i.get("title") or ""))

    def brake_click(self, event):
        bm.crisis()
