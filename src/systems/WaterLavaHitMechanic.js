import { GRID, BACKGROUND_OBJECT_VARIANTS, POISONED_WATER_DURATION, HEATED_WATER_DURATION, WATER_COLORS } from '../game/GameConfig.js';
import { isInteriorActive } from './PlaneSystem.js';

// Water/lava elemental reactions to a projectile hit — split out of
// CombatSystem's background-object collision handler, which owns everything
// upstream of this (bullet-behavior dispatch, drop effects, ignition) and
// just calls in here once a struck object turns out to be water or lava.
// Composition module for CombatSystem, same shape as WallRicochetMechanic/
// BoomerangMechanic — `combat` is the CombatSystem instance (game/
// electricitySystem/newSteamClouds access).
export const WaterLavaHitMechanic = {
  // Water state transitions from projectiles. Environmental terrain
  // (BackgroundObject.isEnvironmental()) never spawns a damage number — each
  // branch already has its own feedback: the tile's own color/char changes
  // with waterState (ice melting included), or a steam cloud puffs. Also
  // handles a freeze (water) attack hitting lava.
  applyHit(proj, obj, backgroundObjects, combat) {
    if (obj.isWater && obj.isWater()) {
      if (proj.onHit === 'freeze') {
        obj.setWaterState('frozen', Infinity); // Stays frozen until thawed by fire
      } else if (proj.onHit === 'poison') {
        obj.setWaterState('poisoned', POISONED_WATER_DURATION);
      } else if (proj.onHit === 'stun' && proj.electric) {
        combat.game?.electricitySystem?.seedFromWeapon(obj, backgroundObjects, proj,
          { tileDuration: 4.0, hutPlane: isInteriorActive(combat.game) });
      } else if (proj.onHit === 'burn') {
        this.burnWater(obj, backgroundObjects, combat);
      }
    } else if (obj.isTrough && proj.onHit === 'burn') {
      this.burnWater(obj, backgroundObjects, combat);
    } else if (obj.isTrough && proj.onHit === 'poison') {
      this.poisonTrough(backgroundObjects);
    }

    // Fire projectile hits Barricade ice → melt it, the same one-hit thaw a
    // burning melee swing gets past resolveSmashRefusal. Handled here rather
    // than in the collision handler's damage path because a projectile never
    // consults the smash rules at all: this module is where a projectile's
    // elemental reactions to terrain already live.
    // The block's drop effect (its thaw into water) has to be queued here:
    // ice's bulletInteraction is 'block', so the collision handler's own
    // effect collection upstream never saw a kill to queue.
    if (obj.typeId === 'barricade_ice' && proj.onHit === 'burn') {
      const result = obj.takeDamage(Math.max(1, proj.damage || 1));
      if (result.destroyed && result.effect) {
        combat.objectDestroyEvents.push({ obj, effect: result.effect });
      }
    }

    // Fire projectile hits deep snow → melt it (shared with the melee path,
    // see meltSnow below).
    this.meltSnow(obj, proj.onHit);

    // Water attack hits lava → solidify to rock (shared with the melee path,
    // see freezeLava below).
    this.freezeLava(obj, proj.onHit, combat);
  },

  // Fire hits water — shared by a fire projectile (applyHit above) and a
  // burning melee swing (CombatSystem's melee water branch).
  //   frozen → melts (this used to spawn an obsidian '0' on the tile instead —
  //            and since water is pass-through, a fire arrow crossing the
  //            Frosted Maw's frozen sheet dropped a rock on the first frozen
  //            tile it touched and then stopped dead against it);
  //   normal → a steam cloud, and the tile is Heated Water for
  //            HEATED_WATER_DURATION: it fills a Bottle of Hot Water and does
  //            not heal (the Caldera's hot_water heals; this is not that);
  //   heated → nothing: hot water has already given its steam.
  // Poisoned/electrified water still steams but keeps its own state.
  // The Alchemy Lab trough (isTrough, '≈' — not isWater) heats the same way,
  // all of its cells at once, and never cools; heat drives out its poison.
  burnWater(obj, backgroundObjects, combat) {
    if (obj.isTrough) {
      if (obj.troughState === 'heated') return;
      this._puffSteam(obj, combat);
      this._setTroughState(backgroundObjects, 'heated');
      return;
    }
    const state = obj.getWaterState();
    if (state === 'frozen') { obj.setWaterState('normal', 0); return; }
    if (state === 'heated') return;
    this._puffSteam(obj, combat);
    if (state === 'normal') obj.setWaterState('heated', HEATED_WATER_DURATION);
  },

  // Poison hits the Alchemy Lab trough: all of its cells at once, for good,
  // and over any heat. The last hit decides what water it holds.
  poisonTrough(backgroundObjects) {
    this._setTroughState(backgroundObjects, 'poisoned');
  },

  _setTroughState(backgroundObjects, state) {
    for (const cell of backgroundObjects) {
      if (!cell.isTrough) continue;
      cell.troughState = state;
      cell.color = cell.animationColor = WATER_COLORS[state];
    }
  },

  _puffSteam(obj, combat) {
    combat.newSteamClouds.push({
      x: obj.position.x + GRID.CELL_SIZE / 2,
      y: obj.position.y + GRID.CELL_SIZE / 2,
      radius: GRID.CELL_SIZE * 3,
      timer: 7.0
    });
  },

  // Fire hits deep snow → melt it into a water tile, the same permanent
  // terrain conversion LavaAscentSystem's _convertTile uses for its own
  // flood cycle (typeId + _variantData swap). PhysicsSystem's deep-snow
  // detection keys off `char === '█'` (right next to its `char === '~'`
  // water/lava/mud branch), so flipping char to '~' is what actually moves
  // the tile out of "snow" and into "water" at the physics layer, not just
  // visually. Shared by both a fire projectile's hit (applyHit above) and a
  // melee fire-sword swing (CombatSystem's melee background-object loop) —
  // bug #302 was a fire sword never melting snow because only the projectile
  // path called into this module at all.
  meltSnow(obj, onHit) {
    if (obj.typeId !== 'snow_deep' || onHit !== 'burn') return;
    const variant = BACKGROUND_OBJECT_VARIANTS.water;
    obj.typeId = 'water';
    obj._variantData = { ...variant };
    obj.char = variant.char;
    obj.color = variant.color;
    obj.animationColor = variant.color;
  },

  // Freeze attack hits lava → solidify to rock, with a cooling steam puff.
  // Shared by both a projectile's hit (applyHit above) and a melee freeze
  // weapon's swing (CombatSystem's melee background-object loop).
  freezeLava(obj, onHit, combat) {
    if (!(obj.isLava && obj.isLava()) || onHit !== 'freeze') return;
    obj.solidifyToRock();
    combat.newSteamClouds.push({
      x: obj.position.x + GRID.CELL_SIZE / 2,
      y: obj.position.y + GRID.CELL_SIZE / 2,
      radius: GRID.CELL_SIZE * 2,
      timer: 3.0
    });
  }
};
