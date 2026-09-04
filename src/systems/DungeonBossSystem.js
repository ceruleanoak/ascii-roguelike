import { GRID } from '../game/GameConfig.js';
import { Hoardmaw, BRIBE_OFFER_WINDOW, SLAM_RADIUS } from '../entities/Hoardmaw.js';
import { Item } from '../entities/Item.js';
import { getRandomDrop, RARITY_PROFILES } from '../data/items.js';
import { GREEN_HOARDMAW_SPEC } from '../data/dungeonBosses/green.js';
import { createSparkBurst } from './WorldEffectsSystem.js';

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
    this.bribeMoundItems = [];     // the temptation pile (Item refs)
    this.breathApplied = false;    // Gold Breath one-shot guard
    this._paidOut = false;         // defeat payout one-shot
    this._finalPileOut = false;    // strike-the-pile beat spawned
    this._chokeRunning = false;    // a choke window is open (re-offer on expiry)
    this._elevationCooldown = 0;   // gilded-companion contribution cadence
    this._coinFlights = [];        // cursed-slot discharges mid-arc
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
    if (!maw) { this.vaultFloor = null; return; }
    this.game.physicsSystem?.removeEntity?.(maw);
    this._leaveFloorRoster(maw);
    this.hoardmaw = null;
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
    this.bribeMoundItems = [];
    this._landCoinFlights();
    this.breathApplied = false;
    this._paidOut = false;
    this._finalPileOut = false;
    this._chokeRunning = false;
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
    this._checkGrabEscape(maw);
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
    // the refusal gets its own spark: the player is being told WHERE they hit
    // and that it did nothing, which is the phase-1 and phase-2 lesson both.
    if (maw.ricochetAt) {
      const { px, py } = maw.ricochetAt;
      maw.ricochetAt = null;
      createSparkBurst(game, game.particles, px, py);
      game.audioSystem?.playSFX?.('scale_ricochet');
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

  /**
   * Face-melee grab escape. BossSystem has its own version, but it gates on
   * `bossSystem.active` — false in the vault — so Layer 2 owns this one.
   *
   * Same grammar the Goo Dragon taught, which is the point: swing at the thing
   * holding you and it lets go. The tongue rides the player while reeling, so
   * any melee that reaches it counts. The skill being tested is reacting
   * before you arrive at the mouth, not aiming at a strip you are pinned to.
   */
  _checkGrabEscape(maw) {
    const game = this.game;
    const player = game.player;
    if (!player?.grabbed || player.grabbedBy !== maw) return;

    // Latched with no tongue left alive: nothing can break the grip, so drop
    // it rather than lock the player out of their own controls.
    const tongue = maw.tongue;
    if (!tongue) { maw.releaseGrab(); return; }

    for (const atk of game.combatSystem.getMeleeAttacks()) {
      const d = Math.hypot(atk.position.x - tongue.position.x,
                           atk.position.y - tongue.position.y);
      if (d > GRID.CELL_SIZE * 1.6) continue;
      if (!tongue.takeDamage()) continue;
      maw.releaseGrab();
      createSparkBurst(game, game.particles, tongue.position.x, tongue.position.y);
      game.audioSystem?.playSFX?.('scale_ricochet');
      break;
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
  // Staged coins/bread caught by the sweep are devoured outright. The maw's
  // OWN chipped scales are the exception — they re-absorb and re-armor it.
  _resolveInhale(maw, dt) {
    if (!maw.inhaleActive) return;
    const game = this.game;
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

        const dx = mx - ent.position.x;
        const dy = my - ent.position.y;
        const d = Math.hypot(dx, dy);
        if (d > INHALE_RANGE) continue;
        // No lower cutoff before the devour test: the drag moves an item most
        // of a cell per frame, so a near-mouth skip band leaves anything that
        // overshoots it sitting inside the maw forever, never swallowed and
        // never re-armoring. Devour is the only thing that happens this close.
        if (d < GRID.CELL_SIZE * 1.2) {
          // Devoured. Staged coins and bread are simply lost — no refund, no
          // heal. But its OWN chipped scale swept back in RE-ARMORS the cell
          // it fell from: damage you did not walk over and claim is damage you
          // did not do. That is phase 1's entire tension, and the zone's verb
          // (Acquire) enforced mechanically rather than narrated.
          if (ent.mintCoin && ent.scaleKey && maw.restoreScale(ent.scaleKey)) {
            game.audioSystem?.playSFX?.('armor_break');
          }
          game.physicsSystem.removeEntity(ent);
          list.splice(i, 1);
          const fi = floor?.items?.indexOf(ent) ?? -1;
          if (fi !== -1) floor.items.splice(fi, 1);
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
    // "Mouth busy" is the real gate: any attack windup or live tongue means
    // the seam is exposed. `bossPhase >= 1` used to sit here and was always
    // true — it read like a phase gate while gating nothing.
    if (maw.attackState !== 'idle') {
      const seamX = maw.mouthX();
      const seamY = maw.mouthY() - GRID.CELL_SIZE * 0.5;
      const coins = game.items.filter(it => it?.char === spec.justiceCurrency && it.hutPlane);
      for (const coin of coins) {
        if (Math.hypot(coin.position.x - seamX, coin.position.y - seamY) < GRID.CELL_SIZE * 0.9) {
          // Stagger: interrupt current attack, brief vulnerability to glint hits.
          maw.attackState = 'idle';
          maw.inhaleActive = false;
          maw.invulnerabilityTimer = 0;
          this._despawnFloorItem(coin);
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
      this._chokeRunning = true;
      return;
    }
    if (maw.bossPhase !== 3) return;

    // The choke ran out and it is still alive: it heaves the pile back up and
    // the offer stands again. The banked refusals are NOT spent — they were
    // earned by resisting three times and the player does not have to earn
    // them twice. Only the strike window repeats. Without this the fight
    // deadlocks: pile gone, nothing to strike, no attacks, no way to lose.
    if (this._chokeRunning) {
      this._chokeRunning = false;
      this._finalPileOut = false;
      game.audioSystem?.playSFX?.('boss_roar');
    }

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
        // If greed just took the FINAL pile, the strike target is gone and
        // there is nothing left to hit — same deadlock the choke-expiry
        // re-offer exists to prevent. Clear the flag so the next tick heaves
        // it back up. No-op for the ordinary offers, where it is already false.
        this._finalPileOut = false;
        game.audioSystem?.playSFX?.('boss_slam');
        return;
      }
      // The final pile never times out: it is not an offer, it is the target.
      // Expiry here would clear it one frame after it spawned (bribeOfferTimer
      // is 0 by then) and bank a refusal the player never actually made.
      if (maw.bribeOfferTimer <= 0 && !this._finalPileOut) {
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
    for (const item of this.bribeMoundItems) this._despawnFloorItem(item);
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
        if (maw.takeDamage(1, null, { kind: 'melee', px: g.x, py: g.y })) {
          game.combatSystem.createDamageNumber(1, g.x, g.y, '#ffd700');
          acted = true;
        }
      }
    }

    for (const _rat of gildedRats) {
      // Rats gnaw the tongue while it's live; during the choke they gnaw the
      // hung-open lid seam. Either way: one damage beat per cadence.
      const biting = !!maw.tongue || maw.chokeTimer > 0;
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

    // The body collapses into the payout — acquisition, properly earned.
    this._landCoinFlights();
    game.physicsSystem.removeEntity(maw);
    const floor = game.activeFloor;
    // Leave the roster here rather than letting the interior death sweep do
    // it: that path plays a generic destroy thud and scatters gray debris,
    // which is not this boss's death. DungeonSystem runs us before the sweep
    // precisely so the authored beat wins.
    this._leaveFloorRoster(maw);
    this.hoardmaw = null;
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

const BRIBE_HP_THRESHOLD = 32;              // of 80 — glinting ends early-ish
// Walk in under this and the prologue ambush wakes without biting. Roughly a
// third of PLAYER_SPEED — reachable only by deliberately easing in, never by
// accident while running the room.
const AMBUSH_CREEP_SPEED = 70;
const INHALE_RANGE = GRID.CELL_SIZE * 7;
const INHALE_PULL = 120;                    // px/s player pull
const INHALE_DRAG = 90;                     // px/s ground-loot drag
const ELEVATION_CADENCE = 2.2;              // seconds between gilded contributions
const COIN_TOSS_DIST = GRID.CELL_SIZE * 2.5; // cursed-slot discharge arc length
const COIN_TOSS_SPEED = COIN_TOSS_DIST / 0.25; // px/s — a brisk quarter-second flip
