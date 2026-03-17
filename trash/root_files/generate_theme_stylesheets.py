#!/usr/bin/env python3
"""Generate stylesheet_<Theme>.qss for each BG_Themes theme. Run from project root."""

from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

# Theme name -> (accent_hex, selection_rgba, badge_text_hex)
THEMES = {
    "Ion": ("#00BFFF", "rgba(0,191,255,0.28)", "#0B0D0F"),
    "Lava": ("#FF6600", "rgba(255,102,0,0.30)", "#1a0d00"),
    "Phoenix": ("#FF4500", "rgba(255,69,0,0.28)", "#1a0800"),
    "Violet": ("#BF00FF", "rgba(191,0,255,0.25)", "#15001a"),
    "Blue_Balls": ("#0080FF", "rgba(0,128,255,0.28)", "#00101a"),
    "Artic_Hex": ("#00FFFF", "rgba(0,255,255,0.28)", "#0a1214"),
    "Carbon_Flux": ("#00D4AA", "rgba(0,212,170,0.26)", "#0a1412"),
    "Platinum": ("#A0B8D0", "rgba(160,184,208,0.35)", "#0f1216"),
}

TEMPLATE = """/* {name} theme: inspired by BG_Themes/{name} */
* {{ font-family: Segoe UI; font-size: 10.5pt; }}
QWidget {{ color: #E6E8EA; background: transparent; }}
QMainWindow {{ background: transparent; }}

QFrame#HeaderBar, QFrame#FooterBar {{
    background: rgba(12, 13, 14, 0.78);
    border: 1px solid rgba(70, 76, 82, 0.55);
    border-radius: 14px;
}}

QLabel#AppTitle {{
    color: #EAF2F6;
    font-size: 16pt;
    font-weight: 700;
    letter-spacing: 0.5px;
}}

QLabel#VersionBadge {{
    color: {badge_text};
    background: {accent};
    border-radius: 10px;
    padding: 4px 10px;
    font-weight: 700;
}}

QPushButton {{
    color: #EAF2F6;
    background: rgba(18, 19, 20, 0.88);
    border: 1px solid rgba(90, 98, 106, 0.55);
    border-radius: 10px;
    padding: 6px 10px;
}}
QPushButton:hover {{ border-color: {accent}; }}
QPushButton:pressed {{ background: rgba(10, 10, 10, 0.92); }}

QComboBox, QLineEdit, QTextEdit, QPlainTextEdit {{
    color: #EAF2F6;
    background: rgba(14, 15, 16, 0.85);
    border: 1px solid rgba(96, 105, 114, 0.55);
    border-radius: 10px;
    padding: 6px 10px;
    selection-background-color: {selection};
}}
QComboBox:hover, QLineEdit:hover, QTextEdit:hover, QPlainTextEdit:hover {{ border-color: {accent}; }}

QComboBox::drop-down {{ border: none; width: 26px; }}
QComboBox::down-arrow {{ image: none; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid {accent}; }}
QComboBox QAbstractItemView {{
    background-color: rgba(14, 15, 16, 0.98);
    color: #EAF2F6;
    selection-background-color: {selection};
    selection-color: #1a1a1a;
    outline: 0;
    border: 1px solid rgba(96, 105, 114, 0.55);
}}

QScrollBar:vertical {{ background: rgba(0,0,0,0.0); width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: {accent}; border-radius: 5px; min-height: 30px; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0px; }}

QGroupBox {{
    background-color: rgba(28, 30, 34, 0.92);
    border: 1px solid rgba(90, 98, 106, 0.45);
    border-radius: 12px;
    margin-top: 10px;
    padding-top: 10px;
}}
QGroupBox::title {{ subcontrol-origin: margin; left: 12px; padding: 0 6px; color: {accent}; font-weight: 600; }}

QTableWidget {{
    background: rgba(12, 13, 14, 0.55);
    border: 1px solid rgba(90, 98, 106, 0.45);
    border-radius: 12px;
    gridline-color: rgba(90, 98, 106, 0.25);
}}
QHeaderView::section {{
    background: rgba(12, 13, 14, 0.88);
    color: #EAF2F6;
    border: 0px;
    padding: 8px;
    font-weight: 700;
}}

QMenu {{
    background-color: #2d2d32;
    color: #e0e0e0;
    border: 1px solid #4a4a50;
    padding: 4px;
}}
QMenu::item {{ padding: 6px 18px; background-color: transparent; }}
QMenu::item:selected {{ background-color: #3d3d44; color: #ffffff; }}
QMenu::separator {{ height: 1px; background: #4a4a50; margin: 4px 8px; }}

QFrame#dashboardCard {{
    background: rgba(18, 19, 20, 0.88);
    border: 1px solid rgba(90, 98, 106, 0.55);
    border-radius: 16px;
    min-width: 520px;
    min-height: 440px;
}}
QFrame#dashboardCard:hover {{ border-color: {accent}; background: rgba(22, 24, 26, 0.92); }}
QLabel#dashboardCardTitle {{ color: #EAF2F6; font-weight: 700; }}
QLabel#dashboardCardDesc {{ color: rgba(234, 242, 246, 0.78); font-size: 9.5pt; }}
QWidget#sectionSubNav {{
    background: rgba(12, 13, 14, 0.65);
    border-bottom: 1px solid rgba(90, 98, 106, 0.45);
}}
QWidget#sectionSubNav QPushButton:checked {{
    background: {selection};
    border-color: {accent};
}}
QFrame#dashboardNewsWidget {{
    min-width: 520px;
    min-height: 440px;
    background: rgba(18, 19, 20, 0.88);
    border: 1px solid rgba(90, 98, 106, 0.55);
    border-radius: 16px;
}}
QFrame#dashboardNewsWidget:hover {{ border-color: {accent}; }}
QLabel#dashboardNewsTitle {{ color: #EAF2F6; font-weight: 700; }}
QTextEdit#dashboardNewsText {{ color: rgba(234, 242, 246, 0.9); }}

/* Content panels (Select Save, Accessories tabs, etc.): dark translucent so text is readable */
QStackedWidget#sectionStack > QWidget {{
    background-color: rgba(28, 30, 34, 0.92);
    border-radius: 8px;
}}
QTreeView {{
    background-color: rgba(28, 30, 34, 0.92);
    color: #EAF2F6;
    border: 1px solid rgba(90, 98, 106, 0.45);
}}
QListWidget {{
    background-color: rgba(28, 30, 34, 0.92);
    color: #EAF2F6;
}}
QDialog {{
    background-color: rgba(28, 30, 34, 0.92);
}}
QScrollArea {{
    background-color: rgba(28, 30, 34, 0.92);
}}
QScrollArea::viewport {{
    background-color: rgba(28, 30, 34, 0.92);
}}
"""

def main():
    for name, (accent, selection, badge_text) in THEMES.items():
        content = TEMPLATE.format(name=name, accent=accent, selection=selection, badge_text=badge_text)
        out = BASE / f"stylesheet_{name}.qss"
        out.write_text(content, encoding="utf-8")
        print(f"Wrote {out.name}")
    print("Done.")

if __name__ == "__main__":
    main()
