# Bomb Bag — Plan

Source: feature inbox → planning inbox ("Add Bomb Bag as a Dungeon Puzzle. Use 1 free bomb per
room. Crafting bombs increases the ammo count."). Planned 2026-10-03.

## Decisions (ratified 2026-10-03)

| Question | Decision |
|---|---|
| Where it's earned | A **Bomb Trial** Puzzle Room — a new template in the Corridor's North-descent pool, a sibling of `whip_trial` / `boomerang_trial` / `torch_trial` ("a room just like boomerang and whip"). Its pedestal grants the bag; the room is solved with bombs. |
| Inventory model | Takes **one quick slot**, like a stacked trap. Bombs the player crafts or picks up merge into it. Thrown with the existing consumable-use input — no new key. |
| "1 free bomb per room" | **Free charge + separate stock.** One free charge refills on every room entry and is thrown first. Crafted/picked-up bombs are a separate stock, spent only once the free charge is gone; unused stock carries between rooms. The bag itself is never consumed. |
| What it throws | The plain **Bomb** (today `'@'`; re-keyed in Phase 0). Not the Remote Bomb (a TRAP with its own 3-charge model). |
| Ammo cap | None — balanced by acquisition cost (the Trial roll + crafting cost), per the consumable balance philosophy. |
| Bomb glyph | `'@'` is wrong: a crafted item must be a Unicode symbol (Character Encoding Rule), and `'@'` also collides with the `'@'` enemy key in `enemies.js`. Re-key it. |

## Phases

### Phase 0 — Re-key Bomb off `'@'`
- Pick the glyph (open question 1). Candidates confirmed unused in `src/`: `⦿` (proposed), `⊗`, `❂`, `⊕`.
- Re-key `ITEMS['@']` and every *item* reference to it: `recipes.js` (2 recipes make it — Fire+Goo, Firecracker×2; 4 consume it — Smoke Bomb, Exploding Mace ×2, Explosive Bow), the enemy drop at `enemies.js` ~1313, rarity/drop tables, CheatMenu spawn lists, simulator/tools. Most `'@'` hits in `src/` are the **player glyph** and must not be touched — grep each by context.
- `npm run check:data` will catch dangling references. Separate commit before any bag work.

### Phase 1 — Bomb Bag item + ammo model
- New `ITEMS` entry **Bomb Bag** (Unicode symbol glyph — open question 2), consumable, `manualOnly`, **not** `oneShot`; explosion stats read from the Bomb entry (single source — no copied damage/radius).
- Instance fields `freeCharge` (0/1) and `stock` (n), initialized in the item factory (no lazy init).
- Use: spend `freeCharge` if 1, else `stock` if > 0, else no-op. The throw goes through the existing Bomb windup path (`ConsumableWindupEffects` → `cavernSystem.bombBlast`), so bombable rocks/walls work unchanged.
- Merge: a Bomb picked up or crafted while the bag is in a quick slot → `stock += 1` instead of taking a slot. Hooks next to `mergeStackableConsumable` in `InventorySystem`.
- Refill: `freeCharge = 1` on room entry, from the same call site as `TrapSystem.resetTrapsForNewRoom()` (owner: a small `BombBagSystem`, or TrapSystem's per-room refill if it generalizes cleanly — decide during the code pass; not main.js).
- HUD: slot count shows `freeCharge + stock`; the free charge reads visually distinct (glyph brightness) — no text hint (non-instructive rule).
- The bag is ordinary inventory: lost on death with everything else. Item-instance state, so no Reset Registry entry needed — confirm with `node tools/check-reset-parity.mjs`.

### Phase 2 — Pedestal accepts a non-weapon
- `pickWeaponTutorial()` (`src/data/dungeon/weaponTutorials.js`) and the dungeon editor's save-time validation (`tools/dungeon-editor/main.js` ~363) accept only WEAPONs. Generalize to "pedestal item" (WEAPON or the Bomb Bag); recipe is null → empty flank Slots, already supported.
- Keep the template field name `weaponChar` unless the rename is cheap across editor + 3 templates (glossary decides).

### Phase 3 — Bombable wall cell for puzzle templates
- Puzzle grids have no bomb-breakable cell today; `bombable_rock` exists only in Caverns. Add a grid glyph (proposed `B`) to `dungeonPuzzleTemplates.js`: solid, indestructible to everything but a Bomb blast, looks like ordinary wall (same "which wall gives way" secret as the Cavern rock).
- Generalize `CavernSystem.bombBlast` so the bombable-object check isn't Cavern-only (it already filters `_activeBackgroundObjects()` by `data.bombable`, so a dungeon wall object with `bombable: true` may need only the Cavern-door reveal kept conditional).
- Dungeon editor: a `B` paint tool + legend entry.
- Interior PiP render: `HutInteriorOverlay` draws the wall/crack state (uniform layer rule — both planes).

### Phase 4 — Author `bomb_trial.json`
- Layout drafted in the dungeon editor (Puzzle mode); Claude drafts a first pass, the user refines.
- Pedestal grants the bag at the entrance; switches/panels sit behind `B` walls; exit `X` unlocks when all triggers are active (existing trigger contract — no new puzzle logic).
- Design constraint from the ammo model: the player arrives with **one free charge** (plus whatever stock they carried in). See open question 3.
- Import + map entry in `PUZZLE_ROOM_TEMPLATES`; `weight: 1`.

### Phase 5 — Glossary + verification
- GLOSSARY.md entries for **Bomb Bag** and **Bomb Trial** (and the bombable puzzle wall), written in the commits that introduce them.
- `npm run build`, `node tools/check-reset-parity.mjs`, CheatMenu playtest (spawn bag; zone-jump into the dungeon; the Corridor roll can be forced via CheatMenu if a puzzle-room picker exists — otherwise add one).

## Open questions (resolve before/while coding the named phase)

1. **Bomb glyph** (Phase 0): `⦿` proposed.
2. **Bomb Bag glyph** (Phase 1): needs a Unicode symbol that reads as a bag/sack; not chosen.
3. **Bomb Trial budget** (Phase 4): with one free charge per room, should the trial be solvable with exactly one bomb (place it where the blast reaches two `B` walls at once — the room teaches blast radius), or does "room entry" include re-entering the trial from the Corridor so a wasted bomb is recovered by stepping out and back?
4. **Does a dungeon floor / side room count as a "room"** for the free-charge refill? Proposed: yes — every floor transition and surface room entry refills.
5. **Crafting with stocked bombs** (Phase 1): can the four recipes that consume a Bomb draw from the bag's `stock`? Proposed: yes, via `itemCostDispatch` — otherwise merging into the bag silently removes Bombs from crafting.
