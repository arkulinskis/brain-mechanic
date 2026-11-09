from anvil import *

from ._anvil_designer import EntryTemplate
from ... import bm, state


class Entry(EntryTemplate):
    """#manual/<id>: one manual entry: warning lights, under the hood, garage myth, what professionals do, self-repair,
    tools, often mixed up with, factory settings that feed it; the side has the check, how common, its lights and
    when to see a pro."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        c = bm.one("conditions", list(args)[0])
        m = bm.meta()
        s = m["systemById"].get(c["sys"]) or {}
        st = m["STATUS"].get(c["st"]) or m["STATUS"]["concept"]
        self.page_title = c["n"]
        state.set_attr(self.back_link, "href", "#manual/sys/" + c["sys"])
        self.back_text.text = s.get("name", "")
        self.code.text = c.get("code", "")
        self.status.text, self.status.tooltip = st[0], st[1]
        self.status.role = ["bm-st", c["st"]]
        self.where_icon.classes.add("ic-" + s.get("icon", "sparkle"))
        self.where.text = s.get("name", "")
        self.title.text = c["n"]
        state.heading(self.title, 1)
        self.line.text = c.get("line", "")
        aka = c.get("aka") or []
        self.aka.text = "Also called: " + " · ".join(aka)
        self.aka.visible = bool(aka)
        self.bay_link.visible = c.get("bay") == "adhd"
        self.urgent_box.visible = c.get("st") == "urgent"
        self.signs_panel.items = bm.lis(c.get("signs"))
        self.under.text = c.get("under", "")
        self.status_note.text = st[1]
        self.status_lead.text = st[0] + ":"
        myth = c.get("myth")
        self.myth_sec.visible = bool(myth)
        self.myth_panel.items = [{"m": myth[0], "t": myth[1]}] if myth else []
        self.pro.text = c.get("pro", "")
        self.diy_panel.items = bm.lis(c.get("diy"))
        tools = bm.cards("tools", c.get("tools"))
        self.tools_sec.visible = bool(tools)
        self.tools_panel.items = tools
        conds = bm.by_id("conditions")
        mix = [bm.chip("conditions", conds[i]) for i in (c.get("mix") or []) if i in conds]
        self.mix_sec.visible = bool(mix)
        self.mix_panel.items = mix
        pats = [p for p in bm.items("patterns") if c["id"] in (p.get("conds") or [])][:6]
        self.pats_sec.visible = bool(pats)
        self.pats_panel.items = [bm.card("patterns", p) for p in pats]
        scan = bm.by_id("scans").get(c.get("scan"))
        self.scan_card.visible = bool(scan)
        if scan:
            self.scan_meta.text = "%s · %s · %s" % (scan["n"], scan.get("time", ""), "a published screener" if scan.get("kind") == "validated" else "our own pattern check")
            state.set_attr(self.scan_link, "href", "#scan/" + scan["id"])
        self.stat.text = c.get("stat", "")
        lights = m["lightById"]
        self.lights_panel.items = [{"text": lights[l]["label"]} for l in (c.get("lights") or []) if l in lights]
        self.see_panel.items = bm.lis(c.get("see"))
        self.plan_button.plan_kind, self.plan_button.plan_ref = "condition", c["id"]

    def brake_click(self, event):
        bm.crisis()
