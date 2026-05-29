import { EXIT_LETTERS } from './exitLetters.js';
import { ZONES } from './zones.js';
import { GAME_STATES, ROOM_TYPES } from '../game/GameConfig.js';


/**
 * Spell definitions — words the player can "type" via the keystroke buffer.
 *
 * Each entry maps an uppercase word to a spell definition:
 *   response   — text displayed on screen when the spell fires
 *   followUps  — optional map of follow-up words → response text OR function(game) => string.
 *                When a spell has followUps, SpellSystem enters an awaiting
 *                state after it fires. The next buffer submission checks
 *                followUps first; if matched, shows that response and clears
 *                the awaiting state. If no follow-up matches, normal spell
 *                detection runs as a fallback.
 *
 * Detection scans the buffer from the most recently entered key outward, so
 * "FIND" triggers but "FINDE" does not (E is checked first).
 *
 * Static response text limit: ~18 chars to fit the 2× VentureArcade rendering.
 * Function follow-ups return dynamic text from game state (explore mode only).
 */

/** Returns the closest enemy to the player, or null if none present. */
function _closestEnemy(game) {
  const enemies = game.currentRoom?.enemies;
  if (!enemies?.length || !game.player) return null;
  const px = game.player.position.x;
  const py = game.player.position.y;
  let closest = null;
  let minDist = Infinity;
  for (const e of enemies) {
    const dx = e.position.x - px;
    const dy = e.position.y - py;
    const d = dx * dx + dy * dy;
    if (d < minDist) { minDist = d; closest = e; }
  }
  return closest;
}

/** Returns a follow-up handler that describes the exit in the given cardinal direction. */
function _lookDirection(direction) {
  return function(game) {
    const exit = game.currentRoom?.exits?.[direction];
    if (!exit?.letter) return 'SOLID STONE.';
    const def = EXIT_LETTERS[exit.letter];
    return def?.spellDescription || def?.name?.toUpperCase() + '.' || 'THE ARCH HUMS LOW.';
  };
}

/** Describes the current room based on game state. */
function _lookHere(game) {
  const state = game.stateMachine?.getCurrentState();
  if (state === GAME_STATES.REST) return 'HOME. FOR NOW.';
  if (state === GAME_STATES.NEUTRAL) {
    return game.neutralRoomSystem?.currentScript?.spellDescription || 'A QUIET PLACE.';
  }
  const letter = game.currentRoom?.exitLetter;
  if (!letter) return 'UNMARKED.';
  const def = EXIT_LETTERS[letter];
  return def?.spellDescription || def?.name?.toUpperCase() + '.' || 'UNMARKED.';
}

/** Describes the current zone via its spellDescription field. */
function _lookZone(game) {
  const zone = game.zoneSystem?.currentZone;
  if (!zone) return 'BETWEEN WORLDS.';
  const def = ZONES[zone];
  return def?.spellDescription || def?.name?.toUpperCase() + '.' || 'UNKNOWN REALM.';
}

/** Returns a follow-up handler that only responds in REST mode. */
function _lookRest(text) {
  return function(game) {
    return game.stateMachine?.getCurrentState() === GAME_STATES.REST ? text : '...NOTHING.';
  };
}

/** Describes the active weapon in the player's current quick slot. */
function _lookWeapon(game) {
  const item = game.player?.quickSlots?.[game.player.activeSlotIndex];
  if (!item) return 'BARE HANDS.';
  return item.data?.spellDescription || item.data?.name?.toUpperCase() + '.' || '...NOTHING.';
}

/** Describes the player's equipped armor. */
function _lookArmor(game) {
  const item = game.inventorySystem?.equippedArmor;
  if (!item) return 'NO ARMOR.';
  return item.data?.spellDescription || item.data?.name?.toUpperCase() + '.' || '...NOTHING.';
}

/** Shared handler: describes the nearest enemy via its spellDescription field. */
function _lookEnemy(game) {
  const e = _closestEnemy(game);
  if (!e) return 'NO ENEMIES NEAR.';
  return e.data?.spellDescription || e.data?.name?.toUpperCase() || 'SOMETHING HOSTILE.';
}

/** Returns ordinal string for the nth wish (1-indexed). */
function _wishOrdinal(n) {
  return ['1ST', '2ND', '3RD'][n] ?? `${n + 1}TH`;
}

/** Dynamic response for CLEANSE — shows which wish would be used. */
function _cleanseResponse(game) {
  if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
  return `USE ${_wishOrdinal(game.wishesUsed)} WISH?`;
}

/** Action fired when player confirms a CLEANSE wish. */
function _grantWish(game) {
  if (game.wishesUsed < 3) game.executeCleanse();
}

/** Response for REVIVE — fires immediately without confirmation. */
function _reviveResponse(game) {
  if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
  return 'WISH GRANTED.';
}

/** Action fired immediately on REVIVE. */
function _grantRevive(game) {
  if (game.wishesUsed < 3) game.executeRevive();
}

/** SIT/SITDOWN — lowers a raised witch hut so the player can enter. */
function _sitResponse(game) {
  const hut = game.currentRoom?.hut;
  if (!hut?.raised) return '...NOTHING.';
  return 'THE HUT SETTLES.';
}

function _sitAction(game) {
  const hut = game.currentRoom?.hut;
  if (!hut?.raised) return;
  game.hutSystem?.lowerHut(game.currentRoom);
}

function _bridgeResponse(game) {
  if (game.currentRoom?.type !== ROOM_TYPES.RIDGE) return 'NOT HERE.';
  if (game.currentRoom?.bridgeBuilt) return 'BRIDGE EXISTS.';
  if (game.ridgeSystem?._checkMaterials().sufficient) return 'BUILD THE BRIDGE?';
  if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
  return `USE ${_wishOrdinal(game.wishesUsed)} WISH?`;
}

function _buildBridgeAction(game) {
  if (!game.ridgeSystem?.canBuild()) return;
  if (game.ridgeSystem._checkMaterials().sufficient) {
    game.ridgeSystem.buildBridgeViaSpell();
  } else if (game.wishesUsed < 3) {
    game.wishesUsed++;
    game.ridgeSystem.buildBridgeViaSpell();
  }
}

export const SPELLS = {
  'HEX': {
    response: (game) => {
      if (!game.knownSpells?.has('HEX')) return 'UNKNOWN SPELL.';
      // HEX curses the nearest enemy: inverts their movement and dims their color for 5s
      const enemy = _closestEnemy(game);
      if (!enemy) return 'NO TARGET.';
      enemy.applyStatusEffect('stun', 0.3);  // Brief stun on cast
      enemy._hexed = (enemy._hexed || 0) + 5.0;
      return 'HEXED.';
    },
    action: (game) => {
      if (!game.knownSpells?.has('HEX')) return;
    }
  },

  'FROG': {
    response: (game) => {
      if (!game.knownSpells?.has('FROG')) return 'UNKNOWN SPELL.';
      return game.player?.polymorphed ? 'YOU ARE YOURSELF.' : 'YOU BECOME A FROG.';
    },
    action: (game) => {
      if (!game.knownSpells?.has('FROG')) return;
      if (game.player?.polymorphed) {
        game.polymorphSystem?.deactivatePolymorph(game, false);
      } else {
        game.polymorphSystem?.activatePolymorph(game, false);
      }
    },
  },

  'SIT': {
    response: _sitResponse,
    action: _sitAction,
  },

  'SITDOWN': {
    response: _sitResponse,
    action: _sitAction,
  },

  'BRIDGE': {
    response: _bridgeResponse,
    followUpsActive: (game) =>
      game.currentRoom?.type === ROOM_TYPES.RIDGE &&
      !game.currentRoom?.bridgeBuilt &&
      (game.ridgeSystem?._checkMaterials().sufficient || game.wishesUsed < 3),
    followUps: {
      'YES':    { text: 'BUILDING...', action: _buildBridgeAction },
      'Y':      { text: 'BUILDING...', action: _buildBridgeAction },
      'AYE':    { text: 'BUILDING...', action: _buildBridgeAction },
      'NO':     'SPELL CANCELLED.',
      'NAY':    'SPELL CANCELLED.',
      'CANCEL': 'SPELL CANCELLED.',
    },
  },

  'CLEANSE': {
    response: _cleanseResponse,
    followUpsActive: (game) => game.wishesUsed < 3 &&
      game.stateMachine?.getCurrentState() === GAME_STATES.EXPLORE,
    followUps: {
      'YES':    { text: 'WISH GRANTED.',     action: _grantWish },
      'Y':      { text: 'WISH GRANTED.',     action: _grantWish },
      'AYE':    { text: 'WISH GRANTED.',     action: _grantWish },
      'SURE':   { text: 'WISH GRANTED.',     action: _grantWish },
      'DO':     { text: 'WISH GRANTED.',     action: _grantWish },
      'NO':     'SPELL CANCELLED.',
      'NAY':    'SPELL CANCELLED.',
      'CANCEL': 'SPELL CANCELLED.',
      'STOP':   'SPELL CANCELLED.',
    },
  },


  'HEAL': {
    response: (game) => {
      if (!game.player?.polymorphed) return 'NOTHING AILS YOU.';
      if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
      return `USE ${_wishOrdinal(game.wishesUsed)} WISH?`;
    },
    followUpsActive: (game) => game.player?.polymorphed === true && game.wishesUsed < 3,
    followUps: {
      'YES':    { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'Y':      { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'AYE':    { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'SURE':   { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'NO':     'SPELL CANCELLED.',
      'NAY':    'SPELL CANCELLED.',
      'CANCEL': 'SPELL CANCELLED.',
    },
  },

  'UNCURSE': {
    response: (game) => {
      if (!game.player?.polymorphed) return 'NO CURSE FOUND.';
      if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
      return `USE ${_wishOrdinal(game.wishesUsed)} WISH?`;
    },
    followUpsActive: (game) => game.player?.polymorphed === true && game.wishesUsed < 3,
    followUps: {
      'YES':    { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'Y':      { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'AYE':    { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'SURE':   { text: 'THE CURSE LIFTS.',   action: (game) => game.polymorphSystem?.cureViaWish(game) },
      'NO':     'SPELL CANCELLED.',
      'NAY':    'SPELL CANCELLED.',
      'CANCEL': 'SPELL CANCELLED.',
    },
  },

  'REVIVE': {
    response: _reviveResponse,
    action: (game) => {
      if (game.stateMachine?.getCurrentState() === GAME_STATES.GAME_OVER) _grantRevive(game);
    },
  },

  'CONTINUE': {
    response: _reviveResponse,
    action: (game) => {
      if (game.stateMachine?.getCurrentState() === GAME_STATES.GAME_OVER) _grantRevive(game);
    },
  },

  'FIND': {
    response: 'FIND WHAT?',
    followUps: {
      'EXIT':  'ONLY DEATH.',
      'COLOR': 'MANY PRISONERS.',
      'DOOR':  'DOORS ARE HIDDEN.',
      'THREE': 'YES. FIND US.',
      'ONE':   'MORE THAN ONE.',
      'TWO':   'MORE THAN TWO.',
      'FOUR':  'LESS THAN FOUR.',
    },
  },

  'LOOKENEMY': { response: (game) => _lookEnemy(game) },
  'LOOKNORTH': { response: _lookDirection('north') },
  'LOOKEAST':  { response: _lookDirection('east') },
  'LOOKWEST':  { response: _lookDirection('west') },

  'NORTH': { response: _lookDirection('north') },
  'EAST':  { response: _lookDirection('east') },
  'WEST':  { response: _lookDirection('west') },

  'HERE':  { response: _lookHere },
  'ZONE':  { response: _lookZone },
  'COLOR': { response: _lookZone },

  'LOOKHERE':   { response: _lookHere },
  'LOOKZONE':   { response: _lookZone },
  'LOOKCOLOR':  { response: _lookZone },
  'LOOKWEAPON': { response: _lookWeapon },
  'LOOKARMOR':  { response: _lookArmor },

  'WEAPON': { response: _lookWeapon },
  'ARMOR':  { response: _lookArmor },

  'LOOK': {
    response: 'LOOK AT WHAT?',
    followUps: {
      // Dynamic — reads spellDescription from nearest enemy (explore mode only)
      'ENEMY':   _lookEnemy,
      'FOE':     _lookEnemy,
      'MONSTER': _lookEnemy,

      // Dynamic — current room and zone
      'HERE':       _lookHere,
      'ROOM':       _lookHere,
      'ZONE':       _lookZone,
      'COLOR':      _lookZone,
      'LAND':       _lookZone,
      'PLACE':      _lookZone,

      // Ambient / architectural
      'LIGHT':      'LIGHT IS THE KEY.',
      'NORTH':      _lookDirection('north'),
      'EAST':       _lookDirection('east'),
      'WEST':       _lookDirection('west'),
      'DOOR':       'I BECKON.',
      'ARCH':       'THE ARCH HUMS LOW.',
      'GATE':       'THE ARCH HUMS LOW.',
      'EXIT':       'I BECKON.',
      'WALL':       'FOUR WALLS.',
      'WALLS':      'FOUR WALLS.',
      'STONE':      'OLD STONE WALLS.',
      'FLOOR':      _lookZone,
      'GROUND':     _lookZone,
      'SKY':        'STONE. MAYBE SKY.',
      'CEILING':    'STONE. MAYBE SKY.',
      'ABOVE':      'STONE. MAYBE SKY.',

      // Objects in the rest hub (REST mode only)
      'CRAFTING':   _lookRest('YES. YOU MUST.'),
      'TABLE':      _lookRest('YES. YOU MUST.'),
      'CHESTS':     _lookRest('PLENTY OF SPACE.'),
      'SLOT':       _lookRest('A PALE IMITATION.'),
      'SLOTS':      _lookRest('A PALE IMITATION.'),

      // Player introspection
      'SELF':       'WHERE AT, YOU KNOW NOT',
      'ME':         'WHERE AT, YOU KNOW NOT',
      'PLAYER':     'WHERE AT, YOU KNOW NOT',

      // Equipment
      'WEAPON':     _lookWeapon,
      'SWORD':      _lookWeapon,
      'GUN':        _lookWeapon,
      'BOW':        _lookWeapon,
      'ITEM':       _lookWeapon,
      'ARMOR':      _lookArmor,
      'SHIELD':     _lookArmor,
      'CHEST':      _lookArmor,

      // Catch-alls
      'EVERYTHING': 'INDESCRIBABLE.',
      'NOTHING':    'IN DUE TIME...',
    },
  },
};
