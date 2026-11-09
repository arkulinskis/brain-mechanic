from anvil import *

from ._anvil_designer import Row3Template


class Row3(Row3Template):
    """A three-column table row that folds into a card on phones: item = {a, small, b, badge, badge_cls, c}.
    The first row of a table is its header ({head: True})."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.classes["head"] = bool(i.get("head"))
        self.small.visible = bool(i.get("small"))
        self.b.visible = bool(i.get("b"))
        self.badge.visible = bool(i.get("badge"))
        self.badge.role = [r for r in ("bm-st", i.get("badge_cls")) if r]
