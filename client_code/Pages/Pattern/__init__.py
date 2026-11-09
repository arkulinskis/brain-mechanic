from anvil import *

from ._anvil_designer import PatternTemplate
from ... import bm, state


class Pattern(PatternTemplate):
    """#factory/<id>: one upbringing pattern: the inner voice, what it looked like, what it can install, rewiring it,
    tools, where it shows up in the manual."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        p = bm.one("patterns", list(args)[0])
        g = bm.meta()["groupById"].get(p["grp"]) or {}
        self.page_title = p["n"]
        self.code.text = "FS · " + g.get("name", "")
        self.aka_panel.items = [{"b": a, "cls": ""} for a in (p.get("aka") or [])]
        self.title.text = p["n"]
        state.heading(self.title, 1)
        self.line.text = g.get("line", "")
        self.voice.text = p.get("voice", "")
        self.looked_panel.items = bm.lis(p.get("looked"))
        self.installs_panel.items = bm.lis(p.get("installs"))
        self.rewire_panel.items = bm.lis(p.get("rewire"))
        tools = bm.cards("tools", p.get("tools"))
        self.tools_sec.visible = bool(tools)
        self.tools_panel.items = tools
        conds = bm.cards("conditions", p.get("conds"))
        self.conds_sec.visible = bool(conds)
        self.conds_panel.items = conds
        self.research_card.visible = bool(p.get("note"))
        self.research.text = p.get("note") or ""
        self.question.text = "“%s”" % p.get("q", "")
        self.plan_button.plan_kind, self.plan_button.plan_ref = "pattern", p["id"]
