"""Brain Mechanic's content and engines for the Python side (wraps theme/assets/bm-data.js + bm-engine.js).

    bm.meta()                  STATUS, SYSTEMS, LIGHTS, FACTORY_GROUPS, TOOL_CATS, BREATHS, PATTERN_BANDS (+ by-id dicts)
    bm.items(kind)             every condition / pattern / tool / scan with the fields cards need (cached)
    bm.by_id(kind)             {id: item} for those;  bm.one(kind, id) = the whole item (cached), or None
    bm.card(kind, item, ...)   the dict an Items.Card shows;  bm.cards(kind, ids) for a list of ids (unknown ids skipped)
    bm.search(q)               ranked [{type, id, score}] (the JavaScript lookup engine: stems, synonyms, typos)
    bm.rank_lights(on)         warning-light ids -> ranked [{id, hits, of}]
    bm.local_results() ...     check results kept in this browser (same key as the JavaScript version)
    bm.install_host()          lets the JavaScript widgets call the server, show toasts and the account dialog
Kinds: "conditions", "patterns", "tools", "scans". JSON crosses the bridge, so Python always gets real dicts.
"""
import json

import anvil
import anvil.server
from anvil.js import window

from . import state

_c: dict = {}
KIND_PAGE = {"conditions": "manual", "patterns": "factory", "tools": "toolbox", "scans": "scan"}


def _engine():
    return window.BM.json


def meta():
    if "meta" not in _c:
        m = json.loads(_engine().meta())
        m["systemById"] = {s["id"]: s for s in m["SYSTEMS"]}
        m["lightById"] = {l[0]: {"id": l[0], "label": l[1], "sys": l[2], "crisis": len(l) > 3 and l[3] == "crisis"}
                          for l in m["LIGHTS"]}
        m["groupById"] = {g["id"]: g for g in m["FACTORY_GROUPS"]}
        m["catById"] = {c["id"]: c for c in m["TOOL_CATS"]}
        _c["meta"] = m
    return _c["meta"]


def items(kind):
    if kind not in _c:
        _c[kind] = json.loads(_engine().cards(kind))
    return _c[kind]


def by_id(kind):
    key = kind + ".by"
    if key not in _c:
        _c[key] = {o["id"]: o for o in items(kind)}
    return _c[key]


def one(kind, ident):
    key = kind + ":" + str(ident)
    if key not in _c:
        _c[key] = json.loads(_engine().one(kind, str(ident or "")))
    return _c[key]


def adhd():
    if "adhd" not in _c:
        _c["adhd"] = json.loads(_engine().adhd())
    return _c["adhd"]


def search(q):
    return json.loads(_engine().search(q))


def rank_lights(on):
    return json.loads(_engine().rank(json.dumps(list(on))))


def scan_items(scan_id):
    return json.loads(_engine().items(scan_id))


def score(scan_id, answers, gate):
    return json.loads(_engine().score(scan_id, json.dumps(answers), gate))


def href(kind, ident):
    return "#%s/%s" % (KIND_PAGE[kind], ident)


# ---------------------------------------------------------------- cards (Items.Card)
def tool_icon(t):
    w = t.get("w") or ""
    if t.get("ic"):
        return t["ic"]
    if w.startswith("breath"):
        return "wind"
    if w.startswith("timer"):
        return "clock"
    if w == "sheet":
        return "clipboard"
    return "wrench"


def card(kind, o, level=None, level_cls=None, foot=None, line=None):
    m = meta()
    d = {"kind": kind[:-1], "href": href(kind, o["id"]), "title": o.get("n") or "", "icon": "sparkle", "code": "",
         "b1": "", "b1cls": "", "b1title": "", "b2": "", "line": "", "foot": "", "level": level or "", "level_cls": level_cls or ""}
    if kind == "conditions":
        sysd = m["systemById"].get(o.get("sys")) or {}
        st = m["STATUS"].get(o.get("st")) or m["STATUS"]["concept"]
        d.update(icon=sysd.get("icon") or "sparkle", code=o.get("code") or "", b1=st[0], b1cls=o.get("st") or "",
                 b1title=st[1], line=o.get("line") or "", foot=sysd.get("name") or "")
    elif kind == "patterns":
        g = m["groupById"].get(o.get("grp")) or {}
        d.update(icon="factory", code="FS · " + (g.get("name") or ""), line=o.get("voice") or "")
    elif kind == "tools":
        cat = m["catById"].get(o.get("cat")) or {}
        d.update(icon=tool_icon(o), code=cat.get("name") or "", b1=o.get("time") or "", line=o.get("line") or "")
    else:
        k = o.get("kind")
        label, cls = ("Published screener", "dx") if k == "validated" else ("Pattern check", "") if k == "pattern" else ("Childhood", "occ")
        cond = by_id("conditions").get(o.get("cond")) or {}
        d.update(icon="scan", b1=label, b1cls=cls, b2=o.get("time") or "", line=cond.get("line") or "")
    if foot is not None:
        d["foot"] = foot
    if line is not None:
        d["line"] = line
    return d


def cards(kind, ids):
    b = by_id(kind)
    return [card(kind, b[i]) for i in (ids or []) if i in b]


def chip(kind, o):
    """A small link chip (Items.Chip): code + name."""
    code = o.get("code") if kind == "conditions" else "FS" if kind == "patterns" else ""
    return {"href": href(kind, o["id"]), "code": code or "", "text": o.get("n") or "", "icon": "" if code else "wrench"}


def lis(texts, bold=None):
    """Plain list items (Items.Li) from strings, or from [bold, text] pairs."""
    out = []
    for t in texts or []:
        if isinstance(t, (list, tuple)):
            out.append({"b": t[0], "text": t[1]})
        else:
            out.append({"b": bold or "", "text": t})
    return out


# ---------------------------------------------------------------- results kept in this browser (guests and members)
def local_results():
    try:
        raw = window.localStorage.getItem("brainmechanic.results")
        return json.loads(raw) if raw else []
    except Exception:
        return []


def _save_local(rows):
    try:
        window.localStorage.setItem("brainmechanic.results", json.dumps(rows[:40]))
    except Exception:
        pass


def add_local(r):
    rows = [x for x in local_results() if x.get("id") != r["id"]]
    _save_local([r] + rows)


def clear_local():
    _save_local([])


def store(key, default=None):
    """A value this browser keeps under brainmechanic.<key> (JSON), like the JavaScript UI.store."""
    try:
        raw = window.localStorage.getItem("brainmechanic." + key)
        return json.loads(raw) if raw else default
    except Exception:
        return default


def store_set(key, value):
    try:
        window.localStorage.setItem("brainmechanic." + key, json.dumps(value))
    except Exception:
        pass


def forget(key):
    try:
        window.localStorage.removeItem("brainmechanic." + key)
    except Exception:
        pass


def iso_now():
    return str(window.eval("new Date().toISOString()"))


def local_date():
    return str(window.eval("(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()"))


def fmt_date(iso):
    """'12 Nov 2026' from an ISO date or time."""
    if not iso:
        return ""
    y, mo, d = str(iso)[:10].split("-")
    return "%d %s %s" % (int(d), state.MONTHS[int(mo) - 1], y)


# ---------------------------------------------------------------- the account pitch, plan button, crisis dialog
def ask_account(why=""):
    """'Keep a logbook' dialog for guests (sign in / create an account)."""
    from .Dialogs.AskAccount import AskAccount
    from . import router
    router.remember_after(window.location.hash)
    alert(AskAccount(why=why), buttons=[], role="app-dialog")


def alert(*a, **k):
    return anvil.alert(*a, **k)


def crisis():
    """The Emergency brake: crisis lines, in a dialog."""
    from .Dialogs.Crisis import Crisis
    anvil.alert(Crisis(), buttons=[], role="app-dialog", large=True)


def add_to_plan(kind, ref):
    """Returns True when it's in the plan now (guests get the account pitch and False)."""
    if not state.me():
        ask_account("Add this to your repair plan to keep track of what you’re working on.")
        return False
    r = state.call("plan_add", kind, ref)
    if r is None:
        return False
    state.toast("Already in your repair plan" if r.get("existed") else "Added to your repair plan", "ok")
    return True


# ---------------------------------------------------------------- the bridge the JavaScript widgets use
def _host_api(fn, args_json):
    try:
        r = anvil.server.call(fn, *json.loads(args_json or "[]"))
    except Exception as e:
        return json.dumps({"error": "Something went wrong. Please try again." if not str(e) else str(e)})
    if isinstance(r, dict) and r.get("ok") is False:
        return json.dumps({"error": r.get("error") or "That didn’t work."})
    return json.dumps({"result": r})


def _host_toast(msg, kind):
    state.toast(msg, kind or None)


def _host_confirm(opts_json):
    o = json.loads(opts_json or "{}")
    return anvil.confirm(o.get("text") or "", title=o.get("title") or "Are you sure?",
                         buttons=[("Cancel", False), (o.get("ok") or "OK", True)])


def _host_me():
    return bool(state.me())


def install_host():
    h = window.BM.host
    h.api = _host_api
    h.toast = _host_toast
    h.confirm = _host_confirm
    h.me = _host_me
    h.askAccount = ask_account
