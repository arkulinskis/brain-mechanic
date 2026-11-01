"""Anonymous counts: how often each check is run, per month. No answers, no scores, no user: just a tally,
so the Diagnose page can show what's popular in the waiting room and admins can see usage."""
import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import DemoData
from .Logbook import SCAN_IDS


def _month():
    return C.now().strftime("%Y-%m")


@anvil.server.callable
def count_scan(scan_id):
    """Add one to this month's tally for a check (called when anyone finishes one)."""
    if scan_id not in SCAN_IDS:
        return C.fail("Unknown check.")
    if C.rate_limited("count_scan", 30, 3600):
        return C.ok(counted=False)
    month = _month()
    r = app_tables.scan_counts.get(scan_id=scan_id, month=month, is_demo=False)
    if r is None:
        app_tables.scan_counts.add_row(scan_id=scan_id, month=month, n=1, is_demo=False)
    else:
        r["n"] = (r["n"] or 0) + 1
    return C.ok(counted=True)


def tallies(month=None):
    out = {}
    for r in app_tables.scan_counts.search():
        if month and r["month"] != month:
            continue
        out[r["scan_id"]] = out.get(r["scan_id"], 0) + (r["n"] or 0)
    return out


@anvil.server.callable
def shop_stats():
    """Public: the most-run checks this month (demo tallies included until an admin removes demo data)."""
    DemoData.ensure_loaded()
    month = tallies(_month())
    top = sorted(month.items(), key=lambda kv: -kv[1])[:6]
    return {"top": [{"scan_id": k, "n": v} for k, v in top], "month_total": sum(month.values()),
            "all_time": sum(tallies().values())}
