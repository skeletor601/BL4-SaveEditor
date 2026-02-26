"""theme_manager.py

NeonVault theme manager.

Themes (all dark, modern & sleek):
* monster - matte charcoal + lime accents (default)
* dark    - Industrial: dark steel + electric blue
* slate   - cool gray + teal accent
* obsidian - deep black + amber accent

Legacy theme names 'neon' and 'light' are treated as 'monster'.
"""

from PyQt6.QtCore import QSettings
import resource_loader


class ThemeManager:
    """Manages application themes (Monster / Dark / Slate / Obsidian)."""

    MONSTER = "monster"
    DARK = "dark"
    SLATE = "slate"
    OBSIDIAN = "obsidian"
    NEON = "neon"

    _ALL_THEMES = (MONSTER, DARK, SLATE, OBSIDIAN)

    def __init__(self):
        self.settings = QSettings("SuperExboom", "BL4SaveEditor")
        self._current_theme = self._load_saved_theme()
        self._stylesheet_template = self._load_stylesheet_template()

    @property
    def current(self):
        return self._current_theme

    def _load_saved_theme(self):
        saved = self.settings.value("theme", self.MONSTER, type=str)
        if saved in (self.NEON, "light"):
            saved = self.MONSTER
        if saved not in self._ALL_THEMES:
            saved = self.MONSTER
        return saved

    def _load_stylesheet_template(self):
        fname = self.get_stylesheet_filename()
        content = resource_loader.load_text_resource(fname)
        return content or ""

    def get_stylesheet_filename(self) -> str:
        return {
            self.MONSTER: "stylesheet_monster.qss",
            self.DARK: "stylesheet_dark.qss",
            self.SLATE: "stylesheet_slate.qss",
            self.OBSIDIAN: "stylesheet_obsidian.qss",
        }.get(self._current_theme, "stylesheet_monster.qss")

    def get_background_filename(self) -> str:
        if self._current_theme == self.MONSTER:
            return "bg_monster.jpg"
        return "bg_dark.jpg"

    def set_theme(self, theme_name: str):
        if theme_name in (self.NEON, "light"):
            theme_name = self.MONSTER
        if theme_name not in self._ALL_THEMES:
            return
        self._current_theme = theme_name
        self.settings.setValue("theme", theme_name)
        self._stylesheet_template = self._load_stylesheet_template()

    def cycle_theme(self):
        """Cycle to next theme: Monster → Dark → Slate → Obsidian → Monster."""
        idx = self._ALL_THEMES.index(self._current_theme)
        next_theme = self._ALL_THEMES[(idx + 1) % len(self._ALL_THEMES)]
        self.set_theme(next_theme)
        return next_theme

    def toggle_theme(self):
        """Toggle between first two (Monster ↔ Dark). For full cycle use cycle_theme()."""
        new_theme = self.DARK if self._current_theme == self.MONSTER else self.MONSTER
        self.set_theme(new_theme)
        return new_theme

    def get_stylesheet(self):
        return self._stylesheet_template

    def is_dark(self):
        return self._current_theme in (self.DARK, self.SLATE, self.OBSIDIAN)

    def is_neon(self):
        return self._current_theme == self.MONSTER

    def get_theme_icon(self):
        icons = {
            self.MONSTER: "🌙",
            self.DARK: "🧪",
            self.SLATE: "◐",
            self.OBSIDIAN: "◆",
        }
        return icons.get(self._current_theme, "🌙")

    def get_theme_display_name(self):
        names = {
            self.MONSTER: "Monster",
            self.DARK: "Industrial",
            self.SLATE: "Slate",
            self.OBSIDIAN: "Obsidian",
        }
        return names.get(self._current_theme, "Monster")

    def get_background_overlay_color(self):
        if self._current_theme == self.MONSTER:
            return "rgba(0, 0, 0, 0.22)"
        if self._current_theme == self.OBSIDIAN:
            return "rgba(0, 0, 0, 0.48)"
        return "rgba(0, 0, 0, 0.40)"
