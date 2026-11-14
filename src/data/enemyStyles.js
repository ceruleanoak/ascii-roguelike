/**
 * enemyStyles — the Enemy Styles the CLI offers when the player adds an enemy
 * (cliEnemyTables ADD flow), shown on its BEHAVIOR row. Each style is read
 * off a shipped enemy rather than authored as numbers: `from` names the
 * source enemy and `keys` the blocks copied from it, so a style keeps up with
 * tuning done to the enemy it is drawn from.
 *
 * Name, color, HP, damage and speed are never copied: the player steps them.
 * Neither is anything that is the source's own identity (its Motif, true
 * name, descriptions) or that ties it to another system by glyph (bread
 * taming, Brute formations).
 *
 * Sources are spawn-table enemies whose behavior is all data: no code checks
 * their glyph. A new style must hold to that, or the copy will not behave
 * like its source.
 *
 * A catalogue, not a behavior owner: CanonOverlay resolves a stored style
 * name against this at boot, so only the style's name is ever stored.
 */

// What every style copies: how the source moves, reads and swings, and what
// it is made of (its affinities and tier decide its drops).
const BODY = [
  'mass', 'acceleration', 'attackRange', 'aggroRange', 'attackCooldown', 'attackWindup',
  'windupMovement', 'attackType', 'projectileType', 'movementStyle', 'movementConfig',
  'decisionInterval', 'idleBehavior', 'grassStealth', 'telegraph', 'recover', 'approach',
  'search', 'elementalAffinity', 'affinities', 'tier',
];

export const ENEMY_STYLES = [
  { name: 'CHASER', from: 'S', keys: BODY },
  { name: 'BRUTE', from: 'O', keys: [...BODY, 'itemUsage'] },
  { name: 'CHARGER', from: 'b', keys: [...BODY, 'chargeMechanic'] },
  { name: 'THIEF', from: 'r', keys: [...BODY, 'thiefMechanic'] },
  { name: 'ARCHER', from: 'G', keys: [...BODY, 'itemUsage', 'quiverRecharge', 'spawnEquipment'] },
  { name: 'CASTER', from: 'W', keys: BODY },
  { name: 'HOPPER', from: 'g', keys: [...BODY, 'waterAffinity', 'swimAffinity'] },
  { name: 'PROWLER', from: 'w', keys: [...BODY, 'leapAttack', 'reinforcement', 'packCoordination'] },
];

export function findEnemyStyle(name) {
  return ENEMY_STYLES.find(style => style.name === name) ?? null;
}
