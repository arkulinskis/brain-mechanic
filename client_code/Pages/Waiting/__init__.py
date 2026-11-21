from anvil import *
import anvil.server

from ._anvil_designer import WaitingTemplate
from ... import bm, state

PLAN_STATUS = {"want": "In your plan", "trying": "Trying it", "works": "Works for me", "nope": "Not for me"}


class Waiting(WaitingTemplate):
    """#waiting: the waiting-room route, four weeks of steps while you wait for care (BM.WAIT in bm-data.js).
    Check steps tick themselves from results on this device; for members a quiet logbook read (after the page
    shows) adds their logbook results, plan status and saved safety plan. Members can add the route's tools to
    their repair plan (plan_add_many skips what's already there). No new storage."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.route = bm.wait_route()
        self.server_scans, self.plan, self.has_plan = [], {}, False
        self.sources_panel.items = [{"href": u, "code": "", "text": t, "icon": "external"} for t, u in self.route.get("sources") or []]
        me = bool(state.me())
        self.plan_button.text = "Add route to my repair plan" if me else "Keep this route in a logbook"
        self._draw()
        if me:
            self.load_timer.interval = 0.2

    def _tools(self):
        return [st["id"] for w in self.route.get("weeks") or [] for st in w.get("steps") or [] if st.get("kind") == "tool"]

    def _draw(self):
        groups = bm.by_scan(bm.merge_results(bm.local_results(), self.server_scans))
        weeks, auto, done = [], 0, 0
        for w in self.route.get("weeks") or []:
            steps = []
            for i, st in enumerate(w.get("steps") or []):
                d = self._step(w, i, st, groups)
                if d is None:
                    continue
                if d["kind"] in ("scan", "recheck"):
                    auto += 1
                    done += 1 if d["done"] else 0
                steps.append(d)
            weeks.append({"badge": "WEEK %d" % w["n"] if w["n"] else "START", "title": w.get("title", ""), "why": w.get("why", ""), "steps": steps})
        self.weeks_panel.items = weeks
        self.progress.text = "%d of %d checks done. Check steps tick themselves when you run them%s." % (
            done, auto, "" if state.me() else " on this device")

    def _step(self, w, i, st, groups):
        kind, ident = st.get("kind"), st.get("id")
        d = {"n": "%d.%d" % (w["n"], i + 1), "kind": kind, "line": st.get("line", ""), "href": "", "go": "Open",
             "done": False, "status": "", "status_cls": "", "title": ""}
        scans, tools = bm.by_id("scans"), bm.by_id("tools")
        if kind == "brake":
            d["title"] = "Find the Emergency brake"
        elif kind == "tool":
            t = tools.get(ident)
            if not t:
                return None
            d.update(title=t["n"], href="#toolbox/" + ident)
            if ident == "safety_plan" and self.has_plan:
                d.update(done=True, status="Saved in your logbook", status_cls="dx", go="Open")
            elif ident in self.plan:
                d.update(status=PLAN_STATUS.get(self.plan[ident], "In your plan"), status_cls="dx" if self.plan[ident] == "works" else "")
        elif kind == "glovebox":
            d.update(title="Make your Glovebox card", href="#toolbox/safety_plan", go="Make it")
        elif kind in ("scan", "recheck"):
            s = scans.get(ident)
            if not s:
                return None
            rows = groups.get(ident) or []
            m = bm.mileage(rows)
            d["href"] = "#scan/" + ident
            if kind == "scan":
                d.update(title=s["n"], done=bool(rows), go="Run it again" if rows else "Run it")
                if rows:
                    d["status"] = "%s · %s" % (bm.fmt_date(rows[-1].get("taken")), bm.score_text(rows[-1]))
            else:
                d.update(title="Re-check: " + s["n"], done=len(rows) >= 2, go="Re-check")
                if len(rows) >= 2:
                    d["status"] = "%s → %s" % (bm.score_text(rows[0]), bm.score_text(rows[-1]))
                elif rows:
                    d.update(status=bm.due_text(m), status_cls="occ" if m and m["due"] else "")
                else:
                    d["status"] = "Take the baseline first"
        elif kind == "workorder":
            d.update(title="Make a work order", href="#workorder", go="Build it")
        elif kind == "link":
            d.update(title="Questions to ask", href="#" + (ident or "help"), go="See them")
        elif kind == "tip":
            d["title"] = "Ask about a cancellation list"
        else:
            return None
        return d

    @handle("load_timer", "tick")
    def load_timer_tick(self, **event_args):
        self.load_timer.interval = 0
        try:
            d = anvil.server.call_s("get_garage")
        except Exception:
            return  # the route works without the logbook
        if not isinstance(d, dict):
            return
        self.server_scans = d.get("scans") or []
        self.plan = {p["ref"]: p.get("status") or "want" for p in d.get("plan") or [] if p.get("kind") == "tool"}
        self.has_plan = any(j.get("tool") == "safety_plan" for j in d.get("journal") or [])
        self._draw()

    @handle("plan_button", "click")
    def plan_button_click(self, **event_args):
        if not state.me():
            bm.ask_account("Add the route’s tools to your repair plan and mark how each one works for you.")
            return
        r = state.call("plan_add_many", "tool", self._tools())
        if r is None:
            return
        added, existed = r.get("added", 0), r.get("existed", 0)
        state.toast(("Added %s to your repair plan" % state.plural(added, "tool")) + (" (%d already there)" % existed if existed else "")
                    if added else "All of the route’s tools are already in your plan", "ok")
        for ident in self._tools():
            self.plan.setdefault(ident, "want")
        self._draw()

    def brake_click(self, event):
        bm.crisis()
