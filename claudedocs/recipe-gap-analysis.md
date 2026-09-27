# Recipe Tree Gap Analysis — 2026-09-27

Snapshot of `src/data/recipes.js` × `src/data/items.js` (weapon `tier`, `WEAPON_TIERS`)
focused on what happens **after tier 1**, and which ingredients the recipe tree barely
touches. Candidate recipes below are proposals only; every listed pair was checked free
in both slot orders on this date.

## 1. Structural gaps

**Dead-end tier-1 weapons** (craftable or found, but nothing crafts from them):
Axe `⊦`, Rubber Bat `‖`, Longsword `⫯`, Boomerang `↩`, Slingshot `Ψ`, Torch `♨`.

**Dead-end tier-2 weapons:** Metal Bat `⸘`, Maul `⟘`, Onyx Hammer `⬢`, Ice Hammer `ᛜ`,
Exploding Mace `✺`, Acid Blade `ᚢ`, Vampire Dagger `ᛘ`, Venom Lance `↟`, Fester's Gun `ƒ`,
Lava Sword `ᚠ`, Venom Blade `ᛡ`, and all four elemental whips.

**Ladders with missing or disconnected rungs:**

| Family | Gap |
|---|---|
| axe | Axe (t1) doesn't lead into Bone Axe (t2). Bone Axe is crafted from raw Bone + Metal, so the axe ladder's t1 is cut off from t2/t3. |
| dagger | No t3 rung at all; both t2s are dead ends. |
| whip | ✅ fixed 2026-09-27: Infused Whip is the plain t2, gem whips are t3. |
| bat | Two t1s, one t2, no t3; Rubber Bat never upgrades. |
| spear | ✅ Trident moved to t2 as the plain rung (bug #262 resolved). |
| staff | Staff → Thick Staff only; Thick Staff's growth goes sideways into untiered gem wands. |
| gun / bow | Deep: 11 gun t3s, 8 bow t3s. No gap. |

**Untiered weapons** (the fountain returns them; nothing upgrades them): all 7 gem wands,
Scythe, Flail, Fishing Pole, Stun Baton, Pickaxe. The code comment on `buildWeaponTiers`
treats this as intended for wands.

**Upgrade monoculture:** Fire Essence (19 recipes), Metal (22) and Bone (20) carry most
post-t1 upgrades. "+F" or "+M" is the right guess far more often than knowledge should allow.

## 2. Under-used ingredients (recipe count)

| Uses | Ingredient | Other sink outside recipes | Read |
|---|---|---|---|
| 0 | Thick Fur `K` (rare Moose drop) | **none** | Only ingredient with no use anywhere. Top priority. |
| 0 | Ore `2` | Fireplace smelt → Metal / Slag | Leave. A direct recipe would bypass the red-zone Metal gate that smelting exists to soften. |
| 0 | Sap / Fire Sap / Frost Sap | Hut press → oils | Leave. Press is their loop. |
| 0 | Artifact `⚜` | Errand / Wise Fellow trade | Leave. It's the Gray **Truth** item in Legend of Three; spending it in a forge is an authorial call. |
| 0 | Pearl `●` | Treasure offering | Leave. |
| 1 | Slag `4` | Slag Golem | Item comment: "not itself craftable into anything yet". Candidate. |
| 1 | Diamond `⧫` | Force Wand | Candidate. |
| 1 | Pollen `ł` | Bloom Mantle | Candidate. |
| 1 | Dust / Eye / Leaf / Root | Mana + alchemy potions | Light but has sinks. Eye and Dust are good weapon hooks. |
| 2 | Venom `v`, Ice `i`, Garnet `⬥` | alchemy (Venom) | Candidates. |
| 2 | Moss `❦` | — | Both uses are the same Moss Cloak (two slot orders). Candidate. |

## 3. Candidate recipes (little-used ingredient × t1/t2 weapon)

Convention: base weapon left, ingredient right (the gem-infusion order). The zone column
is the cosmology lens (`zone-cosmology.md`): the verb the weapon should reward.

| # | Recipe | Result idea | Fills | Zone / verb |
|---|---|---|---|---|
| 1 ✅ | Axe `⊦` + Bone `b` | Bone Axe `⊤` (existing; Bone + Metal route kept) | Reconnects the axe ladder t1 → t2 | — |
| 2 ✅ | Whip `≋` + Thick Fur `K` | **Bullwhip**, plain t2 whip (reach / stronger disarm) | Whip's plain t2 slot (fountain can upgrade whips); first Thick Fur sink | Green · Acquire (hunted hide) |
| 3 ✅ | Whip `≋` + Moss `❦` | **Vine Whip**: disarmed gear flies to the player | Second Moss use; whip disarm made greedy | Green · Acquire |
| 4 ✅ | Maul `⟘` + Slag `4` | **Slag Maul**, t3 hammer, impact leaves a burning slag patch | Maul dead end; first Slag weapon sink | Red · React |
| 5 ✅ | Longsword `⫯` + Diamond `⧫` | **Diamond Longsword**, plain t2/t3 sword (crit) | Longsword dead end; Diamond's 2nd use | Yellow (gem ownership) |
| 6 ✅ | Vampire Dagger `ᛘ` + Garnet `⬥` | **Bloodletter**, t3 dagger, stronger lifesteal | Dagger t3; ties to Garnet Staff / Blood Robe | Red · React |
| 7 ✅ | Acid Blade `ᚢ` + Venom `v` | t3 poison dagger (stacking poison) | Dagger t3 elemental | Green |
| 8 ✅ | Dagger `↾` + Ice `i` | **Icicle**, freeze dagger t2 | Dagger t2 elemental; Ice's 3rd use | Cyan · Anticipate |
| 9 ✅ | Slingshot `Ψ` + Eye `e` | **Keen Slingshot** `⋔`: launches on the exact angle to the nearest enemy | Slingshot dead end; Eye weapon use | Cyan · Anticipate |
| 10 ✅ | Scythe `Ƨ` + Dust `d` | **Reaper's Scythe**, gray-themed | Scythe untiered dead end; Dust weapon use | Gray |
| 11 ✅ | Boomerang `↩` + Pollen `ł` | Drowse boomerang: sleep dust on return | Boomerang dead end; Pollen's 2nd use | Yellow (press/pollen) |
| 12 ✅ | Axe `⊦` + Ice `i` | **Ice Axe** (freeze) | Axe gets an elemental t2 next to plain Bone Axe | Cyan |

Not proposed: **Maul + Diamond → Crystal Maul**. The pair is free, but Crystal Maul is a
secret-vein U-room find (t4). A recipe would turn that discovery into a shortcut.

## 4. Side findings

- **Bug #162 looks stale.** `∿` is now defined once (Ruby Whip). Primal Potion lives at
  `¿`. Worth confirming and moving to resolved.
- **Naming clash:** the Three Conductors puzzle rods are named `'Lightning Rod'`
  (`PuzzleSystem.js` `_generateThreeConductors`) but aren't Lightning Spires, while the
  new Lightning Rod item is one. Either rename the puzzle rods or decide whether they
  should also be spires.

## 5. Round 2 — existing tier-2 weapons

**Implemented 2026-09-27**, with these changes from the proposals below:
- Lightning Sword `Ꞩ` moved to **tier 3**; new plain t2 **Magic Sword `⸸`** (Sword + Mana) throws the Storm Staff's bolt on every swing (no mana cost). Lightning Sword = Magic Sword + Topaz.
- Venom Blade and Venom Lance now go through **Slurry** (`†`+`⚗`, `↑`+`⚗`); Dragon Blade + Goo removed.
- Trident `ⲯ` is the plain spear t2 (Spear + Jaw kept, Spear + Sharkbone added).
- Barbed Bat / Barbed Lance use poison DoT, not bleed.
- Behavior flags live in `src/systems/WeaponEffectsSystem.js`.

Checked free in both slot orders, 2026-09-27.

**Tier-2 weapons with no recipe, or a strange one:**
- **Lightning Sword `Ꞩ`:** no recipe at all.
- **Venom Blade `ᛡ`:** the only route is Dragon Blade (t3) + Goo, which turns a tier-3 weapon into a tier-2 one.
- **Vampire Dagger, Ice Hammer and Exploding Mace:** each is crafted only from another family (sword or axe), never from its own family's tier 1.

**New routes into existing tier-2 weapons:**

| Recipe | Result | Why |
|---|---|---|
| Sword `†` + Topaz `◇` | Lightning Sword `Ꞩ` | Gives the sword its gem-infusion route, like the Topaz whip |
| Sword `†` + Venom `v` | Venom Blade `ᛡ` | Forward route; Venom's third use |
| Dagger `↾` + Meat `m` | Vampire Dagger `ᛘ` | Dagger ladder built from the dagger |
| Hammer `⊥` + Sapphire `⬨` | Ice Hammer `ᛜ` | Hammer ladder built from the hammer |
| Hammer `⊥` + Bomb `@` | Exploding Mace `✺` | Same |
| Spear `↑` + Sharkbone `n` | new plain spear t2 | Fixes bug #262 (unattuned fountain refuses spears); Sharkbone's second use |

**Tier-2 → tier-3, each through a little-used ingredient:**

| Recipe | Result idea | Zone / verb |
|---|---|---|
| Fester's Gun `ƒ` + Venom `v` | Plague Gun: poison cloud where a bullet stops | Green |
| Metal Bat `⸘` + Stingray Barb `Y` | Barbed Bat: bleed | Cyan |
| Venom Lance `↟` + Stingray Barb `Y` | Barbed Lance: poison + bleed | Cyan |
| Ice Hammer `ᛜ` + Ice `i` | Glacier Hammer: shatters frozen enemies | Cyan · Anticipate |
| Exploding Mace `✺` + Pollen `ł` | Spore Mace: sleep-dust burst | Yellow |
| Lava Sword `ᚠ` + Slag `4` | Slag Blade: cooled-slag patches | Red · React |
| Onyx Hammer `⬢` + Ash `a` | Cinder Hammer: blinding ash cloud | Red |
| Thick Staff `Ⲯ` + Root `r` | Rootstaff: roots enemies in place (staff t3) | Green |
| Keen Slingshot `⋔` + Pearl Shard `p` | Pearl Slingshot: ricochets, re-aiming at the nearest enemy after each bounce | Cyan |

## 6. Keen aim: other users

The mechanic is `keenAim` in `src/systems/KeenAim.js` (term "Keen", chosen 2026-09-27; glossary entry pending). It aims once, at
launch, which makes it different from `homing`.

| Candidate | Recipe (free) | Wiring cost |
|---|---|---|
| Pearl Slingshot ✅ | Keen Slingshot + Pearl Shard | Re-aims on each ricochet |
| Marksman Pistols | Heavy Pistols `ᚷ` + Eye `e` | Bullet path already done; aim the two pistols at the 1st and 2nd nearest enemies |
| Hawk Bow | Sky Bow `⇒` + Eye `e` | Apply the flag to `createArrow`; must stay distinct from Homing Bow (aim fixed at launch vs. steering in flight) |
| Keen Boomerang | Boomerang `↩` + Eye `e` | Aim BoomerangMechanic's outbound throw |
| Trap throws | (an armour or oil property) | TrapSystem deploy throw lands on the nearest enemy |
| Eye enemies | the enemy that drops Eye | Its shots use the same aim; you learn it from the enemy before you craft it |

## 7. Later additions

- **Bolo Launcher `⊶`** (t2 plain GUN, Sling + Fur): one whirling bolo `⚯` per room; snares any enemy that isn't huge (boss-tier, or mass ≥ 2.5 — Troll and up).
