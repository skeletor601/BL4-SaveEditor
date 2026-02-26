"""
Extract part data from master_search/db/Borderlands Item Editor and Save Editor.html
(embedded gzip+base64 game data), convert to universal rows, and merge into
master_search/db/universal_parts_db.json.

Run from project root: python -m tools.merge_item_editor_html_into_db
"""

import base64
import json
import re
import zlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


def _safe(s: Any) -> str:
    return (s or "").strip()


def extract_embedded_base64(html_path: Path) -> str:
    text = html_path.read_text(encoding="utf-8", errors="replace")
    # Match: const EMBEDDED_GAME_DATA_BASE64 = "....";
    m = re.search(r'EMBEDDED_GAME_DATA_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"', text)
    if not m:
        return ""
    return m.group(1)


def decompress_game_data(b64_str: str) -> Dict[str, Any]:
    raw = base64.b64decode(b64_str)
    # Gzip format
    decompressed = zlib.decompress(raw, 16 + zlib.MAX_WBITS)
    return json.loads(decompressed.decode("utf-8", errors="replace"))


def resolve_path(path_str: str, data: Dict[str, Any]) -> Any:
    """Resolve path like 'characters.Amon.class_mods.Body.parts[0]' into data."""
    if not path_str or not data:
        return None
    parts = re.split(r"\.|\[|\]", path_str)
    current = data
    for p in parts:
        if not p:
            continue
        if p.isdigit():
            idx = int(p)
            if isinstance(current, list) and 0 <= idx < len(current):
                current = current[idx]
            else:
                return None
        else:
            current = current.get(p) if isinstance(current, dict) else None
        if current is None:
            return None
    return current


def collect_parts_from_game_data(game_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Walk gameData and id_index to collect all part-like objects; return list of {typeId, partId, string, name, ...}."""
    out: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    # 1) Use id_index if present: keys are "typeId:partId", values are paths
    id_index = game_data.get("id_index") or game_data.get("id_index")
    if isinstance(id_index, dict):
        for key, path_str in id_index.items():
            if not isinstance(path_str, str) or ":" not in key:
                continue
            parts_key = key.strip()
            if parts_key in seen:
                continue
            obj = resolve_path(path_str, game_data)
            if obj is None:
                continue
            if not isinstance(obj, dict):
                continue
            type_id, _, part_id = key.partition(":")
            try:
                tid = int(type_id.strip())
                pid = part_id.strip()
            except ValueError:
                continue
            part_row = dict(obj)
            part_row["_typeId"] = tid
            part_row["_partId"] = pid
            part_row["_fullId"] = f"{tid}:{pid}"
            seen.add(parts_key)
            out.append(part_row)

    # 2) Recursively walk for arrays of parts (parts[], .parts)
    def walk(obj: Any, depth: int) -> None:
        if depth > 30:
            return
        if isinstance(obj, dict):
            # Check if this looks like a part object
            if "id" in obj or "string" in obj or "spawn_code" in obj:
                tid = obj.get("type_id") or obj.get("typeId")
                pid = obj.get("id") or obj.get("part_id")
                if pid is not None:
                    pid = str(pid).strip()
                    if ":" in pid:
                        tid_str, _, pid = pid.partition(":")
                        try:
                            tid = int(tid_str)
                        except ValueError:
                            tid = None
                    else:
                        try:
                            tid = int(tid) if tid is not None else None
                        except (TypeError, ValueError):
                            tid = None
                    if tid is not None and pid:
                        full_id = f"{tid}:{pid}"
                        if full_id not in seen:
                            seen.add(full_id)
                            row = dict(obj)
                            row["_typeId"] = tid
                            row["_partId"] = pid
                            row["_fullId"] = full_id
                            out.append(row)
            for v in obj.values():
                walk(v, depth + 1)
        elif isinstance(obj, list):
            for v in obj:
                walk(v, depth + 1)

    walk(game_data, 0)
    return out


def part_obj_to_universal_row(p: Dict[str, Any]) -> Dict[str, str]:
    """Convert a raw part object from game data to universal DB row."""
    tid = p.get("_typeId")
    pid = p.get("_partId", "")
    code = f"{{{tid}:{pid}}}" if tid is not None and pid else f"{{{pid}}}" if pid else ""
    name = _safe(p.get("name") or p.get("model_name") or p.get("modelName") or p.get("title"))
    string = _safe(p.get("string") or p.get("spawn_code") or p.get("spawnCode"))
    desc = _safe(p.get("description") or p.get("stat") or p.get("stats") or p.get("effect") or p.get("effects"))
    part_type = _safe(p.get("part_type") or p.get("partType") or p.get("type"))
    return {
        "source": "Item-Editor.html",
        "code": code,
        "Manufacturer": _safe(p.get("manufacturer") or p.get("Manufacturer")),
        "Weapon Type": _safe(p.get("weapon_type") or p.get("weaponType") or p.get("item_type") or p.get("itemType")),
        "ID": pid,
        "Part Type": part_type,
        "String": string,
        "Model Name": name,
        "Stats (Level 50, Common)": desc,
        "Effects": _safe(p.get("effects") or p.get("Effects")) or desc,
        "Requirements": "",
        "Stats": desc,
    }


def merge_into_db(project_root: str) -> Tuple[int, int, int]:
    """
    Load Item Editor HTML, extract embedded game data, collect parts, merge into universal_parts_db.json.
    Returns (updated_count, added_count, total_db_rows).
    """
    root = Path(project_root)
    html_path = root / "master_search" / "db" / "Borderlands Item Editor and Save Editor.html"
    db_path = root / "master_search" / "db" / "universal_parts_db.json"

    if not html_path.exists():
        raise FileNotFoundError(f"HTML not found: {html_path}")

    b64 = extract_embedded_base64(html_path)
    if not b64:
        raise ValueError("Could not extract EMBEDDED_GAME_DATA_BASE64 from HTML")

    game_data = decompress_game_data(b64)
    raw_parts = collect_parts_from_game_data(game_data)
    html_rows = [part_obj_to_universal_row(p) for p in raw_parts]
    code_to_html: Dict[str, Dict[str, str]] = {}
    for r in html_rows:
        c = _safe(r.get("code", ""))
        if c:
            code_to_html[c] = r
    string_id_to_html: Dict[str, Dict[str, str]] = {}
    for r in html_rows:
        s = _safe(r.get("String", "")) or _safe(r.get("Model Name", ""))
        i = _safe(r.get("ID", ""))
        if s and i:
            string_id_to_html[f"{s.lower()}|{i}"] = r

    if not db_path.exists():
        cols = list(html_rows[0].keys()) if html_rows else []
        payload = {"generated_at_utc": "", "sources": [], "columns": cols, "rows": html_rows}
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0, len(html_rows), len(html_rows)

    payload = json.loads(db_path.read_text(encoding="utf-8"))
    rows: List[Dict[str, str]] = payload.get("rows", [])
    columns = payload.get("columns", [])

    updated = 0
    added = 0
    seen_codes: Set[str] = set()
    for r in rows:
        code = _safe(r.get("code", ""))
        if not code and r.get("ID"):
            code = "{" + _safe(r["ID"]) + "}"
        if code:
            seen_codes.add(code)
        html_row = code_to_html.get(code)
        if not html_row:
            s, i = _safe(r.get("String", "")), _safe(r.get("ID", ""))
            if s and i:
                html_row = string_id_to_html.get(f"{s.lower()}|{i}")
        if html_row:
            row_updated = False
            if not _safe(r.get("Model Name")) and _safe(html_row.get("Model Name")):
                r["Model Name"] = html_row["Model Name"]
                row_updated = True
            if not _safe(r.get("Stats (Level 50, Common)")) and _safe(html_row.get("Stats (Level 50, Common)")):
                r["Stats (Level 50, Common)"] = html_row["Stats (Level 50, Common)"]
                row_updated = True
            if not _safe(r.get("Effects")) and _safe(html_row.get("Effects")):
                r["Effects"] = html_row["Effects"]
                row_updated = True
            if not _safe(r.get("String")) and _safe(html_row.get("String")):
                r["String"] = html_row["String"]
                row_updated = True
            if not _safe(r.get("Part Type")) and _safe(html_row.get("Part Type")):
                r["Part Type"] = html_row["Part Type"]
                row_updated = True
            if row_updated:
                updated += 1

    all_cols = list(columns) if columns else []
    if rows and "code" not in all_cols:
        all_cols = ["source", "code", "Manufacturer", "Weapon Type", "ID", "Part Type", "String", "Model Name", "Stats (Level 50, Common)", "Effects", "Requirements", "Stats"]
    for r in html_rows:
        code = _safe(r.get("code", ""))
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)
        for col in all_cols:
            if col not in r:
                r[col] = ""
        rows.append(r)
        added += 1

    payload["rows"] = rows
    payload["columns"] = all_cols if all_cols else (list(rows[0].keys()) if rows else [])
    db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return updated, added, len(rows)


def main() -> None:
    project_root = str(Path(__file__).resolve().parent.parent)
    updated, added, total = merge_into_db(project_root)
    print(f"Item Editor HTML merge: {updated} rows updated, {added} new rows added. Total in DB: {total}")


if __name__ == "__main__":
    main()
