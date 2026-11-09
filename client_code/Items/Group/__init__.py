from anvil import *

from ._anvil_designer import GroupTemplate
from ... import state


class Group(GroupTemplate):
    """A titled section of cards (a system of the manual, a group of patterns, a toolbox drawer, search results).
    item = {title, line, icon, code, count, cards, link_text, link_href, cls}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        for c in (i.get("cls") or "").split():
            self.classes[c] = True
        self.icon_box.visible = bool(i.get("icon"))
        if i.get("icon"):
            self.icon.classes.add("ic-" + i["icon"])
        self.line.visible = bool(i.get("line"))
        self.code.visible = bool(i.get("code"))
        self.count.visible = bool(i.get("count"))
        self.cards_panel.items = i.get("cards") or []
        self.more_link.visible = bool(i.get("link_href"))
        if i.get("link_href"):
            state.set_attr(self.more_link, "href", i["link_href"])
