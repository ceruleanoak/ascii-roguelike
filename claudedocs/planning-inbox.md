# Planning Inbox

Quick-capture list for work too large or too design-heavy for the feature/bug inboxes: each entry needs **its own session and plan** (plan mode, design questions, possibly an ADR) before any code is written. Loaded into context every session via `CLAUDE.md`.

**This is a work queue, not a ledger.** The moment an entry gets its planning session, delete its line here; the plan, design doc, or ADR becomes the durable record.

Just one item per line below, plain text.
Mist Battle Act 2 + wiring: Act 1's controlled Trine is built behind the CheatMenu BOSSES entry (MistBattleSystem). Still to design: what ends Act 1 (a wave count? a final foe?), the brief delay, Act 2's input-less seeded auto-battle between the three lost characters → credits (claudedocs/zone-cosmology.md, "The True Ending — the Mist Battle"), and wiring the 3rd gray mist-out (GrayZoneSystem `graySnapshots`/`lostCharacters`) into it instead of the full reset. Also: does "Win it" (all 4 bosses) get an end beat, and the gray narrator line 'FIVE MUST BECOME ONE.' (zones.js) predates the threshold of 3.
Push Rock hidden descents: a Push Rock (src/systems/PushRock.js) that, once shoved, reveals a dungeon descent footprint that was inactive until then (the Zelda 1 "push the block, the stairs appear" secret). Barricade and Puzzle Room wiring is already shipped. Still to design: where the revealed descent leads (a new floor? an existing Vault? a Cavern-like secret?), which rooms may hold one, and how the footprint reads before and after it is revealed.
