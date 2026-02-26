# Dashboard and section wrappers for the modding-tool layout.
# Dashboard: home view with 5 big icon cards.
# SectionWithSubNav: section content with sub-tabs and a stacked widget.

from pathlib import Path
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QPushButton, QStackedWidget, QScrollArea, QFrame, QSizePolicy,
    QButtonGroup, QTextEdit,
)
from PyQt6.QtGui import QPixmap, QDesktopServices
from PyQt6.QtCore import pyqtSignal, Qt, QUrl
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkRequest

import resource_loader


# Section keys for main nav (dashboard cards and nav buttons)
SECTION_HOME = "home"
SECTION_CHARACTER = "character"
SECTION_INVENTORY = "inventory"
SECTION_WEAPON_TOOLBOX = "weapon_toolbox"
SECTION_ACCESSORIES = "accessories"
SECTION_MASTER_SEARCH = "master_search"

# URL for the dashboard News / Updates panel.
# You can point this at any raw text/markdown file (for example:
#   https://raw.githubusercontent.com/<user>/<repo>/<branch>/news.txt)
# Default here: news.txt in the skeletor601/BL4-SaveEditor repo.
NEWS_URL = "https://raw.githubusercontent.com/skeletor601/BL4-SaveEditor/main/news.txt"


def _load_icon_pixmap(icon_key: str, size: int = 64):
    """Load icon from assets/icons/<icon_key>.png; return None if not found."""
    try:
        path = resource_loader.get_resource_path(Path("assets") / "icons" / f"{icon_key}.png")
        if path and Path(path).exists():
            pix = QPixmap(str(path))
            if not pix.isNull():
                return pix.scaled(size, size, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
    except Exception:
        pass
    return None


class DashboardCard(QFrame):
    """A large clickable card for the dashboard (icon + title + short description)."""
    clicked = pyqtSignal(str)

    def __init__(self, section_key: str, title: str, description: str, icon_key: str, icon_char: str = "", parent=None):
        super().__init__(parent)
        self.section_key = section_key
        self.setObjectName("dashboardCard")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setProperty("sectionKey", section_key)
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(36, 36, 36, 36)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_size = 160
        pix = _load_icon_pixmap(icon_key, icon_size)
        self.icon_label = QLabel()
        self.icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if pix and not pix.isNull():
            self.icon_label.setPixmap(pix)
        else:
            self.icon_label.setText(icon_char or "?")
            font = self.icon_label.font()
            font.setPointSize(64)
            self.icon_label.setFont(font)
        self.icon_label.setFixedSize(icon_size + 16, icon_size + 16)
        layout.addWidget(self.icon_label, 0, Qt.AlignmentFlag.AlignCenter)
        self.title_label = QLabel(title)
        self.title_label.setObjectName("dashboardCardTitle")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font = self.title_label.font()
        font.setPointSize(font.pointSize() + 4)
        font.setBold(True)
        self.title_label.setFont(font)
        layout.addWidget(self.title_label)
        self.desc_label = QLabel(description)
        self.desc_label.setObjectName("dashboardCardDesc")
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.desc_label.setWordWrap(True)
        self.desc_label.setMaximumWidth(480)
        layout.addWidget(self.desc_label, 0, Qt.AlignmentFlag.AlignCenter)
        self.setMinimumSize(520, 440)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.section_key)
        super().mousePressEvent(event)


class DashboardWidget(QWidget):
    """Home view: 5 big cards (Character, Inventory, Weapon Toolbox, Accessories, Master Search)."""
    section_clicked = pyqtSignal(str)

    def __init__(self, loc: dict, parent=None):
        super().__init__(parent)
        self.loc = loc or {}
        self.setObjectName("dashboardWidget")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        inner = QWidget()
        inner.setObjectName("dashboardInner")
        grid = QGridLayout(inner)
        grid.setSpacing(24)
        dashboard_labels = self.loc.get("dashboard", {})

        def _dash(key, default_title, default_desc):
            d = dashboard_labels.get(key, {}) if isinstance(dashboard_labels.get(key), dict) else {}
            return d.get("title", default_title), d.get("description", default_desc)

        section_keys = (SECTION_CHARACTER, SECTION_INVENTORY, SECTION_WEAPON_TOOLBOX, SECTION_ACCESSORIES, SECTION_MASTER_SEARCH)
        self._card_keys = [
            ("character", "Character", "Select save, character & YAML"),
            ("inventory", "Inventory", "Parts translator & backpack"),
            ("weapon_toolbox", "Weapon Toolbox", "Weapon gen & weapon edit"),
            ("accessories", "Accessories", "Class mod, grenades, shields, heavies…"),
            ("master_search", "Master Search", "Search parts & items database"),
        ]
        self._cards = []
        # Place main cards in a 2x3-ish grid:
        #  Character | Inventory | Weapon Toolbox | News (spans 2 rows)
        #  Accessories | Master Search | (empty)
        card_positions = {
            0: (0, 0),  # Character
            1: (0, 1),  # Inventory
            2: (0, 2),  # Weapon Toolbox
            3: (1, 0),  # Accessories
            4: (1, 1),  # Master Search
        }
        for i, (sec, default_title, default_desc) in enumerate(self._card_keys):
            title, desc = _dash(sec, default_title, default_desc)
            icon_key = sec
            icon_char = {"character": "👤", "inventory": "🎒", "weapon_toolbox": "🔫", "accessories": "🛡️", "master_search": "🔎"}.get(sec, "?")
            card = DashboardCard(section_keys[i], title, desc, icon_key, icon_char)
            card.clicked.connect(self.section_clicked.emit)
            self._cards.append(card)
            row, col = card_positions.get(i, (0, i))
            grid.addWidget(card, row, col, 1, 1, Qt.AlignmentFlag.AlignCenter)

        # News / Updates panel on the right, spanning two rows
        self.news_widget = DashboardNewsWidget(self.loc, parent=self)
        grid.addWidget(self.news_widget, 0, 3, 2, 1)

        # Stretch so content fills horizontally but stays nicely spaced
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)
        grid.setColumnStretch(2, 1)
        grid.setColumnStretch(3, 1)
        grid.setRowStretch(0, 1)
        grid.setRowStretch(1, 1)
        scroll.setWidget(inner)
        layout.addWidget(scroll)

    def set_loc(self, loc: dict):
        """Update labels when language changes."""
        self.loc = loc or {}
        dashboard_labels = self.loc.get("dashboard", {})
        def _dash(key, default_title, default_desc):
            d = dashboard_labels.get(key, {}) if isinstance(dashboard_labels.get(key), dict) else {}
            return d.get("title", default_title), d.get("description", default_desc)
        for card, (sec, default_title, default_desc) in zip(self._cards, self._card_keys):
            title, desc = _dash(sec, default_title, default_desc)
            card.title_label.setText(title)
            card.desc_label.setText(desc)


class DashboardNewsWidget(QFrame):
    """News / Updates panel on the dashboard which pulls text from a remote .txt (e.g. GitHub)."""

    def __init__(self, loc: dict, parent=None):
        super().__init__(parent)
        self.setObjectName("dashboardNewsWidget")
        self._loc = loc or {}

        self.manager = QNetworkAccessManager(self)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(8)

        title = QLabel(self._loc.get("news_title", "News & Updates"))
        title.setObjectName("dashboardNewsTitle")
        font = title.font()
        font.setBold(True)
        font.setPointSize(font.pointSize() + 1)
        title.setFont(font)
        layout.addWidget(title)

        self.text = QTextEdit()
        self.text.setReadOnly(True)
        self.text.setObjectName("dashboardNewsText")
        self.text.setMinimumWidth(380)
        self.text.setMinimumHeight(420)
        layout.addWidget(self.text, 1)

        btn_row = QHBoxLayout()
        self.refresh_btn = QPushButton(self._loc.get("news_refresh", "Refresh"))
        self.open_btn = QPushButton(self._loc.get("news_open", "Open in Browser"))
        btn_row.addWidget(self.refresh_btn)
        btn_row.addWidget(self.open_btn)
        layout.addLayout(btn_row)

        self.refresh_btn.clicked.connect(self._load_news)
        self.open_btn.clicked.connect(self._open_news_in_browser)

        # Initial load
        self._load_news()

    def _load_news(self):
        try:
            req = QNetworkRequest(QUrl(NEWS_URL))
            reply = self.manager.get(req)
            reply.finished.connect(lambda r=reply: self._on_reply_finished(r))
        except Exception:
            self._load_from_local_fallback()

    def _on_reply_finished(self, reply):
        try:
            if reply.error():
                self._load_from_local_fallback()
                return
            data = bytes(reply.readAll()).decode("utf-8", errors="ignore")
            if not data.strip():
                self._load_from_local_fallback()
                return
            self.text.setPlainText(data.strip())
        finally:
            reply.deleteLater()

    def _load_from_local_fallback(self):
        """Fallback: load news from a bundled text file if available."""
        try:
            path = resource_loader.get_resource_path("news.txt")
            if path and Path(path).exists():
                self.text.setPlainText(path.read_text(encoding="utf-8", errors="ignore"))
            else:
                self.text.setPlainText("No news yet. Add a news.txt file or configure NEWS_URL.")
        except Exception:
            self.text.setPlainText("No news yet. Add a news.txt file or configure NEWS_URL.")

    def _open_news_in_browser(self):
        try:
            QDesktopServices.openUrl(QUrl(NEWS_URL))
        except Exception:
            pass


class SectionWithSubNav(QWidget):
    """Section with horizontal sub-nav and stacked pages. Emits sub_tab_changed(icon_key) for converter."""
    sub_tab_changed = pyqtSignal(str)

    def __init__(self, sub_pages: list, loc: dict, parent=None):
        super().__init__(parent)
        self.setObjectName("sectionWithSubNav")
        self._icon_keys = [p[2] for p in sub_pages]
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.sub_nav = QWidget()
        self.sub_nav.setObjectName("sectionSubNav")
        sub_nav_layout = QHBoxLayout(self.sub_nav)
        sub_nav_layout.setContentsMargins(12, 8, 12, 8)
        sub_nav_layout.setSpacing(8)
        self.sub_button_group = QButtonGroup(self)
        self.sub_button_group.setExclusive(True)
        self.stack = QStackedWidget()
        self.stack.setObjectName("sectionStack")
        for i, (w, label, icon_key) in enumerate(sub_pages):
            self.stack.addWidget(w)
            btn = QPushButton(label)
            btn.setCheckable(True)
            btn.setProperty("iconKey", icon_key)
            self.sub_button_group.addButton(btn, i)
            sub_nav_layout.addWidget(btn)
        sub_nav_layout.addStretch()
        layout.addWidget(self.sub_nav)
        layout.addWidget(self.stack, 1)
        self.sub_button_group.idClicked.connect(self._on_sub_click)
        if self.sub_button_group.buttons():
            self.sub_button_group.buttons()[0].setChecked(True)
            self.sub_tab_changed.emit(self._icon_keys[0])

    def _on_sub_click(self, index: int):
        self.stack.setCurrentIndex(index)
        if 0 <= index < len(self._icon_keys):
            self.sub_tab_changed.emit(self._icon_keys[index])

    def set_current_sub_index(self, index: int):
        if 0 <= index < self.stack.count():
            self.stack.setCurrentIndex(index)
            btn = self.sub_button_group.button(index)
            if btn and not btn.isChecked():
                btn.setChecked(True)
            if 0 <= index < len(self._icon_keys):
                self.sub_tab_changed.emit(self._icon_keys[index])

    def index_for_icon_key(self, icon_key: str) -> int:
        try:
            return self._icon_keys.index(icon_key)
        except ValueError:
            return 0

    def current_icon_key(self) -> str:
        """Return the icon_key of the currently visible sub-tab."""
        i = self.stack.currentIndex()
        if 0 <= i < len(self._icon_keys):
            return self._icon_keys[i]
        return ""
