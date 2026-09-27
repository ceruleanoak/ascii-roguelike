# Feature Inbox

Quick-capture list for feature/content ideas noticed during play/dev, before they've been triaged. Add a line, no format friction.

**This is a work queue, not a ledger.** It holds only unimplemented ideas — nothing else. The moment an idea is built (or deliberately dropped), delete its line — don't mark it, don't archive it here. If it needs a durable record instead, that's `docs/adr/` (architecturally significant decisions) or a `claudedocs/*.md` design doc — this file must not duplicate either.

Just one idea per line below, plain text.
Slime trails conducts electricity, and lightning strikes as well as electric currents (or rather objects that have electricity like lightning rod) can trigger traps such as slime bomb
After goo dragon is defeated, every exit should be one of the remaining colors not defeated (red, cyan, yellow). If all zone bosses have been defeatd, the north exit is always gray.
New Frozen enemy/player state tied to ice affinity: a longer stun than existing status effects, breakable early via general key-press mashing, and greatly reduced (broken out faster) by dodge-rolling specifically; red character's dodge roll does double the reduction of other characters. Needs Enemy State spine entry + GLOSSARY.md term before implementation (no player-side full-freeze state or "pip"-as-resource concept exists yet — "pip" is only the status-effect dot-count UI).
Water should wash off slime status and deep water and wet should be one status pip combined. 1 for wet, 3 pips take damage. Progressive increase in slow for each pip