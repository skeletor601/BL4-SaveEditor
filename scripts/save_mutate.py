#!/usr/bin/env python3
"""
Reads JSON from stdin: {"yaml_content": "...", "action": "sync_levels"|"add_item"|"apply_preset"|"update_item", "params": {...}}
Outputs JSON to stdout: {"success": true, "yaml_content": "..."} or {"success": false, "error": "..."}
For sync_levels also returns success_count, fail_count, info (list of failure messages).
Uses save_ops and progression from repo root.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    import yaml
    from yaml.nodes import MappingNode, SequenceNode, ScalarNode
    import save_ops as bl4f
    import progression
except ImportError as e:
    sys.stderr.write(f"Import error: {e}\n")
    sys.exit(1)


class IgnoreUnknownTagLoader(yaml.SafeLoader):
    """
    YAML loader that ignores unknown tags like !tags and just constructs
    normal Python objects from the underlying node.
    """


def _ignore_unknown_tag(loader: IgnoreUnknownTagLoader, tag_suffix: str, node):
    if isinstance(node, MappingNode):
        return loader.construct_mapping(node)
    if isinstance(node, SequenceNode):
        return loader.construct_sequence(node)
    if isinstance(node, ScalarNode):
        return loader.construct_scalar(node)
    # Fallback to the base implementation
    return loader.construct_object(node)


# Register a catch‑all multi-constructor for any tag prefix ("!something")
IgnoreUnknownTagLoader.add_multi_constructor("", _ignore_unknown_tag)


def apply_preset(data: dict, preset_name: str, params: dict):
    """Apply unlock preset to data (same dispatch as save_game_controller.apply_unlock_preset)."""
    params = params or {}
    try:
        if preset_name == "clear_map_fog":
            progression.clear_map_fog(data)
        elif preset_name == "discover_all_locations":
            progression.discover_all_locations(data)
        elif preset_name == "complete_all_safehouse_missions":
            progression.complete_all_safehouse_missions(data)
        elif preset_name == "complete_all_collectibles":
            progression.complete_all_collectibles(data)
        elif preset_name == "complete_all_challenges":
            progression.complete_all_challenges(data)
        elif preset_name == "complete_all_achievements":
            progression.complete_all_achievements(data)
        elif preset_name == "complete_all_story_missions":
            progression.complete_all_story_missions(data)
        elif preset_name == "complete_all_missions":
            progression.complete_all_missions(data)
        elif preset_name == "set_character_class":
            class_key = params.get("class_key")
            if not class_key:
                return False, "set_character_class requires params.class_key"
            progression.set_character_class(data, class_key)
        elif preset_name == "set_character_to_max_level":
            progression.set_character_to_max_level(data)
        elif preset_name == "set_max_sdu":
            progression.set_max_sdu(data)
        elif preset_name == "unlock_vault_powers":
            progression.unlock_vault_powers(data)
        elif preset_name == "unlock_all_hover_drives":
            progression.unlock_all_hover_drives(data)
        elif preset_name == "unlock_all_specialization":
            progression.unlock_all_specialization(data)
        elif preset_name == "unlock_postgame":
            progression.unlock_postgame(data)
        elif preset_name == "unlock_max_everything":
            progression.max_ammo(data)
            progression.max_currency(data)
            progression.clear_map_fog(data)
            progression.discover_all_locations(data)
            progression.complete_all_collectibles(data)
            progression.complete_all_achievements(data)
            progression.complete_all_missions(data)
            progression.set_max_sdu(data)
            progression.unlock_vault_powers(data)
            progression.unlock_postgame(data)
            progression.unlock_all_hover_drives(data)
            progression.unlock_all_specialization(data)
            progression.complete_all_challenges(data)
            progression.set_character_to_max_level(data)
        else:
            return False, f"Unknown preset: {preset_name}"
        return True, None
    except Exception as e:
        return False, f"Preset '{preset_name}' failed: {e}"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
        sys.exit(0)

    yaml_content = payload.get("yaml_content")
    action = payload.get("action")
    params = payload.get("params") or {}

    if not isinstance(yaml_content, str) or not yaml_content.strip():
        print(json.dumps({"success": False, "error": "yaml_content is required"}))
        sys.exit(0)
    if action not in ("sync_levels", "set_backpack_level", "add_item", "apply_preset", "update_item", "remove_item", "clear_backpack"):
        print(json.dumps({"success": False, "error": "action must be sync_levels, set_backpack_level, add_item, apply_preset, update_item, remove_item, or clear_backpack"}))
        sys.exit(0)

    try:
        data = yaml.load(yaml_content, Loader=IgnoreUnknownTagLoader)
    except yaml.YAMLError as e:
        print(json.dumps({"success": False, "error": f"Invalid YAML: {e}"}))
        sys.exit(0)

    if not isinstance(data, dict):
        print(json.dumps({"success": False, "error": "YAML root must be an object"}))
        sys.exit(0)

    if action == "sync_levels":
        success_count, fail_count, info = bl4f.sync_inventory_item_levels(data)
        out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print(json.dumps({
            "success": True,
            "yaml_content": out_yaml,
            "success_count": success_count,
            "fail_count": fail_count,
            "info": info,
        }))
        sys.exit(0)

    if action == "set_backpack_level":
        level = params.get("level")
        if level is None:
            print(json.dumps({"success": False, "error": "params.level (0-99) is required"}))
            sys.exit(0)
        try:
            target = int(level)
        except (TypeError, ValueError):
            print(json.dumps({"success": False, "error": "params.level must be a number 0-99"}))
            sys.exit(0)
        if target < 0 or target > 99:
            print(json.dumps({"success": False, "error": "params.level must be between 0 and 99"}))
            sys.exit(0)
        success_count, fail_count, info = bl4f.set_backpack_item_levels(data, target)
        out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print(json.dumps({
            "success": True,
            "yaml_content": out_yaml,
            "success_count": success_count,
            "fail_count": fail_count,
            "info": info,
        }))
        sys.exit(0)

    if action == "add_item":
        serial = params.get("serial") or ""
        flag = params.get("flag") or "0"
        if not serial.strip().startswith("@U"):
            print(json.dumps({"success": False, "error": "serial must be a valid item serial (starts with @U)"}))
            sys.exit(0)
        path = bl4f.add_item_to_backpack(data, serial.strip(), str(flag))
        if path is None:
            try:
                hint = bl4f.get_save_structure_hint(data)
            except Exception as e:
                hint = f"hint_error={type(e).__name__}: {e}"
            err_msg = f"Failed to add item (backpack not found or invalid). Save structure: {hint}"
            sys.stderr.write(err_msg + "\n")
            sys.stderr.flush()
            print(json.dumps({"success": False, "error": err_msg}), flush=True)
            sys.exit(0)
        out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print(json.dumps({"success": True, "yaml_content": out_yaml}))
        sys.exit(0)

    if action == "update_item":
        item_path = params.get("item_path")
        new_item_data = params.get("new_item_data") or {}
        if not isinstance(item_path, list) or len(item_path) == 0:
            print(json.dumps({"success": False, "error": "params.item_path (list of keys) is required"}))
            sys.exit(0)
        new_serial = new_item_data.get("serial")
        if not new_serial or not isinstance(new_serial, str) or not new_serial.strip().startswith("@U"):
            print(json.dumps({"success": False, "error": "params.new_item_data.serial (valid @U... serial) is required"}))
            sys.exit(0)
        try:
            node = data
            for key in item_path[:-1]:
                if isinstance(node, list) and isinstance(key, str) and key.isdigit():
                    node = node[int(key)]
                else:
                    node = node[key]
            last_key = item_path[-1]
            if isinstance(node, list) and isinstance(last_key, str) and last_key.isdigit():
                item_node = node[int(last_key)]
            else:
                item_node = node[last_key]
            if not isinstance(item_node, dict):
                print(json.dumps({"success": False, "error": "item_path does not point to an object"}))
                sys.exit(0)
            item_node["serial"] = new_serial.strip()
            # Also update state_flags if provided
            if "state_flags" in new_item_data:
                try:
                    item_node["state_flags"] = int(new_item_data["state_flags"])
                except (TypeError, ValueError):
                    pass
            out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
            print(json.dumps({"success": True, "yaml_content": out_yaml}))
        except (KeyError, IndexError, TypeError) as e:
            print(json.dumps({"success": False, "error": f"Invalid item_path or structure: {e}"}))
        sys.exit(0)

    if action == "remove_item":
        original_path = params.get("original_path") or params.get("item_path")
        if not isinstance(original_path, list) or len(original_path) == 0:
            print(json.dumps({"success": False, "error": "params.original_path (list of keys) is required"}))
            sys.exit(0)
        # Convert numeric strings to int for list indices (JSON has no int type)
        path = []
        for step in original_path:
            if isinstance(step, str) and step.isdigit():
                path.append(int(step))
            else:
                path.append(step)
        if bl4f.remove_item_by_original_path(data, path):
            out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
            print(json.dumps({"success": True, "yaml_content": out_yaml}))
        else:
            print(json.dumps({"success": False, "error": "Item not found or could not remove"}))
        sys.exit(0)

    if action == "clear_backpack":
        if bl4f.clear_backpack(data):
            out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
            print(json.dumps({"success": True, "yaml_content": out_yaml}))
        else:
            print(json.dumps({"success": False, "error": "Backpack and equipped not found or could not clear"}))
        sys.exit(0)

    if action == "apply_preset":
        preset_name = params.get("preset_name") or ""
        if not preset_name:
            print(json.dumps({"success": False, "error": "params.preset_name is required"}))
            sys.exit(0)
        ok, err = apply_preset(data, preset_name, params)
        if ok:
            out_yaml = yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
            print(json.dumps({"success": True, "yaml_content": out_yaml}))
        else:
            print(json.dumps({"success": False, "error": err or f"Unknown or failed preset: {preset_name}"}))
        sys.exit(0)

    print(json.dumps({"success": False, "error": "Unknown action"}))
    sys.exit(0)


if __name__ == "__main__":
    main()
