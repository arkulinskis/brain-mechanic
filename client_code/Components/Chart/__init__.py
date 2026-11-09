from anvil import *
import json
import anvil.js
from anvil.js import window

from ._anvil_designer import ChartTemplate


class Chart(ChartTemplate):
    """The Garage's 30-day chart of mood, stress and sleep (an SVG drawn by bm-engine.js). draw(gauges)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self._gauges = []

    def draw(self, gauges):
        self._gauges = gauges or []
        node = anvil.js.get_dom_node(self.plot)
        node.innerHTML = window.BM.chart(json.dumps(self._gauges), node.clientWidth or 600)

    @handle("", "show")
    def form_show(self, **event_args):
        self.draw(self._gauges)  # the width is known once it's on the page
