# Brain Mechanic

The owner's manual for your mind, written like a car repair manual and dressed as an armchair in a psychologist's
office. Visitors look up what they're going through in plain words, tick the "warning lights" (symptoms) they notice,
run self-checks, see what their upbringing installed ("factory settings"), and leave with practical techniques and a
printable work order for a real professional. Members keep a private logbook (the Garage). **Nobody here is a doctor:
it's for fun and self-reflection, never medical advice**, and the app says so on every page. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/brain-mechanic (branch `master`). Anvil pulls `master`.
- **Live:** https://brain-mechanic.anvil.app

## What it does

**For everyone (no account needed):**
- **Disclaimer plaque + Emergency brake** under the header on every page: "Not a doctor's office…" and a red button
  that opens crisis lines (US/Canada 988, Québec 1-866-APPELLE, Samaritans 116 123, Lifeline 13 11 14, NZ 1737, France
  3114, findahelpline.com, domestic-abuse lines). Also in the phone "More" sheet.
- **Landing**: the office (armchair, banker's lamp, "licensed to tinker, NOT A DOCTOR" certificate, a dashboard of
  warning lights) next to a "What's the noise?" lookup box; how the shop works, the ten systems, Factory Settings,
  the fine print, FAQ.
- **Repair manual** (`#manual`): 58 entries across ten car "systems" (Steering & Focus, Alarm System, Engine & Mood,
  Wiring & Sensors, Fuel & Rest, Exhaust & Leaks, Chassis, Cabin & Passengers, Dashboard, Factory Settings): ADHD,
  anxiety, panic, OCD, PTSD/C-PTSD, depression, bipolar, burnout, grief, autism, HSP, insomnia, eating disorders,
  addictions, NPD/narcissism, BPD, attachment, codependency, emotional abuse and gaslighting, imposter syndrome,
  people-pleasing, childhood emotional neglect and more. Each entry has a fault code (ST-01…), an honest status label
  (recognised diagnosis / ICD-11 / popular concept / trait / needs help now), warning lights, under the hood, a garage
  myth vs what's true, what professionals do, self-repair steps, tools, often-confused-with, related upbringing
  patterns, how common (with source), "take it to a pro when…", its self-check and Add to my repair plan.
- **Lookup** (`#manual/s/<words>`): plain-language search with synonyms ("my mum" → upbringing, "sad" → depression),
  light stemming and typo tolerance ("narcisist"), grouped into manual entries, upbringing patterns, tools and checks.
- **Diagnose → Warning lights** (`#diagnose`): 75 symptom lamps by system; ticking them ranks the matching entries
  live with how many of each entry's lights are on. Crisis lights open the Emergency brake. Saved in the browser.
- **Diagnose → Checks** (`#diagnose/scans`, `#scan/<id>`): 30 checks. Four published screeners word for word with
  official scoring (PHQ-9, GAD-7, PC-PTSD-5 with its opening question, AUDIT-C), 24 plain-language pattern checks
  clearly labelled "not validated" (ADHD, panic, social anxiety, OCD, burnout, sleep, autism, narcissistic traits,
  relationship red flags, BPD, attachment style with a two-dial quadrant, people-pleasing, imposter, codependency,
  emotional neglect, perfectionism, loneliness, phone use, eating, self-esteem, anger, sensitivity, high mood, grief),
  plus the ACEs count and the Factory Settings check. A "not a diagnosis" tick is required; results show a dial,
  band, what it lights up in the manual and tools to try. Safety flags: PHQ-9 item 9 and BPD self-harm answers open
  the Emergency brake; relationship-fear answers show abuse lines; purging/restricting shows "see a doctor".
  "Popular in the waiting room" shows this month's most-run checks (anonymous tallies).
- **Factory Settings** (`#factory`, `#factory/<id>`): 34 upbringing patterns in six groups (too much, too little,
  upside down, unsafe, conditional, life events): helicopter, drill sergeant, enmeshment, the critic, report-card
  love, parentification, surrogate spouse, triangulation, the eggshell house, addicted or struggling parent,
  violence, narcissistic parent, guilt trips, silent treatment, shaming, gaslighting, golden child/scapegoat,
  rigid beliefs, body comments, divorce, loss, bullying… Each: what it looked like, what it can install, the inner
  voice it leaves, how people rewire it, tools, research notes.
- **Toolbox** (`#toolbox`, `#toolbox/<id>`): 41 techniques with steps and evidence (CBT, DBT, ACT, CBT-I, habit
  research). Live widgets: breathing pacer (physiological sigh, slow exhale, box), 5-4-3-2-1 grounding walk-through,
  timers (pomodoro, urge surfing, anger timeout, wind-down…) and 15 worksheets (thought record, safety plan, worry
  time, DEAR MAN, boundary script, exposure ladder, reparenting…) that members save and guests download as text.
- **Find a pro** (`#help`): crisis lines, who's who (GP, psychologist, psychiatrist…), therapies and what they're best
  for, finding and affording help by country, what to bring, questions to ask, red flags.
- **Work order** (`#workorder`): a printable one-page summary of chosen check results, ticked warning lights, what
  you've noticed, what you want from the appointment and your questions, with a "self-check, not a diagnosis" stamp.

**For members (`#garage`, the home after signing in):** an instrument cluster (five needle gauges), today's reading
(mood, energy, sleep, stress, focus + a note), check-engine lights from recent results, a 30-day chart, service
history (saved checks; move results from this device in one click), the repair plan (status + notes), saved
worksheets, Download my logbook (JSON) and Delete everything. A new logbook shows sample readings until the first entry.

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** members, saved results, readings, plan items, worksheets (counts only; never anyone's contents).
- **Usage:** how often each check is run (anonymous monthly tallies), how many were saved, demo tallies.
- **Feedback inbox** (older messages), **Users** (make admin, disable), **Demo data** (three demo members with
  logbooks and demo tallies; remove or reload).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/brain-mechanic`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Fraunces, JetBrains Mono, Source Sans 3 |

**Built into the browser:** Web Audio API, localStorage, Clipboard, File downloads (Blob).

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Google service, Anvil JS bridge (anvil.js), Anvil Users.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/brainmechanic/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#garage, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            core.js/core.css (shared engine + design tokens), app.js (header + plaque, footer, tab bar), pages/*.html
web/pages/_bm.html               shared look, icons, crisis panel, cards, lookup engine, gauges, device results
web/pages/_bmd_*.html            the content: conditions + lights, factory patterns, tools, scans
client_code/    Main.py (the only Anvil form: bridge to the server, sign-in), legal.py
server_code/    common.py, Accounts.py, Feedback.py, Admin.py, DemoData.py, legal_server.py, Logbook.py, Stats.py
assets/         icon.svg (armchair) + generated PNG icons (served at _/theme/<name>)
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
