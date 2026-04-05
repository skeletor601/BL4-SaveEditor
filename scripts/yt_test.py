"""Quick test: extract build from a YouTube video."""
import sys, re, urllib.request, json
sys.stdout.reconfigure(encoding='utf-8')
from youtube_transcript_api import YouTubeTranscriptApi

video_id = sys.argv[1] if len(sys.argv) > 1 else '9XHG1DcLST4'

# 1. Transcript
from youtube_transcript_api.proxies import GenericProxyConfig

proxy_url = "http://armlayfv-5:zbynutb929qy@p.webshare.io:80"
api = YouTubeTranscriptApi(
    proxy_config=GenericProxyConfig(
        http_url=proxy_url,
        https_url=proxy_url,
    )
)
transcript = api.fetch(video_id)
full_text = ' '.join([t.text for t in transcript])

# 2. Description + title
req = urllib.request.Request(f'https://www.youtube.com/watch?v={video_id}', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8', errors='ignore')
desc_match = re.search(r'"shortDescription":"(.*?)"', html)
desc = desc_match.group(1).replace('\\n', '\n') if desc_match else ''
title_match = re.search(r'"title":"(.*?)"', html)
title = title_match.group(1) if title_match else ''

# 3. Timestamps
timestamps = re.findall(r'(\d+:\d+)\s+(.+)', desc)

def ts_to_seconds(ts):
    parts = ts.split(':')
    return int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 0

sections = []
for i, (ts, label) in enumerate(timestamps):
    start = ts_to_seconds(ts)
    end = ts_to_seconds(timestamps[i+1][0]) if i+1 < len(timestamps) else 99999
    section_text = ' '.join([t.text for t in transcript if start <= t.start < end])
    sections.append((label.strip(), section_text))

# 4. DB
with open('master_search/db/universal_parts_db.json', 'r', encoding='utf-8') as f:
    db = json.load(f)
rows = db['rows']

def norm(s):
    return s.lower().replace(' ', '').replace("'", "").replace('-', '').replace('.', '')

def build_lookup(category, part_types, min_len=3):
    lookup = {}
    for r in rows:
        if r.get('category') != category: continue
        if part_types and r.get('partType') not in part_types: continue
        name = norm(r.get('partName', ''))
        if name and name not in ('legendary','common','uncommon','rare','epic','pearl','repkit') and len(name) >= min_len:
            lookup[name] = r
    return lookup

weapons = build_lookup('Weapon', ['Barrel', 'Rarity'])
shields_leg = build_lookup('Shield', ['Legendary Perk', 'Rarity'])
repkits_leg = build_lookup('Repkit', ['Legendary Perk', 'Rarity'], min_len=4)
class_mod_names = build_lookup('Class Mod', ['Name'])
class_mod_skills = build_lookup('Class Mod', ['Skill'], min_len=4)
firmware = {}
for r in rows:
    if r.get('partType') == 'Firmware':
        name = norm(r.get('partName', ''))
        if name and len(name) >= 4: firmware[name] = r

# Also add known aliases for fuzzy matching
ALIASES = {
    'watts4dinner': 'watts4dinner', 'wattsfordinner': 'watts4dinner',
    'wattsdinner': 'watts4dinner', 'watts': 'watts4dinner',
}

blacklist = {'amp','nova','fire','cryo','shock','tank','speed','order','common','rare',
             'epic','legendary','pearl','hunter','barrel','body','grip','scope','magazine',
             'skill','augment','the'}

def scan_text(text, lookup, extra_blacklist=None):
    bl = blacklist | (extra_blacklist or set())
    found = set()
    words = re.findall(r'[a-zA-Z0-9]+', text)
    for i in range(len(words)):
        for length in [1, 2, 3, 4]:
            if i + length > len(words): break
            phrase = norm(''.join(words[i:i+length]))
            if len(phrase) < 3 or phrase in bl: continue
            if phrase in lookup:
                r = lookup[phrase]
                mfg = r.get('manufacturer', '')
                wt = r.get('weaponType', '')
                found.add(f"{r['partName']} [{mfg} {wt}] {r['code']}")
    return found

# 5. Check for planner links
planner_links = re.findall(r'https?://(?:www\.)?(?:maxroll|mobalytics)\S+', desc)

# 6. Output
print(f'TITLE: {title}')
print(f'Transcript: {len(full_text)} chars | Description: {len(desc)} chars')
print()

if timestamps:
    print('TIMESTAMPS:')
    for ts, label in timestamps:
        print(f'  {ts} {label}')
    print()

if planner_links:
    print('BUILD PLANNER LINKS:')
    for l in planner_links: print(f'  {l}')
    print()

# Character
chars = {'vex': 0, 'rafa': 0, 'harlowe': 0, 'amon': 0}
combined = (desc + ' ' + full_text).lower()
for c in chars: chars[c] = combined.count(c)
detected_char = max(chars, key=chars.get)
print(f'CHARACTER: {detected_char} ({chars[detected_char]}x)')
print()

print('=== FULL SCAN ===')
for cat_name, lookup in [('WEAPONS', weapons), ('SHIELDS', shields_leg), ('REPKITS', repkits_leg),
                          ('CLASS MODS', class_mod_names), ('FIRMWARE', firmware)]:
    items = sorted(scan_text(full_text + ' ' + desc, lookup))
    print(f'\n--- {cat_name} ({len(items)}) ---')
    for item in items: print(f'  {item}')

print('\n\n=== SECTION BY SECTION ===')
for label, text in sections:
    if not text.strip(): continue
    all_found = set()
    for lname, ldict in [('weapon', weapons), ('shield', shields_leg), ('repkit', repkits_leg),
                          ('class_mod', class_mod_names), ('skill', class_mod_skills), ('firmware', firmware)]:
        for m in scan_text(text, ldict):
            all_found.add(f'[{lname}] {m}')
    if all_found:
        print(f'\n--- {label} ---')
        for item in sorted(all_found): print(f'  {item}')
