from anvil import *

from ._anvil_designer import MythTemplate


class Myth(MythTemplate):
    """A garage myth and what's true: item = {m, t}."""

    def __init__(self, **properties):
        super().__init__(**properties)
