"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules. The same addresses as the
JavaScript version, so links people shared keep working.

Links in templates are plain <a href="#manual">; code calls router.go("manual", id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header; the phone tab bar shows four + More): (page, label, icon, who).
A page Form may set self.page_title (a manual entry's name) for the browser tab, and leave() to stop timers.
New page: add it to PAGES and _form() (and NAV if it belongs in the menu).
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "The owner’s manual for your mind"),
    "auth": ("guest", "Sign in"),
    "garage": ("user", "My garage"),
    "manual": (None, "Repair manual"),
    "diagnose": (None, "Diagnose"),
    "scan": (None, "Check"),
    "factory": (None, "Factory settings"),
    "adhd": (None, "ADHD Pit Lane"),
    "toolbox": (None, "Toolbox"),
    "help": (None, "Find a mechanic"),
    "workorder": (None, "Work order"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("garage", "Garage", "dash", "user"), ("manual", "Manual", "book", None), ("diagnose", "Diagnose", "scan", None),
       ("factory", "Upbringing", "factory", None), ("adhd", "ADHD", "flag", None), ("toolbox", "Toolbox", "wrench", None),
       ("help", "Get help", "shield", None)]
TABS_MEMBER = ["garage", "manual", "diagnose", "toolbox"]  # the phone tab bar; the rest goes in More
TABS_GUEST = ["manual", "diagnose", "factory", "toolbox"]
APP_NAME = "Brain Mechanic"
_r: dict = {"after": "", "listening": False, "page": None}


def nav_for(me):
    return [n for n in NAV if n[3] is None or me]


def _form(name, args):
    """The page's Form class (imported when first needed, so start-up stays quick). Some addresses have two
    pages: a list and one item (#manual and #manual/<id>)."""
    from . import bm
    arg = args[0] if args else ""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "garage":
        from .Pages.Garage import Garage
        return Garage
    if name == "manual":
        if arg in bm.by_id("conditions"):
            from .Pages.Entry import Entry
            return Entry
        from .Pages.Manual import Manual
        return Manual
    if name == "diagnose":
        if arg == "scans":
            from .Pages.Checks import Checks
            return Checks
        from .Pages.Diagnose import Diagnose
        return Diagnose
    if name == "scan":
        from .Pages.Scan import Scan
        return Scan
    if name == "factory":
        if arg in bm.by_id("patterns"):
            from .Pages.Pattern import Pattern
            return Pattern
        from .Pages.Factory import Factory
        return Factory
    if name == "toolbox":
        if arg in bm.by_id("tools"):
            from .Pages.Tool import Tool
            return Tool
        from .Pages.Toolbox import Toolbox
        return Toolbox
    if name == "adhd":
        from .Pages.Adhd import Adhd
        return Adhd
    if name == "help":
        from .Pages.Help import Help
        return Help
    if name == "workorder":
        from .Pages.Workorder import Workorder
        return Workorder
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "garage" if state.me() else "landing"


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "garage", []
        replace(name)
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "garage", []
        replace(name)
    window.UI_READY = False
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        old.leave()  # stop the old page's timers
    page = _form(name, args)(args=args)
    _r["page"] = page
    window.document.title = (getattr(page, "page_title", None) or PAGES[name][1]) + " · " + APP_NAME
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    if hasattr(page, "after_open"):
        page.after_open()  # e.g. scroll to a section (#adhd/myths)
    else:
        window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or the Garage."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash and not target.startswith("#auth"):
        window.location.hash = target
    else:
        go("garage")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
