#!/usr/bin/env python3
"""
Read a BL4 save YAML, decode all Base85 item serials using the app's decoder,
resolve weapon names using the app's weapon_name CSV, and write godrolls.json.

Usage (from project root):
  python scripts/yaml_to_godrolls.py [path_to.yaml]
  Default YAML path: c:\\Users\\picas\\Desktop\\22.yaml
"""

import json
import re
import sys
from pathlib import Path

# Project root = parent of scripts/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import decoder_logic
import resource_loader
import pandas as pd


def _parse_component_string(component_str: str) -> list:
    """Same regex as weapon editor: extract part tokens into list of dicts."""
    components = []
    for m in re.finditer(r'\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|\"c\",\s*(\d+)', component_str):
        if m.group(3):
            components.append({'type': 'skin', 'id': int(m.group(3))})
            continue
        outer_id, inner = int(m.group(1)), m.group(2)
        if inner:
            if '[' in inner:
                components.append({'type': 'group', 'id': outer_id, 'sub_ids': [int(s) for s in inner.strip('[]').split()]})
            else:
                if outer_id == 1:
                    components.append({'type': 'elemental', 'id': outer_id, 'sub_id': int(inner)})
                else:
                    components.append({'type': 'part', 'mfg_id': outer_id, 'id': int(inner)})
        else:
            components.append({'type': 'simple', 'id': outer_id})
    return components


def get_weapon_name_from_decoded(decoded_str: str, all_weapon_parts_df: pd.DataFrame, weapon_name_df: pd.DataFrame) -> str:
    """
    Return the weapon name (e.g. Oscar Mike, Fisheye) for a decoded weapon serial,
    or "Unknown" if not a weapon / can't resolve.
    """
    if not decoded_str or "||" not in decoded_str:
        return "Unknown"
    try:
        header_part, component_part = decoded_str.split("||", 1)
        sections = header_part.strip().split("|")
        id_section = sections[0].strip().split(",")
        if len(id_section) < 4:
            return "Unknown"
        m_id = int(id_section[0].strip())
    except (ValueError, IndexError):
        return "Unknown"

    parts = _parse_component_string(component_part)
    for p in parts:
        if not isinstance(p, dict) or p.get("type") != "simple":
            continue
        part_id = p.get("id")
        if part_id is None:
            continue
        part_details = all_weapon_parts_df[
            (all_weapon_parts_df["Manufacturer & Weapon Type ID"] == m_id) &
            (all_weapon_parts_df["Part ID"] == part_id)
        ]
        if part_details.empty:
            continue
        if part_details.iloc[0]["Part Type"] != "Barrel":
            continue
        name_info = weapon_name_df[
            (weapon_name_df["Manufacturer & Weapon Type ID"] == m_id) &
            (weapon_name_df["Part ID"] == part_id)
        ]
        if not name_info.empty:
            return name_info.iloc[0]["Name"].strip()
    return "Unknown"


def collect_serials_from_yaml(data: dict) -> list:
    """Recursively find all 'serial' values in nested dict (e.g. state.inventory.items.backpack)."""
    serials = []
    if isinstance(data, dict):
        for k, v in data.items():
            if k == "serial" and isinstance(v, str) and v.strip().startswith("@"):
                serials.append(v.strip())
            else:
                serials.extend(collect_serials_from_yaml(v))
    elif isinstance(data, list):
        for item in data:
            serials.extend(collect_serials_from_yaml(item))
    return serials


def main():
    yaml_path = sys.argv[1] if len(sys.argv) > 1 else Path(r"c:\Users\picas\Desktop\22.yaml")
    yaml_path = Path(yaml_path)
    if not yaml_path.exists():
        print(f"YAML file not found: {yaml_path}")
        sys.exit(1)

    try:
        import yaml
    except ImportError:
        print("Install PyYAML: pip install pyyaml")
        sys.exit(1)

    # Use same loader as app so custom tags (!tags, etc.) don't break
    class AnyTagLoader(yaml.SafeLoader):
        pass
    def _ignore_any(loader, tag_suffix: str, node):
        if isinstance(node, yaml.ScalarNode):
            return loader.construct_scalar(node)
        if isinstance(node, yaml.SequenceNode):
            return loader.construct_sequence(node)
        if isinstance(node, yaml.MappingNode):
            return loader.construct_mapping(node)
        return None
    AnyTagLoader.add_multi_constructor("", _ignore_any)

    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.load(f, Loader=AnyTagLoader)
    serials = collect_serials_from_yaml(data)
    print(f"Found {len(serials)} serial(s) in YAML.")

    # Load weapon CSVs (same as weapon editor)
    weapon_name_df = None
    all_weapon_parts_df = None
    try:
        for name in ("weapon_name_EN.csv", "weapon_name.csv"):
            p = resource_loader.get_resource_path(Path("weapon_edit") / name)
            if p and Path(p).exists():
                weapon_name_df = pd.read_csv(p)
                break
        for name in ("all_weapon_part_EN.csv", "all_weapon_part.csv"):
            p = resource_loader.get_resource_path(Path("weapon_edit") / name)
            if p and Path(p).exists():
                all_weapon_parts_df = pd.read_csv(p)
                break
    except Exception as e:
        print(f"Warning: could not load weapon CSVs: {e}")

    results = []
    for serial in serials:
        decoded_str, _, err = decoder_logic.decode_serial_to_string(serial)
        if err or not decoded_str:
            results.append({"name": "Decode error", "decoded": ""})
            continue
        name = "Unknown"
        if all_weapon_parts_df is not None and weapon_name_df is not None:
            name = get_weapon_name_from_decoded(decoded_str, all_weapon_parts_df, weapon_name_df)
        results.append({"name": name, "decoded": decoded_str})

    out_path = PROJECT_ROOT / "godrolls.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(results)} entries to {out_path}.")


if __name__ == "__main__":
    main()
