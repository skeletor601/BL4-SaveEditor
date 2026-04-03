/** Routes that use the compact breadcrumb header in classic layout (matches pre-layout app). */
export const MINIMAL_HEADER_ROUTES = [
  "/beta",
  "/test-app",
  "/terra",
  "/green",
  "/drlecter",
  "/character",
  "/inventory",
  "/gear-forge",
  "/master-search",
  "/settings",
  "/save-compare",
  "/community",
  "/god-rolls",
  "/testing",
];

/**
 * Navigation model aligned with TestAppPage (`/`): Command, Build Lab, Arsenal,
 * Save Ops, Vault, Workbench — plus labs and settings used elsewhere in the app.
 */

export interface NavLeaf {
  to: string;
  label: string;
  hint?: string;
}

export interface NavZone {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  items: NavLeaf[];
}

/** Zones mirror the home hub tabs + extra tools (same destinations the app already uses). */
export const APP_ZONES: NavZone[] = [
  {
    id: "command",
    label: "Command",
    subtitle: "Hub & status",
    icon: "◈",
    items: [
      { to: "/", label: "Main hub", hint: "TestApp — Command Center & tabs" },
      { to: "/dashboard", label: "Command dashboard", hint: "Card dashboard route" },
      { to: "/beta", label: "Beta lab", hint: "Early access experiments" },
    ],
  },
  {
    id: "build",
    label: "Build & edit",
    subtitle: "Unified + classic bench",
    icon: "⚙",
    items: [
      { to: "/beta/unified-item-builder", label: "Unified Item Builder", hint: "Primary builder (Gear Lab)" },
      { to: "/gear-forge", label: "Gear Forge", hint: "Classic workbench + codec" },
      { to: "/testing", label: "Testing shortcut", hint: "Same unified builder" },
    ],
  },
  {
    id: "arsenal",
    label: "Parts search",
    subtitle: "Database lookup",
    icon: "⌕",
    items: [
      { to: "/master-search", label: "Master Search", hint: "Full search UI" },
      { to: "/master-search-simple", label: "Simple search", hint: "Lightweight lookup" },
    ],
  },
  {
    id: "save",
    label: "Save & inventory",
    subtitle: "Characters & items",
    icon: "◉",
    items: [
      { to: "/character", label: "Character", hint: "Save, edit, YAML" },
      { to: "/inventory", label: "Inventory", hint: "Decoder, backpack, bulk" },
      { to: "/save-compare", label: "Save comparison", hint: "Diff two saves" },
    ],
  },
  {
    id: "vault",
    label: "Vault",
    subtitle: "Community & rolls",
    icon: "◎",
    items: [
      { to: "/community", label: "Community vault", hint: "Recipes & codes" },
      { to: "/god-rolls", label: "God rolls", hint: "Non-modded configs" },
    ],
  },
  {
    id: "backpack",
    label: "Backpack",
    subtitle: "Inventory & Loot Lobby",
    icon: "▤",
    items: [
      { to: "/inventory/backpack", label: "Backpack Manager", hint: "View & manage inventory" },
      { to: "/inventory/loot-lobby", label: "Loot Lobby", hint: "Batch inject & drop for co-op" },
      { to: "/inventory/decoder", label: "Decoder", hint: "Decode / encode serial codes" },
      { to: "/inventory/code-spawn", label: "Add in Bulk", hint: "Batch add items to save" },
      { to: "/inventory/parts-translator", label: "Parts Translator", hint: "Translate codes to names" },
      { to: "/inventory/validator", label: "Code Inspector", hint: "Validate item codes" },
    ],
  },
  {
    id: "system",
    label: "System",
    subtitle: "Preferences",
    icon: "⚙",
    items: [{ to: "/settings", label: "Settings", hint: "Theme, layout, credits" }],
  },
];

/** Longest-prefix wins so `/beta/unified-item-builder` maps to build, not labs. */
const MATCH_RULES: { prefix: string; zoneId: string }[] = [
  { prefix: "/beta/unified-item-builder", zoneId: "build" },
  { prefix: "/testing", zoneId: "build" },
  { prefix: "/gear-forge", zoneId: "build" },
  { prefix: "/beta", zoneId: "command" },
  { prefix: "/master-search-simple", zoneId: "arsenal" },
  { prefix: "/master-search", zoneId: "arsenal" },
  { prefix: "/character", zoneId: "save" },
  { prefix: "/inventory", zoneId: "save" },
  { prefix: "/save-compare", zoneId: "save" },
  { prefix: "/community", zoneId: "vault" },
  { prefix: "/god-rolls", zoneId: "vault" },
  { prefix: "/dashboard", zoneId: "command" },
  { prefix: "/settings", zoneId: "system" },
  { prefix: "/", zoneId: "command" },
];

export function activeZoneId(pathname: string): string {
  const sorted = [...MATCH_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, zoneId } of sorted) {
    if (prefix === "/") {
      if (pathname === "/") return zoneId;
      continue;
    }
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return zoneId;
  }
  return "command";
}

export function isLeafActive(pathname: string, to: string): boolean {
  const [path] = to.split("?");
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

export function flattenNavLeaves(): { zone: NavZone; leaf: NavLeaf }[] {
  return APP_ZONES.flatMap((zone) => zone.items.map((leaf) => ({ zone, leaf })));
}

// ── Breadcrumbs (extended — used by non-classic layouts) ───────────────────
export interface Crumb {
  label: string;
  to?: string;
}

export function getBreadcrumbsExtended(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];

  if (pathname.startsWith("/beta/unified-item-builder")) {
    crumbs.push({ label: "Build & Edit Items" });
  } else if (pathname.startsWith("/beta")) {
    crumbs.push({ label: "Beta Lab" });
  } else if (pathname.startsWith("/gear-forge")) {
    crumbs.push({ label: "Gear Forge" });
  } else if (pathname.startsWith("/character")) {
    crumbs.push({ label: "Character", to: "/character" });
    if (pathname.includes("select-save")) crumbs.push({ label: "Select Save" });
    else if (pathname.includes("edit")) crumbs.push({ label: "Edit" });
    else if (pathname.includes("yaml")) crumbs.push({ label: "YAML View" });
  } else if (pathname.startsWith("/inventory")) {
    crumbs.push({ label: "Inventory", to: "/inventory" });
    if (pathname.includes("backpack")) crumbs.push({ label: "Backpack" });
    else if (pathname.includes("decoder")) crumbs.push({ label: "Decoder" });
    else if (pathname.includes("code-spawn")) crumbs.push({ label: "Add in Bulk" });
    else if (pathname.includes("parts-translator")) crumbs.push({ label: "Parts Translator" });
    else if (pathname.includes("validator")) crumbs.push({ label: "Code Inspector" });
  } else if (pathname.startsWith("/master-search")) {
    crumbs.push({ label: "Parts Search" });
  } else if (pathname.startsWith("/save-compare")) {
    crumbs.push({ label: "Save Comparison" });
  } else if (pathname.startsWith("/community")) {
    crumbs.push({ label: "Community Vault" });
  } else if (pathname.startsWith("/god-rolls")) {
    crumbs.push({ label: "God Rolls" });
  } else if (pathname.startsWith("/testing")) {
    crumbs.push({ label: "Testing" });
  } else if (pathname.startsWith("/settings")) {
    crumbs.push({ label: "Settings" });
  } else if (pathname.startsWith("/terra")) {
    crumbs.push({ label: "Terra Lab" });
  } else if (pathname.startsWith("/green")) {
    crumbs.push({ label: "Green Lab" });
  } else if (pathname.startsWith("/drlecter")) {
    crumbs.push({ label: "Dr. Lecter" });
  } else if (pathname.startsWith("/dashboard")) {
    crumbs.push({ label: "Command Dashboard" });
  }

  return crumbs;
}
