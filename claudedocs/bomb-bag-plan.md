# Bomb Bag — Plan

Source: feature inbox → planning inbox ("Add Bomb Bag as a Dungeon Puzzle. Use 1 free bomb per
room. Crafting bombs increases the ammo count."). Planned 2026-10-03.

## Decisions (ratified 2026-10-03)

| Question | Decision |
|---|---|
| Where it's earned | A **Bomb Trial** Puzzle Room — a new template in the Corridor's North-descent pool, a sibling of `whip_trial` / `boomerang_trial` / `torch_trial` ("a room just like boomerang and whip"). Its pedestal grants the bag; the room is solved with bombs. |
| Inventory model | Takes **one quick slot**, like a stacked trap. Bombs the player crafts or picks up merge into it. Thrown with the existing consumable-use input — no new key. |
| "1 free bomb per room" | **Free charge + separate stock.** One free charge refills on every room entry and is thrown first. Crafted/picked-up bombs are a separate stock, spent only once the free charge is gone; unused stock carries between rooms. The bag itself is never consumed. |
| What it throws | The plain **Bomb** (`'⊗'`, re-keyed from `'@'` in Phase 0). Not the Remote Bomb (a TRAP with its own 3-charge model). |
| Ammo cap | None — balanced by acquisition cost (the Trial roll + crafting cost), per the consumable balance philosophy. |
| Bomb glyph | Re-keyed `'@'` → `'⊗'`. `'@'` broke the Character Encoding Rule (crafted items are Unicode symbols) and collided with the `'@'` enemy key in `enemies.js`. |
| Bomb Bag glyph | `'⊟'` — a satchel: body with a flap line. |
| Bomb stock | **The stock is the Bombs in the consumable list** (`consumableInventory`) — no hidden counter. The bag's ammo = free charge + Bombs in the list, so crafted Bombs show in the list and stay usable as crafting ingredients. With the bag equipped, a picked-up Bomb goes straight to the list instead of contesting a slot. |
| Free-charge refill | On room exit, at the same call sites as `TrapSystem.resetTrapsForNewRoom()` — "just like traps". |
| Bomb Trial budget | Needs **several** bombs. When the bag is depleted inside the Trial (no free charge, no Bombs in the list) and the room is unsolved, a Bomb drops onto a **dais** — teaching that the bag is refillable. |

## Phases

### Phase 0 — Re-key Bomb off `'@'`
- Re-key `ITEMS['@']` → `'⊗'` and every *item* reference to it: `recipes.js` (2 recipes make it — Fire+Goo, Firecracker×2; 4 consume it — Smoke Bomb, Exploding Mace ×2, Explosive Bow), the enemy drop at `enemies.js` ~1313, rarity/drop tables, CheatMenu spawn lists, simulator/tools. Most `'@'` hits in `src/` are the **player glyph** and must not be touched — grep each by context.
- `npm run check:data` will catch dangling references. Separate commit before any bag work.

### Phase 1 — Bomb Bag item + ammo model
- New `ITEMS['⊟']` **Bomb Bag**, consumable, `manualOnly`, **not** `oneShot`, effect `explode`; explosion stats read from `ITEMS['⊗']` (single source).
- Instance field `freeCharge` (0/1), initialized at creation.
- Use (manual trigger): spend `freeCharge` if 1, else remove one Bomb from `consumableInventory`, else refuse to fire. No cooldown, never spent from the slot. Throw resolves through the existing `explode` windup → `cavernSystem.bombBlast`.
- Pickup: with the bag equipped, a Bomb goes to `consumableInventory` (no slot choice).
- Refill: `freeCharge = 1` beside both `resetTrapsForNewRoom()` call sites in main.js (dispatch only — logic in the owning system).
- HUD: slot count shows `freeCharge + Bombs in list`; no text hints.
- Item-instance state, lost with inventory on death — no Reset Registry entry; confirm with `check-reset-parity`.

### Phase 2 — Pedestal accepts a non-weapon
- `pickWeaponTutorial()` (`src/data/dungeon/weaponTutorials.js`) and the dungeon editor's save-time validation (`tools/dungeon-editor/main.js` ~363) accept only WEAPONs. Generalize to "pedestal item" (WEAPON or the Bomb Bag); recipe is null → empty flank Slots, already supported.
- Keep the template field name `weaponChar` unless the rename is cheap across editor + 3 templates (glossary decides).

### Phase 3 — Bombable wall cell for puzzle templates
- Puzzle grids have no bomb-breakable cell today; `bombable_rock` exists only in Caverns. Add a grid glyph (proposed `B`) to `dungeonPuzzleTemplates.js`: solid, indestructible to everything but a Bomb blast, looks like ordinary wall (same "which wall gives way" secret as the Cavern rock).
- Generalize `CavernSystem.bombBlast` so the bombable-object check isn't Cavern-only (it already filters `_activeBackgroundObjects()` by `data.bombable`, so a dungeon wall object with `bombable: true` may need only the Cavern-door reveal kept conditional).
- Dungeon editor: a `B` paint tool + legend entry.
- Interior PiP render: `HutInteriorOverlay` draws the wall/crack state (uniform layer rule — both planes).

### Phase 4 — Author `bomb_trial.json` + the dais
- Pedestal grants the bag at the entrance; several `B` walls hide switches/panels; exit `X` unlocks when all triggers are active (existing trigger contract).
- **Dais**: a template marker (`dais: { row, col }`). While the room is unsolved and the bag is depleted (no free charge, no Bombs in the list, no Bomb already lying on the dais), a Bomb is dropped on it. Owner: `DungeonPuzzleSystem._updatePuzzleRoom`.
- Layout: Claude drafts the first pass; the user refines in the dungeon editor (editor gains a Dais tool).
- Import + map entry in `PUZZLE_ROOM_TEMPLATES`; `weight: 1`.

### Phase 5 — Glossary + verification
- GLOSSARY.md entries for **Bomb Bag**, **Bomb Trial**, **Dais** (and the bombable puzzle wall), written in the commits that introduce them.
- `npm run build`, `node tools/check-reset-parity.mjs`, CheatMenu playtest (spawn bag; zone-jump into the dungeon; the Corridor roll can be forced via CheatMenu if a puzzle-room picker exists — otherwise add one).

## Open questions

All resolved 2026-10-03 (see Decisions).
