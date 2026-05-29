import { GRID } from '../game/GameConfig.js';
import { NeutralCharacter } from './NeutralCharacter.js';
import { getExitSlotPosition, mutateExitLetter } from '../systems/ExitSystem.js';

// Fairy — emerges from cut fairy-grass, drives the F (Fountain) discovery loop.
//
// State machine:
//   flutter    → oscillates around spawn point. Player touch → 'heal' outcome
//                (handled externally by InteractionSystem). Timeout → fleeing.
//   fleeing    → flies toward nearest N/E/W exit (mirrors Leshy targeting).
//   dusting    → at the exit slot, pauses, mutates the letter to 'F', then exits.
//   exited     → flies offscreen and self-marks consumed.
//   delivering → spawned by FountainSystem; flies from a source point to the
//                player, fires `onDeliver` once in range, then exits.
//   angered    → spawned in a corruption swarm; orbits behind the player
//                (opposite the assigned exit) and applies a continuous impulse
//                that herds the player out. Each fairy acts independently.
//
// Touch outcomes (decided by the caller, not the entity):
//   - empty bottle equipped at full HP → convert slot to fairy_in_a_bottle
//   - otherwise → heal player to full
// Either way, the caller calls consume() to despawn the fairy.
export class Fairy extends NeutralCharacter {
  constructor(x, y, exits, opts = {}) {
    super('*', '#ffaaff', x, y);

    this.exits = exits || {};
    this.speed = 90;
    this.state = opts.state || 'flutter';
    this.consumed = false;

    // Flutter motion (sine oscillation around anchor point)
    this.anchor = { x, y };
    this.flutterTimer = 0;
    this.flutterRadius = 8;
    this.flutterSpeed = 4.0;

    // Flutter lifetime before it flees (seconds)
    this.flutterDuration = opts.flutterDuration ?? 5.0;
    this.flutterElapsed = 0;

    // Touch immunity on spawn — gives the player a beat to react before the
    // fairy can be heal/bottle-consumed by accidental adjacent contact.
    this.touchImmunityTimer = opts.touchImmunity ?? 2.0;

    // Fleeing target
    this.targetExitDir = null;
    this.targetPosition = null;

    // Dusting pause
    this.dustTimer = 0;
    this.dustDuration = 0.6;
    this.dustComplete = false;
    this.onDust = opts.onDust || null;

    // Delivery
    this.deliveryTarget = opts.deliveryTarget || null;
    this.onDeliver = opts.onDeliver || null;
    this.deliveryFired = false;

    // Ambient wander (fountain-room atmospheric flying)
    this.wanderTarget = null;
    this.wanderHoldTimer = 0;
    this.wanderHoldDuration = 1.0 + Math.random() * 1.5;

    // Carry ritual (fountain weapon throw)
    this.carryPhase = null;   // 'approach' | 'toPool' | 'process' | 'deliver'
    this.carryKind = null;    // 'accept' | 'refuse'
    this.carriedChar = null;
    this.carryNextChar = null;
    this.carriedItem = null;  // original Item ref (refuse case)
    this.carryTarget = null;
    this.carryPool = null;
    this.carryProcessTimer = 0;

    // Faster pulse than default Leshy/captive for sparkle feel
    this.pulseSpeed = 6.0;
    this.pulseMin = 0.6;
    this.pulseMax = 1.0;
  }

  // Called externally when player touches the fairy (heal or bottle path).
  consume() {
    this.consumed = true;
  }

  startFleeing() {
    if (this.state === 'fleeing' || this.state === 'dusting' || this.state === 'exited') return;
    this.state = 'fleeing';
    this.targetExitDir = this._findNearestExit();
    if (this.targetExitDir) {
      this.targetPosition = this._exitPixelPosition(this.targetExitDir);
    }
  }

  startDelivery(target, onDeliver) {
    this.state = 'delivering';
    this.deliveryTarget = target;
    this.onDeliver = onDeliver || this.onDeliver;
  }

  // Begin the fountain weapon ritual. The fairy will fly to the weapon's
  // landing point, carry it to the pool, and (accept) swap-and-deliver an
  // upgraded weapon, or (refuse) immediately turn around at the pool and
  // hand the same weapon back to the player.
  startCarry({ landingX, landingY, weaponChar, item, kind, nextChar, poolX, poolY }) {
    this.state = 'carrying';
    this.carryPhase = 'approach';
    this.carryKind = kind;
    this.carriedChar = weaponChar;
    this.carryNextChar = nextChar || null;
    this.carriedItem = item || null;
    this.carryTarget = { x: landingX, y: landingY };
    this.carryPool = { x: poolX, y: poolY };
    this.carryProcessTimer = 0;
    this.speed = 200;
    this.clearIndicator();
  }

  update(deltaTime, game) {
    super.update(deltaTime);

    if (this.touchImmunityTimer > 0) {
      this.touchImmunityTimer = Math.max(0, this.touchImmunityTimer - deltaTime);
    }

    this._game = game;

    switch (this.state) {
      case 'flutter':       this._updateFlutter(deltaTime, game); break;
      case 'fleeing':       this._updateFleeing(deltaTime, game); break;
      case 'dusting':       this._updateDusting(deltaTime, game); break;
      case 'exited':        this._updateExited(deltaTime); break;
      case 'delivering':    this._updateDelivering(deltaTime, game); break;
      case 'angered':       this._updateAngered(deltaTime, game); break;
      case 'ambient':       this._updateAmbient(deltaTime, game); break;
      case 'carrying':      this._updateCarrying(deltaTime, game); break;
    }
  }

  // Exits are "available" once the room is cleared (`exitsLocked === false`).
  // Until then, fairies stay in flutter — the F-mutation has nowhere to land.
  _exitsAvailable(game) {
    const room = game?.currentRoom;
    if (!room) return false;
    if (room.exitsLocked) return false;
    return !!(room.exits && (room.exits.north || room.exits.east || room.exits.west));
  }

  // ── State updates ─────────────────────────────────────────────────────────

  _updateFlutter(deltaTime, game) {
    this.flutterTimer += deltaTime;
    this.flutterElapsed += deltaTime;

    // Lissajous-ish wobble around the anchor — feels alive without drifting away
    const t = this.flutterTimer * this.flutterSpeed;
    this.position.x = this.anchor.x + Math.cos(t) * this.flutterRadius;
    this.position.y = this.anchor.y + Math.sin(t * 1.3) * this.flutterRadius;

    if (this.flutterElapsed >= this.flutterDuration) {
      // Don't flee until the room has unlocked exits — otherwise there's no
      // letter slot to dust. Keep fluttering and re-check next tick.
      if (!this._exitsAvailable(game)) {
        this.flutterElapsed = 0;
        return;
      }
      this.startFleeing();
    }
  }

  _updateFleeing(deltaTime, game) {
    if (!this.targetPosition) {
      // No exits — just despawn
      this.consumed = true;
      return;
    }

    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 4) {
      this.state = 'dusting';
      this.dustTimer = 0;
      this.setIndicator('·', '#ffeeff', -GRID.CELL_SIZE);
      return;
    }

    this.position.x += (dx / distance) * this.speed * deltaTime;
    this.position.y += (dy / distance) * this.speed * deltaTime;
  }

  _updateDusting(deltaTime, game) {
    this.dustTimer += deltaTime;

    // Halfway through the pause, mutate the exit letter to 'F'
    if (!this.dustComplete && this.dustTimer >= this.dustDuration * 0.5) {
      const room = game?.currentRoom;
      const exit = room?.exits?.[this.targetExitDir];
      if (exit && exit.letter) {
        if (mutateExitLetter(exit, 'F', { source: 'fairyDust' })) {
          if (typeof this.onDust === 'function') this.onDust(this.targetExitDir, exit);
        }
      }
      this.dustComplete = true;
    }

    if (this.dustTimer >= this.dustDuration) {
      this.state = 'exited';
      this.clearIndicator();
      // Aim past the screen edge in the direction of the exit
      const offscreen = this._offscreenPoint(this.targetExitDir);
      this.targetPosition = offscreen;
    }
  }

  _updateExited(deltaTime) {
    if (!this.targetPosition) {
      this.consumed = true;
      return;
    }
    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 4) {
      this.consumed = true;
      return;
    }
    this.position.x += (dx / distance) * this.speed * deltaTime;
    this.position.y += (dy / distance) * this.speed * deltaTime;
  }

  _updateDelivering(deltaTime, game) {
    const target = this.deliveryTarget;
    if (!target) { this.consumed = true; return; }

    const tx = target.position ? target.position.x : target.x;
    const ty = target.position ? target.position.y : target.y;
    const dx = tx - this.position.x;
    const dy = ty - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < GRID.CELL_SIZE * 0.6) {
      if (!this.deliveryFired) {
        this.deliveryFired = true;
        if (typeof this.onDeliver === 'function') {
          this.onDeliver(this, game);
        }
      }
      // After delivery, despawn next frame
      this.consumed = true;
      return;
    }

    this.position.x += (dx / distance) * this.speed * deltaTime;
    this.position.y += (dy / distance) * this.speed * deltaTime;
  }

  _updateAmbient(deltaTime, game) {
    const room = game?.currentRoom;
    if (!this.wanderTarget) {
      this.wanderTarget = this._pickWanderTarget(room);
    }

    // Lerp anchor toward wander target slowly; sine wobble around anchor.
    const ax = this.anchor.x;
    const ay = this.anchor.y;
    const dx = this.wanderTarget.x - ax;
    const dy = this.wanderTarget.y - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    const AMBIENT_SPEED = 32;
    if (d > 4) {
      this.anchor.x += (dx / d) * AMBIENT_SPEED * deltaTime;
      this.anchor.y += (dy / d) * AMBIENT_SPEED * deltaTime;
      this.wanderHoldTimer = 0;
    } else {
      this.wanderHoldTimer += deltaTime;
      if (this.wanderHoldTimer >= this.wanderHoldDuration) {
        this.wanderTarget = this._pickWanderTarget(room);
        this.wanderHoldTimer = 0;
        this.wanderHoldDuration = 1.0 + Math.random() * 1.5;
      }
    }

    this.flutterTimer += deltaTime;
    const t = this.flutterTimer * (this.flutterSpeed * 0.6);
    this.position.x = this.anchor.x + Math.cos(t) * this.flutterRadius * 1.4;
    this.position.y = this.anchor.y + Math.sin(t * 1.3) * this.flutterRadius * 1.4;
  }

  _pickWanderTarget(room) {
    const C = GRID.CELL_SIZE;
    const padding = 3;
    const minX = padding * C;
    const maxX = (30 - padding) * C;  // GRID.COLS ≈ 30
    const minY = padding * C;
    const maxY = (20 - padding) * C;  // GRID.ROWS ≈ 20
    const f = room?.fountain;
    const exclusionR = f ? (f.poolRadius + 2) * C : 0;
    for (let i = 0; i < 8; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (f) {
        const dxp = x - f.centerX;
        const dyp = y - f.centerY;
        if (dxp * dxp + dyp * dyp < exclusionR * exclusionR) continue;
      }
      return { x, y };
    }
    return { x: this.position.x, y: this.position.y };
  }

  _updateCarrying(deltaTime, game) {
    // Keep delivery target locked to live player position.
    if (this.carryPhase === 'deliver') {
      const p = game?.player;
      if (p) this.carryTarget = { x: p.position.x, y: p.position.y };
    }

    if (this.carryPhase !== 'process') {
      const target = this.carryTarget;
      if (!target) { this._returnToAmbient(game); return; }
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const REACH = 4;
      if (d > REACH) {
        this.position.x += (dx / d) * this.speed * deltaTime;
        this.position.y += (dy / d) * this.speed * deltaTime;
        return;
      }
    }

    // Phase advance on arrival (or process tick).
    switch (this.carryPhase) {
      case 'approach':
        // Picked up the weapon — show it as an indicator below the fairy.
        this.setIndicator(this.carriedChar, '#ffeeff', GRID.CELL_SIZE * 0.55);
        this.carryPhase = 'toPool';
        this.carryTarget = { ...this.carryPool };
        break;
      case 'toPool':
        if (this.carryKind === 'refuse') {
          // Immediate hand-back: turn around at the pool with the same weapon.
          this.carryPhase = 'deliver';
          const p = game?.player;
          this.carryTarget = p ? { x: p.position.x, y: p.position.y } : null;
        } else {
          // Drop into the water; the swap-beat begins.
          this.clearIndicator();
          this.carryPhase = 'process';
          this.carryProcessTimer = 0;
          game?.audioSystem?.playSFX?.('coin_plink');
        }
        break;
      case 'process':
        this.carryProcessTimer += deltaTime;
        if (this.carryProcessTimer >= 0.6) {
          this.carriedChar = this.carryNextChar || this.carriedChar;
          this.setIndicator(this.carriedChar, '#ffffff', GRID.CELL_SIZE * 0.55);
          this.carryPhase = 'deliver';
          const p = game?.player;
          this.carryTarget = p ? { x: p.position.x, y: p.position.y } : null;
        }
        break;
      case 'deliver':
        this._dropCarriedItem(game);
        this._returnToAmbient(game);
        break;
    }
  }

  _dropCarriedItem(game) {
    if (!game) return;
    if (this.carryKind === 'refuse' && this.carriedItem) {
      const item = this.carriedItem;
      const C = GRID.CELL_SIZE;
      item.position.x = this.position.x - C / 2;
      item.position.y = this.position.y - C / 2;
      item.velocity = { vx: 0, vy: 0 };
      item.pickupReadyAt = performance.now() + 400;
      if (!game.items) game.items = [];
      game.items.push(item);
      game.physicsSystem?.addEntity?.(item);
    } else if (this.carryKind === 'accept' && game.lootSystem?.spawnItemDrop) {
      game.lootSystem.spawnItemDrop(
        this.carriedChar,
        this.position.x,
        this.position.y,
        null,
        this
      );
      game.audioSystem?.playSFX?.('pickup');
    }
    this.carriedItem = null;
  }

  _returnToAmbient(game) {
    this.state = 'ambient';
    this.carryPhase = null;
    this.carryTarget = null;
    this.carryPool = null;
    this.carriedChar = null;
    this.carryNextChar = null;
    this.carryKind = null;
    this.speed = 90;
    this.wanderTarget = null;
    this.wanderHoldTimer = 0;
    this.clearIndicator();
    const room = game?.currentRoom;
    if (room?.fountain) room.fountain.activeRitual = false;
  }

  _updateAngered(deltaTime, game) {
    const player = game?.player;
    if (!player) return;

    const px = player.position.x;
    const py = player.position.y;

    // Direction player → exit. If no exit was assigned (e.g. exits all gone)
    // fall back to current player-relative vector so fairies still chase.
    let ex = 0, ey = 0;
    if (this.targetExitDir) {
      const exit = this._exitPixelPosition(this.targetExitDir);
      ex = exit.x - px;
      ey = exit.y - py;
    }
    const eDist = Math.sqrt(ex * ex + ey * ey);
    if (eDist > 0) { ex /= eDist; ey /= eDist; }

    // Fan slot: each fairy claims an angle in a 120° arc centered opposite
    // the exit. Index 0..count-1 → slot −0.5..+0.5.
    const count = this.angerCount || 1;
    const slot = count <= 1 ? 0 : (this.angerIndex / (count - 1)) - 0.5;
    const SPREAD_ARC = Math.PI * (2 / 3);
    const baseAngle = Math.atan2(-ey, -ex); // opposite of exit dir
    const angle = baseAngle + slot * SPREAD_ARC;

    const STANDOFF = GRID.CELL_SIZE * 2.2;
    const wobbleT = (this.flutterTimer += deltaTime) * (this.flutterSpeed * 1.6);
    const wobbleX = Math.cos(wobbleT) * this.flutterRadius * 0.6;
    const wobbleY = Math.sin(wobbleT * 1.7) * this.flutterRadius * 0.6;
    const desiredX = px + Math.cos(angle) * STANDOFF + wobbleX;
    const desiredY = py + Math.sin(angle) * STANDOFF + wobbleY;

    const dx = desiredX - this.position.x;
    const dy = desiredY - this.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const CHASE_SPEED = 220;
    if (d > 1) {
      const step = Math.min(CHASE_SPEED * deltaTime, d);
      this.position.x += (dx / d) * step;
      this.position.y += (dy / d) * step;
    }

    // When close enough to the player, push them away (which is roughly toward
    // the exit, because each fairy parked itself opposite the exit).
    const dpx = px - this.position.x;
    const dpy = py - this.position.y;
    const playerDist = Math.sqrt(dpx * dpx + dpy * dpy);
    const PUSH_RANGE = GRID.CELL_SIZE * 2.0;
    if (playerDist < PUSH_RANGE && game.physicsSystem?.applyImpulse) {
      const PUSH_RATE = 900;
      game.physicsSystem.applyImpulse(player, dpx, dpy, PUSH_RATE * deltaTime);
    }
  }

  // ── Targeting helpers ─────────────────────────────────────────────────────

  _findNearestExit() {
    const candidates = ['north', 'east', 'west'].filter(dir => {
      const exit = this.exits[dir];
      // Exit must exist and have a letter (no dusting an empty slot)
      return exit && (typeof exit === 'object' ? exit.letter : true);
    });
    if (candidates.length === 0) return null;

    let nearest = null;
    let nearestDist = Infinity;
    for (const dir of candidates) {
      const p = this._exitPixelPosition(dir);
      const dx = p.x - this.position.x;
      const dy = p.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = dir;
      }
    }
    return nearest;
  }

  _exitPixelPosition(direction) {
    // Aim slightly inside the slot rather than dead-center so the dust feels
    // landed-on rather than passing-through.
    const slot = getExitSlotPosition(direction);
    if (!slot) return { x: this.position.x, y: this.position.y };
    return {
      x: slot.col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
      y: slot.row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2
    };
  }

  _offscreenPoint(direction) {
    const slot = getExitSlotPosition(direction);
    if (!slot) return this.position;
    const margin = GRID.CELL_SIZE * 2;
    switch (direction) {
      case 'north': return { x: slot.col * GRID.CELL_SIZE, y: -margin };
      case 'east':  return { x: GRID.COLS * GRID.CELL_SIZE + margin, y: slot.row * GRID.CELL_SIZE };
      case 'west':  return { x: -margin, y: slot.row * GRID.CELL_SIZE };
      default:      return this.position;
    }
  }
}
