"""Fix C4SH skill icons - copy from FModel exports with correct names and build tree color mapping."""

import re, json, shutil, os, unicodedata

# Complete NCS mapping: skill -> icon file
MAPPING = {
    # CLEROMANCY TREE (GREEN)
    "Luck Be a Robot": "c4sh_passive_green_02",
    "All for One": "c4sh_passive_green_04",
    "Lucky Charm": "c4sh_passive_green_06",
    "The Lucky One": "c4sh_passive_green_07",
    "Red Moon Rising": "c4sh_passive_green_08",
    "Rolling the Deep": "c4sh_passive_green_09",
    "Riding High": "c4sh_passive_green_10",
    "Double Time": "c4sh_passive_green_13",
    "Luckless": "c4sh_passive_green_14",
    "Critical Role": "c4sh_passive_green_15",
    "Spin of Fate": "c4sh_passive_green_16",
    "High Stakes": "c4sh_passive_green_17",
    "Fortune's Favor": "c4sh_passive_green_19",
    "Let it Ride": "c4sh_passive_green_20",
    "The Wilds": "c4sh_passive_green_21",
    "Pack Mentality": "c4sh_passive_green_22",
    "Undying": "c4sh_passive_green_23",
    "Loaded Dice": "c4sh_passive_green_24",
    "Shadow's Embrace": "c4sh_passive_green_25",
    "Serendipity": "c4sh_passive_green_26",
    "Sidekick's Revenge": "c4sh_passive_green_27",
    "Alpha's Call": "c4sh_passive_green_28",
    "Cursed Call": "c4sh_passive_green_29",
    "Haunted": "c4sh_passive_green_30",
    "Graveyard Shift": "c4sh_passive_green_32",
    "Snake Eyes": "c4sh_passive_green_34",
    "Risky Business": "c4sh_passive_green_01",  # Blue tree skill but GREEN icon
    # CROSS FIRE TREE (RED)
    "Witching Hour": "c4sh_passive_red_01",  # Green tree skill but RED icon
    "Gunslinger": "c4sh_passive_red_02",
    "Death Hunt": "c4sh_passive_red_04",
    "The Determinator": "c4sh_passive_red_05",
    "Hard-Boiled": "c4sh_passive_red_06",
    "Shootist": "c4sh_passive_red_08",
    "Stand and Bleed": "c4sh_passive_red_09",
    "The Furies": "c4sh_passive_red_10",
    "Ride to Ruin": "c4sh_passive_red_13",
    "Unchained": "c4sh_passive_red_14",
    "Brimstone": "c4sh_passive_red_15",
    "The Claim": "c4sh_passive_red_16",
    "The Gunfighter": "c4sh_passive_red_17",
    "Debts to Pay": "c4sh_passive_red_18",
    "Hell and Back": "c4sh_passive_red_19",
    "Blood on Elpis": "c4sh_passive_red_20",
    "Lawless": "c4sh_passive_red_22",
    "TNT": "c4sh_passive_red_23",
    "War Wagon": "c4sh_passive_red_25",
    "Pale Rider": "c4sh_passive_red_26",
    "Forsaken": "c4sh_passive_red_27",
    "The Wind": "c4sh_passive_red_29",
    "Maverick": "c4sh_passive_red_30",
    "Cottonmouth": "c4sh_passive_red_31",
    "Broken Arrow": "c4sh_passive_red_33",
    # SLEIGHT OF HAND TREE (BLUE)
    "Bad Men Must Bleed": "c4sh_passive_blue_01",
    "Table Flip": "c4sh_passive_blue_02",
    "Hero Call": "c4sh_passive_blue_03",
    "Steam": "c4sh_passive_blue_05",
    "Alchemy": "c4sh_passive_blue_23",
    "Read the Signs": "c4sh_passive_blue_07",
    "Sounds of Rain": "c4sh_passive_blue_08",
    "Trick-Taker": "c4sh_passive_blue_09",
    "Late Scratch": "c4sh_passive_blue_11",
    "Double-Down": "c4sh_passive_blue_13",
    "Wretched Shadows": "c4sh_passive_blue_20",
    "High Roller": "c4sh_passive_blue_15",
    "Take the Pot": "c4sh_passive_blue_16",
    "Stack the Deck": "c4sh_passive_blue_17",
    "Legerdemain": "c4sh_passive_blue_18",
    "Fortuity": "c4sh_passive_blue_19",
    "Dealer's Bluff": "c4sh_passive_blue_20",
    "Ace in the Hole": "c4sh_passive_blue_22",
    "Around the Corner": "c4sh_passive_blue_24",
    "The House": "c4sh_passive_blue_27",
    "C4SH Game": "c4sh_passive_blue_26",
    "Ante": "c4sh_passive_blue_28",
    "The Turn": "c4sh_passive_blue_29",
    "Payout": "c4sh_passive_blue_30",
    "Boom or Bust": "c4sh_passive_blue_31",
    "Heart of the Cards": "c4sh_passive_blue_32",
    "Running Luck": "c4sh_passive_blue_33",
    "Hot Streak": "c4sh_passive_blue_34",
    # SHARED (appears in multiple trees)
    "Grave Pact": "c4sh_passive_blue_11",  # Cleromancy trunk but blue icon
    "Bone Shrapnel": "c4sh_passive_blue_11",  # Crossfire branch but blue icon
    "Devil's Tines": "c4sh_passive_green_12",  # Shared across all 3 trees
}

src_dir = r"C:\Users\picas\Desktop\Mappings-4-1-0-1757622416 (1)\output\Exports\OakGame\Content\DLC\Cowbell\uiresources\skill_icons\passives"
dst_dir = r"C:\BL4\BL4_AIO_Web\class_mods\C4SH"

copied = 0
missing = 0
blue = []
red = []
green = []

for display_name, icon_ref in MAPPING.items():
    # Determine tree color from icon
    if "_blue_" in icon_ref:
        blue.append(display_name)
    elif "_red_" in icon_ref:
        red.append(display_name)
    else:
        green.append(display_name)

    # Generate our filename
    norm = unicodedata.normalize("NFD", display_name)
    norm = "".join(c for c in norm if unicodedata.category(c) != "Mn")
    norm = norm.replace("\u2019", "").replace("\u2018", "").replace("'", "")
    norm = norm.replace(" ", "_")
    safe = re.sub(r"[^a-zA-Z0-9_!-]", "", norm).lower()
    dst_file = os.path.join(dst_dir, f"{safe}_5.png")

    src_file = os.path.join(src_dir, icon_ref + ".png")
    if os.path.exists(src_file):
        shutil.copy2(src_file, dst_file)
        copied += 1
    else:
        print(f"MISSING: {src_file}")
        missing += 1

print(f"\nCopied {copied} icons, {missing} missing")
print(f"\n=== BLUE TREE (Sleight of Hand) - {len(blue)} skills ===")
for s in sorted(blue):
    print(f'  "{s}",')
print(f"\n=== RED TREE (Cross Fire) - {len(red)} skills ===")
for s in sorted(red):
    print(f'  "{s}",')
print(f"\n=== GREEN TREE (Cleromancy) - {len(green)} skills ===")
for s in sorted(green):
    print(f'  "{s}",')
