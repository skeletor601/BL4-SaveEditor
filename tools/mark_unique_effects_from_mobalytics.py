import csv
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CSV = ROOT / "master_search" / "db" / "sources" / "parts_database_canon_v2_split_columns.csv"
FETCHED_TXT = ROOT / "agent-tools" / "69972735-cbb7-4c51-b38a-4ab1efd9ed9f.txt"
ALT_AGENT_TOOLS = Path.home() / ".cursor" / "projects" / "c-BL4-BL4-AIO-Web" / "agent-tools"
FORCED_UNIQUE_NAMES = {"mantra"}
# Strict shortlist: gun legendaries with visibly unique firing/projectile behavior.
# Keep this intentionally tight to avoid false positives.
VISUAL_SHOOTING_GUN_NAMES = {
    "acey may",
    "aegon's dream",
    "bubbles",
    "convergence",
    "complex root",
    "kaleidosplode",
    "lead balloon",
    "mantra",
    "missilaser",
    "ohm i got",
    "onslaught",
    "plasma coil",
    "rainbow vomit",
    "rooker",
    "star helix",
    "sweet embrace",
    "t.k's wave",
    "truck",
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower()).strip()


def _load_legendary_names() -> set[str]:
    if FETCHED_TXT.exists():
        text = FETCHED_TXT.read_text(encoding="utf-8", errors="replace")
    elif ALT_AGENT_TOOLS.exists():
        txts = sorted(ALT_AGENT_TOOLS.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not txts:
            raise RuntimeError(f"No fetched web text files found in {ALT_AGENT_TOOLS}")
        text = txts[0].read_text(encoding="utf-8", errors="replace")
    else:
        with urllib.request.urlopen(
            "https://mobalytics.gg/borderlands-4/guides/legendary-weapons-and-gear",
            timeout=30,
        ) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    # Pull item links from mobalytics guide; filter obvious non-item links.
    pairs = re.findall(r"\[([^\]]+)\]\(https://mobalytics\.gg/borderlands-4/guides/([^)]+)\)", text)
    names: set[str] = set()
    for name, slug in pairs:
        slug_l = slug.lower()
        if any(
            bad in slug_l
            for bad in (
                "boss-guide",
                "secret-bosses",
                "legendary-weapons-and-gear",
                "pearlescent-weapons-and-gear",
            )
        ):
            continue
        n = name.strip()
        if n:
            names.add(n)
    return {_norm(n) for n in names if _norm(n)}


def _matches_name(blob_norm: str, names_norm: set[str]) -> bool:
    for n in names_norm:
        if len(n) <= 3:
            if blob_norm == n:
                return True
        elif n in blob_norm:
            return True
    return False


def main() -> None:
    names_norm = _load_legendary_names()
    names_norm |= {_norm(n) for n in FORCED_UNIQUE_NAMES}
    visual_names_norm = {_norm(n) for n in VISUAL_SHOOTING_GUN_NAMES}
    if not names_norm:
        raise RuntimeError("No names parsed from fetched mobalytics data.")

    with SOURCE_CSV.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    if "Unique Effect" not in fieldnames:
        fieldnames.append("Unique Effect")
    if "Visual Unique Barrel" not in fieldnames:
        fieldnames.append("Visual Unique Barrel")

    changed = 0
    for row in rows:
        rarity = (
            (row.get("Canonical Rarity") or "")
            or (row.get("canonicalRarity") or "")
            or (row.get("Rarity") or "")
        ).strip().lower()
        name_blob = " ".join(
            [
                (row.get("Matched Legendary Name") or "").strip(),
                (row.get("Canonical Name") or "").strip(),
                (row.get("Name") or "").strip(),
                (row.get("String") or "").strip(),
                (row.get("Model Name") or "").strip(),
            ]
        )
        is_unique = rarity == "legendary" and _matches_name(_norm(name_blob), names_norm)
        is_barrel = ((row.get("Part Type") or "").strip().lower() == "barrel")
        is_weapon = (
            ((row.get("General Category") or "").strip().lower() == "weapon part")
            or ((row.get("Category") or "").strip().lower() == "weapon part")
        )
        is_visual_unique_barrel = (
            rarity == "legendary"
            and is_barrel
            and is_weapon
            and _matches_name(_norm(name_blob), visual_names_norm)
        )
        next_val = "True" if is_unique else "False"
        if (row.get("Unique Effect") or "").strip() != next_val:
            changed += 1
        row["Unique Effect"] = next_val
        row["Visual Unique Barrel"] = "True" if is_visual_unique_barrel else "False"

    with SOURCE_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Updated {SOURCE_CSV} with Unique Effect column. Rows changed: {changed}")


if __name__ == "__main__":
    main()

