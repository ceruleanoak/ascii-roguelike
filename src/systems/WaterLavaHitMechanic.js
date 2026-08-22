import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

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
  // with waterState, a steam cloud puffs, or a new obsidian rock appears in
  // place. Also handles a freeze (water) attack hitting lava.
  applyHit(proj, obj, backgroundObjects, combat) {
    if (obj.isWater && obj.isWater()) {
      if (proj.onHit === 'freeze') {
        obj.setWaterState('frozen', Infinity); // Stays frozen until thawed by fire
      } else if (proj.onHit === 'poison') {
        obj.setWaterState('poisoned', 8.0);
      } else if (proj.onHit === 'stun' && proj.electric) {
        combat.game?.electricitySystem?.seedFromWeapon(obj, backgroundObjects, proj,
          { tileDuration: 4.0, hutPlane: !!combat.game?.activeFloor });
      } else if (proj.onHit === 'burn') {
        if (obj.getWaterState() === 'frozen') {
          // Fire + frozen water/ice → create obsidian rock
          const obsidianRock = new BackgroundObject('0', obj.position.x, obj.position.y, { obsidian: true });
          backgroundObjects.push(obsidianRock);
        } else {
          // Fire hits liquid water → steam cloud
          combat.newSteamClouds.push({
            x: obj.position.x + GRID.CELL_SIZE / 2,
            y: obj.position.y + GRID.CELL_SIZE / 2,
            radius: GRID.CELL_SIZE * 3,
            timer: 7.0
          });
        }
      }
    }

    // Water attack hits lava → solidify to rock
    if (obj.isLava && obj.isLava() && proj.onHit === 'freeze') {
      obj.solidifyToRock();
      combat.newSteamClouds.push({
        x: obj.position.x + GRID.CELL_SIZE / 2,
        y: obj.position.y + GRID.CELL_SIZE / 2,
        radius: GRID.CELL_SIZE * 2,
        timer: 3.0
      });
    }
  }
};
