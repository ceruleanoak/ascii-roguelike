# The Three's Voice — wishes, GIVE, and the sacred-item riddles

Planning doc for how the player comes to *talk with* the Three: how wish words and
the three sacred items (the True 3) are revealed. Scoped 2026-10-28; nothing here
is built yet. Build in the phases at the end, one session each.

Read with: `zone-cosmology.md` (Power of 3, Endings, Path to Canon),
`spell-catalogue.md` (Spell grammar), `GLOSSARY.md` (Three Room, Offering, True 3,
Cracked Slot, Cursed Run, Spell, Spell Sign).

---

## 1. What exists today

- **The Three Room** (`ThreeRoomSystem`, `threeRoom` in `neutralRooms.js`): three
  slots, the Globe of Offerings, the shut north door, Death. The Three itself barely
  speaks there.
- **The Three's lines** (`spells.js`, "The Three" section): `AREYOU` → NORTH.,
  `HEREISONE/TWO`, `REISTHREE` → RED. / CYAN. / YELLOW. (anywhere);
  `WHATISONE/TWO`, `TISTHREE` → ONE IS KNOWN. / TWO IS FOUND. / THREE IS TOLD.
  (Three Room only). `FIND` → `THREE` → YES. FIND US.
- **Wishes**: `game.wishesUsed` (0–3, run-scoped). Spent by CLEANSE (→YES), REVIVE /
  CONTINUE (at GAME_OVER), HEAL / UNCURSE (frog polymorph), BRIDGE (when materials
  are short). Each spend destroys quick slot 0, then 1, then 2. The spend is copied
  in four places: `WishSystem.executeCleanse`, `WishSystem.executeRevive`,
  `PolymorphSystem.cureViaWish`, `_buildBridgeAction` (`spells.js`, which only bumps
  the counter and does *not* destroy a slot — an inconsistency to fix in P1).
- **Hints for wishes**: only the Well's `WISHES ARE WORDS.` No wish word is taught.
- **Hints for the True 3**: the RED/CYAN/YELLOW + KNOWN/FOUND/TOLD chain above, the
  slot frames' torchlit colors (apex red, left cyan, right yellow), Wise Fellow
  lines (`LOST MY SPECTACLES...`, `THERE ARE THREE DIFFERENT BASE POTIONS.`,
  `DEATH FEARS ONLY THREE THINGS.`).

## 2. Ratified decisions (user, 2026-10-28)

1. **Stateless.** Every word has one fixed answer. No reveal ladder, no
   "has-been-told" flags. *Over time* = the player's vocabulary growing across runs —
   the mental save file.
2. **Sacred items: riddles only.** The voice never names an item and never shows its
   glyph.
3. **Wishes come in three kinds — POWER, INFLUENCE, GAIN.**
   - **POWER** — advantages in combat. CLEANSE is renamed **PURGE** (CLEANSE kept as
     an alias).
   - **INFLUENCE** — extracts value from NPCs, *even the Witch*.
   - **GAIN** — hints, or cheats that complete a room. **Every room has its own
     unique completion spell** (XCAVATE extracts the χ Blade in X; BRIDGE builds the
     Ridge's Gray entrance).
4. **GIVE** (in the Three Room): the THREE asks `POWER, INFLUENCE, OR GAIN?`.
   Answering one brings a white flash, a crack, and the name of a spell of that
   kind — random within the kind. **One Three Room slot cracks** and the Cursed Run
   begins.
5. **Wish spells cast inside the Three Room do not fire.** The THREE comments
   instead: POWER → `FOR ENEMIES.` · GAIN → `FOR GLORY.` · INFLUENCE →
   `FOR CONTROL.`
6. **Ordinary spells act normally in the Three Room.** Only wish spells and talk
   words get the Three's own answer.
7. **A known wish word still costs a wish to cast**: `USE NTH WISH?` → YES spends a
   wish and destroys a quick slot. Max 3 per run. Knowing a word is free; using it
   isn't.
8. **Cursed runs swap the Spell Sign table**: wish words appear in Spell Signs in
   place of the standard pool (TAKEALL, FIGHT…).
9. **Talk words are one family.** HELLO = TALK, the way WEST = LOOKWEST already.

### Second round (user, 2026-10-29)

10. **GIVE's slot mapping as proposed**: POWER → apex, GAIN → left, INFLUENCE →
    right. GIVE's question is **built from the kinds whose slots are still open**,
    so it changes with every crack (§5).
11. **A kind already given isn't offered**; typing it anyway gets `NO.`
12. **GIVE is a wish.** The kind question *is* its confirmation, so the answer
    spends one wish (no separate `USE NTH WISH?`).
13. **Cursed Spell Signs replace the standard pool** for the whole Cursed Run.
14. **INFLUENCE words act differently per NPC.** PERSUADE is the first one:
    `AS YOU WISH.` and any transaction the NPC offers happens without its cost.
    The Witch and the Wise Fellow know of the Three and fear it (§8).
15. **The Witch joins on a Cursed Run.** She offers to come along as a companion.
    **COMMAND convinces any NPC to join** (not all of them carry a weapon), and
    **any companion counts for the green Dungeon's panel puzzle**.
16. **No HI / HEY.** Grammar rule 4 stands.
17. **The Spectacles are cyan.** The Maze moves from yellow to cyan, and the Wise
    Fellow's sayings follow it (done 2026-10-29).
18. **No credits.**

## 3. How a player learns things (the reveal map)

Stateless, so "revelation" is entirely *where a word can be learned*:

| Knowledge | Learned from | Cost of learning |
|---|---|---|
| The Three can be talked to | Typing any talk word in the Three Room | none |
| Where/what the True 3 are | Riddle lines (§4), Wise Fellow, slot colors | none |
| That wishes exist / their kinds | The Three's comments when a wish word is cast in its room (§6); `GIVE`'s question | none / a crack |
| A specific wish word | `GIVE` (§5) | a wish + a cracked slot + the Cursed Run — the True 3 is lost this run |
| A specific wish word | Cursed Spell Signs (§7), read with Spectacles | already Cursed |
| A specific wish word | Memory from a past run | nothing — the mental save file |

The economy: **wish words are bought with the pure ending.** The only fast way to
learn them is to give up this run's True 3. A player who has paid once keeps the
word forever, and spends it later on a clean run for the price of one wish.

## 4. Talk family and the riddles

### Talk words (global aliases)

`HELLO`, `GREET`, `SPEAK` join `TALK` (`BeelineSystem.talk`) everywhere. `HI` / `HEY`
are not Spells, not even in the Three Room (grammar rule 4: they'd fire on any
buffer ending in HI).

### In the Three Room

There is no speaker, so `TALK` would answer `NO ONE.`. Here every talk word is
answered by the Three instead (one fixed line, drafts):

| Word | Line (draft) |
|---|---|
| TALK / SPEAK | `WE ARE LISTENING.` |
| HELLO / GREET | `HELLO, ONE.` |

### Sacred-item riddles

Each item is pinned by **register → color → provenance**, never by name. Existing
lines kept; new rows are drafts. Keys are the 9-letter buffer tails.

| Phrase | Key | Where | Line | Points at |
|---|---|---|---|---|
| WHERE IS ONE? | `HEREISONE` | anywhere | `RED.` (exists) | apex · Instinct · Onyx/Cinder Hammer |
| WHAT IS ONE? | `WHATISONE` | Three Room | `ONE IS KNOWN.` (exists) | a recipe the player already knows (Hammer + Onyx) |
| WHO IS ONE? | `WHOISONE` | Three Room | `IT HITS BACK.` *(draft)* | the hammer that turns the world's aggression back |
| WHERE IS TWO? | `HEREISTWO` | anywhere | `CYAN.` (exists) | left · Experience · Spectacles |
| WHAT IS TWO? | `WHATISTWO` | Three Room | `TWO IS FOUND.` (exists) | found, not made — the Maze |
| WHO IS TWO? | `WHOISTWO` | Three Room | `IT READS.` *(draft)* | the Spectacles reading Spell Signs |
| WHERE IS THREE? | `REISTHREE` | anywhere | `YELLOW.` (exists) | right · Convention · Mana Potion |
| WHAT IS THREE? | `TISTHREE` | Three Room | `THREE IS TOLD.` (exists) | the potion the Wise Fellow talks about |
| WHO IS THREE? | `HOISTHREE` | Three Room | `IT FILLS.` *(draft)* | the Mana Potion filling the meter |

**Spectacles are cyan (settled 2026-10-29).** The mismatch was real: the Maze's home
was yellow and so was `LOST MY SPECTACLES...`, while `HEREISTWO` answers CYAN. The
Maze now spawns in green and cyan (cyan is its home), and the saying moved to the
cyan Wise Fellow.

## 5. GIVE

**Gate.** Three Room only; elsewhere `...NOTHING.`.

**GIVE is a wish.** The kind question is its confirmation, the way `USE NTH WISH?`
is for the others, so answering it spends one wish through `WishSystem.spend` (a
quick slot is destroyed). It is all one wish: no second confirmation.

**Slots (ratified 2026-10-29).** A kind is *open* while its slot is empty: not
filled by an offering and not cracked.

| Kind | Slot | Register |
|---|---|---|
| POWER | apex | Instinct |
| GAIN | left | Experience |
| INFLUENCE | right | Convention |

**The question is built from the open kinds**, in the order Power, Influence, Gain,
and is rebuilt every time GIVE is typed:

| Open kinds | Question |
|---|---|
| all three | `POWER, INFLUENCE, OR GAIN?` |
| two | `POWER OR GAIN?` (any pair) |
| one | `GAIN?` (whichever is left) |
| none | `NO.` (no question asked) |

The full question is longer than the voice's usual ≤18 characters. It is the
author's line, so it stands.

**Flow.**
1. `GIVE` → the question. All three kind words are follow-ups.
2. Answering an **open** kind: spend the wish → white flash (reuse the
   `game.cleanseWave` render path in `RenderController`, or a ScreenFadeSystem
   stepped white, never a smooth ramp; see retro alpha quantization) → the kind's
   slot cracks → the THREE says the revealed spell's name, e.g. `XCAVATE.` →
   `ThreeRoomSystem._beginCurse` runs.
3. Answering a kind that **wasn't offered** (its slot is filled or cracked) →
   `NO.` No wish, no crack. Any other word → `...` and the awaiting state clears,
   as with EXITGAME's NO.
4. The revealed name is **random within the kind** (uniform over every Spell whose
   `wish` field matches).

**Edge cases.**
- **No wishes left** (`wishesUsed >= 3`) → `NO.` A fallback; the price of wishing
  is the curse itself, which deepens (§7b).
- **A GIVE crack is a Cracked Slot**: grayed, framed and counted as filled (no glyph
  — draw the crack over the empty frame). So three GIVEs open the north door, and
  Death is behind it. Three GIVEs also spend all three wishes, so no REVIVE is left
  for Death's touch.
- **Already Cursed** (an earlier wrong offering or GIVE): the flag isn't set twice,
  but the Undead still rise per crack — the existing `_beginCurse` behavior.
- **Music** advances per crack (`_advanceMusic`), the same as an offering.
- The Cursed Run makes the Three Room unfindable again, so all GIVEs of a run happen
  in one visit (up to 3).

## 6. The Three's comments

While `game.currentRoom.isThreeRoom`, any Spell carrying a `wish` field is
intercepted before it fires: no confirmation, no wish spent, no effect. The Three
answers:

| Kind | Line |
|---|---|
| POWER | `FOR ENEMIES.` |
| GAIN | `FOR GLORY.` |
| INFLUENCE | `FOR CONTROL.` |

Non-wish spells (LOOKWEST, TAKEALL, …) act normally. GIVE is the one wish word the
room answers by acting.

**Required exception — REVIVE / CONTINUE at GAME_OVER.** Death's touch happens *in*
the Three Room, so `currentRoom.isThreeRoom` is still true at the game-over screen.
The intercept must skip when the state is `GAME_OVER`, or the wish-revive that
`ThreeRoomSystem._resolveContactDeath` deliberately keeps live would be swallowed
(`WishSystem.executeRevive` already resumes NEUTRAL there).

## 7. Cursed Spell Signs

`generateSpellSign` (`src/systems/roomSigns.js`) draws from `SPELL_SIGN_SPELLS`
today. **For the whole Cursed Run** (`game.cursedRun`) it draws only from the
**cursed pool** instead: every Spell with a `wish` field (derived from `SPELLS`,
never a hand list that drifts). It's still the Greek cipher and still read by the
Spectacles. The curse teaches the words the curse made you pay for.

## 7b. The Cursed Run deepens

The cost of wishing is that the run becomes *more cursed* (user, 2026-10-29). All of
it is owned by `CursedRunSystem`, whose escalation is counted in cursed rooms
explored (`_roomsExplored`).

**Built already:**
- **The Three Room never appears again** on a Cursed Run
  (`ThreeRoomSystem.recordNorthTraversal` returns false while `game.cursedRun`).
- **Charon stops coming** after 4 cursed rooms (`charonVisit` → `'absent'`), returns
  once to say goodbye when REST gives way, then REST is sealed.
- **REST gives way** after 8 cursed rooms (`isRestDecayed`): a gray border, **no
  healing** (`carryRestHp`), and the Undead walking in through the south door.

**Not built — the player turns on themselves.** As the curse deepens:
- Dodges and attacks are **delayed**, or **don't happen at all**.
- The player **wanders on their own** into lava, poison and deep water.

These are new player-control effects. They should be owned by `CursedRunSystem` and
reach the player through one hook each (input delay/drop at the dodge and attack
paths, a drift vector in movement), rather than as checks scattered through
`Player.js`.

**The Curse Clock** (user, 2026-10-29). The curse accumulates over time from the
moment the Cursed Run begins. That moment is marked on the clock: a **second timer,
drawn in gray**, starts beside the run timer (`RunTimerSystem`, drawn bare in the top
right of the Tab inventory overlay). It is the same bare-digits format, no label. From
then on, in the background, the curse tracks two counts:

- **rooms explored** since the curse began (`CursedRunSystem._roomsExplored`, which
  exists);
- **broken slots** — every slot broken this run, of either kind. A wish is just
  another way of breaking a slot:
  - a Three Room slot cracked by a wrong offering or by GIVE;
  - a quick slot destroyed by a wish (`game.wishesUsed`, including wishes spent
    before the curse began).

**Curse Depth** = rooms explored × broken slots. It sets how often a misfire happens
(a delayed or dropped dodge or attack, or a wander), rolled as a rate per minute of
play:

- low depth: rare enough not to be noticed;
- two broken slots' worth of rate: noticeable very quickly;
- the highest possible depth: more than once a minute.

A wrong offering alone breaks one slot, so every Cursed Run misfires eventually.
GIVE breaks **two** (its wish destroys a quick slot and its answer cracks a Three
Room slot), so it deepens the curse twice as fast as a wrong offering. At most six
slots can break (three Three Room slots, three quick slots).

**Draft curve** (to tune in P5b): linear, capped at depth 48:
`misfires per minute = 1.5 × min(depth, 48) / 48`.

| Broken slots | Rooms | Depth | Misfires | Reads as |
|---|---|---|---|---|
| 1 (a wrong offering) | 2 | 2 | one per ~16 min | unnoticed |
| 1 | 8 | 8 | one per 4 min | a glitch? |
| 2 (one GIVE) | 8 | 16 | one per 2 min | clearly the curse |
| 2 | 16 | 32 | one per 60 s | |
| 4 (two GIVEs) | 12 | 48 | 1.5 a minute | the ceiling |
| 6 (three GIVEs) | 8 | 48 | 1.5 a minute | the ceiling, reached fast |

If the ramp should bite sooner, raise the ceiling rate or lower the cap, not the
formula's shape.

**State:** the curse's start time is new run-scoped state. It belongs to
`CursedRunSystem` (system-internal, reset by `hardReset()`, which the Reset Registry
already calls), and the overlay reads it the way it reads `runTimerSystem.format()`.
Broken Three Room slots are read from the room's slots while it exists; once the
room is gone the count must live in `CursedRunSystem` too.

## 8. The wish taxonomy

Every wish Spell gets one data field: `wish: 'power' | 'influence' | 'gain'`. All
words below were checked against the grammar: ≤9 letters, not an existing `SPELLS`
key (except BRIDGE, which *is* the existing one), not an item or ingredient name.
Words and effects marked *draft* are for the author to replace.

### POWER — for enemies

| Word | Effect | Owner | Status |
|---|---|---|---|
| PURGE (alias CLEANSE) | Clears the room of every enemy and projectile | `WishSystem` | exists as CLEANSE — rename |
| REVIVE / CONTINUE | Undo a death at half HP | `WishSystem.executeRevive` | exists |
| HEAL / UNCURSE | Lift the frog polymorph | `PolymorphSystem.cureViaWish` | exists |
| WARD *(draft)* | Invulnerable for a span | `PlayerDamageSystem` | new |
| SMITE *(draft)* | Strike every enemy in the room once | `CombatSystem` | new |

### GAIN — for glory

One per room letter. "Cheat" completes the room's goal through its owning system;
"hint" is a stateless line from the Three when there's no single goal to complete.
Goals marked *?* need confirming against the room's real win condition before the
build.

| Letter | Room | Completion (draft) | Word (draft) | Owner | Kind |
|---|---|---|---|---|---|
| A | Ascent | Reach the summit | ASCEND | Lava/Ice/Storm/MistAscentSystem | cheat |
| B | Boss | Show the lock's tell (boss doctrine: a lock, not an HP bar — never skip it) | WEAKNESS | BossSystem | hint |
| C | Camp | *?* | KINDLE | CampNPCSystem | *?* |
| D | Dungeon | Reveal the skull key | DELVE | DungeonPuzzleSystem | cheat |
| E | Errand | Fulfill the errand | FULFILL | ErrandSystem | cheat |
| F | Fountain | Attune the fountain (no fairy-anger) | ATTUNE | FountainSystem | cheat |
| G | Grass | Burn it all (the room's own line) | SCORCH | FireSystem | cheat |
| H | Hut | *?* (SIT already lowers the Witch hut) | SETTLE | HutSystem | *?* |
| I | Island | Cross to the island | CROSSOVER | *?* | cheat |
| J | Jeweler | — better as INFLUENCE (APPRAISE) | — | JewelerSystem | hint |
| L | Lake | Still the water / the Rusalka | CALMWATER | LakeBoss | *?* |
| M | Maze | Show the way through — **never grant the Spectacles** (sacred item) | THREAD | MazeSystem | cheat |
| N | North | Hint only — `NORTH IS NOT A NAME.` | — | — | hint |
| O | Ocean | Raise the sunken ship's goods | SALVAGE | SunkenShipSystem / SunkenGlintSystem | cheat |
| P | Puzzle | Turn the Compass Rose's rings true | ALIGN | PuzzleSystem | cheat |
| Q | Quagmire | Drain the Aquifer's way | DRAIN | AquiferSystem | *?* |
| R | Ridge | Build the bridge | BRIDGE | RidgeSystem | exists |
| S | Settlement | — better as INFLUENCE | GATHER | — | hint |
| T | Tunnel | Uncover what is hidden | UNEARTH | *?* | *?* |
| U | Underground | The Mage's path | CONJURE | WizardSystem | *?* |
| V | Vault | Open the lock | UNSEAL | vaultWalls.js | cheat |
| W | Well | Infuse the coin without a toss | INFUSE | WellSystem | *?* |
| X | Crossroads | Extract the χ Blade (bug #478's missing hint) | XCAVATE | ChiBladeSystem | cheat |
| ? | Mystery | Hint only | — | — | hint |
| 3 | Three | none — GIVE is its word | — | ThreeRoomSystem | — |

**Sacred-item guard:** no GAIN cheat may produce `⬢` `⫪` `⊙` `🜛`. The True 3
stays earned (proof-item rule, `zone-cosmology.md`).

### INFLUENCE — for control

**One word acts differently on each NPC** (ratified 2026-10-29). What a word does
to an NPC is data on that NPC, carried out by the NPC's owning system; the word
itself just finds the nearest speaker.

#### PERSUADE

Acts on the nearest speaker. The NPC answers **before** any wish is asked for: a
refusing NPC gives its refusal line and **no wish is spent** (user, 2026-10-29). An
NPC who accepts brings the usual `USE NTH WISH?`; on YES the THREE says
`AS YOU WISH.` and **any transaction that NPC offers happens without its cost.**

NPCs who take no payment refuse with a **placeholder line**. Generally they have
nothing to give, or can't give because they need something they don't have. Lines
below marked *placeholder* are for the author to replace.

| NPC | PERSUADE | Owner |
|---|---|---|
| Weapons Master | works — his transaction without its cost | WeaponsMaster |
| Fisherman | works — his transaction without its cost | Fisherman |
| Shopkeeper | works — **drops the entire inventory onto the shop floor** for pickup | Shopkeeper / ShopSystem |
| Bridge Worker (Ridge) | **refuses**: `NO WOOD. NO BRIDGE.` *(placeholder)* — he needs what he doesn't have | BridgeWorker |
| Wise Fellow | **refuses**: `YOU FOOLISHLY SERVE.` — he knows of the Three and fears it | WiseFellow |
| Witch | **refuses**: `NOT FOR YOU. NOT FOR IT.` *(placeholder)* — she knows of the Three and fears it, like the Wise Fellow | Witch |
| NPCs who sell or charge (Jeweler, Alchemist, Charon, …) | works — their transaction without its cost; exact effect per NPC at build time | each NPC |
| NPCs who take no payment (Hatter, Storyteller, Fairy King, Goblin, Camp NPC, …) | **refuse** with a placeholder line, e.g. `I HAVE NOTHING.` | each NPC |

#### COMMAND (extends the existing spell)

Today `CALL` / `COMMAND` charms the nearest enemy that bears the true name typed as
its follow-up (`CommandSystem.commandNearest`). Extended: **COMMAND convinces any
NPC to join you** as a companion. Not all of them carry a weapon; the ones that don't
still follow, and still count as a companion. **It acts on the nearest detected NPC**
(user, 2026-10-29), so no name is typed for an NPC; the true-name follow-up stays
for enemies. **COMMAND on an NPC costs a wish** (the usual `USE NTH WISH?`), so it
is an INFLUENCE Wish Spell when its target is an NPC. On an enemy it stays free.

#### The Witch on a Cursed Run

The Witch is not tied to her open errand. **On a Cursed Run she offers to join you
as a companion** (no word needed; she fears what you've done). **As a companion she
acts the same as the Hex Witch enemy** (`H`, `hexMechanic` in `enemies.js`),
including turning enemies into frogs, with the hex aimed at enemies instead of the
player. More capabilities may come later.

#### More INFLUENCE words (suggestions)

Combat control fits the kind: bending enemies rather than NPCs. All are free of
`SPELLS`, item and ingredient name clashes (checked 2026-10-29). Drafts for the
author to pick from (TAUNT and CALM were turned down 2026-10-29):

| Word | Effect (draft) |
|---|---|
| CHARM *(kept)* | Every enemy in the room fights for you until the room is left (a room-wide, temporary COMMAND without true names) |
| SLEEP *(kept)* | Every enemy in the room falls asleep until struck |

#### Any companion works

**Every kind of companion counts wherever a companion is needed**, starting with the
green Dungeon's Branch panel puzzle (`DungeonPuzzleSystem._updateBranchPanels`),
which today reads only `game.companion`. Logged as bug #479.

## 9. Code shape (for the build sessions)

- **`WishSystem.spend(game)`** — the one place a wish is consumed: bump
  `wishesUsed`, destroy the slot, move its item to an empty slot, re-pick the active
  slot, and clear `restQuickSlots`. Replaces the four copies (§1), which also fixes
  BRIDGE's missing slot destruction.
- **`wishSpell(kind, { effect, gate, refusal })` factory** in `spells.js` — builds
  the `USE NTH WISH?` response, the YES/Y/AYE/SURE/NO/NAY/CANCEL follow-ups and
  `followUpsActive`, and stamps `wish: kind`. Every new wish word is one line.
- **Three Room intercept** — a `ThreeVoiceSystem` (new, `src/systems/`) with
  `answer(game, spell)` called from one hook at the top of `SpellSystem.detect`'s
  match branch. It owns the comment table, the talk lines and GIVE's flow. Nothing
  goes in `main.js`.
- **GIVE's crack** routes through `ThreeRoomSystem` (new `crackSlot(game, idx)`
  sharing `placeOffering`'s cracked branch, `_beginCurse`, `_advanceMusic`), so the
  cracked-slot visuals stay single-sourced in `ThreeRoomRenderer`.
- **Every completion and influence word** calls the system that owns its room or NPC
  (catalogue grammar rule 7).
- **Reset Registry:** nothing new — the design is stateless. If GIVE ever needs
  state, it lives on the room (dies with it).
- **`check:data`:** extend it to fail a `wish` Spell with an unknown kind, and a GAIN
  word whose letter has no room.

## 10. Phases

| Phase | Scope | Behavior change |
|---|---|---|
| P1 ✅ 2026-10-29 | `WishSystem.spend` + `wishSpell` factory + `wish` field on existing wishes + CLEANSE→PURGE (alias kept) | rename only; BRIDGE's wish now destroys a slot like the rest |
| P2 | Talk family (HELLO/GREET/SPEAK) + Three Room talk lines + WHO-IS riddles | new lines |
| P3 | Wish comments in the Three Room (+ GAME_OVER exception) | wish casts in the room are answered, not fired |
| P4 | GIVE | the room's new trade |
| P5 | Cursed Spell Sign pool | cursed runs teach wish words |
| P5b | Curse Clock + the player turns on themselves (§7b) | dodges/attacks delayed or dropped; wandering into hazards |
| P6+ | GAIN words, a few letters per session — XCAVATE first (closes #478's hint gap) | |
| P7+ | INFLUENCE: PERSUADE (Master, Fisherman, Shopkeeper first), COMMAND on NPCs, the Witch's Cursed-Run offer | |

## 11. Open questions for the author

Settled 2026-10-29: slot mapping, repeat kinds (`NO.`), GIVE's cost (one wish),
Cursed Signs (replace), INFLUENCE shape (per-NPC behavior; PERSUADE), the Witch
(no errand tie), HI/HEY (no), the Spectacles (cyan; Maze moved), credits (none).

Settled 2026-10-29 (second round): no wishes left → `NO.` (a real cost comes
later); a refused PERSUADE spends nothing; COMMAND takes the nearest detected NPC;
the Witch companion acts as the Hex Witch; non-payment NPCs refuse with placeholder
lines.

Settled 2026-10-29 (third round): COMMAND on an NPC costs a wish; TAUNT and CALM
are out; the cost of wishing is a deepening curse (§7b).

Settled 2026-10-29 (fourth round): CHARM and SLEEP stay; Curse Depth = cursed
rooms × wishes spent; misfire rate from unnoticeable to more than once a minute (§7b).

Settled 2026-10-29 (fifth round): the curse accumulates over time from its start,
marked by a gray Curse Clock; Curse Depth = rooms explored × broken slots, and a wish
is one way of breaking a slot (§7b).

Still open:
1. The draft curve's numbers (§7b), settled by playtest in P5b.

## 12. Proposed glossary terms

To be ratified by the author. Each entry is written in `GLOSSARY.md` in the commit
that first puts the term into code.

- **Wish** — the per-run currency of three; spending one destroys a quick slot
  (`game.wishesUsed`, `WishSystem.spend`).
- **Wish Spell** — a Spell whose cast spends a Wish; carries a `wish` kind.
- **Wish Kind** — Power / Influence / Gain.
- **Persuade** — the Influence Wish Spell; an accepting NPC's transaction happens without its cost.
- **Completion Spell** — a Gain Wish Spell tied to one room letter.
- **Give** — the Three Room trade: a slot cracks, a Wish Spell's name is told.
- **Curse Clock** — the gray timer that starts beside the run timer when a Cursed Run begins.
- **Broken Slot** — a cracked Three Room slot or a quick slot destroyed by a wish.
- **Curse Depth** — rooms explored since the curse began × broken slots; sets the misfire rate.
- **Cursed Spell Sign** — a Spell Sign drawn from the Wish Spell pool on a Cursed Run.
