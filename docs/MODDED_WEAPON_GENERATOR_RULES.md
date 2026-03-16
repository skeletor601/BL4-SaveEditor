# Modded Weapon Generator – Locked Rules (DO NOT REVERT)

These rules are required for the modded weapon generator. **Do not remove or revert them** when editing `web/src/lib/generateModdedWeapon.ts` or `web/src/pages/weapon-toolbox/WeaponEditView.tsx`.

## 1. Magazine – Vladof only
- **Always** use Vladof 50-round magazine **`{18:14}`** only.
- Do **not** call `pickMagazineToken()` or use any magazine from edit data.
- No COV/Order magazine prefix; `magazinePrefixForOrderCov` must stay `""`.
- Same rule in **WeaponEditView.tsx**: `magazineToken = "{18:14}"` only.

## 2. No 27:75 in stat stacks
- **Never** use the code `27:75` in any stat/damage/fire-rate stacks.
- Filter it out via `isExcludedStatCode(27, 75)` in `addStatStacks` (and any similar logic).

## 3. No exemplar {9:[...]} stacks
- Do **not** add exemplar damage stacks of the form `{9:[xx yy xx ...]}`.
- Do **not** uncomment or restore `exemplarDamageGroup` or add it to `damageStacks`.
- Keep `damageStacks` without any `exemplarDamageGroup`.

## 4. Grenade block (245)
- Use only **part IDs 22–81** inside the `{245:[...]}` block (perks/augments).
- The actual legendary grenade code (before/after the 245 block) must come from **legendaryGrenadeEntries** (e.g. `web/public/data/legendary_grenades.json`).

## 5. Barrels
- When **allowedBarrelEntries** is provided, use **only** barrels from that list (primary, extra, cross).
- Data: `web/public/data/allowed_barrels.json`.

## 6. Underbarrels
- **Exclude** malswitch (regex in `UNDERBARREL_EXCLUDED`).
- When **allowedUnderbarrelEntries** is provided, use **only** underbarrels (and accessories) from that list; no fallback to edit data.
- Data: `web/public/data/allowed_underbarrels.json`.

## 7. Skin
- Use `options.skin` when set; otherwise pick **random from skinOptions** (excluding Christmas).
- When a skin is chosen (or picked), **always** append it to the decoded string (`| "c", "<skin>" |`).
- Unified Item Builder must pass **skinOptions** (e.g. from weapon-gen data when `weaponData?.skins` is missing).

## 8. Other
- **Tediore Reload, no stat changes**: always include when available.
- **Underbarrel → foregrip**: one foregrip only, order preserved.
- **No ammo stacks**: 0 ammo codes so grenade reload works.

---

If you are refactoring or merging code, **preserve these behaviors**. Do not “restore” old behavior (e.g. `pickMagazineToken`, exemplar `{9:[...]}`, or COV/Order magazines).
