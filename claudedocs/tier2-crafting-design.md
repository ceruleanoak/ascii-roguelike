# Tier 2 Crafting Chart — Starter Satchel → Green Zone

Design doc, 2026-06-10. **Status: implemented same day** (see §7 for the decision
log — zone mineral ownership moved Metal to red, pickaxe became a unique item,
NPC speech moved to the dialogue box). Charts the second crafting tier reachable
from the starter satchel + green-zone early ingredients, under three rules:

1. **No slot machine for any tier-1 weapon** — every tier-1 same+same must have an
   explicit recipe (the duplicate-upgrade random cycle in `CraftingSystem.js` only
   fires when `findRecipe` misses).
2. **Tier-2 gate ingredients must not be reliably farmable L1–L3** — but must be
   achievable through deliberate, knowledge-driven play.
3. **Green-zone room letters must be reliable, legible ingredient choices** — the
   letter is the shopping aisle. Recreate the satchel feeling at scale.

---

## 1. Satchel Combination Matrix (current state)

Satchel = 3 distinct picks from `{g, 0, |, ~, f, M}` (`rollStarterSatchelChars`,
main.js). Quantities: `M`×1, `f` arrives with a bonus `0`, `g` arrives with a bonus
`~`, everything else ×2.

Pairwise recipe coverage among the six satchel chars:

|       | g | 0 | \| | ~ | f | M |
|-------|---|---|----|---|---|---|
| **g** | ●¹ | — | — | ⌇ Sticky Tripline | — | — |
| **0** |   | △ Arrowhead | ⊥ Hammer | ⊸ Sling | — | — |
| **\|**|   |   | / Staff | ) Bow | — | ↾ Dagger |
| **~** |   |   |    | ≋ Whip | R Rope/Robe | ⛓ Chain Mail |
| **f** |   |   |    |   | ᐤ¹ | [ Freeze Trap |
| **M** |   |   |    |   |   | ¬¹ Gun |

¹ Unreachable from the satchel itself (only one `g`, one `f`, one `M`) — these are
the first "I need one more of that" hooks pulling the player into green zone.

Chains reachable in REST before the first run (depending on roll):
`| + △ → ⇈ Fletch`, `/ + △ → ↑ Spear`, `/ + ~ → ߒ Fishing Pole`, `/ + M → Ƨ Scythe`.

Every satchel roll yields 2–3 tier-1 crafts; the dead pairs (`g+0`, `g+|`, `g+f`,
`g+M`, `f+0`, `f+|`, `0+M`) are acceptable failed-pair discoveries — they teach the
crafting-grid memory loop.

**Satchel-craftable tier-1 weapon roster** (the inputs to tier 2):
**⊥ Hammer · ⊸ Sling · ) Bow · / Staff · ↾ Dagger · ≋ Whip · ↑ Spear · ⇈ Fletch**
(† Sword and ¬ Gun are *found/late*, not satchel-craftable — Sword drops from
humanoids, Gun needs a second `M`.)

---

## 2. Rule 1 Audit — Slot Machine at Tier 1

Tier-1 entries in `WEAPON_TIERS`: `¬` `)` `†` `⛏` `⊥`.

| Tier-1 | Same+same recipe | Slot machine? |
|--------|------------------|---------------|
| † Sword | †+† → ⫯ Longsword | ✅ pre-empted |
| ¬ Gun | ¬+¬ → X Dual Pistols | ✅ pre-empted |
| ) Bow | )+) → ⋙ Multi-Shot Bow | ✅ pre-empted (note: jumps to T3 pool) |
| ⊥ Hammer | **none** | ❌ random roll into `['☃','◉','⬢']` |
| ⛏ Pickaxe | **none** | ❌ cycle UI into `['⊤']` (deterministic result, gambling presentation) |

**Fixes (as shipped):**

| Tier-1 | Fix | Notes |
|--------|-----|-------|
| ⊥ + ⊥ | **⟘ Maul** (new T2 hammer) | hammerRing pattern + radial knockback 140; in hammer T2 pool. |
| ⛏ | **Unique item** — world copies never spawn while one is owned (quick slots, item chest, pending deposits) | Two pickaxes can't exist → ⛏+⛏ is structurally impossible; no recipe needed. |

The non-tiered satchel weapons (sling, staff, whip, spear, dagger, flail) never
trigger the cycle (`getNextTierPool` returns null) — already rule-1 clean.

---

## 3. Tier 2 Chart — one earned path per satchel weapon

Principle: each tier-1 satchel weapon gets exactly one green-zone-achievable tier-2
combination, gated by an ingredient whose *source is knowledge* (a behavior or a
room-letter choice), not kill volume.

| Tier 1 (satchel) | Tier 2 | Gate ingredient | Knowledge path (green zone) |
|---|---|---|---|
| ⊥ Hammer | **⊥+⊥ → Maul** (new) | a 2nd hammer = `0 0 \| \|` | T-Tunnel (rocks) + G-Grass (trees) farming |
| ⊥ Hammer | ⊥+6 → ⬢ Onyx Hammer | Onyx | stays red-zone (correct — aspirational) |
| ) Bow | )+F → ⟩ Fire Bow | `F` Fire Essence | C-Camp campfire harvest (proposed below) or humanoid uncommon |
| / Staff | /+M → Ƨ Scythe | `M` Metal | T-Tunnel mineral aisle (see §4 — M becomes a destination) |
| / Staff | /+gem → gem wands | gemstones | U-Underground glitter-rock mining rooms |
| ↾ Dagger | ↾+g → ♠ Acid Blade | `g` Goo | slimes + mushroom forage — cheap on purpose (dagger already cost an `M`) |
| ≋ Whip | ≋+gem → gem whips | gemstones | U-Underground mining |
| ↑ Spear | ↑+j → ψ Trident / ↑+v → ↟ Venom Lance | `j` Jaw / `v` Venom | L-Lake fishing (Newt = v) or beast rare |
| ⊸ Sling | **⊸+f → Fur-braced Sling** *(new, optional)* | `f` Fur | currently a dead end; one recipe makes it a real branch |
| ¬ Gun (M+M) | existing gun tree | 2× `M` | two deliberate Tunnel trips after §4 rebalance — no longer ambient by L3 |

Parallel ingredient same+same tier ("green gap" recipes already shipped: `m+m`
jerky, `f+f` Fur Cloak, `t+t` Tooth Necklace, `b+a` Bone Dust, `❦+❦` Moss Cloak) —
these are the consumable/armor echo of the same chart and already follow rule 2's
"second copy is the gate" shape. No changes needed there.

---

## 4. Rule 2 — Metal (and gate-ingredient) rebalance

Current `M` faucets that make guns trivial by L3:

**Zone mineral ownership (decided 2026-06-10): each zone's rocks hide a
different mineral — red owns Metal, yellow is the gem/magic zone, cyan feeds
the bow path, green keeps Moss.**

| Faucet | Before | Shipped |
|---|---|---|
| Rock harvest (`rockHarvest`) | 20% M + 12% ❦ everywhere | guaranteed Rock + **7% zone mineral** (green ❦ / red M / yellow gem / cyan △ Arrowhead) + 3% ⚱ |
| Rock poke (`'/'` interaction) | guaranteed M, repeatable | **zone mineral, once per rock** (`pokeMineralClaimed`) |
| `humanoid` COMMON `[c, M, ~]` | every Goblin from L3 | `M` demoted to UNCOMMON |
| `electric` COMMON `[M]` | yellow = metal fountain | Topaz COMMON, `M` UNCOMMON (yellow = magic identity) |
| Yellow fishing (4/5 catches drop M) | metal fountain | all M → Topaz `1` |
| Crystal `*` object 25% M | — | left as-is; logged bug #90 (mineral-formation crystals' dropTable `'basic'` makes their dropEffect dead code) |

Net effect: in green, `M` between L1–L3 comes only from satchel luck + uncommon
humanoid drops; reliable Metal means traveling red — or knowing that red-zone
rocks (incl. tunnels, the mining aisle) hide it. Gun = deliberate effort.

Gate-ingredient roster for tier 2 (all knowledge-gated, none kill-volume-gated):

| Gate | Source behavior | Already shipped? |
|---|---|---|
| `M` Metal | Tunnel mineral node | rebalance above |
| `❦` Moss | rock harvest 12% | ✅ model citizen |
| `ŝ` Sap | tree harvest 50/50 with stick | ✅ |
| `ł` Pollen | grass cutting 1% | ✅ (very deep knowledge) |
| `v` Venom / `j` Jaw | Lake fishing, beast rares | ✅ |
| `F` Fire Essence | **proposed: C-Camp campfire harvest** (strike the campfire) | new, small |
| gemstones | U-Underground glitter rocks | ✅ |

---

## 5. Rule 3 — Green-zone letter identity chart

Each letter = a legible aisle. Player should be able to say "I'm low on X, so I
take the Y door" — the satchel feeling at scale.

| Letter | Green boost | Aisle identity | Reliable yield today | Gap / proposal |
|---|---|---|---|---|
| **L** Lake | 2.0 | aquatic bundle | fishing: g/v/s/m/b + rare p/n/Y | ✅ the template — keep |
| **K** Key | 2.0 | destructible bundle + 40% vault keys | 1.5× barrels/crates/rocks → spawnRandom each | ✅ good |
| **G** Grass | 1.8 | nature bundle | Scythe guaranteed; pollen 1%; objects *suppressed* (0.45×) | ❌ near-zero ingredients. Add 2–3 forage nodes hidden under tall grass (herb `h`, leaf `l`, string `~`) — revealed by cutting, synergizes with the free Scythe |
| **H** Hut | 1.5 | chest bundle | chest = 2× generic-normal + 10% artifact | ✅ |
| **W** Well | 1.5 | magic path | offering mechanic, no ingredients | leave — it's a different reward axis |
| **I** Island | base | barrel bundle | 3–5 barrels guaranteed | ✅ small but legible |
| **T** Tunnel | base | **mineral aisle (new)** | minimal objects today | ❌ home of the guaranteed `M` node + rock clusters (§4) |
| **C** Camp | base | **fire aisle (new)** | NPC camp | campfire harvest → `F` Fire Essence (gates Fire Bow/Flame Sword without leaving green) |
| **U** Underground | base | gem aisle | glitter-rock mining (gem guaranteed across room) | ✅ underused — this is where whip/staff gem tiers live |
| E/X/A/R | base | combat, drop RNG | weak tier = 60% nothing | accepted variance — these letters buy *progress*, not ingredients |

Diagnosis of "limited ingredient gain on certain runs": weak-tier drop table
(60% nothing) + a run that rolls mostly E/X/A/R exits = starvation. With G and T
fixed, every green room set contains at least one legible aisle, and the choice of
door becomes the resource strategy.

---

## 6. Net-new content

| Item | Type | Rule served | Status |
|---|---|---|---|
| ⟘ Maul (⊥+⊥) | recipe + item | 1 | ✅ shipped |
| Pickaxe uniqueness (despawn-while-owned) | spawn gate | 1 | ✅ shipped |
| Zone mineral rock table + poke once-per-rock | tuning | 2 | ✅ shipped |
| `M` demotions (humanoid, electric, yellow fishing) | tuning | 2 | ✅ shipped |
| Tunnel mining aisle (rock objectBias 3×, ≥1 formation) | room content | 2, 3 | ✅ shipped |
| Vault abundance (2 chests + 2–3 barrels in cage) | room content | 3 | ✅ shipped |
| Fisherman NPC (hut 7%, peaceful low-depth L/O 35%) | NPC | 3 | ✅ shipped |
| Ocean fishing (`ocean` table, blue-zone supply, pearl legend) | system + data | 3 | ✅ shipped |
| Grass forage nodes (G letterTemplate) | room content | 3 | open |
| Campfire `F` harvest (C room) | interaction | 3 | open |
| Fur-braced Sling (⊸+f) | recipe + item | dead-end fix | open |

## 7. Decision log (2026-06-10)

- **Slot machine**: Maul recipe pre-empts hammer; pickaxe is unique (two can
  never exist) instead of an explicit ⛏+⛏ recipe.
- **Zone minerals**: green=Moss, red=Metal, yellow=gems (magic identity),
  cyan=Arrowheads (bow/stealth identity). Red's obsidian/lava-crystal gem
  boulders kept — separate secret with its own rare saying.
- **NPC voice isolation**: all NPC speech goes through `DialogueSystem` +
  `DialogueBox` (SPACE-driven, bordered, Unifont, speaker glyph). The
  narrator/genie owns center-screen VentureArcade text — never NPCs. Speaker
  protocol: implement `getDialogueLines(game)` on the NPC; camp-NPC paid hints
  open the box programmatically.
- **Fisherman**: hut kind (7%) + peaceful low-depth (≤4) Lake/Ocean rooms
  (35%, replaces all enemies, exits open). **One saying per visit** (WiseFellow
  pattern — collecting the full tip set takes repeat visits). Tips are
  table-driven (common catches only, weight ≥10 — rares stay secret); rusalka
  warning only where `rusalkaChance > 0`; ocean variant adds the pearl legend
  (blue-zone breadcrumb); hut variant adds the coin-trade breadcrumb. Fishing minigame now runs in O rooms via the `ocean` table
  (fatter p/n/Y line than green lakes).
- **Vault keys**: ߃ already drops from humanoid RARE pool (normal+ tiers only,
  thanks to bug #65), so the K-room path is the reliable route and enemy drops
  remain a discovery — matches the ask without changes.
- **Fisherman coin demo (hut only)**: after his tips are heard once, SPACE with
  a wallet coin buys the lesson — fish appears (0.9s), pause (1.2s), he cuts it
  open and the catch's ingredients scatter for normal passive pickup
  (`FishermanDemoSystem`; rolls the hut zone's fishing table, re-rolling
  drop-less catches). Shows "a blade opens the catch" instead of telling.
