from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import LandingTemplate
from ... import bm, router, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "5BWx9DjbcDs"
TRY = ["can’t focus", "panic at night", "my mum", "narcissist", "can’t say no", "always tired"]
FAQ = [
    ("Is this a diagnosis?", "No. Nobody here is a doctor. Brain Mechanic is for fun and self-reflection, and is in no way medical advice. Checks tell you which “warning lights” your answers switch on, so you can decide whether to see a professional. Only a qualified clinician who meets you can diagnose anything."),
    ("Where does the information come from?", "From the diagnostic manuals (DSM-5-TR and the WHO’s ICD-11), clinical guidelines and published research. Every manual entry names its sources, and says plainly whether something is a recognised diagnosis or a popular concept like “codependency”. Four checks are published, free-to-use screeners (PHQ-9, GAD-7, PC-PTSD-5, AUDIT-C); the rest are our own plain-language pattern checks and say so."),
    ("Do I need an account?", "No. The manual, the checks and the toolbox are free and open. Without an account, your check results stay in this browser only. A free account adds the Garage: daily gauge readings, a repair plan, saved worksheets and your check history, on any device."),
    ("Who can see my answers?", "Without an account, nobody: results stay on your device. With an account, your logbook is private to you; the app’s admin screens only show totals, never your answers or notes. You can download or delete everything from your Garage at any time. We only count, anonymously, how often each check is run."),
    ("What is a work order?", "A one-page summary of your check results, the warning lights you noticed and the questions you want to ask, to print or show a doctor or therapist. It helps you say in five minutes what might otherwise take three appointments."),
    ("What if I’m in crisis?", "Use the red Emergency brake at the top of every page. It lists free, confidential crisis lines (988 in the US and Canada, Samaritans 116 123 in the UK and Ireland, and more). If you might act on thoughts of harming yourself, call your local emergency number now."),
]
STEPS = [("search", "Describe the noise", "Type it in plain words (“can’t focus”, “my dad”) and the manual finds the matching entries."),
         ("brake", "Read the warning lights", "Tick the symptoms that are on. The board ranks what they usually point to."),
         ("scan", "Run a diagnostic", "Published screeners and plain-language pattern checks, scored on the spot."),
         ("wrench", "Repair or refer", "Try tools that work, and take a printed work order to a professional for the rest.")]
FINE = [("info", "Not a doctor", "Nobody here is a doctor, psychologist or therapist. This is for fun and self-reflection. It is not medical advice, a diagnosis or treatment."),
        ("book", "Honest about evidence", "Every entry says whether it’s a recognised diagnosis or a popular idea, names its sources, and separates published screeners from our own checks."),
        ("brake", "Help when it matters", "The Emergency brake is on every page, with free crisis lines. Checks flag answers that deserve help today.")]


class Landing(LandingTemplate):
    """#landing: the office hero with the lookup box, the Watch section, how the shop works, the ten systems, factory
    settings, the ADHD Pit Lane, the fine print, the FAQ."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.garage_cta.visible = bool(me)
        self.signup_cta.visible = not me
        state.set_control_attr(self.ask_box, "aria-label", "Describe what you’re going through")
        state.set_control_attr(self.ask_box, "type", "search")
        self.try_panel.items = [{"href": router.href("manual", "s", t), "text": t, "code": "", "icon": ""} for t in TRY]
        n = {k: len(bm.items(k)) for k in ("conditions", "patterns", "tools")}
        self.proof_conditions.text = "%d manual entries" % n["conditions"]
        self.proof_patterns.text = "%d upbringing patterns" % n["patterns"]
        self.proof_tools.text = "%d tools" % n["tools"]
        self.steps_panel.items = [{"tag": "STEP 0%d" % (i + 1), "icon": s[0], "title": s[1], "text": s[2], "cls": "lp-step"}
                                  for i, s in enumerate(STEPS)]
        per = {}
        for c in bm.items("conditions"):
            per[c["sys"]] = per.get(c["sys"], 0) + 1
        self.systems_panel.items = [{"href": "#manual/sys/" + s["id"], "icon": s["icon"], "tag": "%s · %d entries" % (s["code"], per.get(s["id"], 0)),
                                     "title": s["name"], "sub": s["part"], "cls": "lp-sys"} for s in bm.meta()["SYSTEMS"]]
        self.factory_text.text = ("Helicopter parents, the eggshell house, the little parent who raised their siblings, love that came "
                                  "with a report card. %d patterns, what each one tends to install in adults, and how people update it. "
                                  "Not about blame: your parents had factory settings too." % n["patterns"])
        self.patterns_panel.items = bm.cards("patterns", ["parentified", "critical", "emoneglect", "narcparent"])
        self.pit_panel.items = bm.cards("tools", ["overwhelm_reset", "time_visible", "dopamine_menu"])
        self.fine_panel.items = [{"icon": f[0], "title": f[1], "text": f[2]} for f in FINE]
        self.faq_panel.items = [{"q": q, "a": a} for q, a in FAQ]
        self.dom_nodes["yt_cover"].addEventListener("click", anvil.js.report_exceptions(self._play))

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Brain Mechanic video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')

    @handle("ask_box", "pressed_enter")
    def ask_box_pressed_enter(self, **event_args):
        self.ask_button_click()

    @handle("ask_button", "click")
    def ask_button_click(self, **event_args):
        router.go("manual", "s", (self.ask_box.text or "").strip())
