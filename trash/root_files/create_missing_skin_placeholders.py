"""
Create placeholder PNG images for weapon skins that don't have images yet.
Saves to web/public/skin_images/ with filename {token}.png so SkinPreview can show them.

Usage (from repo root): python scripts/create_missing_skin_placeholders.py
"""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Install Pillow: pip install Pillow")
    raise SystemExit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
SKIN_IMAGES_DIR = REPO_ROOT / "web" / "public" / "skin_images"

# token -> short label for the placeholder image
MISSING_SKINS = [
    ("Cosmetics_Weapon_Mat46_MechYeah", "Mech Yeah"),
    ("Cosmetics_Weapon_Mat47_Assault", "Assault"),
    ("Cosmetics_Weapon_Mat48_Boltron", "Boltron"),
    ("Cosmetics_Weapon_Mat49_Furboy", "Furboy"),
    ("Cosmetics_Weapon_Mat50_SpicyIguana", "Spicy Iguana"),
]


def create_placeholder(token: str, label: str, size: tuple = (256, 256)) -> bool:
    """Create a simple placeholder image with label text."""
    img = Image.new("RGB", size, color=(48, 52, 64))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except OSError:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
        except OSError:
            font = ImageFont.load_default()
    text = label[:20] if len(label) > 20 else label
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
    except AttributeError:
        tw, th = draw.textsize(text, font=font)
        bbox = (0, 0, tw, th)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size[0] - tw) // 2
    y = (size[1] - th) // 2
    draw.rectangle([x - 4, y - 2, x + tw + 4, y + th + 2], fill=(60, 64, 80))
    draw.text((x, y), text, fill=(200, 210, 230), font=font)
    dest = SKIN_IMAGES_DIR / f"{token}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    return True


def main() -> None:
    SKIN_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    for token, label in MISSING_SKINS:
        dest = SKIN_IMAGES_DIR / f"{token}.png"
        if dest.exists():
            print(f"  Skip (exists): {token}.png")
            continue
        if create_placeholder(token, label):
            print(f"  Created: {token}.png")
    print("Done.")


if __name__ == "__main__":
    main()
