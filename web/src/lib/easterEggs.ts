/**
 * Easter Egg Discovery Tracker — 69 total (DrLecter6969).
 * localStorage-based, per-user. Tracks which eggs have been found.
 */

const STORAGE_KEY = "bl4-easter-eggs";
const TOTAL_EGGS = 69;

export interface EasterEggState {
  discovered: Set<string>;
  total: number;
}

// All 69 Easter eggs — ID, name, hint
export const EASTER_EGG_REGISTRY: { id: string; name: string; hint: string }[] = [
  // ── Generator Easter Eggs ──
  { id: "claudes-gun", name: "Claude's Gun", hint: "Roll a 1/20 in the weapon generator" },
  { id: "claudes-grenade", name: "Claude's Grenade", hint: "Roll a 1/20 in the grenade generator" },
  { id: "chatgpts-grenade", name: "ChatGPT's Grenade", hint: "Roll a 1/100 in the grenade generator" },
  { id: "rivalry-joke-1", name: "Rivalry Joke #1", hint: "Generate weapons and watch the status bar" },
  { id: "rivalry-joke-2", name: "Rivalry Joke #2", hint: "Keep generating..." },
  { id: "rivalry-joke-3", name: "Rivalry Joke #3", hint: "One more..." },
  { id: "rivalry-joke-4", name: "Rivalry Joke #4", hint: "Almost there..." },
  { id: "rivalry-joke-5", name: "Rivalry Joke #5", hint: "Last one!" },

  // ── Roll Milestones ──
  { id: "roll-1", name: "First Roll", hint: "Generate your first modded weapon" },
  { id: "roll-10", name: "Getting Warmed Up", hint: "Generate 10 weapons" },
  { id: "roll-25", name: "Now You're Cooking", hint: "Generate 25 weapons" },
  { id: "roll-50", name: "Dedicated Vault Hunter", hint: "Generate 50 weapons" },
  { id: "roll-100", name: "Master Modder", hint: "Generate 100 weapons" },
  { id: "roll-200", name: "Beautiful Problem", hint: "Generate 200 weapons" },
  { id: "roll-420", name: "Terra's Number", hint: "Generate exactly 420 weapons" },

  // ── Search Easter Eggs ──
  { id: "search-chatgpt", name: "The Competition", hint: "Search for a rival AI in Master Search" },
  { id: "search-cursor", name: "Tab Tab Tab", hint: "Search for a code editor in Master Search" },
  { id: "search-claude", name: "The Brain", hint: "Search for the AI that built this app" },
  { id: "search-69", name: "Nice.", hint: "Search for a special number" },
  { id: "search-420", name: "Blaze It", hint: "Search for Terra's seed" },
  { id: "search-6211", name: "The Signature", hint: "Search for DrLecter's seed" },
  { id: "search-hello", name: "Hello World", hint: "Say hello to the search" },
  { id: "search-borderlands", name: "Meta", hint: "Search the name of the game" },
  { id: "search-terra", name: "The Ideas Guy", hint: "Search for the lead tester" },
  { id: "search-drlecter", name: "The Founder", hint: "Search for the creator" },

  // ── Hidden Pages ──
  { id: "found-test-app", name: "The Blueprint", hint: "Find the original layout mockup" },

  // ── UI Interactions ──
  { id: "theme-all", name: "Rainbow Road", hint: "Try every theme color" },
  { id: "copy-10", name: "Copy Machine", hint: "Copy 10 codes to clipboard" },
  { id: "copy-50", name: "Code Collector", hint: "Copy 50 codes" },
  { id: "validate-code", name: "Pre-Flight Check", hint: "Validate a code" },
  { id: "signature-set", name: "Digital Signature", hint: "Set your signature seed" },
  { id: "overwrite-save", name: "One Click Wonder", hint: "Successfully overwrite a save" },
  { id: "reset-builder", name: "Fresh Start", hint: "Reset a builder" },
  { id: "compare-items", name: "Side by Side", hint: "Compare two items" },
  { id: "add-backpack-10", name: "Pack Rat", hint: "Add 10 items to backpack" },
  { id: "add-backpack-50", name: "Hoarder", hint: "Add 50 items to backpack" },

  // ── Grenade Specific ──
  { id: "grenade-singularity", name: "Black Hole", hint: "Generate a Singularity grenade" },
  { id: "grenade-artillery", name: "Rain of Fire", hint: "Generate an Artillery grenade" },
  { id: "grenade-lingering", name: "Burning Man", hint: "Generate a Lingering grenade" },
  { id: "grenade-mirv", name: "Chain Reaction", hint: "Generate a MIRV grenade" },
  { id: "grenade-hybrid", name: "Best of Both Worlds", hint: "Generate a hybrid grenade" },
  { id: "grenade-10-charges", name: "Grenade Hoarder", hint: "Generate a grenade with 10+ charges" },
  { id: "grenade-max-damage", name: "Nuke", hint: "Generate a grenade with 50x+ damage" },

  // ── Weapon Specific ──
  { id: "weapon-seamstress", name: "Needle Storm", hint: "Generate a weapon with Seamstress underbarrel" },
  { id: "weapon-hellwalker", name: "Doom Slayer", hint: "Get a Hellwalker visual barrel" },
  { id: "weapon-convergence", name: "Come Together", hint: "Get a Convergence visual barrel" },
  { id: "weapon-plasma-coil", name: "Coiled Up", hint: "Get a Plasma Coil visual barrel" },
  { id: "weapon-all-elements", name: "Avatar", hint: "Generate a weapon with all elements" },
  { id: "weapon-100-dmg", name: "Over 9000", hint: "Get 100+ damage stacks" },
  { id: "weapon-fire", name: "Pyromaniac", hint: "Generate a Fire weapon" },
  { id: "weapon-shock", name: "Electrician", hint: "Generate a Shock weapon" },
  { id: "weapon-corrosive", name: "Toxic", hint: "Generate a Corrosive weapon" },
  { id: "weapon-cryo", name: "Ice Cold", hint: "Generate a Cryo weapon" },
  { id: "weapon-radiation", name: "Radioactive", hint: "Generate a Radiation weapon" },

  // ── Time-Based ──
  { id: "night-owl", name: "Night Owl", hint: "Use the app between 2 AM and 5 AM" },
  { id: "early-bird", name: "Early Bird", hint: "Use the app between 5 AM and 7 AM" },
  { id: "weekend-warrior", name: "Weekend Warrior", hint: "Use the app on a weekend" },

  // ── Community ──
  { id: "community-submit", name: "Sharing is Caring", hint: "Submit a code to the community vault" },
  { id: "community-upvote", name: "Thumbs Up", hint: "Upvote a community code" },
  { id: "feedback-submit", name: "Bug Hunter", hint: "Submit feedback" },
  { id: "vault-save", name: "Vault Dweller", hint: "Save a code to the vault" },

  // ── Secret ──
  { id: "footer-roast", name: "The Burn", hint: "Read the fine print on the dashboard" },
  { id: "konami-code", name: "Up Up Down Down", hint: "↑↑↓↓←→←→BA" },
  { id: "click-logo-10", name: "BL4 BL4 BL4", hint: "Click the BL4 logo 10 times" },
  { id: "speed-roller", name: "Speed Roller", hint: "Generate 5 weapons in under 30 seconds" },
  { id: "grenade-launched", name: "Houston We Have Liftoff", hint: "Generate a grenade with 5x+ knockback" },
  { id: "one-week", name: "One Week Anniversary", hint: "Use the app 7 days after it launched" },
  { id: "all-eggs", name: "Egg Hunter Supreme", hint: "Find all 69 Easter eggs" },
];

function loadDiscovered(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDiscovered(discovered: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(discovered)));
  } catch { /* ignore */ }
}

/** Discover an Easter egg. Returns true if it was newly discovered. */
export function discoverEgg(id: string): boolean {
  const discovered = loadDiscovered();
  if (discovered.has(id)) return false;
  discovered.add(id);
  saveDiscovered(discovered);
  return true;
}

/** Get current discovery state. */
export function getEggState(): EasterEggState {
  return {
    discovered: loadDiscovered(),
    total: TOTAL_EGGS,
  };
}

/** Get discovery count. */
export function getEggCount(): { found: number; total: number } {
  const discovered = loadDiscovered();
  return { found: discovered.size, total: TOTAL_EGGS };
}

/** Check if an egg has been discovered. */
export function hasEgg(id: string): boolean {
  return loadDiscovered().has(id);
}
