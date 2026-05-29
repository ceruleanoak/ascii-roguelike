## DATA LAYER REVIEW

---

### File Inventory

| File | Purpose | Notable Exports |
|------|---------|----------------|
| `characters.js` | Player character type definitions (6 types) | `CHARACTER_TYPES` — 6 entries (default, green, red, cyan, yellow, gray) |
| `dungeonDesigns.js` | Per-zone dungeon face layouts (30×30 grid strings) | `DUNGEON_DESIGNS` — 5 zone entries; `getDungeonDesign()` |
| `enemies.js` | Enemy stat definitions, spawn tables | `ENEMIES` — ~42 enemies; `SPAWN_TABLES`, `ZONE_SPAWN_TABLES`, `getEnemyData`, `getZoneRandomEnemy`, `createBossEnemy` |
| `exitLetters.js` | Exit letter room type definitions and secret sequences | `EXIT_LETTERS` — 19 letter entries; `SECRET_PATTERNS` — 6 sequences; `VOWEL_CATEGORY_WEIGHT` |
| `fishingTables.js` | Zone-specific fishing catch tables | `FISHING_TABLES` — 5 zone entries; `pickRandomCatch()` |
| `items.js` | All item definitions, ingredient definitions, affinity drop tables | `ITEMS` (~90 entries), `INGREDIENTS` (~30 entries), `ITEM_TYPES`, `WEAPON_TYPES`, `WEAPON_TIERS`, `AFFINITY_POOLS`, `RARITY_PROFILES`, `generateEnemyDrops()`, `getItemData()`, `resolveWeaponDefaults()` |
| `letterTemplates.js` | Room generation templates per exit letter | `LETTER_TEMPLATES` — 13 entries (A, B, V, K, T, E, I, L, L_BOSS, O, H, M, D, U, R, W) |
| `neutralRooms.js` | Neutral room scripts (lifecycle hooks) | `NEUTRAL_ROOMS` — 3 entries (leshyGrove, threeRoom, drawRoom) |
| `recipes.js` | Crafting recipe table | `RECIPES` — ~80 recipes; `findRecipe()`, `getRecipeResult()`, `findRecipeByResult()` |
| `spells.js` | Spell word definitions and handlers | `SPELLS` — ~25 spell entries including followUps and action callbacks |
| `zones.js` | Zone color, metadata, and generation parameters | `ZONES` — 5 entries; `ZONE_COLORS` |

---

### Schema Consistency Issues

#### enemies.js

- **`mass` field**: Present on many enemies but missing on `'o'` (Slime), `'G'` (Goblin), `'S'` (Skeleton), `'D'` (Dragon), `'W'` (Wizard), `'F'` (Fire Elemental), `'I'` (Ice Golem), `'P'` (Poison Spider), `'N'` (Necromancer), `'Q'` (Queen Spider), `'A'` (Archer Goblin), `'L'` (Looter), `'M'` (Boss Slime), `'s'` (Sea Snake), `'g'` (Frog), `'h'` (Thunder Hawk). These will fall through to whatever default the physics system assumes. If the default is 1.0, slimes and archers will behave incorrectly relative to Trolls (mass 2.5) or Rats (mass 0.5).

- **`movementStyle` field**: Documented as required in CLAUDE.md but missing from many legacy enemies — `'r'` (Rat), `'o'` (Slime), `'M'` (Boss Slime), `'G'` (Goblin), `'S'` (Skeleton), `'O'` (Ogre), `'D'` (Dragon), `'W'` (Wizard), `'K'` (Knight), `'T'` (Troll), `'F'` (Fire Elemental), `'I'` (Ice Golem), `'P'` (Poison Spider), `'N'` (Necromancer), `'Q'` (Queen Spider), `'A'` (Archer Goblin), `'L'` (Looter), `'s'` (Sea Snake), `'b'` (Boar), `'E'` (Ember Sprite), `'l'` (Magma Slug). Only newer enemies added in zone-specific batches consistently have `movementStyle`. The system presumably has a fallback, but it means all legacy enemies share an implicit default rather than declaring intent.

- **`dropTable` vs `affinities` vs `tier`**: The schema comment in CLAUDE.md references `dropTable: 'beast' | ...` but the actual code uses `affinities: ['beast']` (array) and `tier: 'weak' | 'normal' | 'elite' | 'boss'`. `CLAUDE.md` is stale with the old field name. No enemy uses `dropTable` as a field — this is purely a documentation discrepancy, but confusing.

- **`rarityProfile` field**: CLAUDE.md mentions `rarityProfile` on enemies, but no enemy in `enemies.js` defines this field. The actual rarity is encoded in the `tier` field. This is a stale documentation reference.

- **`spellDescription` field**: Present on all enemies. Consistent.

- **Sap enemies lack `sapDamage` explicitly on `attackWindup`**: `'^'` (Bat) and `'X'` (Ice Wraith) both use `attackType: 'sap'` and define `sapDamage`/`sapDamageInterval`. The `damage` field is still set to 1 on both but commented "Not used for sap attacks." If the combat system doesn't explicitly skip `damage` on sap enemies, double damage application is possible.

- **`'v'` (Siren)**: Uses `movementStyle: 'keeper'` but has `speed: 0` and `acceleration: 0`. Its `movementConfig` sets `preferredRange: GRID.CELL_SIZE * 999`. This is a workaround for a stationary enemy — should use `idleBehavior: 'stationary'` without a `movementStyle` keeper override, or have `movementStyle: 'stationary'` defined. The current combo is logically contradictory.

- **`'a'` (Shaman)**: `attackType: 'melee'`, `attackCooldown: 999`, `attackRange: 0`, `damage: 0` — valid for a non-combatant, but `attackType: 'melee'` with `attackRange: 0` is misleading. Should probably be `attackType: 'none'` or a support-only type.

#### characters.js

- **`actionCooldownMax` field**: Only present on `'green'`. No other character type defines it. If the system reads this field generically on all character types, undefined will produce `NaN` comparisons.
- **`idleDamageBonus` / `combatDamagePenalty` fields**: Only present on `'green'`. Same issue as above — undefined on other types.
- **`backstabMultiplier`**: Only on `'cyan'`. Fine as a specialized field, but not documented in CLAUDE.md.
- **`rollSpeed: 0`** on `'yellow'` (blink): This is intentional but semantically odd — a rollSpeed of 0 when the roll is an instant teleport. If any system reads rollSpeed to determine velocity during roll physics, it may interfere.

#### exitLetters.js

- **`roomType: 'COMBAT'` for multiple letters**: `'X'`, `'E'`, `'I'`, `'O'` all map to `roomType: 'COMBAT'`. However, `'E'` (Errand) and `'I'` (Island) have matching entries in `letterTemplates.js` with distinct layout logic. Using `roomType: 'COMBAT'` for these is technically correct (they spawn enemies) but loses semantic distinctiveness that could be useful for system-level routing.

- **`'E'` vowel `roomType: 'COMBAT'`**: `EXIT_LETTERS['E']` has `vowel: true` and `roomType: 'COMBAT'`, but `LETTER_TEMPLATES['E']` has `neutralAfterClear: true`. The flag is set in the template, not the exit letter — if `RoomGenerator` routes on `roomType` rather than letter, the post-clear NPC spawn may never fire.

- **`SECRET_PATTERNS`**: `'D-R-A-W'` references `neutralScript: 'drawRoom'`, which is defined in `neutralRooms.js`. `'B-A-T'` references `rewardType: 'bat_belfry'`. This reward type is not defined in any data file — it is presumably wired in a system. No verification possible from data alone, but worth noting.

#### items.js

- **`'^'` dual definition**: `'^'` is defined as both `'Fire Trap'` (TRAP, line ~1572) AND as the `'^'` Bat enemy in enemies.js. The ITEMS entry for `'^'` as Fire Trap will be returned by `getItemData('^')` — this is a trap item char collision with an enemy char. The game likely disambiguates by context, but `getItemData('^')` returns the Fire Trap, not null, when called in enemy-related code.

- **`'╪'` duplicate definition**: `ITEMS['╪']` is defined **twice**: first as `'Lava Sword'` (line 528, `weaponSubtype: 'sword'`) and second as `'Stun Baton'` (line 953, unsubtyped). JavaScript object literals silently take the last key; the Lava Sword definition is silently dropped. `WEAPON_TIERS.sword` tier 2 includes `'╪'` (expecting Lava Sword), but `getItemData('╪')` returns Stun Baton. This is a confirmed data bug — **the Lava Sword is unreachable** as a craftable item; the recipe `{ left: '‡', right: 'a', result: '╪' }` produces a Stun Baton, not a Lava Sword.

- **`'(': { name: 'Sapphire' }` in INGREDIENTS vs `'(': { name: 'Remote Bomb' }` in ITEMS**: Both `ITEMS['(']` (Remote Bomb, TRAP) and `INGREDIENTS['(']` (Sapphire) use the same char. `getItemData('(')` checks `ITEMS` first, so `'('` resolves as Remote Bomb. The gem wand recipe `{ left: '/', right: '(', result: '⚹' }` expects `'('` = Sapphire but `findRecipe` uses char lookup. Whether this actually works depends on whether the crafting system calls `isIngredient('(')` or `getItemData('(')` for the left/right slots.

- **Oil items use emoji glyphs**: `'🜁'`, `'🜂'`, `'🜄'`, `'🜔'` are alchemical Unicode emoji (U+1F701 etc., in the Supplementary Multilingual Plane). CLAUDE.md explicitly prohibits emoji and notes that Unifont coverage of emoji is unreliable. These may not render on all platforms.

- **`'𝑚'` (Mana) ingredient**: Uses a mathematical italic `m` (U+1D45A, SMP). This is a multi-byte Unicode character in the SMP range. CLAUDE.md says "embed the literal glyph" and warns against inconsistent rendering. SMP characters may not render in Unifont at game cell sizes.

- **Items with no `spellDescription`**: Many weapons and consumables lack `spellDescription`. The spell `WEAPON` / `ARMOR` response falls back to `item.data?.name?.toUpperCase() + '.'` if `spellDescription` is absent, so this is degraded but functional. Armor items `V`, `2`, `O`, `3`, `A`, `4` have `spellDescription`; most weapons do not.

- **`'r': { name: 'Rubber Boots' }` in ITEMS and `'r': { name: 'Root' }` in INGREDIENTS**: `getItemData('r')` returns Rubber Boots (ITEMS checked first). Recipe/ingredient lookups for `'r'` = Root may fail silently if they go through `getItemData` rather than `isIngredient`.

- **`'o': { name: 'Path Amulet' }` in ITEMS and `'o': { name: 'Oil' }` in INGREDIENTS**: Same collision. `getItemData('o')` returns Path Amulet.

- **`'v': { name: 'Steam Vial' }` in ITEMS and `'v': { name: 'Venom' }` in INGREDIENTS**: Same collision pattern.

- **`'Ω'` Floating Boots**: Defined as a CONSUMABLE with `effect: 'float'` and `cooldown: 20`. Also a recipe result (`w` + `f`). The `RARITY_PROFILES.beast.consumables` pool includes `'Ω'` at `RARITY.RARE`. No `oneShot` flag — reusable. Consistent.

#### recipes.js

- **Duplicate result `'A'`**: Two recipes both produce `'A'` (Bone Armor): `{ left: 'b', right: 'b', result: 'A' }` (line 39) and no second one actually — checked. Only one. But `'A'` is also Archer Goblin in enemies.js. Data layer is fine here.

- **Duplicate result `'@'` (Bomb)**: Two recipes produce `'@'`: `{ left: 'F', right: 'g' }` (line 43) and `{ left: 'y', right: 'y' }` (line 44). Both are intentional — two paths to the same item. `findRecipeByResult` only returns the first match (array `.find()`), which means the second path is effectively invisible to any hint system. This is a functional limitation if hint systems exist.

- **Duplicate result `'H'` (Health Potion)**: Two recipes: `{ left: 'm', right: 'F' }` and `{ left: 'G', right: 'm' }`. Same limitation as Bomb.

- **`'f'` (Fur + String = Rope)**: Recipe `{ left: 'f', right: '~', result: 'R' }` produces `'R'` named 'Rope'. But `ITEMS['R']` is `'Robe'` (armor). No item called 'Rope' exists in ITEMS. The recipe result `'R'` resolves to Robe, not Rope. The recipe comment and name field say 'Rope' but produce Robe. This is either a mislabeled recipe or a dead recipe producing an unintended item. The NEW ARMOR RECIPES section also has `{ left: 'f', right: '~', result: 'L' }` for Leather Armor and `{ left: 'k', right: 'F', result: 'R' }` for Robe. So there are two recipes producing `'R'` (Silk+Fire=Robe and Fur+String=Robe), and the earlier one is incorrectly labeled 'Rope'.

- **`↑` (Stun Baton from Spear + Wing)**: Recipe `{ left: '↑', right: 'w', result: '╪' }` at line 111 says name 'Stun Baton'. But as noted above, `ITEMS['╪']` is the Stun Baton (the second definition). The Lava Sword recipe also produces `'╪'` but resolves to Stun Baton. Two completely different weapons sharing `'╪'` means one is silently inaccessible.

- **`Ψ` (Thick Staff)**: Recipe `{ left: '/', right: '/', result: 'Ψ' }`. The Thick Staff appears in ITEMS but is not in `WEAPON_TIERS.staff` — there are no tier entries for staff in WEAPON_TIERS at all. This means no upgrade path exists via the tier system, which may be intentional.

#### spells.js

- **`'LOOKENEMY'`, `'LOOKNORTH'`, `'LOOKEAST'`, `'LOOKWEST'`**: These compound words are defined but would only be typed by a player who already knows to type them — there is no LOOK followUp for 'ENEMY' that routes to 'LOOKENEMY'. The `LOOK` followUps do include `'ENEMY'`, `'NORTH'`, etc. as function handlers. The standalone compound words are redundant — they do the same thing as the LOOK → followUp path but require the player to know the exact compound word. Not a bug, but dead weight.

- **`'HEX'` spell**: Guards on `game.knownSpells?.has('HEX')`. The CLAUDE.md learning path table shows `HEX` is learned via `hexMechanic.learnSpellOnDeath: 'HEX'` on the Hex Witch enemy (`'H'`). This learning mechanism is defined in the enemy data but must be wired in `Enemy.js` or wherever on-death handling runs. No death handler for `learnSpellOnDeath` is visible from data alone.

- **`'FROG'` spell**: Guards on `knownSpells?.has('FROG')`. Per CLAUDE.md, FROG is learned when the Rusalka cures polymorph. This is a runtime event, not data-driven, so it cannot be verified from data files alone.

- **`'SIT'` / `'SITDOWN'`**: Both map to the same handlers. `'SIT'` triggers naturally; `'SITDOWN'` is an obvious alternative. However, the CLAUDE.md "always-available spells" list does not include SIT/SITDOWN. They appear to be ungated — no `knownSpells` guard. This seems intentional since the hut-lowering mechanic requires discovery.

- **`'CLEANSE'` and `'UNCURSE'`**: Both cure polymorph via `polymorphSystem?.cureViaWish`. These are functionally identical except `HEAL` also requires `player?.polymorphed` before offering the wish. Three spells (HEAL, CLEANSE, UNCURSE) converge on the same cure path — possible design confusion for players.

- **`'CONTINUE'` and `'REVIVE'`**: Identical handlers. Aliases. Fine.

- **`'COLOR'` and `'ZONE'`**: Both map to `_lookZone`. Aliases. Fine.

- **`_wishOrdinal` function**: Returns `['1ST', '2ND', '3RD'][n]` for n = 0, 1, 2 and `\`${n + 1}TH\`` for n >= 3. With `game.wishesUsed` starting at 0 and capping at 3, the displayed string cycles 1ST → 2ND → 3RD correctly. But the cap at 3 means n=3 is never reached in practice. Correct.

#### zones.js

- **`bossDepth` missing on `'gray'`**: All other zones define `bossDepth: 15`. Gray explicitly has none. The comment in known-bugs.md (#26) mentions `ZoneSystem.incrementZoneDepth` caps at `bossDepth` — for gray zone this cap is skipped. Intentional per design (gray zone has no boss, depth is unlimited up to 10 per the 5-character good ending mechanic). But it means `ZONES[zone].bossDepth` calls on gray return `undefined`, and any code doing `depth >= bossDepth` must guard against undefined.

- **`alternativeZones: []` on `'gray'`**: Gray has no alternative zone colors. This is the correct design (gray is the endgame spoke), but systems expecting a non-empty `alternativeZones` must handle the empty array.

- **Typo in `'red'` zone wiseSayings**: `'PREPARE FOR HARSE CONDITIONS.'` — "HARSE" should be "HARSH". (Line ~51 in zones.js)

- **`objectWeights` sums**: Green: 0.25+0.20+0.20+0.10+0.15+0.10 = 1.00. Cyan: 0.25+0.20+0.15+0.25+0.15 = 1.00. Gray: 0.40+0.10+0.30+0.20 = 1.00. Red: 0.20+0.15+0.10+0.15+0.15+0.05+0.05+0.15 = 1.00. Yellow: 0.20+0.15+0.15+0.25+0.25 = 1.00. All sum correctly.

- **`spawnTables` field** in zones: Each zone defines `spawnTables: ['basic', 'forest']` etc. These string names do not correspond to any exported data structure. They appear to be unused or reserved for a future system — current spawning uses `ZONE_SPAWN_TABLES` in enemies.js directly.

#### letterTemplates.js

- **`L_BOSS` key**: `LETTER_TEMPLATES` contains `'L_BOSS'` which is not a valid exit letter — no `EXIT_LETTERS['L_BOSS']` exists. This is a composite key for the boss arena variant of the L (Lake) room. If `RoomGenerator` looks up templates by the exit letter char directly, `L_BOSS` will never be retrieved from the map automatically. It requires special injection logic.

- **`'D'` (Dungeon) template**: Uses `hutStructure` key instead of a dedicated `dungeonStructure` key. This implies the dungeon exterior shares the hut door generation code — possibly correct but semantically confusing.

- **`'M'` (Maze) template**: Also uses `hutStructure` key for the same reason. And lacks `hutKind` (present on `'H'` and `'D'`).

- **`'P'` (Press Hut)**: Defined in `EXIT_LETTERS` with `roomType: 'HUT'` and a specific `zoneBoosts`. However, there is **no corresponding entry in `LETTER_TEMPLATES`**. If `RoomGenerator` looks up `LETTER_TEMPLATES['P']`, it returns `undefined`. The P room has no layout template, meaning the press hut likely falls back to the generic H hut template or generates an empty room.

- **`'C'` (Camp)**: Defined in `EXIT_LETTERS` with `roomType: 'CAMP'`. No corresponding entry in `LETTER_TEMPLATES`. Same problem — undefined template lookup.

- **`'?' (Mystery)` and `'R'` (Ridge)**: Both appear in `EXIT_LETTERS`. `'R'` has a template. `'?'` does not — no `LETTER_TEMPLATES['?']`.

#### neutralRooms.js

- **Only 3 scripts defined**: `leshyGrove`, `threeRoom`, `drawRoom`. The `SECRET_PATTERNS['D-R-A-W']` uses `drawRoom` correctly. `threeRoom` is described as a "stub placeholder" in its comment — it places a single `'3'` marker and does nothing else. No `onExit` logic.

- **`threeRoom` uses `'3'` as a BackgroundObject char**: But `'3'` is also `ITEMS['3']` (Reinforced Slime Suit armor). If `InteractionSystem` tries to get item data for a `'3'` background object, it will resolve to the armor data. BackgroundObject probably doesn't use `getItemData()` for rendering, so this may be fine — but it is a char namespace collision.

- **`leshyGrove.generatePrizes()` called as `this.generatePrizes()`**: The `generatePrizes` function is defined as a method on the `leshyGrove` object and called with `this.generatePrizes()` inside `onGenerate`. This works when called as `NEUTRAL_ROOMS.leshyGrove.onGenerate(...)` — `this` is `leshyGrove`. But if `onGenerate` is ever detached from the object and called as a plain function, `this` will be undefined in strict mode.

- **`fishingTables.js` not imported in `neutralRooms.js`**: The L (Lake) room's fishing mechanic is defined in `fishingTables.js` but `neutralRooms.js` does not reference it. The fishing system presumably imports `fishingTables.js` directly. This is an architectural note, not a bug.

#### dungeonDesigns.js

- **Inconsistent grid line lengths**: The cyan grid at row 3 (`#...*.....................*.....#`) is 32 characters wide (not 30). Similarly row 11 (`#..........*.≡...≡.*..........#`) appears to be 32 wide. If the parser splits by `\n` and indexes by column position, extra characters cause off-by-one errors in object placement for the cyan dungeon face.

- **Non-standard Unicode decorative glyphs in grids**: `ↂ`, `░`, `▚`, `▞`, `▪`, `▀`, `⣿`, `ↁ`, `⩺`, `⩵`, `⟐`, `⩹`, `⟃`, `⤚`, `∔`, `⤙`, `⟄`, `≣`, `⫷`, `⩎`, `⩏`, `⫸`, `⨀`, `⎓`, `⨿`, `⢺`, `⠛`, `⡗`, `⧮`, `⧦`, `⧅`, `⟁`, `⧄`, `⨆` — these are rendering decoration for the dungeon face. If `getDungeonDesign()` uses these chars to instantiate `BackgroundObject` entities, each unknown char needs a fallback in `BACKGROUND_OBJECTS`. They are presumably render-only visual chars, but the data file does not clarify this. No corresponding `BACKGROUND_OBJECTS` entries exist in GameConfig.js for these glyphs.

#### fishingTables.js

- **All catches use `char: 'ծ'`**: This is by design — the comment acknowledges it. Consistent.
- **Gray zone has no Rusalka chance** (`rusalkaChance: 0`): All non-green zones have 0. Only green has 0.04. This is likely intentional (Rusalka is a green-zone specific event) but the field exists on all tables.
- **`fishingTables.js` missing a `'cyan'` Rusalka variant**: By design the Rusalka only appears in green, but the field being present on all zones with 0 is misleading rather than absent.

---

### Character Encoding Violations

Per project rules: crafted items (produced by recipes, not dropped raw) must use Unicode symbols (non-letter, non-digit). The following violate this:

| Char | Item Name | Type | Should Be | File |
|------|-----------|------|-----------|------|
| `X` | Dual Pistols | WEAPON | Unicode symbol | items.js |
| `V` | Fur Vest | ARMOR | Unicode symbol | items.js |
| `2` | Stitched Vest | ARMOR | Unicode symbol | items.js |
| `O` | Slime Suit | ARMOR | Unicode symbol | items.js |
| `3` | Reinforced Slime Suit | ARMOR | Unicode symbol | items.js |
| `A` | Bone Armor | ARMOR | Unicode symbol | items.js |
| `4` | Padded Bone Armor | ARMOR | Unicode symbol | items.js |
| `L` | Leather Armor | ARMOR | Unicode symbol | items.js |
| `R` | Robe | ARMOR | Unicode symbol | items.js |
| `W` | Warplate | ARMOR | Unicode symbol | items.js |
| `N` | Ninja Garb | ARMOR | Unicode symbol | items.js |
| `E` | Ember Cloak | ARMOR | Unicode symbol | items.js |
| `I` | Ice Plate | ARMOR | Unicode symbol | items.js |
| `K` | Dragon Scale Armor | ARMOR | Unicode symbol | items.js |
| `G` | Base Potion | CONSUMABLE | Unicode symbol | items.js |
| `H` | Health Potion | CONSUMABLE | Unicode symbol | items.js |
| `z` | Mending Brew | CONSUMABLE | Unicode symbol | items.js |
| `q` | Haste Draught | CONSUMABLE | Unicode symbol | items.js |
| `x` | Stone Skin | CONSUMABLE | Unicode symbol | items.js |
| `u` | Battle Elixir | CONSUMABLE | Unicode symbol | items.js |
| `r` | Rubber Boots | CONSUMABLE | Unicode symbol | items.js |
| `S` | Shield | CONSUMABLE | Unicode symbol | items.js |
| `U` | Tower Shield | CONSUMABLE | Unicode symbol | items.js |
| `y` | Firecracker | CONSUMABLE | Unicode symbol | items.js |
| `v` | Steam Vial | CONSUMABLE | Unicode symbol | items.js |
| `P` | Poison Flask | CONSUMABLE | Unicode symbol | items.js |
| `Z` | Venom Vial | CONSUMABLE | Unicode symbol | items.js |
| `J` | Jolt Jar | CONSUMABLE | Unicode symbol | items.js |
| `T` | Tonic | CONSUMABLE | Unicode symbol | items.js |
| `o` | Path Amulet | CONSUMABLE | Unicode symbol | items.js |

Note: `CLAUDE.md` already lists the armor violations as "legacy" and explicitly says "do not replicate." The consumable violations are not called out in CLAUDE.md. Items `X` (Dual Pistols) is also a legacy violation not in the CLAUDE.md list. The three tier-upgrade armors `2`, `3`, `4` are also not in the CLAUDE.md migration list.

Additionally, the following chars are used for OIL consumables and may render inconsistently:
| Char | Item | Notes |
|------|------|-------|
| `🜁` | Slick Oil | Alchemical emoji (SMP), CLAUDE.md prohibits emoji |
| `🜂` | Fire Oil | Alchemical emoji (SMP) |
| `🜄` | Frost Oil | Alchemical emoji (SMP) |
| `🜔` | Drowse Oil | Alchemical emoji (SMP) |
| `𝑚` | Mana | Mathematical italic (SMP), rendering at cell size unreliable |

---

### Balance Red Flags

- **`'m'` (Mimic) damage: 5 at tier 'elite'** — The Mimic has `damage: 5` and `attackCooldown: 1.2`, which is the highest single-hit damage of any green-zone enemy (Dragon has 5 but is tier boss). A mimic in the L6-8 green tier pool deals the same per-hit damage as the boss-tier Dragon. This is probably intentional for the ambush-reveal moment, but the first contact will one-shot a player at 5 HP. `enemies.js` line ~932

- **`'R'` (Rockwarden) damage: 5, tier: boss, spawns in red L12+** — hp: 14, damage: 5 with `armorMechanic.damageReduction: 0.6` (player deals only 40% damage while armored). This enemy effectively has 35 effective HP for the first phase. Combined with `windupMovement: 'advance'` and a 4.0 mass, this is the tankiest non-boss-char enemy in the game. Appropriate for red L12+ but may need playtesting.

- **`'V'` (Voltaic Golem) weakness wet: 2.5** — The only 2.5× weakness in the entire enemy roster. All other max weaknesses are 2.0. This dramatically rewards the single strategy (wet + electric golem). `enemies.js` line ~841

- **`'g'` (Frog) speed: 130, acceleration: 800** — Speed is 2.6× faster than the next-fastest enemy (Frost Wolf at 60, Trap Goblin at 52). Combined with jumper movement and `waterJumpSpeed: 190`, frogs in water are effectively unkittable. Intended for the wetland zone, but green-zone players encounter them starting at L3-5. `enemies.js` line ~1503

- **`'^'` (Bat) aggroRange: 10 units** — Highest aggro range of any tier-'weak' enemy. Bats will detect the player from across the room on arrival and immediately latch. Combined with `grassStealth: true` on the Rat, the L2 table `['r', 'o']` + L3 addition of `'^'` means the third depth bracket introduces the most aware weak enemy in the game.

- **`'♥'` (Heart)**: Heals 10 HP with `cooldown: 20` (reusable). No `oneShot`. At max HP of (presumably) 10, this is effectively a full-heal every 20 seconds. This is an extremely powerful consumable with no cap on use count — only timer gated.

- **`'⚔'` (Legendary Flame Sword) vs `'⌘'` (Dragon Blade)**: `⚔` has damage 6, windup 0.9, recovery 0.7 with burn. `⌘` has damage 5, windup 0.75, recovery 0.25 — notably faster. The Dragon Blade's faster recovery may make it practically superior to the "Legendary" sword for kiting, despite lower damage.

- **`'♣'` (Vampire Dagger) lifesteal: 1.0** — Full lifesteal (100% of damage returned as healing) on every multistab hit. With `damage: 3` and the multistab pattern (multiple hits per activation), this is potentially unlimited sustain against any non-dodge enemy. `items.js` line ~908

- **Gem wands all share `rollPulseRadius: 3` (robe radius) but wands have no pulse** — These are distinct systems; just noting wand `manaCost` ranges (1–5) make the Emerald Staff (cost 1, grass_circle effect) trivially cheap relative to Sapphire Staff (cost 5, blizzard). The cost-to-effect ratio is undefined since the effects are stubs.

- **`'¤'` (Infused Coin)** has no `oneShot`, no `cooldown`, no `passive`. If the `InventorySystem` tries to auto-trigger it (effect: 'wellOffering'), it has no trigger conditions defined. Must be handled entirely by the WellSystem's SPACE-press path.

---

### Dead / Orphaned Data

- **`SPAWN_TABLES` in enemies.js (lines 1567-1574)**: This is the "legacy" depth-based spawn table. `getZoneRandomEnemy()` uses `ZONE_SPAWN_TABLES`. `getRandomEnemy()` still uses `SPAWN_TABLES` and is called by `createBossEnemy()`. It's not fully dead but the comment says "legacy - used for fallback." If no system calls `getRandomEnemy()` directly (only `createBossEnemy()`), the legacy table is effectively orphaned except for that path.

- **`WEAPON_TIERS` in items.js**: Defined for GUN (3 tiers), BOW (3 tiers), sword (3 tiers), axe (3 tiers), hammer (4 tiers). No tiers defined for staff, spear, dagger, whip, flail. The comment says "Weapons not listed here have no upgrade path." Unclear if any system actively uses `WEAPON_TIERS` for anything beyond the REST UI's duplicate-item merge system.

- **`'⇒'` (Sky Bow)**: Defined in ITEMS but not in `WEAPON_TIERS.BOW` tier list. It appears in the WEAPON_TIERS tier 2 list as... not present. `WEAPON_TIERS.BOW` tier 2 has only `['⟩']`. Sky Bow `'⇒'` exists in the item table and has a recipe (`⟩` + `w`) but is excluded from the tier upgrade system. It also has no `critChance` field — unlike every other bow except `'⊛'` (Explosive Bow, intentional per comment). Whether the missing tier entry is a problem depends on what `WEAPON_TIERS` is used for.

- **`AFFINITY_POOLS.nature`**: Defined with ingredients, weapons, traps, armor, consumables pools. Comment: "forest / nature enemies (future use)." No enemy in `enemies.js` has `affinities: ['nature']`. The pool is entirely unreferenced.

- **`AFFINITY_POOLS.rare_gemstone`**: Defined. Only appears to be used by the red zone `environmentalFeatures.rockVariants[2].dropTable: 'rare_gemstone'`. This is referenced in zones.js data but would need to be consumed by a system (presumably RoomGenerator or InteractionSystem) that reads `rockVariants`. If that system uses `generateEnemyDrops('rare_gemstone', ...)`, it will work; otherwise the field is orphaned.

- **`EXIT_LETTERS['P']` (Press Hut)**: Defined in exitLetters.js but has no entry in `LETTER_TEMPLATES`. No layout template exists. If the room generation system uses the letter 'P', it will get undefined from `LETTER_TEMPLATES` and must fall back silently.

- **`EXIT_LETTERS['C']` (Camp)**: `roomType: 'CAMP'`. No entry in `LETTER_TEMPLATES`. No neutral room script. No corresponding system content visible in data files. Appears to be placeholder/reserved.

- **`EXIT_LETTERS['?']` (Mystery/Discovery)**: `roomType: 'DISCOVERY'`. No entry in `LETTER_TEMPLATES`. No neutral room script defined.

- **`zones.js` `spawnTables` field**: Values like `['basic', 'forest']`, `['fire', 'demon']`, etc. No corresponding exported tables exist anywhere in the data layer. These strings appear to be reserved identifiers for a future spawn-table system that uses named tables instead of depth-keyed arrays. Currently no system reads this field.

- **`CHARACTER_TYPES.gray` trap affinity**: `weaponAffinities: { 'trap': { additionalCharge: 1 } }`. No system or item checks for the 'trap' weapon affinity key. The comment says "if traps exist" — this affinity is conditionally wired but the data suggests it may be unimplemented. The gray assassin's bonus trap capacity may be silently a no-op.

---

### Missing / Incomplete Content

- **`'P'` (Press Hut) room template**: `EXIT_LETTERS['P']` exists, `roomType: 'HUT'`, but no `LETTER_TEMPLATES['P']`. If spawned, the room falls back to the default hut or an empty template.

- **`'C'` (Camp) system**: `EXIT_LETTERS['C']` references `roomType: 'CAMP'`. No template, no neutral room, no camp logic visible. The Camp concept is entirely undefined.

- **`'?' (Mystery)` system**: `roomType: 'DISCOVERY'`. No template, no neutral room script.

- **`hexMechanic.learnSpellOnDeath: 'HEX'`**: The Hex Witch data defines this field, but the actual spell-learning on kill must be implemented in whatever system handles enemy death events. Cannot verify from data that this learning path is wired.

- **Gem wand spell effects**: All 6 gem wands have `spellEffect` values (`'fire_aoe'`, `'blizzard'`, `'chain_stun'`, `'blind_cone'`, `'grass_circle'`, `'charm_aoe'`). The items.js comment says "Placeholder spell logic in Phase 1 — real effects implemented in Phase 2." These are stubs — the spell effect strings likely don't map to implemented behaviors.

- **`'neutralAfterClear: true'` on `LETTER_TEMPLATES['E']`**: The template marks the Errand room as spawning an NPC after clear, but the neutral script for the Errand room is not in `NEUTRAL_ROOMS`. The `ErrandSystem` / `ErrandCharacter` presumably handles this in code, not as a neutral room script. Whether this is a data gap or correct architecture is ambiguous.

- **`leshyGrove` neutral room**: Defined and fully implemented, but there is no `onRender` hook defined (the method exists on the script object but is not called `onRender` — it's defined as `onRender`). Actually on re-inspection, the hook IS defined — this is correct. The `drawRoom.onRenderBefore` hook is defined but `leshyGrove` only has `onRender`. Systems must support both.

- **Fishing in non-L rooms**: `fishingTables.js` covers all 5 zones. However, fishing is only available in L (Lake) rooms per the `letterTemplates.js` description. The red zone `FISHING_TABLES['red']` entry exists but the red zone has no Lake rooms in its spawn ecology (the L exit letter has a `zoneBoosts` for green and cyan only — not red). Red zone fishing tables may be dead data.

- **`SECRET_PATTERNS['B-A-T']` `rewardType: 'bat_belfry'`**: This pattern is referenced in `known-bugs.md` (#12) as working. The reward type is presumably handled in ExitSystem or a similar system. No data definition of what bat_belfry provides beyond the fixed behavior of unlocking consumable slot 3.

- **`SECRET_PATTERNS['B-A-D']`, `'G-O-O-D'`, `'N-E-W'`, `'D-E-A-D'`**: These patterns define reward types (`'cursed_chest'`, `'holy_chest'`, `'rare_ingredient'`, `'gray_zone_hint'`). None of these reward type strings map to any data definition. They are strings that must be handled by systems — no data layer definition of what each reward provides.

---

### Internal Inconsistencies

- **`ITEMS['╪']` defined twice** (lines 528 and 953): Lava Sword definition is silently overwritten by Stun Baton. The `WEAPON_TIERS.sword` tier 2 array contains `'╪'` expecting Lava Sword. This means the Lava Sword is definitionally unreachable — crafting the recipe produces the Stun Baton, and the tier system points to a nonexistent item. **This is the most severe data bug in the layer.**

- **`'f'` (Fur vs Fire Bat)**: `INGREDIENTS['f']` = Fur. `ENEMIES['f']` = Fire Bat. Both use lowercase `f`. `getItemData('f')` returns Fur (Ingredient). Enemy char lookups use `getEnemyData('f')`. No actual collision in function calls as long as calling code uses the correct function. But the char namespace is shared and visually confusing.

- **`'g'` (Goo vs Frog)**: `INGREDIENTS['g']` = Goo. `ENEMIES['g']` = Frog. Same dual-use char. When a Frog dies, `generateEnemyDrops(['beast', 'aquatic'])` fires — not `'g'` as a drop. Fine, but the visual identity of `'g'` as both Frog and Goo ingredient is confusing for players who see `g` items on the floor.

- **`'0'` (Rock vs Living Rock)**: `INGREDIENTS['0']` = Rock. `ENEMIES['0']` = Living Rock. Same char. A Living Rock and a Rock ingredient share the render char. If the game renders both on the floor simultaneously, they are visually indistinguishable.

- **`'m'` (Meat vs Mimic)**: `INGREDIENTS['m']` = Meat. `ENEMIES['m']` = Mimic. The Mimic disguises as `'▣'` (chest char) until revealed. Once revealed, it renders as `'m'`. On a floor also containing Meat drops (from other enemies), the player cannot distinguish a revealed Mimic from a Meat ingredient.

- **`items.js` `'r'`, `'o'`, `'v'` defined in both ITEMS and INGREDIENTS**: As listed above, `getItemData()` returns the ITEMS entry (Rubber Boots, Path Amulet, Steam Vial) for these chars, not the ingredient (Root, Oil, Venom). Any crafting-system or recipe lookup that calls `getItemData('r')` instead of `INGREDIENTS['r']` will return the wrong data.

- **Stun Baton (`'╪'`) missing `weaponType`**: The second `'╪'` definition (Stun Baton) has no `weaponType` field. All other weapons have `weaponType: WEAPON_TYPES.MELEE` (or GUN/BOW/WAND). The Stun Baton will fail any `weaponType === 'MELEE'` check, meaning melee affinity bonuses, blocking logic, and weapon-slot validation may treat it as undefined type.

- **`'⛏'` (Pickaxe) `weaponSubtype: 'pickaxe'`**: Tier listed in `WEAPON_TIERS.axe` tier 1. `SUBTYPE_DEFAULTS.pickaxe` exists (`attackPattern: 'thrust'`). But `WEAPON_TIERS.axe` expects the axe upgrade path: Pickaxe (tier 1) → Bone Axe (tier 2) → Thunder Axe (tier 3). However, the pickaxe's `weaponSubtype` is `'pickaxe'`, not `'axe'`, so the tier system — if it routes by subtype — would not find Pickaxe in the `axe` tier array. If it routes by the char being present in any tier array, it finds it in `WEAPON_TIERS.axe`. The subtype/tier mismatch is inconsistent.

- **`'G'` (Goblin enemy) vs `'G'` (Base Potion item)**: Both uppercase G. `getEnemyData('G')` returns Goblin. `getItemData('G')` returns Base Potion. No actual collision in function routing — different lookup functions. Visual: a Base Potion on the floor and a Goblin enemy share the render char `G`. A player who doesn't remember which is which will be confused.

- **`zones.js` `'red'` `liquidChar: '~'` and `mudChar: '~'`**: Both lava and dry mud use `'~'` as their char. Since `'~'` is also the String ingredient char in INGREDIENTS and the Water background object in BACKGROUND_OBJECTS, the red zone uses the same visual char for three distinct phenomena (lava, mud, and potentially string drops). Disambiguation is color-only.

- **`LETTER_TEMPLATES['D']` using `hutStructure` key**: The Dungeon entry uses `hutStructure` (the key is named for huts). This is a copy-paste artifact. No semantic impact if the system reads `hutStructure` for all interior-type rooms, but it is confusing and would cause issues if a `dungeonStructure` key is ever added without removing `hutStructure`.

- **`EXIT_LETTERS['B']` (Boss) and `ENEMIES['b']` (Boar)**: Uppercase B = Boss room type in exits; lowercase b = Boar enemy. Not a direct collision but worth noting since `getEnemyData('B')` returns undefined (Boss Slime is `'M'`, not `'B'`).

- **Gray zone spawn tables include `'Q'` (Queen Spider)**: Queen Spider's `affinities` are `['venom', 'beast']`, not undead. The gray zone comment says "Undead enemies only" but Queen Spider does not have `affinities: ['undead']`. This is a thematic inconsistency — either Queen Spider should be in gray (and its affinities should include 'undead') or it should not be in the gray spawn table.

---

### Cross-Reference Notes

For the systems/entities review team:

1. **`ITEMS['╪']` Lava Sword is silently dead.** The JavaScript object literal `{ '╪': {...Lava Sword...}, ..., '╪': {...Stun Baton...} }` results in only the Stun Baton being accessible. Any system relying on `ITEMS['╪']` for Lava Sword will receive Stun Baton data. Recipe `{ left: '‡', right: 'a', result: '╪' }` named 'Lava Sword' actually produces a Stun Baton. WEAPON_TIERS.sword tier 2 includes `'╪'` assuming Lava Sword — the tier upgrade system is broken for this entry.

2. **`getItemData()` collision chars**: `'r'` (Rubber Boots shadows Root), `'o'` (Path Amulet shadows Oil), `'v'` (Steam Vial shadows Venom). Any ingredient usage code that calls `getItemData()` instead of `INGREDIENTS[char]` directly will get wrong data for these three chars. The `isIngredient()` function correctly checks `INGREDIENTS[char]`, which does work — but any code path that does `getItemData(char)?.type === ITEM_TYPES.INGREDIENT` will fail for `'r'`, `'o'`, `'v'` since ITEMS takes priority and those return non-ingredient types.

3. **Stun Baton missing `weaponType`**: Systems doing `item.data.weaponType === WEAPON_TYPES.MELEE` will get `undefined === 'MELEE'` = false for the Stun Baton. It will be treated as an untyped item in all melee-specific code branches (weapon affinity bonuses, staff-block checks, etc.).

4. **Gray zone Queen Spider thematic mismatch**: `ZONE_SPAWN_TABLES.gray` spawns `'Q'` (Queen Spider) which drops from `['venom', 'beast']` affinity pools, not undead pools. Players farming gray zone get beast/venom drops from Queen Spiders, not undead drops. This may or may not be intentional — the undead flavor of gray zone is undermined by non-undead drops.

5. **`LETTER_TEMPLATES['P']` undefined**: Any `RoomGenerator` lookup for `'P'` rooms will receive `undefined`. The system must have a fallback or the 'P' exit letter was added to exitLetters.js without corresponding template work.

6. **`spawnTables` zone field unreferenced**: `ZONES[zone].spawnTables` (e.g., `['basic', 'forest']`) is defined but no system currently reads it. Any new spawn system should check both `ZONE_SPAWN_TABLES` in enemies.js (the active table) and `ZONES.spawnTables` (the unused named-table reference) to avoid duplicating the table selection logic.

7. **Oil consumable emoji chars**: `🜁`, `🜂`, `🜄`, `🜔` (alchemical emoji, SMP range). CLAUDE.md prohibits emoji. These items will render inconsistently across platforms. If a renderer explicitly uses Unifont for these chars, and Unifont's SMP coverage is incomplete at the game's cell size, these items may render as empty boxes or question marks.

8. **`neutralRooms.js` entity imports**: The file imports `BackgroundObject`, `Item`, `Ingredient`, `ITEMS`, `INGREDIENTS`, `getItemData`, `isIngredient` directly. This means `neutralRooms.js` is a code module, not a pure data file. Any changes to entity class constructors will break this file. The review team should be aware that `NEUTRAL_ROOMS` scripts are tightly coupled to entity constructors.

9. **Fishing tables for red zone are likely dead**: The red zone `FISHING_TABLES['red']` exists but the L room letter's `zoneBoosts` does not include red. If `pickRandomCatch('red')` is never called (because no L room generates in the red zone), the red fishing table is unused data.

10. **Dungeon design cyan grid line-length inconsistency**: The cyan `DUNGEON_DESIGNS.cyan.grid` has at least two rows that are 32 characters wide instead of 30. If the grid parser indexes columns by position, objects in those rows will be placed 2 columns too far right, potentially outside the room bounds or clipping into the border.
