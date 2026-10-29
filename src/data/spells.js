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

/** The question every confirmed wish asks: which wish this would spend. */
function _wishQuestion(game) {
  if (!game.wishSystem?.hasWish(game)) return 'NO WISHES LEFT.';
  return `USE ${_wishOrdinal(game.wishesUsed)} WISH?`;
}

const WISH_YES = ['YES', 'Y', 'AYE', 'SURE', 'DO'];
const WISH_NO  = ['NO', 'NAY', 'CANCEL', 'STOP'];

/**
 * Builds a Wish Spell: a word whose cast spends a wish
 * (claudedocs/three-voice-plan.md §8–9).
 *
 *   kind     — 'power' | 'influence' | 'gain' (the Wish Kind; stamped as `wish`)
 *   refusal  — optional (game) => string|null. A string answers instead of the
 *              wish question and asks nothing (no wish is spent).
 *   granted  — the THREE's line when the wish is confirmed
 *   effect   — (game) => void, run after WishSystem.spend took the wish
 *
 * The cast asks `USE NTH WISH?`; YES/Y/AYE/SURE/DO spends the wish and runs the
 * effect, NO/NAY/CANCEL/STOP cancels.
 */
function wishSpell(kind, { refusal = null, granted = 'WISH GRANTED.', effect }) {
  const grant = {
    text: granted,
    action: (game) => { if (game.wishSystem?.spend(game)) effect(game); },
  };
  return {
    wish: kind,
    response: (game) => refusal?.(game) || _wishQuestion(game),
    followUpsActive: (game) => !refusal?.(game) && game.wishSystem?.hasWish(game),
    followUps: _wishAnswers(grant),
  };
}

/** The wish question's answers: every YES word grants, every NO word cancels. */
function _wishAnswers(grant) {
  return {
    ...Object.fromEntries(WISH_YES.map(w => [w, grant])),
    ...Object.fromEntries(WISH_NO.map(w => [w, 'SPELL CANCELLED.'])),
  };
}

// PURGE (and its old name, CLEANSE) — clears the room of every enemy and
// projectile. EXPLORE only.
const PURGE_SPELL = wishSpell('power', {
  refusal: (game) =>
    game.stateMachine?.getCurrentState() === GAME_STATES.EXPLORE ? null : '...NOTHING.',
  effect: (game) => game.wishSystem.executePurge(game),
});

// HEAL / UNCURSE — lift the frog polymorph.
function _cureSpell(healthyLine) {
  return wishSpell('power', {
    refusal: (game) => (game.player?.polymorphed ? null : healthyLine),
    granted: 'THE CURSE LIFTS.',
    effect: (game) => game.polymorphSystem?.cureViaWish(game),
  });
}

/** Response for REVIVE — fires immediately without confirmation. */
function _reviveResponse(game) {
  if (!game.wishSystem?.hasWish(game)) return 'NO WISHES LEFT.';
  return 'WISH GRANTED.';
}

/** Action fired immediately on REVIVE. */
function _grantRevive(game) {
  game.wishSystem?.executeRevive(game);
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
  return _wishQuestion(game);
}

function _buildBridgeAction(game) {
  if (!game.ridgeSystem?.canBuild()) return;
  if (game.ridgeSystem._checkMaterials().sufficient) {
    game.ridgeSystem.buildBridgeViaSpell();
  } else if (game.wishSystem?.spend(game)) {
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

// COMMAND near an NPC is an Influence Wish Spell instead (InfluenceSystem):
// the wish question, then YES takes the NPC as the companion. Away from NPCs
// it asks for a true name, as CALL does. The true names stay answerable after
// the wish question; YES/NO never collide with one.
const COMMAND_SPELL = {
  wish: 'influence',
  response: (game) => {
    if (!game.influenceSystem.commandTarget()) return 'COMMAND WHOM?';
    return game.influenceSystem.commandRefusal() || _wishQuestion(game);
  },
  followUps: {
    ...COMMAND_FOLLOWUPS,
    ..._wishAnswers((game) => game.influenceSystem.command()),
  },
};


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

// Spell Sign pool — the spell words a Spell Sign may write in the earth
// (roomSigns.js). No-unlock spells only; EXITGAME / CLOSEGAME / CLOSE never
// belong here. A Cursed Run writes Wish Spells instead (wishSpellNames below).
export const SPELL_SIGN_SPELLS = ['LOOKHERE', 'TAKEALL', 'GOREST', 'HARVEST', 'FIGHT'];

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

  // BRIDGE — the Ridge's Completion Spell. Free when the materials are on
  // hand; otherwise it costs a wish.
  'BRIDGE': {
    wish: 'gain',
    response: _bridgeResponse,
    followUpsActive: (game) =>
      game.currentRoom?.type === ROOM_TYPES.RIDGE &&
      !game.currentRoom?.bridgeBuilt &&
      (game.ridgeSystem?._checkMaterials().sufficient || game.wishSystem?.hasWish(game)),
    followUps: {
      'YES':    { action: _buildBridgeAction },
      'Y':      { action: _buildBridgeAction },
      'AYE':    { action: _buildBridgeAction },
      'NO':     'SPELL CANCELLED.',
      'NAY':    'SPELL CANCELLED.',
      'CANCEL': 'SPELL CANCELLED.',
    },
  },

  // Wish Spells (wishSpell above; claudedocs/three-voice-plan.md §8).
  'PURGE':   PURGE_SPELL,
  'CLEANSE': PURGE_SPELL,
  'HEAL':    _cureSpell('NOTHING AILS YOU.'),
  'UNCURSE': _cureSpell('NO CURSE FOUND.'),

  // Completion Spells (Gain): one per room letter, each completing its room
  // through the system that owns it (three-voice-plan.md §8, GAIN table).
  // X, the Crossroads: the χ-blade comes up without its chain (#478).
  'XCAVATE': wishSpell('gain', {
    refusal: (game) => (game.chiBladeSystem?.canExcavate() ? null : '...NOTHING.'),
    effect: (game) => game.chiBladeSystem.excavate(),
  }),

  // Influence Spells: one word, acting differently on each NPC
  // (InfluenceSystem; three-voice-plan.md §8, INFLUENCE).
  // PERSUADE: the nearest NPC's transaction, without its cost.
  'PERSUADE': wishSpell('influence', {
    refusal: (game) => game.influenceSystem.persuadeRefusal(),
    granted: 'AS YOU WISH.',
    effect: (game) => game.influenceSystem.persuade(),
  }),

  // CHARM / SLEEP: every enemy in the room, until the room is left / until struck.
  'CHARM': wishSpell('influence', {
    refusal: (game) => game.influenceSystem.roomRefusal(),
    effect: (game) => game.influenceSystem.charmRoom(),
  }),
  'SLEEP': wishSpell('influence', {
    refusal: (game) => game.influenceSystem.roomRefusal(),
    effect: (game) => game.influenceSystem.sleepRoom(),
  }),

  'REVIVE': {
    wish: 'power',
    response: _reviveResponse,
    action: (game) => {
      if (game.stateMachine?.getCurrentState() === GAME_STATES.GAME_OVER) _grantRevive(game);
    },
  },

  'CONTINUE': {
    wish: 'power',
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
  // (CommandSystem: permanent charm, max three, boss-tier refuses). COMMAND
  // also takes an NPC, for a wish (COMMAND_SPELL above).
  'CALL': {
    response: 'CALL WHOM?',
    followUps: COMMAND_FOLLOWUPS,
  },

  'COMMAND': COMMAND_SPELL,

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
  // GOREST / REST / GOHOME — south is the way back to REST, so in EXPLORE
  // each is GOSOUTH.
  'GOREST':    { response: (game) => game.beelineSystem.goRest() },
  'REST':      { response: (game) => game.beelineSystem.goRest() },
  'GOHOME':    { response: (game) => game.beelineSystem.goRest() },
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

  // CHOP / MINE / HARVEST / OPEN — farm the room's Trees (axe), Rocks
  // (pickaxe or hammer), or its containers (Barrels, Chests, Crates, Metal
  // Boxes, opened by hand); HARVEST opens the containers first, then does
  // trees and rocks, then its grass (any blade) and sand, swapping tools
  // between them, until none are left or the next keypress (HarvestSystem).
  // Silent when it starts.
  'CHOP':    { response: (game) => game.harvestSystem.cast(['tree']) },
  'MINE':    { response: (game) => game.harvestSystem.cast(['rock']) },
  'OPEN':    { response: (game) => game.harvestSystem.cast(['container']) },
  'HARVEST': { response: (game) => game.harvestSystem.cast(['container', 'tree', 'rock', 'grass', 'sand']) },

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
  // HELLO / GREET / SPEAK are TALK under other names. In the Three Room, where
  // no one stands to run to, the Three answers each itself (ThreeVoiceSystem).
  'TALK':  { response: (game) => game.beelineSystem.talk() },
  'SPEAK': { response: (game) => game.beelineSystem.talk() },
  'HELLO': { response: (game) => game.beelineSystem.talk() },
  'GREET': { response: (game) => game.beelineSystem.talk() },

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
  //   WHO IS ONE?     → WHOISONE       WHO IS TWO?     → WHOISTWO
  //   WHO IS THREE?   → ...HOISTHREE
  //
  // Each sacred item is pinned by register → color → provenance, never named
  // (claudedocs/three-voice-plan.md §4). The WHAT IS and WHO IS entries answer only inside the 3 room (room.isThreeRoom —
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
  // GIVE — the Three Room's trade (ThreeVoiceSystem). The Three asks which
  // Wish Kind; the answer spends a wish, cracks that kind's slot and is told
  // a Wish Spell's name. GIVE itself carries no `wish` field: it is the one
  // wish word the room answers by acting.
  'GIVE': {
    response: (game) => game.threeVoiceSystem.giveQuestion(),
    followUpsActive: (game) => game.threeVoiceSystem.canGive(),
    followUps: {
      'POWER':     (game) => game.threeVoiceSystem.give('power'),
      'INFLUENCE': (game) => game.threeVoiceSystem.give('influence'),
      'GAIN':      (game) => game.threeVoiceSystem.give('gain'),
      'NO':        '...',
      'NAY':       '...',
    },
  },

  'WHOISONE': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'IT HITS BACK.' : '...NOTHING.',
  },
  'WHOISTWO': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'IT READS.' : '...NOTHING.',
  },
  'HOISTHREE': {
    response: (game) =>
      game.currentRoom?.isThreeRoom ? 'IT FILLS.' : '...NOTHING.',
  },
};

/**
 * Every Wish Spell's name, one per spell — an alias that shares its entry with
 * another word (CLEANSE is PURGE) is listed by its first name only. With a
 * kind, only that Wish Kind's. Derived from SPELLS, so a new Wish Spell joins
 * GIVE's answers and the Cursed Spell Sign pool by existing.
 * @param {'power'|'influence'|'gain'} [kind]
 * @returns {string[]}
 */
export function wishSpellNames(kind) {
  const seen = new Set();
  const names = [];
  for (const [word, spell] of Object.entries(SPELLS)) {
    if (!spell.wish || (kind && spell.wish !== kind) || seen.has(spell)) continue;
    seen.add(spell);
    names.push(word);
  }
  return names;
}
