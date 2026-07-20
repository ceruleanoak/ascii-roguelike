import { GRID } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';
import { CampNPC, CAMP_NPC_STATE } from '../entities/CampNPC.js';

/**
 * CampNPCSystem
 *
 * Owns all C-room mercenary behavior:
 *   - Coin offering (well-style arc + plink) for hint or hire
 *   - Weapon pickup (sword/bow/gun only)
 *   - Tether enforcement (INTERESTED state stays near campfire)
 *   - Companion AI (chase/keep distance, attack nearest enemy)
 *   - Damage handling (enemy melee/projectiles can hit the companion)
 *   - Flee-to-exit on death (Leshy pattern)
 *
 * The active companion lives on `game.companion`. Idle/interested NPCs live on
 * the room (`room.campNPC`) and are not promoted to companion until hired.
 */

const COIN_INTERACT_RADIUS = GRID.CELL_SIZE * 1.25;
const WEAPON_PICKUP_RADIUS = GRID.CELL_SIZE * 4;
const WEAPON_SCAN_RADIUS   = GRID.CELL_SIZE * 10; // IDLE NPC walks toward weapons within this
const HEAL_PICKUP_RADIUS   = GRID.CELL_SIZE * 4;  // thrown/dropped bread or potion within this heals
const COMPANION_ATTACK_SPEED_MULT = 2.0;          // 50% slower than the player would attack
const COMPANION_FOLLOW_SPEED_MULT = 0.75;         // companion trails a bit slower than its combat speed
const COIN_ARC_DURATION = 0.55;
const COIN_ARC_PEAK_HEIGHT = GRID.CELL_SIZE * 4;


const COMPANION_FOLLOW_DISTANCE = GRID.CELL_SIZE * 4;
const COMPANION_MAX_LEASH       = GRID.CELL_SIZE * 12;
const ENEMY_AGGRO_RANGE         = GRID.CELL_SIZE * 8;

// Per-weapon-type AI tuning
const KEEPER_PREFERRED_RANGE = GRID.CELL_SIZE * 5;
const KEEPER_RANGE_TOLERANCE = GRID.CELL_SIZE * 1.5;

// Delay between spotting an enemy and the first attack — gives the player a
// beat to react and prevents the companion from instantly opening fire the
// moment something walks into aggro range. Resets whenever the companion has
// no current target.
const AGGRO_ACQUIRE_DELAY = 0.5;

export class CampNPCSystem {
  constructor(game) {
    this.game = game;
    this.coinAnim = null;       // { startX, startY, endX, endY, t, spinPhase, intent: 'hint'|'hire', target }
  }

  // ─── Frame update ────────────────────────────────────────────────────────

  update(dt) {
    const game = this.game;

    // Animate the in-flight coin
    if (this.coinAnim) {
      this.coinAnim.t += dt;
      this.coinAnim.spinPhase += dt * 12;
      if (this.coinAnim.t >= COIN_ARC_DURATION) {
        const anim = this.coinAnim;
        this.coinAnim = null;
        this._completeCoinOffering(anim);
      }
    }

    // Update the room's idle/interested NPC (if any) and the active companion
    const roomNPC = game.currentRoom?.campNPC;
    if (roomNPC) this._updateNPC(dt, roomNPC, /*isCompanion=*/false);

    const companion = game.companion;
    if (companion) {
      this._updateNPC(dt, companion, /*isCompanion=*/true);

      // Despawn fleeing companion that has reached an exit
      if (companion.state === CAMP_NPC_STATE.FLEEING && companion.fleeReached) {
        game.companion = null;
      }
    }
  }

  _updateNPC(dt, npc, isCompanion) {
    npc.update(dt, this.game);

    // Tick companion's slowed attack cooldown (50% debuff vs player)
    if (npc._attackCooldown && npc._attackCooldown > 0) {
      npc._attackCooldown -= dt;
    }

    if (npc.state === CAMP_NPC_STATE.FLEEING) return;

    // Thrown/dropped bread or potion within range fully heals — any state,
    // but only while actually hurt (won't pick up at full health).
    this._tryConsumablePickup(npc);

    // Idle/interested room NPC: walk toward and pick up nearby weapon drops
    if (!isCompanion && (npc.state === CAMP_NPC_STATE.IDLE || npc.state === CAMP_NPC_STATE.INTERESTED)) {
      this._tryWeaponPickup(npc);

      // IDLE NPC walks toward a nearby valid weapon if one is on the ground
      if (npc.state === CAMP_NPC_STATE.IDLE) {
        this._idleSeekWeapon(dt, npc);
      }
    }

    if (npc.state === CAMP_NPC_STATE.INTERESTED) {
      this._updateInterested(dt, npc);
    } else if (npc.state === CAMP_NPC_STATE.COMPANION) {
      this._updateCompanion(dt, npc);
    }

    // Damage from enemy attacks (only when armed/active to keep idle NPC safe)
    if (npc.state === CAMP_NPC_STATE.INTERESTED || npc.state === CAMP_NPC_STATE.COMPANION) {
      this._applyEnemyDamage(npc);

      if (npc.hp <= 0) {
        const game = this.game;
        if ((game.player.inDungeon || game.player.inHut) && game.activeFloor) {
          // Inside an interior, flee toward the floor-0 exit door or the up-stairs —
          // exterior exit coordinates are meaningless here.
          const interior = game.activeFloor;
          const fleeX = (interior.exitCol ?? Math.floor(interior.gridCols / 2)) * GRID.CELL_SIZE;
          const fleeY = (interior.exitRow ?? (interior.gridRows - 2)) * GRID.CELL_SIZE;
          npc.startFleeingToPosition(fleeX, fleeY);
        } else {
          npc.startFleeing(game.currentRoom?.exits || {});
        }
        // If this was the active companion, companion is still rendered until fleeReached
      }
    }

    // Clamp companion to interior bounds — the companion self-manages its position
    // with no physics collision, so without this it can drift outside the PiP panel.
    if (isCompanion && (this.game.player.inDungeon || this.game.player.inHut) && this.game.activeFloor) {
      const C = GRID.CELL_SIZE;
      const interior = this.game.activeFloor;
      npc.position.x = Math.max(C, Math.min((interior.gridCols - 2) * C, npc.position.x));
      npc.position.y = Math.max(C, Math.min((interior.gridRows - 2) * C, npc.position.y));
    }
  }

  // ─── State: INTERESTED (tethered follow, ? indicator at limit) ──────────

  _updateInterested(dt, npc) {
    const player = this.game.player;
    if (!player) return;

    const dx = player.position.x - npc.position.x;
    const dy = player.position.y - npc.position.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    // Distance from campfire
    const cdx = npc.position.x - npc.campfirePos.x;
    const cdy = npc.position.y - npc.campfirePos.y;
    const distFromFire = Math.sqrt(cdx * cdx + cdy * cdy);

    // If at tether limit, stop and show ?
    if (distFromFire >= npc.tetherRadius) {
      npc.setIndicator('?', '#ffffff', -GRID.CELL_SIZE);
      // Pull back toward campfire slightly so they don't drift over edge
      const pullSpeed = 30;
      const len = Math.max(distFromFire, 0.001);
      npc.velocity.vx = -(cdx / len) * pullSpeed;
      npc.velocity.vy = -(cdy / len) * pullSpeed;
      // Position update delegated to PhysicsSystem.updateEntity()
      return;
    }

    // Otherwise, follow the player at a comfortable distance
    npc.clearIndicator();

    if (distToPlayer > COMPANION_FOLLOW_DISTANCE) {
      const len = Math.max(distToPlayer, 0.001);
      const dirX = dx / len;
      const dirY = dy / len;
      const followSpeed = npc.speed * COMPANION_FOLLOW_SPEED_MULT;
      npc.velocity.vx = dirX * followSpeed;
      npc.velocity.vy = dirY * followSpeed;
      // Update facing (toward player)
      npc.facing.x = Math.sign(dirX) || npc.facing.x;
      npc.facing.y = Math.sign(dirY) || npc.facing.y;
      // Position update delegated to PhysicsSystem.updateEntity()
    } else {
      npc.velocity.vx = 0;
      npc.velocity.vy = 0;
    }
  }

  // ─── State: COMPANION (full follow + aggro) ─────────────────────────────

  _updateCompanion(dt, npc) {
    const game = this.game;
    const player = game.player;
    if (!player) return;

    // Find nearest enemy within aggro range (in same plane).
    // Inside a hut or dungeon the active enemies are on activeFloor, not currentRoom.
    const enemies = ((game.player.inDungeon || game.player.inHut) && game.activeFloor)
      ? game.activeFloor.enemies
      : game.currentRoom?.enemies || [];
    let target = null;
    let targetDist = Infinity;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      if ((e.plane ?? 0) !== npc.plane) continue;
      const ex = e.position.x - npc.position.x;
      const ey = e.position.y - npc.position.y;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < targetDist) { targetDist = d; target = e; }
    }

    const hasEnemy = !!target && targetDist < ENEMY_AGGRO_RANGE;
    // Coin offering is blocked while aggro'd — see handleSpacePress.
    npc.inCombat = hasEnemy;

    // Aggro acquisition timer — counts up while a target is in range, resets
    // the moment the companion has no target. _tryAttack gates on this.
    if (hasEnemy) {
      npc._aggroTimer = (npc._aggroTimer || 0) + dt;
    } else {
      npc._aggroTimer = 0;
    }

    // Update facing toward target (or player if no target)
    if (hasEnemy) {
      const fx = target.position.x - npc.position.x;
      const fy = target.position.y - npc.position.y;
      const flen = Math.max(Math.sqrt(fx * fx + fy * fy), 0.001);
      npc.facing.x = fx / flen;
      npc.facing.y = fy / flen;
    } else {
      const fx = player.position.x - npc.position.x;
      const fy = player.position.y - npc.position.y;
      const flen = Math.max(Math.sqrt(fx * fx + fy * fy), 0.001);
      if (flen > 1) {
        npc.facing.x = fx / flen;
        npc.facing.y = fy / flen;
      }
    }

    // Movement: combat archetype if engaging, otherwise commanded target or follow player.
    // commandTarget is an externally-set { x, y } (e.g., DungeonSystem switch puzzle); enemy aggro overrides it.
    if (hasEnemy) {
      this._moveCombat(dt, npc, target, targetDist);
      this._tryAttack(npc, target, targetDist);
    } else if (npc.commandTarget) {
      this._moveToTarget(dt, npc, npc.commandTarget);
    } else {
      this._moveFollow(dt, npc, player);
    }

    // Hard leash to player — suspended while honoring a command target so the
    // companion can reach distant interactables (e.g., the second floor switch).
    if (!npc.commandTarget) {
      const px = player.position.x - npc.position.x;
      const py = player.position.y - npc.position.y;
      const playerDist = Math.sqrt(px * px + py * py);
      if (playerDist > COMPANION_MAX_LEASH) {
        const len = Math.max(playerDist, 0.001);
        npc.position.x += (px / len) * (playerDist - COMPANION_MAX_LEASH);
        npc.position.y += (py / len) * (playerDist - COMPANION_MAX_LEASH);
      }
    }
  }

  _moveToTarget(dt, npc, target) {
    const dx = target.x - npc.position.x;
    const dy = target.y - npc.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < GRID.CELL_SIZE * 0.4) {
      npc.velocity.vx = 0;
      npc.velocity.vy = 0;
      return;
    }
    const len = Math.max(dist, 0.001);
    npc.velocity.vx = (dx / len) * npc.speed;
    npc.velocity.vy = (dy / len) * npc.speed;
    npc.facing.x = Math.sign(dx) || npc.facing.x;
    npc.facing.y = Math.sign(dy) || npc.facing.y;
    // Position update delegated to PhysicsSystem.updateEntity()
  }

  _moveFollow(dt, npc, player) {
    const dx = player.position.x - npc.position.x;
    const dy = player.position.y - npc.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > COMPANION_FOLLOW_DISTANCE) {
      const len = Math.max(dist, 0.001);
      const followSpeed = npc.speed * COMPANION_FOLLOW_SPEED_MULT;
      npc.velocity.vx = (dx / len) * followSpeed;
      npc.velocity.vy = (dy / len) * followSpeed;
      // Position update delegated to PhysicsSystem.updateEntity()
    } else {
      npc.velocity.vx = 0;
      npc.velocity.vy = 0;
    }
  }

  _moveCombat(dt, npc, target, distToTarget) {
    const wt = npc.weapon?.data?.weaponType;
    const isMelee = wt === 'MELEE';

    let desiredDist;
    if (isMelee) {
      // Stand at the swing's sweet spot: close enough that the enemy is inside
      // the attack hitbox, far enough that the enemy doesn't slip past it. Short
      // patterns like multistab spawn a 12x12 hitbox at +range; if we stop at
      // range*0.6 the enemy can sit inside the dead zone and never get hit.
      const range = npc.weapon.data.range || 20;
      desiredDist = Math.max(range - GRID.CELL_SIZE * 0.25, GRID.CELL_SIZE);
    } else {
      desiredDist = KEEPER_PREFERRED_RANGE; // bow/gun keep distance
    }

    const dx = target.position.x - npc.position.x;
    const dy = target.position.y - npc.position.y;
    const len = Math.max(distToTarget, 0.001);
    const dirX = dx / len;
    const dirY = dy / len;

    let moveX = 0, moveY = 0;
    const tolerance = isMelee ? GRID.CELL_SIZE * 0.5 : KEEPER_RANGE_TOLERANCE;
    if (distToTarget > desiredDist + tolerance) {
      // Approach
      moveX = dirX * npc.speed;
      moveY = dirY * npc.speed;
    } else if (distToTarget < desiredDist - tolerance) {
      // Back off
      moveX = -dirX * npc.speed * 0.7;
      moveY = -dirY * npc.speed * 0.7;
    }

    // Position update delegated to PhysicsSystem.updateEntity()
    npc.velocity.vx = moveX;
    npc.velocity.vy = moveY;
  }

  _tryAttack(npc, target, distToTarget) {
    // Aggro acquisition delay — companion can't fire until it's been locked on
    // for AGGRO_ACQUIRE_DELAY seconds. Prevents instant attacks on first sight.
    if ((npc._aggroTimer || 0) < AGGRO_ACQUIRE_DELAY) return;
    // Companion-side cooldown enforces a 50% attack-speed debuff vs the player
    if ((npc._attackCooldown || 0) > 0) return;

    const game = this.game;
    const weapon = npc.weapon;
    if (!weapon) return;

    const wt = weapon.data.weaponType;
    const setCooldown = () => {
      const base = weapon.data.cooldown || weapon.data.recovery || 0.5;
      npc._attackCooldown = base * COMPANION_ATTACK_SPEED_MULT;
    };
    // Route attacks to the active enemy list (interior or surface) so the
    // companion's hits register against dungeon enemies, not the surface room.
    const activeEnemies = ((game.player?.inDungeon || game.player?.inHut) && game.activeFloor)
      ? game.activeFloor.enemies
      : game.currentRoom?.enemies || [];

    // Bow charge release: when fully charged, release toward target
    if (wt === 'BOW') {
      if (weapon.isCharging) {
        if (weapon.chargeTime >= weapon.maxChargeTime * 0.85) {
          const arrows = weapon.releaseBow();
          if (arrows) {
            game.combatSystem.createAttack(arrows, activeEnemies);
            setCooldown();
          }
        }
      } else if (weapon.canUse() && distToTarget < ENEMY_AGGRO_RANGE) {
        weapon.use(npc); // starts charging
      }
      return;
    }

    if (wt === 'GUN') {
      if (weapon.canUse() && distToTarget < ENEMY_AGGRO_RANGE) {
        const attack = weapon.use(npc);
        if (attack) {
          game.combatSystem.createAttack(attack, activeEnemies);
          setCooldown();
        }
      }
      return;
    }

    if (wt === 'MELEE') {
      const range = weapon.data.range || 20;
      const swingRange = range + GRID.CELL_SIZE; // grace
      if (distToTarget < swingRange && weapon.canUse()) {
        // Bypass windup for predictable companion swing timing
        const attack = weapon.executeAttack(npc, 0);
        if (attack) {
          game.combatSystem.createAttack(attack, activeEnemies);
          weapon.cooldownTimer = weapon.data.recovery || weapon.data.cooldown || 0.5;
          setCooldown();
        }
      }
      return;
    }
  }

  // ─── IDLE: walk toward a nearby dropped weapon ──────────────────────────

  _idleSeekWeapon(dt, npc) {
    const items = this.game.items;
    if (!items?.length) return;

    let nearest = null;
    let nearestDist = Infinity;
    const now = performance.now();
    for (const item of items) {
      if (item.pickupReadyAt && item.pickupReadyAt > now) continue;
      if (!CampNPC.acceptsWeapon(item)) continue;
      const dx = item.position.x - npc.position.x;
      const dy = item.position.y - npc.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) { nearestDist = d; nearest = item; }
    }

    if (!nearest || nearestDist > WEAPON_SCAN_RADIUS) {
      npc.velocity.vx = 0;
      npc.velocity.vy = 0;
      return;
    }

    // Walk toward the weapon (pickup happens via _tryWeaponPickup)
    // Position update delegated to PhysicsSystem.updateEntity()
    const dx = nearest.position.x - npc.position.x;
    const dy = nearest.position.y - npc.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    npc.velocity.vx = (dx / len) * npc.speed;
    npc.velocity.vy = (dy / len) * npc.speed;
  }

  // ─── Weapon pickup ──────────────────────────────────────────────────────

  _tryWeaponPickup(npc) {
    if (npc._pickupCooldown > 0) return;
    const game = this.game;
    const items = game.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Respect normal pickup-ready timer so a just-dropped weapon doesn't snap back
      if (item.pickupReadyAt && item.pickupReadyAt > performance.now()) continue;
      if (!CampNPC.acceptsWeapon(item)) continue;

      const dx = item.position.x - npc.position.x;
      const dy = item.position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > WEAPON_PICKUP_RADIUS) continue;

      // Pick it up — replace any existing weapon (drops the old one)
      if (npc.weapon) {
        const old = npc.weapon;
        old.position = { x: npc.position.x, y: npc.position.y };
        old.velocity = { vx: 0, vy: 0 };
        old.pickupReadyAt = performance.now() + 1500;
        items.push(old);
        if (game.physicsSystem) game.physicsSystem.addEntity(old);
      }
      npc.weapon = item;
      // Hand the companion a "ready" weapon. Player-dropped bows can carry over
      // any of: empty magazine + 9999 cooldown, mid-charge state pointing at the
      // previous owner, or an active windup — all of which would make the bow's
      // charge/fire pipeline misbehave for the npc. Sanitize fully.
      this._sanitizeWeaponForCarrier(item);
      items.splice(i, 1);
      if (game.physicsSystem) game.physicsSystem.removeEntity(item);

      // First weapon transitions IDLE → INTERESTED
      if (npc.state === CAMP_NPC_STATE.IDLE) npc.setInterested();
      game.audioSystem?.playSFX?.('pickup');
      game.menuSystem?.showPickupMessage?.(`HIRED FOR ${item.data.name?.toUpperCase() ?? 'A WEAPON'}?`);
      return;
    }
  }

  // ─── Consumable pickup (thrown/dropped bread or potion → full heal) ────

  // Bread and potions must actually be thrown/dropped onto the ground for the
  // NPC to notice them (SHIFT-throw or bread's own SPACE-drop) — handing them
  // over isn't a thing the NPC does. Only picked up while hurt; at full
  // health the item is left alone for the player to reclaim.
  _tryConsumablePickup(npc) {
    if (npc.hp >= npc.maxHp) return;
    const game = this.game;
    const items = game.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.pickupReadyAt && item.pickupReadyAt > performance.now()) continue;
      if (!CampNPC.acceptsHeal(item)) continue;

      const dx = item.position.x - npc.position.x;
      const dy = item.position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > HEAL_PICKUP_RADIUS) continue;

      npc.hp = npc.maxHp;
      items.splice(i, 1);
      if (game.physicsSystem) game.physicsSystem.removeEntity(item);
      game.audioSystem?.playSFX?.('pickup');
      game.menuSystem?.showPickupMessage?.('HEALED.');
      return;
    }
  }

  // ─── Coin offering (SPACE near NPC with `c` ingredient) ─────────────────

  /** Returns true if SPACE was handled by the camp NPC system. */
  handleSpacePress() {
    const game = this.game;
    const player = game.player;
    if (!player) return false;
    // Coin interactions are surface-only — inside hut/dungeon the player can't
    // see or reach the C-room campfire, so swallow nothing and let the interior
    // system handle SPACE instead.
    if (player.inDungeon || player.inHut) return false;

    const npc = game.companion ?? game.currentRoom?.campNPC;
    if (!npc) return false;
    if (npc.state === CAMP_NPC_STATE.FLEEING) return false;
    // No coin offerings while aggro'd — the NPC is busy fighting.
    if (npc.inCombat) return false;
    if (this.coinAnim) return true; // ritual in progress, swallow

    const pcx = player.position.x + GRID.CELL_SIZE / 2;
    const pcy = player.position.y + GRID.CELL_SIZE / 2;
    const ncx = npc.position.x + GRID.CELL_SIZE / 2;
    const ncy = npc.position.y + GRID.CELL_SIZE / 2;
    const dx = pcx - ncx, dy = pcy - ncy;
    if (dx * dx + dy * dy > COIN_INTERACT_RADIUS * COIN_INTERACT_RADIUS) return false;

    // Player must have a coin in the passive wallet
    if (!game.inventorySystem?.hasCoin()) return false;

    // Determine intent: heal takes priority when hurt, then hire (INTERESTED
    // + armed), otherwise hint.
    let intent;
    if (npc.hp < npc.maxHp) {
      intent = 'heal';
    } else if (npc.state === CAMP_NPC_STATE.INTERESTED && npc.weapon) {
      intent = 'hire';
    } else {
      intent = 'hint';
    }

    game.inventorySystem.removeCoin();
    this.coinAnim = {
      startX: pcx, startY: pcy,
      endX: ncx,   endY: ncy,
      t: 0, spinPhase: 0,
      intent, target: npc,
      zone: game.currentRoom?.zone || 'green'
    };
    return true;
  }

  _completeCoinOffering(anim) {
    const game = this.game;
    if (!anim?.target) return;

    // Note: the room the toss started in may already be gone by the time the
    // arc finishes (rooms are regenerated fresh on every transition, and the
    // ~0.55s coin arc leaves enough time to walk into the next one). The
    // offering must still resolve against the captured npc/zone rather than
    // bailing out on a stale game.currentRoom reference — bailing here used
    // to spend the coin and silently drop the NPC with nothing to show for it.
    const npc = anim.target;
    game.audioSystem?.playSFX?.('coin_plink');

    if (anim.intent === 'heal') {
      npc.hp = npc.maxHp;
      game.menuSystem?.showPickupMessage?.('HEALED.');
    } else if (anim.intent === 'hire') {
      // Promote to companion. Move from room.campNPC to game.companion.
      if (game.currentRoom && game.currentRoom.campNPC === npc) {
        game.currentRoom.campNPC = null;
      }
      game.companion = npc;
      npc.setCompanion();
      // Promoting to companion is the first moment the bow/gun fire pipeline
      // becomes active — make sure nothing carried over from the INTERESTED
      // phase or a previous owner.
      if (npc.weapon) this._sanitizeWeaponForCarrier(npc.weapon);
      npc._attackCooldown = 0;
      // The room.campNPC was never added to physicsSystem (only game.companion
      // gets registered). Register now so the companion can move immediately.
      this.registerWithPhysics(game.physicsSystem);
      game.menuSystem?.showPickupMessage?.('AT YOUR SIDE.');
    } else {
      // Hint — the NPC speaks a zone wise-saying through the dialogue box.
      // Never center-screen text: that's the narrator's voice, not an NPC's.
      const sayings = ZONES[anim.zone]?.wiseSayings || [];
      const text = sayings.length > 0
        ? sayings[Math.floor(Math.random() * sayings.length)]
        : 'KEEP MOVING.';
      game.dialogueSystem?.open(npc, [text]);
    }
    game.menuSystem?.updateUI?.();
  }

  // ─── Damage from enemies ────────────────────────────────────────────────

  _applyEnemyDamage(npc) {
    const cs = this.game.combatSystem;
    if (!cs) return;
    if (npc.invulnerabilityTimer > 0) return;

    // Projectiles
    const projs = cs.enemyProjectiles || [];
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      if ((p.plane ?? 0) !== npc.plane) continue;
      if (this._pointHitsNPC(p.position.x, p.position.y, npc, GRID.CELL_SIZE * 0.6)) {
        npc.takeDamage(p.damage || 1, { isBullet: true, attacker: p.owner });
        projs.splice(i, 1);
        cs.createDamageNumber?.(p.damage || 1, npc.position.x, npc.position.y, npc.color);
        return;
      }
    }

    // Melee attack hitboxes
    const melee = cs.enemyMeleeAttacks || [];
    for (const m of melee) {
      if (m.windupPhase) continue;
      if (m.hasHit) continue;
      if ((m.plane ?? 0) !== npc.plane) continue;
      if (this._rectHitsNPC(m, npc)) {
        m.hasHit = true;
        npc.takeDamage(m.damage || 1, { isMelee: true, attacker: m.owner });
        cs.createDamageNumber?.(m.damage || 1, npc.position.x, npc.position.y, npc.color);
        return;
      }
    }
  }

  _pointHitsNPC(x, y, npc, radius) {
    const cx = npc.position.x + npc.width / 2;
    const cy = npc.position.y + npc.height / 2;
    const dx = x - cx, dy = y - cy;
    const r = radius + Math.min(npc.width, npc.height) / 2;
    return dx * dx + dy * dy < r * r;
  }

  _rectHitsNPC(attack, npc) {
    const ax = attack.position.x;
    const ay = attack.position.y;
    const aw = attack.width || GRID.CELL_SIZE;
    const ah = attack.height || GRID.CELL_SIZE;
    const nx = npc.position.x;
    const ny = npc.position.y;
    return (
      ax < nx + npc.width && ax + aw > nx &&
      ay < ny + npc.height && ay + ah > ny
    );
  }

  // ─── Room transition hook ───────────────────────────────────────────────

  /** Teleport the companion to wherever the player just landed. */
  snapCompanionToPlayer(offset = GRID.CELL_SIZE) {
    const npc = this.game.companion;
    const player = this.game.player;
    if (!npc || !player) return;
    if (npc.state === CAMP_NPC_STATE.FLEEING) return;
    npc.position.x = player.position.x + offset;
    npc.position.y = player.position.y;
    npc.velocity.vx = 0;
    npc.velocity.vy = 0;
  }

  /** Teleports companion to player and restores full HP. Called on room entry. */
  onRoomEnter() {
    const game = this.game;
    const npc = game.companion;
    if (!npc) return;
    if (npc.state === CAMP_NPC_STATE.FLEEING) return;

    npc.position.x = game.player.position.x + GRID.CELL_SIZE; // beside player
    npc.position.y = game.player.position.y;
    npc.velocity.vx = 0;
    npc.velocity.vy = 0;
    npc.hp = npc.maxHp;
    npc.invulnerabilityTimer = 0;
    npc._attackCooldown = 0;
    // Mirror the player's per-room reset, and additionally clear any lingering
    // charge/windup state so the bow/gun fire pipeline starts clean each room.
    if (npc.weapon) this._sanitizeWeaponForCarrier(npc.weapon);
  }

  /**
   * Re-register the companion with PhysicsSystem after physicsSystem.clear().
   * Call this after every physics entity rebuild in the EXPLORE state.
   * Sets collisionMap from the current room so wall/slope/object collision matches the player's.
   */
  registerWithPhysics(physicsSystem) {
    const npc = this.game.companion;
    if (!npc) return;
    npc.collisionMap = this.game.currentRoom?.collisionMap || null;
    physicsSystem.addEntity(npc);
  }

  /**
   * Reset every piece of transient state that could prevent the companion's
   * weapon from entering the normal use → charge → release → cooldown cycle.
   * Called when a weapon changes hands (pickup) and on room entry.
   */
  _sanitizeWeaponForCarrier(item) {
    if (!item) return;
    item.resetUses?.();
    item.isCharging = false;
    item.chargeTime = 0;
    item.chargingPlayer = null;
    item.windupActive = false;
    item.windupTimer = 0;
    item.pendingPlayer = null;
    item.attackLockTimer = 0;
    // resetUses only clears cooldowns > 1000 (the 9999 sentinel). A normal
    // post-fire cooldown left by the previous owner would otherwise force the
    // npc to wait it out before the first shot.
    if (item.cooldownTimer > 0) item.cooldownTimer = 0;
    item.chargeAttackUsed = false;
  }

  // ─── Coin animation rendering helper ────────────────────────────────────

  /** Returns the active coin anim (for renderer), or null. */
  getCoinAnim() {
    return this.coinAnim;
  }

}

export const COIN_ARC_PEAK_HEIGHT_EXPORT = COIN_ARC_PEAK_HEIGHT;
export const COIN_ARC_DURATION_EXPORT = COIN_ARC_DURATION;
