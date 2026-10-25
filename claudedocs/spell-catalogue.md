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
| EXPLORE | Same as GONORTH in REST (north is the way out to EXPLORE) | `BeelineSystem.goExplore` | REST only, otherwise '...NOTHING.'. After that, GONORTH's checks apply. | built |
| ESCAPE / FLEE | Drop every weapon at the player's feet (the escape route opens), then check the south exit and Beeline to REST. Going to REST deletes everything the player dropped (`droppedByPlayer`), so the weapons are gone for good. | `BeelineSystem.escape` → `TrapSystem.dropLoadout` | EXPLORE only (REST answers ONLY ONE WAY.). The drop always happens; the exit check (REST not sealed) comes after it, like any GO. | built |
| ENTER | Beeline to whichever door in the room is nearest (any hut, an opened Cavern, the Maze) and go in, same as the specific form | `BeelineSystem.enter` | EXPLORE, on the surface. `...NOTHING.` with no door (a Cavern behind its rock isn't one); `SHUT.` when every door is closed. | built |
| EXIT | Leave whichever hut, Cavern or Maze the player is in, same as EXITHUT / EXITMAZE. (Closing the game moved to CLOSEGAME / EXITGAME.) | `BeelineSystem.exit` | Inside a hut, Cavern or Maze, otherwise `...NOTHING.`; EXITMAZE's `SHUT.` applies in a sealed Maze. | built |
| ENTERHUT | Beeline to the nearest hut door the player could go in by (in a Settlement, the closest of its huts) and go in on arrival. Stops on the open cell beside the door, so the way back out lands somewhere walkable. With no hut in the room, an opened Cavern counts. | `BeelineSystem.enterHut` → `HutSystem.enterHut` | EXPLORE, on the surface. `...NOTHING.` with no hut in the room; `SHUT.` when every hut is closed (a raised Witch hut, a locked Shed while full-size). | built |
| EXITHUT | From inside a hut (or a Cavern), Beeline to its door and step out | `BeelineSystem.exitHut` → `HutSystem.exitHut` | On a hut floor, otherwise `...NOTHING.` | built |
| OPENCAVE | Beeline to the Bombable Rock hiding the room's Cavern and break it, through the same path a bomb takes (`CavernSystem.bombBlast`). Force, best first: a Sledgehammer or Onyx Hammer in a quick slot (kept), an equipped Bomb (spent), a Remote Bomb (one room charge). Spent on arrival. | `BeelineSystem.openCave` → `CavernSystem.openHiddenDoor` | EXPLORE, on the surface. `...NOTHING.` with no hidden Cavern; `TOO HARD.` with no force carried. | built |
| ENTERCAVE | Beeline to the opened Cavern door and go in | `BeelineSystem.enterCave` → `HutSystem.enterHut` | EXPLORE, on the surface. `...NOTHING.` with no Cavern; `SHUT.` while its rock still stands. | built |
| EXITCAVE | From inside a Cavern, Beeline to its door and step out | `BeelineSystem.exitCave` → `HutSystem.exitHut` | On a Cavern floor, otherwise `...NOTHING.` | built |
| ENTERMAZE | Beeline to the room's Maze door and go in | `BeelineSystem.enterMaze` → `MazeSystem.enterMaze` | EXPLORE, on the surface, with a Maze in the room (`...NOTHING.`). A Maze once left is sealed (`SHUT.`). | built |
| EXITMAZE | From inside the Maze, Beeline to the south exit and leave | `BeelineSystem.exitMaze` → `MazeSystem.exitMaze` | In the Maze (`...NOTHING.`); `SHUT.` while its exits are sealed | built |
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
| FIGHT | Auto-combat against the nearest enemy until none are left or the next keypress. The player is driven: `steerToward` headings become held WASD on the normal movement path; in range the player faces the target and attacks through `CombatSystem.tryUseHeldWeapon`, or the Punch when unarmed. Charged weapons release when full. A held trap is spent first, from a distance, through the SPACE throw (`TrapSystem` charge/release): a trap lands about as far out as the nearest enemy, a wire end flies in a random direction at a random power; placed Remote Bombs go off once an enemy is in a blast and the player isn't. A trap with no charges, or a gun/bow out of ammo for the room, swaps slot (`handleSelectSlot`): a weapon first, then another trap, then empty hands. Re-targets as enemies fall. Damage still lands. Refusals: `NO ONE.` (no enemy), `...NOTHING.` (not EXPLORE / already moving). | `FightSystem` | EXPLORE, an enemy on the player's plane | shipped |
| FIGHT<glyph> / ATTACK<glyph> | Auto-combat against that enemy. The player is driven by the companion AI: steered with `steerToward` and attacking through `CombatSystem.tryUseHeldWeapon`, as the `CompanionSystem` / `CommandSystem` charm loop does. | new mechanic over `npcSteering` + `CombatSystem` | Target enemy visible, weapon held | open (bare FIGHT shipped) |
| CRAFT | Craft one random Recipe from what is on hand (pile, coins, meter Mana, carried items; the Item Chest in REST only). The pair is spent and claimed as at the REST station, and recorded in its pair memory. Forge Recipes never; golem Recipes skipped at the cap. Silent on success (the pickup box answers); `...NOTHING.` when nothing is craftable or outside REST/EXPLORE. | `CraftSpellSystem` | REST or EXPLORE | shipped |
| TAKEALL | Every ingredient and item on the player's layer flies to the player and is taken; slot choices are skipped (armor/consumables into the bag, weapons/traps into the Item Chest, deferred in the field). Skips other planes/layers, vault coins, full piles, Cursed scrolls. Silent on success; `NOT YET.` (enemies left / exits shut), `...NOTHING.` (nothing to take / wrong state). | `TakeAllSystem` | REST, EXPLORE or NEUTRAL; no counted enemy, exits open | shipped |
| GETLAVA / GETWATER / GETMUD / GETFAIRY | Take that liquid or a fairy from anywhere in the room the player could walk to, without contact. Liquids fill the first equipped Empty Bottle; GETWATER prefers a hot spring, then the fountain pool, then trough/plain water, then electrified water. GETFAIRY needs no bottle: caught with one, else heal (hurt) or +1 max HP (full); the Fairy King only into a bottle. Reach = flood over the player's steering terrain (walls, solids, lava, deep water block). Silent on success; `NO BOTTLE.` (liquid, none equipped), `...NOTHING.` (nothing in reach / wrong state). | `GetSpellSystem` | REST, EXPLORE or NEUTRAL | shipped |
| CHOP / MINE / HARVEST | Farm the room until none are left or the next keypress. CHOP: Trees, with an axe. MINE: Rocks (rock-harvest objects), with the pickaxe or a hammer. HARVEST: both, working the held tool's material before swapping (`handleSelectSlot`), then Tall Grass with any blade, densest cell first, until every blade is cut, then Sand with any non-blunt melee weapon. Driven like FIGHT (`HeldKeySteering`) to the open cell beside the nearest target; faces it and swings through `CombatSystem.tryUseHeldWeapon`, so drops are the ordinary harvest. Skips Barricade material, obsidian, indestructible/yield-nothing objects, other planes; gives up on a target not neared or damaged for 4s. Damage still lands. Silent on success; `...NOTHING.` (no tool in the quick slots, nothing to farm, not EXPLORE, already moving). | `HarvestSystem` | EXPLORE; a tool in the quick slots | shipped |
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

Already shipped utility Spells that stay as they are: CLEANSE, HEAL, UNCURSE, REVIVE, CONTINUE, BRIDGE, SIT/SITDOWN, CALL/COMMAND, HEX (learned), FROG (learned), CHEAT, CLOSEGAME/EXITGAME (renamed from EXIT 2026-10-25).

## Excluded

- **Inventory verbs** (USE, DROP, SWAP, EQUIP…). A word costs more keystrokes than the key it replaces. That's no use to the player.
- **The Three Room meta layer** (HEREISONE … TISTHREE, WHATIS…). This is hidden canon and stays outside the release catalogue.
