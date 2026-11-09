from anvil import *

from ._anvil_designer import HelpTemplate
from ... import bm

WHO = [
    ("FIRST STOP", "Family doctor (GP)", "Rules out physical causes (thyroid, anaemia, vitamin levels, sleep apnoea, medication side effects), can prescribe common medications and refer you on. Often the fastest door in."),
    ("DIAGNOSIS + THERAPY", "Clinical psychologist", "Assesses and treats with talk therapy. Can diagnose in most places; usually can’t prescribe. Good for ADHD and autism assessments, anxiety, depression, trauma."),
    ("MEDICAL DOCTOR", "Psychiatrist", "A medical doctor specialised in mental health: diagnosis and medication, especially for bipolar disorder, psychosis, severe depression or complex cases."),
    ("TALK THERAPY", "Therapist, counsellor, social worker", "Psychotherapists, licensed counsellors (LPC/LMHC), clinical social workers (LCSW) and others. Titles are regulated differently by country: check registration."),
    ("TESTING", "Neuropsychologist", "Detailed testing of attention, memory and learning. Useful for complicated ADHD, autism or learning questions."),
    ("PRESCRIBER", "Psychiatric nurse practitioner", "In some countries, can assess, diagnose and prescribe. Often shorter waits than psychiatrists."),
    ("LIVED EXPERIENCE", "Peer support worker", "Someone trained who has been through it themselves. Groups like AA, SMART Recovery, CoDA or ACA are peer-led too."),
    ("NOT CLINICAL", "Coach", "Can help with goals and habits (ADHD coaching is popular) but isn’t a regulated health profession and can’t diagnose or treat."),
]
THERAPIES = [
    ("CBT", "Cognitive behavioural therapy: change unhelpful thinking and behaviour patterns, with homework.", "Depression, anxiety, panic, social anxiety, OCD (as ERP), insomnia (as CBT-I), eating disorders (CBT-E)"),
    ("Behavioural activation", "Re-engage with activities that bring pleasure and meaning.", "Depression"),
    ("ERP", "Exposure and response prevention: face the fear, skip the ritual.", "OCD, health anxiety, BDD"),
    ("DBT", "Dialectical behaviour therapy: skills for emotions, distress, relationships and mindfulness.", "BPD, self-harm, intense emotions"),
    ("ACT", "Acceptance and commitment therapy: unhook from thoughts, act on values.", "Anxiety, chronic pain, depression, stress"),
    ("CPT, PE, EMDR", "Trauma-focused therapies that process memories so they lose their charge.", "PTSD and complex PTSD"),
    ("IPT", "Interpersonal therapy: work on relationships, roles and grief.", "Depression, postpartum depression"),
    ("Schema therapy", "Change deep patterns (“schemas”) formed in childhood, including reparenting.", "Personality disorders, chronic problems, childhood wounds"),
    ("Psychodynamic", "Explore how past experiences and unconscious patterns shape the present.", "Depression, relationship patterns, personality"),
    ("MBCT", "Mindfulness-based cognitive therapy, usually in groups.", "Preventing depression relapse"),
    ("EFT / Gottman", "Couples therapies built on attachment and decades of relationship research.", "Couples conflict, attachment problems"),
    ("CBT-I", "CBT for insomnia: sleep window, stimulus control, worry tools.", "Chronic insomnia (first-line before pills)"),
    ("Family-based treatment", "Parents take charge of meals with a therapist’s support.", "Anorexia in teenagers"),
]
COUNTRY = [
    ("United States", "Your primary care doctor, your insurer’s directory or an Employee Assistance Program (often a few free sessions). Low-cost: community mental health centres, university training clinics, Open Path Collective (sliding scale). Search directories like Psychology Today by issue and insurance. 988 for crisis."),
    ("Canada", "Your family doctor or a walk-in clinic. Québec: your local CLSC, or Info-Social 811 (option 2) to talk to a social worker now. Many workplace plans cover psychologists; employers’ EAPs offer free sessions. 988 for crisis."),
    ("United Kingdom", "Your GP, or self-refer to NHS Talking Therapies in England (free CBT and counselling; no GP needed). Scotland, Wales and Northern Ireland have their own routes through your GP. Samaritans 116 123 for crisis."),
    ("Ireland", "Your GP, or HSE counselling services; 116 123 (Samaritans) and text 50808 for crisis."),
    ("Australia", "A GP can make a Mental Health Treatment Plan for Medicare-subsidised psychology sessions. Head to Health for options. Lifeline 13 11 14."),
    ("Everywhere else", "Start with a doctor or a local health line. findahelpline.com lists free helplines in over 130 countries."),
]
BRING = ["Your work order: check results, warning lights, how long it’s been going on", "Medications and supplements you take",
         "Family history (depression, bipolar, ADHD, addiction)", "One sentence on what you want from this visit",
         "For ADHD or autism assessments: school reports or someone who knew you as a child"]
ASK = ["What’s your experience with people with my kind of problem?", "Which approach do you use, and what’s the evidence for it?",
       "How will we know if it’s working, and when should we review?", "How long does treatment usually take?",
       "What does it cost, and do you offer a sliding scale?", "What happens between sessions?"]
FLAGS = ["They promise a cure, or a fixed number of sessions for anything", "They push one method for every problem",
         "They talk about themselves more than about you", "They dismiss your questions, culture or identity",
         "They blur boundaries (friendship, money, touch)", "You feel worse after months with no plan to change course"]


class Help(HelpTemplate):
    """#help (Find a mechanic): the crisis lines, who's who, types of therapy, finding help by country, getting the
    most from an appointment, red flags in a therapist."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.who_panel.items = [{"tag": w[0], "title": w[1], "text": w[2], "cls": "hp-who-card"} for w in WHO]
        self.therapy_panel.items = [{"head": True, "a": "Therapy", "b": "What it is", "c": "Best evidence for"}] + \
            [{"a": t[0], "b": t[1], "c": t[2]} for t in THERAPIES]
        self.country_panel.items = [{"title": c[0], "text": c[1], "cls": "hp-country-card"} for c in COUNTRY]
        self.bring_panel.items = bm.lis(BRING)
        self.ask_panel.items = bm.lis(ASK)
        self.flags_panel.items = bm.lis(FLAGS)
