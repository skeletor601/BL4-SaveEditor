# Item Edit tab: Grenade, Shield, Repkit, Heavy — parts library + current parts list (like Weapon Edit)
from __future__ import annotations

import re
import pandas as pd
from functools import partial
from pathlib import Path

from PyQt6 import QtWidgets, QtCore, QtGui

import b_encoder
import resource_loader
import bl4_functions as bl4f
from qt_autogrow_textedit import AutoGrowPlainTextEdit

# Type keys and display; type_en values used in process_and_load_items
ITEM_TYPES = [
    ("grenade", "Grenade", "Grenade"),
    ("shield", "Shield", "Shield"),
    ("repkit", "Repkit", "Repkit"),
    ("heavy", "Heavy", "Heavy Weapon"),
]
# Main perk type ID per item type (from CSVs: Grenade_perk_main_ID etc.)
MAIN_TYPE_IDS = {"grenade": 245, "shield": 246, "repkit": 243, "heavy": 244}


def load_item_data_for_type(type_key: str, lang: str = "en-US"):
    """Load main + mfg CSVs for the given item type. Returns (df_main, df_mfg, all_parts_df) or (None, None, None)."""
    suffix = "_EN" if lang in ["en-US", "ru", "ua"] else ""
    try:
        if type_key == "grenade":
            main_path = resource_loader.get_grenade_data_path(f"grenade_main_perk{suffix}.csv")
            mfg_path = resource_loader.get_grenade_data_path(f"manufacturer_rarity_perk{suffix}.csv")
            main_id_col = "Grenade_perk_main_ID"
        elif type_key == "shield":
            main_path = resource_loader.get_shield_data_path(f"shield_main_perk{suffix}.csv")
            mfg_path = resource_loader.get_shield_data_path(f"manufacturer_perk{suffix}.csv")
            main_id_col = "Shield_perk_main_ID"
        elif type_key == "repkit":
            main_path = resource_loader.get_repkit_data_path(f"repkit_main_perk{suffix}.csv")
            mfg_path = resource_loader.get_repkit_data_path(f"repkit_manufacturer_perk{suffix}.csv")
            main_id_col = "Repkit_perk_main_ID"
        elif type_key == "heavy":
            main_path = resource_loader.get_heavy_data_path(f"heavy_main_perk{suffix}.csv")
            mfg_path = resource_loader.get_heavy_data_path(f"heavy_manufacturer_perk{suffix}.csv")
            main_id_col = "Heavy_perk_main_ID"
        else:
            return None, None, None

        if not main_path or not main_path.exists() or not mfg_path or not mfg_path.exists():
            return None, None, None

        df_main = pd.read_csv(main_path)
        df_mfg = pd.read_csv(mfg_path)
        if "Manufacturer ID" in df_mfg.columns:
            df_mfg["Manufacturer ID"] = pd.to_numeric(df_mfg["Manufacturer ID"], errors="coerce")
            df_mfg = df_mfg.dropna(subset=["Manufacturer ID"])
            df_mfg["Manufacturer ID"] = df_mfg["Manufacturer ID"].astype(int)

        # Build unified lookup: type_id, part_id, part_type, stat [, string]
        parts_rows = []
        if main_id_col in df_main.columns:
            for _, r in df_main.iterrows():
                tid = int(r[main_id_col])
                pid = int(r["Part_ID"])
                pt = r.get("Part_type", "Perk")
                stat = r.get("Stat", "")
                s = r.get("String", "") if "String" in r else (r.get("Description", "") if pd.notna(r.get("Description")) else "")
                parts_rows.append({"type_id": tid, "part_id": pid, "part_type": pt, "stat": stat, "string": s})
        if "Manufacturer ID" in df_mfg.columns:
            for _, r in df_mfg.iterrows():
                tid = int(r["Manufacturer ID"])
                pid = int(r["Part_ID"])
                pt = r.get("Part_type", "Perk")
                stat = r.get("Stat", "")
                s = r.get("String", "") if "String" in r else (r.get("Description", "") if pd.notna(r.get("Description")) else "")
                parts_rows.append({"type_id": tid, "part_id": pid, "part_type": pt, "stat": stat, "string": s})

        all_parts_df = pd.DataFrame(parts_rows) if parts_rows else pd.DataFrame(columns=["type_id", "part_id", "part_type", "stat", "string"])
        return df_main, df_mfg, all_parts_df
    except Exception as e:
        print(f"Item edit load_item_data_for_type({type_key}): {e}")
        return None, None, None


def _load_weapon_skins2():
    """Shared helper: load weapon skin list for previews.
    Order:
      1) master_search/db/weapon_skins.json
      2) Borderlands Item Editor HTML (dev)
      3) Legacy SKINS2 from scarlett.html
    Returns list[(label, token)].
    """
    import json as _json
    import re as _re
    # 1) Static JSON
    try:
        data = resource_loader.load_json_resource("master_search/db/weapon_skins.json")
        if isinstance(data, list) and data:
            skins = []
            for it in data:
                val = (it.get("value") or "").strip()
                lab = (it.get("label") or val).strip()
                if val:
                    skins.append((lab, val))
            if skins:
                return skins
    except Exception:
        pass

    # 2) SKINS2 from scarlett.html (fallback)
    try:
        scarlett_path = resource_loader.get_resource_path("master_search/scarlett.html")
        if not scarlett_path or not scarlett_path.exists():
            return []
        html = scarlett_path.read_text(encoding="utf-8", errors="ignore")
        m = _re.search(r"const\s+SKINS2\s*=\s*(\[.*?\])\s*;", html, _re.S)
        if not m:
            return []
        arr = _json.loads(m.group(1))
        skins = []
        for it in arr:
            val = (it.get("value") or "").strip()
            lab = (it.get("label") or val).strip()
            if val:
                skins.append((lab, val))
        return skins
    except Exception:
        return []


class ItemEditTab(QtWidgets.QWidget):
    add_to_backpack_requested = QtCore.pyqtSignal(str, str)
    update_item_requested = QtCore.pyqtSignal(dict)

    def __init__(self, main_app=None):
        super().__init__()
        self.main_app = main_app
        self.current_type_key = "grenade"
        self.df_main = None
        self.df_mfg = None
        self.all_parts_df = None
        self.parts_data = []  # list of dicts: type_id, part_id, raw, (mfg_id if from other mfg)
        self.selected_item_path = None
        self.is_handling_change = False
        self.current_lang = "en-US"
        self._load_ui_localization()

        # Outer layout + scroll area so the entire tab scrolls like Weapon Edit
        self.main_layout = QtWidgets.QVBoxLayout(self)
        self.main_layout.setContentsMargins(8, 8, 8, 8)

        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        self.main_layout.addWidget(scroll)

        container = QtWidgets.QWidget()
        scroll.setWidget(container)
        content_layout = QtWidgets.QVBoxLayout(container)
        content_layout.setContentsMargins(0, 0, 0, 0)

        # Type selector
        type_row = QtWidgets.QHBoxLayout()
        type_row.addWidget(QtWidgets.QLabel("Item type:"))
        self.type_combo = QtWidgets.QComboBox()
        for key, label, _ in ITEM_TYPES:
            self.type_combo.addItem(label, key)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        type_row.addWidget(self.type_combo)
        type_row.addStretch(1)
        content_layout.addLayout(type_row)

        # Load from backpack
        bp_group = QtWidgets.QGroupBox("Load from backpack")
        bp_layout = QtWidgets.QVBoxLayout(bp_group)
        self.backpack_scroll = QtWidgets.QScrollArea()
        self.backpack_scroll.setWidgetResizable(True)
        self.backpack_widget = QtWidgets.QWidget()
        self.backpack_items_layout = QtWidgets.QVBoxLayout(self.backpack_widget)
        self.backpack_items_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignTop)
        self.backpack_scroll.setWidget(self.backpack_widget)
        bp_layout.addWidget(self.backpack_scroll)
        content_layout.addWidget(bp_group)

        # Serial B85 + Decoded
        serial_group = QtWidgets.QGroupBox("Serial")
        serial_layout = QtWidgets.QGridLayout(serial_group)
        serial_layout.addWidget(QtWidgets.QLabel("Base85:"), 0, 0)
        self.serial_b85_entry = AutoGrowPlainTextEdit(min_lines=5, max_lines=18)
        self.serial_b85_entry.setPlaceholderText("Paste or load from backpack")
        serial_layout.addWidget(self.serial_b85_entry, 0, 1)
        serial_layout.addWidget(QtWidgets.QLabel("Decoded:"), 1, 0)
        self.serial_decoded_entry = AutoGrowPlainTextEdit(min_lines=8, max_lines=28)
        self.serial_decoded_entry.setPlaceholderText("Decoded serial (prefix|| part tokens |)")
        serial_layout.addWidget(self.serial_decoded_entry, 1, 1)
        content_layout.addWidget(serial_group)

        # Skin preview (shared weapon-skin list, applies a cosmetic block into decoded serial)
        self.skins2 = _load_weapon_skins2()

        skin_box = QtWidgets.QGroupBox("Skin")
        skin_box.setStyleSheet("QGroupBox{font-weight:600;}")
        skin_layout = QtWidgets.QVBoxLayout(skin_box)
        top_row = QtWidgets.QHBoxLayout()

        self.skin_combo = QtWidgets.QComboBox()
        self.skin_combo.setMinimumWidth(260)
        self.skin_combo.addItem("(None)", None)
        for label, token in self.skins2:
            self.skin_combo.addItem(label, token)

        self.apply_skin_btn = QtWidgets.QPushButton("Add to item")

        top_row.addWidget(QtWidgets.QLabel("Skin:"))
        top_row.addWidget(self.skin_combo, 1)
        skin_layout.addLayout(top_row)

        # Preview frame
        self.skin_preview_frame = QtWidgets.QFrame()
        self.skin_preview_frame.setVisible(False)
        prev_l = QtWidgets.QHBoxLayout(self.skin_preview_frame)
        prev_l.setContentsMargins(0, 0, 0, 0)

        self.skin_preview_label = QtWidgets.QLabel()
        self._skin_prev_w = 240
        self._skin_prev_h = 120
        self.skin_preview_label.setFixedSize(self._skin_prev_w, self._skin_prev_h)
        self.skin_preview_label.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        self.skin_preview_label.setStyleSheet(
            "QLabel{border:1px solid rgba(0,255,255,110); border-radius:10px; background: rgba(10,10,16,120);}"
            "QLabel:hover{border:1px solid rgba(255,0,200,180);}"
        )

        meta_col = QtWidgets.QVBoxLayout()
        self.skin_preview_name = QtWidgets.QLabel("")
        self.skin_preview_name.setStyleSheet("font-weight:600;")
        self.skin_preview_token = QtWidgets.QLabel("")
        self.skin_preview_token.setStyleSheet("color: rgba(180,180,200,200);")
        meta_col.addWidget(self.skin_preview_name)
        meta_col.addWidget(self.skin_preview_token)
        meta_col.addWidget(self.apply_skin_btn)
        meta_col.addStretch(1)

        prev_l.addWidget(self.skin_preview_label)
        prev_l.addLayout(meta_col, 1)
        skin_layout.addWidget(self.skin_preview_frame)

        # Wire skin actions
        self.skin_combo.currentIndexChanged.connect(self._update_skin_preview)
        self.apply_skin_btn.clicked.connect(lambda: self._append_skin_to_decoded(self.skin_combo.currentData()) if self.skin_combo.currentData() else None)
        self.skin_preview_label.setCursor(QtGui.QCursor(QtCore.Qt.CursorShape.PointingHandCursor))
        self.skin_preview_label.mousePressEvent = lambda e: self._open_skin_lightbox()

        content_layout.addWidget(skin_box)

        # Buttons: Refresh backpack, Update item, Add to backpack
        btn_row = QtWidgets.QHBoxLayout()
        self.refresh_backpack_btn = QtWidgets.QPushButton("Refresh backpack")
        self.update_item_btn = QtWidgets.QPushButton("Update item")
        self.update_item_btn.setEnabled(False)
        self.add_to_backpack_btn = QtWidgets.QPushButton("Add to backpack")
        self.flag_combo = QtWidgets.QComboBox()
        self.flag_combo.addItems(["1", "3", "5"])
        btn_row.addWidget(self.refresh_backpack_btn)
        btn_row.addWidget(self.update_item_btn)
        btn_row.addWidget(self.add_to_backpack_btn)
        btn_row.addWidget(QtWidgets.QLabel("Flag:"))
        btn_row.addWidget(self.flag_combo)
        btn_row.addStretch(1)
        content_layout.addLayout(btn_row)

        # Parts section
        parts_group = QtWidgets.QGroupBox("Parts")
        parts_layout = QtWidgets.QVBoxLayout(parts_group)
        parts_header = QtWidgets.QHBoxLayout()
        self.refresh_parts_btn = QtWidgets.QPushButton("Refresh")
        self.add_part_btn = QtWidgets.QPushButton("Browse Parts")
        self.add_part_btn.setMinimumWidth(120)
        parts_header.addWidget(self.refresh_parts_btn)
        parts_header.addWidget(self.add_part_btn)
        parts_header.addStretch(1)
        parts_layout.addLayout(parts_header)

        # Parts list container – no inner scroll; height grows with content,
        # outer scroll area handles scrolling (like Weapon Editor tab).
        self.parts_list_widget = QtWidgets.QWidget()
        self.parts_list_layout = QtWidgets.QVBoxLayout(self.parts_list_widget)
        self.parts_list_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignTop)
        parts_layout.addWidget(self.parts_list_widget)
        content_layout.addWidget(parts_group)

        self.serial_b85_entry.textChanged.connect(self._on_b85_changed)
        self.serial_decoded_entry.textChanged.connect(self._on_decoded_changed)
        self.refresh_backpack_btn.clicked.connect(self.refresh_backpack_items)
        self.update_item_btn.clicked.connect(self._update_item)
        self.add_to_backpack_btn.clicked.connect(self._add_to_backpack)
        self.refresh_parts_btn.clicked.connect(self._force_refresh_parts)
        self.add_part_btn.clicked.connect(self._open_add_part_window)

        self._on_type_changed()
        self.refresh_backpack_items()
        self._display_parts_placeholder()

    def _load_ui_localization(self):
        loc_file = resource_loader.get_ui_localization_file(self.current_lang)
        full = resource_loader.load_json_resource(loc_file) or {}
        self.ui_loc = full.get("item_edit_tab", full.get("weapon_editor_tab", {}))

    def _get_loc(self, key: str, default: str = "") -> str:
        for section in ("labels", "buttons", "dialogs", "misc"):
            v = (self.ui_loc.get(section) or {}).get(key)
            if v:
                return v
        return self.ui_loc.get(key, default) or default

    def _on_type_changed(self):
        idx = self.type_combo.currentIndex()
        if idx < 0:
            return
        self.current_type_key = self.type_combo.itemData(idx)
        self.df_main, self.df_mfg, self.all_parts_df = load_item_data_for_type(self.current_type_key, self.current_lang)
        self.parts_data = []
        self.selected_item_path = None
        self.refresh_backpack_items()
        self._display_parts_placeholder()

    def _on_b85_changed(self):
        if self.is_handling_change:
            return
        text = self.serial_b85_entry.toPlainText().strip()
        if not text:
            self.serial_decoded_entry.clear()
            self._display_parts_placeholder()
            return
        self.is_handling_change = True
        decoded_str, _, err = bl4f.decode_serial_to_string(text)
        if not err and decoded_str:
            self.serial_decoded_entry.blockSignals(True)
            self.serial_decoded_entry.setPlainText(decoded_str)
            self.serial_decoded_entry.blockSignals(False)
            self._parse_and_display_parts(decoded_str)
            self.update_item_btn.setEnabled(True)
        else:
            self.serial_decoded_entry.clear()
        self.is_handling_change = False

    def _on_decoded_changed(self):
        if self.is_handling_change:
            return
        text = self.serial_decoded_entry.toPlainText()
        if not text.strip():
            self._display_parts_placeholder()
            return
        self.is_handling_change = True
        encoded, err = b_encoder.encode_to_base85(text)
        if not err:
            self.serial_b85_entry.blockSignals(True)
            self.serial_b85_entry.setPlainText(encoded)
            self.serial_b85_entry.blockSignals(False)
            self.update_item_btn.setEnabled(True)
        self._parse_and_display_parts(text)
        self.is_handling_change = False

    def _parse_component_string(self, component_str: str) -> list:
        """Same regex as weapon tab: {id}, {mfg:id}, {mfg:[ids]}."""
        result = []
        for match in re.finditer(r"\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}", component_str):
            raw = match.group(0)
            outer_id = int(match.group(1))
            inner = match.group(2)
            if inner:
                if "[" in inner:
                    sub_ids = [int(s) for s in inner.strip("[]").split()]
                    result.append({"type": "group", "type_id": outer_id, "sub_ids": sub_ids, "raw": raw})
                else:
                    result.append({"type": "part", "type_id": outer_id, "part_id": int(inner), "raw": raw})
            else:
                result.append({"type": "simple", "type_id": outer_id, "part_id": outer_id, "raw": raw})
        return result

    def _header_mfg_id(self, decoded_str: str) -> int | None:
        """Extract the first number from the decoded header (e.g. 270 in '270, 0, 1, 50|...') for simple-token lookup."""
        if "||" not in decoded_str:
            return None
        header = decoded_str.split("||", 1)[0].strip()
        try:
            first_part = header.split("|")[0].strip().split(",")[0].strip()
            return int(first_part)
        except (ValueError, IndexError):
            return None

    def _parse_and_display_parts(self, decoded_str: str):
        if "||" not in decoded_str:
            self._display_parts_placeholder()
            return
        header_part, parts_part = decoded_str.split("||", 1)
        header_mfg = self._header_mfg_id(decoded_str)
        parsed = self._parse_component_string(parts_part)
        self.parts_data = []
        for p in parsed:
            if p.get("type") == "group":
                for sid in p.get("sub_ids", []):
                    self.parts_data.append({"type_id": p["type_id"], "part_id": sid, "raw": f"{{{p['type_id']}:{sid}}}"})
            elif p.get("type") == "part":
                self.parts_data.append({"type_id": p["type_id"], "part_id": p.get("part_id"), "raw": p["raw"]})
            elif p.get("type") == "simple":
                # Simple token {X} means "current item's type/mfg part X" — use header's first number as type_id for lookup
                part_id = p.get("part_id")
                type_id = header_mfg if header_mfg is not None else part_id
                self.parts_data.append({"type_id": type_id, "part_id": part_id, "raw": p["raw"]})
        self._display_parts()

    def _display_parts_placeholder(self):
        while self.parts_list_layout.count():
            item = self.parts_list_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        self.parts_list_layout.addWidget(
            QtWidgets.QLabel(self._get_loc("parse_serial_to_show_parts", "Parse serial or load from backpack to show parts"))
        )

    def _display_parts(self):
        while self.parts_list_layout.count():
            item = self.parts_list_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        if not self.parts_data:
            self.parts_list_layout.addWidget(QtWidgets.QLabel(self._get_loc("parts_not_found", "No parts")))
            return
        if self.all_parts_df is None or self.all_parts_df.empty:
            for i, p in enumerate(self.parts_data):
                row = QtWidgets.QLabel(f"  {p.get('raw', '')}  ")
                self.parts_list_layout.addWidget(row)
            return
        for i, part_info in enumerate(self.parts_data):
            frame = self._create_part_row(part_info, i)
            if frame:
                self.parts_list_layout.addWidget(frame)

    def _create_part_row(self, part_info: dict, index: int) -> QtWidgets.QFrame | None:
        type_id = part_info.get("type_id")
        part_id = part_info.get("part_id")
        raw = part_info.get("raw", "")
        info = {"part_type": "Unknown", "string": raw, "stat": ""}
        if self.all_parts_df is not None and not self.all_parts_df.empty:
            m = (self.all_parts_df["type_id"] == type_id) & (self.all_parts_df["part_id"] == part_id)
            d = self.all_parts_df[m]
            if not d.empty:
                r = d.iloc[0]
                info["part_type"] = r.get("part_type", "Unknown")
                info["string"] = r.get("string") or r.get("stat", raw)
                info["stat"] = r.get("stat", "")
        frame = QtWidgets.QFrame()
        layout = QtWidgets.QGridLayout(frame)
        layout.setColumnStretch(2, 1)
        id_lbl = QtWidgets.QLabel(f"  {part_id}  ")
        id_lbl.setStyleSheet("background-color: #4a4a4a; border-radius: 5px; padding: 2px;")
        layout.addWidget(id_lbl, 0, 0)
        layout.addWidget(QtWidgets.QLabel(info["part_type"]), 0, 1)
        layout.addWidget(QtWidgets.QLabel(info["string"]), 0, 2)
        layout.addWidget(QtWidgets.QLabel(str(info["stat"])), 0, 3)
        btn_frame = QtWidgets.QFrame()
        btn_layout = QtWidgets.QHBoxLayout(btn_frame)
        btn_layout.setContentsMargins(0, 0, 0, 0)
        up_btn = QtWidgets.QPushButton("⬆")
        up_btn.setFixedWidth(35)
        up_btn.clicked.connect(partial(self._move_part, index, -1))
        down_btn = QtWidgets.QPushButton("⬇")
        down_btn.setFixedWidth(35)
        down_btn.clicked.connect(partial(self._move_part, index, 1))
        del_btn = QtWidgets.QPushButton("❌")
        del_btn.setFixedWidth(35)
        del_btn.setStyleSheet("background-color: firebrick;")
        del_btn.clicked.connect(partial(self._delete_part, index))
        btn_layout.addWidget(up_btn)
        btn_layout.addWidget(down_btn)
        btn_layout.addWidget(del_btn)
        layout.addWidget(btn_frame, 0, 4, QtCore.Qt.AlignmentFlag.AlignRight)
        return frame

    def _move_part(self, index: int, direction: int):
        if not 0 <= index < len(self.parts_data):
            return
        new_index = index + direction
        if not 0 <= new_index < len(self.parts_data):
            return
        self.parts_data.insert(new_index, self.parts_data.pop(index))
        self._regenerate_ui_and_serial()

    def _delete_part(self, index: int):
        if 0 <= index < len(self.parts_data):
            self.parts_data.pop(index)
            self._regenerate_ui_and_serial()

    def _regenerate_ui_and_serial(self):
        current = self.serial_decoded_entry.toPlainText()
        if "||" not in current:
            return
        header_part, _ = current.split("||", 1)
        new_tokens = [p.get("raw", "") for p in self.parts_data]
        new_component_str = re.sub(r"\s{2,}", " ", " ".join(new_tokens).strip())
        new_decoded = f"{header_part.strip()}|| {new_component_str} |"
        self.is_handling_change = True
        try:
            self.serial_decoded_entry.blockSignals(True)
            self.serial_decoded_entry.setPlainText(new_decoded)
            self.serial_decoded_entry.blockSignals(False)
            encoded, err = b_encoder.encode_to_base85(new_decoded)
            if not err:
                self.serial_b85_entry.blockSignals(True)
                self.serial_b85_entry.setPlainText(encoded)
                self.serial_b85_entry.blockSignals(False)
        finally:
            self.is_handling_change = False
        self._display_parts()

    def _force_refresh_parts(self):
        text = self.serial_decoded_entry.toPlainText()
        if not text.strip():
            return
        self._parse_and_display_parts(text)

    def _open_add_part_window(self):
        if self.all_parts_df is None or self.all_parts_df.empty:
            QtWidgets.QMessageBox.warning(self, self._get_loc("error", "Error"), self._get_loc("no_input", "Load item type data first."))
            return
        dialog = QtWidgets.QDialog(self)
        dialog.setWindowTitle(self._get_loc("add_part_title", "Add part"))
        layout = QtWidgets.QVBoxLayout(dialog)
        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        content = QtWidgets.QWidget()
        content_layout = QtWidgets.QVBoxLayout(content)
        content_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignTop)

        # Group by part_type
        by_type = self.all_parts_df.groupby("part_type", sort=False)
        self._add_part_checkboxes(content_layout, by_type)

        scroll.setWidget(content)
        layout.addWidget(scroll)
        btn_row = QtWidgets.QHBoxLayout()
        confirm_btn = QtWidgets.QPushButton(self._get_loc("confirm_add", "Confirm"))
        cancel_btn = QtWidgets.QPushButton("Cancel")
        btn_row.addStretch(1)
        btn_row.addWidget(cancel_btn)
        btn_row.addWidget(confirm_btn)
        layout.addLayout(btn_row)

        def on_confirm():
            selected = []
            for cb in content.findChildren(QtWidgets.QCheckBox):
                if cb.isChecked() and hasattr(cb, "_part_info"):
                    selected.append(cb._part_info)
            if not selected:
                dialog.reject()
                return
            qty, ok = QtWidgets.QInputDialog.getInt(
                self,
                self._get_loc("quantity_title", "Quantity"),
                self._get_loc("quantity_prompt", "How many copies of each selected part?"),
                1,
                1,
                99,
                1,
            )
            if not ok:
                return
            for _info in selected:
                tid = _info["type_id"]
                pid = _info["part_id"]
                for _ in range(qty):
                    raw = f"{{{tid}:{pid}}}"
                    self.parts_data.append({"type_id": tid, "part_id": pid, "raw": raw})
            dialog.accept()
            self._regenerate_ui_and_serial()

        confirm_btn.clicked.connect(on_confirm)
        cancel_btn.clicked.connect(dialog.reject)
        dialog.exec()

    def _add_part_checkboxes(self, parent_layout: QtWidgets.QLayout, by_type):
        for part_type, group_df in by_type:
            box = QtWidgets.QGroupBox(str(part_type))
            box_layout = QtWidgets.QVBoxLayout(box)
            for _, r in group_df.iterrows():
                tid = int(r["type_id"])
                pid = int(r["part_id"])
                stat = r.get("stat", "")
                s = r.get("string", "") or stat
                label = f"{pid} | {part_type} | {s} | {stat}"
                cb = QtWidgets.QCheckBox(label)
                cb._part_info = {"type_id": tid, "part_id": pid}
                box_layout.addWidget(cb)
            parent_layout.addWidget(box)

    def refresh_backpack_items(self):
        while self.backpack_items_layout.count():
            item = self.backpack_items_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        type_en = next((t[2] for t in ITEM_TYPES if t[0] == self.current_type_key), "Grenade")
        if self.main_app is None or not hasattr(self.main_app, "controller") or self.main_app.controller.yaml_obj is None:
            self.backpack_items_layout.addWidget(
                QtWidgets.QLabel(self._get_loc("decrypt_save_to_show_weapons", "Decrypt save to show items"))
            )
            return
        items = self.main_app.controller.get_all_items()
        filtered = [i for i in items if i.get("type_en") == type_en and "Backpack" in (i.get("container") or "")]
        if not filtered:
            self.backpack_items_layout.addWidget(
                QtWidgets.QLabel(self._get_loc("no_weapons_in_backpack", "No items in backpack").replace("weapons", self.current_type_key + "s"))
            )
            return
        for it in filtered:
            name = it.get("name", "Unknown")
            level = it.get("level", "?")
            slot = (it.get("slot") or "?").replace("slot_", "")
            btn = QtWidgets.QPushButton(f"{name} — Level: {level} — Slot: {slot}")
            btn.clicked.connect(partial(self._load_from_item, it))
            self.backpack_items_layout.addWidget(btn)

    def _load_from_item(self, item: dict):
        # Ensure current type (grenade/shield/repkit/heavy) matches the item so
        # part lookups use the correct CSVs instead of always grenade.
        item_type_en = (item or {}).get("type_en", "") or ""
        if item_type_en:
            self._ensure_type_for_item(item_type_en)

        self.selected_item_path = item.get("original_path")
        serial = item.get("serial", "") or ""
        decoded = item.get("decoded_full", "") or item.get("decoded", "") or ""
        if serial and not decoded:
            try:
                decoded, _, _ = bl4f.decode_serial_to_string(serial)
            except Exception:
                pass
        self.is_handling_change = True
        self.serial_b85_entry.setPlainText(serial)
        self.serial_decoded_entry.setPlainText(decoded or "")
        self.is_handling_change = False
        if decoded:
            self._parse_and_display_parts(decoded)
        self.update_item_btn.setEnabled(True)

    def _update_item(self):
        if not self.selected_item_path or not self.main_app:
            QtWidgets.QMessageBox.warning(self, self._get_loc("error", "Error"), self._get_loc("select_weapon_first", "Select an item from backpack first."))
            return
        b85 = self.serial_b85_entry.toPlainText().strip()
        if not b85:
            return
        payload = {
            "item_path": self.selected_item_path,
            "original_item_data": {},
            "new_item_data": {"serial": b85},
            "success_msg": self._get_loc("update_success", "Item updated."),
        }
        self.update_item_requested.emit(payload)

    def _add_to_backpack(self):
        decoded = self.serial_decoded_entry.toPlainText().strip()
        if not decoded:
            QtWidgets.QMessageBox.warning(self, self._get_loc("no_input", "No input"), self._get_loc("serial_empty", "Serial is empty."))
            return
        encoded, err = b_encoder.encode_to_base85(decoded)
        if err:
            QtWidgets.QMessageBox.critical(self, self._get_loc("error", "Error"), self._get_loc("encoding_fail", "Encoding failed."))
            return
        flag = self.flag_combo.currentText()
        self.add_to_backpack_requested.emit(encoded, flag)

    # --- Skin preview helpers (mirroring weapon tabs) ---
    def _skin_image_path(self, token: str):
        if token and token.startswith("Cosmetics_Weapon_Shiny_") and token != "Cosmetics_Weapon_Shiny_Ultimate":
            token = "Cosmetics_Weapon_Shiny_bloodstarved"
        return resource_loader.get_resource_path(f"master_search/skin_images/{token}.png")

    def _formatted_skin_code(self, token: str) -> str:
        safe = (token or "").strip().replace('"', '\\"')
        return f'"c", "{safe}" |'

    def _append_skin_to_decoded(self, token: str):
        """Append a cosmetic skin block to the decoded serial and re-encode."""
        try:
            decoded = (self.serial_decoded_entry.toPlainText() or "").strip()
            if not decoded:
                QtWidgets.QMessageBox.warning(self, "No item loaded", "Load or paste an item first, then apply a skin.")
                return

            formatted = self._formatted_skin_code(token)
            if "|" in decoded:
                last = decoded.rfind("|")
                base = decoded[: last + 1].rstrip()
                new_decoded = f"{base} {formatted}"
            else:
                base = decoded.rstrip()
                if not base.endswith("|"):
                    base = f"{base} |"
                new_decoded = f"{base} {formatted}"

            encoded_serial, err = b_encoder.encode_to_base85(new_decoded)
            if err:
                raise ValueError(err)

            self.is_handling_change = True
            try:
                self.serial_decoded_entry.blockSignals(True)
                self.serial_decoded_entry.setPlainText(new_decoded)
                self.serial_decoded_entry.blockSignals(False)
                self.serial_b85_entry.blockSignals(True)
                self.serial_b85_entry.setPlainText(encoded_serial)
                self.serial_b85_entry.blockSignals(False)
            finally:
                self.is_handling_change = False

            # Re-parse parts so UI stays in sync.
            self._parse_and_display_parts(new_decoded)
        except Exception as e:
            QtWidgets.QMessageBox.warning(self, "Skin apply failed", f"Could not apply skin: {e}")

    def _update_skin_preview(self):
        token = self.skin_combo.currentData() if hasattr(self, "skin_combo") else None
        if not token:
            self.skin_preview_frame.setVisible(False)
            return

        img_path = self._skin_image_path(token)
        if not img_path or not img_path.exists():
            self.skin_preview_frame.setVisible(False)
            return

        pix = QtGui.QPixmap(str(img_path))
        if pix.isNull():
            self.skin_preview_frame.setVisible(False)
            return

        scaled = pix.scaled(
            self._skin_prev_w,
            self._skin_prev_h,
            QtCore.Qt.AspectRatioMode.KeepAspectRatio,
            QtCore.Qt.TransformationMode.SmoothTransformation,
        )
        self.skin_preview_label.setPixmap(scaled)
        self.skin_preview_name.setText(self.skin_combo.currentText())
        self.skin_preview_token.setText(str(token))
        self.skin_preview_frame.setVisible(True)

    def _open_skin_lightbox(self):
        token = self.skin_combo.currentData() if hasattr(self, "skin_combo") else None
        if not token:
            return
        img_path = self._skin_image_path(token)
        if not img_path or not img_path.exists():
            return
        pix = QtGui.QPixmap(str(img_path))
        if pix.isNull():
            return

        dlg = QtWidgets.QDialog(self, QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Dialog)
        dlg.setModal(True)
        dlg.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        dlg.setStyleSheet("background-color: rgba(0,0,0,180);")

        lay = QtWidgets.QVBoxLayout(dlg)
        lay.setContentsMargins(0, 0, 0, 0)

        lbl = QtWidgets.QLabel()
        lbl.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        max_w = int(self.window().width() * 0.85)
        max_h = int(self.window().height() * 0.85)
        scaled = pix.scaled(
            max_w,
            max_h,
            QtCore.Qt.AspectRatioMode.KeepAspectRatio,
            QtCore.Qt.TransformationMode.SmoothTransformation,
        )
        lbl.setPixmap(scaled)
        lbl.setStyleSheet(
            "QLabel{border:2px solid rgba(180,255,80,180); "
            "border-radius:14px; background: rgba(10,10,16,120); padding:10px;}"
        )
        lay.addWidget(lbl, 1, QtCore.Qt.AlignmentFlag.AlignCenter)

        dlg.mousePressEvent = lambda e: dlg.accept()
        dlg.keyPressEvent = lambda e: dlg.accept()
        dlg.exec()

    def load_from_item(self, item: dict):
        """Called from main window (e.g. Edit in Item Edit)."""
        self._load_from_item(item)

    # --- Helpers for selecting the correct item type based on item.type_en ---
    def _ensure_type_for_item(self, item_type_en: str):
        """Switch current_type_key and type combo so lookups use the right CSVs."""
        target_key = None
        for key, _label, type_en_val in ITEM_TYPES:
            if type_en_val == item_type_en:
                target_key = key
                break
        if not target_key or target_key == self.current_type_key:
            return

        # Updating the combo will trigger _on_type_changed and reload data.
        for i in range(self.type_combo.count()):
            if self.type_combo.itemData(i) == target_key:
                self.type_combo.setCurrentIndex(i)
                break
