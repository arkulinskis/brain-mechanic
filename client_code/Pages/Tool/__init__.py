from anvil import *

from ._anvil_designer import ToolTemplate
from ... import bm, state


class Tool(ToolTemplate):
    """#toolbox/<id>: one tool: its live widget (bm-engine.js) or worksheet (Components.Worksheet), how to do it,
    why it works, what it's used for. ADHD tools link back to the Pit Lane."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        t = bm.one("tools", list(args)[0])
        cat = bm.meta()["catById"].get(t["cat"]) or {}
        self.page_title = t["n"]
        adhd = t.get("cat") == "adhd"
        state.set_attr(self.back_link, "href", "#adhd" if adhd else "#toolbox")
        self.back_text.text = "ADHD Pit Lane" if adhd else "Toolbox"
        self.code.text = cat.get("name", "")
        self.time.text = t.get("time", "")
        self.title.text = t["n"]
        state.heading(self.title, 1)
        self.line.text = t.get("line", "")
        w = t.get("w") or ""
        self.widget.visible = bool(w) and w not in ("sheet", "garage")
        if self.widget.visible:
            self.widget.tool_id = t["id"]
        self.sheet.visible = w == "sheet"
        if w == "sheet":
            self.sheet.tool_id = t["id"]
        self.garage_box.visible = w == "garage"
        self.steps_panel.items = bm.lis(t.get("steps"))
        self.why.text = t.get("why", "")
        used = [bm.chip("conditions", c) for c in bm.items("conditions") if t["id"] in (c.get("tools") or [])]
        used += [bm.chip("patterns", p) for p in bm.items("patterns") if t["id"] in (p.get("tools") or [])]
        self.used_sec.visible = bool(used)
        self.used_panel.items = used
        self.plan_button.plan_kind, self.plan_button.plan_ref = "tool", t["id"]
