
import csv
import io
import json
import os
import re
import time
import hashlib
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import requests

DEFAULT_SOURCES = [
    # Borderlands 4 Deserialization (community-maintained)
    ("deserilization", "https://docs.google.com/spreadsheets/d/17LHzPR7BltqgzbJZplr-APhORgT2PTIsV08n4RD3tMw/export?format=csv&gid=1385091622"),
    # Borderlands 4 Item Parts Master List (community-maintained)
    ("parts_master",   "https://docs.google.com/spreadsheets/d/11TmXyGmIVoDFn4IFNJN1s2HuijSnn_nPZqN3LkDd5TA/export?format=csv&gid=1385091622"),
]

USER_AGENT = "NeonVaultV2.69 Community DB Updater (+manual/weekly check)"

@dataclass
class UpdateResult:
    updated: bool
    message: str
    sources: List[str]
    rows_before: int
    rows_after: int
    added_rows: int
    removed_rows: int
    changed_rows: int
    output_path: str
    columns: List[str]

def _safe_str(x) -> str:
    return (x or "").strip()


CSV_SCHEMAS = [
    # Weapons (parts builder)
    {
        "name": "weapon_parts",
        "relpath": os.path.join("weapon_edit", "all_weapon_part.csv"),
        "required": ["Manufacturer & Weapon Type ID","Manufacturer","Weapon Type","Part ID","Part Type","String","Stat"],
        "order": ["Manufacturer & Weapon Type ID","Manufacturer","Weapon Type","Part ID","Part Type","String","Stat"],
        "filter_nonempty": ["Part ID","String"]
    },
    # Weapons (English) if sheet provides same columns (often it does)
    {
        "name": "weapon_parts_en",
        "relpath": os.path.join("weapon_edit", "all_weapon_part_EN.csv"),
        "required": ["Manufacturer & Weapon Type ID","Manufacturer","Weapon Type","Part ID","Part Type","String","Stat"],
        "order": ["Manufacturer & Weapon Type ID","Manufacturer","Weapon Type","Part ID","Part Type","String","Stat"],
        "filter_nonempty": ["Part ID","String"]
    },
    # Grenades
    {
        "name": "grenade_main_perk",
        "relpath": os.path.join("grenade","grenade_main_perk.csv"),
        "required": ["Grenade_perk_main_ID","Part_ID","Part_type","Stat"],
        "order": ["Grenade_perk_main_ID","Part_ID","Part_type","Stat"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    {
        "name": "grenade_mrp",
        "relpath": os.path.join("grenade","manufacturer_rarity_perk.csv"),
        "required": ["Manufacturer ID","Part_ID","Part_type","Stat"],
        "order": ["Manufacturer ID","Part_ID","Part_type","Stat","Description"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    # Shields
    {
        "name": "shield_main_perk",
        "relpath": os.path.join("shield","shield_main_perk.csv"),
        "required": ["Shield_perk_main_ID","Part_ID","Part_type","Stat"],
        "order": ["Shield_perk_main_ID","Part_ID","Part_type","Stat"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    {
        "name": "shield_manufacturer_perk",
        "relpath": os.path.join("shield","manufacturer_perk.csv"),
        "required": ["Manufacturer ID","Part_ID","Part_type","Stat"],
        "order": ["Manufacturer ID","Part_ID","Part_type","Stat","Description"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    # Repkits
    {
        "name": "repkit_main_perk",
        "relpath": os.path.join("repkit","repkit_main_perk.csv"),
        "required": ["Repkit_perk_main_ID","Part_ID","Part_type","Stat"],
        "order": ["Repkit_perk_main_ID","Part_ID","Part_type","Stat"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    {
        "name": "repkit_manufacturer_perk",
        "relpath": os.path.join("repkit","repkit_manufacturer_perk.csv"),
        "required": ["Manufacturer ID","Part_ID","Part_type","Stat"],
        "order": ["Manufacturer ID","Part_ID","Part_type","Stat","Description"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    # Heavy weapons
    {
        "name": "heavy_main_perk",
        "relpath": os.path.join("heavy","heavy_main_perk.csv"),
        "required": ["Heavy_perk_main_ID","Part_ID","Part_type","Stat"],
        "order": ["Heavy_perk_main_ID","Part_ID","Part_type","Stat"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
    {
        "name": "heavy_manufacturer_perk",
        "relpath": os.path.join("heavy","heavy_manufacturer_perk.csv"),
        "required": ["Manufacturer ID","Part_ID","Part_type","Stat"],
        "order": ["Manufacturer ID","Part_ID","Part_type","Stat","Description"],
        "filter_nonempty": ["Part_ID","Stat"]
    },
]

def _write_csv(path: str, columns: List[str], rows: List[Dict[str, str]]) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        count = 0
        for r in rows:
            w.writerow({c: r.get(c, "") for c in columns})
            count += 1
    return count

def export_internal_csvs(project_root: str, cols: List[str], rows: List[Dict[str, str]]) -> Dict[str, int]:
    """
    Attempts to regenerate the internal CSVs used by the UI builder tabs (Weapon Edit, Grenade, Shield, Heavy, Repkit)
    from the community sheet data.

    This is schema-driven: if the community DB provides the exact columns required for a given internal CSV,
    we export it; otherwise we skip it safely.
    """
    available = set(cols)
    results: Dict[str, int] = {}

    for schema in CSV_SCHEMAS:
        req = set(schema["required"])
        if not req.issubset(available):
            continue

        # Filter rows with meaningful values
        filtered = []
        for r in rows:
            ok = True
            for k in schema.get("filter_nonempty", []):
                if not _safe_str(r.get(k, "")):
                    ok = False
                    break
            if ok:
                filtered.append(r)

        out_path = os.path.join(project_root, schema["relpath"])
        count = _write_csv(out_path, schema["order"], filtered)
        results[schema["name"]] = count

    return results

def _hash_rows(rows: List[Dict[str, str]], key_fields: List[str]) -> Dict[str, str]:
    """
    Returns mapping key -> hash(row)
    """
    out = {}
    for r in rows:
        key = " | ".join(_safe_str(r.get(k, "")) for k in key_fields).strip()
        if not key:
            # fall back to entire row hash
            key = hashlib.sha1(json.dumps(r, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        out[key] = hashlib.sha1(json.dumps(r, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    return out

def _looks_like_html(text: str) -> bool:
    t = (text or "").lstrip().lower()
    return t.startswith("<!doctype html") or t.startswith("<html") or "serviceLogin".lower() in t or "<head" in t[:500]

def _count_csv_rows(text: str) -> Tuple[int, int, List[str]]:
    # returns (data_rows, num_cols, header)
    try:
        buf = io.StringIO(text)
        reader = csv.reader(buf)
        rows = list(reader)
        if not rows:
            return 0, 0, []
        header = [h.strip() for h in rows[0]]
        data_rows = max(0, len(rows) - 1)
        num_cols = len(header)
        return data_rows, num_cols, header
    except Exception:
        return 0, 0, []

_GID_CACHE: Dict[str, List[int]] = {}

def _google_sheet_export_candidates(url: str, gids: Optional[List[int]] = None) -> List[str]:
    """Return candidate CSV export URLs for a Google Sheet.
    If gids is None, uses gid in URL (if any) + a small default range.
    """
    m = re.search(r"docs\.google\.com/spreadsheets/d/([^/]+)/", url)
    if not m:
        return [url]
    sheet_id = m.group(1)

    gid_list: List[int] = []
    if gids:
        gid_list.extend([int(g) for g in gids if str(g).isdigit()])
    gid_match = re.search(r"[?&#]gid=(\d+)", url)
    if gid_match:
        gid_list.append(int(gid_match.group(1)))

    # Always try first sheet
    gid_list.append(0)

    # Probe range: try 0..80 so we can find the tab with the full item list (~5500 rows)
    for g in range(0, 81):
        gid_list.append(g)

    # De-dupe while preserving order
    seen=set()
    gids_final=[]
    for g in gid_list:
        if g not in seen:
            seen.add(g)
            gids_final.append(g)

    urls=[]
    for g in gids_final:
        # Two common CSV endpoints; some sheets behave better with gviz
        urls.append(f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={g}")
        urls.append(f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={g}")
    return urls

def _discover_gids(sheet_id: str, headers: Dict[str, str], timeout: int = 20) -> List[int]:
    """Fetch the sheet HTML and extract all gid values (tab ids)."""
    if sheet_id in _GID_CACHE:
        return _GID_CACHE[sheet_id]

    gid_set=set()

    # Try a couple of views; one might be accessible when another isn't.
    view_urls = [
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit",
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/htmlview",
    ]

    for u in view_urls:
        try:
            r = requests.get(u, headers=headers, timeout=timeout, allow_redirects=True)
            r.raise_for_status()
            html = r.text
            # Pull gids from both URL fragments and embedded JSON
            for m in re.finditer(r"gid=(\d+)", html):
                gid_set.add(int(m.group(1)))
            for m in re.finditer(r"\"gid\":(\d+)", html):
                gid_set.add(int(m.group(1)))
        except Exception:
            continue

    # Ensure gid=0 is included as a fallback
    gid_list = sorted(gid_set) if gid_set else [0]
    _GID_CACHE[sheet_id] = gid_list
    return gid_list


def _download_csv(url: str, timeout: int = 30) -> str:
    headers = {"User-Agent": USER_AGENT}
    m = re.search(r"docs\.google\.com/spreadsheets/d/([^/]+)/", url)
    sheet_id = m.group(1) if m else None

    def try_candidates(candidates: List[str]) -> Tuple[Optional[str], Tuple[int,int]]:
        best_text = None
        best_score = (-1, -1)  # (data_rows, num_cols)

        for u in candidates:
            try:
                r = requests.get(u, headers=headers, timeout=timeout, allow_redirects=True)
                r.raise_for_status()
                text = r.text
                if _looks_like_html(text):
                    continue
                data_rows, num_cols, header = _count_csv_rows(text)
                if num_cols < 2 or all(not h for h in header):
                    continue
                # Prefer sheets that look like item DBs: need at least 2 non-empty column names
                nonempty_headers = sum(1 for h in header if (h or "").strip())
                if nonempty_headers < 2:
                    continue
                score = (data_rows, num_cols)
                if score > best_score:
                    best_score = score
                    best_text = text
                # Only stop early when we have a clearly full-sized sheet (target ~5500 rows)
                if data_rows >= 5000:
                    break
            except Exception:
                continue
        return best_text, best_score

    # Pass 1: quick probe (gid in URL + 0..20)
    candidates = _google_sheet_export_candidates(url)
    best_text, best_score = try_candidates(candidates)

    # Pass 2: if we don't have a full-sized sheet yet, discover real gids by parsing the sheet HTML
    if (best_text is None or best_score[0] < 5000) and sheet_id:
        discovered = _discover_gids(sheet_id, headers=headers, timeout=min(20, timeout))
        # Put discovered first (likely big), then the default probe range
        candidates2 = _google_sheet_export_candidates(url, gids=discovered)
        best_text2, best_score2 = try_candidates(candidates2)
        if best_text2 is not None and best_score2 > best_score:
            best_text, best_score = best_text2, best_score2

    if best_text is not None:
        return best_text

    # last resort: original URL (might be non-google CSV)
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.text
def _parse_csv(text: str) -> Tuple[List[str], List[Dict[str, str]]]:
    buf = io.StringIO(text)
    reader = csv.reader(buf)
    rows = list(reader)
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    data: List[Dict[str, str]] = []
    for r in rows[1:]:
        if not any(cell.strip() for cell in r):
            continue
        # pad to header
        if len(r) < len(header):
            r = r + [""] * (len(header) - len(r))
        rec = {header[i]: r[i].strip() for i in range(len(header))}
        data.append(rec)
    return header, data

def _merge_sources(source_tables: List[Tuple[str, List[str], List[Dict[str, str]]]]) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Merges multiple sources into a single table.

    Strategy:
      - Union of columns (preserving first-seen ordering)
      - Concatenate rows, tagging a "source" column
      - **Only** dedupe when a true unique key exists:
          1) code
          2) token
          3) Part_ID + Part_type
        Otherwise: NO DEDUPE (keep all rows).
    """
    cols: List[str] = []
    seen_cols = set()
    merged: List[Dict[str, str]] = []

    def add_col(c: str):
        if c not in seen_cols:
            seen_cols.add(c)
            cols.append(c)

    # Build union columns
    for src_name, header, _rows in source_tables:
        add_col("source")
        for c in header:
            if c:
                add_col(c)

    # Collect rows
    for src_name, _header, rows in source_tables:
        for r in rows:
            out = {c: "" for c in cols}
            out["source"] = src_name
            for k, v in r.items():
                if k in out:
                    out[k] = v
            merged.append(out)

    # Choose a real unique key (never fall back to "name")
    def _pick_existing(cands: List[str]) -> Optional[str]:
        for c in cands:
            if c in cols:
                return c
        return None

    code_col = _pick_existing(["code", "Code", "CODE"])
    token_col = _pick_existing(["token", "Token", "TOKEN"])

    part_id_col = _pick_existing(["Part_ID", "part_id", "Part ID", "PartId", "PartID"])
    part_type_col = _pick_existing(["Part_type", "part_type", "Part Type", "PartType", "PartTYPE"])

    dedupe_mode = None
    if code_col:
        dedupe_mode = ("single", code_col)
    elif token_col:
        dedupe_mode = ("single", token_col)
    elif part_id_col and part_type_col:
        dedupe_mode = ("pair", (part_id_col, part_type_col))

    if not dedupe_mode:
        # No known unique key => keep all rows, no collapsing.
        return cols, merged

    # Dedupe using chosen key; keep rows with missing key values as-is.
    best: Dict[str, Dict[str, str]] = {}
    passthrough: List[Dict[str, str]] = []

    def _score(row: Dict[str, str]) -> int:
        return sum(1 for v in row.values() if _safe_str(v))

    for r in merged:
        if dedupe_mode[0] == "single":
            kcol = dedupe_mode[1]
            kval = _safe_str(r.get(kcol, ""))
            if not kval:
                passthrough.append(r)
                continue
            k = f"{kcol}:{kval}".lower()
        else:
            c1, c2 = dedupe_mode[1]
            v1 = _safe_str(r.get(c1, ""))
            v2 = _safe_str(r.get(c2, ""))
            if not v1 or not v2:
                passthrough.append(r)
                continue
            k = f"{c1}:{v1}|{c2}:{v2}".lower()

        if k not in best or _score(r) > _score(best[k]):
            best[k] = r

    # Preserve passthrough rows + best rows (stable-ish order: passthrough first, then best)
    return cols, passthrough + list(best.values())

def update_community_db(
    project_root: str,
    sources: Optional[List[Tuple[str, str]]] = None,
    out_relpath: str = os.path.join("master_search", "db", "community_parts_db.json"),
) -> UpdateResult:
    """
    Downloads community-maintained Google Sheets (CSV export), merges them,
    and writes a single JSON DB file used by Scarlett + NeonVault master search.

    Returns an UpdateResult with diff counts.
    """
    if sources is None:
        sources = DEFAULT_SOURCES

    out_path = os.path.join(project_root, out_relpath)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    old_rows: List[Dict[str, str]] = []
    old_cols: List[str] = []
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            old_cols = payload.get("columns", [])
            old_rows = payload.get("rows", [])
        except Exception:
            old_rows = []
            old_cols = []

    source_tables = []
    fetched_sources = []
    for name, url in sources:
        fetched_sources.append(url)
        csv_text = _download_csv(url)
        header, rows = _parse_csv(csv_text)
        source_tables.append((name, header, rows))
        time.sleep(0.6)  # polite

    cols, merged_rows = _merge_sources(source_tables)

    # Diff
    before = len(old_rows)
    after = len(merged_rows)

    # Keys for diff (prefer true unique keys; never fall back to "name")
    key_fields: List[str] = []
    if "code" in cols: key_fields = ["code"]
    elif "Code" in cols: key_fields = ["Code"]
    elif "token" in cols: key_fields = ["token"]
    elif "Token" in cols: key_fields = ["Token"]
    elif ("Part_ID" in cols or "Part ID" in cols) and ("Part_type" in cols or "Part Type" in cols):
        pid = "Part_ID" if "Part_ID" in cols else "Part ID"
        ptype = "Part_type" if "Part_type" in cols else "Part Type"
        key_fields = [pid, ptype]
    else:
        # No reliable unique key => diff by full row hash
        key_fields = []

    old_map = _hash_rows(old_rows, key_fields)
    new_map = _hash_rows(merged_rows, key_fields)

    added = sum(1 for k in new_map.keys() if k not in old_map)
    removed = sum(1 for k in old_map.keys() if k not in new_map)
    changed = sum(1 for k in new_map.keys() if k in old_map and new_map[k] != old_map[k])

    # Try to regenerate internal CSVs used by item editors / parts builder tabs.
    csv_exports = export_internal_csvs(project_root, cols, merged_rows)

    payload = {
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": [{"name": n, "url": u} for n, u in sources],
        "columns": cols,
        "rows": merged_rows,
        "key_fields": key_fields,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    updated = (added + removed + changed) > 0 or before == 0
    msg = f"Community DB updated. Rows: {before} → {after}. Added {added}, removed {removed}, changed {changed}."
    if csv_exports:
        parts = [f"{k}={v}" for k,v in sorted(csv_exports.items())]
        msg += "\nCSV exports refreshed: " + ", ".join(parts)
    else:
        msg += "\nCSV exports refreshed: (no matching schemas found in sheet columns)"

    return UpdateResult(
        updated=updated,
        message=msg,
        sources=fetched_sources,
        rows_before=before,
        rows_after=after,
        added_rows=added,
        removed_rows=removed,
        changed_rows=changed,
        output_path=out_path,
        columns=cols,
    )
