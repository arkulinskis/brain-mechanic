from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import DiagnoseTemplate
from ... import bm, state


class Diagnose(DiagnoseTemplate):
    """#diagnose: the warning-light board. Lights stay in this browser (brainmechanic.lights); the panel ranks the
    manual entries that share them (BM.rankLights). A crisis light opens the Emergency brake."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.scans_count.text = str(len(bm.items("scans")))
        lights = bm.meta()["lightById"]
        self.on = [i for i in (bm.store("lights", []) or []) if i in lights]
        self._board()
        self._draw()

    def _board(self):
        m = bm.meta()
        groups = []
        for s in m["SYSTEMS"]:
            ls = [l for l in m["LIGHTS"] if l[2] == s["id"]]
            if ls:
                groups.append({"title": s["name"], "icon": s["icon"],
                               "lamps": [{"id": l[0], "label": l[1], "crisis": len(l) > 3 and l[3] == "crisis", "on": l[0] in self.on, "host": self}
                                         for l in ls]})
        self.board_panel.items = groups

    def toggle_light(self, ident, on):
        if on and ident not in self.on:
            self.on.append(ident)
        if not on and ident in self.on:
            self.on.remove(ident)
        self._draw()
        if on and bm.meta()["lightById"][ident]["crisis"]:
            bm.crisis()

    def _draw(self):
        bm.store_set("lights", self.on)
        lights = bm.meta()["lightById"]
        conds = bm.by_id("conditions")
        ranked = bm.rank_lights(self.on)[:8]
        self.count.text = str(len(self.on))
        self.panel_sub.text = "Lights on right now" if self.on else "Tick a light to begin"
        self.crisis_box.visible = any(lights[i]["crisis"] for i in self.on)
        rows = []
        for r in ranked:
            c = conds.get(r["id"]) or {}
            hits = [lights[h]["label"].lower() for h in r["hits"]]
            rows.append({"id": r["id"], "code": c.get("code", ""), "n": c.get("n", ""), "scan": c.get("scan"),
                         "pct": int(round(100.0 * len(r["hits"]) / max(1, r["of"]))),
                         "hits_text": "%d of its %d lights: %s%s" % (len(r["hits"]), r["of"], "; ".join(hits[:3]), "…" if len(hits) > 3 else "")})
        self.matches_panel.items = rows
        self.matches_note.visible = bool(rows)
        self.empty_box.visible = not rows
        self.jump_text.text = "%s on · see matches" % state.plural(len(self.on), "light")
        self.bar.classes["show"] = bool(self.on)

    @handle("clear_button", "click")
    def clear_button_click(self, **event_args):
        self.on = []
        self._board()
        self._draw()

    def jump_click(self, event):
        event.preventDefault()
        anvil.js.get_dom_node(self.out).scrollIntoView({"behavior": "smooth", "block": "start"})

    def brake_click(self, event):
        bm.crisis()
