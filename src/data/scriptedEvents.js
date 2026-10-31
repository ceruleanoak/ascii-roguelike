// Scripted Events — the catalogue ScriptedEventSystem runs (see that file for
// the Event Command set). Each event: { id, actor(game), when(game, actor),
// commands[] }. SPACE beside the actor while `when` holds starts it.
//
// Commands only sequence; anything with rules (brewing, the condenser) is a
// `call` into the system that owns it.

import { HOT_WATER_CHAR } from './alchemy.js';

// The Alchemy Lab is 12×12 (HutSystem): Cauldron Ω at (6,6), Condenser Ψ at
// (2,8). The Alchemist stands at (6,5) — already at the cauldron.
const CAULDRON_SIDE = { col: 6, row: 5 };
const CONDENSER_SIDE = { col: 3, row: 8 };

export const SCRIPTED_EVENTS = [
  {
    // The rescued Alchemist, handed Hot Water, brews in front of the player:
    // the Hot Water purifies a base at the cauldron, the condenser still
    // reads that base, and the Purified Potion is the player's to keep.
    id: 'alchemist_hot_water_demo',
    actor: (game) => game.alchemistNPC,
    when: (game, alchemist) =>
      alchemist.placement === 'hut' && alchemist.lessonGiven && !alchemist.pathUnlocked &&
      game.hutSystem.playerCarriesHotWater(),
    commands: [
      { type: 'say', lines: ["YOU BROUGHT IT. LET'S SEE."] },
      { type: 'take', char: HOT_WATER_CHAR },
      // The Hot Water is paid: the Path is his to give from here, even if
      // the player walks out before the show ends.
      { type: 'setFlag', name: 'alchemistPath' },
      { type: 'call', fn: (game, run) => { run.actor.pathUnlocked = true; } },
      { type: 'moveTo', ...CAULDRON_SIDE },
      { type: 'wait', duration: 0.6 },
      { type: 'call', fn: (game, run) => { run.vars.potion = game.alchemySystem.brewForDemo(); } },
      { type: 'wait', duration: 0.8 },
      { type: 'moveTo', ...CONDENSER_SIDE },
      { type: 'wait', duration: 0.3 },
      { type: 'call', fn: (game, run) => game.alchemySystem.revealPotion(run.vars.potion) },
      { type: 'wait', duration: 2.5 },
      { type: 'moveTo', toPlayer: true },
      { type: 'give', item: (game, run) => run.vars.potion },
      { type: 'say', lines: [
        'HOT WATER PURIFIES THE BASE, YET NOTE THE CONDENSER',
        'LIQUID. BASE. SUPPLEMENT.',
        "THIS IS THE ALCHEMIST'S PATH.",
      ] },
    ],
  },
];
