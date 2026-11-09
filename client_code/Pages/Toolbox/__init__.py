from anvil import *

from ._anvil_designer import ToolboxTemplate
from ... import bm


class Toolbox(ToolboxTemplate):
    """#toolbox: four tools for right now, then every tool by drawer (category)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        tools = bm.items("tools")
        b = bm.by_id("tools")
        self.lead.text = ("%d techniques from CBT, DBT, ACT and sleep and habit research, each with the evidence behind it. "
                          "Many have a live timer, pacer or worksheet." % len(tools))
        self.now_panel.items = [{"href": "#toolbox/" + i, "icon": "brake" if b[i]["cat"] == "crisis" else "wind", "title": b[i]["n"], "cls": "tb-now-link"}
                                for i in ["breath_sigh", "ground_54321", "tipp", "safety_plan"] if i in b]
        groups = []
        for c in bm.meta()["TOOL_CATS"]:
            cards = [bm.card("tools", t) for t in tools if t["cat"] == c["id"]]
            if cards:
                groups.append({"title": c["name"], "line": c["line"], "cards": cards, "cls": "tb-cat"})
        self.groups_panel.items = groups
