from anvil import *

from ._anvil_designer import BigLinkTemplate
from ... import state


class BigLink(BigLinkTemplate):
    """A large link tile: item = {href, icon, title, sub, tag, cls}. Used for the systems on the landing page, the
    ADHD relief buttons, the support charities and the toolbox's quick picks. External links open in a new tab."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        state.set_attr(self, "href", i["href"])
        if str(i["href"]).startswith("http"):
            state.set_attr(self, "target", "_blank")
            state.set_attr(self, "rel", "noopener")
        for c in (i.get("cls") or "").split():
            self.classes[c] = True
        self.icon.visible = bool(i.get("icon"))
        if i.get("icon"):
            self.icon.classes.add("ic-" + i["icon"])
        self.tag.visible = bool(i.get("tag"))
        self.sub.visible = bool(i.get("sub"))
