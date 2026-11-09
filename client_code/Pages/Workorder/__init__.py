from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import WorkorderTemplate
from ... import bm, state

WANTS = ["An assessment for what’s going on", "To talk about treatment options", "A referral to a specialist", "To rule out physical causes",
         "Medication advice", "Therapy recommendations"]


class Workorder(WorkorderTemplate):
    """#workorder: a one-page summary for a professional, built in the browser (draft kept in brainmechanic.wo):
    check results (this device + the member's logbook), warning lights, own words, what they'd like. Print or copy."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        raw = bm.store("wo", None) or {}
        self.draft: dict = {"noticed": str(raw.get("noticed") or ""), "since": str(raw.get("since") or ""),
                            "questions": str(raw.get("questions") or ""), "wants": list(raw.get("wants") or [])}
        lights = bm.meta()["lightById"]
        self.lights = [i for i in (bm.store("lights", []) or []) if i in lights]
        self.results = [dict(r, src="device") for r in bm.local_results()]
        if state.me():
            d = state.call("get_garage")
            if d and not d.get("sample"):
                self._merge(d.get("scans") or [])
        self._pick_newest()
        scans = bm.by_id("scans")
        self.picks_panel.items = [{"kind": "result", "key": self._key(r), "checked": self.picked.get(self._key(r)),
                                   "text": "%s · %s" % (scans[r["scan_id"]]["n"], r.get("label", "")),
                                   "sub": "%s · %s" % (bm.fmt_date(r.get("taken")), "logbook" if r["src"] == "logbook" else "this device"), "host": self}
                                  for r in self.results if r.get("scan_id") in scans]
        self.no_results.visible = not self.results
        self.lights_text.text = ("%d lights from the Diagnose page are on the sheet. " % len(self.lights)) if self.lights else "None ticked yet. "
        self.wants_panel.items = [{"kind": "want", "key": w, "text": w, "checked": w in self.draft["wants"], "host": self} for w in WANTS]
        self.noticed_box.text = str(self.draft["noticed"])
        self.since_box.text = str(self.draft["since"])
        self.questions_box.text = str(self.draft["questions"])
        for box, label, n in ((self.noticed_box, "What I’ve noticed", 1500), (self.since_box, "How long it’s been going on", 80),
                              (self.questions_box, "Questions I want to ask", 1000)):
            state.set_control_attr(box, "maxlength", n)
        me = state.me()
        self.who.text = ((me.get("name") + " · ") if me and me.get("name") else "") + str(
            window.eval("new Date().toLocaleDateString([], {day: 'numeric', month: 'long', year: 'numeric'})"))
        self._sheet()

    @staticmethod
    def _key(r):
        return "%s|%s" % (r.get("scan_id"), str(r.get("taken"))[:19])

    def _merge(self, server):
        for s in server:
            t = window.Date.parse(s.get("taken") or "")
            if not any(r["scan_id"] == s["scan_id"] and abs(window.Date.parse(r.get("taken") or "") - t) < 2000 for r in self.results):
                self.results.append(dict(s, src="logbook"))

    def _pick_newest(self):
        self.results.sort(key=lambda r: str(r.get("taken") or ""), reverse=True)
        self.picked, seen = {}, set()
        for r in self.results:
            if r["scan_id"] not in seen:
                self.picked[self._key(r)] = True
                seen.add(r["scan_id"])

    def pick(self, kind, key, on):
        if kind == "result":
            self.picked[key] = on
        else:
            self.draft["wants"] = [w for w in self.draft["wants"] if w != key] + ([key] if on else [])
        self._save()

    @handle("noticed_box", "change")
    def noticed_box_change(self, **event_args):
        self.draft["noticed"] = self.noticed_box.text or ""
        self._save()

    @handle("since_box", "change")
    def since_box_change(self, **event_args):
        self.draft["since"] = self.since_box.text or ""
        self._save()

    @handle("questions_box", "change")
    def questions_box_change(self, **event_args):
        self.draft["questions"] = self.questions_box.text or ""
        self._save()

    def _save(self):
        bm.store_set("wo", self.draft)
        self._sheet()

    def _sheet(self):
        d = self.draft
        lights = bm.meta()["lightById"]
        scans = bm.by_id("scans")
        noticed, since, questions = str(d["noticed"]), str(d["since"]), str(d["questions"])
        self.s_noticed.text = noticed or "(add a few lines on the left)"
        self.s_noticed.role = [] if noticed else ["wo-empty"]
        self.s_since.visible = bool(since)
        self.s_since.text = "Going on for: " + since
        self.s_lights.items = [{"text": lights[l]["label"]} for l in self.lights]
        self.s_lights_empty.visible = not self.lights
        chosen = [r for r in self.results if self.picked.get(self._key(r))]
        rows = []
        for r in chosen:
            s = scans.get(r["scan_id"]) or {}
            rows.append({"check": s.get("n", r["scan_id"]), "note": "pattern check, not validated" if s.get("kind") == "pattern" else "",
                         "score": "%s / %s" % (r.get("score"), r.get("max")), "label": r.get("label", ""), "date": bm.fmt_date(r.get("taken"))})
        self.s_results.items = ([{"head": True, "check": "Check", "score": "Score", "label": "Result", "date": "Date"}] + rows) if rows else []
        self.s_results_empty.visible = not rows
        self.s_wants.items = [{"text": w} for w in d["wants"]]
        self.s_wants_empty.visible = not d["wants"]
        self.s_questions.text = questions or "(optional)"
        self.s_questions.role = [] if questions else ["wo-empty"]

    def _text(self):
        return str(anvil.js.get_dom_node(self.sheet).innerText)

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        try:
            window.navigator.clipboard.writeText(self._text())
            state.toast("Copied", "ok")
        except Exception:
            state.toast("Select the sheet and copy it by hand.", "error")

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        window.print()
