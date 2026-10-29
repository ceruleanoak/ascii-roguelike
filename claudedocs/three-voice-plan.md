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

## 3. How a player learns things (the reveal map)

Stateless, so "revelation" is entirely *where a word can be learned*:

| Knowledge | Learned from | Cost of learning |
|---|---|---|
| The Three can be talked to | Typing any talk word in the Three Room | none |
| Where/what the True 3 are | Riddle lines (§4), Wise Fellow, slot colors | none |
| That wishes exist / their kinds | The Three's comments when a wish word is cast in its room (§6); `GIVE`'s question | none / a crack |
| A specific wish word | `GIVE` (§5) | a cracked slot + the Cursed Run — the True 3 is lost this run |
| A specific wish word | Cursed Spell Signs (§7), read with Spectacles | already Cursed |
| A specific wish word | Memory from a past run | nothing — the mental save file |

The economy: **wish words are bought with the pure ending.** The only fast way to
learn them is to give up this run's True 3. A player who has paid once keeps the
word forever, and spends it later on a clean run for the price of one wish.

## 4. Talk family and the riddles

### Talk words (global aliases)

`HELLO`, `GREET`, `SPEAK` join `TALK` (`BeelineSystem.talk`) everywhere. `HI` / `HEY`
are 2–3 letter words; under grammar rule 4 they can't be whole Spells (they'd fire on
any buffer ending in HI). **Open:** allow them as Three-Room-only words (§10).

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

**Mismatch to settle:** `LOST MY SPECTACLES...` is a *yellow* Wise Fellow line, but
`HEREISTWO` answers CYAN, and the Spectacles come from the Maze (not zone-exclusive;
`legend-of-three.md` already flags this). Either move the saying to cyan, or accept
it as a red herring.

## 5. GIVE

**Gate.** Three Room only. Elsewhere `...NOTHING.`.

**Flow.**
1. `GIVE` → `POWER, INFLUENCE, OR GAIN?` (follow-ups: `POWER`, `INFLUENCE`, `GAIN`;
   anything else → `...` and the awaiting state clears, as with EXITGAME's NO).
2. On a kind: white flash (reuse the `game.cleanseWave` render path in
   `RenderController`, or a ScreenFadeSystem stepped white — never a smooth ramp; see
   retro alpha quantization) → the kind's slot cracks → the THREE says the revealed
   spell's name, e.g. `XCAVATE.` → `ThreeRoomSystem._beginCurse` runs.
3. The revealed name is **random within the kind** (uniform over every Spell whose
   `wish` field matches).

**Which slot cracks — proposed, author to ratify:**

| Kind | Slot | Register | Why |
|---|---|---|---|
| POWER | apex | Instinct | combat advantage = reflex |
| GAIN | left | Experience | room-completion = route knowledge, the speedrunner's power |
| INFLUENCE | right | Convention | social conventions, NPCs |

**Edge cases.**
- **That kind's slot is already filled or cracked** → `NOTHING LEFT TO GIVE.`
  *(draft)*; no flash, no curse. (Alternative: crack the next unfilled slot. Pick
  one in P4.)
- **A GIVE crack is a Cracked Slot**: grayed, framed and counted as filled (no glyph
  — draw the crack over the empty frame). So three GIVEs open the north door, and
  Death is behind it.
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

Non-wish spells (LOOKWEST, TAKEALL, …) act normally.

**Required exception — REVIVE / CONTINUE at GAME_OVER.** Death's touch happens *in*
the Three Room, so `currentRoom.isThreeRoom` is still true at the game-over screen.
The intercept must skip when the state is `GAME_OVER`, or the wish-revive that
`ThreeRoomSystem._resolveContactDeath` deliberately keeps live would be swallowed
(`WishSystem.executeRevive` already resumes NEUTRAL there).

## 7. Cursed Spell Signs

`generateSpellSign` (`src/systems/roomSigns.js`) draws from `SPELL_SIGN_SPELLS`
today. On `game.cursedRun` it draws from a **cursed pool** instead: every Spell
with a `wish` field (derived from `SPELLS`, never a hand list that drifts). It's
still the Greek cipher and still read by the Spectacles. The curse teaches the words
the curse made you pay for.

Open: replace the standard pool outright, or mix (e.g. 50/50)? The user's wording
("can appear instead of") reads as replace-per-sign; P5 decides.

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

One per NPC. Each extracts something the NPC would otherwise charge for, withhold or
gate. The values are drafts.

| NPC | Value extracted (draft) | Word (draft) | Owner |
|---|---|---|---|
| Witch | Her brew/hex without the price — ties to the open Witch's errand? | BARGAIN | Witch / HutSystem |
| Wise Fellow | A rare saying without an Artifact | CONFIDE | WiseFellow |
| Jeweler | The next piece free | APPRAISE | JewelerSystem |
| Shopkeeper | Price cut to one coin | HAGGLE | ShopSystem |
| Weapons Master | Training without the coin | EMULATE | WeaponsMasterSystem |
| Alchemist | Brews without the ingredients | DISTILL | AlchemySystem |
| Fisherman | The catch handed over | BAIT | FishingSystem |
| Charon | Passage without the fare | BRIBE | CharonSystem |
| Others (Hatter, Wizard, Storyteller, Fairy King, Goblin, Camp NPC) | *to design* | — | — |

**Alternative to decide in P7:** one generic word (`PERSUADE`) that acts on the
nearest speaker, with per-NPC effects as data on the NPC. That's fewer words to
remember (see the mental-load rule for recipes) at the cost of the "every NPC has a
word" fantasy.

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
| P1 | `WishSystem.spend` + `wishSpell` factory + `wish` field on existing wishes + CLEANSE→PURGE (alias kept) | rename only; BRIDGE's wish now destroys a slot like the rest |
| P2 | Talk family (HELLO/GREET/SPEAK) + Three Room talk lines + WHO-IS riddles | new lines |
| P3 | Wish comments in the Three Room (+ GAME_OVER exception) | wish casts in the room are answered, not fired |
| P4 | GIVE | the room's new trade |
| P5 | Cursed Spell Sign pool | cursed runs teach wish words |
| P6+ | GAIN words, a few letters per session — XCAVATE first (closes #478's hint gap) | |
| P7+ | INFLUENCE words, NPC by NPC (or the generic-word alternative) | |

## 11. Open questions for the author

1. Kind → slot mapping for GIVE (§5).
2. GIVE on an already-cracked/filled kind slot: refuse, or crack the next free slot?
3. Does GIVE *also* spend a wish, or are the crack and the curse the whole price?
4. Cursed Spell Signs: replace the standard pool, or mix?
5. INFLUENCE: one word per NPC, or one generic word (§8)?
6. Does the Witch's INFLUENCE word tie into the open Witch's errand (planning inbox)?
7. HI / HEY as Three-Room-only words (an exception to grammar rule 4)?
8. The Spectacles' color: cyan (HEREISTWO) vs. the yellow Wise Fellow line (§4).
9. Carried over from `zone-cosmology.md`: which ending carries the credits now that
   the True ending is the Three Room.

## 12. Proposed glossary terms

To be ratified by the author. Each entry is written in `GLOSSARY.md` in the commit
that first puts the term into code.

- **Wish** — the per-run currency of three; spending one destroys a quick slot
  (`game.wishesUsed`, `WishSystem.spend`).
- **Wish Spell** — a Spell whose cast spends a Wish; carries a `wish` kind.
- **Wish Kind** — Power / Influence / Gain.
- **Completion Spell** — a Gain Wish Spell tied to one room letter.
- **Give** — the Three Room trade: a slot cracks, a Wish Spell's name is told.
- **Cursed Spell Sign** — a Spell Sign drawn from the Wish Spell pool on a Cursed Run.
