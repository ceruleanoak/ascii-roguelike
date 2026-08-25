import { GRID } from '../game/GameConfig.js';
import { Hoardmaw, BRIBE_OFFER_WINDOW } from '../entities/Hoardmaw.js';
import { Item, getRandomDrop, RARITY_PROFILES } from '../data/items.js';
import { GREEN_HOARDMAW_SPEC } from '../data/dungeonBosses/green.js';

// Spawn anchor: the maw fills the vault's north half — body center sits at
// (12, 6) in floor cells, player fights in rows 10+.
const SPAWN_COL = 12;
const SPAWN_ROW = 6;

/**
 * DungeonBossSystem — Layer 2 orchestrator (claudedocs/boss-design.md §Layer
 * 2, claudedocs/dungeon-boss-green.md). Zone Bosses answer to BossSystem;
 * dungeon bosses answer to this. One active encounter at a time: the vault
 * floor's own boss.
 *
 * Deliberately NOT in the floor.enemies tick loop — bespoke bosses are
 * driven once, here, on a real-second clock (the #216 triple-tick lesson:
 * EnemyUpdateSystem is the sole driver for ordinary enemies; bespoke boss
 * systems are the sole driver for their bosses). The maw is registered with
 * PhysicsSystem directly for collision presence; rendering goes through the
 * boss-composite path, not the generic enemy loop.
 */
export class DungeonBossSystem {
  constructor(game) {
    this.game = game;
    this.hoardmaw = null;          // live encounter entity (or null)
    this.spec = GREEN_HOARDMAW_SPEC;
    this.bribeMoundItems = [];     // the temptation pile (Item refs)
    this.breathApplied = false;    // Gold Breath one-shot guard
    this._paidOut = false;         // defeat payout one-shot
    this._finalPileOut = false;    // strike-the-pile beat spawned
    this._elevationCooldown = 0;   // gilded-companion contribution cadence
    this._coinFlights = [];        // cursed-slot discharges mid-arc
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Called by DungeonSystem._activateFloor for every floor swap. */
  onFloorActivated(floor) {
    if (!floor?.isVault) return;
    if (this.game.hoardmawDefeatedThisRun) return; // once per run (ratified)
    if (this.hoardmaw && !this.hoardmaw.defeated) return; // already live (cached floor)

    const cs = GRID.CELL_SIZE;
    const maw = new Hoardmaw(SPAWN_COL * cs + cs / 2, SPAWN_ROW * cs + cs / 2);
    maw.setCollisionMap(floor.collisionMap);
    maw.setBackgroundObjects(floor.backgroundObjects);
    maw.target = this.game.player;
    this.hoardmaw = maw;
    this.game.physicsSystem.addEntity(maw);
    this.breathApplied = false;

    // The ambush prologue: it rests as an innocuous centerpiece until first
    // approached. Reveal is behavioral — no text, per the non-instructive rule.
    maw.dormant = true;
  }

  /** Player crossed the wake threshold in front of the pile → snap. */
  _checkAmbush(player) {
    const maw = this.hoardmaw;
    if (!maw || !maw.dormant) return;
    const my = maw.mouthY();
    // Wake when the player stands within 3 cells of the mouth line.
    if (Math.abs(player.position.y - my) < GRID.CELL_SIZE * 3) {
      maw.dormant = false;
      this.game.audioSystem?.playSFX?.('boss_roar');
    }
  }

  /** Called on dungeon exit / interior reset — tear down without payout. */
  reset() {
    if (this.hoardmaw) {
      this.game.physicsSystem.removeEntity(this.hoardmaw);
      this.hoardmaw = null;
    }
    this.bribeMoundItems = [];
    this._landCoinFlights();
    this.breathApplied = false;
    this._paidOut = false;
    this._finalPileOut = false;
    // Fleeing the delve lifts the curse with everything else — without this
    // the flag would stick and keep consumables suspended back on the surface.
    this.game.goldBreathCurseActive = false;
  }

  // ── Per-tick ────────────────────────────────────────────────────────────────

  update(dt) {
    const maw = this.hoardmaw;
    if (!maw || !this.game.activeFloor?.isVault) return;
    const game = this.game;
    const player = game.player;
    if (!player) return;

    if (maw.dormant) {
      this._checkAmbush(player);
      return;
    }

    maw.target = player;
    maw.update(dt); // real seconds — sole-driver rule, see class comment

    this._consumeSignals(maw);
    this._tickScaleClaiming();
    this._tickGoldBreath(maw);
    this._resolveInhale(maw, dt);
    this._tickCoinFlights(dt);
    this._tickRegisters(maw);
    this._tickBribe(maw);
    this._tickCompanionElevation(maw, dt);

    if (maw.defeated && !this._paidOut) {
      this._defeat();
    }
  }

  _consumeSignals(maw) {
    const game = this.game;
    const floor = game.activeFloor;

    // Scale fan projectiles → CombatSystem.
    for (const atk of maw.pendingBossAttacks) {
      game.combatSystem.createEnemyAttack(atk);
    }
    maw.pendingBossAttacks.length = 0;

    // Lid slam landed → shockwave ring from the body edge; flanks safe.
    if (maw.slamLandedAt) {
      const { x, y } = maw.slamLandedAt;
      maw.slamLandedAt = null;
      const px = player.position.x + player.width / 2;
      const py = player.position.y + player.height / 2;
      if (Math.hypot(px - x, py - y) < SLAM_HIT_RADIUS
          && player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
        player.takeDamage(2);
        game.physicsSystem.applyDamageKnockback(player, {}, x, y, 260);
      }
      game.audioSystem?.playSFX?.('boss_slam');
    }

    // A scale chipped → spawn its `$` pickup at the impact point (minting
    // happens on collection — see _collectMint below).
    if (maw.scaleChippedAt) {
      const { px, py } = maw.scaleChippedAt;
      maw.scaleChippedAt = null;
      const pickup = Object.assign(new Item(this.spec.scalePickup.char, px, py), {
        hutPlane: true,
        mintCoin: this.spec.scalePickup.mintCoin,
        pickupReadyAt: performance.now() + 400,
      });
      floor.items.push(pickup);
      game.items.push(pickup);
      game.physicsSystem.addEntity(pickup);
      game.audioSystem?.playSFX?.('armor_break');
    }

    // Phase gate: scales gone → Glinting.
    if (maw.pendingPhaseTransition === 2) {
      maw.pendingPhaseTransition = null;
      maw.transitionToPhase(2);
    }

    // Phase gate: glint-phase HP low enough → the Bribe.
    if (maw.bossPhase === 2 && maw.hp <= BRIBE_HP_THRESHOLD) {
      maw.transitionToPhase(3);
      this.bribeMoundItems = [];
    }
  }

  // Gold Breath — one-shot curse application at phase-2 entry. The flag is
  // the contract quick-slot rendering and input handlers consume (coin-flip
  // discharge — see dischargeCoin and its fireSelected/handleShiftPress
  // callers).
  _tickGoldBreath(maw) {
    if (this.breathApplied || maw.bossPhase !== 2) return;
    this.breathApplied = true;
    this.game.goldBreathCurseActive = true;
    this.game.audioSystem?.playSFX?.('boss_breath');
  }

  // Gold Breath discharge — the cursed slots' only verb. Spends one coin from
  // the wallet and throws it as a physical `c` pickup along the player's
  // facing: the staging gesture the whole vault loop feeds on (seam stagger,
  // inhale bait, lunge decoys all read ground items). SPACE and SHIFT both
  // route here while cursed — the remedies stay hoarded, the greed doesn't.
  // Returns false (spending nothing) when the curse is off or the wallet is
  // dry, so callers can let the press fall through.
  dischargeCoin() {
    const game = this.game;
    if (!game.goldBreathCurseActive) return false;
    if (!game.inventorySystem.removeCoin()) return false;
    const player = game.player;
    const f = player.facing;
    const len = Math.hypot(f.x, f.y) || 1;
    const item = Object.assign(new Item('c', player.position.x, player.position.y), {
      hutPlane: true,
      pickupReadyAt: performance.now() + 400,
    });
    game.activeFloor.items.push(item);
    game.items.push(item);
    game.physicsSystem.addEntity(item);
    this._coinFlights.push({
      item,
      dirX: f.x / len,
      dirY: f.y / len,
      left: COIN_TOSS_DIST,
    });
    game.audioSystem?.playSFX?.('coin_plink');
    return true;
  }

  // Linear toss arc — same read as the trap drop-throw's decel glide, kept
  // local because the projectile is a wallet coin, not a held item the
  // TrapSystem pipeline knows how to carry.
  _tickCoinFlights(dt) {
    for (let i = this._coinFlights.length - 1; i >= 0; i--) {
      const fl = this._coinFlights[i];
      const step = Math.min(COIN_TOSS_SPEED * dt, fl.left);
      fl.item.position.x += fl.dirX * step;
      fl.item.position.y += fl.dirY * step;
      fl.left -= step;
      if (fl.left <= 0) this._coinFlights.splice(i, 1);
    }
  }

  /** Snap mid-arc coins to their resting spot (defeat/teardown). */
  _landCoinFlights() {
    for (const fl of this._coinFlights) {
      fl.item.position.x += fl.dirX * fl.left;
      fl.item.position.y += fl.dirY * fl.left;
    }
    this._coinFlights = [];
  }

  // Claim chipped scales by touch — greed collects. Runs every tick (not
  // just during inhales): walk over a `$` and it mints +1 coin. Splices both
  // the live list and the floor cache so a collected scale can't resurrect on
  // re-entry, and sets consumed for any companion AI holding a reference.
  _tickScaleClaiming() {
    const game = this.game;
    const player = game.player;
    const floor = game.activeFloor;
    if (!player || !floor) return;
    const now = performance.now();
    for (let i = game.items.length - 1; i >= 0; i--) {
      const it = game.items[i];
      if (!it?.mintCoin || !it.hutPlane || it.consumed) continue;
      if (it.pickupReadyAt && now < it.pickupReadyAt) continue;
      if (Math.hypot(player.position.x - it.position.x,
                     player.position.y - it.position.y) > 18) continue;
      it.consumed = true;
      game.physicsSystem.removeEntity(it);
      game.items.splice(i, 1);
      const fi = floor.items.indexOf(it);
      if (fi !== -1) floor.items.splice(fi, 1);
      game.addIngredient(it.mintCoin);
      game.audioSystem?.playSFX?.('coin_plink');
    }
  }

  // Inhale: pull the player, drag loose ground pickups toward the mouth.
  // Staged coins/bread caught by the sweep are devoured — loss only, never
  // armor-heal (ratified). The maw's OWN chipped scales re-absorb as armor.
  _resolveInhale(maw, dt) {
    if (!maw.inhaleActive) return;    const game = this.game;
    const player = game.player;
    const mx = maw.mouthX();
    const my = maw.mouthY();

    // Pull the player.
    if (player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
      const dx = mx - player.position.x;
      const dy = my - player.position.y;
      const d = Math.hypot(dx, dy);
      if (d < INHALE_RANGE && d > 1) {
        player.position.x += (dx / d) * INHALE_PULL * dt;
        player.position.y += (dy / d) * INHALE_PULL * dt;
      }
    }

    // Drag ground loot (floor-tagged only — layer discipline).
    const floor = game.activeFloor;
    for (const list of [game.items, game.ingredients]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const ent = list[i];
        if (!ent || !ent.hutPlane) continue;
        if (ent.mintCoin) continue; // freshly chipped scales fly as shrapnel instead
        const dx = mx - ent.position.x;
        const dy = my - ent.position.y;
        const d = Math.hypot(dx, dy);
        if (d > INHALE_RANGE || d < GRID.CELL_SIZE) continue;
        if (d < GRID.CELL_SIZE * 1.2) {
          // Devoured. Coins/bread/scales alike — visible gulp, no refund,
          // no heal (its own re-armoring is phase-economy, handled at chip time).
          game.physicsSystem.removeEntity(ent);
          list.splice(i, 1);
          continue;
        }
        ent.position.x += (dx / d) * INHALE_DRAG * dt;
        ent.position.y += (dy / d) * INHALE_DRAG * dt;
      }
    }
  }

  // Register windows (soft gates): Justice coin-in-seam, Truth compass pulse,
  // Help bread decoy. All behavioral reads — nothing instructs.
  _tickRegisters(maw) {
    const game = this.game;
    const spec = this.spec;

    // Justice ★ — a tossed coin resting inside the seam cell during gape
    // (any attack windup or tongue extension counts as "mouth busy") staggers.
    if (maw.attackState !== 'idle' && maw.bossPhase >= 1) {
      const seamX = maw.mouthX();
      const seamY = maw.mouthY() - GRID.CELL_SIZE * 0.5;
      const coins = game.items.filter(it => it?.char === spec.justiceCurrency && it.hutPlane);
      for (const coin of coins) {
        if (Math.hypot(coin.position.x - seamX, coin.position.y - seamY) < GRID.CELL_SIZE * 0.9) {
          // Stagger: interrupt current attack, brief vulnerability to glint hits.
          maw.attackState = 'idle';
          maw.inhaleActive = false;
          maw.invulnerabilityTimer = 0;
          game.physicsSystem.removeEntity(coin);
          game.items.splice(game.items.indexOf(coin), 1);
          game.audioSystem?.playSFX?.('pyramid_fill');
          break;
        }
      }
    }

    // Truth ⌖ — carried Compass brightens toward the true glint during
    // phase 2. Rendered by the composite renderer reading this flag.
    this.compassTruthActive = maw.bossPhase === 2
      && (game.player?.quickSlots || []).some(it => it?.char === spec.truthItemChar);

    // Help ⌬ — ground bread within lunge reach redirects a live tongue.
    if (maw.tongue && !maw.tongue.retracting) {
      const bread = game.items.find(it => it?.char === spec.helpDecoyChar && it.hutPlane);
      if (bread) {
        const bx = bread.position.x, by = bread.position.y;
        const tx = maw.tongue.position.x, ty = maw.tongue.position.y;
        if (Math.hypot(bx - tx, by - ty) < GRID.CELL_SIZE * 4) {
          // The lunge breaks off to devour the loaf instead.
          maw.tongue.broken = true;
          game.physicsSystem.removeEntity(bread);
          game.items.splice(game.items.indexOf(bread), 1);
          game.audioSystem?.playSFX?.('crow_drop');
        }
      }
    }
  }

  // Bribe finale: mound out → grab punishes, refusal escalates ×3 → strike
  // the pile home → choke kill window.
  _tickBribe(maw) {
    const game = this.game;
    const player = game.player;

    if (maw.chokeTimer > 0) {
      // Kill window: melee strikes anywhere on the body land via takeDamage's
      // phase-3 branch. Nothing else to resolve here.
      return;
    }
    if (maw.bossPhase !== 3) return;

    // Mound resolution while an offer is live.
    if (this.bribeMoundItems.length) {
      if (this._playerTouchingMound(player)) {
        // Greed punished — lid slam, heavy hit, mound reclaimed. The window
        // resets and the refusal count does not advance.
        maw.bribesAccepted = true;
        if (player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
          player.takeDamage(4);
          game.physicsSystem.applyDamageKnockback(player, {}, maw.mouthX(), maw.mouthY(), 300);
        }
        this._clearMound();
        maw.bribeOfferTimer = 0;
        game.audioSystem?.playSFX?.('boss_slam');
        return;
      }
      if (maw.bribeOfferTimer <= 0) {
        // Untouched until expiry — a real refusal.
        this._clearMound();
        maw.recordBribeRefusal();
        game.audioSystem?.playSFX?.('boss_hit');
      }
      return;
    }

    // Three refusals banked: the final pile sits out; striking it home chokes.
    if (maw.bribeRefusals >= 3) {
      if (!this._finalPileOut) {
        this._spawnMound(maw);
        this._finalPileOut = true;
      } else if (this._meleeStrikingMound()) {
        this._clearMound();
        maw.beginChoke();
        game.audioSystem?.playSFX?.('boss_hit');
      }
      return;
    }

    // Next offer once the previous one fully resolved.
    if (maw.bribeOfferTimer <= 0) {
      maw.bribeOfferTimer = BRIBE_OFFER_WINDOW;
      this._spawnMound(maw);
    }
  }

  _spawnMound(maw) {
    const game = this.game;
    const { char, count } = this.spec.bribeLoot;
    const baseX = maw.mouthX() - ((count - 1) * GRID.CELL_SIZE) / 2;
    const y = maw.mouthY() + GRID.CELL_SIZE * 1.5;
    for (let i = 0; i < count; i++) {
      const item = Object.assign(new Item(char, baseX + i * GRID.CELL_SIZE, y), {
        hutPlane: true,
        bribePile: true,
        pickupReadyAt: performance.now() + 250,
      });
      this.bribeMoundItems.push(item);
      game.items.push(item);
      game.physicsSystem.addEntity(item);
    }
  }

  _clearMound() {
    const game = this.game;
    for (const item of this.bribeMoundItems) {
      game.physicsSystem.removeEntity(item);
      const idx = game.items.indexOf(item);
      if (idx !== -1) game.items.splice(idx, 1);
    }
    this.bribeMoundItems = [];
  }

  _playerTouchingMound(player) {
    return this.bribeMoundItems.some(it =>
      Math.hypot(player.position.x - it.position.x,
                 player.position.y - it.position.y) < GRID.CELL_SIZE * 1.1);
  }

  _meleeStrikingMound() {
    return this.game.combatSystem.getMeleeAttacks().some(atk =>
      this.bribeMoundItems.some(it =>
        Math.hypot(atk.position.x - it.position.x,
                   atk.position.y - it.position.y) < GRID.CELL_SIZE * 1.5));
  }

  // Gilded companions' combat elevation — the vault's reward made mechanical:
  //   crow dive-pecks lock onto the true glint (a living Compass);
  //   rats gnaw the tongue root through reel windows (bonus stagger damage).
  // Direct, cadence-limited contributions rather than hacked Crow internals.
  _tickCompanionElevation(maw, dt) {
    this._elevationCooldown -= dt;
    if (this._elevationCooldown > 0) return;
    const game = this.game;
    const gildedCrows = (game.companionCrows || []).filter(c => c.gilded);
    const gildedRats = (game.tamedRats || []).filter(r => r.gilded && r.state !== 'permaFlee');
    if (!gildedCrows.length && !gildedRats.length) return;

    let acted = false;

    for (const _crow of gildedCrows) {
      if (maw.bossPhase === 2 && !maw.defeated) {
        const g = maw.glintPx();
        if (maw.takeDamage(1, { kind: 'melee', px: g.x, py: g.y })) {
          game.combatSystem.createDamageNumber(1, g.x, g.y, '#ffd700');
          acted = true;
        }
      }
    }

    for (const _rat of gildedRats) {
      // Rats gnaw the tongue while it's live; during the choke they gnaw the
      // hung-open lid seam. Either way: one damage beat per cadence.
      const biting = !!maw.tongue || maw.chokeTimer > 0;
      if (biting && maw.takeDamage(1, { kind: 'melee', px: maw.mouthX(), py: maw.mouthY() })) {
        game.combatSystem.createDamageNumber(1, maw.mouthX(), maw.mouthY(), '#ffd700');
        acted = true;
      }
    }

    if (acted) {
      game.audioSystem?.playSFX?.('crow_attack_1');
      this._elevationCooldown = ELEVATION_CADENCE;
    }
  }
  // ── Defeat ────────────────────────────────────────────────────────────────
  _defeat() {
    const game = this.game;
    const spec = this.spec;
    const maw = this.hoardmaw;
    this._paidOut = true;
    maw.markDefeated();
    game.hoardmawDefeatedThisRun = true;
    game.goldBreathCurseActive = false;

    // The body collapses into the payout — acquisition, properly earned.
    this._landCoinFlights();
    game.physicsSystem.removeEntity(maw);
    this.hoardmaw = null;

    const floor = game.activeFloor;
    for (let i = 0; i < spec.payout.coinBurst; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = GRID.CELL_SIZE * (2 + Math.random() * 5);
      const coin = Object.assign(
        new Item(spec.bribeLoot.char, maw.position.x + Math.cos(angle) * dist,
                 maw.position.y + Math.sin(angle) * dist),
        { hutPlane: true, pickupReadyAt: performance.now() + 900 });
      floor.items.push(coin);
      game.items.push(coin);
      game.physicsSystem.addEntity(coin);
    }

    // Gems: rarity-weighted gemstone roll at boss weights — the hoard's
    // jewel seam. Weapon: one tiered roll from the generic pool — gear from
    // the delvers it swallowed over the years. Mana: guaranteed, per spec —
    // the shower is authored, not rolled.
    if (Math.random() < spec.payout.gemChance) {
      const gem = getRandomDrop(['gemstone'], 'ingredients', RARITY_PROFILES.boss);
      if (gem) game.lootSystem.spawnIngredientDrop(gem, maw.position.x, maw.position.y, null, maw);
    }
    const weaponChar = getRandomDrop(spec.payout.weaponAffinities, 'weapons', RARITY_PROFILES.boss);
    if (weaponChar) game.lootSystem.spawnItemDrop(weaponChar, maw.position.x, maw.position.y, null, maw);
    if (spec.payout.guaranteedMana) {
      game.lootSystem.spawnIngredientDrop('𝑚', maw.position.x, maw.position.y, null, maw);
    }

    game.inventorySystem.unlockConsumableSlot?.();
    game.audioSystem?.playSFX?.('boss_defeat');
  }
}

const BRIBE_HP_THRESHOLD = 32;              // of 80 — glinting ends early-ish
const SLAM_HIT_RADIUS = GRID.CELL_SIZE * 3.2;
const INHALE_RANGE = GRID.CELL_SIZE * 7;
const INHALE_PULL = 120;                    // px/s player pull
const INHALE_DRAG = 90;                     // px/s ground-loot drag
const ELEVATION_CADENCE = 2.2;              // seconds between gilded contributions
const COIN_TOSS_DIST = GRID.CELL_SIZE * 2.5; // cursed-slot discharge arc length
const COIN_TOSS_SPEED = COIN_TOSS_DIST / 0.25; // px/s — a brisk quarter-second flip
