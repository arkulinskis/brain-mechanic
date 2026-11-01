"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Brain Mechanic's manual, checks and toolbox are static content (web/pages/_bmd_*.html), so the demo is:
  - three fictional demo members with a lived-in logbook (gauges, check results, repair plan, worksheets)
  - demo tallies for "popular in the waiting room" (scan_counts, is_demo=True)
  - sample_logbook(): what a brand-new member's empty Garage shows until their first entry (never stored)
Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row is
flagged is_demo=True, so remove() deletes exactly what load() added.
"""
import datetime as dt
import math
import random

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Sam Okafor", "sam.demo@example.com"),
    ("Lea Novak", "lea.demo@example.com"),
    ("Jun Park", "jun.demo@example.com"),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["journal", "plan", "scans", "gauges", "scan_counts"]

DEMO_TALLY = {"phq9": 412, "gad7": 388, "adhd": 351, "factory": 297, "attachment": 244, "burnout": 231, "relationship": 198,
              "narc_self": 167, "autism": 152, "pleaser": 140, "imposter": 121, "insomnia": 118, "cen": 109, "aces": 96,
              "social": 88, "perfection": 81, "pcptsd5": 77, "phone": 74, "auditc": 52, "ocd": 49, "lonely": 47, "bpd": 41,
              "anger": 38, "hsp": 36, "mood_high": 22, "eating": 19, "grief": 17, "panic": 33, "codependency": 29, "selfesteem": 58}

# One story per demo member: (scans [(scan_id, score, max, level, label, days ago)], plan [(kind, ref, status, note)],
# journal [(tool, data, days ago)], gauge style (base mood, trend, base stress, sleep))
STORIES = [
    ([("phq9", 13, 27, 2, "Moderate", 24), ("phq9", 8, 27, 1, "Mild", 3), ("gad7", 9, 21, 1, "Mild", 24), ("burnout", 27, 36, 3, "Bright and steady", 25)],
     [("condition", "burnout", "trying", "Talked to my manager about the on-call rota."), ("tool", "behav_activation", "works", "Morning walk + one small task. Helps."),
      ("tool", "sleep_window", "trying", "Up at 7 every day. Day 9."), ("tool", "boundary_script", "want", "")],
     [("thought_record", {"situation": "Manager moved my deadline in the team meeting", "thought": "She thinks I can’t cope", "feeling": "ashamed, anxious",
                          "before": "75", "for": "I missed the last deadline", "against": "She moved two other deadlines too. She asked me to lead the next project.",
                          "balanced": "The whole team is behind. One late deadline doesn’t make me useless.", "after": "35"}, 6)],
     (4.2, 0.08, 6.5, 6.3)),
    ([("adhd", 37, 48, 3, "Bright and steady", 12), ("factory", 9, 68, 1, "Faint flicker", 10), ("attachment", 26, 48, 2, "Light on", 9)],
     [("condition", "adhd", "trying", "GP referral sent. Waiting list ~4 months."), ("tool", "body_double", "works", "Friday co-working calls with Mia."),
      ("tool", "pomodoro", "works", ""), ("pattern", "critical", "want", ""), ("tool", "external_brain", "trying", "One notebook. Only one!")],
     [("implementation", {"goal": "Do my tax return", "ifthen": "If it’s Saturday 10 am and I’ve had coffee, then I open the tax site", "obstacle": "If I get stuck, I text Mia and do 10 more minutes"}, 4)],
     (6.0, 0.02, 4.5, 6.8)),
    ([("gad7", 15, 21, 3, "Severe", 30), ("gad7", 11, 21, 2, "Moderate", 2), ("social", 22, 32, 2, "Light on", 28), ("pleaser", 25, 32, 3, "Bright and steady", 20)],
     [("condition", "social", "trying", "Booked a CBT assessment."), ("tool", "exposure_ladder", "trying", "Step 3 of 9: asked a question in the seminar."),
      ("tool", "breath_sigh", "works", "Before presentations."), ("pattern", "helicopter", "want", "")],
     [("exposure_ladder", {"fear": "Speaking up in groups", "steps": "10: ask a barista a question\n25: say one thing in a team call\n40: ask a question in the seminar\n60: give a 2-minute update\n90: present to the department", "next": "Ask one question in Thursday’s seminar"}, 8)],
     (5.0, 0.05, 7.0, 7.1)),
]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def _gauge_series(rng, days, base_mood, trend, base_stress, sleep, today):
    out = []
    for i in range(days, -1, -1):
        if rng.random() < 0.18 and i not in (0, 1):
            continue  # skipped days look real
        t = days - i
        wobble = math.sin(t / 3.3) * 0.9
        mood = max(0, min(10, round(base_mood + trend * t + wobble + rng.uniform(-1, 1))))
        stress = max(0, min(10, round(base_stress - trend * t * 0.8 - wobble * 0.6 + rng.uniform(-1, 1))))
        energy = max(0, min(10, round((mood + 10 - stress) / 2 + rng.uniform(-1, 1))))
        focus = max(0, min(10, round(energy + rng.uniform(-2, 1))))
        sl = max(3, min(10, round((sleep + rng.uniform(-1.2, 1.0)) * 2) / 2))
        out.append((today - dt.timedelta(days=i), {"mood": mood, "energy": energy, "sleep": sl, "stress": stress, "focus": focus}))
    return out


NOTES = ["Walked to work", "Bad sleep, neighbour’s party", "Saw friends, felt lighter", "Deadline day", "Rainy, stayed in", "Therapy session",
         "Long call with Mum", "Good focus morning", "Gym!", "Couldn’t switch off"]


def fill_logbook(user, story, demo=True):
    """Give a member the logbook in STORIES[story] (demo members; the dev server's Ana too)."""
    scans, plan, journal, style = STORIES[story]
    rng = random.Random(42 + story)
    now, today = C.now(), C.now().date()
    for day, g in _gauge_series(rng, 34, style[0], style[1], style[2], style[3], today):
        app_tables.gauges.add_row(user=user, day=day, note=rng.choice(NOTES) if rng.random() < 0.3 else "", created=now, is_demo=demo, **g)
    for sid, score, mx, level, label, ago in scans:
        app_tables.scans.add_row(user=user, scan_id=sid, score=score, max=mx, level=level, label=label, detail=None,
                                 taken=now - dt.timedelta(days=ago, hours=3), created=now, is_demo=demo)
    for i, (kind, ref, status, note) in enumerate(plan):
        app_tables.plan.add_row(user=user, kind=kind, ref=ref, status=status, note=note, created=now - dt.timedelta(days=20 - i),
                                updated=now - dt.timedelta(days=i), is_demo=demo)
    for tool, data, ago in journal:
        app_tables.journal.add_row(user=user, tool=tool, data=data, created=now - dt.timedelta(days=ago), is_demo=demo)


def load():
    remove(remember=False)
    for i, (name, email) in enumerate(DEMO_USERS):
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        fill_logbook(u, i, demo=True)
    month = C.now().strftime("%Y-%m")
    for sid, n in DEMO_TALLY.items():
        app_tables.scan_counts.add_row(scan_id=sid, month=month, n=n, is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def sample_logbook():
    """A Garage to look at before the first entry: same shape as Logbook.logbook(), ids start with 'sample'."""
    rng = random.Random(7)
    today = C.now().date()
    scans, plan, journal, style = STORIES[0]
    gauges = [{"id": "sample-g%d" % i, "day": d.isoformat(), "note": "", **g}
              for i, (d, g) in enumerate(reversed(_gauge_series(rng, 20, style[0], style[1], style[2], style[3], today)))]
    return {
        "gauges": gauges,
        "scans": [{"id": "sample-s%d" % i, "scan_id": s[0], "score": s[1], "max": s[2], "level": s[3], "label": s[4], "detail": None,
                   "taken": C.iso(C.now() - dt.timedelta(days=s[5]))} for i, s in enumerate(scans)],
        "plan": [{"id": "sample-p%d" % i, "kind": p[0], "ref": p[1], "status": p[2], "note": p[3], "created": None, "updated": None}
                 for i, p in enumerate(plan)],
        "journal": [{"id": "sample-j%d" % i, "tool": j[0], "data": j[1], "created": C.iso(C.now() - dt.timedelta(days=j[2]))} for i, j in enumerate(journal)],
    }


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
