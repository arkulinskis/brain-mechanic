from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import AdhdTemplate
from ... import bm, router, state

JUMP = [("relief", "Relief now"), ("check", "Is it ADHD?"), ("engine", "How it works"), ("myths", "Myths"), ("helps", "What helps"),
        ("systems", "Daily systems"), ("assess", "Get assessed"), ("support", "Support"), ("loved", "For loved ones")]
RELIEF_SUB = {"overwhelm_reset": "Breathe, brain-dump, pick one", "time_visible": "A timer you can see, plus your time multiplier",
              "two_minute": "Two minutes, then you may stop", "rejection_hit": "Ride the wave before you reply",
              "body_double": "Work alongside someone", "dopamine_menu": "Order a lift instead of scrolling"}


class Adhd(AdhdTemplate):
    """#adhd, #adhd/<section>: the ADHD Pit Lane (content in BM.ADHD, bm-data.js): relief, the two checks, how the
    engine works, myths, the evidence garage, daily systems, getting assessed, support, for loved ones."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.section = args[0] if args else ""
        A = bm.adhd()
        tools = bm.by_id("tools")
        for key, label in JUMP:
            b = Button(text=label, role=["bm-chip"])
            b.tag.key = key
            b.add_event_handler("click", self._jump)
            self.jump_box.add_component(b)
        self.relief_panel.items = [{"href": "#toolbox/" + r[0], "icon": r[2], "title": r[1], "sub": RELIEF_SUB.get(r[0]) or tools[r[0]]["line"], "cls": "pl-relief-link"}
                                   for r in A["relief"] if r[0] in tools]
        parked = bm.store("adhd.parked", []) or []
        self.parked_box.visible = bool(parked)
        self.parked_text.text = "You parked %s in your last overwhelm reset: %s%s." % (
            state.plural(len(parked), "thing"), ", ".join(str(p) for p in parked[:3]), "…" if len(parked) > 3 else "")
        scans = bm.by_id("scans")
        checks = []
        for sid, text in (("asrs", "The six-question adult screener developed with the World Health Organization, word for word, with its official scoring."),
                          ("adhd", "Our longer plain-language check: twelve signs, including childhood. Not validated, but good for reflection.")):
            if sid in scans:
                checks.append(bm.card("scans", scans[sid], line=text, foot="Start the check →"))
        self.checks_panel.items = checks
        last = [r for r in bm.local_results() if r.get("scan_id") == "asrs"]
        self.last_box.visible = bool(last)
        if last:
            r = last[0]
            self.last_level.text = r.get("label", "")
            self.last_level.role = ["bm-level", "l%s" % r.get("level", 0)]
            self.last_score.text = "%s/%s · %s" % (r.get("score"), r.get("max"), bm.fmt_date(r.get("taken")))
        self.criteria_panel.items = bm.lis(A["criteria"])
        self.pres_panel.items = [{"title": p[0], "text": p[1], "cls": "pl-pres-card"} for p in A["presentations"]]
        st = bm.meta()["STATUS"]["concept"][0]
        self.engine_panel.items = [{"title": e[0], "text": e[2], "badge": st if e[1] == "concept" else "Backed by research",
                                    "badge_cls": "" if e[1] == "concept" else "dx"} for e in A["engine"]]
        self.myths_panel.items = [{"m": m[0], "t": m[1]} for m in A["myths"]]
        S = A["strengths"]
        self.ev_panel.items = [{"head": True, "a": "Option", "b": "Evidence", "c": "What the research says"}] + \
            [{"a": e[0], "small": e[2], "badge": S[e[1]][0], "badge_cls": S[e[1]][1], "c": e[3]} for e in A["evidence"]]
        self.facts_panel.items = [{"title": f[0], "text": f[1], "cls": "bm-stat"} for f in A["facts"]]
        self.systems_panel.items = [{"icon": s.get("icon"), "title": s["n"], "line": s.get("line", ""), "tips": bm.lis(s.get("tips")),
                                     "chips": [{"href": "#toolbox/" + t, "text": tools[t]["n"], "code": "", "icon": "wrench"} for t in (s.get("tools") or []) if t in tools]}
                                    for s in A["systems"]]
        self.steps_panel.items = [{"b": s[0] + ".", "text": s[1]} for s in A["steps"]]
        self.redflags_panel.items = bm.lis(A["redflags"])
        self.countries_panel.items = [{"title": c[0], "text": c[1], "cls": "pl-country"} for c in A["countries"]]
        self.orgs_panel.items = [{"href": o[3], "tag": o[1], "title": o[0], "sub": o[2], "icon": "external", "cls": "pl-org"} for o in A["orgs"]]
        self.loved_panel.items = bm.lis(A["loved"])
        self.plan_button.plan_kind, self.plan_button.plan_ref = "condition", "adhd"

    def after_open(self):
        el = window.document.getElementById("pl-" + self.section) if self.section else None
        if el:
            window.setTimeout(lambda: el.scrollIntoView({"block": "start"}), 60)
        else:
            window.scrollTo(0, 0)

    def _jump(self, sender, **event_args):
        el = window.document.getElementById("pl-" + sender.tag.key)
        if el:
            el.scrollIntoView({"behavior": "smooth", "block": "start"})
        router.replace("adhd", sender.tag.key)

    def brake_click(self, event):
        bm.crisis()
