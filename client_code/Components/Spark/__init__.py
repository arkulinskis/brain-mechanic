from anvil import *
import json
import anvil.js
from anvil.js import window

from ._anvil_designer import SparkTemplate


class Spark(SparkTemplate):
    """A small score sparkline for the Mileage log (BM.sparkSvg in bm-engine.js).
    Call draw(points=[{v, max, date}], label="screen-reader summary")."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def draw(self, points=None, label=""):
        anvil.js.get_dom_node(self.line).innerHTML = window.BM.spark(json.dumps({"points": points or [], "label": label}))
