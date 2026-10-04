# Planning Inbox

Quick-capture list for work too large or too design-heavy for the feature/bug inboxes: each entry needs **its own session and plan** (plan mode, design questions, possibly an ADR) before any code is written. Loaded into context every session via `CLAUDE.md`.

**This is a work queue, not a ledger.** The moment an entry gets its planning session, delete its line here; the plan, design doc, or ADR becomes the durable record.

Just one item per line below, plain text.
Mist Battle Act 2 + wiring: Act 1's controlled Trine is built behind the CheatMenu BOSSES entry (MistBattleSystem). Still to design: what ends Act 1 (a wave count? a final foe?), the brief delay, Act 2's input-less seeded auto-battle between the three lost characters → credits (claudedocs/zone-cosmology.md, "The True Ending — the Mist Battle"), and wiring the 3rd gray mist-out (GrayZoneSystem `graySnapshots`/`lostCharacters`) into it instead of the full reset. Also: does "Win it" (all 4 bosses) get an end beat, and the gray narrator line 'FIVE MUST BECOME ONE.' (zones.js) predates the threshold of 3.
Dragon Forge: Scale recipes should stop working at the generic crafting table and need the Dragon Forge, found in the green B room after the Goo Dragon falls. Needs design: what the forge looks like and how you use it, and which recipes count as "scale recipes". Already done: Scale is epic-rarity everywhere, and the Goo Dragon drops 3.
Bomb Bag (from feature inbox): "Add Bomb Bag as a Dungeon Puzzle. Use 1 free bomb per room. Crafting bombs increases the ammo count." Needs design: which dungeon floor and what puzzle earns it (PuzzleSystem/KeyItemSystem), whether it's a key item or takes a slot, what "1 free bomb per room" means (one charge refilled on room entry, or a floor of one that crafted bombs stack on), any ammo cap, and whether the bag throws the Bomb (@) or Remote Bomb.
