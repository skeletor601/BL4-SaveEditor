"""theme_manager.py

NeonVault theme manager. Themes are named after background images in BG_Themes/.

Themes (each uses its own BG image from BG_Themes/<Name>.png or .jpg):
  Ion, Lava, Phoenix, Violet, Blue_Balls, Artic_Hex, Carbon_Flux, Platinum

Legacy theme names 'monster', 'dark', 'slate', 'obsidian', 'neon', 'light' are mapped to Ion.
"""

from pathlib import Path
from PyQt6.QtCore import QSettings
import resource_loader


class ThemeManager:
    """Manages application themes (one per BG_Themes image)."""

    ION = "Ion"
    LAVA = "Lava"
    PHOENIX = "Phoenix"
    VIOLET = "Violet"
    BLUE_BALLS = "Blue_Balls"
    ARTIC_HEX = "Artic_Hex"
    CARBON_FLUX = "Carbon_Flux"
    PLATINUM = "Platinum"

    _ALL_THEMES = (ION, LAVA, PHOENIX, VIOLET, BLUE_BALLS, ARTIC_HEX, CARBON_FLUX, PLATINUM)
    _LEGACY_MAP = {"monster": ION, "dark": ION, "slate": ION, "obsidian": ION, "neon": ION, "light": ION}

    def __init__(self):
        self.settings = QSettings("SuperExboom", "BL4SaveEditor")
        self._current_theme = self._load_saved_theme()
        self._stylesheet_template = self._load_stylesheet_template()

    @property
    def current(self):
        return self._current_theme

    def _load_saved_theme(self):
        saved = self.settings.value("theme", self.ION, type=str)
        saved = self._LEGACY_MAP.get(saved, saved) if isinstance(saved, str) else self.ION
        if saved not in self._ALL_THEMES:
            saved = self.ION
        return saved

    def _load_stylesheet_template(self):
        fname = self.get_stylesheet_filename()
        content = resource_loader.load_text_resource(fname)
        return content or ""

    def get_stylesheet_filename(self) -> str:
        # File names use the theme key as-is (Ion, Lava, ...)
        return f"stylesheet_{self._current_theme}.qss"

    # Some BG_Themes files use a space in the name (e.g. "Artic Hex.png")
    _BG_FILENAME_OVERRIDES = {"Artic_Hex": "Artic Hex"}

    def get_background_filename(self) -> str:
        """Return path for BG image: BG_Themes/<Theme>.png or .jpg. Tries .png first."""
        base_name = self._BG_FILENAME_OVERRIDES.get(self._current_theme, self._current_theme)
        base = Path("BG_Themes") / base_name
        for ext in (".png", ".jpg", ".jpeg"):
            p = base.with_suffix(ext)
            full = resource_loader.get_resource_path(p)
            if full and Path(full).exists():
                return str(p).replace("\\", "/")
        return "bg_dark.jpg"

    def set_theme(self, theme_name: str):
        theme_name = self._LEGACY_MAP.get(theme_name, theme_name) if isinstance(theme_name, str) else theme_name
        if theme_name not in self._ALL_THEMES:
            return
        self._current_theme = theme_name
        self.settings.setValue("theme", theme_name)
        self._stylesheet_template = self._load_stylesheet_template()

    def cycle_theme(self):
        idx = self._ALL_THEMES.index(self._current_theme)
        next_theme = self._ALL_THEMES[(idx + 1) % len(self._ALL_THEMES)]
        self.set_theme(next_theme)
        return next_theme

    def toggle_theme(self):
        idx = self._ALL_THEMES.index(self._current_theme)
        next_theme = self._ALL_THEMES[(idx + 1) % len(self._ALL_THEMES)]
        self.set_theme(next_theme)
        return next_theme

    def get_stylesheet(self):
        return self._stylesheet_template

    def is_dark(self):
        return True

    def is_neon(self):
        return self._current_theme == self.ION

    def get_theme_icon(self):
        icons = {
            self.ION: "⚡",
            self.LAVA: "🔥",
            self.PHOENIX: "🜲",
            self.VIOLET: "◆",
            self.BLUE_BALLS: "●",
            self.ARTIC_HEX: "⬡",
            self.CARBON_FLUX: "◈",
            self.PLATINUM: "◇",
        }
        return icons.get(self._current_theme, "⚡")

    def get_theme_display_name(self):
        return self._current_theme

    def get_background_overlay_color(self):
        overlays = {
            self.ION: "rgba(0, 0, 0, 0.25)",
            self.LAVA: "rgba(0, 0, 0, 0.45)",
            self.PHOENIX: "rgba(0, 0, 0, 0.40)",
            self.VIOLET: "rgba(0, 0, 0, 0.48)",
            self.BLUE_BALLS: "rgba(0, 0, 0, 0.38)",
            self.ARTIC_HEX: "rgba(0, 0, 0, 0.35)",
            self.CARBON_FLUX: "rgba(0, 0, 0, 0.42)",
            self.PLATINUM: "rgba(0, 0, 0, 0.30)",
        }
        return overlays.get(self._current_theme, "rgba(0, 0, 0, 0.40)")
