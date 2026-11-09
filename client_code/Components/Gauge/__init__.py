from anvil import *
import json
import anvil.js
from anvil.js import window

from ._anvil_designer import GaugeTemplate


class Gauge(GaugeTemplate):
    """A dashboard dial (BM.gaugeSvg in bm-engine.js). Call draw(value=, max=, label=, shown=, unit=, invert=)."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def draw(self, **opts):
        anvil.js.get_dom_node(self.dial).innerHTML = window.BM.gauge(json.dumps(opts))
