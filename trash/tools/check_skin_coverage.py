"""Check if all skin names from codes for db.txt are in weapon_skins.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Names from file (id, name)
file_skins = [
    (1, "Phosphen"), (71, "Missing Name"), (72, "Missing Name"), (74, "Missing Name"), (76, "Missing Name"),
    (77, "Smiley"), (78, "Werido"), (79, "Eternal Defender"), (80, "Splash Damage"), (81, "Bird of Prey"),
    (82, "Soused"), (83, "Self Excision"), (84, "Highrise"), (85, "Wellspring-Loaded"), (86, "Devourer"),
    (87, "The System"), (88, "Future Proof"), (89, "Frenzy Forever"), (90, "Afterparty"), (91, "Halt, Citizen"),
    (92, "Meltdown"), (93, "High Impact"), (94, "With the Grain"), (95, "Bestia Rossa"), (96, "Pixel Perfect"),
    (97, "Chain of Command"), (98, "Gloss"), (99, "Awoooooo!"), (100, "Sprinked"), (101, "Prison Buddy"),
    (102, "Never Say DlY"), (103, "Game Bot"), (104, "Itty Bitty Kitty Committee"), (105, "Carcade Shooter"),
    (106, "Fran's Frogurt"), (107, "Drawn This Way"), (108, "Coast to Coast"), (109, "The Gun is Lava"),
    (110, "Solar Flair"), (111, "Missing Name"), (112, "Missing Name"),
]

path = ROOT / "master_search" / "db" / "weapon_skins.json"
data = json.loads(path.read_text(encoding="utf-8"))
json_labels = set()
for e in data:
    label = e.get("label", "")
    if " - " in label:
        json_labels.add(label.split(" - ")[0].strip())
    else:
        json_labels.add(label.strip())

def norm(s):
    return s.replace("DlY", "DIY").strip()

missing = []
for sid, name in file_skins:
    if name == "Missing Name":
        continue
    n = norm(name)
    # Match: exact, or known typos (Phosphen->Phosphene, Werido->Weirdo)
    if n in json_labels:
        continue
    if n == "Phosphen" and any("Phosphene" in L for L in json_labels):
        continue
    if n == "Werido" and "Weirdo" in json_labels:
        continue
    missing.append((sid, name))

if missing:
    print("File skin names NOT in weapon_skins.json:", missing)
else:
    print("All named skins from the file are already in weapon_skins.json.")
print("Named in file:", len([x for x in file_skins if x[1] != "Missing Name"]))
print("Entries in weapon_skins.json:", len(data))
