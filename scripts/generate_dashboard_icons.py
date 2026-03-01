"""
Generate neon-style dashboard icons and save to assets/icons/.
Run from project root: python scripts/generate_dashboard_icons.py
Uses PyQt6 to draw simple outline icons so the app uses matching theme icons.
"""
import math
import sys
from pathlib import Path

# Run from project root
ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "assets" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

try:
    from PyQt6.QtGui import QPainter, QColor, QPen, QImage, QFont
    from PyQt6.QtCore import Qt, QRect, QPoint, QPointF
    from PyQt6.QtWidgets import QApplication
except ImportError:
    print("PyQt6 required. Run: pip install PyQt6")
    sys.exit(1)

SIZE = 128
NEON = QColor(0, 255, 255)  # cyan
NEON_PEN = QPen(NEON, 6)
NEON_PEN.setCapStyle(Qt.PenCapStyle.RoundCap)
NEON_PEN.setJoinStyle(Qt.PenJoinStyle.RoundJoin)


def save_icon(name: str, draw_fn):
    img = QImage(SIZE, SIZE, QImage.Format.Format_ARGB32)
    img.fill(0)
    qp = QPainter(img)
    qp.setRenderHint(QPainter.RenderHint.Antialiasing)
    qp.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    qp.setPen(NEON_PEN)
    qp.setBrush(Qt.BrushStyle.NoBrush)
    draw_fn(qp)
    qp.end()
    out = ICONS_DIR / f"{name}.png"
    img.save(str(out))
    print(f"Saved {out}")


def draw_character(qp):
    # Simple person outline: head circle, body, legs
    r = SIZE // 2 - 12
    cx, cy = SIZE // 2, SIZE // 2 - 8
    qp.drawEllipse(cx - 14, cy - 28, 28, 28)  # head
    qp.drawLine(cx, cy, cx, cy + 28)  # body
    qp.drawLine(cx, cy + 28, cx - 14, cy + 48)
    qp.drawLine(cx, cy + 28, cx + 14, cy + 48)
    qp.drawLine(cx - 12, cy + 12, cx - 28, cy + 8)
    qp.drawLine(cx + 12, cy + 12, cx + 28, cy + 8)


def draw_inventory(qp):
    # Backpack / bag outline
    qp.drawRoundedRect(24, 28, 80, 72, 8, 8)
    qp.drawLine(44, 28, 52, 18)
    qp.drawLine(84, 28, 76, 18)
    qp.drawArc(52, 18, 24, 24, 0, 180 * 16)


def draw_weapon_toolbox(qp):
    # Wrench + gun silhouette
    qp.drawRoundedRect(38, 52, 52, 24, 4, 4)  # body
    qp.drawRect(78, 56, 18, 16)  # barrel
    qp.drawLine(56, 76, 56, 92)
    qp.drawLine(72, 76, 72, 92)
    # Wrench head
    qp.drawArc(20, 28, 36, 36, 0, 180 * 16)
    qp.drawLine(38, 46, 24, 88)
    qp.drawLine(38, 46, 52, 88)


def draw_accessories(qp):
    # Shield / badge with star
    pts = [QPointF(64, 22), QPointF(98, 38), QPointF(98, 72), QPointF(64, 88), QPointF(30, 72), QPointF(30, 38)]
    for i in range(6):
        qp.drawLine(int(pts[i].x()), int(pts[i].y()), int(pts[(i + 1) % 6].x()), int(pts[(i + 1) % 6].y()))
    # Star inside
    cx, cy = 64, 55
    for i in range(5):
        ang = i * 72 - 90
        x = cx + 20 * math.cos(ang * math.pi / 180)
        y = cy + 20 * math.sin(ang * math.pi / 180)
        x2 = cx + 8 * math.cos((ang + 36) * math.pi / 180)
        y2 = cy + 8 * math.sin((ang + 36) * math.pi / 180)
        qp.drawLine(int(cx), int(cy), int(x), int(y))
        qp.drawLine(int(x), int(y), int(x2), int(y2))
        qp.drawLine(int(x2), int(y2), int(cx), int(cy))


def draw_master_search(qp):
    # Magnifying glass
    qp.drawEllipse(28, 28, 48, 48)
    qp.drawLine(68, 68, 92, 92)


def draw_home(qp):
    # House outline
    qp.drawLine(64, 28, 28, 58)
    qp.drawLine(64, 28, 100, 58)
    qp.drawLine(28, 58, 28, 88)
    qp.drawLine(28, 88, 100, 88)
    qp.drawLine(100, 88, 100, 58)
    qp.drawRect(48, 68, 32, 20)


def main():
    app = QApplication(sys.argv) if QApplication.instance() is None else QApplication.instance()
    save_icon("character", draw_character)
    save_icon("inventory", draw_inventory)
    save_icon("weapon_toolbox", draw_weapon_toolbox)
    save_icon("accessories", draw_accessories)
    save_icon("master_search", draw_master_search)
    save_icon("home", draw_home)
    print("Done. Restart the app to see new icons.")


if __name__ == "__main__":
    main()
