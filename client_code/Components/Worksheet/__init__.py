from anvil import *

from ._anvil_designer import WorksheetTemplate
from ... import bm, state
from anvil.js import window


class Worksheet(WorksheetTemplate):
    """A tool's worksheet (tools with w = 'sheet'): text boxes, areas and sliders from the tool's `fields`
    ([key, label, kind, placeholder]; kind area | range (0-100) | range10 | text). Members save it to the logbook
    (journal_add), anyone can download it as text."""

    def __init__(self, **properties):
        self._tool, self._boxes, self._ready, self.tool = "", [], False, {}
        super().__init__(**properties)
        self._ready = True
        if self._tool:
            self._build()

    @property
    def tool_id(self):
        return self._tool

    @tool_id.setter
    def tool_id(self, value):
        self._tool = value or ""
        if self._tool and self._ready:
            self._build()

    def _build(self):
        t = bm.one("tools", self._tool) or {}
        self.tool = t
        self.fields_box.clear()
        self._boxes = []
        for f in t.get("fields") or []:
            key, label, kind = f[0], f[1], (f[2] if len(f) > 2 else "")
            hint = f[3] if len(f) > 3 else ""
            cap = Label(text=label, role=["ws-cap"])
            if kind == "area":
                box = TextArea(placeholder=hint, height="110")
            elif kind in ("range", "range10"):
                box = TextBox(type="number", text="50" if kind == "range" else "5", role=["ws-range"])
            else:
                box = TextBox(placeholder=hint)
            self.fields_box.add_component(cap)
            self.fields_box.add_component(box)
            state.set_control_attr(box, "aria-label", label)
            if kind in ("range", "range10"):
                el = state.control(box)
                el.setAttribute("type", "range")
                el.setAttribute("min", "0")
                el.setAttribute("max", "100" if kind == "range" else "10")
                el.setAttribute("step", "5" if kind == "range" else "1")
                el.value = "50" if kind == "range" else "5"
            else:
                state.set_control_attr(box, "maxlength", 4000 if kind == "area" else 400)
            self._boxes.append((key, label, kind, box))
        me = bool(state.me())
        self.save_button.text = "Save to my logbook" if me else "Save in a logbook"
        self.privacy.text = ("Saved worksheets are private to you, in your Garage." if me else
                             "Nothing you type leaves this browser unless you create an account and save it.")

    def _values(self):
        out = {}
        for key, label, kind, box in self._boxes:
            out[key] = str(state.control(box).value) if kind.startswith("range") else (box.text or "")
        return out

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        if not state.me():
            bm.ask_account("Save worksheets like this one and come back to them later.")
            return
        v = self._values()
        filled = {}
        for key, label, kind, box in self._boxes:
            if kind.startswith("range") or v[key].strip():
                filled[key] = v[key]
        if not any(v[k].strip() for k, l, kind, b in self._boxes if not kind.startswith("range")):
            state.toast("Fill in at least one box first.", "error")
            return
        if state.call("journal_add", self._tool, filled) is not None:
            state.toast("Saved to your logbook", "ok")
            self.clear_button_click()

    @handle("download_button", "click")
    def download_button_click(self, **event_args):
        v = self._values()
        text = "%s (%s)\n\n" % (self.tool.get("n", ""), bm.fmt_date(bm.local_date()))
        text += "\n".join("%s:\n%s\n" % (label, v[key]) for key, label, kind, box in self._boxes)
        window.BM.download(self._tool + ".txt", text, "text/plain")

    @handle("clear_button", "click")
    def clear_button_click(self, **event_args):
        for key, label, kind, box in self._boxes:
            if kind.startswith("range"):
                state.control(box).value = "50" if kind == "range" else "5"
            else:
                box.text = ""
