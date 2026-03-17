"""
Scrape weapon skin images from Game8's Borderlands 4 List of All Weapon Skins
(https://game8.co/games/Borderlands-4/archives/551131) and save to
master_search/skin_images/ using the exact token filenames the skin preview expects.

Filenames must match weapon_skins.json "value" (e.g. Cosmetics_Weapon_Mat01_Synthwave.png)
so the app finds them at master_search/skin_images/{token}.png.

Uses Game8 CDN /original URLs for source quality.

Usage (from repo root):
  python scripts/scrape_game8_weapon_skins.py
"""

import html as html_module
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

GAME8_URL = "https://game8.co/games/Borderlands-4/archives/551131"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0"
REQUEST_DELAY_S = 0.4


def normalize_name(s: str) -> str:
    s = html_module.unescape(s).strip().lower()
    return s.rstrip("!?").strip()


def load_weapon_skins(repo_root: Path) -> list:
    path = repo_root / "master_search" / "db" / "weapon_skins.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_display_name_to_token(weapon_skins: list) -> dict:
    """Map display name (label part before ' - ') -> token (value)."""
    out = {}
    for entry in weapon_skins:
        label = entry.get("label", "")
        value = entry.get("value", "")
        if " - " in label:
            display = label.split(" - ", 1)[0].strip()
            out[normalize_name(display)] = value
    # Game8 may use "Phosphene (Shiny)" as category; we have many Phosphene - X, skip that row for 1:1
    return out


def fetch_page() -> str:
    req = urllib.request.Request(GAME8_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_row_pairs(section_html: str) -> list[tuple[str, str]]:
    """
    Parse table rows: each row has data-image-url='.../original' and <img ... alt='Skin Name'>.
    Return list of (image_url, skin_name) in table order. Uses /original for source quality.
    """
    pairs = []
    # alt can contain apostrophe (e.g. Fran's Frogurt); end at single-quote followed by space and data-src
    pattern = r"data-image-url=['\"](https://img\.game8\.co/[^'\"]+?/original)['\"][^>]*>.*?<img[^>]*alt='(.+?)'\s+data-src"
    for m in re.finditer(pattern, section_html, re.DOTALL):
        url, name = m.group(1), m.group(2).strip()
        if name:
            pairs.append((url, html_module.unescape(name)))
    return pairs


def download_image(url: str, dest_path: Path) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"  Failed: {e}", file=sys.stderr)
        return False


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    skin_images_dir = repo_root / "master_search" / "skin_images"
    skin_images_dir.mkdir(parents=True, exist_ok=True)

    weapon_skins = load_weapon_skins(repo_root)
    name_to_token = build_display_name_to_token(weapon_skins)

    print("Fetching Game8 page...")
    page_html = fetch_page()
    # Table with images appears after "How to Get" in HTML; parse full page for data-image-url + alt pairs
    pairs = parse_row_pairs(page_html)
    print(f"Found {len(pairs)} skin rows (image + name) in table.")

    saved = 0
    skipped = 0
    for i, (url, name) in enumerate(pairs):
        token = name_to_token.get(normalize_name(name))
        if not token:
            if "Phosphene" in name and "Shiny" in name:
                skipped += 1
                continue
            print(f"No token for: {name!r}")
            skipped += 1
            continue
        dest = skin_images_dir / f"{token}.png"
        print(f"  [{i+1}] {name} -> {token}.png")
        if download_image(url, dest):
            saved += 1
        time.sleep(REQUEST_DELAY_S)

    print(f"Done. Saved {saved} to {skin_images_dir}. Skipped {skipped}.")


if __name__ == "__main__":
    main()
