from anvil import *

from ._anvil_designer import ChecksTemplate
from ... import bm, state


class Checks(ChecksTemplate):
    """#diagnose/scans: results on this device, the most-run checks this month (anonymous counts), every check by kind."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        scans = bm.items("scans")
        b = bm.by_id("scans")
        self.scans_count.text = str(len(scans))
        local = [r for r in bm.local_results() if r.get("scan_id") in b][:5]
        self.recent_sec.visible = bool(local)
        self.recent_text.text = "Your recent results. " + ("Save them to your logbook from your Garage." if state.me() else "They stay in this browser only.")
        self.recent_panel.items = [{"id": r.get("id"), "level": r.get("level", 0), "label": r.get("label", ""), "title": b[r["scan_id"]]["n"],
                                    "scan_id": r["scan_id"], "sub": "%s · score %s of %s" % (state.ago(r.get("taken")), r.get("score"), r.get("max"))}
                                   for r in local]
        kinds = [("Published screeners", "Short questionnaires that doctors use, reproduced word for word with their official scoring. Still not a diagnosis: a high score means “get a proper check”.", ("validated",)),
                 ("Pattern checks", "Our own plain-language checks, written from the diagnostic criteria and research. Useful for reflection; not validated tests.", ("pattern",)),
                 ("Childhood", "What your upbringing may have installed.", ("aces", "factory"))]
        self.groups_panel.items = [{"title": t, "line": line, "cls": "dg-group", "cards": [bm.card("scans", s) for s in scans if s.get("kind") in ks]}
                                   for t, line, ks in kinds]
        st = state.call_quiet("shop_stats")
        top = [t for t in (st or {}).get("top", []) if t.get("scan_id") in b]
        self.top_panel.items = [{"href": "#scan/" + t["scan_id"], "code": "#%d" % (i + 1), "text": b[t["scan_id"]]["n"], "icon": ""} for i, t in enumerate(top)]
        self.top_total.text = ("{:,} checks run this month".format((st or {}).get("month_total", 0)) if top else
                               "Be the first this month." if st else "")
