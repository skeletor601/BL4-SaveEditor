
import sys
import time
import itertools
import os
from pathlib import Path


from nv_logger import setup_logger, install_global_exception_hook
NV_LOG = setup_logger('NeonVaultV2')
install_global_exception_hook(NV_LOG)
VERSION = "3.4.5.2"
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QLineEdit, QMessageBox, QFileDialog,
    QStatusBar, QStackedWidget, QButtonGroup, QSizeGrip, QInputDialog,
    QMenu, QGraphicsBlurEffect, QStackedLayout, QFrame,
    QGraphicsDropShadowEffect,
)
from PyQt6.QtGui import QAction, QIcon, QPixmap, QPainter, QBrush, QColor, QDesktopServices
from PyQt6.QtCore import QSettings, QTimer, pyqtSlot, QPropertyAnimation, QEasingCurve, Qt, QTimer, QObject, QThread, pyqtSignal, QUrl, QSize

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView  # type: ignore
except Exception:
    QWebEngineView = None

import b_encoder
import resource_loader
import bl4_functions as bl4f

from save_game_controller import SaveGameController
from save_selector_widget import SaveSelectorWidget
from qt_character_tab import QtCharacterTab
from qt_items_tab import QtItemsTab
from qt_weapon_generator_tab import QtWeaponGeneratorTab
from qt_converter_tab import QtConverterTab
from qt_class_mod_editor_tab import QtClassModEditorTab
from qt_heavy_weapon_editor_tab import QtHeavyWeaponEditorTab
from qt_shield_editor_tab import QtShieldEditorTab
from qt_grenade_editor_tab import QtGrenadeEditorTab
from qt_repkit_editor_tab import QtRepkitEditorTab
from qt_yaml_editor_tab import QtYamlEditorTab
from qt_enhancement_editor_tab import QtEnhancementEditorTab
from qt_weapon_editor_tab import WeaponEditorTab as QtWeaponEditorTab
from qt_item_edit_tab import ItemEditTab
from theme_manager import ThemeManager
from dashboard_widget import (
    DashboardWidget,
    SectionWithSubNav,
    SECTION_HOME,
    SECTION_CHARACTER,
    SECTION_INVENTORY,
    SECTION_WEAPON_TOOLBOX,
    SECTION_ACCESSORIES,
    SECTION_MASTER_SEARCH,
)


class BackgroundWidget(QLabel):
    """Widget that displays a blurred background image for frosted glass effect."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("backgroundLayer")
        self._original_pixmap = None
        self._corner_radius = 20  # Match the window corner radius
        # Prevent the background from affecting window size
        from PyQt6.QtWidgets import QSizePolicy
        self.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Ignored)
        self._load_background_image()
        
    def set_theme(self, theme_manager: ThemeManager):
        """Update the wallpaper based on the active theme."""
        self._theme_manager = theme_manager
        self._load_background_image()

    def _load_background_image(self):
        """Load and apply the background image with blur effect."""
        # Default to neon wallpaper if theme manager isn't available yet.
        fname = getattr(getattr(self, "_theme_manager", None), "get_background_filename", lambda: "bg.jpg")()
        bg_path = resource_loader.get_resource_path(fname)
        if bg_path and bg_path.exists():
            self._original_pixmap = QPixmap(str(bg_path))
            self._apply_blur()
        else:
            # Fallback: solid dark background
            self.setStyleSheet("background-color: #1a1a20;")
    
    def _apply_blur(self):
        """Apply blur effect to the background."""
        if self._original_pixmap:
            blur = QGraphicsBlurEffect(self)
            blur.setBlurRadius(15)
            blur.setBlurHints(QGraphicsBlurEffect.BlurHint.QualityHint)
            self.setGraphicsEffect(blur)
            # Don't set pixmap directly here, let resizeEvent handle scaling
            self.setScaledContents(True)
    
    def resizeEvent(self, event):
        """Handle resize to scale background - maintains aspect ratio, crops to fill."""
        super().resizeEvent(event)
        if self._original_pixmap:
            # Use KeepAspectRatioByExpanding to maintain aspect ratio and crop excess
            scaled_pixmap = self._original_pixmap.scaled(
                self.size(),
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation
            )
            # Crop to center if larger than widget size
            if scaled_pixmap.size() != self.size():
                x = (scaled_pixmap.width() - self.width()) // 2
                y = (scaled_pixmap.height() - self.height()) // 2
                scaled_pixmap = scaled_pixmap.copy(x, y, self.width(), self.height())
            self.setPixmap(scaled_pixmap)
        # Note: Mask is applied at the central widget level in MainWindow.resizeEvent


class IteratorWorker(QObject):
    status_update = pyqtSignal(str)
    finished_generation = pyqtSignal(str)
    finished_add_to_backpack = pyqtSignal(int, int)

    def __init__(self, controller, params, loc_data):
        super().__init__()
        self.controller = controller
        self.params = params
        self.loc = loc_data

    def run(self):
        try:
            is_add_to_backpack = self.params.get('add_to_backpack', False)
            
            deserialized_strings = self._generate_deserialized_list()
            if not deserialized_strings:
                self.status_update.emit(self.loc['no_data'])
                if is_add_to_backpack:
                    self.finished_add_to_backpack.emit(0, 0)
                else:
                    self.finished_generation.emit("")
                return

            if is_add_to_backpack:
                self._add_items_to_backpack(deserialized_strings)
            else:
                self._generate_output_text(deserialized_strings)

        except ValueError as e:
            self.status_update.emit(f"{self.loc['error_prefix']}{e}")
            if self.params.get('add_to_backpack'): self.finished_add_to_backpack.emit(0, 0)
            else: self.finished_generation.emit("")
        except Exception as e:
            self.status_update.emit(f"{self.loc['error_prefix']}{e}")
            if self.params.get('add_to_backpack'): self.finished_add_to_backpack.emit(0, 0)
            else: self.finished_generation.emit("")

    def _generate_deserialized_list(self):
        self.status_update.emit(self.loc['generating'])
        base_data = self.params['base_data'].strip()
        if not base_data: raise ValueError(self.loc['base_empty'])
        
        strings = []
        if self.params['is_combo']:
            start, end, size = int(self.params['combo_start']), int(self.params['combo_end']), int(self.params['combo_size'])
            if start > end: raise ValueError(self.loc['combo_error_range'])
            source_set = list(range(start, end + 1))
            if len(source_set) < size: raise ValueError(self.loc['combo_error_size'])
            combos = list(itertools.combinations(source_set, size))
            for combo in combos:
                strings.append(f"{base_data} {' '.join(f'{{{c}}}' for c in combo)}|")
        else:
            start, end = int(self.params['start']), int(self.params['end'])
            if start > end: raise ValueError(self.loc['iter_error_range'])
            if self.params['is_skin']:
                for i in range(start, end + 1):
                    strings.append(f'{base_data} | "c", {i}|')
            else:
                special_base = self.params['special_base']
                is_special_combo = self.params.get('is_special_combo', False)
                combo_text = self.params.get('special_combo_text', "").strip()

                if (self.params['is_special'] or is_special_combo) and not special_base:
                    raise ValueError(self.loc['special_base_needed'])
                
                for i in range(start, end + 1):
                    if is_special_combo:
                        # Format: {AAA:[98 99 B]}
                        part = f"{{{special_base}:[{combo_text} {i}]}}"
                    elif self.params['is_special']:
                        part = f"{{{special_base}:{i}}}"
                    else:
                        part = f"{{{i}}}"
                    strings.append(f"{base_data}{part}|")
        return strings

    def _add_items_to_backpack(self, strings):
        self.status_update.emit(self.loc['generated_writing'].format(count=len(strings)))
        success, fail = 0, 0
        total = len(strings)
        flag = self.params['yaml_flag']

        for i, line in enumerate(strings):
            self.status_update.emit(self.loc['writing_progress'].format(current=i + 1, total=total))
            try:
                serial, err = b_encoder.encode_to_base85(line)
                if err:
                    fail += 1
                    continue
                if self.controller.add_item_to_backpack(serial, flag):
                    success += 1
                else:
                    fail += 1
            except Exception:
                fail += 1
            time.sleep(0.01)
        self.finished_add_to_backpack.emit(success, fail)

    def _generate_output_text(self, strings):
        self.status_update.emit(self.loc['generated_encoding'].format(count=len(strings)))
        final_output = []
        total = len(strings)
        is_yaml = self.params['is_yaml']
        yaml_flag = self.params['yaml_flag']

        for i, line in enumerate(strings):
            if (i+1) % 20 == 0:
                self.status_update.emit(self.loc['encoding_progress'].format(current=i + 1, total=total))

            result, error = b_encoder.encode_to_base85(line)
            if error:
                output_line = f"{self.loc['error_prefix']}{error}"
            elif is_yaml:
                output_line = f"        - serial: '{result}'\n          state_flags: {yaml_flag}"
            else:
                output_line = f"{line}  -->  {result}"
            final_output.append(output_line)
            time.sleep(0.005)
        self.finished_generation.emit('\n'.join(final_output))

class BatchAddWorker(QObject):
    progress = pyqtSignal(int, int, int, int) # current, total, success, fail
    finished = pyqtSignal(int, int) # success, fail

    def __init__(self, controller, lines, flag):
        super().__init__()
        self.controller = controller
        self.lines = lines
        self.flag = flag

    def run(self):
        success_count = 0
        fail_count = 0
        total = len(self.lines)
        for i, line in enumerate(self.lines):
            try:
                if line.strip().startswith('@U'):
                    serial = line
                else:
                    serial, err = b_encoder.encode_to_base85(line)
                    if err:
                        fail_count += 1
                        continue
                
                if self.controller.add_item_to_backpack(serial, self.flag):
                    success_count += 1
                else:
                    fail_count += 1
            except Exception:
                fail_count += 1
            finally:
                self.progress.emit(i + 1, total, success_count, fail_count)
        
        self.finished.emit(success_count, fail_count)



class QtMasterSearchTab(QWidget):
    """Embedded Scarlett Master Search (HTML) inside the app.

    Uses QWebEngineView when available (PyQt6-WebEngine). Falls back to an
    in-app message + 'Open External' button if WebEngine isn't installed.
    """

    def __init__(self, controller=None, params=None, loc_data=None, parent=None):
        super().__init__(parent)
        self.controller = controller
        self.params = params or {}
        self.loc = loc_data or {}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)

        header_row = QHBoxLayout()
        title = QLabel("Master Search (Scarlett)")
        title.setStyleSheet("font-size: 14pt; font-weight: 700;")
        header_row.addWidget(title)

        header_row.addStretch(1)

        self.reload_btn = QPushButton("Reload")
        self.reload_btn.setToolTip("Reload the Master Search page")
        self.reload_btn.clicked.connect(self.reload_master_search)
        header_row.addWidget(self.reload_btn)

        self.open_external_btn = QPushButton("Open External")
        self.open_external_btn.setToolTip("Open Master Search in your default browser")
        self.open_external_btn.clicked.connect(self.open_master_search_external)
        header_row.addWidget(self.open_external_btn)

        layout.addLayout(header_row)

        self.status_lbl = QLabel("")
        self.status_lbl.setWordWrap(True)
        layout.addWidget(self.status_lbl)

        # Try to embed a real browser (Chromium) inside the tab
        self.web = None
        if QWebEngineView is not None:
            self.web = QWebEngineView()
            # Allow clipboard access for embedded Master Search (QtWebEngine).
            try:
                from PyQt6.QtWebEngineCore import QWebEngineSettings  # type: ignore
                s = self.web.settings()
                if hasattr(QWebEngineSettings.WebAttribute, "JavascriptCanAccessClipboard"):
                    s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
                if hasattr(QWebEngineSettings.WebAttribute, "JavascriptCanPaste"):
                    s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanPaste, True)
            except Exception:
                pass

            layout.addWidget(self.web, 1)
            self.status_lbl.hide()
            self._load_master_search()
        else:
            # WebEngine missing: show friendly instructions
            self.reload_btn.setEnabled(False)
            self.status_lbl.setText(
                "Embedded browser is not available because PyQt6-WebEngine isn't installed.\n\n"
                "Fix: activate your venv and run:\n"
                "  pip install PyQt6-WebEngine\n\n"
                "Until then, use 'Open External'."
            )

    def _resolve_html_path(self) -> Path:
        # Prefer resource_loader so it works in PyInstaller builds
        try:
            p = resource_loader.get_resource_path(Path("master_search") / "scarlett.html")
            if Path(p).exists():
                return Path(p)
        except Exception:
            pass

        # Fallback for dev runs
        return Path.cwd() / "master_search" / "scarlett.html"

    def _load_master_search(self):
        if not self.web:
            return
        html_path = self._resolve_html_path()
        if not html_path.exists():
            self.status_lbl.setText(f"Missing file: {html_path}")
            self.status_lbl.show()
            return
        url = QUrl.fromLocalFile(str(html_path.resolve()))
        # Pass the active theme to Scarlett (monster vs dark-style).
        try:
            s = QSettings('SuperExboom', 'BL4SaveEditor')
            t = (s.value('theme', 'monster') or 'monster').lower()
            theme = 'dark' if t in ('dark', 'slate', 'obsidian') else 'monster'
            url.setQuery(f"theme={theme}")
        except Exception:
            pass
        self.web.setUrl(url)

    def reload_master_search(self):
        if self.web:
            self.web.reload()
        else:
            self.open_master_search_external()

    def open_master_search_external(self):
        try:
            html_path = self._resolve_html_path()
            if not html_path.exists():
                QMessageBox.critical(self, "Master Search", f"Missing file: {html_path}")
                return
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(html_path.resolve())))
        except Exception as e:
            QMessageBox.critical(self, "Master Search", f"Failed to open Master Search:\n{e}")


def _maybe_weekly_db_check(self):
    """
    Weekly reminder: if last community DB check is older than 7 days,
    prompt the user to refresh. This does NOT auto-download without user action.
    """
    try:
        settings = QSettings("NeonVault", "NeonVaultV2.69")
        last_epoch = int(settings.value("community_db/last_check_epoch", 0) or 0)
        now = int(__import__("time").time())
        seven_days = 7 * 24 * 60 * 60
        if last_epoch and (now - last_epoch) < seven_days:
            return

        from PyQt6.QtWidgets import QMessageBox
        resp = QMessageBox.question(
            self,
            "Community DB Update",
            "It’s been a while since the community parts DB was updated. Check for updates now?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes
        )
        if resp == QMessageBox.StandardButton.Yes:
            # Run the same updater used by Wpn Gen button
            try:
                self.weapon_generator_tab._on_check_db_updates()
            except Exception:
                pass
    except Exception:
        pass


class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()

        self.current_language = 'en-US'
        self._load_localization()
        
        # Initialize theme manager
        self.theme_manager = ThemeManager()
        
        self.setWindowTitle(self.loc['window_title'].format(version=VERSION))
        icon_path = resource_loader.get_resource_path("BL4.ico")
        if icon_path:
            self.setWindowIcon(QIcon(str(icon_path)))
        self.setGeometry(100, 100, 1600, 900)

        self.setWindowFlag(Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.old_pos = None

        self.controller = SaveGameController()
        self.is_nav_bar_expanded = True
        self.nav_bar_width_expanded = 150
        self.nav_bar_width_collapsed = 60

        # Apply themed stylesheet
        self._apply_themed_stylesheet()

        self._create_actions()

        # Create central widget with background support
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        central_widget.setObjectName("centralWidget")
        
        # Use stacked layout for background + content overlay
        stacked_layout = QStackedLayout(central_widget)
        stacked_layout.setStackingMode(QStackedLayout.StackingMode.StackAll)
        stacked_layout.setContentsMargins(0, 0, 0, 0)
        
        # Background layer (blurred image)
        self.background_widget = BackgroundWidget()
        # Ensure wallpaper matches current theme (Neon/Dark)
        try:
            self.background_widget.set_theme(self.theme_manager)
        except Exception:
            pass
        stacked_layout.addWidget(self.background_widget)
        
        # Content layer (on top of background)
        content_container = QWidget()
        content_container.setObjectName("contentWrapper")
        content_container.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        root_layout = QVBoxLayout(content_container)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)
        stacked_layout.addWidget(content_container)
        
        # Ensure content is on top
        stacked_layout.setCurrentWidget(content_container)

        self._create_header_bar()
        root_layout.addWidget(self.header_bar)
        self.header_divider = QFrame()
        self.header_divider.setObjectName("headerDivider")
        self.header_divider.setFixedHeight(2)
        root_layout.addWidget(self.header_divider)


        main_content_layout = QHBoxLayout()
        main_content_layout.setSpacing(0)
        
        self.content_stack = QStackedWidget()
        self._create_nav_bar()

        main_content_layout.addWidget(self.nav_bar)
        main_content_layout.addWidget(self.content_stack)
        
        root_layout.addLayout(main_content_layout)

        # Custom footer
        self.footer = QWidget()
        self.footer.setObjectName("footer")
        self.footer.setFixedHeight(25)
        footer_layout = QHBoxLayout(self.footer)
        footer_layout.setContentsMargins(15, 0, 15, 0)
        self.status_label = QLabel(self.loc['status']['welcome'])
        self.status_label.setObjectName("statusLabel")
        footer_layout.addWidget(self.status_label)
        footer_layout.addStretch()
        dot = QLabel("•")
        dot.setObjectName("footerDot")
        footer_layout.addWidget(dot)
        self.credit_label = QLabel(self.loc['status'].get('credit', ""))
        self.credit_label.setObjectName("creditLabel")
        self.credit_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        footer_layout.addWidget(self.credit_label)
        root_layout.addWidget(self.footer)

        self.size_grip = QSizeGrip(self)
        self.size_grip.setFixedSize(20, 20)
        
        self._add_tabs()
        self.scan_for_saves()
        self.update_action_states()
    
    def _load_localization(self):
        lang_map = {
            'zh-CN': "ui_localization.json",
            'en-US': "ui_localization_EN.json",
            'ru': "ui_localization_RU.json",
            'ua': "ui_localization_UA.json"
        }
        filename = lang_map.get(self.current_language, "ui_localization_EN.json")
        data = resource_loader.load_json_resource(filename)
        if data and "main_window" in data:
            self.loc = data["main_window"]
            # Ensure Master Search label exists (English-only add-on)
            self.loc.setdefault('tabs', {})
            self.loc['tabs'].setdefault('master_search', 'Master Search')
            self.loc['tabs'].setdefault('item_edit', 'Item Edit')
            self.loc['tabs'].setdefault('home', 'Home')
            self.loc['tabs'].setdefault('inventory', 'Inventory')
            self.loc['tabs'].setdefault('weapon_toolbox', 'Weapon Toolbox')
            self.loc['tabs'].setdefault('accessories', 'Accessories')
            self.loc['tabs'].setdefault('backpack', 'Backpack')
        else:
            # Fallback if file missing (or partial)
            self.loc = {
                "window_title": "Borderlands 4 Save Editor V{version}",
                "subtitle": "By SuperExboom",
                "header": {"title": "BL4 Save Editor", "open": "Open", "save": "Save", "save_as": "Save As..."},
                "menu": {"open_selector": "Open Selector", "save": "Save", "save_as": "Save As..."},
                "status": {"welcome": "Welcome"},
                "tabs": {
                    "home": "Home", "character": "Character", "inventory": "Inventory",
                    "weapon_toolbox": "Weapon Toolbox", "accessories": "Accessories", "master_search": "Master Search",
                    "select_save": "Select Save", "items": "Items", "backpack": "Backpack",
                    "converter": "Parts Translator", "yaml_editor": "YAML", "class_mod": "Class Mod",
                    "enhancement": "Enhancement", "weapon_editor": "Weapon Edit", "item_edit": "Item Edit",
                    "weapon_generator": "Weapon Gen", "grenade": "Grenade", "shield": "Shield",
                    "repkit": "RepKit", "heavy_weapon": "Heavy"
                },
                "dialogs": {
                    "success": "Success", "error": "Error", "critical": "Critical", "warning": "Warning", "cancel": "Cancel"
                },
                "worker": {
                    "no_data": "No data.", "error_prefix": "Error: "
                }
            }

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.header_bar.underMouse():
            self.old_pos = event.globalPosition().toPoint()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.size_grip.move(self.width() - self.size_grip.width(), self.height() - self.size_grip.height())
        self.size_grip.raise_()
        
        # Apply rounded corner mask to central widget to clip all child widgets including blur effect
        central = self.centralWidget()
        if central:
            from PyQt6.QtGui import QBitmap, QPainter
            corner_radius = 20
            
            bitmap = QBitmap(central.width(), central.height())
            bitmap.fill(Qt.GlobalColor.white)  # White = transparent in mask
            
            painter = QPainter(bitmap)
            painter.setBrush(Qt.GlobalColor.black)  # Black = visible in mask
            painter.setPen(Qt.GlobalColor.black)
            painter.drawRoundedRect(0, 0, central.width(), central.height(), 
                                    corner_radius, corner_radius)
            painter.end()
            
            central.setMask(bitmap)

    def mouseMoveEvent(self, event):
        if self.old_pos is not None and event.buttons() == Qt.MouseButton.LeftButton:
            delta = event.globalPosition().toPoint() - self.old_pos
            self.move(self.x() + delta.x(), self.y() + delta.y())
            self.old_pos = event.globalPosition().toPoint()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.old_pos = None
            
    def _create_actions(self):
        self.open_action = QAction(self.loc['menu']['open_selector'], self)
        self.open_action.triggered.connect(self.browse_and_open_save)
        
        self.save_action = QAction(self.loc['menu']['save'], self)
        self.save_action.triggered.connect(self.encrypt_and_save)

        self.save_as_action = QAction(self.loc['menu']['save_as'], self)
        self.save_as_action.triggered.connect(lambda: self.encrypt_and_save(save_as=True))

    def _create_header_bar(self):
        self.header_bar = QWidget()
        self.header_bar.setObjectName("headerBar")
        header_layout = QHBoxLayout(self.header_bar)
        header_layout.setContentsMargins(15, 5, 10, 5)
        header_layout.setSpacing(10)

        # --- Title (single-line) ---
        title_label = QLabel("Borderlands 4 ALL-IN-ONE Save Editor")
        title_label.setObjectName("titleLabel")
        header_layout.addWidget(title_label)

        header_layout.addStretch()

        # --- Version badge (pill) ---
        version_badge = QLabel("NeonVault V2.69")
        version_badge.setObjectName("versionBadge")
        version_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header_layout.addWidget(version_badge)

        badge_glow = QGraphicsDropShadowEffect(self)
        badge_glow.setBlurRadius(18)
        badge_glow.setOffset(0, 0)
        badge_glow.setColor(QColor(255, 0, 212, 180))
        version_badge.setGraphicsEffect(badge_glow)

        self.open_button = QPushButton(self.loc['header']['open'])
        self.open_button.clicked.connect(self.open_action.trigger)
        self.save_button = QPushButton(self.loc['header']['save'])
        self.save_button.clicked.connect(self.save_action.trigger)
        self.save_as_button = QPushButton(self.loc['header']['save_as'])
        self.save_as_button.clicked.connect(self.save_as_action.trigger)

        header_layout.addWidget(self.open_button)
        header_layout.addWidget(self.save_button)
        header_layout.addWidget(self.save_as_button)

        self.lang_button = QPushButton(self._get_lang_button_text())
        self.lang_button.setFixedWidth(60)
        
        self.lang_menu = QMenu(self)
        
        # Define languages
        languages = [
            ("简体中文", "zh-CN"),
            ("English", "en-US"),
            ("Русский", "ru"),
            ("Українська", "ua")
        ]
        
        for label, code in languages:
            action = QAction(label, self)
            # Use default parameter to capture 'code' value in lambda closure
            action.triggered.connect(lambda checked, c=code: self.change_language(c))
            self.lang_menu.addAction(action)

        self.lang_button.setMenu(self.lang_menu)
        header_layout.addWidget(self.lang_button)

        # Theme toggle button (next to language button)
        self.theme_button = QPushButton(self.theme_manager.get_theme_icon())
        self.theme_button.setObjectName("themeButton")
        self.theme_button.setFixedWidth(45)
        self.theme_button.setToolTip(self._get_theme_tooltip())
        self.theme_button.clicked.connect(self._cycle_theme)
        header_layout.addWidget(self.theme_button)

        header_layout.addStretch()

        self.minimize_button = QPushButton("—")
        self.minimize_button.setObjectName("minimizeButton")
        self.minimize_button.clicked.connect(self.showMinimized)

        self.maximize_button = QPushButton("⬜")
        self.maximize_button.setObjectName("maximizeButton")
        self.maximize_button.clicked.connect(self.toggle_maximize_restore)

        self.close_button = QPushButton("✕")
        self.close_button.setObjectName("closeButton")
        self.close_button.clicked.connect(self.close)

        header_layout.addWidget(self.minimize_button)
        header_layout.addWidget(self.maximize_button)
        header_layout.addWidget(self.close_button)

    def toggle_maximize_restore(self):
        if self.isMaximized():
            self.showNormal()
            self.maximize_button.setText("⬜")
        else:
            self.showMaximized()
            self.maximize_button.setText("❐")

    def _create_nav_bar(self):
        self.nav_bar = QWidget()
        self.nav_bar.setObjectName("nav_bar")
        self.nav_bar.setFixedWidth(self.nav_bar_width_expanded)
        self.nav_bar_layout = QVBoxLayout(self.nav_bar)
        self.nav_bar_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.nav_bar_layout.setContentsMargins(5, 5, 5, 5)
        self.nav_bar_layout.setSpacing(5)

        self.toggle_button = QPushButton("👈")
        self.toggle_button.setObjectName("toggleButton")
        self.toggle_button.clicked.connect(self.toggle_nav_bar)
        self.nav_bar_layout.addWidget(self.toggle_button)

        self.nav_button_group = QButtonGroup(self)
        self.nav_button_group.setExclusive(True)
        self.nav_button_group.idClicked.connect(self.handle_nav_click)
    
    def _add_tabs(self):
        self._tab_index_to_icon_key = {}
        tabs = self.loc.get("tabs", {})

        # ---- Create all tab widgets and connect signals (unchanged) ----
        self.selector_page = SaveSelectorWidget()
        self.selector_page.open_save_requested.connect(self.open_save_from_selector)
        self.selector_page.refresh_button.clicked.connect(self.scan_for_saves)

        self.character_tab = QtCharacterTab()
        self.character_tab.character_data_changed.connect(self.handle_character_update)
        self.character_tab.sync_levels_requested.connect(self.handle_sync_levels)
        self.character_tab.unlock_requested.connect(self.handle_unlock_request)

        self.items_tab = QtItemsTab()
        self.items_tab.add_item_requested.connect(self.handle_add_to_backpack)
        self.items_tab.update_item_requested.connect(self.handle_update_item)
        self.items_tab.duplicate_item_requested.connect(self.handle_duplicate_item)
        self.items_tab.remove_item_requested.connect(self.handle_remove_item)
        self.items_tab.edit_item_requested.connect(self.handle_edit_item)

        self.converter_tab = QtConverterTab()
        self.converter_tab.batch_add_requested.connect(self.handle_batch_add)
        self.converter_tab.iterator_requested.connect(self.handle_iterator_request)
        self.converter_tab.iterator_add_to_backpack_requested.connect(self.handle_iterator_add_to_backpack)

        self.yaml_editor_tab = QtYamlEditorTab()
        self.yaml_editor_tab.yaml_text_changed.connect(self.handle_yaml_update)

        self.class_mod_tab = QtClassModEditorTab()
        self.class_mod_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)

        self.enhancement_tab = QtEnhancementEditorTab()
        self.enhancement_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)

        self.weapon_editor_tab = QtWeaponEditorTab(self)
        self.weapon_editor_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)
        self.weapon_editor_tab.update_item_requested.connect(self.handle_update_item)

        self.item_edit_tab = ItemEditTab(self)
        self.item_edit_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)
        self.item_edit_tab.update_item_requested.connect(self.handle_update_item)

        self.weapon_generator_tab = QtWeaponGeneratorTab()
        self.weapon_generator_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)

        self.grenade_tab = QtGrenadeEditorTab()
        self.grenade_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)
        self.shield_tab = QtShieldEditorTab()
        self.shield_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)
        self.repkit_tab = QtRepkitEditorTab()
        self.repkit_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)
        self.heavy_weapon_tab = QtHeavyWeaponEditorTab()
        self.heavy_weapon_tab.add_to_backpack_requested.connect(self.handle_add_to_backpack)

        self.master_search_tab = QtMasterSearchTab(self.controller, getattr(self, "params", None), self.loc, parent=self)

        # ---- Sections: (widget, label, icon_key) ----
        backpack_label = tabs.get("backpack", tabs.get("items", "Backpack"))
        self.character_section = SectionWithSubNav([
            (self.selector_page, tabs.get("select_save", "Select Save"), "select_save"),
            (self.character_tab, tabs.get("character", "Character"), "character"),
            (self.yaml_editor_tab, tabs.get("yaml_editor", "YAML"), "yaml"),
        ], self.loc)
        self.inventory_section = SectionWithSubNav([
            (self.converter_tab, tabs.get("converter", "Parts Translator"), "converter"),
            (self.items_tab, backpack_label, "items"),
        ], self.loc)
        self.weapon_toolbox_section = SectionWithSubNav([
            (self.weapon_generator_tab, tabs.get("weapon_generator", "Weapon Gen"), "weapon_gen"),
            (self.weapon_editor_tab, tabs.get("weapon_editor", "Weapon Edit"), "weapon_edit"),
            (self.item_edit_tab, tabs.get("item_edit", "Item Edit"), "item_edit"),
        ], self.loc)
        self.accessories_section = SectionWithSubNav([
            (self.class_mod_tab, tabs.get("class_mod", "Class Mod"), "class_mod"),
            (self.enhancement_tab, tabs.get("enhancement", "Enhancement"), "enhancement"),
            (self.repkit_tab, tabs.get("repkit", "RepKit"), "repkit"),
            (self.grenade_tab, tabs.get("grenade", "Grenade"), "grenade"),
            (self.shield_tab, tabs.get("shield", "Shield"), "shield"),
            (self.heavy_weapon_tab, tabs.get("heavy_weapon", "Heavy"), "heavy"),
        ], self.loc)

        self._section_widgets = {
            SECTION_CHARACTER: self.character_section,
            SECTION_INVENTORY: self.inventory_section,
            SECTION_WEAPON_TOOLBOX: self.weapon_toolbox_section,
            SECTION_ACCESSORIES: self.accessories_section,
        }
        self._section_key_to_index = {}

        # ---- Main content stack: Dashboard + 5 sections ----
        self.dashboard_widget = DashboardWidget(self.loc)
        self.dashboard_widget.section_clicked.connect(self._on_dashboard_section_clicked)
        self.add_tab(self.dashboard_widget, tabs.get("home", "Home"), "home", "🏠")
        self._section_key_to_index[SECTION_HOME] = 0

        self.add_tab(self.character_section, tabs.get("character", "Character"), "character", "👤")
        self._section_key_to_index[SECTION_CHARACTER] = 1
        self.character_section.sub_tab_changed.connect(self._on_section_sub_tab_changed)

        self.add_tab(self.inventory_section, tabs.get("inventory", "Inventory"), "inventory", "🎒")
        self._section_key_to_index[SECTION_INVENTORY] = 2
        self.inventory_section.sub_tab_changed.connect(self._on_section_sub_tab_changed)

        self.add_tab(self.weapon_toolbox_section, tabs.get("weapon_toolbox", "Weapon Toolbox"), "weapon_toolbox", "🔫")
        self._section_key_to_index[SECTION_WEAPON_TOOLBOX] = 3
        self.weapon_toolbox_section.sub_tab_changed.connect(self._on_section_sub_tab_changed)

        self.add_tab(self.accessories_section, tabs.get("accessories", "Accessories"), "accessories", "🛡️")
        self._section_key_to_index[SECTION_ACCESSORIES] = 4
        self.accessories_section.sub_tab_changed.connect(self._on_section_sub_tab_changed)

        self.add_tab(self.master_search_tab, tabs.get("master_search", "Master Search"), "master_search", "🔎")
        self._section_key_to_index[SECTION_MASTER_SEARCH] = 5

        QTimer.singleShot(800, self._maybe_weekly_db_check)
        if self.nav_button_group.buttons():
            self.nav_button_group.buttons()[0].click()

    def add_tab(self, widget: QWidget, text: str, icon_key: str, icon_char: str = ""):
        index = self.content_stack.addWidget(widget)
        self._tab_index_to_icon_key[index] = icon_key

        # Button text: emoji only used for collapsed nav; expanded uses clean label
        button = QPushButton(f"   {text}")
        button.setProperty("fullText", f"   {text}")
        button.setProperty("iconChar", icon_char or "")
        button.setProperty("iconKey", icon_key)

        # Load a themed icon if available
        try:
            icon_path = resource_loader.get_resource_path(Path("assets") / "icons" / f"{icon_key}.png")
            if icon_path and Path(icon_path).exists():
                button.setIcon(QIcon(str(icon_path)))
                button.setIconSize(QSize(18, 18))
        except Exception:
            pass

        button.setCheckable(True)
        self.nav_bar_layout.addWidget(button)
        self.nav_button_group.addButton(button, index)
    
    def switch_to_tab(self, index: int):
        if 0 <= index < self.content_stack.count():
            self.content_stack.setCurrentIndex(index)
            if hasattr(self, "converter_tab") and self.converter_tab and hasattr(self, "_tab_index_to_icon_key"):
                icon_key = self._tab_index_to_icon_key.get(index)
                if icon_key and getattr(self.converter_tab, "_section_source_prefixes", None) and icon_key in self.converter_tab._section_source_prefixes:
                    self.converter_tab.set_resolve_section(icon_key)
            # The button group `idClicked` signal is connected to `handle_nav_click`,
            # which already calls `setCurrentIndex`. To avoid recursion and redundant calls,
            # we directly update the button's checked state and styles.
            button_to_check = self.nav_button_group.button(index)
            if button_to_check and not button_to_check.isChecked():
                # Manually set the button as checked. This will not emit `idClicked`.
                button_to_check.setChecked(True)
            self.update_action_states()

    def _on_dashboard_section_clicked(self, section_key: str):
        idx = getattr(self, "_section_key_to_index", {}).get(section_key)
        if idx is not None:
            self.switch_to_tab(idx)

    def _on_section_sub_tab_changed(self, icon_key: str):
        if hasattr(self, "converter_tab") and self.converter_tab and getattr(self.converter_tab, "_section_source_prefixes", None) and icon_key in self.converter_tab._section_source_prefixes:
            self.converter_tab.set_resolve_section(icon_key)

    def switch_to_section_and_sub(self, section_key: str, sub_icon_key: str):
        """Switch to a section and select the sub-tab by icon_key (e.g. weapon_toolbox + weapon_edit)."""
        idx = getattr(self, "_section_key_to_index", {}).get(section_key)
        if idx is None:
            return
        self.switch_to_tab(idx)
        section = getattr(self, "_section_widgets", {}).get(section_key)
        if section and hasattr(section, "index_for_icon_key") and hasattr(section, "set_current_sub_index"):
            sub_idx = section.index_for_icon_key(sub_icon_key)
            section.set_current_sub_index(sub_idx)

    @pyqtSlot(int)
    def handle_nav_click(self, index: int):
        self.content_stack.setCurrentIndex(index)
        # If we switched to a section with sub-tabs, set converter resolve from current sub-tab
        w = self.content_stack.widget(index) if 0 <= index < self.content_stack.count() else None
        if hasattr(w, "current_icon_key"):
            icon_key = w.current_icon_key()
            if hasattr(self, "converter_tab") and self.converter_tab and getattr(self.converter_tab, "_section_source_prefixes", None) and icon_key and icon_key in self.converter_tab._section_source_prefixes:
                self.converter_tab.set_resolve_section(icon_key)
        elif hasattr(self, "converter_tab") and self.converter_tab and hasattr(self, "_tab_index_to_icon_key"):
            icon_key = self._tab_index_to_icon_key.get(index)
            if icon_key and getattr(self.converter_tab, "_section_source_prefixes", None) and icon_key in self.converter_tab._section_source_prefixes:
                self.converter_tab.set_resolve_section(icon_key)
        self.update_action_states()

    def browse_and_open_save(self):
        """
        Open文件选择对话框，让用户手动选择存档文件。
        """
        # 尝试定位到默认的存档路径作为起始目录
        custom_save = self.selector_page.get_custom_save_path()
        if custom_save and os.path.exists(custom_save):
            initial_path = custom_save
        else:
            start_dir = os.path.expanduser('~/Documents')
            possible_paths = [
                os.path.join(start_dir, "My Games", "Borderlands 4", "Saved", "SaveGames"),
                start_dir
            ]
            initial_path = start_dir
            for p in possible_paths:
                if os.path.exists(p):
                    initial_path = p
                    break

        file_path, _ = QFileDialog.getOpenFileName(
            self,
            self.loc['header']['open'], 
            initial_path,
            "Borderlands 4 Save (*.sav);;All Files (*.*)"
        )

        if not file_path:
            return

        path_obj = Path(file_path)
        # 尝试从路径中回溯获取ID
        # 这里的逻辑参考了存档结构：.../SaveGames/<ID>/Profiles/client/...
        # 我们向上遍历父文件夹，寻找符合ID特征的文件夹名
        inferred_id = ""
        current_path = path_obj.parent
        
        # 防止死循环，最多向上查找5层 (SaveGames -> ID -> Profiles -> client -> save)
        for _ in range(5):
            dirname = current_path.name
            # 简单检查是否符合ID特征 (参考 save_game_controller.validate_user_id)
            # Steam ID: 17位数字
            # Epic ID: 较长的字母数字组合 (通常 > 10)
            # 排除常见文件夹名如 "Profiles", "client", "SaveGames" (有些虽然是字母但长度不够)
            
            is_valid_format = False
            if dirname.isdigit() and 10 <= len(dirname) <= 20:
                is_valid_format = True
            elif dirname.replace('-', '').replace('_', '').isalnum() and 10 <= len(dirname) <= 50:
                # 排除一些特定的短名字，虽然上面长度判断可能已经排除了一部分
                if dirname.lower() not in ["profiles", "client", "savegames", "saved", "config"]:
                    is_valid_format = True
            
            if is_valid_format:
                inferred_id = dirname
                break
            
            if current_path.parent == current_path: # 到达根目录
                break
            current_path = current_path.parent

        self.open_save_from_selector(file_path, inferred_id)

    @pyqtSlot()
    def toggle_nav_bar(self):
        self.is_nav_bar_expanded = not self.is_nav_bar_expanded
        target_width = self.nav_bar_width_expanded if self.is_nav_bar_expanded else self.nav_bar_width_collapsed

        # Set a dynamic property to reflect the collapsed state
        collapsed = not self.is_nav_bar_expanded
        self.nav_bar.setProperty("navCollapsed", collapsed)
        # Switch ObjectName to allow simpler ID selectors in QSS
        self.nav_bar.setObjectName("nav_bar_collapsed" if collapsed else "nav_bar")
        
        self.nav_bar.style().unpolish(self.nav_bar)
        self.nav_bar.style().polish(self.nav_bar)

        for button in self.nav_button_group.buttons():
            if self.is_nav_bar_expanded:
                button.setText(button.property("fullText"))
            else:
                button.setText(button.property("iconChar"))
            
            # Force style update for the button to recognize parent ObjectName change
            button.style().unpolish(button)
            button.style().polish(button)
        
        self.toggle_button.setText("👈" if self.is_nav_bar_expanded else "👉")

        self.animation = QPropertyAnimation(self.nav_bar, b"minimumWidth")
        self.animation.setDuration(250)
        self.animation.setStartValue(self.nav_bar.width())
        self.animation.setEndValue(target_width)
        self.animation.setEasingCurve(QEasingCurve.Type.InOutCubic)
        self.animation.start()

    @pyqtSlot(str, str)
    def open_save_from_selector(self, file_path_str: str, user_id: str):
        file_path = Path(file_path_str)
        current_user_id = user_id
        
        custom_backup_path = self.selector_page.get_custom_backup_path()
        
        # 标记是否是第一次尝试，用于控制Error信息的显示
        # 如果一开始就没有ID，不算是一次"失败"的尝试，直接提示输入
        first_attempt = True

        while True:
            try:
                _, platform, backup_name = self.controller.decrypt_save(file_path, current_user_id, custom_backup_path)
                
                # Success
                QMessageBox.information(self, self.loc['dialogs']['success'], 
                                        self.loc['dialogs']['decrypt_success'].format(platform=platform.upper(), backup_name=backup_name))
                self.setWindowTitle(f"{self.loc['window_title'].format(version=VERSION)} - {file_path.name}")
                
                QTimer.singleShot(0, self.refresh_all_tabs)
                self.switch_to_tab(1)  # Switch to Character section
                return # Break loop and exit

            except Exception as e:
                # Prepare dialog message
                dialog_title = self.loc['dialogs']['user_id_needed']
                dialog_msg = self.loc['dialogs']['enter_user_id']
                
                # 如果是尝试过一次（且不是因为ID为空导致的验证Error），或者ID本身就不为空但失败了
                if (not first_attempt) or (current_user_id and str(e) != "User ID cannot be empty"):
                     # 简化Error信息显示，只显示第一行关键信息
                    err_lines = str(e).split('\n')
                    short_err = err_lines[0] if err_lines else str(e)
                    
                    dialog_title = self.loc['dialogs']['decrypt_failed']
                    dialog_msg = self.loc['dialogs']['decrypt_failed_msg'].format(user_id=current_user_id, error=short_err)

                # Popup input dialog
                text, ok = QInputDialog.getText(self, dialog_title, dialog_msg, QLineEdit.EchoMode.Normal, current_user_id)
                
                if ok:
                    current_user_id = text.strip()
                    first_attempt = False
                else:
                    # User cancelled
                    # If it was a critical failure during the first automated attempt, maybe show the error?
                    # But usually cancel means "I give up".
                    if not first_attempt: # If user gave up after a retry
                        QMessageBox.warning(self, self.loc['dialogs']['cancel'], self.loc['dialogs']['open_cancelled'])
                    return

    def update_action_states(self):
        is_editor_active = self.content_stack.currentIndex() > 0
        self.save_action.setEnabled(is_editor_active)
        self.save_as_action.setEnabled(is_editor_active)

    @pyqtSlot()
    def scan_for_saves(self):
        custom_path = self.selector_page.get_custom_save_path()
        saves = self.controller.scan_save_folders(custom_path)
        self.selector_page.update_view(saves)

    def refresh_all_tabs(self):
        if not self.controller.yaml_obj: return
        self.log("Main window: Starting to refresh all tabs.")
        try:
            self.character_tab.update_fields(self.controller.get_character_data())
            self.log("  - Character tab refreshed.")
            self.items_tab.update_tree(self.controller.get_all_items())
            self.log("  - Items tab refreshed.")
            if hasattr(self, 'weapon_editor_tab'):
                self.log("  - Refreshing weapon editor tab...")
                self.weapon_editor_tab.refresh_backpack_items()
                self.log("  - Weapon editor tab refreshed.")
            if hasattr(self, 'item_edit_tab'):
                self.item_edit_tab.refresh_backpack_items()
                self.log("  - Item edit tab refreshed.")
            self.yaml_editor_tab.set_yaml_text(self.controller.get_yaml_string())
            self.log("  - YAML editor tab refreshed.")
        except Exception as e:
            self.log(f"CRITICAL: An exception occurred during refresh_all_tabs: {e}", force_popup=True)
        self.log("Main window: Finished refreshing all tabs.")

    def log(self, message, force_popup=False):
        self.status_label.setText(message)
        try:
            # Persist to log file for automated test sessions
            if force_popup or (isinstance(message, str) and message.startswith("CRITICAL")):
                NV_LOG.error(str(message))
            else:
                NV_LOG.info(str(message))
        except Exception:
            pass
        if force_popup:
            QMessageBox.critical(self, self.loc['dialogs']['critical'], str(message))

    @pyqtSlot(str, str)
    def handle_add_to_backpack(self, serial_input: str, flag: str):
        if not self.controller.yaml_obj: 
            QMessageBox.warning(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['load_save_first'])
            return
        
        try:
            if serial_input.strip().startswith('@U'):
                final_serial = serial_input
            else:
                encoded_serial, err = b_encoder.encode_to_base85(serial_input)
                if err:
                    QMessageBox.critical(self, self.loc['dialogs']['encode_failed'], 
                                         self.loc['dialogs']['encode_failed_msg'].format(error=err))
                    return
                final_serial = encoded_serial
            
            path = self.controller.add_item_to_backpack(final_serial, flag)
            if path:
                QMessageBox.information(self, self.loc['dialogs']['success'], self.loc['dialogs']['add_success'])
                self.refresh_all_tabs()
            else:
                QMessageBox.critical(self, self.loc['dialogs']['error'], self.loc['dialogs']['add_fail'])

        except Exception as e:
            self.log(self.loc['dialogs']['add_error'].format(error=e), force_popup=True)
    
    @pyqtSlot(dict)
    def handle_update_item(self, payload: dict):
        if not self.controller.yaml_obj:
            QMessageBox.warning(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['load_save_first'])
            return
        try:
            # The controller's update_item method is designed to handle the logic 
            # of whether to re-encode based on changed data.
            msg = self.controller.update_item(
                item_path=payload['item_path'],
                original_item_data=payload['original_item_data'],
                new_item_data=payload['new_item_data']
            )
            final_msg = payload.get("success_msg", msg)
            QMessageBox.information(self, self.loc['dialogs']['success'], final_msg)
            self.refresh_all_tabs()
        except Exception as e:
            # Catch potential crashes from C-extensions and show an error dialog
            self.log(self.loc['dialogs']['update_error'].format(error=e), force_popup=True)

    def handle_duplicate_item(self, item: dict):
        """Duplicate an item by re-adding its serial to the backpack."""
        if not self.controller.yaml_obj:
            QMessageBox.warning(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['load_save_first'])
            return
        try:
            serial = item.get("serial", "")
            state_flags = str(item.get("state_flags", 0))
            if not serial:
                return
            self.controller.add_item_to_backpack(serial, state_flags)
            self.refresh_all_tabs()
        except Exception as e:
            self.log(f"Duplicate item failed: {e}", force_popup=True)

    def handle_remove_item(self, item: dict):
        """Remove an item from the save using its original path."""
        if not self.controller.yaml_obj:
            QMessageBox.warning(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['load_save_first'])
            return
        try:
            ok = self.controller.remove_item(item)
            if ok:
                self.refresh_all_tabs()
            else:
                QMessageBox.warning(self, self.loc['dialogs']['error'], "Could not remove item (path not found).")
        except Exception as e:
            self.log(f"Remove item failed: {e}", force_popup=True)

    def handle_edit_item(self, item: dict):
        """Open an item in the Wpn Edit tab by populating the serial fields."""
        try:
            self.switch_to_section_and_sub(SECTION_WEAPON_TOOLBOX, "weapon_edit")
            # Use the tab's load helper so both Base85 + Decoded populate and parse
            # regardless of focus state.
            if hasattr(self, "weapon_editor_tab") and self.weapon_editor_tab:
                if hasattr(self.weapon_editor_tab, "load_from_item"):
                    self.weapon_editor_tab.load_from_item(item)
                else:
                    # Fallback (older builds)
                    serial_b85 = item.get("serial", "") or ""
                    decoded = item.get("decoded_full", "") or item.get("decoded", "") or ""
                    self.weapon_editor_tab.serial_b85_entry.setPlainText(str(serial_b85))
                    if decoded:
                        self.weapon_editor_tab.serial_decoded_entry.setPlainText(str(decoded))
        except Exception as e:
            self.log(f"Edit item failed: {e}", force_popup=True)

    @pyqtSlot(dict)
    def handle_character_update(self, data: dict):
        if not self.controller.yaml_obj: return
        paths = data.pop('cur_paths', {})
        if self.controller.apply_character_data(data, paths):
            QMessageBox.information(self, self.loc['dialogs']['success'], self.loc['dialogs']['char_applied'])
            self.refresh_all_tabs()
        else:
            QMessageBox.critical(self, self.loc['dialogs']['error'], self.loc['dialogs']['char_apply_error'])

    @pyqtSlot()
    def handle_sync_levels(self):
        if not self.controller.yaml_obj: return
        reply = QMessageBox.question(self, self.loc['dialogs']['warning'], self.loc['dialogs']['confirm_sync'], QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            success, fail, info = self.controller.sync_inventory_levels()
            msg = self.loc['dialogs']['sync_msg'].format(success=success, fail=fail)
            if fail > 0:
                details = '/n'.join(info)
                QMessageBox.warning(self, self.loc['dialogs']['sync_partial'], f"{msg}{self.loc['dialogs']['sync_fail_details'].format(details=details)}")
            else:
                QMessageBox.information(self, self.loc['dialogs']['sync_title'], msg)
            
            if success > 0: self.refresh_all_tabs()

    @pyqtSlot(str, dict)
    def handle_unlock_request(self, preset_name: str, params: dict):
        if not self.controller.yaml_obj: 
            QMessageBox.warning(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['load_save_first'])
            return
        
        # Ask for confirmation? Maybe not for all, but "unlock_max_everything" is big.
        # For now, direct apply as in original tool.
        
        if self.controller.apply_unlock_preset(preset_name, params):
            QMessageBox.information(self, self.loc['dialogs']['success'], self.loc['dialogs']['preset_applied'].format(name=preset_name))
            self.refresh_all_tabs()
        else:
            QMessageBox.critical(self, self.loc['dialogs']['error'], self.loc['dialogs']['preset_fail'].format(name=preset_name))

    @pyqtSlot(str)
    def handle_yaml_update(self, yaml_string: str):
        if self.controller.update_yaml_object(yaml_string):
            self.refresh_all_tabs()

    @pyqtSlot(list, str)
    def handle_batch_add(self, lines: list, flag: str):
        if not self.controller.yaml_obj:
            QMessageBox.critical(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['decrypt_save_first'])
            self.converter_tab.finalize_batch_add(0, 0)
            return

        self.batch_add_thread = QThread()
        self.batch_add_worker = BatchAddWorker(self.controller, lines, flag)
        self.batch_add_worker.moveToThread(self.batch_add_thread)

        self.batch_add_thread.started.connect(self.batch_add_worker.run)
        self.batch_add_worker.finished.connect(self.on_batch_add_finished)
        self.batch_add_worker.progress.connect(self.converter_tab.update_batch_add_status)

        self.batch_add_worker.finished.connect(self.batch_add_thread.quit)
        self.batch_add_worker.finished.connect(self.batch_add_worker.deleteLater)
        self.batch_add_thread.finished.connect(self.batch_add_thread.deleteLater)
        
        self.batch_add_thread.start()

    def on_batch_add_finished(self, success_count, fail_count):
        self.converter_tab.finalize_batch_add(success_count, fail_count)
        if success_count > 0:
            QMessageBox.information(self, self.loc['dialogs']['batch_complete'], 
                                    self.loc['dialogs']['batch_success'].format(count=success_count))
            self.refresh_all_tabs()
        else:
            QMessageBox.warning(self, self.loc['dialogs']['batch_fail'], 
                                self.loc['dialogs']['batch_fail_msg'].format(count=fail_count))

    def _start_iterator_worker(self, params, add_to_backpack=False):
        if not self.controller.yaml_obj and add_to_backpack:
            QMessageBox.critical(self, self.loc['dialogs']['no_save'], self.loc['dialogs']['decrypt_save_first'])
            self.converter_tab.finalize_iterator_add_to_backpack(0,0)
            return

        params['add_to_backpack'] = add_to_backpack
        self.iterator_thread = QThread()
        self.iterator_worker = IteratorWorker(self.controller, params, self.loc['worker'])
        self.iterator_worker.moveToThread(self.iterator_thread)

        self.iterator_thread.started.connect(self.iterator_worker.run)
        self.iterator_worker.status_update.connect(self.converter_tab.update_iterator_status)

        if add_to_backpack:
            self.iterator_worker.finished_add_to_backpack.connect(self.on_iterator_add_finished)
        else:
            self.iterator_worker.finished_generation.connect(self.converter_tab.finalize_iterator_processing)

        self.iterator_worker.finished_generation.connect(self.iterator_thread.quit)
        self.iterator_worker.finished_add_to_backpack.connect(self.iterator_thread.quit)
        self.iterator_worker.finished_generation.connect(self.iterator_worker.deleteLater)
        self.iterator_worker.finished_add_to_backpack.connect(self.iterator_worker.deleteLater)
        self.iterator_thread.finished.connect(self.iterator_thread.deleteLater)
        
        self.iterator_thread.start()

    @pyqtSlot(dict)
    def handle_iterator_request(self, params: dict):
        self._start_iterator_worker(params, add_to_backpack=False)

    @pyqtSlot(dict)
    def handle_iterator_add_to_backpack(self, params: dict):
        self._start_iterator_worker(params, add_to_backpack=True)

    def on_iterator_add_finished(self, success, fail):
        self.converter_tab.finalize_iterator_add_to_backpack(success, fail)
        if success > 0:
            QMessageBox.information(self, self.loc['dialogs']['iter_complete'], 
                                    self.loc['dialogs']['iter_success'].format(count=success))
            self.refresh_all_tabs()
        else:
            QMessageBox.warning(self, self.loc['dialogs']['iter_fail'], 
                                self.loc['dialogs']['iter_fail_msg'].format(count=fail))
            
    @pyqtSlot(bool)
    def encrypt_and_save(self, save_as=False):
        if not self.controller.yaml_obj: return
        
        path_to_save = self.controller.save_path
        if save_as or not path_to_save:
            path, _ = QFileDialog.getSaveFileName(self, self.loc['dialogs']['save_encrypted_title'], str(path_to_save), "BL4 存档 (*.sav)")
            if not path: return
            path_to_save = Path(path)
        
        try:
            data = self.controller.encrypt_save(self.controller.get_yaml_string())
            path_to_save.write_bytes(data)
            QMessageBox.information(self, self.loc['dialogs']['success'], 
                                    self.loc['dialogs']['save_saved'].format(path=path_to_save))
        except Exception as e:
            QMessageBox.critical(self, self.loc['dialogs']['encrypt_failed'], str(e))

    def _get_lang_button_text(self):
        code_map = {
            'zh-CN': "CN",
            'en-US': "EN",
            'ru': "RU",
            'ua': "UA"
        }
        return f"🌐 {code_map.get(self.current_language, 'EN')}"

    def change_language(self, lang_code):
        if self.current_language == lang_code:
            return

        print(f"DEBUG: change_language started. New: {lang_code}")
        self.current_language = lang_code
        
        # Update backend localization
        bl4f.set_language(self.current_language)

        self.lang_button.setText(self._get_lang_button_text())
        
        self._load_localization()
        self.update_ui_text()
        
        # Update tabs
        tabs_to_update = [
            self.grenade_tab, self.shield_tab, self.repkit_tab, self.heavy_weapon_tab,
            self.weapon_editor_tab, self.weapon_generator_tab, self.item_edit_tab,
            self.character_tab, self.selector_page, self.items_tab, self.converter_tab,
            self.yaml_editor_tab, self.class_mod_tab, self.enhancement_tab
        ]
        for tab in tabs_to_update:
            if hasattr(tab, 'update_language'):
                print(f"DEBUG: Updating language for tab {tab.__class__.__name__}")
                try:
                    tab.update_language(self.current_language)
                    print(f"DEBUG: Updated language for tab {tab.__class__.__name__}")
                except Exception as e:
                    print(f"DEBUG: Error updating language for tab {tab.__class__.__name__}: {e}")
        
        # Refresh all tabs to re-fetch items with new localization
        self.refresh_all_tabs()
        
        print("DEBUG: change_language finished")
        
    def update_ui_text(self):
        self.setWindowTitle(self.loc['window_title'])
        self.header_bar.findChild(QLabel, "titleLabel").setText(self.loc['header']['title'])
        self.header_bar.findChild(QLabel, "subtitleLabel").setText(self.loc['subtitle'])
        self.open_button.setText(self.loc['header']['open'])
        self.save_button.setText(self.loc['header']['save'])
        self.save_as_button.setText(self.loc['header']['save_as'])
        self.open_action.setText(self.loc['menu']['open_selector'])
        self.save_action.setText(self.loc['menu']['save'])
        self.save_as_action.setText(self.loc['menu']['save_as'])
        self.status_label.setText(self.loc['status']['welcome'])
        if hasattr(self, 'credit_label'): self.credit_label.setText(self.loc['status'].get('credit', ""))
        self.lang_button.setText(self._get_lang_button_text())
        
        # Update dashboard card labels when language changes
        if hasattr(self, "dashboard_widget") and self.dashboard_widget and hasattr(self.dashboard_widget, "set_loc"):
            self.dashboard_widget.set_loc(self.loc)
        # Update tab titles (6 main nav: Home, Character, Inventory, Weapon Toolbox, Accessories, Master Search)
        tab_keys = ['home', 'character', 'inventory', 'weapon_toolbox', 'accessories', 'master_search']
        for i, key in enumerate(tab_keys):
            button = self.nav_button_group.button(i)
            if button:
                icon_char = button.property("iconChar")
                label = self.loc['tabs'].get(key, key.replace('_', ' ').title())
                new_full_text = f" {icon_char}   {label}"
                button.setProperty("fullText", new_full_text)
                if self.is_nav_bar_expanded:
                    button.setText(new_full_text)
                else:
                    button.setText(icon_char)

    def _apply_themed_stylesheet(self):
        """Apply the themed stylesheet from ThemeManager."""
        stylesheet = self.theme_manager.get_stylesheet()
        if stylesheet:
            self.setStyleSheet(stylesheet)
        else:
            print("Warning: stylesheet.qss not found or failed to load.")

    def _cycle_theme(self):
        """Cycle theme: Monster → Industrial → Slate → Obsidian → Monster."""
        self.theme_manager.cycle_theme()
        self._apply_themed_stylesheet()
        self._update_theme_button()
        try:
            if hasattr(self, 'background_widget') and self.background_widget:
                self.background_widget.set_theme(self.theme_manager)
        except Exception:
            pass
        try:
            self._load_master_search()
        except Exception:
            pass

    def toggle_theme(self):
        """Toggle between Monster and Industrial (kept for compatibility)."""
        self.theme_manager.toggle_theme()
        self._apply_themed_stylesheet()
        self._update_theme_button()
        try:
            if hasattr(self, 'background_widget') and self.background_widget:
                self.background_widget.set_theme(self.theme_manager)
        except Exception:
            pass
        try:
            self._load_master_search()
        except Exception:
            pass

    def _get_theme_tooltip(self):
        """Tooltip: current theme name and hint to cycle."""
        name = self.theme_manager.get_theme_display_name()
        return f"Theme: {name}  (click for next)"

    def _update_theme_button(self):
        """Update the theme button icon and tooltip."""
        self.theme_button.setText(self.theme_manager.get_theme_icon())
        self.theme_button.setToolTip(self._get_theme_tooltip())

# --- Bind module-scope helpers onto MainWindow (prevents AttributeError if defs drift out of class) ---
try:
    MainWindow._maybe_weekly_db_check = _maybe_weekly_db_check
except Exception:
    pass

def main():
    app = QApplication(sys.argv)
    icon_path = resource_loader.get_resource_path("BL4.ico")
    if icon_path:
        app.setWindowIcon(QIcon(str(icon_path)))
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()