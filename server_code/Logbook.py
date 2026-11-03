"""The Garage: each member's private logbook. Daily gauge readings, saved check results, the repair plan
and saved worksheets. Only the owner can read or change their rows; admins see counts only (Admin.py).
Everything here is sensitive health-related data: keep it private, minimal and deletable (export_logbook,
clear_logbook)."""
import datetime as dt
import json
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

# The check ids the pages know (web/pages/_bmd_scans.html). Keep in step.
SCAN_IDS = {"phq9", "gad7", "pcptsd5", "auditc", "asrs", "adhd", "panic", "social", "ocd", "burnout", "insomnia", "autism",
            "narc_self", "relationship", "bpd", "pleaser", "imposter", "attachment", "codependency", "cen", "perfection",
            "lonely", "phone", "eating", "selfesteem", "anger", "hsp", "mood_high", "grief", "aces", "factory"}
PLAN_KINDS = {"condition", "pattern", "tool"}
PLAN_STATUS = {"want": "Want to try", "trying": "Trying it", "works": "Works for me", "nope": "Not for me"}
GAUGES = ("mood", "energy", "sleep", "stress", "focus")
SLUG = re.compile(r"^[a-z0-9_]{1,40}$")


def _date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _num(v, lo, hi, step=1.0):
    try:
        x = float(v)
    except Exception:
        return None
    if x != x:  # NaN
        return None
    x = max(lo, min(hi, x))
    return round(x / step) * step


def _small(obj, limit=6000):
    """A JSON-safe copy of obj if it is small enough, else None."""
    try:
        s = json.dumps(obj)
    except Exception:
        return None
    return json.loads(s) if len(s) <= limit else None


def gauge_dict(r):
    return {"id": r.get_id(), "day": C.iso(r["day"]), "mood": r["mood"], "energy": r["energy"], "sleep": r["sleep"],
            "stress": r["stress"], "focus": r["focus"], "note": r["note"] or ""}


def scan_dict(r):
    return {"id": r.get_id(), "scan_id": r["scan_id"], "score": r["score"], "max": r["max"], "level": r["level"],
            "label": r["label"] or "", "detail": r["detail"], "taken": C.iso(r["taken"])}


def plan_dict(r):
    return {"id": r.get_id(), "kind": r["kind"], "ref": r["ref"], "status": r["status"] or "want",
            "note": r["note"] or "", "created": C.iso(r["created"]), "updated": C.iso(r["updated"])}


def journal_dict(r):
    return {"id": r.get_id(), "tool": r["tool"], "data": r["data"] or {}, "created": C.iso(r["created"])}


def _own(table, row_id, me):
    r = C.row_by_id(table, row_id)
    return r if r is not None and r["user"] == me else None


def logbook(user, days=90):
    since = C.now().date() - dt.timedelta(days=days)
    gauges = [g for g in app_tables.gauges.search(tables.order_by("day", ascending=False), user=user) if g["day"] and g["day"] >= since]
    return {
        "gauges": [gauge_dict(g) for g in gauges],
        "scans": [scan_dict(r) for r in app_tables.scans.search(tables.order_by("taken", ascending=False), user=user)[:100]],
        "plan": [plan_dict(r) for r in app_tables.plan.search(tables.order_by("updated", ascending=False), user=user)],
        "journal": [journal_dict(r) for r in app_tables.journal.search(tables.order_by("created", ascending=False), user=user)[:60]],
    }


@anvil.server.callable(require_user=True)
def get_garage():
    """Everything the Garage page shows. A brand-new logbook gets sample readings to look at (not stored)."""
    me = C.require_user()
    DemoData.ensure_loaded()
    book = logbook(me)
    empty = not (book["gauges"] or book["scans"] or book["plan"] or book["journal"])
    book["sample"] = DemoData.sample_logbook() if empty else None
    book["today"] = C.now().date().isoformat()
    return book


@anvil.server.callable(require_user=True)
def save_gauge(values, day=None):
    """Upsert one day's reading. values: {mood, energy, sleep, stress, focus, note}; day = the browser's date."""
    me = C.require_user()
    if not isinstance(values, dict):
        return C.fail("Those readings didn’t come through. Try again.")
    today = C.now().date()
    d = _date(day) or today
    if abs((d - today).days) > 1:
        d = today
    row = {k: _num(values.get(k), 0, 14 if k == "sleep" else 10, 0.5 if k == "sleep" else 1) for k in GAUGES}
    if all(v is None for v in row.values()):
        return C.fail("Set at least one gauge.")
    if C.rate_limited("save_gauge", 60, 3600):
        return C.fail("That’s a lot of readings in an hour. Try again later.")
    note = C.text(values.get("note"), 280)
    r = app_tables.gauges.get(user=me, day=d)
    if r is None:
        r = app_tables.gauges.add_row(user=me, day=d, created=C.now(), is_demo=False, note=note, **row)
    else:
        r.update(note=note, **row)
    return C.ok(gauge=gauge_dict(r))


@anvil.server.callable(require_user=True)
def delete_gauge(gauge_id):
    me = C.require_user()
    r = _own(app_tables.gauges, gauge_id, me)
    if r is None:
        return C.fail("That reading isn’t in your logbook.")
    r.delete()
    return C.ok()


def _add_scan(me, res):
    if not isinstance(res, dict) or res.get("scan_id") not in SCAN_IDS:
        return None
    score, mx, level = _num(res.get("score"), 0, 500), _num(res.get("max"), 0, 500), _num(res.get("level"), 0, 3)
    if score is None or mx is None or level is None:
        return None
    taken = None
    try:
        taken = dt.datetime.fromisoformat(str(res.get("taken")).replace("Z", "+00:00"))
        if taken.tzinfo is None:
            taken = taken.replace(tzinfo=dt.timezone.utc)
    except Exception:
        taken = None
    if taken is None or taken > C.now() + dt.timedelta(minutes=5):
        taken = C.now()
    dup = [r for r in app_tables.scans.search(user=me, scan_id=res["scan_id"])
           if r["taken"] and abs((r["taken"] - taken).total_seconds()) < 2]
    if dup:
        return dup[0]
    return app_tables.scans.add_row(user=me, scan_id=res["scan_id"], score=score, max=mx, level=int(level),
                                    label=C.text(res.get("label"), 60), detail=_small(res.get("detail"), 4000),
                                    taken=taken, created=C.now(), is_demo=False)


@anvil.server.callable(require_user=True)
def save_scan(result):
    """Save one check result to the logbook (only when the member presses Save)."""
    me = C.require_user()
    if C.rate_limited("save_scan", 40, 3600):
        return C.fail("That’s a lot of saves in an hour. Try again later.")
    r = _add_scan(me, result)
    if r is None:
        return C.fail("That result couldn’t be saved.")
    return C.ok(scan=scan_dict(r))


@anvil.server.callable(require_user=True)
def import_scans(results):
    """Move results kept in this browser into the logbook. Skips duplicates and anything malformed."""
    me = C.require_user()
    if not isinstance(results, list):
        return C.fail("Nothing to import.")
    n = 0
    for res in results[:40]:
        if _add_scan(me, res) is not None:
            n += 1
    return C.ok(imported=n)


@anvil.server.callable(require_user=True)
def delete_scan(scan_row_id):
    me = C.require_user()
    r = _own(app_tables.scans, scan_row_id, me)
    if r is None:
        return C.fail("That result isn’t in your logbook.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def plan_add(kind, ref):
    me = C.require_user()
    if kind not in PLAN_KINDS or not isinstance(ref, str) or not SLUG.match(ref):
        return C.fail("That can’t go in the repair plan.")
    r = app_tables.plan.get(user=me, kind=kind, ref=ref)
    if r is not None:
        return C.ok(item=plan_dict(r), existed=True)
    if len(app_tables.plan.search(user=me)) >= 200:
        return C.fail("Your repair plan is full (200 items). Remove a few first.")
    r = app_tables.plan.add_row(user=me, kind=kind, ref=ref, status="want", note="", created=C.now(), updated=C.now(), is_demo=False)
    return C.ok(item=plan_dict(r), existed=False)


@anvil.server.callable(require_user=True)
def plan_update(item_id, status=None, note=None):
    me = C.require_user()
    r = _own(app_tables.plan, item_id, me)
    if r is None:
        return C.fail("That item isn’t in your repair plan.")
    changes = {"updated": C.now()}
    if status is not None:
        if status not in PLAN_STATUS:
            return C.fail("Unknown status.")
        changes["status"] = status
    if note is not None:
        changes["note"] = C.text(note, 500, multiline=True)
    r.update(**changes)
    return C.ok(item=plan_dict(r))


@anvil.server.callable(require_user=True)
def plan_remove(item_id):
    me = C.require_user()
    r = _own(app_tables.plan, item_id, me)
    if r is None:
        return C.fail("That item isn’t in your repair plan.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def journal_add(tool, data):
    """Save a filled-in worksheet (thought record, safety plan…). data: {field: text}."""
    me = C.require_user()
    if not isinstance(tool, str) or not SLUG.match(tool) or not isinstance(data, dict):
        return C.fail("That worksheet couldn’t be saved.")
    clean = {}
    for k, v in list(data.items())[:15]:
        if isinstance(k, str) and SLUG.match(k):
            t = C.text(v, 4000, multiline=True)
            if t:
                clean[k] = t
    if not clean:
        return C.fail("Fill in at least one box first.")
    if sum(len(v) for v in clean.values()) > 16000:
        return C.fail("That’s too long to save. Shorten it a little.")
    if C.rate_limited("journal_add", 60, 3600):
        return C.fail("That’s a lot of worksheets in an hour. Try again later.")
    r = app_tables.journal.add_row(user=me, tool=tool, data=clean, created=C.now(), is_demo=False)
    return C.ok(entry=journal_dict(r))


@anvil.server.callable(require_user=True)
def journal_delete(entry_id):
    me = C.require_user()
    r = _own(app_tables.journal, entry_id, me)
    if r is None:
        return C.fail("That entry isn’t in your logbook.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def export_logbook():
    """Everything in the member's logbook, for download."""
    me = C.require_user()
    book = logbook(me, days=36500)
    book["exported"] = C.iso(C.now())
    book["account"] = {"email": me["email"], "name": C.name_of(me)}
    return book


@anvil.server.callable(require_user=True)
def clear_logbook():
    """Delete every logbook row of the signed-in member (their account stays)."""
    me = C.require_user()
    n = 0
    for name in ("gauges", "scans", "plan", "journal"):
        for r in getattr(app_tables, name).search(user=me):
            r.delete()
            n += 1
    return C.ok(deleted=n)
