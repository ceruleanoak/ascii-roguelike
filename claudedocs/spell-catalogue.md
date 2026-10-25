# Spell Catalogue — Release Scope

The release set of adventure-style Spells: the words a player can type to do what the keys already do, plus the narrator's answers. This is the build queue. When a row ships, flip its status here. Registry: `src/data/spells.js`. Matcher: `src/systems/SpellSystem.js`. Terms: `GLOSSARY.md` (Spell, Beeline).

These are called **Spells**, never "commands". *Command* belongs to `CommandSystem` (the CALL/COMMAND true-name charm).

**Status key:**
- **shipped**: was in the game before this catalogue.
- **built**: built with this catalogue (2026-10-25).
- **queued**: in scope, not yet built.
- **open**: in scope, but a design question blocks the build.

## Grammar

1. **Compound words, no spaces.** GOWEST, not GO WEST. SPACE, Shift or Enter submits the buffer.
2. **At most 9 letters.** That is the `game.keyBuffer` cap. A verb plus object has to fit, so HEADSOUTH (9) is the ceiling.
3. **Longest match wins.** The matcher scans the buffer's suffixes from longest to shortest, so GOWEST fires GOWEST and not WEST.
   - Junk typed *before* a word never blocks it: XFIND fires FIND.
   - Letters typed *after* a word do: FINDE fires nothing.
4. **No 1–2 letter whole Spells.** Under longest match, a short tail word would fire on almost any SPACE. Short answers (Y, OK, NO) are follow-ups only, active while a Spell is awaiting them.
5. **Glyph targets.** A target is `VERB + <glyph>`, where the glyph is the letter or digit of an entity in the active room. Examples: LOOKR for the rat, GOH for a hut, FIGHTR. The glyph is what the player sees, and it costs one keystroke instead of a name.
   - Registered words beat glyph targets, so GOWEST is a word and not GO + W + EST.
   - **Open:** GOW, GOE, GON and GOS. When the glyph is also a direction initial (a `W` Well-room NPC, an `E` enemy), which wins? Options: the entity always wins (directions are already spelled out in full), or direction letters can never be targets.
6. **Voice.** Every response is the THREE's voice: terse, uppercase, center-screen. It never names items, explains a mechanic or gives an instruction (CLAUDE.md, "Spell text is the THREE's voice alone"). A successful action Spell is silent (`response: null`). A refusal is one short line.
7. **Route to the owner.** Every Spell calls the system that already owns the action. A Spell never re-implements behavior, and none of its logic lives in `main.js`.
8. **The key clash is accepted.** WASD, the Q/E/Z/C dodges and R still fire while a word is typed. Typing a word mid-fight is a choice the player makes. Enter is the clean submit.

## Movement

| Word(s) | Effect | Owner | Gate | Status |
|---|---|---|---|---|
| GONORTH / GOEAST / GOWEST / GOSOUTH, HEADNORTH / HEADEAST / HEADWEST / HEADSOUTH | **Beeline** to that exit in one straight line, then the normal exit warp | `BeelineSystem.cast` | Exit open (`ExitSystem.isExitOpen`; REST: north, or south on a Cursed run). No Barricade standing across the lane (`BarricadeSystem.standsAcross`). Not inside an interior. | built |
| GOREST | Same as GOSOUTH in EXPLORE (south is the way back to REST) | `BeelineSystem.goRest` | EXPLORE only, otherwise '...NOTHING.'. After that, GOSOUTH's checks apply. | built |
| ESCAPE / FLEE | Drop every weapon at the player's feet (the escape route opens), then check the south exit and Beeline to REST. Going to REST deletes everything the player dropped (`droppedByPlayer`), so the weapons are gone for good. | `BeelineSystem.escape` → `TrapSystem.dropLoadout` | EXPLORE only (REST answers ONLY ONE WAY.). The drop always happens; the exit check (REST not sealed) comes after it, like any GO. | built |
| GO<glyph> | Beeline to that hut, NPC or door. On arrival, run the owner's interaction (hut door → `InteriorManager.enterFloor`). | `BeelineSystem` + the target's interaction owner | Target visible in the active room | queued (see grammar 5 for the open part) |
| GOOUT / LEAVE | Leave the current interior | `InteriorManager.exitFloor` | Inside a floor | queued |
| GODOWN | Take the stairs / descent | Dungeon floor owner | Stairs present and open | queued |

Refusal lines are drafts to tune:
- `SHUT.`: the exit is closed.
- `SOMETHING BARS THE WAY.`: a Barricade stands across the lane.
- `...NOTHING.`: wrong state, inside an interior, or already moving.

**Barricade note.** Barricades of material plugs never set `cleared` when they break. The lava moat (a hazard plug) never lifts. So `standsAcross` checks whether any plug object is still in the room, and does not read the flag. No poison Barricade exists yet. A future hazard Barricade is covered by the same generic plug check.

## World interaction

| Word(s) | Effect | Owner | Gate | Status |
|---|---|---|---|---|
| FIGHT | Auto-combat against the nearest enemy until none are left or the next keypress. The player is driven: `steerToward` headings become held WASD on the normal movement path; in range the player faces the target and attacks through `CombatSystem.tryUseHeldWeapon`, or the Punch when unarmed. Charged weapons release when full. Re-targets as enemies fall. Damage still lands. Refusals: `NO ONE.` (no enemy), `...NOTHING.` (not EXPLORE / already moving). | `FightSystem` | EXPLORE, an enemy on the player's plane | shipped |
| FIGHT<glyph> / ATTACK<glyph> | Auto-combat against that enemy. The player is driven by the companion AI: steered with `steerToward` and attacking through `CombatSystem.tryUseHeldWeapon`, as the `CompanionSystem` / `CommandSystem` charm loop does. | new mechanic over `npcSteering` + `CombatSystem` | Target enemy visible, weapon held | open (bare FIGHT shipped) |
| CRAFT | Craft one random Recipe from what is on hand (pile, coins, meter Mana, carried items; the Item Chest in REST only). The pair is spent and claimed as at the REST station, and recorded in its pair memory. Forge Recipes never; golem Recipes skipped at the cap. Silent on success (the pickup box answers); `...NOTHING.` when nothing is craftable or outside REST/EXPLORE. | `CraftSpellSystem` | REST or EXPLORE | shipped |
| TALK<glyph> | Open dialogue with that NPC from anywhere in the room | `DialogueSystem` | NPC in room | queued |
| OPEN | Open the nearest container / the REST chest popup | `InteractionSystem.openContainer` | Container in room | queued |
| FISH | Cast at the nearest fishable water | `FishingSystem` | Rod held, water in room | queued |
| PUSH | Push the adjacent Push Rock | `PushRock` | Push Rock adjacent | queued |

**FIGHT answers (bare FIGHT, shipped 2026-10-25):** damage still lands on the player; any keypress ends it (the casting SPACE doesn't); it re-targets when the target dies and ends once none are left. Open for FIGHT<glyph>: whether a named target ends the fight on its death.

## Meta / narrator

| Word(s) | Effect | Owner | Status |
|---|---|---|---|
| LOOK, LOOKHERE/HERE, LOOKZONE/ZONE, LOOKCOLOR/COLOR, LOOKNORTH/EAST/WEST (+ bare), LOOKWEAPON/WEAPON, LOOKARMOR/ARMOR, LOOKENEMY, FIND, AREYOU | Narrator descriptions | `spells.js` | shipped |
| LOOK<name> / <name> | Describe an enemy by name | `SpellSystem` fallback (`_describeEntity`) | shipped |
| LOOK<glyph> | Same fallback, keyed by glyph, and extended to huts, NPCs and Background Objects | `SpellSystem` fallback | queued |
| LOOKSOUTH / SOUTH | Describe the south exit (the gap today) | `spells.js` | queued |
| NEUTRAL `spellDescription`s | NEUTRAL rooms always say A QUIET PLACE. today. Author a line per room. | `neutralRooms.js` | queued |
| WAIT | Time passes. The THREE answers. | `spells.js` | queued |
| XYZZY, PLUGH | Adventure-canon nods | `spells.js` | queued |
| SCORE | The THREE's answer about the run (no numbers shown that the UI doesn't already show) | `spells.js` | queued |
| PRAY | The THREE's answer, possibly zone-flavored | `spells.js` | queued |

Already shipped utility Spells that stay as they are: CLEANSE, HEAL, UNCURSE, REVIVE, CONTINUE, BRIDGE, SIT/SITDOWN, CALL/COMMAND, HEX (learned), FROG (learned), CHEAT, EXIT.

## Excluded

- **Inventory verbs** (USE, DROP, SWAP, EQUIP…). A word costs more keystrokes than the key it replaces. That's no use to the player.
- **The Three Room meta layer** (HEREISONE … TISTHREE, WHATIS…). This is hidden canon and stays outside the release catalogue.
