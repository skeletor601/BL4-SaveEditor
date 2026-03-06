/**
 * Skin image path logic – matches desktop (qt_weapon_generator_tab, qt_weapon_editor_tab, qt_item_edit_tab).
 * Many "Phosphene" (Shiny) skins share one preview image; desktop uses Cosmetics_Weapon_Shiny_bloodstarved.
 */
export function getSkinImageToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const t = token.trim();
  if (!t) return null;
  if (
    t.startsWith("Cosmetics_Weapon_Shiny_") &&
    t !== "Cosmetics_Weapon_Shiny_Ultimate"
  ) {
    return "Cosmetics_Weapon_Shiny_bloodstarved";
  }
  return t;
}

/** Base URL for skin images (Vite serves public/ at /). */
export const SKIN_IMAGES_BASE = "/skin_images";

export function getSkinImageUrl(token: string | null | undefined): string | null {
  const imageToken = getSkinImageToken(token);
  if (!imageToken) return null;
  return `${SKIN_IMAGES_BASE}/${encodeURIComponent(imageToken)}.png`;
}
