import { GRID } from '../game/GameConfig.js';
import { Hoardmaw, SLAM_RADIUS, TEMPTATION_HP_THRESHOLD, TEMPTATION_PILE_SELF_DAMAGE } from '../entities/Hoardmaw.js';
import { Item } from '../entities/Item.js';
import { getRandomDrop, RARITY_PROFILES } from '../data/items.js';
import { GREEN_HOARDMAW_SPEC } from '../data/dungeonBosses/green.js';
import { createSparkBurst } from './WorldEffectsSystem.js';
import { createDebris } from '../entities/Debris.js';
import { paintStairsUpVisual } from '../data/dungeonFloorTemplates.js';

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
 * The maw rides floor.enemies like every other interior enemy, so
 * DungeonSystem's interior loop is its SOLE driver and CombatSystem hit-tests
 * it for free (see BossSystem, which does the same for zone bosses). This
 * system is a pure CONSUMER: it reads the signals the entity raised during
 * that tick and resolves them against the world. It must never call
 * maw.update() — that is the #216 double-drive bug. The entity converts the
 * enemy clock to real seconds once at its own update() boundary.
 *
 * Rendering goes through the boss-composite path, not the generic enemy loop
 * (isBossEntity already excludes it there).
 */
export class DungeonBossSystem {
  constructor(game) {
    this.game = game;
    this.hoardmaw = null;          // live encounter entity (or null)
    this.vaultFloor = null;        // the floor whose enemy roster holds it
    this.spec = GREEN_HOARDMAW_SPEC;
    this.temptationPileItems = []; // the phase-3 corner coin pile (Item refs)
    this._temptationPileSpawned = false; // one-time spawn guard (no respawn loop)
    this.breathApplied = false;    // Gold Breath one-shot guard
    this._paidOut = false;         // defeat payout one-shot
    this._elevationCooldown = 0;   // gilded-companion contribution cadence
    this._coinFlights = [];        // cursed-slot discharges mid-arc
    this.compassTruthActive = false; // Truth-register read: Vulnerable Window live
  }

  /**
   * Install (and re-install) the Layer-2 fields that live for exactly one run.
   *
   * They sit on `game` because renderers and input handlers read them directly
   * — the same data-holder compromise companion and trap state use — but the
   * system owns their lifecycle so the orchestrator never has to remember
   * three field names in three places. Called from the Game constructor,
   * enterTitleState, and _resetRunToRest; anything added here must be safe to
   * run on a half-built game (constructor time) and idempotent.
   *
   * Run-scoped state declares its reset home at creation (CLAUDE.md) —
   * verified by tools/check-reset-parity.mjs.
   */
  resetRunState() {
    const game = this.game;
    // Dying in the vault does NOT run DungeonSystem._exitDungeon, so this is
    // the only teardown the death and title paths get. Without it the maw
    // stays registered with physics and keeps `this.hoardmaw` set, which
    // hijacks BossRenderer's composite gate away from the next surface boss.
    this._teardownEncounter();
    game.hoardmawDefeatedThisRun = false; // once-per-run encounter gate
    game.goldBreathCurseActive = false;   // phase-2 curse: quick slots flip to coin-flip
    game.unlockedRareSayings = [];        // WiseFellow lines earned by winning, not buying
  }

  /**
   * True while the Vault encounter is awake and unresolved — the window a
   * Dungeon Boss track belongs to. Dormant does NOT count: the prologue is
   * meant to read as an innocuous centerpiece, and swapping the music before
   * the snap would give the ambush away.
   */
  isEncounterLive() {
    return !!this.hoardmaw && !this.hoardmaw.dormant && !this.hoardmaw.defeated;
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
    // Joining the floor roster is what makes it a fightable enemy: the
    // interior loop drives it, CombatSystem hit-tests it, and target
    // resolution treats it like anything else. Without this the player can
    // swing through the body forever with nothing registering.
    floor.enemies.push(maw);
    this.vaultFloor = floor;
    this.breathApplied = false;

    // The ambush prologue: it rests as an innocuous centerpiece until first
    // approached. Reveal is behavioral — no text, per the non-instructive rule.
    maw.dormant = true;
  }

  /**
   * Player crossed the wake threshold in front of the pile → snap.
   *
   * The prologue's whole point is that looting instinct is punished, and that
   * the punishment is escapable by knowledge alone: a player who walks in
   * slowly is not snapped at, so a repeat visit can skip the ambush entirely
   * (doc: repeat-visit beat). Nothing tells them this — the speed IS the
   * lesson, learned by having been bitten once.
   */
  _checkAmbush(player) {
    const maw = this.hoardmaw;
    if (!maw || !maw.dormant) return;
    const my = maw.mouthY();
    // Wake when the player stands within 3 cells of the mouth line.
    if (Math.abs(player.position.y - my) >= GRID.CELL_SIZE * 3) return;

    maw.dormant = false;
    const game = this.game;
    game.audioSystem?.playSFX?.('boss_roar');
    // Encounter is live — DungeonSystem owns which track that means.
    game.dungeonSystem?.syncDungeonMusic?.();

    const speed = Math.hypot(player.velocity?.vx ?? 0, player.velocity?.vy ?? 0);
    if (speed <= AMBUSH_CREEP_SPEED) return;   // crept in — it wakes, it does not bite

    // Bitten: one heavy but survivable hit, thrown back out of the mouth.
    maw.ambushSnapPending = true;
    if (player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
      player.takeDamage(3);
      game.physicsSystem.applyDamageKnockback(player, {}, maw.mouthX(), maw.mouthY(), 340);
    }
    createSparkBurst(game, game.particles, maw.mouthX(), maw.mouthY());
    game.audioSystem?.playSFX?.('boss_slam');
  }

  /**
   * Remove the live maw from every list that drives it.
   *
   * The roster is the half that is easy to forget: the maw rides
   * `floor.enemies`, floors persist across exit/re-entry within one D-room
   * visit, and `onFloorActivated` spawns a fresh maw whenever `this.hoardmaw`
   * is null — so a teardown that drops only the system's own reference leaves
   * the old body on the roster, still updated by the interior loop, still
   * slamming and grabbing, with nothing drawing it.
   *
   * `vaultFloor` is remembered at spawn rather than read off
   * `game.activeFloor`, because the death and title routes tear down after the
   * interior has already been detached.
   */
  _teardownEncounter() {
    const maw = this.hoardmaw;
    const game = this.game;
    if (!maw) { this.vaultFloor = null; return; }
    game.physicsSystem?.removeEntity?.(maw);
    this._leaveFloorRoster(maw);
    this.hoardmaw = null;
    // Encounter resolved — the Dungeon's ambient track carries the payout.
    game.dungeonSystem?.syncDungeonMusic?.();
  }

  /** Splice the maw out of the floor roster it joined at spawn. */
  _leaveFloorRoster(maw) {
    const roster = this.vaultFloor?.enemies;
    const ri = roster ? roster.indexOf(maw) : -1;
    if (ri !== -1) roster.splice(ri, 1);
    this.vaultFloor = null;
  }

  /** Called on dungeon exit / interior reset — tear down without payout. */
  reset() {
    this._teardownEncounter();
    this._clearTemptationPile();
    this._temptationPileSpawned = false;
    this._landCoinFlights();
    this.breathApplied = false;
    this._paidOut = false;
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

    // NOTE: no maw.update() here. The interior enemy loop already drove it
    // this frame — driving it again would advance every timer twice (#216).
    maw.target = player;

    this._consumeSignals(maw);
    this._tickScaleClaiming();
    this._tickGoldBreath(maw);
    this._tickCoinFlights(dt);
    this._tickRegisters(maw);
    this._tickEnduranceCoins(maw);
    this._tickTemptation(maw);
    this._tickCompanionElevation(maw, dt);

    if (maw.defeated && !this._paidOut) {
      this._defeat();
    }
  }

  _consumeSignals(maw) {
    const game = this.game;
    const floor = game.activeFloor;
    const player = game.player;

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
      if (Math.hypot(px - x, py - y) < SLAM_RADIUS
          && player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
        player.takeDamage(2);
        game.physicsSystem.applyDamageKnockback(player, {}, x, y, 260);
      }
      game.audioSystem?.playSFX?.('boss_slam');
    }

    // A scale chipped → spawn its `$` pickup at the impact point (minting
    // happens on collection — see _collectMint below).
    if (maw.scaleChippedAt) {
      const { key, px, py } = maw.scaleChippedAt;
      maw.scaleChippedAt = null;
      const pickup = Object.assign(new Item(this.spec.scalePickup.char, px, py), {
        hutPlane: true,
        mintCoin: this.spec.scalePickup.mintCoin,
        // The cell it fell from. An inhale that sweeps this back in re-armors
        // exactly that gap, so the loss is legible rather than abstract.
        scaleKey: key,
        pickupReadyAt: performance.now() + 400,
      });
      floor.items.push(pickup);
      game.items.push(pickup);
      game.physicsSystem.addEntity(pickup);
      game.audioSystem?.playSFX?.('armor_break');
    }

    // A hit the armor turned away. Silence would read as a broken hitbox, so
    // the refusal gets its own spark AND a floating "BLOCKED" label — the
    // player is being told WHERE they hit and that it did nothing, which is
    // the phase-1 and endurance-phase lesson both.
    if (maw.ricochetAt) {
      const { px, py } = maw.ricochetAt;
      maw.ricochetAt = null;
      createSparkBurst(game, game.particles, px, py);
      game.audioSystem?.playSFX?.('scale_ricochet');
    }
    if (maw.blockedAt) {
      const { px, py } = maw.blockedAt;
      maw.blockedAt = null;
      game.combatSystem.createDamageNumber('BLOCKED', px, py - GRID.CELL_SIZE * 0.5, '#eeeeee');
    }

    // Swallowed whole: it takes its bite and throws the player back out of
    // the mouth, away from the body. Being eaten has to cost something or the
    // tongue is a free ride (doc: swallow costs big + wall spit).
    if (maw.swallowedAt) {
      const { px, py } = maw.swallowedAt;
      maw.swallowedAt = null;
      player.grabbed = false;
      player.grabbedBy = null;
      player.takeDamage(3);
      // Spit straight down the arena, away from the body — the maw fills the
      // north half, so south is the only direction with room to land.
      player.position.y = py + GRID.CELL_SIZE * 2;
      game.physicsSystem.applyDamageKnockback(player, {}, px, py, 420);
      createSparkBurst(game, game.particles, px, py);
      game.audioSystem?.playSFX?.('boss_slam');
    }

    // Vulnerable Window ran out: the shield reforms, and it shoves the player
    // clear FIRST — hesitation is punished twice, the shove buying the armor
    // room to close before the endurance gauntlet itself starts. Knockback
    // only, no damage: this is a warning shot, not a hit.
    if (maw.enduranceKnockbackAt) {
      const { x, y } = maw.enduranceKnockbackAt;
      maw.enduranceKnockbackAt = null;
      if (!player.dodgeRoll?.active) {
        game.physicsSystem.applyDamageKnockback(player, {}, x, y, 320);
      }
      createSparkBurst(game, game.particles, x, y);
      game.audioSystem?.playSFX?.('boss_slam');
    }

    // Phase gate: scales gone → Vulnerable/Endurance cycle.
    if (maw.pendingPhaseTransition === 2) {
      maw.pendingPhaseTransition = null;
      maw.transitionToPhase(2);
    }

    // Phase gate: HP low enough → Temptation (final passive substate).
    if (maw.bossPhase === 2 && maw.hp <= TEMPTATION_HP_THRESHOLD) {
      maw.transitionToPhase(3);
      this._clearTemptationPile();
      this._temptationPileSpawned = false;
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

  // Register windows (soft gates): Truth compass pulse, Help bread decoy.
  // Justice's "feed a coin through the seam" mechanic is retired (scrapped:
  // confusing in a destructive conflict) — no replacement. All behavioral
  // reads — nothing instructs.
  _tickRegisters(maw) {
    const game = this.game;
    const spec = this.spec;

    // Truth ⌖ — carried Compass brightens while the Vulnerable Window is
    // open. Glint hunting is gone, but the feature it taught (a carried item
    // reveals hidden timing) survives, now pointed at the mouth rather than a
    // migrating cell. Rendered by the composite renderer reading this flag.
    this.compassTruthActive = maw.bossPhase === 2 && maw.enduranceState === 'vulnerable'
      && (game.player?.quickSlots || []).some(it => it?.char === spec.truthItemChar);

    // Help ⌬ — ground bread within lunge reach redirects a live tongue while
    // it is still sweeping toward the player (not once it has already
    // latched and is reeling — the redirect is a save, not an escape hatch
    // for a caught player).
    if (maw.tongue && maw.tongue.state === 'sweep') {
      const bread = game.items.find(it => it?.char === spec.helpDecoyChar && it.hutPlane);
      if (bread) {
        const bx = bread.position.x, by = bread.position.y;
        const tx = maw.tongue.position.x, ty = maw.tongue.position.y;
        if (Math.hypot(bx - tx, by - ty) < GRID.CELL_SIZE * 4) {
          // The lunge breaks off to devour the loaf instead.
          maw.tongue.done = true;
          game.physicsSystem.removeEntity(bread);
          game.items.splice(game.items.indexOf(bread), 1);
          game.audioSystem?.playSFX?.('crow_drop');
        }
      }
    }
  }

  /**
   * Endurance coin-redirect: melee-striking a bouncing coin sends it back
   * into the boss, ending Endurance and reopening a fresh Vulnerable Window.
   * Reuses `CombatSystem.reflectBullet`'s contact-reflection math for the
   * bounce itself (also gets its ricochet SFX for free), then overrides the
   * resulting vector to aim precisely at the mouth — the fixed-vector "sent
   * it home" read the design calls for, rather than a random deflection.
   */
  _tickEnduranceCoins(maw) {
    if (maw.bossPhase !== 2 || maw.enduranceState !== 'endurance') return;
    const game = this.game;
    if (!maw.enduranceCoins.length) return;
    const melee = game.combatSystem.getMeleeAttacks();
    if (!melee.length) return;

    for (const coin of maw.enduranceCoins) {
      if (coin.redirected) continue;
      const hit = melee.some(atk =>
        Math.hypot(atk.position.x - coin.x, atk.position.y - coin.y) < GRID.CELL_SIZE * 1.4);
      if (!hit) continue;

      // reflectBullet expects a `.velocity = {vx, vy}` shape — coin flight
      // state is authored as loose vx/vy, so bridge it for the one call.
      const bridge = { velocity: { vx: coin.vx, vy: coin.vy } };
      game.combatSystem.reflectBullet(bridge, {});
      const mx = maw.mouthX(), my = maw.mouthY();
      const d = Math.hypot(mx - coin.x, my - coin.y) || 1;
      coin.vx = (mx - coin.x) / d;
      coin.vy = (my - coin.y) / d;
      coin.redirected = true;
      // Ends Endurance the instant contact is made — the coin still visibly
      // flies home afterward (ticked in Hoardmaw._tickEndurance), but the
      // window reopens immediately rather than waiting on arrival.
      maw.breakEndurance();
      createSparkBurst(game, game.particles, coin.x, coin.y);
      game.audioSystem?.playSFX?.('scale_ricochet');
      break; // one redirect per tick is plenty — the window just reopened
    }
  }

  /**
   * Remove a vault item from every roster that holds it. Interior items live
   * in `floor.items` AND `game.items`; dropping only the latter leaves the
   * floor's copy to resurrect on re-entry.
   */
  _despawnFloorItem(item) {
    const game = this.game;
    game.physicsSystem.removeEntity(item);
    const gi = game.items.indexOf(item);
    if (gi !== -1) game.items.splice(gi, 1);
    const floorItems = game.activeFloor?.items;
    if (!floorItems) return;
    const fi = floorItems.indexOf(item);
    if (fi !== -1) floorItems.splice(fi, 1);
  }

  /**
   * Phase 3 (Temptation): a one-time corner coin pile — the "bad choice"
   * left sitting in plain view while the boss stands fully passive. No
   * refusal counting, no choke window, no respawn loop: touch it once and
   * it punishes; ignore it and finish the boss for the clean win.
   */
  _tickTemptation(maw) {
    if (maw.bossPhase !== 3) return;
    const game = this.game;
    const player = game.player;

    if (!this._temptationPileSpawned) {
      this._spawnTemptationPile(maw);
      this._temptationPileSpawned = true;
      return;
    }
    if (!this.temptationPileItems.length) return;

    const touching = this.temptationPileItems.some(it =>
      Math.hypot(player.position.x - it.position.x,
                 player.position.y - it.position.y) < GRID.CELL_SIZE * 1.1);
    if (!touching) return;

    // Greed punished: themed callback to the eventual death explosion, sized
    // down — self-damage only, the boss is untouched and stays killable.
    if (player.invulnerabilityTimer <= 0 && !player.dodgeRoll?.active) {
      player.takeDamage(TEMPTATION_PILE_SELF_DAMAGE);
      game.physicsSystem.applyDamageKnockback(player, {},
        player.position.x, player.position.y, 220);
    }
    createDebris(player.position.x, player.position.y, 10, '#8a6a2e');
    createSparkBurst(game, game.particles, player.position.x, player.position.y);
    game.audioSystem?.playSFX?.('boss_hit');
    this._clearTemptationPile();
  }

  _spawnTemptationPile(maw) {
    const game = this.game;
    const { char, count } = this.spec.temptationPile;
    // A room corner, away from the boss body — the "right choice" is to
    // simply not walk over there.
    const baseX = maw.mouthX() - GRID.CELL_SIZE * 7;
    const baseY = maw.mouthY() + GRID.CELL_SIZE * 6;
    for (let i = 0; i < count; i++) {
      const item = Object.assign(
        new Item(char, baseX + (i % 3) * GRID.CELL_SIZE, baseY + Math.floor(i / 3) * GRID.CELL_SIZE),
        { hutPlane: true, temptationPile: true, pickupReadyAt: performance.now() + 250 });
      this.temptationPileItems.push(item);
      game.items.push(item);
      const floorItems = game.activeFloor?.items;
      if (floorItems) floorItems.push(item);
      game.physicsSystem.addEntity(item);
    }
  }

  _clearTemptationPile() {
    for (const item of this.temptationPileItems) this._despawnFloorItem(item);
    this.temptationPileItems = [];
  }

  // Gilded companions' combat elevation — the vault's reward made mechanical:
  //   crows dive-peck damage home during the Vulnerable Window (a living
  //   contribution to the punish, now that there is no glint cell to aim at);
  //   rats gnaw the tongue root through reel windows, or the seam during the
  //   Vulnerable Window (bonus stagger damage).
  // Direct, cadence-limited contributions rather than hacked Crow internals.
  _tickCompanionElevation(maw, dt) {
    this._elevationCooldown -= dt;
    if (this._elevationCooldown > 0) return;
    const game = this.game;
    const gildedCrows = (game.companionCrows || []).filter(c => c.gilded);
    const gildedRats = (game.tamedRats || []).filter(r => r.gilded && r.state !== 'permaFlee');
    if (!gildedCrows.length && !gildedRats.length) return;

    const vulnerable = maw.bossPhase === 2 && maw.enduranceState === 'vulnerable';
    let acted = false;

    for (const _crow of gildedCrows) {
      if (vulnerable && !maw.defeated) {
        const mx = maw.mouthX(), my = maw.mouthY();
        if (maw.takeDamage(1, null, { kind: 'melee', px: mx, py: my })) {
          game.combatSystem.createDamageNumber(1, mx, my, '#ffd700');
          acted = true;
        }
      }
    }

    for (const _rat of gildedRats) {
      // Rats gnaw the tongue while it's live, or the exposed seam during the
      // Vulnerable Window. Either way: one damage beat per cadence.
      const biting = !!maw.tongue || vulnerable;
      if (biting && maw.takeDamage(1, null, { kind: 'melee', px: maw.mouthX(), py: maw.mouthY() })) {
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

    // Unlock the ascend — the bug-fix half of item 0. Mirrors the Trap Room's
    // "all cleared" unlock; the Vault's up-stairs sit right where the boss
    // body lives, so they must stay locked for the whole encounter or a pull/
    // knockback can throw the player into an unintended floor transition.
    const floor = game.activeFloor;
    if (floor?.stairsUpObj) {
      floor.stairsUpLocked = false;
      paintStairsUpVisual(floor.stairsUpObj, false);
    }

    // The body collapses into the payout — acquisition, properly earned.
    this._landCoinFlights();
    this._clearTemptationPile();
    game.physicsSystem.removeEntity(maw);
    // Leave the roster here rather than letting the interior death sweep do
    // it: that path plays a generic destroy thud and scatters gray debris,
    // which is not this boss's death. DungeonSystem runs us before the sweep
    // precisely so the authored beat wins.
    this._leaveFloorRoster(maw);
    this.hoardmaw = null;

    // A large, room-filling burst of wood-glyph debris — the chest is wood,
    // not the generic gray detritus every other enemy uses. Multiple origin
    // points across the body read as the whole carcass coming apart, not one
    // point exploding.
    const woodColor = '#8a6a2e';
    const originCount = 5;
    for (let i = 0; i < originCount; i++) {
      const ox = maw.rootX() + (Math.random() - 0.5) * GRID.CELL_SIZE * BODY_SPAN_COLS;
      const oy = maw.rootY() + (Math.random() - 0.5) * GRID.CELL_SIZE * BODY_SPAN_ROWS;
      const pieces = createDebris(ox, oy, 9, woodColor);
      for (const piece of pieces) {
        piece.hutPlane = true;
        piece.setCollisionMap(maw.collisionMap);
        game.debris.push(piece);
        game.physicsSystem.addEntity(piece);
      }
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

    // The knowledge half of the payout: killing it earns a WiseFellow rare
    // line no Artifact can buy. Run-scoped like everything else — death takes
    // it back, and the memory of having heard it is the only thing that keeps.
    if (spec.victorySaying && !game.unlockedRareSayings.includes(spec.victorySaying)) {
      game.unlockedRareSayings.push(spec.victorySaying);
    }

    // No unlockConsumableSlot() here: boss-design.md reserves the slot unlock
    // for Layer 1 zone bosses. Layer 2's payout is the hoard shower above.
    game.audioSystem?.playSFX?.('boss_defeat');
  }
}

// Roughly the body's footprint, in cells — used only to spread the victory
// debris origins across the carcass rather than pin them all to one point.
const BODY_SPAN_COLS = 6;
const BODY_SPAN_ROWS = 4;

// Walk in under this and the prologue ambush wakes without biting. Roughly a
// third of PLAYER_SPEED — reachable only by deliberately easing in, never by
// accident while running the room.
const AMBUSH_CREEP_SPEED = 70;
const ELEVATION_CADENCE = 2.2;              // seconds between gilded contributions
const COIN_TOSS_DIST = GRID.CELL_SIZE * 2.5; // cursed-slot discharge arc length
const COIN_TOSS_SPEED = COIN_TOSS_DIST / 0.25; // px/s — a brisk quarter-second flip
