from anvil import *

from ._anvil_designer import NoteTemplate

DEFAULT = ("Nobody here is a doctor. This is for fun and self-reflection, and is in no way medical advice, a diagnosis "
           "or treatment. Only a qualified professional who meets you can diagnose anything.")


class Note(NoteTemplate):
    """The disclaimer note on every page ("Nobody here is a doctor"). message = other words (optional)."""

    def __init__(self, **properties):
        self._message, self._ready = "", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        msg = self._message or DEFAULT
        if msg.startswith("Nobody here is a doctor."):
            self.lead.text, self.body.text = "Nobody here is a doctor.", msg[len("Nobody here is a doctor."):]
        else:
            self.lead.text, self.body.text = "", msg
        self.lead.visible = bool(self.lead.text)

    @property
    def message(self):
        return self._message

    @message.setter
    def message(self, value):
        self._message = value or ""
        if self._ready:
            self._draw()
