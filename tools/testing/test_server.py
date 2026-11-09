"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data + stats
as_user(None)
st = call("shop_stats")
assert M["DemoData"].state() == "loaded", "demo loads on first visit"
assert st["top"][0]["scan_id"] == "phq9" and st["month_total"] > 1000, st
assert len(T.users.search(is_demo=True)) == 3 and len(T.gauges.search(is_demo=True)) > 60
ok(call("count_scan", "adhd"))
bad(call("count_scan", "nope"))
assert T.scan_counts.get(scan_id="adhd", is_demo=False)["n"] == 1
ok(call("count_scan", "asrs"))  # the ADHD screener (ASRS v1.1) is a known check
for i in range(40):
    call("count_scan", "gad7")
assert T.scan_counts.get(scan_id="gad7", is_demo=False)["n"] <= 30, "count_scan is rate-limited"

# ---------------------------------------------------------------------------------- the Garage (private logbook)
for fn, args in [("get_garage", ()), ("save_gauge", ({"mood": 5},)), ("save_scan", ({},)), ("plan_add", ("tool", "pomodoro")),
                 ("journal_add", ("thought_record", {"thought": "x"})), ("export_logbook", ()), ("clear_logbook", ()), ("import_scans", ([],))]:
    assert denied(fn, *args), fn + " must need an account"
as_user(ana)
g = call("get_garage")
assert g["sample"] and g["sample"]["gauges"] and not g["gauges"], "a new logbook shows sample data, not stored"
bad(call("save_gauge", "nonsense"))
bad(call("save_gauge", {}))
r = ok(call("save_gauge", {"mood": 7, "energy": 12, "sleep": 7.3, "stress": -4, "focus": "6", "note": " fine "}, g["today"]))["gauge"]
assert r["energy"] == 10 and r["sleep"] == 7.5 and r["stress"] == 0 and r["focus"] == 6 and r["note"] == "fine", r
ok(call("save_gauge", {"mood": 3}, "1999-01-01"))
assert len(T.gauges.search(user=ana)) == 1, "same day updates; far-off dates fall back to today"
g = call("get_garage")
assert g["sample"] is None and g["gauges"][0]["mood"] == 3
# checks
bad(call("save_scan", {"scan_id": "nope", "score": 1, "max": 2, "level": 0}))
bad(call("save_scan", {"scan_id": "phq9", "score": "x", "max": 27, "level": 0}))
s1 = ok(call("save_scan", {"scan_id": "phq9", "score": 12, "max": 27, "level": 2, "label": "Moderate", "taken": "2026-10-01T10:00:00Z",
                           "detail": {"big": "x" * 9000}}))["scan"]
assert s1["detail"] is None, "oversized detail is dropped"
imp = ok(call("import_scans", [{"scan_id": "phq9", "score": 12, "max": 27, "level": 2, "label": "Moderate", "taken": "2026-10-01T10:00:00Z"},
                               {"scan_id": "gad7", "score": 4, "max": 21, "level": 0, "label": "Minimal", "taken": "2026-10-02T10:00:00Z"}, "junk"]))
assert imp["imported"] == 2 and len(T.scans.search(user=ana)) == 2, "duplicates are skipped"
# plan
bad(call("plan_add", "spell", "x"))
bad(call("plan_add", "tool", "Bad Id!"))
it = ok(call("plan_add", "tool", "pomodoro"))
assert it["existed"] is False and ok(call("plan_add", "tool", "pomodoro"))["existed"] is True
ok(call("plan_update", it["item"]["id"], "works", "  Helps a lot "))
bad(call("plan_update", it["item"]["id"], "maybe"))
assert call("get_garage")["plan"][0]["status"] == "works"
# journal
bad(call("journal_add", "thought_record", {"thought": "   "}))
bad(call("journal_add", "../x", {"a": "b"}))
j = ok(call("journal_add", "thought_record", {"thought": "They hate me", "before": "80", "Weird Key": "dropped"}))["entry"]
assert j["data"] == {"thought": "They hate me", "before": "80"}, j
# nobody else can touch Ana's rows
as_user(bob)
assert call("get_garage")["sample"], "Bob sees only his own (empty) logbook"
bad(call("delete_scan", s1["id"]))
bad(call("plan_update", it["item"]["id"], "nope"))
bad(call("plan_remove", it["item"]["id"]))
bad(call("journal_delete", j["id"]))
bad(call("delete_gauge", r["id"]))
as_user(ana)
exp = call("export_logbook")
assert len(exp["scans"]) == 2 and exp["account"]["email"] == "ana@example.com" and len(exp["journal"]) == 1
ok(call("delete_scan", s1["id"]))
ok(call("journal_delete", j["id"]))
ok(call("plan_remove", it["item"]["id"]))
ok(call("delete_gauge", r["id"]))
ok(call("plan_add", "condition", "adhd"))
assert ok(call("clear_logbook"))["deleted"] == 2
assert call("get_garage")["sample"], "a cleared logbook is empty again"
# ADHD Pit Lane: the ASRS screener result and the pit-crew widgets save like any other check / worksheet
a1 = ok(call("save_scan", {"scan_id": "asrs", "score": 5, "max": 6, "level": 3, "label": "Positive screen", "taken": "2026-11-03T10:00:00Z"}))["scan"]
assert a1["scan_id"] == "asrs" and a1["score"] == 5, a1
w1 = ok(call("journal_add", "overwhelm_reset", {"one": "the report", "first": "open the file", "parked": "laundry\ndentist"}))["entry"]
assert w1["data"]["parked"] == "laundry\ndentist", "multi-line parked lists survive"
ok(call("journal_add", "dopamine_menu", {"starters": "One favourite song, loud", "mains": ""}))
g = call("get_garage")
assert len(g["journal"]) == 2 and g["scans"][0]["scan_id"] == "asrs", g
bad(call("journal_add", "dopamine_menu", {"starters": " ", "mains": ""}))
as_user(bob)
bad(call("delete_scan", a1["id"]))
bad(call("journal_delete", w1["id"]))
as_user(ana)
assert ok(call("clear_logbook"))["deleted"] == 3
# admin
assert denied("admin_usage")
as_user(admin)
ov = call("admin_overview")
assert ov["scans"] == 0 and "gauges" in ov
u = call("admin_usage")
assert any(x["scan_id"] == "adhd" and x["month"] == 1 for x in u["rows"]), u["rows"][:3]
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.users.search(is_demo=True) and not T.gauges.search(is_demo=True)
assert not T.scan_counts.search(is_demo=True) and T.scan_counts.get(scan_id="adhd", is_demo=False), "removing demo data keeps real tallies"
as_user(None)
call("shop_stats")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(T.users.search(is_demo=True)) == 3, "reloading replaces the demo instead of doubling it"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- schema check (App Board): names only, never data
r = anvil.server.ENDPOINTS["/schema-check"](tables="users, gauges,no_such_table")
json.dumps(r)
assert "email" in r["tables"]["users"] and "mood" in r["tables"]["gauges"] and r["tables"]["no_such_table"] is None, r

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "count_scan", "shop_stats"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
