# Combat System Evaluation — 2026-11-19

Consultative review. Part 1 was written from code and data alone, **before any test ran**, and is left unedited so Part 2 can score it.

---

## Part 1 — Pre-evaluation (written before testing)

### What I read
- Player: `PLAYER_STATS` (10 HP), `PlayerDamageSystem.applyDamage` (flat armor cut, minimum 1 damage, 1.0s hit i-frames), `PlayerDodgeRollSystem` (Gold Hero roll: 0.15s roll + 0.1s tail = 0.25s i-frames; the 0.5s cooldown starts at roll start).
- Enemies: all 55 `ENEMIES` entries (hp/damage/speed/attackCooldown/attackWindup/range) and `ZONE_SPAWN_TABLES`. Enemy timers run in double-seconds (÷2 = real), enemy hit i-frames are 0.3 double-s (≈0.15s real).
- Weapons: all `ITEMS` weapons (damage, windup, recovery, range). Weapon timers are double-seconds too. Punch: 1 dmg, 0.3s real cooldown.
- Reference bar for fairness: the Tortoise retune (`reaction_window_baseline` memory) — **~0.7s of visible telegraph is the floor** for a committed fast attack.

### The model, as the numbers describe it
Real-second conversions (data ÷ 2):

| | Damage | Cycle (real s) | Nominal DPS |
|---|---|---|---|
| Fist | 1 | 0.30 | 3.3 |
| Dagger ↾ | 1 | 0.35 | 2.9 |
| Sword † | 2 | 0.55 | 3.6 |
| Hammer ⊥ | 3 | 0.70 | 4.3 |
| Spear ↑ | 2 | 0.60 | 3.3 |
| Bone Crusher ⚒ (T3) | 6 | 0.63 | 9.6 |

Most enemy melee windups are 1.0–1.2 data → **0.5–0.6s real**. Outliers: Frog 0.25s (speed 130), Betrayed Traveler 0.15s (speed 130), Monkey 0.45s, Phalanx 0 (no windup at all).

### Predictions (each is testable; scored in Part 2)

- **P1. Tier-1 weapons barely beat fists.** Sword and Spear will land within ±20% of fist DPS; the Dagger will be *below* fists. The first weapon a player crafts won't feel like a power step.
- **P2. Most melee telegraphs sit under the user's own 0.7s floor.** A bot that dodges with a human reaction delay (0.25s) will still eat a meaningful share of melee hits from the 0.5s-windup majority, and essentially all hits from Frog / Betrayed Traveler / Phalanx.
- **P3. Roll-mashing is a strong degenerate strategy.** 0.25s i-frames in every 0.5s cycle is 50% invulnerability uptime from mashing alone. Combined with 0.5s-real windups, a masher will take far less damage than a reactive dodger, i.e. the game rewards spam over reading tells.
- **P4. The 1.0s hit i-frame makes packs less dangerous than their headcount.** Three enemies together will deal well under 3× a single enemy's damage-over-time, because the second and third hits keep landing in i-frames.
- **P5. Damage spikes are steep against 10 HP.** Elite/boss hits of 4–6 (Troll, Knight, Miner, Rockwarden, Living Rock, Mire Toad) remove 40–60% of max HP. A no-armor player trading blows will lose to a single red-zone mid-tier (Miner, Living Rock) before killing it with a tier-1 weapon.
- **P6. Green early game is safe.** Rats/Slimes (2–3 HP, 1 dmg) die in 1–2 sword hits and deal ≤1–2 damage per kill even when the bot never dodges.
- **P7. Enemy i-frames won't cap fast weapons.** At ~0.15s real, they're shorter than every weapon cycle, so the Dagger's low DPS is its data, not the i-frame gate.

---

## Part 2 — Post-evaluation

### Method
A headless combat lab (`tools/debug/combat-lab.mjs`, built on `tools/lib/headless-game.mjs`) boots the real `Game` and runs the real update loop at 60 fps. Each trial uses one open EXPLORE room. Enemies are spawned with `new Enemy()`, wired through `wireRoomEnemies`, and placed 6–9 cells from the player. The player has 9999 HP, so every fight runs to the end. A run counts as **would-die** when damage taken reaches 10, the real max HP, before the kill. Each trial is capped at 30s, and `Math.random` is seeded for the whole fight, so each of the 2,220 trials can be replayed exactly. The run had 12 seeds per cell and no errors.

The player is driven by one of four bots:
- **trade**: walks in and attacks every time the weapon allows.
- **react**: on a tell within 8 cells, waits a human-like **0.25s** and then rolls (Gold Hero roll). It rolls away from melee, and sideways against projectiles, charges and long-reach attacks.
- **mash**: rolls sideways, alternating sides, whenever an enemy is within 3 cells, and attacks between rolls.
- **idle**: walks in and never attacks. This is the control: what each enemy does to a player who stands there.

Each hit is logged with its **lead**: the time since the attacker's last visible tell began. A tell is any of: `isWindingUp()`, a melee attack in its windup phase, a charge windup, or an Anticipate state that sets a `stateTell`.

Suites:
- A: 35 roster enemies × trade/react/mash, all with the Sword.
- B: a weapon ladder of 7 weapons vs Ogre (depth 10), Frost Wolf, Knight and Troll (depth 12).
- C: packs of 1 vs 3.
- D: the idle control.

### The headline finding: hitting an enemy cancels its attack, so attacking first beats reading tells
`Enemy.takeDamage` cancels Strike's windup on any damage, unless the enemy or its Strike band is `windupImmune`. The enemy drops back to Approach and has to start the attack over. Every blow you land therefore resets the enemy's attack. The data:

| Enemy | Idle dmg/s (control) | Tells started per fight under trade | Dmg taken, trade (Sword) | Dmg taken, trade (**Fist**) |
|---|---|---|---|---|
| Knight K | **3.0** (highest in the roster) | 6.2 | 0.4 | 0.4 |
| Ogre O (d10) | 2.1 | 5.1 | 0.0 | 0.3 |
| Skeleton S | 1.5 | 2.3 | 0.0 | — |
| Troll T (`windupImmune`) | 1.6 | 4.6 | **8.8 — would die 9/12** | 7.5 |
| Fire Elemental F (`windupImmune`) | 2.0 | 3.8 | **9.0 — would die 6/12** | — |

The Knight starts six attacks per fight and almost none of them land, even against bare fists. The deadliest melee enemy left alone is harmless to anyone who keeps swinging. Its tell is real, but you never have to read it.

The rule isn't wrong in itself, and the code comments show it's deliberate: "a hit doesn't cancel it — dodge it" is written on the immune enemies. The problem is how the roster splits.
- Only **8 of 55** enemies are `windupImmune`: Troll, Slime, Giant Slime, Magma Slug, Fire Elemental, Miner, Bomb and Steam Specter.
- Against the rest, attacking first beats reading the tell.
- **Choosing the right policy matters more than reacting fast.** Across suite A, react took the least damage (635 total, 8 would-die) and trade took more (849, 23 would-die). Nearly all of trade's extra damage came from the immune and ranged enemies; against interruptible melee it took about 0 and killed fastest. A player who learns which enemies can be interrupted, and trades with the rest, beats both bots.

Whether this is good depends on design intent. It fits "mental progression": learning which enemies can't be interrupted is knowledge. But the knowledge is binary per enemy, and for most of the roster it means the tell is decoration.

### Predictions, scored

| | Prediction | Verdict | Evidence |
|---|---|---|---|
| P1 | Tier-1 weapons ≈ fists; Dagger below fists | **Confirmed** | Kill time vs Ogre: Fist 5.0s, Sword 5.1s, Spear 4.9s, **Dagger 5.9s**. Vs Knight: Fist 5.3s, Sword 4.8s, Dagger 6.8s. The first real power step is the Hammer (3.5s) or Bone Crusher (3.4s). Hammer kills take 3.3 swings where ~4.2 were expected, so some bonus damage applies that I didn't trace. |
| P2 | Most melee tells are under 0.7s, so a 0.25s dodger still eats hits | **Mostly refuted** | 64% of control hits had a 0.5–0.7s lead, and the react bot dodged nearly all of them (Knight, Ogre and Skeleton: 0 damage). With a 0.25s reaction, 0.5s is enough. Three gaps remain: see below. |
| P2b | Frog, Betrayed Traveler and Phalanx are unreactable | **Split** | Frog: refuted, because its tongue never connects at all (bug below). Phalanx: its strike showed **no detectable tell** (24 react damage, every lead null). Betrayed Traveler wasn't in the roster sample. |
| P3 | Roll-mashing is degenerate | **Refuted** | Mash was the worst policy: 991 damage, 31 would-die, 385/420 kills. Rolling burns time you need for attacking, and the hit interrupt rewards attacking. |
| P4 | 1.0s i-frames make packs sublinear | **Refuted — packs are superlinear** | 1 → 3 enemies under react: Goblin 0.3 → **7.8** damage (2/12 would die), Boar 0.5 → 2.8, Frost Wolf 0.3 → 2.5, Volt Spider 1.7 → 2.7, Skeleton 0 → 0.3. One threat is easy to read; three overlapping threats aren't. The i-frames don't make up for it. |
| P5 | 4–6 damage hitters beat a tier-1 trader | **Mixed — the deciding factor is immunity, not damage** | Troll (immune): would die 9/12. Fire Elemental (immune): 6/12. Knight, Miner and Living Rock 0 traded down to 0.4, 3.1 and 0.2. Raw damage numbers predict danger poorly; `windupImmune` predicts it well. |
| P6 | Early green is safe | **Confirmed** | Rat 0.0, Slime 0.2 and Frog 0.0 damage per kill under trade; kills in 1.3–2.5s. |
| P7 | Enemy i-frames don't cap fast weapons | **Confirmed** | Fist vs Ogre: 12.9 swings for ~12.6 HP (depth-scaled 11), so essentially every punch counts. |

### What a careful player still can't read
1. **Tells that barely register.**
   - Dog `d`: react hits have 0.23–0.37s leads, under even a 0.5s bar.
   - Kobold/caster `k` and Fire Elemental: hits with 0.12–0.25s leads, mixed with ~1.1s ones. This looks like a second attack layered on the first.
2. **No tell at all.**
   - Phalanx `4`: Anticipate 0.8 with no `tell`, then a zero-windup strike.
   - Volt Spider `j`: 70 react hits, all with null lead.
   - Volt Golem `V`: 78 hits, mostly null. These are Electricity status ticks after a latch or arc.
   - Imp `i`: 21 hits, null lead.
   - Packed Frost Wolves: hits come from a wolf other than the one telling.

   Some of these are DoT ticks rather than strikes, which may be intentional. For Phalanx and the Volt pair it's worth a deliberate look.
3. **Ranged and magic damage leaks through sideways rolls.**
   - Volt Golem took 7.5 trade / 11 react / 12.4 mash, and nothing handled it.
   - Goblin `G`'s ~1.2s-lead attacks still landed 36 times under react.
   - This is partly the bot's limit (it rolls but doesn't reposition), but a 0.25s roll won't clear a long line.

### Bugs found
- **Frog tongue can't hit a player who is close.** `TongueAttackSystem.update` tests only the tongue's *tip*, at a fixed 2.5 cells (±0.5 cell box). A player standing next to the frog is inside the tongue's length, but never under its tip. Result: **0 damage from ~200 snaps** across 12 idle fights in which the player stood in contact. The 50% miss roll comes after the geometry check, so it doesn't explain the zero. Fix shape: test the segment from mouth to tip, or the full extended span, not just the tip.
- **Training Dummy `@` takes 0 damage** (`isDummy` zeroes `amount`). This is by design. I note it because it makes the Dummy useless as a DPS target for future tooling.

### Recommendations, in priority order
1. **Decide on an interrupt policy deliberately.** Options:
   - Keep it as it is, and accept that the tell only matters on 8 enemies.
   - Add **poise**: an enemy shrugs off the Nth interrupt, or can only be interrupted in the first part of its windup.
   - Make heavy hitters (Knight, Ogre, Wizard-tier) immune, so that "big = read it, small = trade" becomes the learnable rule.

   This shapes every future enemy, so it warrants an ADR. I added it to `docs/adr/BACKLOG.md`; the reasoning is yours to write.
2. **Give tier-1 weapons a reason to exist.** The Sword ties fists, and the Dagger loses to them. Either add damage, or give each a qualitative edge a fist lacks (reach, arc, an on-hit property) so crafting the first weapon feels like a step. The Dagger needs it most.
3. **Fix the Frog tongue's hit test** (bug above).
4. **Audit the no-tell set:** Phalanx's zero windup, Volt Spider and Volt Golem electricity, Dog's ~0.3s lead. Decide whether each one is "learn it" or a fairness gap against the ~0.7s baseline.
5. **Packs are where difficulty lives.** Single fights are mostly solved by trading. Three Goblins take you to 78% of max HP. If that's where you want difficulty, spawn composition is the main lever; per-enemy stats matter less.

### Limits of this method
- The bots are omniscient about tells and react in exactly 0.25s. They don't kite, use cover, armor, consumables or magic. They don't reposition against ranged attacks.
- **The Gun's poor numbers** (13.7s and 16 damage vs Ogre) **are a bot artifact.** Nothing here says the Gun is weak.
- A small share of logged damage came from room hazards (Lava/Fire/Poison tiles), not the enemy.
- Fights are one enemy, or one species pack, in open rooms with no other room features.
- Phalanx's Anticipate sets no `stateTell`, so if it shows a visual tell that the detector can't see, P2b's Phalanx call is wrong in its favor.
- Only the Sword was used across the roster. Weapon effects (blunt vs frozen, elements) were not exercised.
