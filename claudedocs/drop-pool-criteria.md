# Drop-Pool Criteria — what an enemy can drop

Status: **criteria stated by the user 2026-09-27; audit below is proposals only — nothing moved yet.**
ADR candidate logged in `docs/adr/BACKLOG.md`.

## The criteria (user's words)

1. Tier 1 enemies should drop tier 1 basics.
2. Affinity-based items should only drop from matching affinity.
3. Items with unique mechanics that aren't utility (utility items are found in dungeons) should be considered rare drops.
4. Tier 2 and Tier 3 basics (no unique mechanics, simple affinities) can be found in trap rooms in dungeons.

Found items (Path Amulet, Spectacles, X Blade, Chromablade) sit outside the drop system entirely.

## How the drop system works today

- `AFFINITY_POOLS` (`src/data/items.js`) holds one pool per affinity (undead, goo, beast, humanoid, fire, ice, venom, dragon, gemstone, rare_gemstone, grave, electric, aquatic, nature, generic). Each pool is split by category (ingredients / weapons / traps / armor / consumables) and by rarity (COMMON / UNCOMMON / RARE / EPIC).
- `generateEnemyDrops(affinities, tier)` uses the enemy tier (`RARITY_PROFILES`: weak / normal / elite / boss) **only to weight rarity**. Item tier is never gated by enemy tier, so a weak enemy can roll any UNCOMMON entry, including a tier-3 weapon.
- Dungeon Trap Room reward: `TRAP_ROOM_REWARD_POOL` (`DungeonFloorGenerator.js`) = Flame Sword `‡`, Maul `⟘`, Venom Lance `↟`, Fire Bow `⟩`. That is already the "tier-2 basics in trap rooms" shape.

## Audit against the criteria (weapons)

This was checked by hand. A scripted "has a unique mechanic" flag was too noisy: critChance, meleeChar, weaponLevel and attackWidth are basic stats, not mechanics.

### Rule 4: tier-2/3 basics in enemy pools (move to the Trap Room pool)

| Item | Tier | Pool / rarity |
|---|---|---|
| Bone Axe `⊤` | 2 | undead, UNCOMMON |
| War Spear `⇑` | 2 | humanoid, RARE |
| Shotgun `ᛉ` | 2 | humanoid, RARE |
| Machine Gun `⌐` | 2/3 | humanoid, RARE |
| Dragon Shotgun `ᚲ` | — | dragon, RARE |
| Dragon Blade `ᛖ` | — | dragon, RARE |

Open question: Dragon Shotgun and Dragon Blade are affinity items (dragon). Rule 2 would keep them in the dragon pool; rule 4 would move them to the Trap Room. The criteria don't yet say which rule wins.

### Rule 3: unique-mechanic weapons that are not RARE

| Item | Mechanic | Pool / rarity |
|---|---|---|
| Flail `○` | spin | humanoid, COMMON |
| Multi-Shot Bow `⋙` (t3) | multi-arrow | humanoid, UNCOMMON |
| Thick Staff `Ⲯ` | block-release | (pool entry) |
| Trident `ⲯ` | pinning | aquatic, UNCOMMON |
| Ice Hammer, Ice Bow (t3), Freeze Ray (t3) | freeze | ice, UNCOMMON |
| Venom Pistol (t3) | lifesteal | venom, UNCOMMON |
| Lightning Gun, Thunder Axe, Stun Gun (t3) | chain/stun | electric, UNCOMMON |
| Fishing Pole `ߒ` | fishing | goo + humanoid, UNCOMMON — arguably *utility*, i.e. dungeon-found, not a drop |

### Rule 2: affinity items in a non-matching pool

- Venom Lance `↟` (poison) sits in the **humanoid** pool. It is also a Trap Room reward.
- To check: Vampire Dagger in the **venom** pool (is lifesteal "venom"?) and Force Wand in the **generic** pool.

### Rule 1: tier-1 enemies dropping tier-1 basics

This is a structural issue, not a per-item one. Pools are shared across enemy tiers and tier only weights rarity, so every COMMON/UNCOMMON t2/t3 entry above is reachable from a weak enemy. Two ways to satisfy rule 1:

- **(a) Data-only:** keep t2+ entries out of COMMON/UNCOMMON in every pool. Once rules 3 and 4 are applied, this mostly follows.
- **(b) System:** `generateEnemyDrops` filters weapon/armor entries by `item.tier <= enemyTierCeiling`. This is enforceable and could become a `check:data` gate.

### Already compliant

- Gem staves appear only as RARE in their matching gemstone pools.
- The Trap Room pool holds tier-2 basics.

## Not yet audited

The armor, trap and consumable categories. They get the same four rules once the weapon pass is settled.
