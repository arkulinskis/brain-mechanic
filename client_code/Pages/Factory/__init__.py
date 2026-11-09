from anvil import *

from ._anvil_designer import FactoryTemplate
from ... import bm


class Factory(FactoryTemplate):
    """#factory: every upbringing pattern by group, and the Factory Settings / ACEs checks."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        pats = bm.items("patterns")
        n = len(pats)
        self.lead.text = ("Every adult runs on software installed in childhood: how safe the world is, whether feelings are allowed, "
                          "what love costs. Here are %d common patterns, what each one tends to install, and how people update it." % n)
        self.check_text.text = "%d quick statements about how you grew up. You’ll see which settings you recognise, strongest first." % n
        self.groups_panel.items = [{"title": g["name"], "line": g["line"], "cls": "fs-grp",
                                    "cards": [bm.card("patterns", p) for p in pats if p["grp"] == g["id"]]}
                                   for g in bm.meta()["FACTORY_GROUPS"]]
