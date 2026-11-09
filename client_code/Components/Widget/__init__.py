from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import WidgetTemplate
from ... import bm


class Widget(WidgetTemplate):
    """A tool's live widget (breathing pacer, timer, grounding, the ADHD pit-crew widgets), drawn and run by
    bm-engine.js (BM.mountWidget). Timers stop by themselves once the page is left (they check isConnected)."""

    def __init__(self, **properties):
        self._tool, self._ready = "", False
        super().__init__(**properties)
        self._ready = True
        self._mount()

    def _mount(self):
        if self._tool and self._ready:
            bm.install_host()
            window.BM.mountWidget(anvil.js.get_dom_node(self.box), self._tool)

    @property
    def tool_id(self):
        return self._tool

    @tool_id.setter
    def tool_id(self, value):
        self._tool = value or ""
        self._mount()
