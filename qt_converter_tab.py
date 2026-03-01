import re
import time
import itertools
import csv
from collections import Counter
from typing import Optional
from qt_autogrow_textedit import AutoGrowPlainTextEdit
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QLineEdit,
    QPushButton, QGroupBox, QTextEdit, QMessageBox, QFileDialog, QComboBox,
    QCheckBox, QScrollArea
)
from PyQt6.QtCore import pyqtSignal, QTimer, Qt, QObject, QThread

import decoder_logic
import b_encoder
import resource_loader
import lookup

class TranslateWorker(QObject):
    """Runs parts DB load + lookup in background so Single Converter stays responsive."""
    finished = pyqtSignal(str, str)  # output_text, error_msg (empty if success)

    def __init__(self, raw, resolve_section=None, section_prefixes=None):
        super().__init__()
        self.raw = raw
        self.resolve_section = resolve_section
        self.section_prefixes = section_prefixes or {}

    def run(self):
        try:
            decoded_str, err_msg = None, None
            if self.raw.startswith("@"):
                decoded_str, _, err_msg = decoder_logic.decode_serial_to_string(self.raw)
            else:
                decoded_str, err_msg = self.raw, None
            if err_msg or not decoded_str:
                self.finished.emit("", err_msg or "Invalid input")
                return
            parts_list, _ = self._parse_parts(decoded_str)
            if not parts_list:
                self.finished.emit("No part tokens found in the code.", "")
                return
            db = resource_loader.load_parts_db()
            by_code = {}
            by_key = {}
            if db and "rows" in db:
                for row in db.get("rows", []):
                    mfg = (row.get("Manufacturer") or "").strip()
                    wtype = (row.get("Weapon Type") or "").strip()
                    pid = (row.get("ID") or "").strip()
                    code = (row.get("code") or "").strip()
                    if code:
                        if code not in by_code:
                            by_code[code] = []
                        by_code[code].append(row)
                    if mfg and pid:
                        key = (mfg, wtype, pid)
                        if key not in by_key:
                            by_key[key] = []
                        by_key[key].append(row)
            elemental = {}
            try:
                path = resource_loader.get_resource_path("weapon_edit/elemental.csv")
                if path.exists():
                    with open(path, "r", encoding="utf-8") as f:
                        for row in csv.DictReader(f):
                            try:
                                pid = int((row.get("Part_ID") or "").strip())
                                stat = (row.get("Stat") or "").strip()
                                if stat:
                                    elemental[pid] = stat
                            except (ValueError, KeyError):
                                continue
            except Exception:
                pass
            skin_names = {}
            try:
                data = resource_loader.load_json_resource("master_search/db/weapon_skin_names.json")
                if isinstance(data, dict):
                    skin_names = {str(k): str(v).strip() for k, v in data.items() if v}
            except Exception:
                pass
            counts = Counter()
            for p in parts_list:
                if p[0] == "skin":
                    skin_id = p[1]
                    skin_label = skin_names.get(str(skin_id), f"Skin ID {skin_id}")
                    counts[("Skin", skin_label, "", f'"c", {skin_id}')] += 1
                else:
                    type_id, part_id = p[0], p[1]
                    res = self._lookup(type_id, part_id, by_code, by_key, elemental)
                    # Ensure 4-tuple (some DB/code paths may return 3)
                    if len(res) != 4:
                        res = (tuple(res) + ("",) * 4)[:4]
                    pt, s, stats, code_key = res
                    counts[(pt, s, stats, code_key)] += 1
            lines = []
            for item, qty in sorted(
                counts.items(), key=lambda x: (-x[1], x[0][0], x[0][1])
            ):
                # Keys may be 3-tuple (legacy skin) or 4-tuple
                pt, s, stats, code_key = (tuple(item) + ("",) * 4)[:4]
                if stats:
                    lines.append(f"  {qty}×  {code_key}  [{pt}]  {s}  —  {stats}")
                else:
                    lines.append(f"  {qty}×  {code_key}  [{pt}]  {s}")
            self.finished.emit("\n".join(lines) if lines else "No parts.", "")
        except Exception as e:
            self.finished.emit("", str(e))

    def _header_mfg_id(self, decoded_str):
        if "||" not in decoded_str:
            return None
        header = decoded_str.split("||", 1)[0].strip()
        try:
            first = header.split("|")[0].strip().split(",")[0].strip()
            return int(first)
        except (ValueError, IndexError):
            return None

    def _parse_parts(self, decoded_str):
        if "||" not in decoded_str:
            return [], None
        header, parts_part = decoded_str.split("||", 1)
        header_mfg = self._header_mfg_id(decoded_str)
        out = []
        for m in re.finditer(r'\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|\"c\",\s*(\d+)', parts_part):
            if m.group(3):
                out.append(("skin", int(m.group(3))))
                continue
            outer, inner = int(m.group(1)), m.group(2)
            if inner:
                if "[" in inner:
                    for sid in inner.strip("[]").split():
                        try:
                            out.append((outer, int(sid)))
                        except ValueError:
                            pass
                else:
                    out.append((outer, int(inner)))
            else:
                tid = header_mfg if header_mfg is not None else outer
                out.append((tid, outer))
        return out, header_mfg

    def _pick_row(self, rows):
        if not rows:
            return {}
        section = self.resolve_section
        if not section:
            return rows[0]
        prefixes = self.section_prefixes.get(section)
        if not prefixes:
            return rows[0]
        for r in rows:
            src = (r.get("source") or "").strip()
            if any(src == p or src.startswith(p + "_") for p in prefixes):
                return r
        return rows[0]

    def _lookup(self, type_id, part_id, by_code, by_key, elemental):
        code_key = f"{{{type_id}:{part_id}}}"
        if type_id == 1:
            name = elemental.get(part_id)
            if name:
                return ("Elemental", name, "", code_key)
        rows = by_code.get(code_key)
        if not rows:
            mfg, wtype, _ = lookup.get_kind_enums(type_id)
            key = (mfg, wtype, str(part_id))
            rows = by_key.get(key)
        if not rows:
            return ("Unknown", code_key, "", code_key)
        row = self._pick_row(rows)
        if not isinstance(row, dict):
            return ("Unknown", code_key, "", code_key)
        pt = (row.get("Part Type") or "Part").strip()
        s = (row.get("String") or row.get("Model Name") or "").strip() or f"ID {part_id}"
        stats = (row.get("Stats (Level 50, Common)") or row.get("Stats") or "").strip()
        return (pt, s, stats, code_key)


class BatchConverterWorker(QObject):
    """后台工作线程，用于批量转换"""
    progress = pyqtSignal(int, int) # current, total
    finished = pyqtSignal(list)
    
    def __init__(self, lines, loc_data=None):
        super().__init__()
        self.lines = lines
        self.loc = loc_data

    def run(self):
        results = []
        total = len(self.lines)
        err_prefix = "Error: "
        crit_prefix = "Critical Error: "
        
        if self.loc:
            # Extract simple prefixes if possible, or just use default English
            # Since loc has templates like "状态: Error: {error}", we just want "Error: "
            pass 

        for i, line in enumerate(self.lines):
            mode = 'deserialize' if line.strip().startswith('@U') else 'serialize'
            try:
                if mode == 'deserialize':
                    result, _, error = decoder_logic.decode_serial_to_string(line)
                else: # serialize
                    result, error = b_encoder.encode_to_base85(line)
                
                output = result if not error else f"{err_prefix}{error}"
            except Exception as e:
                output = f"{crit_prefix}{e}"
            results.append(output)
            self.progress.emit(i + 1, total)
            time.sleep(0.01) # 避免UI完全冻结
        self.finished.emit(results)


class QtConverterTab(QWidget):
    batch_add_requested = pyqtSignal(list, str)
    iterator_requested = pyqtSignal(dict)
    iterator_add_to_backpack_requested = pyqtSignal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_lang = 'en-US'
        self._load_localization()
        
        self.ui_labels = {}
        self.ui_buttons = {}
        self.ui_groups = {}
        self.ui_placeholders = {}
        self.ui_checkboxes = {}

        scroll_area = QScrollArea(self)
        scroll_area.setWidgetResizable(True)
        
        container_widget = QWidget()
        scroll_area.setWidget(container_widget)
        
        main_layout = QVBoxLayout(container_widget)

        # The main layout for the tab itself, which will only contain the scroll area
        tab_layout = QVBoxLayout(self)
        tab_layout.addWidget(scroll_area)
        tab_layout.setContentsMargins(0, 0, 0, 0)
        
        # --- Single Converter ---
        self._create_single_converter_group(main_layout)

        # --- Batch Converter ---
        self._create_batch_converter_group(main_layout)

        # --- Batch Add to Backpack ---
        self._create_batch_add_group(main_layout)
        
        # --- Iterator ---
        self._create_iterator_group(main_layout)

        main_layout.addStretch()
        self.update_iterator_ui()

    def _create_single_converter_group(self, main_layout):
        """Advanced Translator style: one input (Base85 or deserialized), part list with quantities below."""
        self.ui_groups['single'] = QGroupBox(self.loc['groups']['single'])
        single_layout = QVBoxLayout(self.ui_groups['single'])

        self.ui_labels['translate_input'] = QLabel(self.loc.get('labels', {}).get('translate_input', 'Base85 or Deserialized Code'))
        single_layout.addWidget(self.ui_labels['translate_input'])
        self.translate_input = AutoGrowPlainTextEdit(min_lines=5, max_lines=16)
        self.translate_input.setPlaceholderText(self.loc.get('placeholders', {}).get('translate_input', 'Paste Base85 (e.g. @Ug#2fK2...) or deserialized (e.g. 255, 0, 1, 50| 2, 969|| ...)'))
        self.ui_placeholders['translate_input'] = self.translate_input
        single_layout.addWidget(self.translate_input)

        btn_row = QHBoxLayout()
        self.translate_btn = QPushButton(self.loc.get('buttons', {}).get('translate', 'Translate Code'))
        self.translate_btn.clicked.connect(self.perform_translate)
        btn_row.addWidget(self.translate_btn)
        self.ui_buttons['clear'] = QPushButton(self.loc['buttons']['clear'])
        self.ui_buttons['clear'].clicked.connect(self.clear_single_converter)
        btn_row.addWidget(self.ui_buttons['clear'])
        btn_row.addStretch()
        self.single_status_label = QLabel(self.loc['labels']['status_ready'])
        self.ui_labels['single_status'] = self.single_status_label
        btn_row.addWidget(self.single_status_label)
        single_layout.addLayout(btn_row)

        self.ui_labels['part_list'] = QLabel(self.loc.get('labels', {}).get('part_explanations', 'Part list (with quantities)'))
        single_layout.addWidget(self.ui_labels['part_list'])
        self.part_list_output = QTextEdit()
        self.part_list_output.setReadOnly(True)
        self.part_list_output.setMinimumHeight(180)
        self.part_list_output.setPlaceholderText(self.loc.get('placeholders', {}).get('part_list', 'Translated parts will appear here.'))
        single_layout.addWidget(self.part_list_output)

        main_layout.addWidget(self.ui_groups['single'])
        self._parts_db = None
        self._parts_db_by_key = None  # (mfg, wtype, pid) -> list of rows (with "source")
        self._parts_db_by_code = None  # "{type_id:part_id}" -> list of rows
        self._resolve_section = None  # e.g. "grenade", "shield", "weapon_edit"; None = universal
        # Section -> source name prefixes in universal DB (from build_universal_parts_db EXTRA_PART_CSV_PATHS stems)
        self._section_source_prefixes = {
            "grenade": ["grenade_main_perk", "manufacturer_rarity_perk"],
            "shield": ["shield_main_perk", "manufacturer_perk"],
            "weapon_edit": ["all_weapon_part", "all_weapon_part_EN"],
            "repkit": ["repkit_main_perk", "repkit_manufacturer_perk"],
            "heavy": ["heavy_main_perk", "heavy_manufacturer_perk"],
            "enhancement": ["Enhancement_perk", "Enhancement_manufacturers"],
            "class_mod": [],  # no app CSV in universal; use universal
        }

    def _create_batch_converter_group(self, main_layout):
        self.ui_groups['batch'] = QGroupBox(self.loc['groups']['batch'])
        batch_layout = QGridLayout(self.ui_groups['batch'])

        self.ui_labels['input_batch'] = QLabel(self.loc['labels']['input_batch'])
        batch_layout.addWidget(self.ui_labels['input_batch'], 0, 0)
        
        self.batch_input = QTextEdit()
        self.batch_input.setMinimumHeight(200)
        batch_layout.addWidget(self.batch_input, 1, 0)

        output_header_layout = QHBoxLayout()
        self.ui_labels['output'] = QLabel(self.loc['labels']['output'])
        output_header_layout.addWidget(self.ui_labels['output'])
        output_header_layout.addStretch()
        
        self.ui_buttons['export_txt'] = QPushButton(self.loc['buttons']['export_txt'])
        self.ui_buttons['export_txt'].clicked.connect(self.export_batch_results)
        output_header_layout.addWidget(self.ui_buttons['export_txt'])
        batch_layout.addLayout(output_header_layout, 0, 1)

        self.batch_output = QTextEdit()
        self.batch_output.setReadOnly(True)
        self.batch_output.setMinimumHeight(200)
        batch_layout.addWidget(self.batch_output, 1, 1)

        self.batch_process_btn = QPushButton(self.loc['buttons']['start_batch'])
        self.batch_process_btn.clicked.connect(self.start_batch_processing)
        self.ui_buttons['start_batch'] = self.batch_process_btn
        batch_layout.addWidget(self.batch_process_btn, 2, 0, 1, 2)
        
        self.batch_status_label = QLabel(self.loc['labels']['status_ready'])
        self.ui_labels['batch_status'] = self.batch_status_label # Track status label
        batch_layout.addWidget(self.batch_status_label, 3, 0, 1, 2)

        main_layout.addWidget(self.ui_groups['batch'])

    def _create_batch_add_group(self, main_layout):
        self.ui_groups['batch_add'] = QGroupBox(self.loc['groups']['batch_add'])
        layout = QVBoxLayout(self.ui_groups['batch_add'])

        self.ui_labels['input_batch_add'] = QLabel(self.loc['labels']['input_batch_add'])
        layout.addWidget(self.ui_labels['input_batch_add'])
        
        self.batch_add_input = QTextEdit()
        self.batch_add_input.setMinimumHeight(150)
        layout.addWidget(self.batch_add_input)

        controls_layout = QHBoxLayout()
        self.batch_add_btn = QPushButton(self.loc['buttons']['batch_add'])
        self.batch_add_btn.clicked.connect(self.start_batch_add)
        self.ui_buttons['batch_add'] = self.batch_add_btn
        controls_layout.addWidget(self.batch_add_btn)
        
        controls_layout.addStretch()
        
        self.ui_labels['select_flag'] = QLabel(self.loc['labels']['select_flag'])
        controls_layout.addWidget(self.ui_labels['select_flag'])
        
        self.batch_add_flag_combo = QComboBox()
        self._populate_batch_flags()
        controls_layout.addWidget(self.batch_add_flag_combo)
        layout.addLayout(controls_layout)

        self.batch_add_status_label = QLabel(self.loc['labels']['status_ready'])
        self.ui_labels['batch_add_status'] = self.batch_add_status_label # Track status label
        layout.addWidget(self.batch_add_status_label)

        main_layout.addWidget(self.ui_groups['batch_add'])
    
    def _populate_batch_flags(self):
        self.batch_add_flag_combo.clear()
        flags = self.loc['flags']
        flag_values = [flags["1"], flags["3"], flags["5"], flags["17"], flags["33"], flags["65"], flags["129"]]
        self.batch_add_flag_combo.addItems(flag_values)
        self.batch_add_flag_combo.setCurrentText(flags["3"])

    def set_resolve_section(self, section: Optional[str]):
        """Set default section for part resolution (e.g. 'grenade', 'shield'). None = universal."""
        self._resolve_section = section if section and section != "universal" else None

    def _load_parts_db(self):
        """Load parts DB and build lookup (mfg, wtype, part_id) -> list of rows (with 'source')."""
        if self._parts_db_by_key is not None and self._parts_db_by_code is not None:
            return
        self._parts_db = resource_loader.load_parts_db()
        self._parts_db_by_key = {}
        self._parts_db_by_code = {}
        if not self._parts_db or "rows" not in self._parts_db:
            return
        for row in self._parts_db.get("rows", []):
            mfg = (row.get("Manufacturer") or "").strip()
            wtype = (row.get("Weapon Type") or "").strip()
            pid = (row.get("ID") or "").strip()
            code = (row.get("code") or "").strip()
            if code:
                if code not in self._parts_db_by_code:
                    self._parts_db_by_code[code] = []
                self._parts_db_by_code[code].append(row)
            if mfg and pid:  # wtype can be empty for e.g. Enhancements
                key = (mfg, wtype, pid)
                if key not in self._parts_db_by_key:
                    self._parts_db_by_key[key] = []
                self._parts_db_by_key[key].append(row)

    def _header_mfg_id(self, decoded_str):
        if "||" not in decoded_str:
            return None
        header = decoded_str.split("||", 1)[0].strip()
        try:
            first = header.split("|")[0].strip().split(",")[0].strip()
            return int(first)
        except (ValueError, IndexError):
            return None

    def _parse_parts_from_decoded(self, decoded_str):
        """Extract (type_id, part_id) list from decoded string (weapon-style tokens + "c", skinId)."""
        if "||" not in decoded_str:
            return [], None
        header, parts_part = decoded_str.split("||", 1)
        header_mfg = self._header_mfg_id(decoded_str)
        out = []
        for m in re.finditer(r'\{(\d+)(?::(\d+|\[[\d\s]+\]))?\}|\"c\",\s*(\d+)', parts_part):
            if m.group(3):
                out.append(("skin", int(m.group(3))))
                continue
            outer, inner = int(m.group(1)), m.group(2)
            if inner:
                if "[" in inner:
                    for sid in inner.strip("[]").split():
                        try:
                            out.append((outer, int(sid)))
                        except ValueError:
                            pass
                else:
                    out.append((outer, int(inner)))
            else:
                tid = header_mfg if header_mfg is not None else outer
                out.append((tid, outer))
        return out, header_mfg

    def _load_elemental_map(self):
        """Load weapon_edit/elemental.csv into part_id -> Stat name for type_id 1 (elemental) resolution."""
        if getattr(self, "_elemental_by_part_id", None) is not None:
            return
        self._elemental_by_part_id = {}
        try:
            path = resource_loader.get_resource_path("weapon_edit/elemental.csv")
            if not path.exists():
                return
            with open(path, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    try:
                        pid = int((row.get("Part_ID") or "").strip())
                        stat = (row.get("Stat") or "").strip()
                        if stat:
                            self._elemental_by_part_id[pid] = stat
                    except (ValueError, KeyError):
                        continue
        except Exception:
            pass

    def _lookup_part_display(self, type_id, part_id):
        """Return (part_type, string, stats, code_key) from DB or elemental.csv for type_id 1."""
        # Elemental parts use type_id 1 and are not in the universal DB; resolve from weapon_edit/elemental.csv
        code_key = f"{{{type_id}:{part_id}}}"
        if type_id == 1:
            self._load_elemental_map()
            name = (getattr(self, "_elemental_by_part_id", None) or {}).get(part_id)
            if name:
                return "Elemental", name, "", code_key
        self._load_parts_db()
        rows = None
        # 1) Prefer exact code match from universal_parts_db (most complete DB, matches website behaviour)
        if getattr(self, "_parts_db_by_code", None):
            rows = self._parts_db_by_code.get(code_key)
        # 2) Fallback to (Manufacturer, Weapon Type, ID) mapping for older entries
        if not rows and getattr(self, "_parts_db_by_key", None):
            mfg, wtype, _ = lookup.get_kind_enums(type_id)
            key = (mfg, wtype, str(part_id))
            rows = self._parts_db_by_key.get(key)
        if not rows:
            return "Unknown", f"{{{type_id}:{part_id}}}", "", code_key
        # Prefer a row from the current section's sources when resolve section is set
        row = self._pick_row_for_section(rows)
        pt = (row.get("Part Type") or "Part").strip()
        s = (row.get("String") or row.get("Model Name") or "").strip() or f"ID {part_id}"
        stats = (row.get("Stats (Level 50, Common)") or row.get("Stats") or "").strip()
        return pt, s, stats, code_key

    def _pick_row_for_section(self, rows: list) -> dict:
        """From multiple rows for same key, prefer one matching current _resolve_section; else first."""
        if not rows:
            return {}
        section = getattr(self, "_resolve_section", None)
        if not section:
            return rows[0]
        prefixes = (getattr(self, "_section_source_prefixes", None) or {}).get(section)
        if not prefixes:
            return rows[0]
        for r in rows:
            src = (r.get("source") or "").strip()
            if any(src == p or src.startswith(p + "_") for p in prefixes):
                return r
        return rows[0]

    def perform_translate(self):
        """Parse input (Base85 or deserialized), then show part list with quantities. Runs in background thread."""
        raw = self.translate_input.toPlainText().strip()
        self.part_list_output.clear()
        if not raw:
            self.single_status_label.setText(self.loc['labels']['status_ready'])
            self.single_status_label.setStyleSheet("")
            return
        self.single_status_label.setText(self.loc['labels']['status_processing'])
        self.single_status_label.setStyleSheet("")
        self.translate_btn.setEnabled(False)
        self._translate_thread = QThread()
        self._translate_worker = TranslateWorker(
            raw,
            resolve_section=getattr(self, "_resolve_section", None),
            section_prefixes=getattr(self, "_section_source_prefixes", None),
        )
        self._translate_worker.moveToThread(self._translate_thread)
        self._translate_thread.started.connect(self._translate_worker.run)
        self._translate_worker.finished.connect(self._on_translate_finished)
        self._translate_worker.finished.connect(self._translate_thread.quit)
        self._translate_worker.finished.connect(self._translate_worker.deleteLater)
        self._translate_thread.finished.connect(self._translate_thread.deleteLater)
        self._translate_thread.start()

    def _on_translate_finished(self, output_text, error_msg):
        self.translate_btn.setEnabled(True)
        if error_msg:
            self.single_status_label.setText(self.loc['labels']['status_error'].format(error=error_msg))
            self.single_status_label.setStyleSheet("color: red;")
            self.part_list_output.setPlainText("")
        else:
            self.part_list_output.setPlainText(output_text)
            self.single_status_label.setText(self.loc['labels']['status_success'])
            self.single_status_label.setStyleSheet("color: green;")

    def on_single_input_changed(self):
        """No-op: we use explicit Translate button for the new single section."""
        pass

    def start_batch_processing(self):
        lines = [line.strip() for line in self.batch_input.toPlainText().split('\n') if line.strip()]
        if not lines:
            self.batch_status_label.setText(self.loc['labels']['status_empty'])
            return

        self.batch_process_btn.setEnabled(False)
        self.batch_process_btn.setText(self.loc['buttons']['processing'])
        self.batch_output.clear()
        
        self.thread = QThread()
        self.worker = BatchConverterWorker(lines, self.loc['labels'])
        self.worker.moveToThread(self.thread)

        self.thread.started.connect(self.worker.run)
        self.worker.finished.connect(self.on_batch_finished)
        self.worker.progress.connect(self.on_batch_progress)
        
        self.worker.finished.connect(self.thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)
        self.thread.finished.connect(self.thread.deleteLater)

        self.thread.start()

    def on_batch_progress(self, current, total):
        self.batch_status_label.setText(self.loc['labels']['status_progress'].format(current=current, total=total))

    def on_batch_finished(self, results):
        self.batch_output.setText('\n'.join(results))
        self.batch_status_label.setText(self.loc['labels']['status_complete'])
        self.batch_process_btn.setEnabled(True)
        self.batch_process_btn.setText(self.loc['buttons']['start_batch'])

    def export_batch_results(self):
        content = self.batch_output.toPlainText()
        if not content:
            QMessageBox.warning(self, self.loc['dialogs']['no_content'], self.loc['dialogs']['no_export'])
            return
        
        filepath, _ = QFileDialog.getSaveFileName(self, self.loc['dialogs']['export_batch_title'], "", "Text Files (*.txt);;All Files (*)")
        if filepath:
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                QMessageBox.information(self, self.loc['dialogs']['success'], self.loc['dialogs']['export_success'].format(path=filepath))
            except Exception as e:
                QMessageBox.critical(self, self.loc['dialogs']['export_fail'], self.loc['dialogs']['write_fail'].format(error=e))

    def clear_single_converter(self):
        self.translate_input.setPlainText('')
        self.part_list_output.clear()
        self.single_status_label.setText(self.loc['labels']['status_ready'])
        self.single_status_label.setStyleSheet("")

    def start_batch_add(self):
        lines = [line.strip() for line in self.batch_add_input.toPlainText().split('\n') if line.strip()]
        if not lines:
            QMessageBox.warning(self, self.loc['dialogs']['no_input'], self.loc['dialogs']['batch_add_empty'])
            return
        
        flag = self.batch_add_flag_combo.currentText().split(" ")[0]
        self.batch_add_btn.setEnabled(False)
        self.batch_add_btn.setText(self.loc['buttons']['adding'])
        self.batch_add_status_label.setText(self.loc['labels']['status_prepare'])
        
        self.batch_add_requested.emit(lines, flag)

    def update_batch_add_status(self, current, total, success_count, fail_count):
        self.batch_add_status_label.setText(self.loc['labels']['status_batch_add_progress'].format(current=current, total=total, success=success_count, fail=fail_count))

    def finalize_batch_add(self, success_count, fail_count):
        self.batch_add_status_label.setText(self.loc['labels']['status_batch_add_complete'].format(success=success_count, fail=fail_count))
        self.batch_add_btn.setEnabled(True)
        self.batch_add_btn.setText(self.loc['buttons']['batch_add'])

    def _create_iterator_group(self, main_layout):
        self.ui_groups['iterator'] = QGroupBox(self.loc['groups']['iterator'])
        layout = QVBoxLayout(self.ui_groups['iterator'])
        
        # --- Base Data ---
        self.ui_labels['base_data'] = QLabel(self.loc['labels']['base_data'])
        layout.addWidget(self.ui_labels['base_data'])
        self.iterator_base = QLineEdit('255, 0, 1, 50| 2, 969|| ')
        layout.addWidget(self.iterator_base)

        # --- Normal Iterator ---
        normal_iterator_layout = QGridLayout()
        self.ui_labels['iter_start'] = QLabel(self.loc['labels']['iter_start'])
        normal_iterator_layout.addWidget(self.ui_labels['iter_start'], 0, 0)
        self.iterator_start = QLineEdit("1")
        normal_iterator_layout.addWidget(self.iterator_start, 1, 0)
        self.ui_labels['iter_end'] = QLabel(self.loc['labels']['iter_end'])
        normal_iterator_layout.addWidget(self.ui_labels['iter_end'], 0, 1)
        self.iterator_end = QLineEdit("99")
        normal_iterator_layout.addWidget(self.iterator_end, 1, 1)
        layout.addLayout(normal_iterator_layout)

        # --- Special Format ---
        self.special_format_check = QCheckBox(self.loc['checkboxes']['special_format'])
        self.special_format_check.clicked.connect(self.update_iterator_ui)
        self.ui_checkboxes['special_format'] = self.special_format_check
        layout.addWidget(self.special_format_check)
        
        self.special_format_options = QWidget()
        special_options_layout = QHBoxLayout(self.special_format_options)
        self.ui_labels['special_base'] = QLabel(self.loc['labels']['special_base'])
        special_options_layout.addWidget(self.ui_labels['special_base'])
        self.iterator_special_base = QLineEdit("245")
        special_options_layout.addWidget(self.iterator_special_base)
        
        # New Special Combo Checkbox and Input
        self.special_combo_check = QCheckBox(self.loc['checkboxes']['special_combo'])
        self.special_combo_check.clicked.connect(self.update_iterator_ui)
        self.ui_checkboxes['special_combo'] = self.special_combo_check
        special_options_layout.addWidget(self.special_combo_check)

        self.ui_labels['special_combo_input'] = QLabel(self.loc['labels']['special_combo_input'])
        special_options_layout.addWidget(self.ui_labels['special_combo_input'])
        
        self.special_combo_input = QLineEdit()
        self.special_combo_input.setPlaceholderText("98 99")
        self.ui_placeholders['special_combo_input'] = self.special_combo_input
        special_options_layout.addWidget(self.special_combo_input)

        special_options_layout.addStretch()
        layout.addWidget(self.special_format_options)

        # --- Modes ---
        mode_layout = QHBoxLayout()
        self.skin_mode_check = QCheckBox(self.loc['checkboxes']['skin_mode'])
        self.skin_mode_check.clicked.connect(self.update_iterator_ui)
        self.ui_checkboxes['skin_mode'] = self.skin_mode_check
        mode_layout.addWidget(self.skin_mode_check)
        
        self.combination_mode_check = QCheckBox(self.loc['checkboxes']['combo_mode'])
        self.combination_mode_check.clicked.connect(self.update_iterator_ui)
        self.ui_checkboxes['combo_mode'] = self.combination_mode_check
        mode_layout.addWidget(self.combination_mode_check)
        mode_layout.addStretch()
        layout.addLayout(mode_layout)

        # --- Combination Options ---
        self.combination_options = QWidget()
        combo_options_layout = QGridLayout(self.combination_options)
        self.ui_labels['combo_start'] = QLabel(self.loc['labels']['combo_start'])
        combo_options_layout.addWidget(self.ui_labels['combo_start'], 0, 0)
        self.combination_start = QLineEdit("1")
        combo_options_layout.addWidget(self.combination_start, 1, 0)
        
        self.ui_labels['combo_end'] = QLabel(self.loc['labels']['combo_end'])
        combo_options_layout.addWidget(self.ui_labels['combo_end'], 0, 1)
        self.combination_end = QLineEdit("10")
        combo_options_layout.addWidget(self.combination_end, 1, 1)
        
        self.ui_labels['combo_size'] = QLabel(self.loc['labels']['combo_size'])
        combo_options_layout.addWidget(self.ui_labels['combo_size'], 0, 2)
        self.combination_size = QLineEdit("2")
        combo_options_layout.addWidget(self.combination_size, 1, 2)
        layout.addWidget(self.combination_options)

        # --- YAML Output ---
        yaml_layout = QHBoxLayout()
        self.yaml_format_check = QCheckBox(self.loc['checkboxes']['yaml_format'])
        self.yaml_format_check.clicked.connect(self.update_iterator_ui)
        self.ui_checkboxes['yaml_format'] = self.yaml_format_check
        yaml_layout.addWidget(self.yaml_format_check)
        
        self.yaml_flag_label = QLabel(self.loc['labels']['select_flag'])
        self.ui_labels['yaml_flag'] = self.yaml_flag_label
        yaml_layout.addWidget(self.yaml_flag_label)
        
        self.yaml_flag_combo = QComboBox()
        self._populate_yaml_flags()
        yaml_layout.addWidget(self.yaml_flag_combo)
        yaml_layout.addStretch()
        layout.addLayout(yaml_layout)

        # --- Results and Buttons ---
        self.ui_labels['generated_result'] = QLabel(self.loc['labels']['generated_result'])
        layout.addWidget(self.ui_labels['generated_result'])
        self.iterator_output = QTextEdit()
        self.iterator_output.setReadOnly(True)
        self.iterator_output.setMinimumHeight(200)
        layout.addWidget(self.iterator_output)
        
        button_layout = QHBoxLayout()
        self.iterator_start_btn = QPushButton(self.loc['buttons']['start_iter'])
        self.iterator_start_btn.clicked.connect(self.start_iterator_processing)
        self.ui_buttons['start_iter'] = self.iterator_start_btn
        button_layout.addWidget(self.iterator_start_btn)
        
        self.iterator_export_btn = QPushButton(self.loc['buttons']['export_result'])
        self.iterator_export_btn.clicked.connect(self.export_iterator_results)
        self.ui_buttons['export_result'] = self.iterator_export_btn
        button_layout.addWidget(self.iterator_export_btn)
        
        self.iterator_add_to_backpack_btn = QPushButton(self.loc['buttons']['gen_write'])
        self.iterator_add_to_backpack_btn.clicked.connect(self.start_iterator_add_to_backpack)
        self.ui_buttons['gen_write'] = self.iterator_add_to_backpack_btn
        button_layout.addWidget(self.iterator_add_to_backpack_btn)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        self.iterator_status_label = QLabel(self.loc['labels']['status_ready'])
        self.ui_labels['iterator_status'] = self.iterator_status_label # Track status label
        layout.addWidget(self.iterator_status_label)

        main_layout.addWidget(self.ui_groups['iterator'])

    def _populate_yaml_flags(self):
        self.yaml_flag_combo.clear()
        flags = self.loc['flags']
        flag_values = [flags["1"], flags["3"], flags["5"], flags["17"], flags["33"], flags["65"], flags["129"]]
        self.yaml_flag_combo.addItems(flag_values)
        self.yaml_flag_combo.setCurrentText(flags["33"])

    def update_iterator_ui(self):
        is_skin = self.skin_mode_check.isChecked()
        is_combo = self.combination_mode_check.isChecked()
        is_yaml = self.yaml_format_check.isChecked()

        if self.sender() == self.skin_mode_check and is_skin:
            self.combination_mode_check.setChecked(False)
            is_combo = False
        if self.sender() == self.combination_mode_check and is_combo:
            self.skin_mode_check.setChecked(False)
            is_skin = False

        iterator_enabled = not is_combo
        self.iterator_start.setEnabled(iterator_enabled)
        self.iterator_end.setEnabled(iterator_enabled)

        special_format_enabled = not is_skin and not is_combo
        self.special_format_check.setEnabled(special_format_enabled)
        if not special_format_enabled:
            self.special_format_check.setChecked(False)
        
        self.special_format_options.setVisible(self.special_format_check.isChecked() and special_format_enabled)
        
        is_special_combo = self.special_combo_check.isChecked()
        self.ui_labels['special_combo_input'].setVisible(is_special_combo)
        self.special_combo_input.setVisible(is_special_combo)
        
        self.combination_options.setVisible(is_combo)
        
        self.yaml_flag_label.setVisible(is_yaml)
        self.yaml_flag_combo.setVisible(is_yaml)

        self.iterator_start_btn.setVisible(not is_yaml)
        self.iterator_add_to_backpack_btn.setVisible(is_yaml)

    def start_iterator_processing(self):
        params = self._get_iterator_params()
        self.iterator_start_btn.setEnabled(False)
        self.iterator_start_btn.setText(self.loc['buttons']['generating'])
        self.iterator_output.clear()
        self.iterator_status_label.setText(self.loc['labels']['status_generating'])
        self.iterator_requested.emit(params)

    def start_iterator_add_to_backpack(self):
        params = self._get_iterator_params()
        self.iterator_add_to_backpack_btn.setEnabled(False)
        self.iterator_add_to_backpack_btn.setText(self.loc['buttons']['gen_writing'])
        self.iterator_status_label.setText(self.loc['labels']['status_prepare'])
        self.iterator_add_to_backpack_requested.emit(params)

    def _get_iterator_params(self):
        return {
            "base_data": self.iterator_base.text(),
            "is_yaml": self.yaml_format_check.isChecked(),
            "yaml_flag": self.yaml_flag_combo.currentText().split(" ")[0],
            "is_special": self.special_format_check.isChecked(),
            "special_base": self.iterator_special_base.text(),
            "is_special_combo": self.special_combo_check.isChecked(),
            "special_combo_text": self.special_combo_input.text(),
            "is_skin": self.skin_mode_check.isChecked(),
            "is_combo": self.combination_mode_check.isChecked(),
            "start": self.iterator_start.text(),
            "end": self.iterator_end.text(),
            "combo_start": self.combination_start.text(),
            "combo_end": self.combination_end.text(),
            "combo_size": self.combination_size.text()
        }

    def update_iterator_status(self, message):
        self.iterator_status_label.setText(f"Status: {message}") # Simplified as message often comes localized or as data

    def finalize_iterator_processing(self, result_text):
        self.iterator_output.setText(result_text)
        self.iterator_start_btn.setEnabled(True)
        self.iterator_start_btn.setText(self.loc['buttons']['start_iter'])
        self.iterator_status_label.setText(self.loc['labels']['status_gen_complete'])

    def finalize_iterator_add_to_backpack(self, success, fail):
        self.iterator_add_to_backpack_btn.setEnabled(True)
        self.iterator_add_to_backpack_btn.setText(self.loc['buttons']['gen_write'])
        self.iterator_status_label.setText(self.loc['labels']['status_batch_add_complete'].format(success=success, fail=fail))

    def export_iterator_results(self):
        content = self.iterator_output.toPlainText()
        if not content:
            QMessageBox.warning(self, self.loc['dialogs']['no_content'], self.loc['dialogs']['no_export'])
            return
        
        is_yaml = self.yaml_format_check.isChecked()
        ext = ".yaml" if is_yaml else ".txt"
        title = self.loc['dialogs']['export_yaml'] if is_yaml else self.loc['dialogs']['export_txt_title']
        
        filepath, _ = QFileDialog.getSaveFileName(self, title, "", f"{title}(*{ext});;All Files (*)")
        if filepath:
            if not is_yaml:
                reply = QMessageBox.question(self, self.loc['dialogs']['export_opts'], self.loc['dialogs']['only_base85'], 
                                             QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No | QMessageBox.StandardButton.Cancel)
                if reply == QMessageBox.StandardButton.Cancel:
                    return
                if reply == QMessageBox.StandardButton.Yes:
                    content = '\n'.join([line.split('-->')[1].strip() for line in content.strip().split('\n') if '-->' in line])
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                QMessageBox.information(self, self.loc['dialogs']['success'], self.loc['dialogs']['export_success'].format(path=filepath))
            except Exception as e:
                QMessageBox.critical(self, self.loc['dialogs']['export_fail'], self.loc['dialogs']['write_fail'].format(error=e))
    
    def _load_localization(self):
        filename = resource_loader.get_ui_localization_file(self.current_lang)
        data = resource_loader.load_json_resource(filename)
        if data and "converter_tab" in data:
            self.loc = data["converter_tab"]
        else:
            # Fallback
            self.loc = {
                "groups": {"single": "Single", "batch": "Batch", "batch_add": "Batch Add", "iterator": "Iterator"},
                "labels": {"base85": "Base85:", "deserialize": "Deserialize:", "translate_input": "Base85 or Deserialized Code", "part_explanations": "Part list (with quantities)",
                           "status_ready": "Ready", "input_batch": "Input:", "output": "Output:", 
                           "status_processing": "Processing...", "status_error": "Error: {error}", "status_success": "Success!", "status_critical": "Critical Error: {error}",
                           "status_empty": "Empty input.", "status_progress": "Processing {current}/{total}...", "status_complete": "Complete!", "input_batch_add": "Input:",
                           "select_flag": "Flag:", "status_prepare": "Preparing...", "status_batch_add_progress": "Progress: {current}/{total}", "status_batch_add_complete": "Complete",
                           "base_data": "Base Data:", "iter_start": "Start:", "iter_end": "End:", "special_base": "Special Base:", "combo_start": "Combo Start:", "combo_end": "Combo End:",
                           "combo_size": "Size:", "generated_result": "Result:", "special_combo_input": "Combo Input:", "status_generating": "Generating...", "status_gen_complete": "Generation Complete!"},
                "placeholders": {"base85": "Enter Base85...", "deserialize": "Enter deserialized...", "translate_input": "Paste Base85 or deserialized code...", "part_list": "Translated parts will appear here."},
                "buttons": {"clear": "Clear", "translate": "Translate Code", "export_txt": "Export .txt", "start_batch": "Start Batch", "batch_add": "Batch Add", "adding": "Adding...", "processing": "Processing...",
                            "start_iter": "Start Iterator", "export_result": "Export Result", "gen_write": "Generate & Write", "generating": "Generating...", "gen_writing": "Writing..."},
                "checkboxes": {"special_format": "Special Format", "skin_mode": "Skin Mode", "combo_mode": "Combo Mode", "special_combo": "Special Combo", "yaml_format": "YAML Format"},
                "flags": {"1": "1", "3": "3", "5": "5", "17": "17", "33": "33", "65": "65", "129": "129"},
                "dialogs": {"no_content": "No content", "no_export": "Nothing to export", "export_batch_title": "Export", "success": "Success", "export_success": "Saved to {path}", "export_fail": "Failed",
                            "write_fail": "Write failed: {error}", "no_input": "No input", "batch_add_empty": "Input empty", "export_yaml": "Export YAML", "export_txt_title": "Export TXT",
                            "export_opts": "Options", "only_base85": "Base85 only?"}
            }

    def update_language(self, lang):
        print(f"DEBUG: Updating language for {self.__class__.__name__} to {lang}...")
        self.current_lang = lang
        self._load_localization()
        
        # Groups
        self.ui_groups['single'].setTitle(self.loc['groups']['single'])
        self.ui_groups['batch'].setTitle(self.loc['groups']['batch'])
        self.ui_groups['batch_add'].setTitle(self.loc['groups']['batch_add'])
        self.ui_groups['iterator'].setTitle(self.loc['groups']['iterator'])
        
        # Labels
        if 'translate_input' in self.ui_labels:
            self.ui_labels['translate_input'].setText(self.loc.get('labels', {}).get('translate_input', 'Base85 or Deserialized Code'))
        if 'part_list' in self.ui_labels:
            self.ui_labels['part_list'].setText(self.loc.get('labels', {}).get('part_explanations', 'Part list (with quantities)'))
        self.ui_labels['input_batch'].setText(self.loc['labels']['input_batch'])
        self.ui_labels['output'].setText(self.loc['labels']['output'])
        self.ui_labels['input_batch_add'].setText(self.loc['labels']['input_batch_add'])
        self.ui_labels['select_flag'].setText(self.loc['labels']['select_flag'])
        self.ui_labels['base_data'].setText(self.loc['labels']['base_data'])
        self.ui_labels['iter_start'].setText(self.loc['labels']['iter_start'])
        self.ui_labels['iter_end'].setText(self.loc['labels']['iter_end'])
        self.ui_labels['special_base'].setText(self.loc['labels']['special_base'])
        self.ui_labels['combo_start'].setText(self.loc['labels']['combo_start'])
        self.ui_labels['combo_end'].setText(self.loc['labels']['combo_end'])
        self.ui_labels['combo_size'].setText(self.loc['labels']['combo_size'])
        self.ui_labels['yaml_flag'].setText(self.loc['labels']['select_flag'])
        self.ui_labels['generated_result'].setText(self.loc['labels']['generated_result'])
        self.ui_labels['special_combo_input'].setText(self.loc['labels']['special_combo_input'])
        
        # Update status labels to "Ready" or localized equivalent of their current state if simple
        for key in ['single_status', 'batch_status', 'batch_add_status', 'iterator_status']:
            if key in self.ui_labels:
                self.ui_labels[key].setText(self.loc['labels']['status_ready'])

        # Placeholders
        if 'translate_input' in self.ui_placeholders:
            self.ui_placeholders['translate_input'].setPlaceholderText(self.loc.get('placeholders', {}).get('translate_input', 'Paste Base85 or deserialized code...'))
        # Buttons
        self.ui_buttons['clear'].setText(self.loc['buttons']['clear'])
        if hasattr(self, 'translate_btn'):
            self.translate_btn.setText(self.loc.get('buttons', {}).get('translate', 'Translate Code'))
        self.ui_buttons['export_txt'].setText(self.loc['buttons']['export_txt'])
        self.ui_buttons['start_batch'].setText(self.loc['buttons']['start_batch'])
        self.ui_buttons['batch_add'].setText(self.loc['buttons']['batch_add'])
        self.ui_buttons['start_iter'].setText(self.loc['buttons']['start_iter'])
        self.ui_buttons['export_result'].setText(self.loc['buttons']['export_result'])
        self.ui_buttons['gen_write'].setText(self.loc['buttons']['gen_write'])
        
        # Checkboxes
        self.ui_checkboxes['special_format'].setText(self.loc['checkboxes']['special_format'])
        self.ui_checkboxes['special_combo'].setText(self.loc['checkboxes']['special_combo'])
        self.ui_checkboxes['skin_mode'].setText(self.loc['checkboxes']['skin_mode'])
        self.ui_checkboxes['combo_mode'].setText(self.loc['checkboxes']['combo_mode'])
        self.ui_checkboxes['yaml_format'].setText(self.loc['checkboxes']['yaml_format'])
        
        # Combo boxes (refresh items)
        self._populate_batch_flags()
        self._populate_yaml_flags()
        print(f"DEBUG: Finished updating language for {self.__class__.__name__}.")
