# ASCII Roguelike — Developer Reference

Detailed templates, system docs, and lookup tables. Read CLAUDE.md for constraints; come here for how-to.

---

## Directory Structure

```
src/
├── data/
│   ├── characters.js     - Character roster definitions
│   ├── enemies.js        - Enemy stats, drops, spawn tables
│   ├── exitLetters.js    - Exit letter mappings for zones
│   ├── fishingTables.js  - Fishing drop tables
│   ├── items.js          - Weapons, armor, consumables, ingredients
│   ├── neutralRooms.js   - Neutral room layout definitions
│   ├── recipes.js        - Crafting recipes
│   ├── spells.js         - Spell definitions for SpellSystem
│   └── zones.js          - Zone definitions and progression
├── entities/
│   ├── BackgroundObject.js
│   ├── Bobber.js          - Fishing bobber entity
│   ├── BridgeWorker.js    - NeutralCharacter subclass for RidgeSystem
│   ├── CampNPC.js         - Mercenary companion entity
│   ├── Captive.js
│   ├── CharacterNPC.js    - Named character NPC base
│   ├── Debris.js
│   ├── Enemy.js
│   ├── ErrandCharacter.js - Errand-giving NPC
│   ├── FishEntity.js      - Fish during fishing minigame
│   ├── GooBlob.js         - Goo blob enemy/hazard
│   ├── GooDragon.js       - Boss enemy (extends Enemy)
│   ├── GooHead.js         - Boss sub-entity
│   ├── Ingredient.js
│   ├── Item.js
│   ├── Leshy.js           - Forest spirit entity
│   ├── NeutralCharacter.js
│   ├── Particle.js
│   ├── Player.js
│   ├── Puddle.js          - Persistent area-effect floor entity
│   ├── RewardObject.js    - Quest/errand reward pickup
│   └── Rusalka.js         - Water spirit entity
├── systems/
│   ├── AudioSystem.js
│   ├── BossSystem.js        - Zone boss phase management
│   ├── BoulderSystem.js     - Boulder rain hazard lifecycle
│   ├── CampNPCSystem.js     - Mercenary companion AI
│   ├── CharacterSystem.js
│   ├── CheatMenu.js
│   ├── CombatSystem.js
│   ├── CraftingSystem.js
│   ├── DungeonSystem.js
│   ├── EnemySpawnSystem.js
│   ├── ErrandSystem.js
│   ├── ExitSystem.js
│   ├── FishingSystem.js
│   ├── HutSystem.js
│   ├── InteractionSystem.js
│   ├── InventorySystem.js
│   ├── LootSystem.js
│   ├── MazeSystem.js
│   ├── MenuSystem.js
│   ├── NeutralRoomSystem.js
│   ├── PersistenceSystem.js - Disabled
│   ├── PhysicsSystem.js
│   ├── RidgeSystem.js       - Bridge donation/construction quest
│   ├── RoomGenerator.js
│   ├── SpellSystem.js
│   ├── TrapSystem.js
│   └── ZoneSystem.js
├── game/
│   ├── GameConfig.js
│   ├── GameLoop.js
│   └── GameStateMachine.js
├── rendering/
│   ├── ASCIIRenderer.js     - Canvas primitives (drawCell, drawEntity, drawRect)
│   ├── RenderController.js  - Orchestrator & state dispatcher
│   ├── effects/
│   │   └── TextEffects.js
│   ├── state/
│   │   ├── TitleRenderer.js
│   │   ├── RestRenderer.js
│   │   ├── ExploreRenderer.js
│   │   ├── NeutralRenderer.js
│   │   └── GameOverRenderer.js
│   └── ui/
│       ├── ArrowKeyIndicators.js
│       ├── BowChargeIndicator.js
│       ├── CraftingStation.js
│       ├── EquipmentSlots.js
│       ├── GreenRangerIndicator.js
│       ├── HutInteriorOverlay.js
│       ├── InventoryOverlay.js
│       ├── MazeInteriorOverlay.js
│       └── MenuOverlay.js
└── main.js
```

**Gamedev tools**: `tools/sfx-editor/` — `cd tools/sfx-editor && npm start` (Electron chiptune SFX editor, exports WAV).

---

## Quick File Jumps

| What | File | Approx. line |
|------|------|-------------|
| Weapons/Armor/Consumables | `src/data/items.js` → `ITEMS` | ~21 |
| Ingredients | `src/data/items.js` → `INGREDIENTS` | ~1112 |
| Enemies + spawn tables | `src/data/enemies.js` → `ENEMIES` / `SPAWN_TABLES` | ~5 / ~753 |
| Recipes | `src/data/recipes.js` → `RECIPES` | — |
| Background Objects | `src/game/GameConfig.js` → `BACKGROUND_OBJECTS` | ~109 |
| Spells | `src/data/spells.js` → `SPELLS` | 1 |
| Known-spell UI | `ExploreRenderer._renderKnownSpellHints` | — |
| Combat Logic | `src/systems/CombatSystem.js` | — |
| Level Gen | `src/systems/RoomGenerator.js` | — |
| Physics | `src/systems/PhysicsSystem.js` | — |
| Player | `src/entities/Player.js` | — |
| Enemy AI | `src/entities/Enemy.js` | — |
| Attack patterns | `src/entities/Item.js` | — |
| Render dispatch | `src/main.js` render() | ~4145 |

---

## Rendering Architecture

3-tier: `main.js` render() → `RenderController` (orchestrator + dirty flag) → state renderers + UI components → `ASCIIRenderer` primitives.

**Design principles**: Renderers read `game` state only, never modify it. `backgroundDirty` flag prevents unnecessary redraws. Strict z-order: background → foreground → UI overlays.

**Never add rendering logic to main.js** — use the appropriate renderer file.

| Goal | File |
|------|------|
| Title screen | `src/rendering/state/TitleRenderer.js` |
| REST hub | `src/rendering/state/RestRenderer.js` |
| Combat rooms | `src/rendering/state/ExploreRenderer.js` |
| Neutral rooms | `src/rendering/state/NeutralRenderer.js` |
| Game over | `src/rendering/state/GameOverRenderer.js` |
| Bow charge bar | `src/rendering/ui/BowChargeIndicator.js` |
| Dodge controls | `src/rendering/ui/ArrowKeyIndicators.js` |
| Crafting slots | `src/rendering/ui/CraftingStation.js` |
| Equipment slots | `src/rendering/ui/EquipmentSlots.js` |
| Inventory overlay | `src/rendering/ui/InventoryOverlay.js` |
| Selection menus | `src/rendering/ui/MenuOverlay.js` |
| Hut PiP | `src/rendering/ui/HutInteriorOverlay.js` |
| Maze PiP | `src/rendering/ui/MazeInteriorOverlay.js` |
| Text/particle effects | `src/rendering/effects/TextEffects.js` |

---

## Adding New Weapons

**File**: `src/data/items.js` → `ITEMS`

```javascript
'char': {
  char: 'char',
  name: 'Weapon Name',
  type: ITEM_TYPES.WEAPON,
  weaponType: WEAPON_TYPES.GUN | MELEE | BOW,
  damage: 3,
  // Ranged:
  cooldown: 0.5,
  // Melee:
  windup: 0.3,
  recovery: 0.15,
  attackPattern: 'arc' | 'thrust' | 'sweep' | 'ring',
  range: 20,
  // Optional:
  onHit: 'burn' | 'freeze' | 'poison' | 'stun',
  color: '#rrggbb'
}
```

### Weapon Subtype Behaviors

`weaponSubtype` is a **behavior contract** — systems wire checks by `weaponSubtype === '<x>'` across multiple files. **Always grep `weaponSubtype === '<subtype>'` before adding a variant.**

| Subtype | Implicit behaviors | Wired in |
|---------|--------------------|----------|
| `staff` | Hold-to-block after first swing; deflects projectiles; half-speed bracing; 8-dir sweep on block release (dmg = `data.blockReleaseDamage \|\| 0`) | `main.js` `_isBlockingStaff`; `PhysicsSystem.js:281`; `CombatSystem.js:939,1086`; `ExploreRenderer.js:983` |
| `dagger` | Benefits from oil augment (`onHit` override) on multistab; special slot UI and menu equip filter | `Item.js:809`; `EquipmentSlots.js:162`; `MenuSystem.js:293` |
| `hammer` | Shatters frozen enemies (multiplied damage / instant kill) | `CombatSystem.js:777,839` |
| `wand` | Gem-wand charge-cast pipeline (separate from bow charge) | `Item.js`, `MagicSystem.js` |
| `sword`, `axe`, `spear`, `whip`, `flail`, `pickaxe` | Purely descriptive — no implicit behavior beyond `attackPattern` | — |

Orthogonal flags: `isBlade`, `isBlunt`, `canSmash`, `isPickaxe`, `isImpact` (bypasses staff block).

**Adding a variant**: When user says "identical to X except Y," the only changes should be Y. If you find yourself adding a new flag, ask whether parametrizing the existing system is better.

---

## Adding New Enemies

**File**: `src/data/enemies.js` → `ENEMIES`

```javascript
'char': {
  char: 'char',
  name: 'Enemy Name',
  hp: 5,
  speed: 40,
  // acceleration: 300,  // High (~500+) = darty. Low (~60-80) = heavy. Default ≈ 300.
  damage: 2,
  attackRange: GRID.CELL_SIZE * 5,
  aggroRange: GRID.CELL_SIZE * 10,
  attackCooldown: 1.5,
  attackWindup: 0.4,
  // windupMovement: 'stop',  // 'advance' = lurches forward, 'retreat' = backs away
  attackType: 'melee' | 'ranged' | 'magic' | 'fire' | 'sap' | 'tongue',
  sapDamageInterval: 1.0,  // For 'sap' only
  decisionInterval: 0.5,   // Lower = smarter
  color: '#rrggbb',
  dropTable: 'beast' | 'humanoid' | 'undead' | 'elemental_fire' | ...,
  rarityProfile: 'weak' | 'normal' | 'elite' | 'boss',
  movementStyle: 'chaser',  // see table below
  // movementConfig: {},
  // idleBehavior: 'wander',  // or 'stationary'
  // packCoordination: false,
}
```

**Movement archetypes:**

| `movementStyle` | When to use | Key `movementConfig` fields |
|-----------------|-------------|------------------------------|
| `chaser` | Melee, sap enemies | — |
| `keeper` | Ranged, magic, fire (range > 3u) | `preferredRange`, `rangeTolerance` |
| `kiter` | Pack hunters | `kiteDistance`, `retreatThreshold`, `hoverTime` |
| `jumper` | Lunge movement | `jumpInterval`, `jumpSpeed`, `jumpDuration`, `zigzagStrength` |
| `ambusher` | Stationary-until-triggered | `wakeRadius`, `burstSpeed`, `burstDuration` |

**Zone movement personality:**

| Zone | Profiles | Rhythm |
|------|----------|--------|
| green | chaser, keeper, kiter | Learn the basics |
| red | chaser, keeper, ambusher | Pure aggression |
| cyan | kiter, keeper, chaser | Tactical spacing |
| yellow | kiter, keeper, jumper | Erratic timing |
| gray | chaser, keeper | Relentless pressure |

**Then update `ZONE_SPAWN_TABLES`** in `enemies.js` for the appropriate zone.

---

## Adding New Recipes

**File**: `src/data/recipes.js` → `RECIPES`

```javascript
{ left: 'item1_char', right: 'item2_char', result: 'result_char', name: 'Result Name' }
```

Recipes are bidirectional (order doesn't matter).

---

## Adding Environmental Objects

**File**: `src/game/GameConfig.js` → `BACKGROUND_OBJECTS`

```javascript
'char': {
  name: 'Object Name',
  color: '#rrggbb',
  hp: 3,                    // Omit or null = indestructible
  indestructible: true,     // Optional
  solid: true,              // Optional: blocks movement
  bulletInteraction: 'block' | 'pass-through' | 'interact-destroy' | 'interact-preserve',
  flammability: 'none' | 'low' | 'medium' | 'high',
  conductivity: 'none' | 'water' | 'metal',
  slowing: 0.8,             // Optional: movement speed multiplier
  dropEffect: 'destroyObject:spawnIngredient:X',
  interactions: { default: { animation: 'shake', message: null } }
}
```

### Background Object Char Map

| Char | Object | Char | Object |
|------|--------|------|--------|
| `%` | Bush | `~` | Puddle |
| `&` | Tree | `.` | Sand |
| `0` | Rock | `i` | Ice |
| `=` | Water | `!` | Fire |
| `#` | Crate | `$` | Shrine |
| `+` | Brambles | `p` | Barrel |
| `Y` | Stump | `⊞` | Chest |
| `n` | Mushroom | `8` | Bones |
| `*` | Crystal | `\|` | Tall Grass |
| `B` | Metal Box | `,` | Cut Grass |
| `Q` | Boulder | `-` | Tunnel Wall (Horiz.) |
| | | `I` | Tunnel Wall (Vert.) |
| | | `<` | Tunnel Entrance (Left) |

---

## Character Encoding — Legacy Violations

These crafted items predate the two-tier rule. Migrate opportunistically, not all at once. When migrating: update `ITEMS`, all `RECIPES`, all `DROP_TABLES`, and any renderer references.

| Char | Item | Should become |
|------|------|--------------|
| `V` | Fur Vest | Unicode armor symbol |
| `O` | Slime Suit | Unicode |
| `A` | Bone Armor | Unicode |
| `L` | Leather Armor | Unicode |
| `W` | Warplate | Unicode |
| `N` | Ninja Garb | Unicode |
| `E` | Ember Cloak | Unicode |
| `I` | Ice Plate | Unicode (conflicts with `I` Tunnel Wall — fix both) |
| `K` | Dragon Scale Armor | Unicode |
| `R` | Robe | Unicode |
| `S` | Shield | Unicode |
| `U` | Tower Shield | Unicode |
| `H` | Health Potion | Unicode |
| `G` | Base Potion | Unicode |
| `q`, `x`, `u`, `z` | Crafted consumables | Unicode |
| `2`, `3`, `4` | Upgraded armors | Unicode |

---

## Combat Mechanics Reference

**Projectiles & Damage** — `src/systems/CombatSystem.js`:
- `update()`: Main combat loop
- `createAttack()` / `addAttack()`: Player attacks
- `createEnemyAttack()`: Enemy attacks
- `createExplosion()`: AoE damage
- `createChainLightning()`: Chain lightning

**Attack Creation** — `src/entities/Item.js`:
- `createMeleeAttack()`: Router for melee patterns
- `createBullets()`: Gun projectiles
- `createArrow()`: Bow arrows with charge

**Status Effects** — `src/entities/Enemy.js`:
- `applyStatusEffect()`: Apply burn, freeze, poison, stun, etc.
- `updateStatusEffects()`: Tick DOT, expiry, visuals
- `getElementalModifier()`: Resistances and weaknesses

CombatSystem calls into `Enemy.applyStatusEffect()` — all effect state lives on the enemy instance.

### Adding Status Effects

1. Add case to `applyStatusEffect()` with duration and initial state.
2. Add tick logic to `updateStatusEffects()` (DOT, expiry, visual particles).
3. Add resistance check to `getElementalModifier()` if applicable.
4. Reference the effect name in weapon/item `onHit` property.

### Attack Patterns

Existing patterns in `Item.js` → `createMeleeAttack()`:

| Pattern | Method | Used by |
|---------|--------|---------|
| `arc` | `createMeleeArc()` | Swords — 3-hit sweep |
| `sweep` | `createMeleeSweep()` | Axes — 5-position horiz. |
| `thrust` | `createMeleeThrust()` | Spears — linear forward |
| `ring` | `createMeleeRing()` | Flails — circular sweep |
| `shockwave` | `createMeleeShockwave()` | Hammers — expanding rings |
| `multistab` | `createMeleeMultistab()` | Daggers — rapid same-spot |
| `whipcrack` | `createMeleeWhipcrack()` | Whips — long linear crack |
| `slam` | `createMeleeSlam()` | Single massive strike |

**To add a new pattern:**
1. Add `createMeleeYourPattern(player)` in `Item.js`, return attack object(s).
2. Add case to switch in `createMeleeAttack()`.
3. Set `attackPattern: 'yourPattern'` in the weapon definition.

---

## Spell System

Spells are words typed into the keystroke buffer, confirmed with SPACE. Two independent layers — do not conflate.

### Layer 1 — SpellSystem (typed words, no mana)

**File**: `src/data/spells.js` → `SPELLS`

```javascript
'WORD': {
  response: (game) => 'DISPLAY TEXT.',  // ~18 chars max (2× cell size, VentureArcade)
  action:   (game) => { /* side effects */ },    // optional; fires after response
  followUps: { 'YES': ..., 'NO': ... },          // optional; awaiting state
  followUpsActive: (game) => boolean,            // optional guard
}
```

Spell detection scans buffer tail shortest-first — "FIND" fires before "FINDE".

**`game.knownSpells`** (`Set<string>`): Tracks discovered spells this run. Resets on death.
- Guard learnable spells: `game.knownSpells?.has('WORD')` → return `'UNKNOWN SPELL.'` and no-op.
- Teach a spell: `game.knownSpells.add('YOUR_WORD')` at the discovery moment.
- Hint UI (`ExploreRenderer._renderKnownSpellHints`) picks up new spells automatically.

**Always-available spells** (no guard needed):
`LOOK`, `FIND`, `HERE`, `ZONE`, `NORTH`, `EAST`, `WEST`, `WEAPON`, `ARMOR`, `CLEANSE`, `HEAL`, `UNCURSE`, `REVIVE`, `CONTINUE`, `BRIDGE`

**Learnable spells:**

| Word | Learned when | Effect |
|------|-------------|--------|
| `FROG` | Rusalka cures polymorph | Toggles voluntary frog form |

### Layer 2 — MagicSystem (gem wands + mana meter)

**Files**: `src/systems/MagicSystem.js`, `src/data/items.js`, `src/data/recipes.js`

**Mana meter** lives on `player.magicMeter`:
```js
{ active: false, slot: 0, current: 0, max: 10 }
```
Inactive by default. `slot` = index into `player.equippedConsumables`. Resets on death.

**Activation — Well ritual (W-room):**
1. Craft Infused Coin (`¤`): Ash (`a`) + Coin (`c`)
2. Enter W-room, approach well within 3 cells, SPACE with `¤` in consumable slot
3. `MagicSystem.activateMagicMeter()` → meter active, slot cleared, fills to max
4. Also accepts Lucky Coin (`★`) → `player.luckBlessed = true` (half-power luck boost)
5. Raw Coin (`c`) → zone-specific one-time blessing (well not consumed):
   green `luckBlessed` · yellow scatters 2–3 Mana ingredients (`𝑚`, repeatable) ·
   red `wellDamageBlessed` (+1 damage) · cyan `stealthBlessed` (enemy aggro radius ×0.65) ·
   gray/blue `THE WELL IS QUIET.`

**Mana conversion values** (`INGREDIENT_MANA_VALUES`):

| Char | Ingredient | Mana | Char | Ingredient | Mana |
|------|-----------|------|------|-----------|------|
| `g` | Goo | 1 | `F` | Fire Essence | 3 |
| `d` | Dust/Ash | 1 | `1` | Topaz | 4 |
| `h` | Herb | 1 | `9` | Garnet | 4 |
| `r` | Root | 1 | `` ` `` | Emerald | 5 |
| `s` | Scale | 2 | `?` | Ruby | 5 |
| `e` | Eye | 2 | `(` | Sapphire | 5 |
| `v` | Venom | 2 | `6` | Onyx | 6 |
| | | | `_` | Diamond | 8 |

Only Goo (`g`) is currently exposed in the conversion UI. Others reserved for Phase 2.

**Gem wand cast lifecycle**: SPACE held → `tryStartCharge()` validates mana → `isCharging = true` → `chargeTime` accumulates → release fires `releaseGemWand()` → `spendMana()` → `runSpellEffect()`. Release before full charge = cancel (no mana cost).

**The six gem wands** (all: Staff `/` + gemstone; Staff = Stick `|` + Stick `|`):

| Char | Item | Recipe | Charge | Mana | Effect |
|------|------|--------|--------|------|--------|
| `⚝` | Ruby Staff | `/` + `?` | 3.0s | 4 | `fire_aoe` — explosion + burn in 60px radius |
| `⚹` | Sapphire Staff | `/` + `(` | 5.0s | 5 | `blizzard` — freeze all in 90px radius for 5s |
| `⚶` | Topaz Staff | `/` + `1` | 2.0s | 3 | `chain_stun` — lightning from nearest, stuns chain |
| `⚸` | Onyx Staff | `/` + `6` | 3.0s | 2 | `blind_cone` — blinds in 90° forward cone, 120px |
| `⚘` | Emerald Staff | `/` + `` ` `` | 2.0s | 1 | `grass_circle` — tall grass in 3-cell radius |
| `⚭` | Garnet Staff | `/` + `9` | 3.0s | 3 | `charm_aoe` — charms in 80px radius for 10s |

Diamond (`_`) feeds the mana meter; no gem wand intentionally.

**Adding a new gem wand:**
1. Item entry in `items.js`: `gemWand: true`, `chargeTime`, `manaCost`, `spellEffect`.
2. Recipe in `recipes.js`: `{ left: '/', right: '<gem>', result: '<wand>', name: '...' }`.
3. Case in `MagicSystem.runSpellEffect()`.
4. Implement `_castMySpell(attack)` — use `_spawnRingBurst()` or `_spawnConeBurst()`.

---

## CampNPC Companion System

**Files**: `src/entities/CampNPC.js`, `src/systems/CampNPCSystem.js`

C-rooms (letter `C` exit) spawn a mercenary. Hire with Coin (`c`) ingredient.

**State machine:**

| State | Behavior |
|-------|----------|
| `IDLE` | Wanders near campfire. Attracted to dropped weapons within 10 cells. |
| `INTERESTED` | Has weapon. Follows player but tethered to campfire (`?` shown at tether limit). |
| `COMPANION` | Hired (`game.companion`). Full follow + aggro AI. Attack speed 2× slower than player. |
| `FLEEING` | HP = 0. Flees to nearest exit → `game.companion = null`. |

**Hire flow**: NPC picks up weapon → INTERESTED → player within 2 cells + SPACE + coin → hired. If IDLE (no weapon): coin buys a zone-wise-saying hint instead.

**Lifecycle**: `game.companion` (null on death). Full HP restored on room entry. Snaps to player on transition. Weapon is physical — NPC holds real `Item` objects, upgradeable mid-run.

**Directing the companion**: `npc.commandTarget = { x, y }` — general command channel. Enemy aggro overrides; absence falls back to follow-player. Do not create parallel mechanisms.

**Dungeon puzzle (green-zone floor 2)**: Two floor switches at (row 11, cols 7 & 17). Both pressed simultaneously = stairs unlock. Player on one switch → `commandTarget` set to other switch via `DungeonSystem._updateCompanionSwitches`. `commandTarget` cleared on floor transitions.

---

## Room Generation Reference

- Main layout: `RoomGenerator.generateRoom()`
- Object placement: `RoomGenerator.placeBackgroundObjects()`
- Enemy placement: `RoomGenerator.spawnEnemies()`
- Physics collisions: `PhysicsSystem.checkCollisions()`
- Movement: `PhysicsSystem.updatePosition()`
