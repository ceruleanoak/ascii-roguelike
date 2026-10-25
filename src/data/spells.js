import { EXIT_LETTERS } from './exitLetters.js';
import { ZONES } from './zones.js';
import { ENEMIES } from './enemies.js';
import { GAME_STATES, ROOM_TYPES } from '../game/GameConfig.js';
import { lookHereLines } from '../systems/lookHere.js';


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
 * A response may hold several lines ('\n'); the THREE says them one after
 * another, stacked (RenderController.renderSpellResponse). LOOKHERE's lines
 * keep a stricter rule: 15 letters, spaces not counted (lookHereLines.js).
 * Function follow-ups return dynamic text from game state (explore mode only).
 *
 * No spell is named for an item or ingredient: a word the player learns from
 * the pickup box must never also be a command (`npm run check:data` fails a
 * key that matches an item or ingredient name).
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

/**
 * LOOKHERE: what in the room the player could act on, a line per kind
 * (src/systems/lookHere.js). A room with nothing to list is described instead.
 */
function _lookHere(game) {
  const lines = lookHereLines(game);
  return lines.length > 0 ? lines.join('\n') : _lookRoom(game);
}

/** Describes the current room based on game state. */
function _lookRoom(game) {
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
  // LOOK ENEMY betrays the true name — the word CALL/COMMAND answers to
  // (CommandSystem). The epitaph stays one tier deeper: naming the beast by
  // its common name still describes it; LOOK ENEMY names what it IS.
  return e.data?.trueName || e.data?.spellDescription || e.data?.name?.toUpperCase() || 'SOMETHING HOSTILE.';
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
  if (game.wishesUsed < 3) game.wishSystem?.executeCleanse(game);
}

/** Response for REVIVE — fires immediately without confirmation. */
function _reviveResponse(game) {
  if (game.wishesUsed >= 3) return 'NO WISHES LEFT.';
  return 'WISH GRANTED.';
}

/** Action fired immediately on REVIVE. */
function _grantRevive(game) {
  if (game.wishesUsed < 3) game.wishSystem?.executeRevive(game);
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

// ── True-name command (CALL / COMMAND) ──────────────────────────────────────
//
// Every registry enemy bears a trueName (enemies.js). Speaking CALL or
// COMMAND enters the awaiting state; the next submitted word is checked
// against this map — a true name permanently charms the nearest bearer via
// CommandSystem, whose return line IS the response (house pattern: HEX's
// response applies its own effect). Unknown words fall through to '...
// NOTHING.'; the awaiting state also resets on any room/state transition.
const COMMAND_FOLLOWUPS = Object.fromEntries(
  Object.values(ENEMIES)
    .filter(d => d.trueName)
    .map(d => [d.trueName, (game) => game.commandSystem?.commandNearest(d.trueName) ?? '...NOTHING.'])
);


// CLOSE, CLOSEGAME and EXITGAME are one spell under three names.
const EXIT_GAME_SPELL = {
  response: 'ARE YOU SURE?',
  followUps: {
    'YES':  { action: (game) => game.cliSystem.requestExit() },
    'Y':    { action: (game) => game.cliSystem.requestExit() },
    'SURE': { action: (game) => game.cliSystem.requestExit() },
    'OK':   { action: (game) => game.cliSystem.requestExit() },
    'AYE':  { action: (game) => game.cliSystem.requestExit() },
    'NO':   '...',
    'NAY':  '...',
  },
};

export const SPELLS = {
  // Dev menu. The THREE stays silent (null response); the cheat menu opens.
  // Replaces the old backslash key — a word anyone can learn.
  'CHEAT': {
    response: null,
    action: (game) => game.cheatMenu.open()
  },

  // Path to Canon: leaving the game is the non-ending. Knowledge is the
  // only gate — CLOSEGAME / EXITGAME work anywhere, in any run. An
  // affirmative closes the game into the CLI; anything else lets the run go on.
  // Bare CLOSE defaults to it, the game being the only thing that closes.
  'CLOSE':     EXIT_GAME_SPELL,
  'CLOSEGAME': EXIT_GAME_SPELL,
  'EXITGAME':  EXIT_GAME_SPELL,

  // EXIT — leave the hut, Cavern or Maze the player is in, the same run as
  // EXITHUT / EXITMAZE (BeelineSystem.exit).
  'EXIT': { response: (game) => game.beelineSystem.exit() },

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
      'YES':    { action: _buildBridgeAction },
      'Y':      { action: _buildBridgeAction },
      'AYE':    { action: _buildBridgeAction },
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

  // Command by true name — both words share one grammar and one warband
  // (CommandSystem: permanent charm, max three, boss-tier refuses).
  'CALL': {
    response: 'CALL WHOM?',
    followUps: COMMAND_FOLLOWUPS,
  },

  'COMMAND': {
    response: 'COMMAND WHOM?',
    followUps: COMMAND_FOLLOWUPS,
  },

  'LOOKENEMY': { response: (game) => _lookEnemy(game) },
  'LOOKNORTH': { response: _lookDirection('north') },
  'LOOKEAST':  { response: _lookDirection('east') },
  'LOOKWEST':  { response: _lookDirection('west') },

  // GO / HEAD <direction> — the Beeline (BeelineSystem): an invulnerable run
  // to that exit, then the ordinary exit warp. Silent when it starts; the run
  // is the answer. Longest-match detection lets GOWEST beat the WEST below.
  'GONORTH':   { response: (game) => game.beelineSystem.cast('north') },
  'GOEAST':    { response: (game) => game.beelineSystem.cast('east') },
  'GOWEST':    { response: (game) => game.beelineSystem.cast('west') },
  'GOSOUTH':   { response: (game) => game.beelineSystem.cast('south') },
  // GOREST — south is the way back to REST, so in EXPLORE it is GOSOUTH.
  'GOREST':    { response: (game) => game.beelineSystem.goRest() },
  // EXPLORE — north is the way out of REST, so in REST it is GONORTH.
  'EXPLORE':   { response: (game) => game.beelineSystem.goExplore() },
  'HEADNORTH': { response: (game) => game.beelineSystem.cast('north') },
  'HEADEAST':  { response: (game) => game.beelineSystem.cast('east') },
  'HEADWEST':  { response: (game) => game.beelineSystem.cast('west') },
  'HEADSOUTH': { response: (game) => game.beelineSystem.cast('south') },
  // ENTERHUT / ENTERCAVE / ENTERMAZE — Beeline to the nearest hut door (a
  // Settlement's closest hut; an opened Cavern when there is no hut), the
  // Cavern door or the Maze door and go in; the EXIT forms (and bare EXIT,
  // above) run to the way out from inside. OPENCAVE breaks the rock hiding a Cavern with a carried
  // Sledgehammer, Onyx Hammer or bomb.
  // ENTER — whichever of those doors is nearest.
  'ENTER':     { response: (game) => game.beelineSystem.enter() },
  'ENTERHUT':  { response: (game) => game.beelineSystem.enterHut() },
  'EXITHUT':   { response: (game) => game.beelineSystem.exitHut() },
  'OPENCAVE':  { response: (game) => game.beelineSystem.openCave() },
  'ENTERCAVE': { response: (game) => game.beelineSystem.enterCave() },
  'EXITCAVE':  { response: (game) => game.beelineSystem.exitCave() },
  'ENTERMAZE': { response: (game) => game.beelineSystem.enterMaze() },
  'EXITMAZE':  { response: (game) => game.beelineSystem.exitMaze() },

  // FIGHT — auto-combat against the nearest enemy until none are left or the next keypress
  // (FightSystem). Silent when it starts; the fight is the answer.
  'FIGHT': { response: (game) => game.fightSystem.cast() },

  // CHOP / MINE / HARVEST — farm the room's Trees (axe), Rocks (pickaxe or
  // hammer), or both and then its grass (any blade) and sand, swapping tools between
  // them, until none are left or the next keypress (HarvestSystem). Silent
  // when it starts.
  'CHOP':    { response: (game) => game.harvestSystem.cast(['tree']) },
  'MINE':    { response: (game) => game.harvestSystem.cast(['rock']) },
  'HARVEST': { response: (game) => game.harvestSystem.cast(['tree', 'rock', 'grass', 'sand']) },

  // CRAFT — one random Recipe from what the player has on hand, REST or
  // EXPLORE (CraftSpellSystem). Silent when it works; the pickup box shows
  // what came of it.
  'CRAFT': { response: (game) => game.craftSpellSystem.cast() },

  // TAKEALL — once the room is safe (no enemies, exits open), every
  // ingredient and item on the player's layer flies to them and is taken,
  // stowed rather than asking for a slot (TakeAllSystem). Silent when it
  // starts; the pull is the answer.
  'TAKEALL': { response: (game) => game.takeAllSystem.cast() },

  // TAKE — the same, for only the nearest ingredient or item. In REST the
  // Satchel counts: taking it opens it and takes what was inside.
  'TAKE': { response: (game) => game.takeAllSystem.cast({ nearestOnly: true }) },

  // TALK — run to the nearest person who speaks and hear their next line
  // (BeelineSystem.talk, DialogueSystem). Silent when it starts.
  'TALK': { response: (game) => game.beelineSystem.talk() },

  // EQUIP — in REST, dress the player from everything stored: three diverse
  // weapons (higher tiers preferred), armor and consumables. Chance is part
  // of each pick, so casting it again tries another loadout (EquipSpellSystem).
  'EQUIP': { response: (game) => game.equipSpellSystem.cast() },

  // GETLAVA / GETWATER / GETMUD — fill the first equipped Empty Bottle from
  // that liquid anywhere in the room the player could walk to, without
  // touching it; GETWATER takes hot water first. GETFAIRY needs no bottle
  // (heal or blessing without one). Silent on success (GetSpellSystem).
  'GETLAVA':  { response: (game) => game.getSpellSystem.cast('lava') },
  'GETWATER': { response: (game) => game.getSpellSystem.cast('water') },
  'GETMUD':   { response: (game) => game.getSpellSystem.cast('mud') },
  'GETFAIRY': { response: (game) => game.getSpellSystem.cast('fairy') },

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
      'ROOM':       _lookRoom,
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

  // ── The Three ────────────────────────────────────────────────────────────────
  //
  // The spell layer's second job: guide the player toward the 3 puzzle, and —
  // inside the 3 room alone — hold a conversation instead of giving observations.
  // These lines are the game's whole voice on the subject: terse, honest,
  // sideways. Canon speaks nowhere else.
  //
  // Key forms are constrained by the 9-char keystroke buffer: each key below is
  // either an exact fit for the phrase with spaces stripped, or the exact
  // 9-char tail the buffer retains once its leading letters shift out:
  //   WHERE ARE YOU   → ...AREYOU      WHAT IS ONE?    → WHATISONE (exact)
  //   WHERE IS ONE?   → HEREISONE      WHAT IS TWO?    → WHATISTWO (exact)
  //   WHERE IS TWO?   → HEREISTWO      WHAT IS THREE?  → ...TISTHREE
  //   WHERE IS THREE? → ...REISTHREE   HOW TO ESCAPE   → ...ESCAPE
  //
  // The WHAT IS entries answer only inside the 3 room (room.isThreeRoom —
  // stamped when the room is built); anywhere else they say nothing happened,
  // matching the registry's existing '...NOTHING.' idiom.

  'AREYOU': { response: 'NORTH.' },
  // ESCAPE / FLEE — drop every weapon and Beeline for REST (BeelineSystem.
  // escape). Outside a room to flee, still the old answer: ONLY ONE WAY.
  'ESCAPE': { response: (game) => game.beelineSystem.escape() },
  'FLEE':   { response: (game) => game.beelineSystem.escape() },

  'HEREISONE':   { response: 'RED.' },
  'HEREISTWO':   { response: 'CYAN.' },
  'REISTHREE':   { response: 'YELLOW.' },

  'WHATISONE': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'ONE IS KNOWN.' : '...NOTHING.',
  },
  'WHATISTWO': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'TWO IS FOUND.' : '...NOTHING.',
  },
  'TISTHREE': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'THREE IS TOLD.' : '...NOTHING.',
  },
};
