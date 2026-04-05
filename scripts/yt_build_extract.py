"""Extract a BL4 build from a YouTube video transcript and output as AssembledBuild JSON."""
import sys, re, json

sys.stdout.reconfigure(encoding='utf-8')

video_id = sys.argv[1] if len(sys.argv) > 1 else ""
level = int(sys.argv[2]) if len(sys.argv) > 2 else 60

if not video_id:
    print(json.dumps({"error": "video_id required"}))
    sys.exit(1)

# ── Fetch transcript via proxy ──────────────────────────────────────────────
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig

proxy_url = "http://armlayfv-5:zbynutb929qy@p.webshare.io:80"
api = YouTubeTranscriptApi(
    proxy_config=GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
)

try:
    transcript = api.fetch(video_id)
    full_text = ' '.join([t.text for t in transcript])
except Exception as e:
    print(json.dumps({"error": f"Transcript fetch failed: {e}"}))
    sys.exit(1)

# ── Load DB ─────────────────────────────────────────────────────────────────
with open('master_search/db/universal_parts_db.json', 'r', encoding='utf-8') as f:
    db = json.load(f)
rows = db['rows']

# ── Load godrolls ───────────────────────────────────────────────────────────
try:
    with open('godrolls.json', 'r', encoding='utf-8') as f:
        godrolls = json.load(f)
except Exception:
    godrolls = []

def norm(s):
    return s.lower().replace(' ', '').replace("'", "").replace('-', '').replace('.', '')

def build_lookup(category, part_types, min_len=3):
    lookup = {}
    for r in rows:
        if r.get('category') != category:
            continue
        if part_types and r.get('partType') not in part_types:
            continue
        name = norm(r.get('partName', ''))
        if name and name not in ('legendary','common','uncommon','rare','epic','pearl','repkit') and len(name) >= min_len:
            lookup[name] = r
    return lookup

weapons = build_lookup('Weapon', ['Barrel', 'Rarity'])
shields_leg = build_lookup('Shield', ['Legendary Perk', 'Rarity'])
repkits_leg = build_lookup('Repkit', ['Legendary Perk', 'Rarity'], min_len=4)
class_mod_names = build_lookup('Class Mod', ['Name'])
firmware_lookup = {}
for r in rows:
    if r.get('partType') == 'Firmware':
        name = norm(r.get('partName', ''))
        if name and len(name) >= 4:
            firmware_lookup[name] = r

blacklist = {'amp','nova','fire','cryo','shock','tank','speed','order','common','rare',
             'epic','legendary','pearl','hunter','barrel','body','grip','scope','magazine',
             'skill','augment','the','model'}

def scan_text(text, lookup, extra_bl=None):
    bl = blacklist | (extra_bl or set())
    found = {}
    words = re.findall(r'[a-zA-Z0-9]+', text)
    for i in range(len(words)):
        for length in [1, 2, 3, 4]:
            if i + length > len(words):
                break
            phrase = norm(''.join(words[i:i+length]))
            if len(phrase) < 3 or phrase in bl:
                continue
            if phrase in lookup:
                r = lookup[phrase]
                key = r['code']
                if key not in found:
                    found[key] = r
    return list(found.values())

# ── Scan transcript ─────────────────────────────────────────────────────────
found_weapons = scan_text(full_text, weapons)
found_shields = scan_text(full_text, shields_leg)
found_repkits = scan_text(full_text, repkits_leg)
found_classmods = scan_text(full_text, class_mod_names)
found_firmware = scan_text(full_text, firmware_lookup)

# ── Detect character ────────────────────────────────────────────────────────
chars = {'vex': 0, 'rafa': 0, 'harlowe': 0, 'amon': 0, 'c4sh': 0}
text_lower = full_text.lower()
for c in chars:
    chars[c] = text_lower.count(c)
character = max(chars, key=chars.get)

# ── Detect crit knife ──────────────────────────────────────────────────────
has_crit_knife = any(kw in text_lower for kw in ['crit knife', 'throwing knife', 'penetrator', 'jakobs grenade'])

# ── Detect dominant element ─────────────────────────────────────────────────
elements = {'radiation': 0, 'fire': 0, 'cryo': 0, 'shock': 0, 'corrosive': 0}
for el in elements:
    elements[el] = text_lower.count(el)
dominant_el = max(elements, key=elements.get) if max(elements.values()) >= 3 else None

# ── Build items ─────────────────────────────────────────────────────────────
items = []
seed_counter = 1000

def next_seed():
    global seed_counter
    seed_counter += 137
    return seed_counter

def find_godroll(weapon_name, element=None):
    norm_name = norm(weapon_name)
    if not norm_name or len(norm_name) < 3:
        return None
    ELEMENTS = ['fire','cryo','shock','radiation','corrosive']
    # Prefer element match
    if element:
        for g in godrolls:
            n = norm(g.get('name',''))
            if norm(element) in n and norm_name in n:
                return g
    # Base (no element prefix)
    for g in godrolls:
        n = norm(g.get('name',''))
        starts_el = any(n.startswith(e) for e in ELEMENTS)
        if not starts_el and norm_name in n:
            return g
    # Any match
    for g in godrolls:
        if norm_name in norm(g.get('name','')):
            return g
    return None

# Weapons
for i, w in enumerate(found_weapons):
    slot = f"weapon{i+1}"
    name = w.get('partName', 'Unknown')
    mfg = w.get('manufacturer', '')
    wt = w.get('weaponType', '')
    code = w.get('code', '')

    # Check godroll
    gr = find_godroll(name, dominant_el)
    if gr:
        decoded = gr['decoded']
        decoded = re.sub(r'^(\d+),\s*0,\s*1,\s*\d+', rf'\1, 0, 1, {level}', decoded)
        decoded = re.sub(r'\|\s*2,\s*\d+\s*\|', f'| 2, {next_seed()}|', decoded)
        items.append({
            "slot": slot, "category": "Weapon",
            "itemName": f"{name} (Godroll)", "manufacturer": mfg,
            "weaponType": wt, "decoded": decoded,
            "typeId": decoded.split(',')[0].strip(),
            "confidence": "exact",
            "notes": f"From godroll: {gr['name']}",
        })
    else:
        # Basic assembly from DB
        type_id = code.split(':')[0].replace('{','') if ':' in code else ''
        part_id = code.split(':')[1].replace('}','') if ':' in code else code.replace('{','').replace('}','')
        if type_id:
            decoded = f"{type_id}, 0, 1, {level}| 2, {next_seed()}|| {{{part_id}}} |"
            items.append({
                "slot": slot, "category": "Weapon",
                "itemName": name, "manufacturer": mfg,
                "weaponType": wt, "decoded": decoded,
                "typeId": type_id, "confidence": "fuzzy",
            })

# Shield
for s in found_shields[:1]:
    code = s.get('code', '')
    type_id = code.split(':')[0].replace('{','') if ':' in code else ''
    part_id = code.split(':')[1].replace('}','') if ':' in code else ''
    if type_id:
        items.append({
            "slot": "shield", "category": "Shield",
            "itemName": s.get('partName',''), "manufacturer": s.get('manufacturer',''),
            "decoded": f"{type_id}, 0, 1, {level}| 2, {next_seed()}|| {{{part_id}}} |",
            "typeId": type_id, "confidence": "fuzzy",
        })

# Repkit (prefer legendary perk entries)
repkit_added = False
for r in found_repkits:
    if r.get('partType') == 'Rarity' and r.get('rarity') == 'Legendary':
        code = r.get('code', '')
        type_id = code.split(':')[0].replace('{','')
        part_id = code.split(':')[1].replace('}','')
        items.append({
            "slot": "repkit", "category": "Repkit",
            "itemName": r.get('partName',''), "manufacturer": r.get('manufacturer',''),
            "decoded": f"{type_id}, 0, 1, {level}| 2, {next_seed()}|| {{{type_id}:{part_id}}} |",
            "typeId": type_id, "confidence": "fuzzy",
        })
        repkit_added = True
        break

# Ordnance — crit knife hardcode
if has_crit_knife:
    items.append({
        "slot": "ordnance", "category": "Grenade",
        "itemName": "Crit Knife (Modded)", "manufacturer": "Jakobs",
        "decoded": f"267, 0, 1, {level}| 2, {next_seed()}|| {{20}} {{11}} {{11}} {{11}} {{11}} {{11}} {{11}} {{11}} {{11}} {{11}} {{11}} {{14}} {{14}} {{14}} {{14}} {{14}} {{14}} {{14}} {{14}} {{14}} {{14}} {{15}} {{15}} {{15}} {{15}} {{15}} {{15}} {{15}} {{15}} {{15}} {{15}} {{16}} {{16}} {{16}} {{16}} {{16}} {{16}} {{16}} {{16}} {{16}} {{16}} {{17}} {{17}} {{17}} {{17}} {{17}} {{17}} {{17}} {{17}} {{17}} {{17}} {{18}} {{18}} {{18}} {{18}} {{18}} {{18}} {{18}} {{18}} {{18}} {{18}} {{19}} {{19}} {{19}} {{19}} {{19}} {{19}} {{19}} {{19}} {{19}} {{19}} {{245:24}} {{245:25}} {{245:26}} {{245:27}} {{245:28}} {{1}} {{245:[39 39 39 39 39 39 39 39 39 39]}} {{245:[69 69 69 69 69 69 69 69 69 69]}} {{245:[70 70 70 70 70 70 70 70 70 70]}} {{245:[71 71 71 71 71 71 71 71 71 71]}} {{245:[72 72 72 72 72 72 72 72 72 72]}} {{245:[73 73 73 73 73 73 73 73 73 73]}} {{245:[75 75 75 75 75 75 75 75 75 75]}} {{245:[78 78 78 78 78 78 78 78 78 78]}} {{245:[79 79 79 79 79 79 79 79 79 79]}} |",
        "typeId": "267", "confidence": "exact",
        "notes": "Jakobs Penetrator Knife — max stacked crit perks",
    })

# Class Mod
for cm in found_classmods[:1]:
    code = cm.get('code', '')
    type_id = code.split(':')[0].replace('{','')
    part_id = code.split(':')[1].replace('}','')
    items.append({
        "slot": "classMod", "category": "Class Mod",
        "itemName": cm.get('partName',''), "manufacturer": cm.get('manufacturer',''),
        "decoded": f"{type_id}, 0, 1, {level}| 2, {next_seed()}|| {{{type_id}:{part_id}}} |",
        "typeId": type_id, "confidence": "fuzzy",
    })

# Get video title from description page
title = f"YouTube Build ({character.title()})"
try:
    import urllib.request
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={video_id}",
        headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8', errors='ignore')
    tm = re.search(r'"title":"(.*?)"', html)
    if tm:
        title = tm.group(1)
except Exception:
    pass

# ── Output ──────────────────────────────────────────────────────────────────
print(json.dumps({
    "buildName": title,
    "character": character,
    "variantName": "YouTube Transcript",
    "items": items,
    "skipped": [],
}, ensure_ascii=False))
