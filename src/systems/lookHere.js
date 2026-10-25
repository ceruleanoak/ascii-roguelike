import { GAME_STATES } from '../game/GameConfig.js';
import { inSamePlane, canReachLoot } from './PlaneSystem.js';
import { isConcealedEnemy } from './enemyConcealment.js';
import {
  LOOK_HERE_LINE_LIMIT, lookHereLetters,
  LOOK_HERE_OBJECT_LINES, LOOK_HERE_STRUCTURE_LINES,
  LOOK_HERE_NPC_STRUCTURES, LOOK_HERE_NPC_LINES, LOOK_HERE_UNNAMED_SPEAKER,
  LOOK_HERE_LOOT, LOOK_HERE_CAN_CRAFT, LOOK_HERE_CAN_EQUIP,
  LOOK_HERE_ENEMY_FORMS, LOOK_HERE_UNNAMED_ENEMY,
} from '../data/lookHereLines.js';

/**
 * LOOKHERE — the THREE lists what in the room the player could act on, one
 * line per kind, in this order: enemies, objects/structures, NPCs, loot, then
 * what the player could do here (craft, equip). Lines are deduplicated, so
 * three rats and a forest are RAT DRAWS NEAR and YOU SEE A TREE once each.
 *
 * Only what the player could see is listed: the active layer and plane, and
 * no enemy the render is passing off as something else (isConcealedEnemy).
 * The words come from src/data/lookHereLines.js.
 *
 * @returns {string[]} the lines, empty when nothing in the room is listed
 */
export function lookHereLines(game) {
  const player = game.player;
  if (!player) return [];
  const lines = [
    ...enemyLines(game, player),
    ...objectLines(game, player),
    ...npcLines(game, player),
  ];
  if (lootInReach(game, player)) lines.push(LOOK_HERE_LOOT);
  if (game.craftSpellSystem.canCraft()) lines.push(LOOK_HERE_CAN_CRAFT);
  if (game.equipSpellSystem.canEquip()) lines.push(LOOK_HERE_CAN_EQUIP);
  return [...new Set(lines)];
}

function enemyLines(game, player) {
  return game._activeEnemies()
    .filter(e => !e.isDying && !(e.hp <= 0) && inSamePlane(e, player) && !isConcealedEnemy(e))
    .map(e => enemyLine(e.data?.name));
}

// The longest form of NAME DRAWS NEAR that keeps the letter limit.
function enemyLine(name) {
  if (!name) return LOOK_HERE_UNNAMED_ENEMY;
  const upper = name.toUpperCase();
  for (const form of LOOK_HERE_ENEMY_FORMS) {
    const line = form(upper);
    if (lookHereLetters(line) <= LOOK_HERE_LINE_LIMIT) return line;
  }
  return LOOK_HERE_UNNAMED_ENEMY;
}

function objectLines(game, player) {
  const lines = [];
  // Structures first: they are the room's landmarks.
  if (!game.interiorManager.isActive && !player.inMaze) {
    for (const hut of game.hutSystem.roomHuts()) {
      if (hut.hutKind === 'cavern') lines.push(LOOK_HERE_STRUCTURE_LINES.cave);
      else if (hut.hutKind === 'shopkeeper') lines.push(LOOK_HERE_STRUCTURE_LINES.shop);
      else lines.push(LOOK_HERE_STRUCTURE_LINES.hut);
    }
    if (game.currentRoom?.maze) lines.push(LOOK_HERE_STRUCTURE_LINES.maze);
  }
  if (game.restBundle && game.stateMachine.getCurrentState() === GAME_STATES.REST) {
    lines.push(LOOK_HERE_STRUCTURE_LINES.satchel);
  }
  for (const npc of game.interiorManager.activeNpcs()) {
    const line = LOOK_HERE_NPC_STRUCTURES.get(npc.constructor);
    if (line && inSamePlane(npc, player)) lines.push(line);
  }
  for (const obj of game._activeBackgroundObjects()) {
    if (obj.destroyed || !inSamePlane(obj, player)) continue;
    const line = LOOK_HERE_OBJECT_LINES[obj.data?.name];
    if (line) lines.push(line);
  }
  return lines;
}

function npcLines(game, player) {
  const lines = [];
  for (const npc of game.interiorManager.activeNpcs()) {
    if (!inSamePlane(npc, player) || LOOK_HERE_NPC_STRUCTURES.has(npc.constructor)) continue;
    const line = LOOK_HERE_NPC_LINES.get(npc.constructor);
    if (line) lines.push(line);
    else if (typeof npc.getDialogueLines === 'function') lines.push(LOOK_HERE_UNNAMED_SPEAKER);
  }
  return lines;
}

function lootInReach(game, player) {
  const reachable = loot => !loot.consumed && canReachLoot(game, player, loot);
  return game.items.some(reachable) || game.ingredients.some(reachable);
}
