from anvil import *

from ._anvil_designer import TileTemplate
from ... import state


class Tile(TileTemplate):
    """A small card of text: item = {title, text, tag, badge, badge_cls, icon, cls, href, link_text}.
    cls adds a look (e.g. "bm-stat" for a research fact, "hp-who" for a who's-who card)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        for c in (i.get("cls") or "").split():
            self.classes[c] = True
        self.tag.visible = bool(i.get("tag"))
        self.badge.visible = bool(i.get("badge"))
        self.badge.role = [r for r in ("bm-st", i.get("badge_cls")) if r]
        self.icon.visible = bool(i.get("icon"))
        if i.get("icon"):
            self.icon.classes.add("ic-" + i["icon"])
        self.head.visible = bool(i.get("title"))
        self.text.visible = bool(i.get("text"))
        self.link.visible = bool(i.get("href"))
        if i.get("href"):
            state.set_attr(self.link, "href", i["href"])
