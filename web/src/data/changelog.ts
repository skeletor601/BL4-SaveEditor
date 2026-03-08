export interface ChangeLogEntry {
  date: string;
  items: string[];
}

export const CHANGE_LOG: ChangeLogEntry[] = [
  {
    date: "2026-03-07",
    items: [
      "Master Search filters stabilized (strict part type / rarity / manufacturer behavior).",
      "Canonical DB fields added for cleaner filtering (manufacturer, part type, rarity).",
      "Credits updated with YNOT, Terra, Spliff and Shaggy.",
    ],
  },
  {
    date: "2026-03-01",
    items: [
      "Added Change Gear Level for backpack items (bulk level set).",
      "Added Master Search row copy flow with quantity formatting.",
      "Improved API error messaging for service unavailable scenarios.",
    ],
  },
];
