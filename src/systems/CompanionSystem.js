import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { NPCRat } from '../entities/NPCRat.js';
import { Ingredient } from '../entities/Ingredient.js';

// Companion behavior: the bread-feed pipeline and per-frame drivers for every
// befriendable creature — wild rat → NPCRat companion, wild crow → follower
// flock → shoulder companion. Companion rosters (game.tamedRats,
// game.companionCrows, game.followerCrows, game.fedCrowCount) and the
// breadTargetSelectors list stay on game: renderers read them directly, the
// same documented compromise as trap state (system owns logic, game holds data).
export class CompanionSystem {
  constructor(game) {
    this.game = game;
  }

  // True iff any entity in the current room would eat a dropped loaf.
  // Iterates game.breadTargetSelectors so new bread-eaters drop in by appending.
  hasBreadEligibleTarget() {
    for (const sel of this.game.breadTargetSelectors) {
      const list = sel(this.game);
      if (list && list.length > 0) return true;
    }
    return false;
  }

  // Spawn a Bread Item entity at the player's feet — SPACE path. Wild rats
  // are steered toward it by updateBreadSeekingRats (which scans every frame
  // so SHIFT-thrown loaves are handled the same way without a parallel hook).
  dropBreadAtPlayer() {
    const game = this.game;
    if (!game.player) return;
    const loaf = new Item('⌬', game.player.position.x, game.player.position.y);
    loaf.pickupReadyAt = performance.now() + 1500;
    game.items.push(loaf);
    game.physicsSystem.addEntity(loaf);
  }

  // Wild rats seeking bread: assign unowned loaves → nearest wild rat each
  // frame (so both SPACE-drop and SHIFT-throw work without a separate hook),
  // then check proximity, consume the loaf, remove the wild Enemy, and spawn
  // a fresh NPCRat in its place. Replacing rather than re-skinning keeps the
  // hostile Enemy AI cleanly out of the companion's behavior tree.
  updateBreadSeekingRats() {
    const game = this.game;
    const enemies = game.currentRoom?.enemies;
    if (!enemies || enemies.length === 0) return;

    // Assign loaves to wild rats. A loaf is "owned" once any wild rat is
    // seeking it; other rats stick to their default AI until more bread drops.
    // Hut/maze interiors seed bread into game.items tagged with hutPlane /
    // mazePlane — those positions are in interior grid space (top-left ≈ the
    // outer-room origin) and must be excluded, or surface rats path to the
    // wrong coordinates and "eat" a loaf the player never dropped.
    const loaves = game.items.filter(it =>
      it && it.char === '⌬' && !it.consumed && !it.hutPlane && !it.mazePlane
    );
    if (loaves.length > 0) {
      const claimedLoaves = new Set();
      const claimedRats = new Set();
      for (const e of enemies) {
        if (!e.seekingBread) continue;
        const t = e.breadTarget;
        // Release the rat if its target vanished or is an interior-tagged loaf
        // (covers any stale assignment from before the surface-only filter
        // landed) — otherwise it'd march to the top-left forever.
        if (!t || t.consumed || t.hutPlane || t.mazePlane) {
          e.seekingBread = false;
          e.breadTarget = null;
          continue;
        }
        claimedLoaves.add(t);
        claimedRats.add(e);
      }
      for (const loaf of loaves) {
        if (claimedLoaves.has(loaf)) continue;
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const r of enemies) {
          if (r.char !== 'r') continue;
          if (r.hp <= 0) continue;
          if (claimedRats.has(r)) continue;
          const dx = r.position.x - loaf.position.x;
          const dy = r.position.y - loaf.position.y;
          const d = dx * dx + dy * dy;
          if (d < nearestDistSq) { nearestDistSq = d; nearest = r; }
        }
        if (nearest) {
          nearest.seekingBread = true;
          nearest.breadTarget = loaf;
          nearest.breadSeekStartTime = performance.now();
          claimedRats.add(nearest);
          claimedLoaves.add(loaf);
        }
      }
    }

    // Tight overlap required — at 0.7 cells the white-flip fired while the rat
    // was still visibly approaching. 0.35 puts the centers inside each other's
    // sprite so the eat reads as physical contact.
    const EAT_DIST_SQ = (GRID.CELL_SIZE * 0.35) ** 2;
    // Minimum time between seeking-bread assignment and eat — guarantees a
    // visible "walk to the bread" beat even if the rat was already adjacent.
    const EAT_GRACE_MS = 350;
    const now = performance.now();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const rat = enemies[i];
      if (!rat.seekingBread || !rat.breadTarget) continue;
      const loaf = rat.breadTarget;
      if (loaf.consumed || loaf.destroyed) {
        rat.seekingBread = false;
        rat.breadTarget = null;
        continue;
      }
      if (now - (rat.breadSeekStartTime || 0) < EAT_GRACE_MS) continue;
      const dx = loaf.position.x - rat.position.x;
      const dy = loaf.position.y - rat.position.y;
      if (dx * dx + dy * dy > EAT_DIST_SQ) continue;

      // Eat the loaf
      loaf.consumed = true;
      const lIdx = game.items.indexOf(loaf);
      if (lIdx !== -1) {
        game.physicsSystem.removeEntity(loaf);
        game.items.splice(lIdx, 1);
      }

      // Yank the wild Enemy out of every room.enemies-style cache and physics.
      enemies.splice(i, 1);
      const p0 = game.currentRoom?.enemiesPlane0;
      if (p0) {
        const idx = p0.indexOf(rat);
        if (idx !== -1) p0.splice(idx, 1);
      }
      const p1 = game.currentRoom?.enemiesPlane1;
      if (p1) {
        const idx = p1.indexOf(rat);
        if (idx !== -1) p1.splice(idx, 1);
      }
      game.physicsSystem.removeEntity(rat);

      // Spawn the companion at the wild rat's exact position so the visual
      // hand-off reads as the rat eating the bread and turning friendly.
      const npc = new NPCRat(rat.position.x, rat.position.y);
      npc.plane = rat.plane ?? 0;
      npc.setGame(game);
      npc.setRoom(game.currentRoom);
      npc.collisionMap = game.currentRoom?.collisionMap || null;
      npc.backgroundObjects = game.currentRoom?.backgroundObjects || null;
      game.tamedRats.push(npc);
      game.physicsSystem.addEntity(npc);

      // Promotion burst — small white sparkle so the moment reads visually.
      const ex = npc.position.x + GRID.CELL_SIZE / 2;
      const ey = npc.position.y + GRID.CELL_SIZE / 2;
      for (let k = 0; k < 10; k++) {
        const angle = (k / 10) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 30 + Math.random() * 30;
        game.particles.push({
          x: ex, y: ey,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 15,
          life: 0.5, maxLife: 0.5,
          char: '·', color: '#ffffff'
        });
      }
      game.particles.push({
        x: ex, y: ey - 4, vx: 0, vy: -22,
        life: 0.9, maxLife: 0.9, char: '♥', color: '#ff5577'
      });
    }
  }

  // Per-frame NPCRat driver: run each rat's own update with the live enemies
  // list, surface damage numbers on hits, and despawn perma-fleeing rats that
  // have reached an exit.
  updateTamedRats(deltaTime) {
    const game = this.game;
    if (!game.tamedRats || game.tamedRats.length === 0) return;
    const enemies = game.currentRoom?.enemies || [];
    const siblings = game.tamedRats;
    for (let i = game.tamedRats.length - 1; i >= 0; i--) {
      const rat = game.tamedRats[i];
      if (rat.state === 'permaFlee' && rat.fleeReached) {
        game.physicsSystem.removeEntity(rat);
        game.tamedRats.splice(i, 1);
        continue;
      }
      const result = rat.update(deltaTime, enemies, game.player, siblings);
      if (result?.attacked) {
        const victim = result.attacked;
        game.combatSystem.createDamageNumber?.(result.damage ?? 1,
                                               victim.position.x, victim.position.y,
                                               victim.color || '#ffffff');
      }
    }
  }

  // Apply enemy melee + projectile hits to tamed rats. Mirrors
  // CampNPCSystem._applyEnemyDamage but operates over the multi-instance array.
  applyEnemyDamageToTamedRats() {
    const game = this.game;
    if (!game.tamedRats || game.tamedRats.length === 0) return;
    const cs = game.combatSystem;
    if (!cs) return;

    const projs = cs.enemyProjectiles || [];
    for (const rat of game.tamedRats) {
      if (rat.state === 'permaFlee') continue;
      if (rat.invulnerabilityTimer > 0) continue;
      // Projectiles
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if ((p.plane ?? 0) !== rat.plane) continue;
        const cx = rat.position.x + rat.width / 2;
        const cy = rat.position.y + rat.height / 2;
        const dx = p.position.x - cx;
        const dy = p.position.y - cy;
        const r = GRID.CELL_SIZE * 0.6 + Math.min(rat.width, rat.height) / 2;
        if (dx * dx + dy * dy < r * r) {
          rat.takeDamage(p.damage || 1);
          projs.splice(i, 1);
          cs.createDamageNumber?.(p.damage || 1, rat.position.x, rat.position.y, rat.color);
          break;
        }
      }
      if (rat.invulnerabilityTimer > 0) continue;
      // Melee attack hitboxes
      const melee = cs.enemyMeleeAttacks || [];
      for (const m of melee) {
        if (m.windupPhase) continue;
        if (m.hasHit) continue;
        if ((m.plane ?? 0) !== rat.plane) continue;
        const ax = m.position.x;
        const ay = m.position.y;
        const aw = m.width || GRID.CELL_SIZE;
        const ah = m.height || GRID.CELL_SIZE;
        if (
          ax < rat.position.x + rat.width && ax + aw > rat.position.x &&
          ay < rat.position.y + rat.height && ay + ah > rat.position.y
        ) {
          m.hasHit = true;
          rat.takeDamage(m.damage || 1);
          cs.createDamageNumber?.(m.damage || 1, rat.position.x, rat.position.y, rat.color);
          break;
        }
      }
    }
  }

  // Unified companion room-entry dispatch. Each companion type (crow, tamed
  // rat, camp NPC) owns its own onRoomEnter — this just walks the rosters and
  // calls each. Companion crows reuse companionShoulderIndex for their slot;
  // tamed rats pass (index, total) so they radial-spread around the player.
  snapAllCompanionsOnRoomEnter() {
    const game = this.game;
    if (!game.player) return;
    for (const c of game.companionCrows) c.onRoomEnter?.(game.player);
    // Perma-fleeing rats from the previous room don't come back — they've
    // abandoned the player and despawn at the transition.
    if (game.tamedRats?.length) {
      game.tamedRats = game.tamedRats.filter(r => r.state !== 'permaFlee');
    }
    const ratCount = game.tamedRats?.length || 0;
    for (let i = 0; i < ratCount; i++) {
      game.tamedRats[i].onRoomEnter?.(game.player, game, i, ratCount);
    }
    game.companion?.onRoomEnter?.(game.player, game);
  }

  registerTamedRatsWithPhysics() {
    const game = this.game;
    if (!game.tamedRats || game.tamedRats.length === 0) return;
    for (const rat of game.tamedRats) {
      game.physicsSystem.addEntity(rat);
    }
  }

  // Wild + follower crow driver: bread seeking, scare reactions, promotion.
  updateCrows(deltaTime) {
    const game = this.game;
    const crows = game.currentRoom?.crows || [];
    const followers = game.followerCrows || [];

    // Pull all on-ground bread loaves so crows can target them.
    const breadItems = game.items.filter(it => it && it.char === '⌬' && !it.consumed);

    // Skip the whole pipeline when nothing eligible can react to bread or
    // threats. Followers without bread are handled by updateFollowerCrows.
    if (crows.length === 0 && !(followers.length > 0 && breadItems.length > 0)) {
      return;
    }

    const bgObjects = game.currentRoom?.backgroundObjects || [];

    // Player-as-threat: scares unfed crows on proximity. Fed crows (already
    // tame) skip this — they only flee actual weapon contact.
    // While bread is on the ground, the player is offering food, not
    // threatening — otherwise SPACE-dropped bread at the player's feet
    // creates a scare loop: crow seeks → enters scare radius → flees →
    // returns → seeks → forever. Weapon attacks below still scare.
    const playerThreat = (game.player && game.player.plane === 0 && breadItems.length === 0)
      ? { x: game.player.position.x, y: game.player.position.y }
      : null;

    // Weapon threats apply to fed and unfed crows alike.
    const weaponThreats = [];
    for (const atk of game.combatSystem.getMeleeAttacks()) {
      weaponThreats.push({ x: atk.position.x, y: atk.position.y });
    }
    for (const proj of game.combatSystem.getProjectiles()) {
      weaponThreats.push({ x: proj.position.x, y: proj.position.y });
    }

    // Eat handler: remove the loaf, promote the eater to companion. Every
    // bread-eat adds one more companion — they accumulate. Other crows in the
    // room join the follower flock, drawn toward the feed point.
    const onAteBread = (loaf, crow) => {
      const idx = game.items.indexOf(loaf);
      if (idx !== -1) {
        game.physicsSystem.removeEntity(loaf);
        game.items.splice(idx, 1);
      }
      const ex = crow.position.x + GRID.CELL_SIZE / 2;
      const ey = crow.position.y + GRID.CELL_SIZE / 2;

      // Other room crows take off toward the feed point and join the flock.
      for (let i = crows.length - 1; i >= 0; i--) {
        const other = crows[i];
        if (other === crow) continue;
        other.becomeFollower(ex, ey);
        game.followerCrows.push(other);
        crows.splice(i, 1);
      }
      // Existing followers redirect interest to the new feed point.
      for (const f of game.followerCrows) {
        f.becomeFollower(ex, ey);
      }

      // Promote the eater. Pull it out of room.crows / follower flock if
      // present. Append to companion list — multiple companions are allowed.
      const cIdx = crows.indexOf(crow);
      if (cIdx !== -1) crows.splice(cIdx, 1);
      const fIdx = game.followerCrows.indexOf(crow);
      if (fIdx !== -1) game.followerCrows.splice(fIdx, 1);
      crow.becomeCompanion();
      crow.companionShoulderIndex = game.companionCrows.length;
      game.companionCrows.push(crow);
      game.fedCrowCount = Math.min(3, (game.fedCrowCount || 0) + 1);

      // Promotion burst: feather puff + golden crumbs + rising heart.
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 35 + Math.random() * 35;
        game.particles.push({
          x: ex, y: ey,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          life: 0.55, maxLife: 0.55,
          char: i % 2 === 0 ? '*' : '·',
          color: i % 2 === 0 ? '#ffffff' : '#daa520'
        });
      }
      game.particles.push({
        x: ex, y: ey - 4, vx: 0, vy: -22,
        life: 0.9, maxLife: 0.9, char: '♥', color: '#ff5577'
      });
    };

    for (const crow of crows) {
      crow.update(deltaTime, bgObjects, crows, breadItems, onAteBread);

      // Tagged threats: weapon contact counts as an attack and shakes the
      // hoard loose; player proximity only spooks the crow into the air.
      const threats = [];
      if (playerThreat) threats.push({ x: playerThreat.x, y: playerThreat.y, isAttack: false });
      for (const t of weaponThreats) threats.push({ x: t.x, y: t.y, isAttack: true });
      for (const t of threats) {
        if (crow.isWithinScareRange(t.x, t.y)) {
          const droppedGlyph = crow.scare(t.x, t.y, t.isAttack);
          if (droppedGlyph) {
            const drop = new Ingredient(droppedGlyph, crow.position.x, crow.position.y);
            drop.startDropBounce(0.55);
            game.ingredients.push(drop);
            game.physicsSystem.addEntity(drop);
          }
          break;
        }
      }

      if (crow.takeoffPending) {
        const variant = Math.random() < 0.5 ? 'crow_takeoff_1' : 'crow_takeoff_2';
        game.audioSystem?.playSFX(variant);
        crow.takeoffPending = false;
      }
    }

    // Followers break orbit to chase bread. Drives them through the same wild
    // seek/eat state machine; onAteBread promotes the eater to companion and
    // pulls it out of the follower list. updateFollowerCrows skips any that
    // entered 'seekingBread' this frame so they don't double-step.
    if (breadItems.length > 0 && followers.length > 0) {
      for (const f of [...followers]) {
        f.update(deltaTime, bgObjects, followers, breadItems, onAteBread);
      }
    }
  }

  updateCompanionCrow(deltaTime) {
    const game = this.game;
    if (!game.companionCrows || game.companionCrows.length === 0) return;
    const ctx = {
      player: game.player,
      ingredients: game.ingredients,
      enemies: game.currentRoom?.enemies || [],
      items: game.items,
      // Lift the ingredient off the ground but DON'T credit the player —
      // the companion ferries it back and deposits on perch. Returns true if
      // the world removal succeeded so the crow knows the pickup took.
      takeIngredient: (ing) => {
        if (!ing || ing.consumed) return false;
        ing.consumed = true;
        game.physicsSystem.removeEntity(ing);
        const idx = game.ingredients.indexOf(ing);
        if (idx !== -1) game.ingredients.splice(idx, 1);
        return true;
      },
      // Hand-off on perch: credit the player with the carried glyph. Optional
      // delivery pop so the player sees the trade happen.
      depositIngredient: (glyph, crow) => {
        if (!glyph) return;
        game.addIngredient(glyph);
        if (crow) {
          const cx = crow.position.x + GRID.CELL_SIZE / 2;
          const cy = crow.position.y + GRID.CELL_SIZE / 2;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            game.particles.push({
              x: cx, y: cy,
              vx: Math.cos(a) * 25, vy: Math.sin(a) * 25 - 10,
              life: 0.35, maxLife: 0.35,
              char: '·', color: '#ffffff'
            });
          }
        }
      },
      companionCount: game.companionCrows.length
    };
    for (const c of game.companionCrows) {
      c.updateAsCompanion(deltaTime, ctx);
    }
    this._processCompanionDiveAttacks(deltaTime);
  }

  // Dive-attack coordination: at most ONE companion is in flight at a time.
  // Picks the first eligible orbiter that is off cooldown and launches it
  // with a miss-chance roll. Telegraph (windup, during which the crow keeps
  // orbiting) → dash → cooldown.
  _processCompanionDiveAttacks(deltaTime) {
    const game = this.game;
    // Global one-at-a-time gate: any companion currently winding up or
    // diving blocks new launches this frame.
    const anyEngaged = game.companionCrows.some(c => c.diveState && c.diveState !== 'idle');
    if (!anyEngaged) {
      for (const c of game.companionCrows) {
        if (c.diveCooldownTimer > 0) continue;
        if (c.companionTask !== 'enemy' || !c.companionTarget) continue;
        const t = c.companionTarget;
        if (!t || t.isDead || t.dead || t.hp <= 0) continue;
        // 45% miss rate — keeps dives feeling more like harassment than
        // a guaranteed strike, and gives the enemy room to counter.
        const miss = Math.random() < 0.45;
        c.beginDive(t, { miss });
        break;
      }
    }
    // Drive any in-flight dives and apply hits
    for (const c of game.companionCrows) {
      if (!c.diveState || c.diveState === 'idle') continue;
      const hitEnemy = c.updateDive(deltaTime);
      if (hitEnemy && !c.diveHasHit) {
        c.diveHasHit = true;
        const dmg = 1;
        if (typeof hitEnemy.takeDamage === 'function') {
          hitEnemy.takeDamage(dmg, game);
        }
        game.combatSystem.createDamageNumber(dmg, hitEnemy.position.x, hitEnemy.position.y, '#ffdd66');
        // Small impact burst
        const ix = hitEnemy.position.x + GRID.CELL_SIZE / 2;
        const iy = hitEnemy.position.y + GRID.CELL_SIZE / 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          game.particles.push({
            x: ix, y: iy,
            vx: Math.cos(a) * 50, vy: Math.sin(a) * 50,
            life: 0.35, maxLife: 0.35,
            char: '·', color: '#ffffff'
          });
        }
      }
    }
  }

  // Reputation effect: once the player has fed three crows, every wild crow
  // in a newly-entered room joins the follower flock immediately (no bread
  // needed). The flock still clears on the next room transition.
  autoJoinWildCrows() {
    const game = this.game;
    if ((game.fedCrowCount || 0) < 3) return;
    const crows = game.currentRoom?.crows;
    if (!crows || crows.length === 0) return;
    if (!game.player) return;
    const px = game.player.position.x + GRID.CELL_SIZE / 2;
    const py = game.player.position.y + GRID.CELL_SIZE / 2;
    for (const c of crows) {
      c.becomeFollower(px, py);
      game.followerCrows.push(c);
    }
    crows.length = 0;
  }

  updateFollowerCrows(deltaTime) {
    const game = this.game;
    if (!game.followerCrows || game.followerCrows.length === 0) return;
    const bgObjects = game.currentRoom?.backgroundObjects || [];
    const playerSpeed = game.player
      ? Math.hypot(game.player.velocity.vx, game.player.velocity.vy)
      : 0;
    const ctx = {
      player: game.player,
      backgroundObjects: bgObjects,
      playerSpeed,
      otherFollowers: game.followerCrows
    };
    for (const f of game.followerCrows) {
      // updateCrows already drove this frame's tick for bread-seekers.
      if (f.state === 'seekingBread') continue;
      f.updateAsFollower(deltaTime, ctx);
    }
  }
}
