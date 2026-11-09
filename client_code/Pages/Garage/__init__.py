import json

from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import GarageTemplate
from ... import bm, state

G = [("mood", "Mood", 10, False, ""), ("energy", "Energy", 10, False, ""), ("sleep", "Sleep", 12, False, "h"),
     ("stress", "Stress", 10, True, ""), ("focus", "Focus", 10, False, "")]
KIND_TAG = {"condition": "conditions", "pattern": "patterns", "tool": "tools"}
WIPE_KEYS = ["adhd.dump", "adhd.parked", "adhd.times", "adhd.menu", "adhd.door"]


class Garage(GarageTemplate):
    """#garage: the member's private logbook: instrument cluster (latest gauges) + check-engine lamps, today's
    reading, the 30-day chart, service history (saved checks; import the ones kept in this browser), the repair
    plan, saved worksheets, download / delete everything. A brand-new logbook shows sample readings."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.gauges = {"mood": self.g_mood, "energy": self.g_energy, "sleep": self.g_sleep, "stress": self.g_stress, "focus": self.g_focus}
        self.sliders = {"mood": self.s_mood, "energy": self.s_energy, "sleep": self.s_sleep, "stress": self.s_stress, "focus": self.s_focus}
        self.outs = {"mood": self.o_mood, "energy": self.o_energy, "sleep": self.o_sleep, "stress": self.o_stress, "focus": self.o_focus}
        for key, label, mx, inv, unit in G:
            box = self.sliders[key]
            el = state.control(box)
            el.setAttribute("type", "range")
            el.setAttribute("min", "0")
            el.setAttribute("max", "14" if key == "sleep" else "10")
            el.setAttribute("step", "0.5" if key == "sleep" else "1")
            state.set_control_attr(box, "aria-label", label)
            el.addEventListener("input", anvil.js.report_exceptions(lambda e, k=key: self._slid(k)))
        state.set_control_attr(self.note_box, "maxlength", 280)
        state.set_control_attr(self.note_box, "aria-label", "One line about today")
        me = state.me() or {}
        hour = int(window.Date().getHours())
        self.hello.text = "%s, %s. How’s the engine?" % ("Morning" if hour < 12 else "Afternoon" if hour < 18 else "Evening",
                                                        (me.get("name") or "there").split(" ")[0])
        state.heading(self.hello, 1)
        self._load()

    def _slid(self, key):
        v = str(state.control(self.sliders[key]).value)
        self.outs[key].text = v + ("h" if key == "sleep" else "")

    def _load(self):
        d = state.call("get_garage")
        if d is None:
            return
        self.book = d
        sample = bool(d.get("sample"))
        b = d["sample"] if sample else d
        today_iso = bm.local_date()
        latest = b["gauges"][0] if b["gauges"] else None
        today = next((g for g in b["gauges"] if g.get("day") == today_iso), None)
        self.sample_box.visible = sample
        self.cluster_cap.text = "INSTRUMENT CLUSTER · " + (bm.fmt_date(latest["day"]).upper() if latest else "NO READINGS YET")
        self.readings_cap.text = "%d READINGS" % len(b["gauges"])
        for key, label, mx, inv, unit in G:
            v = latest.get(key) if latest else None
            self.gauges[key].draw(value=0 if v is None else v, max=mx, label=label, shown="–" if v is None else v,
                                  unit="" if v is None else unit, invert=inv)
        since = window.Date.now() - 60 * 864e5
        recent = {}
        for s in b["scans"]:
            if window.Date.parse(s.get("taken") or "") > since and s["scan_id"] not in recent:
                recent[s["scan_id"]] = s
        scans = bm.by_id("scans")
        lit = [s for s in recent.values() if (s.get("level") or 0) >= 2]
        self.lamps_panel.items = ([{"href": "#scan/" + s["scan_id"], "cls": "l%s" % s["level"],
                                    "text": "%s: %s" % (scans.get(s["scan_id"], {}).get("n", s["scan_id"]), s.get("label", ""))} for s in lit]
                                  or [{"href": "", "cls": "ok", "text": "All clear in the last 60 days"}])
        own = today if (today and not sample) else None
        self.reading_title.text = "Today’s reading (update it)" if own else "Log today’s reading"
        for key, label, mx, inv, unit in G:
            v = own.get(key) if own and own.get(key) is not None else (7 if key == "sleep" else 5)
            state.control(self.sliders[key]).value = str(v)
            self.outs[key].text = str(v) + unit
        self.note_box.text = (own or {}).get("note") or ""
        self.chart.draw(b["gauges"])
        server = d.get("scans") or []
        local = [r for r in bm.local_results()
                 if not any(s["scan_id"] == r.get("scan_id") and abs(window.Date.parse(s.get("taken") or "") - window.Date.parse(r.get("taken") or "")) < 2000 for s in server)]
        self.import_box.visible = bool(local) and not sample
        self.import_text.text = "%s on this device aren’t in your logbook yet." % state.plural(len(local), "result")
        self.local = local
        self.scans_panel.items = [{"id": s.get("id"), "level": s.get("level", 0), "label": s.get("label", ""), "scan_id": s["scan_id"],
                                   "title": scans.get(s["scan_id"], {}).get("n", s["scan_id"]),
                                   "sub": "%s · %s of %s" % (bm.fmt_date(s.get("taken")), s.get("score"), s.get("max")),
                                   "host": None if sample else self} for s in b["scans"]]
        self.no_scans.visible = not b["scans"]
        plan = []
        for p in b["plan"]:
            kind = KIND_TAG.get(p.get("kind"), "conditions")
            o = bm.by_id(kind).get(p.get("ref"))
            tag = (o or {}).get("code") if kind == "conditions" else "FS" if kind == "patterns" else "TOOL"
            plan.append({"id": p.get("id"), "tag": tag if o else "?", "title": o["n"] if o else p.get("ref"), "href": bm.href(kind, p["ref"]) if o else "#manual",
                         "note": p.get("note"), "status": p.get("status"), "sample": sample, "host": self})
        self.plan_panel.items = plan
        self.no_plan.visible = not plan
        tools = bm.by_id("tools")
        jr = []
        for j in b["journal"]:
            t = tools.get(j.get("tool"))
            data = j.get("data") or {}
            fields = (t or {}).get("fields") or [[k, k] for k in data]
            jr.append({"id": j.get("id"), "title": t["n"] if t else j.get("tool"), "when": "· " + bm.fmt_date(j.get("created")), "sample": sample, "host": self,
                       "fields": [{"b": f[1], "text": str(data[f[0]])} for f in fields if data.get(f[0]) not in (None, "")]})
        self.journal_panel.items = jr
        self.no_journal.visible = not jr

    # ---- today's reading
    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        v = {key: str(state.control(self.sliders[key]).value) for key, label, mx, inv, unit in G}
        v["note"] = self.note_box.text or ""
        if state.call("save_gauge", v, bm.local_date()) is not None:
            state.toast("Reading saved", "ok")
            self._load()

    # ---- service history
    def delete_scan(self, ident):
        if confirm("Delete this result?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_scan", ident) is not None:
                self._load()

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        r = state.call("import_scans", bm.local_results())
        if r is not None:
            state.toast("%s saved to your logbook" % r.get("imported", 0), "ok")
            self._load()

    # ---- repair plan + worksheets
    def plan_note(self, item):
        from ...Dialogs.PlanNote import PlanNote
        if alert(PlanNote(item_id=item["id"], note=item.get("note") or ""), buttons=[], role="app-dialog"):
            self._load()

    def plan_remove(self, ident):
        if state.call("plan_remove", ident) is not None:
            self._load()

    def journal_delete(self, ident):
        if confirm("Delete this worksheet?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("journal_delete", ident) is not None:
                self._load()

    # ---- your data
    @handle("export_button", "click")
    def export_button_click(self, **event_args):
        d = state.call("export_logbook")
        if d is not None:
            window.BM.download("brain-mechanic-logbook-%s.json" % bm.local_date(), json.dumps(d, indent=2), "application/json")

    @handle("wipe_button", "click")
    def wipe_button_click(self, **event_args):
        if not confirm("Every reading, saved check, plan item and worksheet will be gone for good. Results kept in this browser "
                       "are cleared too. Your account stays.", title="Delete your whole logbook?",
                       buttons=[("Cancel", False), ("Delete everything", True)], role="app-dialog"):
            return
        r = state.call("clear_logbook")
        if r is not None:
            bm.clear_local()
            for k in WIPE_KEYS:
                bm.forget(k)
            state.toast("%s entries deleted" % r.get("deleted", 0), "ok")
            self._load()
