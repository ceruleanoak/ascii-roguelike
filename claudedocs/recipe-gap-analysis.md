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
| whip | No t3. The t2 rung is 100% elemental, so an unattuned fountain can't upgrade a whip (same shape as spear bug #262; resolved #109 called it intentional). |
| bat | Two t1s, one t2, no t3; Rubber Bat never upgrades. |
| spear | Bug #262: Venom Lance alone on t2. |
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
| 1 | Axe `⊦` + Bone `b` | Bone Axe `⊤` (existing) | Reconnects the axe ladder t1 → t2 | — |
| 2 | Whip `≋` + Thick Fur `K` | **Bullwhip**, plain t2 whip (reach / stronger disarm) | Whip's plain t2 slot (fountain can upgrade whips); first Thick Fur sink | Green · Acquire (hunted hide) |
| 3 | Whip `≋` + Moss `❦` | **Vine Whip**: disarmed gear flies to the player | Second Moss use; whip disarm made greedy | Green · Acquire |
| 4 | Maul `⟘` + Slag `4` | **Slag Maul**, t3 hammer, impact leaves a burning slag patch | Maul dead end; first Slag weapon sink | Red · React |
| 5 | Longsword `⫯` + Diamond `⧫` | **Diamond Longsword**, plain t2/t3 sword (crit) | Longsword dead end; Diamond's 2nd use | Yellow (gem ownership) |
| 6 | Vampire Dagger `ᛘ` + Garnet `⬥` | **Bloodletter**, t3 dagger, stronger lifesteal | Dagger t3; ties to Garnet Staff / Blood Robe | Red · React |
| 7 | Acid Blade `ᚢ` + Venom `v` | t3 poison dagger (stacking poison) | Dagger t3 elemental | Green |
| 8 | Dagger `↾` + Ice `i` | **Icicle**, freeze dagger t2 | Dagger t2 elemental; Ice's 3rd use | Cyan · Anticipate |
| 9 | Slingshot `Ψ` + Eye `e` | **Keen Slingshot**: crit on a still, lined-up shot | Slingshot dead end; Eye weapon use | Cyan · Anticipate |
| 10 | Scythe `Ƨ` + Dust `d` | **Reaper's Scythe**, gray-themed | Scythe untiered dead end; Dust weapon use | Gray |
| 11 | Boomerang `↩` + Pollen `ł` | Drowse boomerang: sleep dust on return | Boomerang dead end; Pollen's 2nd use | Yellow (press/pollen) |
| 12 | Axe `⊦` + Ice `i` | **Ice Axe** (freeze) | Axe gets an elemental t2 next to plain Bone Axe | Cyan |

Not proposed: **Maul + Diamond → Crystal Maul**. The pair is free, but Crystal Maul is a
secret-vein U-room find (t4). A recipe would turn that discovery into a shortcut.

## 4. Side findings

- **Bug #162 looks stale.** `∿` is now defined once (Ruby Whip). Primal Potion lives at
  `¿`. Worth confirming and moving to resolved.
- **Naming clash:** the Three Conductors puzzle rods are named `'Lightning Rod'`
  (`PuzzleSystem.js` `_generateThreeConductors`) but aren't Lightning Spires, while the
  new Lightning Rod item is one. Either rename the puzzle rods or decide whether they
  should also be spires.
