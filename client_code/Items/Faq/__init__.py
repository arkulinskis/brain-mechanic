from anvil import *

from ._anvil_designer import FaqTemplate


class Faq(FaqTemplate):
    """A question from the waiting room, folded: item = {q, a}."""

    def __init__(self, **properties):
        super().__init__(**properties)
