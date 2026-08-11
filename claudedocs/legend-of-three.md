# The Legend of Three — per-zone item list

Companion doc to `zone-cosmology.md` § "The Legend of Three — Canon speaking".
Read that section first — this file is just the table it points to.

Each zone marries its word/verb to all three registers of Canon (**Justice**,
**Truth**, **Help**) as one item per register. Where an existing catalog item
(`src/data/items.js`) already carries the meaning, it's used as-is. Where
nothing fits, a new item is proposed and marked **NEW** — not yet built.

**Display rule carries over unchanged:** nothing on screen ever spells out
"Justice," "Truth," or "Help." The item and how it was earned *is* the
statement — same discipline as every other non-instructive system in the game.

**Intended consumption:** this list is meant to seed what shows up as notable
finds inside Dungeon interiors (`DungeonSystem`) — not wired into any loot
table yet. Treat this file as the design source, not an implementation.

---

## Green (Greed · Acquire)

| Register | Item | Status | Why |
|---|---|---|---|
| **Justice** | Lucky Coin `★` | existing | Passive luck/crit/dodge — fate literally returning what's deserved; the cosmic ledger expressed as a stat. |
| **Truth** | Compass | **NEW** | Locates treasure. *Build note: this is nearly identical to the existing Path Amulet (`o`, `pathTracker`, passive) — reskinning that item is probably cheaper than building a second one from scratch. Flag before implementing.* |
| **Help** | Bread `⌬` | existing | Un-transactional generosity — feeding it away is what earns crow/rat companionship. |

## Cyan (Stillness · Anticipate)

| Register | Item | Status | Why |
|---|---|---|---|
| **Justice** | Freeze Ray `ᛁ` | existing | Reframed explicitly through **time**, per Cyan's own spine (Anticipate = "before," the slow tempo you set): it arrests time for the target — the consequence for moving when the zone asked you to hold still. |
| **Truth** | Spectacles `⊙` | existing | "SEE THE WORLD RELABELED" — decodes what's hidden in plain sight. *Caveat: currently obtained via Maze, which isn't mechanically exclusive to Cyan today — thematic fit, not a hard gate.* |
| **Help** | Prayer Beads | **NEW** | Equips as **armor**; effect deliberately **unknown** — no stat readout on pickup or equip. *Author's inference, confirm before building: this takes Cyan's "reward for stillness is seeing what the hurried miss" and extends it to the game's own UI — you wear it and observe, same as the rabbit.* |

## Yellow (Storm · Channel)

| Register | Item | Status | Why |
|---|---|---|---|
| **Justice** | Lightning Sword `Ꞩ` | existing | `callsLightning` — judgment called down, not swung; the oldest image of divine justice there is. |
| **Truth** | Conductor's Rod | **NEW** | Reveals conductive terrain (crystal / metal / puddle) before you commit to a channel. |
| **Help** | Mana Potion `🜛` | existing | Grants the capacity to channel — aid as the *means*, not the result. |

## Red (Reaction · React)

| Register | Item | Status | Why |
|---|---|---|---|
| **Justice** | Hammer `⊥` | existing | The canonical boulder-deflect tool — the world's aggression turned back on itself. |
| **Truth** | Fire Berry `❋` | existing | Passive light (Red-native, Ember Bush drop) — truth as light in the dark, the fire-flavored twin of Cyan's ice-flavored Justice pick. |
| **Help** | Phoenix Feather `✦` | existing | One death save — aid arriving in the instant, matching Red's tempo exactly. |

## Gray (terminus · Death)

| Register | Item | Status | Why |
|---|---|---|---|
| **Justice** | Bone Dust `ᐧ` | existing, tentative | The dead's judgment overwhelming a trespasser. Weakest fit of the whole list — not gray-exclusive, revisit if a better candidate turns up. |
| **Truth** | Artifact `⚜` | existing | Grave-good, trades to the Wise Fellow for a rare hint — the dead's knowledge, passed forward. |
| **Help** | *(unnamed)* | **NEW**, most speculative | The deliberate exception to `"NO SHRINE ANSWERS HERE."` — something that pulls a companion back before the mist claims them. Touches `graySnapshots`/`lostCharacters` (the 3-lost-character Mist Battle / True Ending trigger) directly, so it needs balance thought before it's anything more than a name. |

---

## Open threads

- **Green Truth vs. Path Amulet** — likely a reskin, not a new build.
- **Cyan Truth (Spectacles) zone-exclusivity** — not enforced today; decide if it should be.
- **Gray Justice (Bone Dust)** — the one pick nobody should treat as settled.
- **Gray Help** — interacts with the True Ending trigger; design it deliberately, not casually.
