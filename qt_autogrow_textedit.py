from __future__ import annotations

from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtGui import QTextOption
from PyQt6.QtWidgets import QPlainTextEdit, QSizePolicy


class AutoGrowPlainTextEdit(QPlainTextEdit):
    """
    A QPlainTextEdit that:
      - wraps long lines (no horizontal scrolling)
      - grows/shrinks its height to fit content (within min/max lines)
    """
    def __init__(self, parent=None, *, min_lines: int = 6, max_lines: int = 24):
        super().__init__(parent)
        self._min_lines = max(1, int(min_lines))
        self._max_lines = max(self._min_lines, int(max_lines))

        # Word wrapping
        self.setWordWrapMode(QTextOption.WrapMode.WrapAtWordBoundaryOrAnywhere)
        self.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        # Let layouts expand vertically as we grow
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.MinimumExpanding)

        # Trigger size updates on content changes.
        self.textChanged.connect(self._schedule_update_height)
        QTimer.singleShot(0, self._update_height)

    def _schedule_update_height(self):
        QTimer.singleShot(0, self._update_height)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        # Wrapping depends on viewport width, so re-calc on resize too.
        self._schedule_update_height()

    def _update_height(self):
        doc = self.document()

        # Critical: make the document layout use the actual viewport width,
        # otherwise doc.size().height() can stay "single-line" even with wrapping.
        vw = max(1, self.viewport().width())
        doc.setTextWidth(vw)
        doc.adjustSize()

        doc_h = doc.size().height()

        # Add frame & margins.
        m = self.contentsMargins()
        extra = self.frameWidth() * 2 + m.top() + m.bottom()

        # Clamp using line height.
        line_h = self.fontMetrics().lineSpacing()
        pad = 10  # a little breathing room
        min_h = self._min_lines * line_h + extra + pad
        max_h = self._max_lines * line_h + extra + pad

        target = int(doc_h + extra + pad)
        target = max(min_h, min(max_h, target))

        self.setFixedHeight(target)
