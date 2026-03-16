# Modded weapon generator: visual barrel to the left of first barrel

## Goal
- Build a **basic legendary weapon** (same as Auto fill: body, barrel, mag, grip, scope, rarity, etc.).
- Then add **all modded stuff** (underbarrel, multi-projectile, grenade block, stacks, etc.).
- **Always** paste a **visual-effects barrel code to the left** of whatever the first barrel code is in the deserialized string. The game reads left-to-right, so the leftmost barrel drives the visual.

## Current behavior (generateModdedWeapon.ts)
1. Build base legendary: pick prefix (e.g. BOR_SG), rarity, body, **barrels**, mag, grip, scope, manufacturer, etc.
2. **Visual barrel**: `uniqueEffectBarrels` = barrels that are visual/unique/Star Helix (and not excluded: Queens Rest, Potato Thrower, etc.). We pick one and set `uniqueFirstBarrelToken`.
3. **Order in `allNewParts`**: `uniqueFirstBarrelToken` (if any) → `primaryBarrelToken` → samePrefixBarrelParts → crossParts → barrel accessories → …
4. So when `allUniqueBarrels.length > 0`, we already put a visual barrel to the left. When the pool is **empty**, we add no token and the first barrel is the primary barrel (no override).

## Why it might not be doing it
- **Pool empty**: If the parts DB has no barrels marked as visual/unique/Star Helix for the loaded data, `allUniqueBarrels` is empty and we don’t add a visual barrel.
- **Heavy barrels not included**: Visual pool only uses `partType === "barrel"` and text/flag checks. Heavy weapon barrels might be in the DB as "Barrel" but with a different item type; we should treat **heavy weapon barrels** as valid for the first (visual) slot.
- **Unified Item Builder uses same lib**: Beta → Unified Item Builder → Weapon Builder calls `generateModdedWeapon(editData, universalPartCodes, opts)`, so fixing the lib fixes both Gear Forge and Unified Item Builder.

## Plan (implemented)

1. **Keep building like Auto fill**  
   No change: same core part selection (rarity, body, barrel, mag, grip, scope, manufacturer, etc.).

2. **Expand visual barrel pool**  
   - Keep: visual/unique/Star Helix barrels, exclude Queens Rest / Potato Thrower / Noisy Cricket / Kaleidosplode.  
   - **Add**: barrels whose **Weapon Type / Item Type** is "Heavy" (or contains "heavy"), so heavy weapon barrels can be used as the first (visual) barrel.

3. **Always insert a barrel to the left when we have any**  
   - If `allUniqueBarrels.length > 0`: use it as today (pick one, paste left).  
   - **Fallback** when `allUniqueBarrels.length === 0`: use **crossPrefixBarrels** (other weapon types’ legendary barrels). Pick one and set `uniqueFirstBarrelToken` so we always paste *some* barrel to the left of the primary, giving a visual override.

4. **Order unchanged**  
   `allNewParts` stays: `… uniqueFirstBarrelToken, primaryBarrelToken, …` so the deserialized tab is left-to-right correct.

## Files to change
- `web/src/lib/generateModdedWeapon.ts`: expand visual pool (heavy barrels), fallback to crossPrefixBarrels when no visual barrels.
- Optional: same logic in `web/src/pages/weapon-toolbox/WeaponEditView.tsx` for Gear Forge generator (keep in sync).

## Result
- Every modded weapon will have a barrel code to the **left** of the first “main” barrel.
- That left barrel comes from (in order): visual/unique/Star Helix list → heavy barrels → fallback cross-prefix legendary barrel.
- Basic legendary build is unchanged; only the extra “visual first” step is guaranteed.
