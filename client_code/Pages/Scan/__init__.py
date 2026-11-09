from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import ScanTemplate
from ... import bm, state


class Scan(ScanTemplate):
    """#scan/<id>: runs one check. Questions are radio buttons (Items.Question); scoring is the JavaScript engine's
    (BM.scoreScan: bands, ASRS shaded boxes, attachment dials, factory settings, safety flags). The result is kept in
    this browser; members can save it to their logbook (save_scan). Anonymous monthly tally: count_scan."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.scan = bm.one("scans", args[0] if args else "")
        self.questions = {}
        self.result_part.visible = False
        if not self.scan:
            self.form_part.visible = False
            self.missing.visible = True
            return
        self.missing.visible = False
        s = self.scan
        self.page_title = s["n"]
        k = s.get("kind")
        self.kind.text = "Published screener" if k == "validated" else "Pattern check · not validated" if k == "pattern" else "Childhood"
        self.kind.role = ["bm-st", "dx"] if k == "validated" else ["bm-st"] if k == "pattern" else ["bm-st", "occ"]
        self.time.text = s.get("time", "")
        self.items = bm.scan_items(s["id"])
        self.qcount.text = "%d questions" % len(self.items)
        self.title.text = s["n"]
        state.heading(self.title, 1)
        self.intro.text = s.get("intro", "")
        self.gate_box.visible = bool(s.get("gate"))
        self.gate_q.text = s.get("gate") or ""
        self.items_box.visible = not s.get("gate")
        self.shade_note.visible = bool(s.get("shade"))
        src = " ".join(x for x in (s.get("source"), s.get("note")) if x)
        self.source.text = src
        self.source.visible = bool(src)
        self._reset()

    def _reset(self):
        self.answers = [None] * len(self.items)
        self.gate = None if self.scan.get("gate") else True
        self.questions = {}
        self.q_panel.items = [{"i": i, "n": "%02d" % (i + 1), "q": it["q"], "opts": it["opts"], "shade": it.get("shade"),
                               "group": "q%d" % i, "host": self} for i, it in enumerate(self.items)]
        self.gate_yes.selected = self.gate_no.selected = False
        self.ack.checked = False
        self.hint.text = ""
        self.items_box.visible = not self.scan.get("gate")
        self._fuel()

    def register(self, i, q):
        self.questions[i] = q

    def answer(self, i, value):
        self.answers[i] = float(value) if "." in str(value) else int(value)  # RadioButton values come back as text
        self.questions[i].mark(done=True, miss=False)
        self._fuel()

    @handle("gate_yes", "change")
    def gate_yes_change(self, **event_args):
        self._gate(True)

    @handle("gate_no", "change")
    def gate_no_change(self, **event_args):
        self._gate(False)

    def _gate(self, value):
        self.gate = value
        self.items_box.visible = value
        self.gate_box.classes["miss"] = False
        self._fuel()

    def _fuel(self):
        need = 0 if self.gate is False else len(self.items)
        done = 0 if self.gate is False else len([a for a in self.answers if a is not None])
        self.fuel_count.text = "done" if self.gate is False else "%d / %d" % (done, need)
        self.fuel_fill.style["width"] = "%d%%" % (100 if self.gate is False else int(round(100.0 * done / max(1, need))))

    @handle("run_button", "click")
    def run_button_click(self, **event_args):
        s = self.scan
        if s.get("gate") and self.gate is None:
            self.hint.text = "Answer the first question first."
            self.gate_box.classes["miss"] = True
            return
        missing = [] if self.gate is False else [i for i, a in enumerate(self.answers) if a is None]
        if missing:
            for i in missing:
                self.questions[i].mark(miss=True)
            self.hint.text = state.plural(len(missing), "question") + " left"
            anvil.js.get_dom_node(self.questions[missing[0]]).scrollIntoView({"behavior": "smooth", "block": "center"})
            return
        if not self.ack.checked:
            self.hint.text = "Please tick the box above first."
            return
        r = bm.score(s["id"], self.answers, None if not s.get("gate") else self.gate)
        r["id"] = "r%d" % int(window.Date.now())
        bm.add_local({k: r.get(k) for k in ("id", "scan_id", "score", "max", "level", "label", "taken", "detail")})
        try:
            anvil.server.call_s("count_scan", s["id"])
        except Exception:
            pass
        self.result = r
        self._show(r)
        if "crisis" in (r.get("flags") or []):
            bm.crisis()

    def _show(self, r):
        s = self.scan
        self.form_part.visible = False
        self.result_part.visible = True
        window.scrollTo(0, 0)
        mx = r.get("max") or 0
        self.gauge.draw(value=(10.0 * r["score"] / mx) if mx else 0, max=10, label="patterns" if s.get("kind") == "factory" else "score",
                        shown="%s/%s" % (r["score"], mx), invert=True)
        self.level.text = r.get("label", "")
        self.level.role = ["bm-level", "l%s" % r.get("level", 0)]
        self.r_title.text = s["n"]
        self.r_text.text = r.get("text", "")
        k = s.get("kind")
        self.r_note.text = ("A screener result, not a diagnosis. Only a clinician who meets you can diagnose." if k in ("validated", "aces") else
                            ("A pattern check, not a validated test. " if k == "pattern" else "") + "It shows which lights your answers switch on, not what you “have”.")
        me = bool(state.me())
        self.save_button.visible = me
        self.save_guest_button.visible = not me
        self.save_button.enabled, self.save_button.text = True, "Save to my logbook"
        flags = r.get("flags") or []
        self.flag_crisis.visible = "crisis" in flags
        self.flag_abuse.visible = "abuse" in flags
        self.flag_doctor.visible = "doctor" in flags
        d = r.get("detail") or {}
        self.dials.visible = bool(d.get("style"))
        if d.get("style"):
            self.dot.style["left"], self.dot.style["bottom"] = "%s%%" % d["avo"], "%s%%" % d["anx"]
            self.anx_fill.style["width"], self.avo_fill.style["width"] = "%s%%" % d["anx"], "%s%%" % d["avo"]
            self.anx_pct.text, self.avo_pct.text = "%s%%" % d["anx"], "%s%%" % d["avo"]
        pats = bm.by_id("patterns")
        top = [t for t in (d.get("top") or []) if t[0] in pats]
        self.top_sec.visible = bool(top)
        self.top_panel.items = [bm.card("patterns", pats[t[0]], level="Clearly" if t[1] == 2 else "A bit", level_cls="l3" if t[1] == 2 else "l1") for t in top]
        self.bay.visible = s.get("bay") == "adhd"
        c = bm.by_id("conditions").get(s.get("cond"))
        self.cond_sec.visible = bool(c)
        self.cond_panel.items = [bm.card("conditions", c)] if c else []
        tools = bm.cards("tools", s.get("next"))
        self.tools_sec.visible = bool(tools)
        self.tools_panel.items = tools

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        r = self.result
        payload = {k: r.get(k) for k in ("scan_id", "score", "max", "level", "label", "detail", "taken")}
        if state.call("save_scan", payload) is not None:
            state.toast("Saved to your logbook", "ok")
            self.save_button.text, self.save_button.enabled = "Saved", False

    @handle("save_guest_button", "click")
    def save_guest_button_click(self, **event_args):
        bm.ask_account("Save this result and track how it changes over time.")

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        self.result_part.visible = False
        self.form_part.visible = True
        self._reset()
        window.scrollTo(0, 0)

    def brake_click(self, event):
        bm.crisis()
