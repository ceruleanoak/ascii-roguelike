# Weapon Mental-Load Audit — Tier 2+ Weapons

Design doc, 2026-10-21. **Status: implemented 2026-10-21. The user ratified a decision
list and each family landed as its own commit (see §0).** §3–§10 below are the
original audit, kept as the reasoning record. Where the user's decision differed from
the proposed verdict, §0 is what shipped.

Data was read from the working tree on 2026-10-21. That snapshot includes the
user's in-flight edits: Shotgun and Scatter Gun damage 1→2, and the new Poison Tips oil.
Damage numbers come from evaluating `ITEMS`/`RECIPES` directly, not from comments.

---

## 0. What shipped (2026-10-21)

One commit per family, on `main`:

| Family | Commit | Decisions as implemented |
|---|---|---|
| Gun | `73ec463` | **Cut:** Heavy Pistols, Freeze Ray, Rocket Launcher, Plasma Rifle, Laser Cannon, Venom Pistol. **Rerooted:** Machine Gun → Dual Pistols + Jaw; Ricochet Rifle → Dual Pistols + Metal. **Stun Gun:** Gun + Topaz, tier 2. **Kept:** Shotgun, Fester's Gun, Scatter Gun. **Venom Vial** is now a poison oil 🜕, brewed from Unstable Potion + Venom at the Alchemy Lab. |
| Bow | `92f7bf9` | **Cut:** Fire Bow, Ice Bow, Split Bow, Burst Bow, Drowse Boomerang (oils already ride the boomerang). **Sky Bow** = Bow + Wing; **Homing Bow** = Bow + Eye. **Piercing Bow:** damage 3. **Chain Bow:** tier 2, damage 3, Bow + Topaz. **Explosive Bow:** one arrow, then a 15s recharge; the arrow detonates as a real Bomb. |
| Sword | `447aa41` | **Cut:** Legendary Flame Sword, Venom Blade, Slag Blade. **Lava Sword** = Flame Sword + Slag. **Flame Sword:** damage 2. **Diamond Longsword:** damage 2. **Dragon Blade:** damage 4. **Chaos Blade** = Sword + Unstable Potion, tier 3; the shop stocks it only from green Depth 15 (`shopHome`). **Kept:** Lightning Sword. |
| Dagger | `c7b2f98` | **Cut:** Vampire Dagger, Bloodletter, Viper Fang, Acid Blade (with `AcidWaterSpread.js`). **Icicle:** a plain dagger stab; thrown, it bursts and freezes everything nearby. **Pearl Dagger:** damage 1. **New Kunai ⚲** = Dagger + Dagger: SPACE stabs; SHIFT throws one of 3 per-room oiled kunai and the weapon stays in hand. With the bundle spent, it throws itself. |
| Axe | `c9d614a` | **Bone Axe:** only Axe + Bone. **Thunder Axe:** tier 2, damage 2, Axe + Topaz. |
| Hammer | `0a1b8db` | The **shockwave** is one blow, its **Impact Size** (GLOSSARY) centered on the carrier. Its ring only shakes the background and knocks enemies back; there is no timed AoE. **Maul:** damage 3, `onHit: 'dizzy'`. **Ice Hammer:** damage 3, gains `shattersFrozen` (Glacier Hammer folded in), Hammer + Sapphire only. **Cut:** Earthquake Hammer, Glacier Hammer. **Bone Crusher:** no recipe (Errand reward), Impact Size 5. **Cinder Hammer:** damage 3. **Slag Maul:** damage 3, equal to the retuned Maul. **Kept:** Exploding Mace. |
| Spear | `a28cbc0` | **Cut:** Venom Lance, Barbed Lance. **Spears take oils** the way daggers do (R4 below is revised). |
| Bat | `c4e5371` | **Cut:** Barbed Bat, and with it Stingray Barb `Y`, which had no recipe left (Ray Tail catches and the Sunken Glint find removed). |
| Staff / Whip | — | **Kept:** Thick Staff and every magical whip. |

**Thick Fur `K`:** it is a drop, but only from the beast RARE pool, at about 0.1% per kill
(0.66% per Moose). That makes the Bullwhip unreachable in practice. Logged as
known-bugs #425.

**Still open:**
- **Venom for daggers.** With Acid Blade gone, daggers have no poison of their own. Venom
  Vial is an oil and does reach them. Tracked in `planning-inbox.md`.
- **The pawn price / wares offering audit.** Every item's price and shop slot should match
  its rarity and power after the cuts.

---

## 1. The frame — mental load

The mind is the save file, and it has two stores:

| Store | What lives there | How it's paid for |
|---|---|---|
| **Long-term** (across runs) | weapon families and what each one *does*, base recipes, zone flavors, what a recipe is *for* | learned once, recalled every run |
| **Short-term** (this run) | the drops in hand, the exits on offer, the oils/potions equipped, the build forming | read off the screen, forgotten at death |

A recipe is the most expensive thing to store long-term. Its **calorie cost** is three
memories, not one:

1. **the recipe** — which two inputs, which slot order;
2. **the objective** — what the result does;
3. **the circumstantial value** — *when* it's worth spending those inputs, compared with
   what this run's drops are already offering.

A deep tree multiplies all three. Each step along a chain is another recipe, another
objective, and another "is it worth it here?". The result is long-term memory the player
rarely uses: chains that are seldom walked and hard to recall. Oils, potions, and the
two default consumable slots (`InventorySystem.js:28`) already deliver element and effect
*in the short-term store*, where the run's randomness lives. A weapon tree that delivers
the same flavor again makes the player pay twice.

**Cheap recipes are rule-derived.** "Weapon + gem = that gem's element" (Ice Hammer
`⊥+⬨`, Freeze Ray `¬+⬨`, the gem whips, the gem staves) is one rule that covers many
recipes. "Same + same = the bigger version" (`⊥+⊥` Maul, `)+)` Multi-Shot, `¬+¬` Dual
Pistols) is another. A recipe that follows a rule costs almost nothing to remember. An
arbitrary pairing costs the full price, for example Bone Axe + Fire Essence giving an
*electric* axe, or Fire Bow + Fire giving an *electric* bow. Cuts should land hardest on
arbitrary recipes. Re-rooting should move survivors onto rules.

**Design target:** versatile tier-1 defaults. An upgrade is a choice of **verb**
(pierce, spread, snare, shatter) rather than a step up a ladder of stats. The run's
build comes from combining *weapon verb × augment flavor × drops*, not from walking one
weapon to the top of its chain.

---

## 2. Ratified rules (2026-10-21)

Each rule is stated as a test that can be checked against the data.

| # | Rule | Test |
|---|---|---|
| **R1** | Fire, Ice and Electric are zone flavors and stop at tier 2. | No `tier: 3` weapon has `weaponElement()` in `fire`/`ice`/`electric`. |
| **R2** | Guns and poison/venom weapons are the main pruning targets. | Poison survives on at most ~2 weapons. Guns lose every entry that is only a stat step or only an element. |
| **R3** | An upgrade that adds an affinity or effect rarely, if ever, also raises base damage. | For a recipe `parent + X → child` where the child gains an `onHit` or behavior flag, `child.damage ≤ parent.damage`. |
| **R4** | Oils stay bow/dagger-only (`oilAppliesTo`, `Item.js:66`). **Revised at implementation: spears take oils too.** | So within BOW (including boomerang and slingshot, which fire through `createSingleArrow`), dagger and now spear, a weapon that differs from its parent only by burn/freeze/sleep is a direct duplicate of Fire/Frost/Drowse Oil. |

Notes on R4 coverage: daggers take Fire, Frost and Drowse Oil but **not** Poison Tips
(`bowOnly`). So daggers have no poison oil. That is why the audit keeps Acid Blade
and cuts the other poison blades.

---

## 3. Verdict key

- **Keep** — no change.
- **Retune** — keep the weapon; strip the damage bump (R3) or fix the recipe.
- **De-tier** — a tier-3 elemental moves to tier 2 (R1), usually onto a rule-derived recipe.
- **Fold** — merge into a named sibling (that sibling gains the flag, if any); remove this entry.
- **Cut** — remove the weapon and its recipes.
- **Open** — needs a user call (see §9).

`Δdmg` is parent → child. **Bold** marks an R3 violation.

---

## 4. Audit table — every tier-2+ weapon (79)

### GUN (16 tier-2+) — see §5 for the roster rationale

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⊶ Bolo Launcher | 2 | ⊸+f | 1→1 | ensnares | — | **Keep** — snare is unique to it. |
| ᛉ Shotgun | 2 | ¬+M | **1→2** | 3-pellet spread | R3 | **Open** — the in-flight edit just raised it to 2. Spread is the verb, and 3 pellets × 2 already multiplies damage. Ratify 2 or return to 1. |
| X Dual Pistols | 2 | ¬+¬ | 1→1 | rapid, 12-round mag | — | **Keep** — same+same rule. |
| ᚷ Heavy Pistols | 2 | X+M | 1→2 | nothing (slower, fewer rounds) | — | **Cut** — a stat-only step at the same tier. Ricochet Rifle re-roots to `X+M`. |
| ƒ Fester's Gun | 2 | ¬+b | **1→2** | looping bullet | R3 | **Retune** dmg → 1. |
| ⌭ Plague Gun | 3 | ƒ+v | 2→2 | poison + plagueBurst | R2 | **Keep** — one of the two poison keepers (the burst cloud *is* the verb). |
| ⌐ Machine Gun | 3 | ᛉ+j | 2→1 | high fire rate | — | **Keep**; consider re-rooting to `X+j`, since rapid fire is the pistol lineage, not the shotgun's. |
| ᛁ Freeze Ray | 3 | ¬+⬨ | 1→0 | freeze | R1 | **De-tier** → T2 (the recipe is already gem-rule). |
| ⟰ Rocket Launcher | 3 | ᛉ+F | **2→3** | explode | R3 | **Retune** dmg → 2. |
| ᛞ Plasma Rifle | 3 | ¬+s (Forge) | **1→2** | pierce | R3 | **Retune** dmg → 1, or **Open** if Forge results are meant to be aspirational power (§9). |
| ᛋ Laser Cannon | 3 | ⌐+F | 1→5 | nothing | — | **Cut** — a pure stat jump, a same-tier step, and an arbitrary recipe. |
| ᚺ Scatter Gun | 3 | ᛉ+M | 2→2 | 7 pellets instead of 3 | — | **Fold** into Shotgun (same verb, more of it) — **Open** because it's part of the in-flight edit. |
| ᚦ Venom Pistol | 3 | X+g | **1→2** | poison + lifesteal | R2 R3 | **Cut**. |
| ᚾ Stun Gun | 3 | ¬+w | 1→1 | stun (electric) | R1 | **De-tier** → T2; re-root to `¬+◇` (gem rule). |
| ᚱ Ricochet Rifle | 3 | ᚷ+M | 2→2 | ricochet | — | **Keep**; re-root to `X+M` (its parent is cut). |
| ᚲ Dragon Shotgun | 3 | ᛉ+s (Forge) | 2→2 | 8-pellet ring | — | **Keep** — firing all around is its own verb. |

### BOW (incl. boomerang, slingshot) (14)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⟩ Fire Bow | 2 | )+F | 3→3 | burn | R4 | **Cut** — it is Bow + Fire Oil. Its children re-root (see Sky/Chain/Burst). |
| ⇒ Sky Bow | 2 | ⟩+w | 3→5 | *loses* burn, faster | — | **Open** — the green Starter Weapon (`characters.js:29`) and a pure stat step. With Fire Bow cut it needs a new recipe or becomes starter-only; `)+w` is taken by Homing Bow. |
| ⋔ Keen Slingshot | 2 | Ψ+e | 1→1 | keenAim | — | **Keep** — the model for a pure verb upgrade. |
| ⤺ Drowse Boomerang | 2 | ↩+ł | 1→1 | sleep | R4 | **Cut** — it is Boomerang + Drowse Oil (Pollen presses to Drowse Oil anyway). |
| ⌾ Chakram | 2 | ↩+M | 1→1 | ricochet damage | — | **Keep**. |
| ⋙ Multi-Shot Bow | 3 | )+) | 3→3 | 3 arrows | — | **Keep** — same+same rule. |
| ᛇ Ice Bow | 3 | )+⬨ | 3→3 | freeze | R1 R4 | **Cut** — it is Bow + Frost Oil, and it's a T3 ice weapon. |
| ᛒ Explosive Bow | 3 | )+⊗ | 3→3 | explode | — | **Keep** — the recipe is self-evident (bomb). |
| ᛟ Homing Bow | 3 | )+w | 3→3 | homing | — | **Keep**. |
| ᛏ Piercing Bow | 3 | )+M · ⇒+M | **3→4** · 5→4 | pierce | R3 | **Retune** dmg → 3; drop the `⇒+M` duplicate recipe. |
| ᛚ Chain Bow | 3 | ⟩+F | **3→4** | chain + stun (electric) | R1 R3 | **De-tier** → T2, dmg 3, re-root to `)+◇` (gem rule; today Fire + Fire makes electric). |
| ᛃ Split Bow | 3 | )+s (Forge) | **3→4** | split on hit | R3 | **Retune** dmg → 3. Fold candidate with Multi-Shot (both mean "more arrows"); **Open**. |
| ᛈ Burst Bow | 3 | ⇒+F | 5→4 | 30-round burst | — | **Open** — it's reachable only through Sky Bow. Follows whatever Sky Bow's decision is. |
| ⑂ Pearl Slingshot | 3 | ⋔+p | 1→1 | ricochet | — | **Keep** — a pure verb upgrade. |

### sword (10)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ‡ Flame Sword | 2 | †+F | **2→3** | burn | R3 | **Retune** dmg → 2 (keep as the sword's T2 fire flavor). |
| ᚠ Lava Sword | 2 | ‡+a | 3→3 | arc + places lava | — | **Keep** — lava is a verb. Re-root to `†+a` if Flame Sword's dmg drops (it becomes a sibling, not a grandchild). |
| ᛡ Venom Blade | 2 | †+⚗ | **2→5** | poison + poisonStacks | R2 R3 | **Cut** — the largest R3 violation in the tree. |
| ⸸ Magic Sword | 2 | †+𝑚 | 2→2 | swing bolt | — | **Keep**. |
| ⟡ Diamond Longsword | 2 | ⫯+⧫ | **2→3** | crit .2 → .4 | R3 | **Retune** dmg → 2 (the crit *is* the upgrade). |
| ᛖ Dragon Blade | 3 | †+s (Forge) | 2→5 | nothing | — | **Keep** — the one pure-power path, gated by the Forge (aspirational on purpose). |
| Ꞩ Lightning Sword | 3 | ⸸+◇ | 2→2 | calls lightning | R1? | **Open** — `weaponElement` doesn't count it, but lightning is the electric flavor at T3 (§9). |
| ⚔ Legendary Flame Sword | 3 | ‡+s (Forge) | **3→6** | (burn, inherited) | R1 R3 | **Cut** — a T3 fire weapon that is Dragon Blade + burn. |
| ᛠ Chaos Blade | 3 | ᛖ+F | 5→4 | random burn/poison/freeze/stun | R1? R2? | **Open** — every element at T3 on a random roll (§9). |
| ⟊ Slag Blade | 3 | ᚠ+4 | **3→4** | nothing new (Lava Sword +1) | R1 R3 | **Cut** — a pure stat clone at T3 fire. |

### dagger (8)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ᚢ Acid Blade | 2 | ↾+⚗ | 1→1 | poison + acid charge | R2 | **Keep** — the second poison keeper (daggers have no poison oil). |
| ↿ Keen Dagger | 2 | ↾+e | 1→1 | keenAim | — | **Keep** (cyan Starter Weapon). |
| ᛘ Vampire Dagger | 2 | ↾+m · ‡+m | 1→1 · 3→1 | lifesteal | — | **Retune** — drop the `‡+m` recipe (a sword with burn turning into a dagger is arbitrary and crosses families). |
| ⌠ Hook Sword | 2 | ↾+j | 1→1 | dizzy | — | **Keep** (no oil gives dizzy). |
| ⍖ Icicle | 2 | ↾+i | 1→1 | freeze | R4 | **Cut** — it is Dagger + Frost Oil. |
| ⥣ Pearl Dagger | 3 | ↿+p | **1→2** | lunge, longer keenAim | R3 | **Retune** dmg → 1. |
| ⸶ Bloodletter | 3 | ᛘ+⬥ | **1→2** | lifesteal 1 → 2 | R3 | **Retune** dmg → 1 (the doubled lifesteal *is* the upgrade). |
| ⸷ Viper Fang | 3 | ᚢ+v | **1→2** | poisonStacks | R2 R3 | **Cut** (or **Fold** poisonStacks into Acid Blade, **Open**). |

### axe (3)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⊤ Bone Axe | 2 | b+M · ⊦+b · j+\| | 2→3 | nothing | — | **Retune** — 3 recipes for one stat step is a lot to remember. Keep `⊦+b`, decide on the other two (**Open**). |
| ⍑ Ice Axe | 2 | ⊦+i | 2→2 | freeze | — | **Keep** (axes take no oil; ice flavor at T2 is allowed). |
| ᚨ Thunder Axe | 3 | ⊤+F | **3→4** | chain + stun (electric) | R1 R3 | **De-tier** → T2, dmg 2, re-root to `⊦+◇` (gem rule). |

### hammer (11)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⟘ Maul | 2 | ⊥+⊥ | **3→4** | knockback | R3 | **Retune** dmg → 3. |
| ᛜ Ice Hammer | 2 | ⊥+⬨ · ⊤+⬨ | **3→4** · **3→4** | freeze + knockback | R3 | **Retune** dmg → 3; drop the `⊤+⬨` recipe (axe → hammer crosses families). Absorbs `shattersFrozen` from Glacier Hammer. |
| ⬢ Onyx Hammer | 2 | ⊥+⬧ | 3→3 | crit .35, rolls rocks | — | **Keep**. |
| ⫫ Sledgehammer | 2 | ⊥+M | 3→3 | faster swing | — | **Keep**. |
| ✺ Exploding Mace | 2 | ⊥+⊗ · ⊤+⊗ | **3→4** · **3→4** | explode | R3 | **Retune** dmg → 3; drop `⊤+⊗`. |
| ⏚ Earthquake Hammer | 3 | ⚒+M | 6→6 | explode (on Bone Crusher) | — | **Cut** — Bone Crusher + Exploding Mace in one weapon, a same-tier step with an arbitrary recipe. |
| ⚒ Bone Crusher | 3 | ⊤+b | **3→6** | shockwave | R3 | **Retune** — re-root to `⊥+b` (inside the family), dmg → 3–4 (**Open** on the exact number). |
| ⟙ Glacier Hammer | 3 | ᛜ+i | **4→5** | shatters frozen enemies | R1 R3 | **Fold** into Ice Hammer (Ice Hammer gains `shattersFrozen`). |
| ⁂ Spore Mace | 3 | ✺+ł | 4→4 | sleep dust burst | — | **Keep**. |
| ⫪ Cinder Hammer | 3 | ⬢+a | **3→4** | blind dust + 1 burn tick | R3 | **Retune** dmg → 3. |
| ⟂ Slag Maul | 3 | ⟘+4 | **4→5** | places lava | R3, R1? | **Retune** dmg → 4 (= parent). **Open**: does lava count as the fire flavor (§9)? |

### spear (4)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ↟ Venom Lance | 2 | ↑+⚗ | 2→2 | poison | R2 | **Cut** — poison-only clone. |
| ⲯ Trident | 2 | ↑+j · ↑+n | 2→2 | pinning, knockback | — | **Keep**. |
| ⇑ War Spear | 3 | ↑+M | 2→3 | reach 34 | — | **Keep** — reach is its verb, and it adds no effect, so R3 doesn't apply. |
| ⍏ Barbed Lance | 3 | ↟+Y | **2→3** | poisonStacks | R2 R3 | **Cut**. |

### staff (3)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| Ⲯ Thick Staff | 2 | /+/ | **1→2** | block-release damage | R3 | **Retune** dmg → 1. |
| ⍋ Glaive | 2 | ↾+/ | 1→3 | nothing (polearm reach) | — | **Keep** — a two-weapon merge is easy to remember. |
| ⸾ Rootstaff | 3 | Ⲯ+r | 2→2 | root | — | **Keep**. |

### bat (2)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⸘ Metal Bat | 2 | ¡+M | 2→4 | nothing | — | **Keep** — a pure power step with no effect, so R3 doesn't apply. |
| ⧧ Barbed Bat | 3 | ⸘+Y | 4→4 | poison | R2 | **Cut** — poison-only clone. |

### whip (8)

| Weapon | T | Recipe | Δdmg | Adds | Rules | Verdict |
|---|---|---|---|---|---|---|
| ⥊ Bullwhip | 2 | ≋+K | **1→2** | reach 6 | R3 | **Retune** dmg → 1. |
| ∻ Vine Whip | 2 | ≋+❦ | 1→1 | pulls disarmed gear | — | **Keep**. |
| ✹ Morning Star | 2 | ≋+M | 1→1 | flail head (3 dmg) | — | **Keep** (the head's damage is the verb, not a bump). |
| ∾ Infused Whip | 2 | ≋+𝑚 | 1→1 | dizzy | — | **Keep**. |
| ∿ Ruby Whip | 3 | ∾+◈ | **1→2** | burn | R1 R3 | **De-tier** → T2, dmg 1, re-root to `≋+◈` (gem rule, no mana step). |
| ≀ Sapphire Whip | 3 | ∾+⬨ | **1→2** | freeze | R1 R3 | **De-tier** → T2, dmg 1, `≋+⬨`. |
| ⤳ Topaz Whip | 3 | ∾+◇ | **1→2** | stun (electric) | R1 R3 | **De-tier** → T2, dmg 1, `≋+◇`. |
| ∽ Emerald Whip | 3 | ∾+⬦ | **1→2** | poison | R2 R3 | **Cut**. |

### Count check

GUN 16 + BOW 14 + sword 10 + dagger 8 + axe 3 + hammer 11 + spear 4 + staff 3 + bat 2 + whip 8 = **79** ✓
(This matches the scratch dump of every `ITEMS` weapon with `tier ≥ 2`.)

### Totals if every non-Open verdict lands

| | Today | Proposed | With Scatter Gun folded (Open) |
|---|---|---|---|
| Tier-2+ weapons | 79 | **62** (17 cuts or folds) | 61 |
| Tier-3 weapons | 43 | **25** (11 cut or folded, 7 de-tiered) | 24 |
| R3 violations (recipe edges) | 34 edges across 32 weapons | **0** firm; Shotgun, Plasma Rifle and Bone Crusher's number still Open | — |
| T3 fire/ice/electric | 11 | **0**; Lightning Sword, Chaos Blade and Slag Maul still Open | — |
| Poison weapons | 9 | **2** (Plague Gun, Acid Blade) | — |

**Firm cuts / folds (17):**
- Guns: Heavy Pistols, Laser Cannon, Venom Pistol
- Bows: Fire Bow, Drowse Boomerang, Ice Bow
- Swords: Venom Blade, Legendary Flame Sword, Slag Blade
- Daggers: Icicle, Viper Fang
- Hammers: Earthquake Hammer, Glacier Hammer→Ice Hammer
- Spears: Venom Lance, Barbed Lance
- Bat: Barbed Bat
- Whip: Emerald Whip

---

## 5. Gun family deep-dive

18 guns today: 2 T1, 5 T2, 11 T3. The family has the most entries that are only stat
steps. Proposed roster: **one verb per gun, every recipe at most 2 crafts from `¬`/`⊸`.**

| Verb | Gun | Path |
|---|---|---|
| single shot (default) | ¬ Gun | M+M |
| lob / windup | ⊸ Sling | 0+~ |
| snare | ⊶ Bolo Launcher | ⊸+f |
| spread | ᛉ Shotgun (absorbs Scatter Gun) | ¬+M |
| rapid | X Dual Pistols | ¬+¬ |
| loop | ƒ Fester's Gun | ¬+b |
| freeze (T2) | ᛁ Freeze Ray | ¬+⬨ |
| stun (T2) | ᚾ Stun Gun | ¬+◇ |
| poison cloud | ⌭ Plague Gun | ƒ+v |
| sustained fire | ⌐ Machine Gun | X+j (re-rooted) |
| ricochet | ᚱ Ricochet Rifle | X+M (re-rooted) |
| explode | ⟰ Rocket Launcher | ᛉ+F |
| pierce | ᛞ Plasma Rifle | ¬+s (Forge) |
| ring | ᚲ Dragon Shotgun | ᛉ+s (Forge) |

The result is 14 guns, each with one verb. The cut entries say nothing their sibling
doesn't:
- Heavy Pistols is just slower, harder-hitting Dual Pistols.
- Laser Cannon is just +4 damage.
- Venom Pistol duplicates Plague Gun's poison and adds lifesteal.
- Scatter Gun is just more Shotgun pellets.

---

## 6. Poison / venom deep-dive

There are 9 poison weapons today. Poison also arrives through augments:
- Poison Tips `⇞`, a bow oil (in-flight);
- the thrown Poison Flask `P` and Venom Vial `Z`;
- Emerald attunement at the fountain.

Ninja Garb `𐤏` gives immunity to it.

Proposal: **poison lives in augments**, plus the two weapons where poison *is* the verb:

- **⌭ Plague Gun** — the burst cloud is spatial area denial, which no augment does.
- **ᚢ Acid Blade** — the dagger's only poison source, since Poison Tips are `bowOnly`, and the
  acid charge gate is a distinct mechanic.

The other 7 are cut: Venom Blade, Viper Fang, Venom Lance, Barbed Lance, Barbed Bat,
Venom Pistol, Emerald Whip. Three of them repeat the same `poisonStacks` flag on
different families (Venom Blade, Viper Fang, Barbed Lance). That is the clearest case of
one long-term memory being stored three times.

Ingredients this frees: Slurry `⚗` keeps Acid Blade. Stingray Barb `Y` loses both of its
weapon recipes (Barbed Lance and Barbed Bat). It needs a check in the data gate
(`tools/check-data.js`) and a home of its own (**Open**).

---

## 7. Fire / Ice / Electric — the tier-2 cap

| T3 elemental today | Element | Proposed |
|---|---|---|
| ⚔ Legendary Flame Sword | fire | Cut |
| ⟊ Slag Blade | fire | Cut |
| ∿ Ruby Whip | fire | De-tier → T2, `≋+◈` |
| ᛇ Ice Bow | ice | Cut (Frost Oil) |
| ᛁ Freeze Ray | ice | De-tier → T2 |
| ⟙ Glacier Hammer | ice | Fold into Ice Hammer |
| ≀ Sapphire Whip | ice | De-tier → T2, `≋+⬨` |
| ᛚ Chain Bow | electric | De-tier → T2, `)+◇` |
| ᚨ Thunder Axe | electric | De-tier → T2, `⊦+◇` |
| ᚾ Stun Gun | electric | De-tier → T2, `¬+◇` |
| ⤳ Topaz Whip | electric | De-tier → T2, `≋+◇` |

These are the 11 weapons that fail the R1 test today. Lightning Sword, Chaos Blade and
Slag Maul pass the test as written but arguably break the rule's intent (§9).

After this pass, the element recipes on non-oil families mostly follow one rule:
**T1 + elemental gem → T2 of that element**. Ruby = fire, Sapphire = ice, Topaz =
electric. The exceptions are Ice Axe and Flame Sword, which use raw `i` and `F`.
Re-rooting those onto gems too is **Open**; the raw ingredients are the zone's own
drops, which is a reason to leave them.

---

## 8. Knock-on effects for the implementation passes

Each item is recorded here only, not acted on.

- **Fountain Attunement** (`FountainSystem.js:426-449`, `weaponElement` `items.js:3469`).
  - Today an attuned fountain adds elemental candidates to the *next* rung. Under R1 there
    are no elemental T3s, so attunement can only matter on the T1→T2 step. A T2 elemental
    thrown in gets a plain T3.
  - Families whose top rung would hold no plain weapon would refuse the weapon, since
    `_findNextTierChar` returns `null`. That happens to the axe family (no T3 after Thunder Axe
    de-tiers) and the bat family (no T3 after Barbed Bat is cut).
  - This touches the open ADR backlog row "Weapon tier results are now gated on run
    state" (`docs/adr/BACKLOG.md:39`). Point (3) of that row says the fountain is the sole
    source of elemental tiers. These cuts change what that gate is gating.
- **Every place a cut or retuned weapon is referenced:**
  - `AFFINITY_POOLS` drop rarities (`items.js:3536+`). For example, ice U → Freeze Ray,
    fire R → Lava Sword, venom R → Venom Blade/Vampire Dagger, electric U → Thunder Axe/Stun Gun.
  - Zone depth-1 offers (`zones.js:85, 134, 209, 257`).
  - Discovery and Trap rooms (`RoomGenerator.js:775`, `DungeonFloorGenerator.js:88`). Fire Bow
    and Flame Sword appear in both.
  - Enemy gear (`enemies.js:551` Goblin, `:2499` Sea Snake).
  - Starter Weapons (`characters.js:29` Sky Bow, `:55` Keen Dagger, `:68` Storm Staff).
  - `characters.js` `weaponAffinities`.
  - `WEAPON_TIERS` (`items.js:3263-3291`), which is built from the `tier` field, so de-tiering
    is a one-field edit.
  - Shop pricing and Dismantle (`findRecipeByResult`, first match).
  - The simulator (`playtesting/`).
- **Glyph retirement.** A cut weapon frees a glyph. Whether a retired glyph is ever
  reused is **Open** (§9). Bug numbers are never reused; glyphs have no such rule yet.
- **Gate:** each family pass must leave `npm run check:data` clean. Cuts will surface
  dangling `AFFINITY_POOLS` and recipe references, which is exactly what the gate is for.

---

## 9. Open questions

1. **Shotgun / Scatter Gun damage 1→2 (in-flight edit).**
   - Shotgun: keep 2 and accept an R3 exception for spread, or return to 1?
   - Scatter Gun: fold into Shotgun, or keep it as the T3 spread?
2. **Forge results as an exception?**
   - Dragon Blade is pure power and needs no exception.
   - Plasma Rifle (pierce + damage) and Split Bow (split + damage) do. Is the Forge
     (boss-gated, Scale-gated) allowed to break R3 on purpose?
3. **Sky Bow / Burst Bow.**
   - Sky Bow is the green Starter Weapon and its recipe needs Fire Bow. Make it starter-only (no recipe), or give it a new recipe?
   - Burst Bow follows Sky Bow's decision.
4. **Fire-flavor edge cases at T3.** Do these break R1?
   - lava (Slag Maul `placesLava`);
   - lightning (Lightning Sword `callsLightning`);
   - random elements (Chaos Blade `randomOnHit`).

   `weaponElement` counts none of them. The Jeweler / Rainbow Necklace planning entry
   already wants to own "every element at once", which argues for cutting Chaos Blade.
5. **Gem wands** (`⚝ ⚹ ⚶ ⚸ ⚘ ⚭ ⚳`). They have no tier, but their `spellEffect` delivers fire/ice/electric AoE.
   - Proposed: out of scope. They're the mana-gated yellow path, and "Storm Staff + gem
     = that gem's spell" is a rule-derived recipe.
   - Needs your call.
6. **Bone Axe's three recipes.** Which ones survive?
7. **Exact damage for Bone Crusher** after it moves to `⊥+b`: 3 (strict R3) or 4?
8. **Viper Fang:** cut outright, or fold `poisonStacks` into Acid Blade?
9. **Stingray Barb `Y`:** it loses its weapon recipes. Give it a new home or cut it from drops?
10. **Fountain refusals:** after the cuts the axe and bat families have no T3. Accept a fountain that refuses them, or add a plain T3 for each?
11. **Retired glyphs:** retire permanently, or free to reuse?

---

## 10. Side findings (not part of the verdicts)

- **Stale tier comments and section headers:**
  - `items.js:132` puts Plague Gun under T2.
  - `:417` puts Multi-Shot under T2.
  - `:782` puts Longsword under T2.
  - `:1146` says "Tier 4" for Crystal Maul, which has no tier.
  - `:1374` says Metal Bat is "Tier 3"; it is 2.
  - Acid Blade (a dagger) sits in the sword block.
- **Recipe comments that don't match their inputs:**
  - `recipes.js:209` says Goo; the input is Jaw.
  - `recipes.js:290` says Stick; the input is Jaw.
- **Steps that stay at the same tier:** Lava Sword, Sky Bow, Heavy Pistols, Laser Cannon, Earthquake Hammer,
  Chaos Blade, and Vampire Dagger via Flame Sword.
- **Upgrades that cross families:**
  - Bone Axe → Ice Hammer, Exploding Mace and Bone Crusher (all hammers);
  - Flame Sword → Vampire Dagger;
  - Dagger → Glaive;
  - Spear → Stun Baton;
  - Staff → Spear and Scythe.

  Tier also goes down along one chain: Thick Staff×2 → Bat (T2 → T1). These are the chain-depth concerns from the
  original framing. The user put chain depth below power scaling. The verdicts above
  remove the cross-family hammer and dagger edges as a side effect.
- **Mana Potion `🜛`:** `duration: 30` and the comment "Grants a temporary mana slot"
  (`items.js:2509-2519`) predate the permanent-slot rework (a20bd0d). Nothing in `src/`
  reads that `duration` any more.
- **Known bug #162** (duplicate `∿` key: Ruby Whip vs. Primal Potion) looks resolved in data.
  `ITEMS['∿']` is the Ruby Whip, and the Primal Potion is now `¿`. The row is still open in
  `known-bugs.md`; verify it and move it.
- **Known bug #174** (Charged/Burning/Primal potions have no distinct effect) is still open.
  It bears on this doc: those three are the potion-side augments that would carry
  attack-speed, burn-on-hit and echo-attack flavor into the short-term store.
