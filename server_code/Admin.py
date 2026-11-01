"""Admin page callables: overview, users (make admin, disable), demo data. Admins only.
Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Feedback, Stats


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    return {"users": len([u for u in app_tables.users.search() if not u["is_demo"]]),
            "admins": len(app_tables.users.search(is_admin=True)),
            "feedback_new": Feedback.new_count(),
            "gauges": len([r for r in app_tables.gauges.search() if not r["is_demo"]]),
            "scans": len([r for r in app_tables.scans.search() if not r["is_demo"]]),
            "plan": len([r for r in app_tables.plan.search() if not r["is_demo"]]),
            "journal": len([r for r in app_tables.journal.search() if not r["is_demo"]]),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


@anvil.server.callable(require_user=True)
def admin_usage():
    """How often each check is run (anonymous tallies; demo tallies included while demo data is loaded).
    Counts only: admins never see anyone's answers, readings or worksheets."""
    C.require_admin()
    month = C.now().strftime("%Y-%m")
    real_month, real_all = {}, {}
    for r in app_tables.scan_counts.search(is_demo=False):
        real_all[r["scan_id"]] = real_all.get(r["scan_id"], 0) + (r["n"] or 0)
        if r["month"] == month:
            real_month[r["scan_id"]] = real_month.get(r["scan_id"], 0) + (r["n"] or 0)
    saved = {}
    for r in app_tables.scans.search(is_demo=False):
        saved[r["scan_id"]] = saved.get(r["scan_id"], 0) + 1
    ids = sorted(set(real_all) | set(saved) | set(Stats.tallies(month)), key=lambda k: -(real_all.get(k, 0) + saved.get(k, 0)))
    return {"month": month, "rows": [{"scan_id": k, "month": real_month.get(k, 0), "all": real_all.get(k, 0), "saved": saved.get(k, 0),
                                      "demo": Stats.tallies(month).get(k, 0) - real_month.get(k, 0)} for k in ids]}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"])}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})
