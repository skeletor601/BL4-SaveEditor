from __future__ import annotations

from PyQt6.QtGui import QGuiApplication, QKeySequence
from PyQt6.QtWidgets import QLineEdit


class PasteFriendlyLineEdit(QLineEdit):
    """QLineEdit with robust clipboard shortcuts.

    Some theme/event-filter combinations can leave the default context-menu actions
    visually present but non-functional. This widget guarantees that common
    clipboard shortcuts work (Ctrl/Cmd+X/C/V/Z/Y/A).
    """

    def keyPressEvent(self, event):
        if event.matches(QKeySequence.StandardKey.Copy):
            self.copy(); event.accept(); return
        if event.matches(QKeySequence.StandardKey.Cut):
            self.cut(); event.accept(); return
        if event.matches(QKeySequence.StandardKey.Paste):
            txt = QGuiApplication.clipboard().text() or ""
            if txt:
                self.insert(txt)
            event.accept(); return
        if event.matches(QKeySequence.StandardKey.Undo):
            self.undo(); event.accept(); return
        if event.matches(QKeySequence.StandardKey.Redo):
            self.redo(); event.accept(); return
        if event.matches(QKeySequence.StandardKey.SelectAll):
            self.selectAll(); event.accept(); return

        super().keyPressEvent(event)
