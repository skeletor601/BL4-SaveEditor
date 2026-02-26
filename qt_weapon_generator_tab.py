import random
import re
import json
import pandas as pd
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QLineEdit,
    QApplication,
    QComboBox, QPushButton, QMessageBox, QScrollArea, QFrame, QGroupBox, QDialog, QSizePolicy
)
from qt_autogrow_textedit import AutoGrowPlainTextEdit
from PyQt6.QtCore import pyqtSignal, Qt, QEvent
from PyQt6.QtGui import QPixmap

import resource_loader
import b_encoder

class QtWeaponGeneratorTab(QWidget):
    # 自定义信号，当用户点击“添加到背包”时发射
    # 参数： serial (str), flag (str)
    add_to_backpack_requested = pyqtSignal(str, str)
    community_db_updated = pyqtSignal(str)

    _NONE_VALUE = "None"
    
    PART_LAYOUT = {
        "Rarity": (0, 0), "Legendary Type": (0, 1),
        "Element 1": (1, 0), "Element 2": (1, 1),
        "Body": (2, 0), "Body Accessory": (2, 1),
        "Barrel": (3, 0), "Barrel Accessory": (3, 1),
        "Magazine": (4, 0), "Stat Modifier": (4, 1),
        "Grip": (5, 0), "Foregrip": (5, 1),
        "Manufacturer Part": (6, 0), "Scope": (6, 1),
        "Scope Accessory": (7, 0), "Underbarrel": (7, 1),
        "Underbarrel Accessory": (8, 0)
    }
    MULTI_SELECT_SLOTS = {
        "Body Accessory": 4, "Barrel Accessory": 4, 
        "Manufacturer Part": 4, "Scope Accessory": 4,
        "Underbarrel Accessory": 3
    }

    def __init__(self, parent=None):
        super().__init__(parent)
        self.all_weapon_parts_df = None
        self.elemental_df = None
        self.weapon_rarity_df = None
        self.weapon_localization = None
        self.part_combos = {}
        self.legendary_frame = None # Initialize to None
        self.current_lang = 'en-US'

        # Curated God Roll presets (loaded from godrolls.json)
        self.godrolls = []
        
        # Main layout holds the content widget
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.content_widget = None

        self.load_data(self.current_lang)
        self._load_godrolls()
        self.create_widgets()

    def _load_godrolls(self):
        """Load curated God Roll presets from godrolls.json.

        File format:
            [ {"name": "Convergence", "decoded": "...|"}, ... ]
        """
        try:
            data = resource_loader.load_json_resource('godrolls.json')
            if not isinstance(data, list):
                self.godrolls = []
                return
            cleaned = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                name = str(item.get('name', '')).strip()
                decoded = str(item.get('decoded', '')).strip()
                if not name or not decoded:
                    continue
                cleaned.append({'name': name, 'decoded': decoded})
            self.godrolls = cleaned
        except Exception:
            # Keep app stable if file missing/malformed
            self.godrolls = []

    def load_data(self, lang='en-US'):
        try:
            suffix = "_EN" if lang in ['en-US', 'ru', 'ua'] else ""
            
            # Helper to get path with fallback (raises if neither exists)
            def get_path(base_name):
                name_with_suffix = base_name.replace('.csv', f'{suffix}.csv')
                path = resource_loader.get_weapon_data_path(name_with_suffix)
                if path and path.exists():
                    return path
                fallback = resource_loader.get_weapon_data_path(base_name)
                if fallback and fallback.exists():
                    return fallback
                raise FileNotFoundError(
                    f"weapon_edit/{base_name} (or {name_with_suffix}) not found. "
                    "Use Master Search tab → Check for DB updates to refresh community data."
                )

            paths = {
                "all_parts": get_path('all_weapon_part.csv'),
                "elemental": get_path('elemental.csv'),
                "rarity": get_path('weapon_rarity.csv')
            }

            self.all_weapon_parts_df = pd.read_csv(paths["all_parts"])
            self.all_weapon_parts_df['Part ID'] = self.all_weapon_parts_df['Part ID'].astype('Int64').astype(str).replace('<NA>', '')
            self.elemental_df = pd.read_csv(paths["elemental"])
            self.weapon_rarity_df = pd.read_csv(paths["rarity"])
            
            self.weapon_localization = {}
            if lang == 'zh-CN':
                self.weapon_localization = resource_loader.load_weapon_json('weapon_localization_zh-CN.json') or {}
            
            loc_file = resource_loader.get_ui_localization_file(lang)
            full_loc = resource_loader.load_json_resource(loc_file) or {}
            self.ui_loc = full_loc.get("weapon_gen_tab", {})
            self.flags_loc = full_loc.get("weapon_editor_tab", {}).get("flags", {})

        except Exception as e:
            self._handle_error(f"Error loading data: {e}")

    def update_language(self, lang):
        print(f"DEBUG: Updating language for {self.__class__.__name__} to {lang}...")
        self.current_lang = lang
        self.load_data(lang)
        
        # Save state
        current_mfg_idx = self.manufacturer_combo.currentIndex() if hasattr(self, 'manufacturer_combo') else 0
        current_wt_idx = self.weapon_type_combo.currentIndex() if hasattr(self, 'weapon_type_combo') else 0
        current_level = self.level_var.text() if hasattr(self, 'level_var') else "50"
        current_seed = self.seed_var.text() if hasattr(self, 'seed_var') else ""
        
        # Clean up internal references
        self.part_combos = {}
        self.legendary_frame = None
        
        self.create_widgets()
        
        # Restore state
        if hasattr(self, 'manufacturer_combo') and self.manufacturer_combo.count() > current_mfg_idx:
            self.manufacturer_combo.setCurrentIndex(current_mfg_idx)
        if hasattr(self, 'weapon_type_combo') and self.weapon_type_combo.count() > current_wt_idx:
            self.weapon_type_combo.setCurrentIndex(current_wt_idx)
        if hasattr(self, 'level_var'): self.level_var.setText(current_level)
        if hasattr(self, 'seed_var') and current_seed: self.seed_var.setText(current_seed)
        print(f"DEBUG: Finished updating language for {self.__class__.__name__}.")

    def get_localized_string(self, key, default=''):
        if self.ui_loc:
            if key in self.ui_loc.get('labels', {}): return self.ui_loc['labels'][key]
            if key in self.ui_loc.get('buttons', {}): return self.ui_loc['buttons'][key]
            if key in self.ui_loc.get('dialogs', {}): return self.ui_loc['dialogs'][key]
        return self.weapon_localization.get(str(key), default or str(key))

    def _handle_error(self, message):
        err_title = self.ui_loc.get('dialogs', {}).get('error_title', "Error") if self.ui_loc else "Error"
        error_label = QLabel(f"{err_title}: {message}")
        error_label.setStyleSheet("color: red;")
        error_label.setWordWrap(True)
        
        # 清空现有布局并显示Error
        for i in reversed(range(self.layout().count())): 
            self.layout().itemAt(i).widget().setParent(None)
        self.layout().addWidget(error_label)


    def create_widgets(self):
        # Clean up old content
        if self.content_widget:
            self.main_layout.removeWidget(self.content_widget)
            self.content_widget.deleteLater()
            self.content_widget = None

        if self.all_weapon_parts_df is None: 
            return

        # Create new content widget
        self.content_widget = QWidget()
        main_layout = QVBoxLayout(self.content_widget)
        self.main_layout.addWidget(self.content_widget)

        # --- 输出框 ---
        output_frame = QFrame(self.content_widget); output_frame.setLayout(QGridLayout())
        self.serial_decoded_entry = AutoGrowPlainTextEdit(min_lines=6, max_lines=24); self.serial_decoded_entry.setReadOnly(True)
        self.serial_b85_entry = AutoGrowPlainTextEdit(min_lines=5, max_lines=18); self.serial_b85_entry.setReadOnly(True)
        output_frame.layout().addWidget(QLabel(self.get_localized_string("serial_decoded")), 0, 0)
        output_frame.layout().addWidget(self.serial_decoded_entry, 0, 1)
        output_frame.layout().addWidget(QLabel(self.get_localized_string("serial_b85")), 1, 0)
        output_frame.layout().addWidget(self.serial_b85_entry, 1, 1)
        main_layout.addWidget(output_frame)
        # --- Skin selector (Scarlett-style preview) ---
        self.skins2 = self._load_skins2_from_scarlett()

        skin_box = QGroupBox("Skin")
        skin_box.setStyleSheet("QGroupBox{font-weight:600;}")
        skin_layout = QVBoxLayout(skin_box)
        top_row = QHBoxLayout()

        self.skin_combo = QComboBox()
        self.skin_combo.setMinimumWidth(260)
        self.skin_combo.addItem(self._NONE_VALUE, None)
        for label, token in self.skins2:
            self.skin_combo.addItem(label, token)

        self.copy_skin_btn = QPushButton("Copy skin")
        self.copy_token_btn = QPushButton("Copy token")
        self.paste_skin_btn = QPushButton("Paste into Deserialize")

        top_row.addWidget(QLabel("Skin:"))
        top_row.addWidget(self.skin_combo, 1)
        top_row.addWidget(self.copy_skin_btn)
        top_row.addWidget(self.copy_token_btn)
        top_row.addWidget(self.paste_skin_btn)
        skin_layout.addLayout(top_row)

        # Preview frame
        self.skin_preview_frame = QFrame()
        self.skin_preview_frame.setVisible(False)
        prev_l = QHBoxLayout(self.skin_preview_frame)
        prev_l.setContentsMargins(0, 0, 0, 0)

        self.skin_preview_label = QLabel()
        self.skin_preview_label.setFixedSize(240, 120)
        self.skin_preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.skin_preview_label.setStyleSheet(
            "QLabel{border:1px solid rgba(0,255,255,110); border-radius:10px; background: rgba(10,10,16,120);}"
            "QLabel:hover{border:1px solid rgba(255,0,200,180);}"
        )

        meta_col = QVBoxLayout()
        self.skin_preview_name = QLabel("")
        self.skin_preview_name.setStyleSheet("font-weight:600;")
        self.skin_preview_token = QLabel("")
        self.skin_preview_token.setStyleSheet("color: rgba(180,180,200,200);")
        hint = QLabel("Tip: images live in master_search/skin_images/<token>.png")
        hint.setStyleSheet("color: rgba(140,140,160,180); font-size: 11px;")
        meta_col.addWidget(self.skin_preview_name)
        meta_col.addWidget(self.skin_preview_token)
        meta_col.addWidget(hint)
        meta_col.addStretch(1)

        prev_l.addWidget(self.skin_preview_label)
        prev_l.addLayout(meta_col, 1)

        skin_layout.addWidget(self.skin_preview_frame)

        # Wire skin actions
        self.skin_combo.currentIndexChanged.connect(lambda *_: self._update_skin_preview())

        def _copy_to_clipboard(text_to_copy: str):
            cb = QApplication.clipboard()
            cb.setText(text_to_copy)

        self.copy_skin_btn.clicked.connect(lambda: _copy_to_clipboard(self._formatted_skin_code(self.skin_combo.currentData()) if self.skin_combo.currentData() else ""))
        self.copy_token_btn.clicked.connect(lambda: _copy_to_clipboard(self.skin_combo.currentData() or ""))

        self.paste_skin_btn.clicked.connect(lambda: self._append_skin_to_decoded(self.skin_combo.currentData()) if self.skin_combo.currentData() else None)

        # Click preview to open lightbox
        self.skin_preview_label.installEventFilter(self)
        self.skin_preview_label.mousePressEvent = lambda ev: self._open_skin_lightbox()  # type: ignore

        
        # --- 控制区 ---
        controls_frame = QFrame(self); controls_frame.setLayout(QHBoxLayout())
        self.manufacturer_combo = QComboBox()
        self.weapon_type_combo = QComboBox()
        controls_frame.layout().addWidget(QLabel(self.get_localized_string("manufacturer")))
        controls_frame.layout().addWidget(self.manufacturer_combo)
        controls_frame.layout().addWidget(QLabel(self.get_localized_string("weapon_type")))
        controls_frame.layout().addWidget(self.weapon_type_combo)

        self.level_var = QLineEdit("50")
        self.seed_var = QLineEdit(str(random.randint(100, 9999)))
        random_seed_btn = QPushButton("🎲"); random_seed_btn.setFixedWidth(30)
        controls_frame.layout().addWidget(QLabel(self.get_localized_string("level")))
        controls_frame.layout().addWidget(self.level_var)
        controls_frame.layout().addWidget(QLabel(self.get_localized_string("seed")))
        controls_frame.layout().addWidget(self.seed_var)
        controls_frame.layout().addWidget(random_seed_btn)
        main_layout.addWidget(controls_frame)

        # --- 部件选择 ---
        self.parts_scroll_area = QScrollArea()
        self.parts_scroll_area.setWidgetResizable(True)
        self.parts_frame = QWidget()
        self.parts_layout = QGridLayout(self.parts_frame)
        self.parts_scroll_area.setWidget(self.parts_frame)
        main_layout.addWidget(self.parts_scroll_area)

        # --- 底部操作区 ---
        action_frame = QFrame(self); action_frame.setLayout(QHBoxLayout())
        self.flag_combo = QComboBox()
        if self.flags_loc:
            flag_values = [self.flags_loc.get(k, f"{k} (Unknown)") for k in ["1", "3", "5", "17", "33", "65", "129"]]
            self.flag_combo.addItems(flag_values)
            default_flag = self.flags_loc.get("3", "3 (Favorite)")
            self.flag_combo.setCurrentText(default_flag)
        else:
            flag_values = ["1 (普通)", "3 (Favorite)", "5 (Junk)", "17 (Group1)", "33 (Group2)", "65 (Group3)", "129 (Group4)"]
            self.flag_combo.addItems(flag_values)
            self.flag_combo.setCurrentText("3 (Favorite)")
            
        add_to_backpack_btn = QPushButton(self.get_localized_string("add_to_backpack"))
        godroller_btn = QPushButton("God Roller")
        check_updates_btn = QPushButton("Check for Updates")
        check_updates_btn.setToolTip("Check community Google Sheets for new/updated parts and refresh Scarlett DB")
        godroller_btn.setToolTip("Pick a curated God Roll preset (from godrolls.json) and add it to your backpack")
        action_frame.layout().addWidget(QLabel(self.get_localized_string("select_flag")))
        action_frame.layout().addWidget(self.flag_combo)
        action_frame.layout().addWidget(godroller_btn)
        action_frame.layout().addWidget(check_updates_btn)
        action_frame.layout().addStretch()
        action_frame.layout().addWidget(add_to_backpack_btn)
        main_layout.addWidget(action_frame)

        # --- Skin selector (Scarlett-style preview) - placed at bottom to avoid UI builder overwrite ---
        main_layout.addWidget(skin_box)

        # --- 连接信号 ---
        self.manufacturer_combo.currentTextChanged.connect(self.on_main_selection_change)
        self.weapon_type_combo.currentTextChanged.connect(self.on_main_selection_change)
        self.level_var.textChanged.connect(self.generate_weapon)
        self.seed_var.textChanged.connect(self.generate_weapon)
        random_seed_btn.clicked.connect(self.randomize_seed)
        add_to_backpack_btn.clicked.connect(self._on_add_to_backpack)
        godroller_btn.clicked.connect(self._open_godroller_dialog)
        check_updates_btn.clicked.connect(self._on_check_db_updates)
        
        self._populate_initial_selectors()
        self.on_main_selection_change()

    def _populate_initial_selectors(self):
        m_list = sorted([self.get_localized_string(m) for m in self.all_weapon_parts_df['Manufacturer'].unique()])
        self.manufacturer_combo.addItems(m_list)
        wt_list = sorted([self.get_localized_string(wt) for wt in self.all_weapon_parts_df['Weapon Type'].unique()])
        self.weapon_type_combo.addItems(wt_list)

    def on_main_selection_change(self, _=None):
        self._create_part_dropdowns()
        self.generate_weapon()

    def _get_m_id(self, mfg_en, wt_en):
        if not mfg_en or not wt_en: return None
        try:
            return self.all_weapon_parts_df.loc[
                (self.all_weapon_parts_df['Manufacturer'] == mfg_en) & 
                (self.all_weapon_parts_df['Weapon Type'] == wt_en), 'Manufacturer & Weapon Type ID'
            ].iloc[0]
        except IndexError:
            return None

    def _create_part_dropdowns(self):
        # 清理旧的 widgets
        while self.parts_layout.count():
            child = self.parts_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
        self.part_combos = {}
        # IMPORTANT: Clear reference to the deleted widget to prevent crash if signal handlers traverse it
        self.legendary_frame = None
        
        selected_mfg_en = self._get_english_key(self.manufacturer_combo.currentText())
        selected_wt_en = self._get_english_key(self.weapon_type_combo.currentText())

        m_id = self._get_m_id(selected_mfg_en, selected_wt_en)
        if m_id is None: return

        self._create_special_dropdown("Rarity", m_id, self.PART_LAYOUT["Rarity"])
        self._create_special_dropdown("Legendary Type", m_id, self.PART_LAYOUT["Legendary Type"])
        
        # 元素是单选，不是下拉框
        for i, name in enumerate(["Element 1", "Element 2"]):
            self._create_element_selector(name, m_id, self.PART_LAYOUT[name])

        filtered_df = self.all_weapon_parts_df[self.all_weapon_parts_df['Manufacturer & Weapon Type ID'] == m_id]
        for part_type_en, group_df in filtered_df.groupby('Part Type'):
            # "Rarity" is handled by _create_special_dropdown above.
            # If the parts CSV also contains a "Rarity" Part Type (as it does in our merged datasets),
            # this loop would create a *second* Rarity dropdown in the same grid cell.
            # That duplicate dropdown can contain long, wrapped strings and will NOT drive
            # the generator logic correctly. So we explicitly skip it here.
            if part_type_en == "Rarity":
                continue
            if part_type_en not in self.PART_LAYOUT: continue
            
            row, col = self.PART_LAYOUT[part_type_en]
            
            group_box = QGroupBox(self.get_localized_string(part_type_en))
            group_layout = QVBoxLayout(group_box)
            
            values = [self.get_localized_string(self._NONE_VALUE)] + \
                     [f"{pid} - {stat}" if pd.notna(stat) else str(pid)
                      for pid, stat in zip(group_df['Part ID'], group_df['Stat']) if pid]

            num_slots = self.MULTI_SELECT_SLOTS.get(part_type_en, 1)
            for i in range(num_slots):
                if num_slots > 1:
                    # For multi-select, we can use a smaller label
                    pass
                combo = QComboBox()
                combo.addItems(values)
                # Add to dict BEFORE connecting signals
                self.part_combos[f"{part_type_en}_{i}"] = combo
                combo.currentTextChanged.connect(self.generate_weapon)
                
                group_layout.addWidget(combo)
            
            self.parts_layout.addWidget(group_box, row, col, Qt.AlignmentFlag.AlignTop)
        
        self.generate_weapon()

    def _create_special_dropdown(self, name, m_id, position):
        row, col = position
        
        group_box = QGroupBox(self.get_localized_string(name.replace(" ", "")))
        group_layout = QVBoxLayout(group_box)
        
        if name == "Legendary Type": self.legendary_frame = group_box

        combo = QComboBox()
        
        values = [self.get_localized_string(self._NONE_VALUE)]
        if name == "Rarity":
            df = self.weapon_rarity_df[self.weapon_rarity_df['Manufacturer & Weapon Type ID'] == m_id]
            values.extend(sorted([self.get_localized_string(r) for r in df['Stat'].unique()]))
        elif name == "Legendary Type":
            leg_df = self.weapon_rarity_df[(self.weapon_rarity_df['Manufacturer & Weapon Type ID'] == m_id) & (self.weapon_rarity_df['Stat'] == 'Legendary')]
            values.extend([f"{r['Part ID']} - {self.get_localized_string(r['Description'], r['Description'])}" for _, r in leg_df.iterrows() if pd.notna(r['Description'])])
        
        # Add to dict BEFORE connecting signals
        self.part_combos[name] = combo
        
        combo.addItems(values)
        
        # Connect signals AFTER adding items to avoid triggering on startup with incomplete state or recursive calls
        if name == "Rarity":
             combo.currentTextChanged.connect(self._on_rarity_change)
        elif name == "Legendary Type":
             # usually Legendaries selection also triggers regen
             combo.currentTextChanged.connect(self.generate_weapon)
        
        group_layout.addWidget(combo)
        self.parts_layout.addWidget(group_box, row, col, Qt.AlignmentFlag.AlignTop)
        
        if name == "Legendary Type": group_box.hide()

    def _create_element_selector(self, name, m_id, position):
        row, col = position
        group_box = QGroupBox(self.get_localized_string(name.replace(" ", "")))
        group_layout = QVBoxLayout(group_box)

        combo = QComboBox()
        none_val = self.get_localized_string(self._NONE_VALUE)
        values = [none_val] + [f"{r['Part_ID']} - {self.get_localized_string(r['Stat'])}" for _, r in self.elemental_df.iterrows()]
        combo.addItems(values)
        
        self.part_combos[name] = combo
        combo.currentTextChanged.connect(self.generate_weapon)

        group_layout.addWidget(combo)
        self.parts_layout.addWidget(group_box, row, col, Qt.AlignmentFlag.AlignTop)

    def _on_rarity_change(self, choice):
        is_legendary = self._get_english_key(choice) == "Legendary"
        # Check if legendary_frame exists AND is still a valid object (not None)
        if hasattr(self, 'legendary_frame') and self.legendary_frame:
            self.legendary_frame.setVisible(is_legendary)
        
        if not is_legendary and "Legendary Type" in self.part_combos:
            # Safely reset Legendary selection
            self.part_combos["Legendary Type"].blockSignals(True)
            self.part_combos["Legendary Type"].setCurrentText(self.get_localized_string(self._NONE_VALUE))
            self.part_combos["Legendary Type"].blockSignals(False)
            
        self.generate_weapon()

    def _get_english_key(self, localized_value):
        if not localized_value or not self.weapon_localization: return localized_value
        reverse_map = {v: k for k, v in self.weapon_localization.items()}
        return reverse_map.get(localized_value, localized_value)

    # --- Skin utilities (shared with Scarlett skin preview) ---
    def _load_skins_from_item_editor_html(self):
        """Load skin list from master_search/db/Borderlands Item Editor and Save Editor.html.
        Returns list of (display_name, token) e.g. ('Itty Bitty Kitty Committee - CuteCat', 'Cosmetics_Weapon_Mat07_CuteCat').
        """
        try:
            path = resource_loader.get_resource_path("master_search/db/Borderlands Item Editor and Save Editor.html")
            if not path or not path.exists():
                return []
            html = path.read_text(encoding="utf-8", errors="ignore")
            # Match <option value="Cosmetics_Weapon_...">Display Name</option>
            pattern = re.compile(
                r'<option\s+value="(Cosmetics_Weapon_[^"]+)"[^>]*>([^<]+)</option>',
                re.IGNORECASE
            )
            skins = []
            for m in pattern.finditer(html):
                token = m.group(1).strip()
                label = m.group(2).strip()
                if token and label:
                    skins.append((label, token))
            return skins
        except Exception:
            return []

    def _load_skins2_from_scarlett(self):
        """Load skin list for dropdown in this order:
        1) Static JSON (master_search/db/weapon_skins.json) – shipped with app.
        2) Borderlands Item Editor HTML (dev convenience).
        3) SKINS2 array from scarlett.html (legacy fallback).
        """
        # 1) Preferred: static JSON so the app works without HTML.
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

        # 2) Dev-only: parse directly from the HTML item editor if present.
        skins = self._load_skins_from_item_editor_html()
        if skins:
            return skins

        # 3) Legacy: SKINS2 from scarlett.html.
        try:
            scarlett_path = resource_loader.get_resource_path("master_search/scarlett.html")
            if not scarlett_path.exists():
                return []
            html = scarlett_path.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"const\s+SKINS2\s*=\s*(\[.*?\])\s*;", html, re.S)
            if not m:
                return []
            arr = json.loads(m.group(1))
            skins = []
            for it in arr:
                val = (it.get("value") or "").strip()
                lab = (it.get("label") or val).strip()
                if val:
                    skins.append((lab, val))
            return skins
        except Exception:
            return []

    def _skin_image_path(self, token: str):
        return resource_loader.get_resource_path(f"master_search/skin_images/{token}.png")

    def _formatted_skin_code(self, token: str) -> str:
        # IMPORTANT: The decoder/encoder used by NeonVault (bl4_decoder_py.from_string)
        # does NOT accept the semicolon-delimited form ("c"; token |) that some
        # external tools/webpages use.
        #
        # from_string expects comma-separated blocks, and cosmetic token values must be
        # quoted as a string literal.
        # Example: "c", "Cosmetics_Weapon_Mat02_LavaRock" |
        safe = (token or "").strip().replace('"', '\\"')
        return f'"c", "{safe}" |'

    def _append_skin_to_decoded(self, token: str):
        """Append formatted skin code to the END of the decoded serial, then re-encode Base85."""
        try:
            decoded = (self.serial_decoded_entry.toPlainText() or "").strip()
            if not decoded:
                # If nothing yet, still allow user to copy code; warn for append
                QMessageBox.warning(self, "No weapon generated", "Generate a weapon first, then apply a skin.")
                return

            formatted = self._formatted_skin_code(token)
            # Append AFTER the final delimiter pipe (|), keeping existing structure.
            # We preserve the last '|' so the skin segment becomes its own token block:
            #   ... |  ->  ... | "c", "Cosmetics_Weapon_..." |
            if "|" in decoded:
                last = decoded.rfind("|")
                base = decoded[:last+1].rstrip()  # keep the pipe itself
                new_decoded = f"{base} {formatted}"
            else:
                # No pipe found; ensure one delimiter before appending
                base = decoded.rstrip()
                if not base.endswith("|"):
                    base = f"{base} |"
                new_decoded = f"{base} {formatted}"

            encoded_serial, err = b_encoder.encode_to_base85(new_decoded)
            if err:
                raise ValueError(err)

            self.serial_decoded_entry.setPlainText(new_decoded)
            self.serial_b85_entry.setPlainText(encoded_serial)
        except Exception as e:
            QMessageBox.warning(self, "Skin apply failed", f"Could not apply skin: {e}")

    def _update_skin_preview(self):
        token = getattr(self, "skin_combo", None).currentData() if getattr(self, "skin_combo", None) else None
        if not token:
            self.skin_preview_frame.setVisible(False)
            return

        img_path = self._skin_image_path(token)
        if not img_path.exists():
            self.skin_preview_frame.setVisible(False)
            return

        pix = QPixmap(str(img_path))
        if pix.isNull():
            self.skin_preview_frame.setVisible(False)
            return

        # Fit preview area
        target_w = 220
        target_h = 110
        scaled = pix.scaled(target_w, target_h, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
        self._skin_pix_original = pix
        self._skin_pix_preview = scaled
        self.skin_preview_label.setPixmap(scaled)
        self.skin_preview_name.setText(self.skin_combo.currentText())
        self.skin_preview_token.setText(token)
        self.skin_preview_frame.setVisible(True)

    def _open_skin_lightbox(self):
        token = self.skin_combo.currentData()
        if not token:
            return
        img_path = self._skin_image_path(token)
        if not img_path.exists():
            return
        pix = QPixmap(str(img_path))
        if pix.isNull():
            return

        dlg = QDialog(self, Qt.WindowType.FramelessWindowHint | Qt.WindowType.Dialog)
        dlg.setModal(True)
        dlg.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        # Fullscreen overlay
        dlg.setStyleSheet("background-color: rgba(0,0,0,180);")
        lay = QVBoxLayout(dlg)
        lay.setContentsMargins(0, 0, 0, 0)

        inner = QFrame()
        inner.setStyleSheet(
            "QFrame{background: transparent;}"
            "QLabel{background: transparent;}"
        )
        inner_l = QVBoxLayout(inner)
        inner_l.setAlignment(Qt.AlignmentFlag.AlignCenter)

        img = QLabel()
        img.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Scale for screen
        screen = self.window().screen()
        geo = screen.availableGeometry()
        max_w = int(geo.width() * 0.82)
        max_h = int(geo.height() * 0.82)
        scaled = pix.scaled(max_w, max_h, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
        img.setPixmap(scaled)
        img.setStyleSheet(
            "QLabel{"
            "border-radius: 16px;"
            "padding: 12px;"
            "background-color: rgba(10,10,16,210);"
            "box-shadow: 0 0 25px rgba(0,255,255,120);"
            "border: 1px solid rgba(255,0,200,160);"
            "}"
        )

        hint = QLabel("Click anywhere or press ESC to close")
        hint.setStyleSheet("color: rgba(200,200,220,180); padding-top: 10px;")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)

        inner_l.addWidget(img)
        inner_l.addWidget(hint)
        lay.addWidget(inner)

        def close_on_click(_):
            dlg.accept()

        dlg.mousePressEvent = close_on_click  # type: ignore

        def keyPressEvent(ev):
            if ev.key() == Qt.Key.Key_Escape:
                dlg.accept()
            else:
                QDialog.keyPressEvent(dlg, ev)

        dlg.keyPressEvent = keyPressEvent  # type: ignore
        dlg.showFullScreen()

    def eventFilter(self, obj, event):
        # Hover enlarge for skin preview
        try:
            if obj is getattr(self, "skin_preview_label", None) and hasattr(self, "_skin_pix_original"):
                if event.type() == QEvent.Type.Enter:
                    pix = self._skin_pix_original
                    scaled = pix.scaled(280, 140, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                    self.skin_preview_label.setPixmap(scaled)
                    return True
                elif event.type() == QEvent.Type.Leave:
                    if hasattr(self, "_skin_pix_preview"):
                        self.skin_preview_label.setPixmap(self._skin_pix_preview)
                        return True
        except Exception:
            pass
        return super().eventFilter(obj, event)

    def randomize_seed(self):
        self.seed_var.setText(str(random.randint(100, 9999)))

    def generate_weapon(self, *args):
        try:
            mfg_en = self._get_english_key(self.manufacturer_combo.currentText())
            wt_en = self._get_english_key(self.weapon_type_combo.currentText())
            m_id = self._get_m_id(mfg_en, wt_en)
            if m_id is None: return

            level = self.level_var.text() if self.level_var.text().isdigit() else "50"
            seed = self.seed_var.text() if self.seed_var.text().isdigit() else str(random.randint(100, 9999))
            
            header = f"{m_id}, 0, 1, {level}| 2, {seed}||"
            parts_list = []
            
            localized_none = self.get_localized_string(self._NONE_VALUE)
            
            # Rarity / Legendary
            rarity_combo = self.part_combos.get("Rarity")
            is_legendary = self._get_english_key(rarity_combo.currentText()) == "Legendary" if rarity_combo else False

            if is_legendary:
                legendary_combo = self.part_combos.get("Legendary Type")
                if legendary_combo and legendary_combo.currentText() != localized_none:
                    part_id = legendary_combo.currentText().split(' - ')[0]
                    if part_id.isdigit(): parts_list.append(f"{{{part_id}}}")
            elif rarity_combo and rarity_combo.currentText() != localized_none:
                 selected_rarity_en = self._get_english_key(rarity_combo.currentText())
                 rarity_id_row = self.weapon_rarity_df[(self.weapon_rarity_df['Manufacturer & Weapon Type ID'] == m_id) & (self.weapon_rarity_df['Stat'] == selected_rarity_en) & (self.weapon_rarity_df['Description'].isna())]
                 if not rarity_id_row.empty: parts_list.append(f"{{{rarity_id_row.iloc[0]['Part ID']}}}")
            
            # Elements
            for i in range(1, 3):
                element_combo = self.part_combos.get(f"Element {i}")
                if element_combo and element_combo.currentText() != localized_none:
                    part_id = element_combo.currentText().split(' - ')[0]
                    if part_id.isdigit(): parts_list.append(f"{{1:{part_id}}}")
            
            # Other parts
            special_parts = {"Rarity", "Legendary Type", "Element 1", "Element 2"}
            for key, combo in self.part_combos.items():
                part_type_base = key.split('_')[0]
                if part_type_base in special_parts or key in special_parts: continue

                value = combo.currentText()
                if value != localized_none:
                    part_id = value.split(' - ')[0]
                    if part_id.isdigit(): parts_list.append(f"{{{part_id}}}")
            
            component_str = " ".join(parts_list)
            full_decoded_str = f"{header} {component_str} |"
            encoded_serial, err = b_encoder.encode_to_base85(full_decoded_str)
            if err: raise ValueError(f"编码失败: {err}")
            
            self.serial_decoded_entry.setPlainText(full_decoded_str)
            self.serial_b85_entry.setPlainText(encoded_serial)
        except Exception as e:
            # Maybe log this to a status bar in the future
            print(f"Weapon generation error: {e}")

    def _on_add_to_backpack(self):
        serial = self.serial_b85_entry.toPlainText()
        if not serial:
            QMessageBox.warning(self, self.ui_loc.get('dialogs', {}).get('no_serial_title', "无序列号"), 
                                self.ui_loc.get('dialogs', {}).get('gen_first', "请先生成一个武器。"))
            return
        
        flag = self.flag_combo.currentText().split(" ")[0]
        # 发射信号，让主窗口去处理
        self.add_to_backpack_requested.emit(serial, flag)

    
def _on_check_db_updates(self):
    """
    Downloads community-maintained Google Sheets (CSV export) and updates the local DB JSON
    used by Scarlett (Master Search). Stores last-check timestamp in QSettings.
    """
    try:
        from PyQt6.QtCore import QSettings
        from PyQt6.QtWidgets import QMessageBox
        import os

        project_root = os.path.dirname(os.path.abspath(__file__))

        from tools.community_db_updater import update_community_db
        res = update_community_db(project_root=project_root)

        # persist last check time
        settings = QSettings("NeonVault", "NeonVaultV2.69")
        settings.setValue("community_db/last_check_utc", res.message.split("Rows:")[0].strip())
        settings.setValue("community_db/last_check_epoch", int(__import__("time").time()))

        QMessageBox.information(self, "Community DB Update", res.message)

        # notify main window to reload master search webview if needed
        try:
            self.community_db_updated.emit(res.message)
        except Exception:
            pass

    except Exception as e:
        try:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "Community DB Update Failed", f"Could not update community DB:\n{e}")
        except Exception:
            pass

def _open_godroller_dialog(self):
        """God Roller: pick a curated weapon code and add it to backpack."""
        if not self.godrolls:
            QMessageBox.information(self, "God Roller", "No God Rolls found. Add entries to godrolls.json first.")
            return

        dlg = QDialog(self)
        dlg.setWindowTitle("Choose God Roll")
        dlg.setModal(True)

        layout = QVBoxLayout(dlg)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        info = QLabel("Choose God Roll")
        info.setWordWrap(True)
        layout.addWidget(info)

        combo = QComboBox()
        combo.addItems([g['name'] for g in self.godrolls])
        layout.addWidget(combo)

        btn_row = QHBoxLayout()
        btn_row.addStretch(1)
        cancel_btn = QPushButton("Cancel")
        add_btn = QPushButton("Add to Backpack")
        customize_btn = QPushButton("Customize God Roll")
        btn_row.addWidget(cancel_btn)
        btn_row.addWidget(add_btn)
        btn_row.addWidget(customize_btn)
        layout.addLayout(btn_row)

        cancel_btn.clicked.connect(dlg.reject)

        def _customize_selected():
            idx = combo.currentIndex()
            if idx < 0 or idx >= len(self.godrolls):
                return
            preset = self.godrolls[idx]
            name = preset.get('name', 'God Roll')
            decoded = preset.get('decoded', '')
            try:
                # Show in generator outputs (for visibility)
                self.serial_decoded_entry.setPlainText(decoded)
                encoded_serial, err = b_encoder.encode_to_base85(decoded)
                if err:
                    raise ValueError(err)
                self.serial_b85_entry.setPlainText(encoded_serial)

                mw = self.window()
                # Switch to Weapon Toolbox > Weapon Edit and paste into Deserialize
                if mw and hasattr(mw, "weapon_editor_tab") and hasattr(mw, "switch_to_section_and_sub"):
                    mw.switch_to_section_and_sub("weapon_toolbox", "weapon_edit")
                    we = getattr(mw, "weapon_editor_tab", None)
                    if we and hasattr(we, "serial_decoded_entry"):
                        we.serial_decoded_entry.setPlainText(decoded)
                        # ensure Base85 sync occurs via existing handlers
                dlg.accept()
            except Exception as e:
                QMessageBox.warning(self, "God Roller", f"Could not open God Roll in Weapon Edit: {e}")


        def _add_selected():
            idx = combo.currentIndex()
            if idx < 0 or idx >= len(self.godrolls):
                return
            preset = self.godrolls[idx]
            name = preset.get('name', 'God Roll')
            decoded = preset.get('decoded', '')

            res = QMessageBox.question(
                self,
                "Verify",
                f"Add '{name}' to your backpack?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            if res != QMessageBox.StandardButton.Yes:
                return

            try:
                encoded_serial, err = b_encoder.encode_to_base85(decoded)
                if err:
                    raise ValueError(err)

                # Show user what was added
                self.serial_decoded_entry.setPlainText(decoded)
                self.serial_b85_entry.setPlainText(encoded_serial)

                # Reuse the standard pipeline (respects selected flag)
                self._on_add_to_backpack()
                dlg.accept()
            except Exception as e:
                QMessageBox.warning(self, "God Roller", f"Could not add God Roll: {e}")

        add_btn.clicked.connect(_add_selected)
        customize_btn.clicked.connect(_customize_selected)
        dlg.exec()

# ------------------------------------------------------------------
# Bind helper functions as instance methods (fix missing attribute)
# ------------------------------------------------------------------
QtWeaponGeneratorTab._open_godroller_dialog = _open_godroller_dialog
QtWeaponGeneratorTab._on_check_db_updates = _on_check_db_updates
