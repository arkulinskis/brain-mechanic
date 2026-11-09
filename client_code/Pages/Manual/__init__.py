from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import ManualTemplate
from ... import bm, router, state

POPULAR = ["can’t focus", "panic at night", "my mum", "narcissist", "always tired", "can’t say no", "overthinking",
           "my partner checks my phone", "imposter", "can’t sleep"]
GROUPS = [("condition", "conditions", "Repair manual", 9), ("pattern", "patterns", "Factory settings (upbringing)", 6),
          ("tool", "tools", "Toolbox", 6), ("scan", "scans", "Checks you can run", 6)]


class Manual(ManualTemplate):
    """#manual (every system), #manual/sys/<system>, #manual/s/<words> (lookup in your own words: the JavaScript
    lookup engine ranks entries, patterns, tools and checks)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        mode = args[0] if args else ""
        self.query = "/".join(args[1:]) if mode == "s" else ""
        m = bm.meta()
        self.sys = args[1] if mode == "sys" and len(args) > 1 and args[1] in m["systemById"] else None
        self.count_text.text = "%d entries across ten systems. Search in your own words, typos welcome." % len(bm.items("conditions"))
        state.set_control_attr(self.q_box, "aria-label", "Search the manual")
        state.set_control_attr(self.q_box, "type", "search")
        self.q_box.text = self.query
        self.chips = [self.all_chip]
        self.all_chip.tag.sys = ""
        self.all_chip.tag.base = ["bm-chip"]
        for s in m["SYSTEMS"]:
            b = Button(text=s["name"], role=["bm-chip", "ic-" + s["icon"]])
            b.tag.sys = s["id"]
            b.tag.base = ["bm-chip", "ic-" + s["icon"]]
            b.add_event_handler("click", self._chip)
            self.chips_box.add_component(b)
            self.chips.append(b)
        self.legend_panel.items = [{"b": m["STATUS"][k][0], "cls": k, "title": m["STATUS"][k][1]} for k in ("dx", "icd", "occ", "concept", "urgent")]
        self.popular_panel.items = [{"href": router.href("manual", "s", t), "text": t, "code": "", "icon": ""} for t in POPULAR]
        self._timer = None
        self._draw()

    def after_open(self):
        window.scrollTo(0, 0)
        if self.query == "" and window.location.hash.startswith("#manual/s"):
            state.focus(self.q_box)

    def _chip(self, sender, **event_args):
        self.sys = sender.tag.sys or None
        self.q_box.text = ""
        router.replace("manual", "sys", self.sys) if self.sys else router.replace("manual")
        self._draw()

    @handle("all_chip", "click")
    def all_chip_click(self, **event_args):
        self._chip(self.all_chip)

    @handle("q_box", "change")
    def q_box_change(self, **event_args):
        if self._timer is not None:
            window.clearTimeout(self._timer)
        self._timer = window.setTimeout(anvil.js.report_exceptions(self._typed), 160)

    @handle("q_box", "pressed_enter")
    def q_box_pressed_enter(self, **event_args):
        self._typed()

    def _typed(self):
        self._timer = None
        v = (self.q_box.text or "").strip()
        if v:
            self.sys = None
        try:
            router.replace("manual", "s", v) if v else router.replace("manual")
        except Exception:
            pass
        self._draw()

    def _draw(self):
        v = (self.q_box.text or "").strip()
        for b in self.chips:
            on = (not v) and ((b.tag.sys or None) == self.sys)
            b.role = list(b.tag.base) + (["on"] if on else [])
            state.set_control_attr(b, "aria-pressed", "true" if on else "false")
        self.popular_box.visible = not v and not self.sys
        self.none_box.visible = False
        if v:
            res = bm.search(v)
            groups = []
            if res:
                top = res[0]["score"]
                for typ, kind, title, most in GROUPS:
                    ids = [r["id"] for r in res if r["type"] == typ and r["score"] >= top * 0.2][:most]
                    if ids:
                        groups.append({"title": title, "count": len(ids), "cards": bm.cards(kind, ids), "cls": "mn-group"})
            self.groups_panel.items = groups
            self.none_title.text = "Nothing in the manual for “%s”" % v
            self.none_box.visible = not groups
            return
        conds = bm.items("conditions")
        groups = []
        for s in bm.meta()["SYSTEMS"]:
            if self.sys and s["id"] != self.sys:
                continue
            g = {"title": s["name"], "line": s["part"], "icon": s["icon"], "code": s["code"], "cls": "mn-sys",
                 "cards": [bm.card("conditions", c) for c in conds if c["sys"] == s["id"]]}
            if s["id"] == "factory":
                g["link_text"], g["link_href"] = "See all %d upbringing patterns" % len(bm.items("patterns")), "#factory"
            groups.append(g)
        self.groups_panel.items = groups
