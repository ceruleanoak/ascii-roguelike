// Frog Lines — what each speaker says to a polymorphed (frog) player, in place
// of its usual speech. Every line hints at the cure (the lake, still water, a
// kiss) without naming who waits there; the Witch's line is the exception —
// she is the one who cursed you, and telling it releases you
// (Witch.onFrogLineTold).
//
// Keyed by speaker class. A speaker missing here says nothing to a frog.
// Read only by DialogueSystem.frogSpacePress().
import { AlchemistNPC } from '../entities/AlchemistNPC.js';
import { BridgeWorker } from '../entities/BridgeWorker.js';
import { Charon } from '../entities/Charon.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';
import { FairyKing } from '../entities/FairyKing.js';
import { Fisherman } from '../entities/Fisherman.js';
import { FriendlyGoblin } from '../entities/FriendlyGoblin.js';
import { Hatter } from '../entities/Hatter.js';
import { Jeweler } from '../entities/Jeweler.js';
import { PuzzleSpirit } from '../entities/PuzzleSpirit.js';
import { Shopkeeper } from '../entities/Shopkeeper.js';
import { Storyteller } from '../entities/Storyteller.js';
import { WeaponsMaster } from '../entities/WeaponsMaster.js';
import { WiseFellow } from '../entities/WiseFellow.js';
import { Witch } from '../entities/Witch.js';
import { WizardNPC } from '../entities/WizardNPC.js';

export const FROG_LINES = new Map([
  [Witch,           'I should eat you up for entering my hut, but instead work for me. Bring me the heart of the Maw of Greed.'],
  [Fisherman,       'Talking frogs, now. Throw yourself back in the lake. Something down there kisses the lost ones.'],
  [WeaponsMaster,   'No blade fits that grip. Go find the lake; what sings there breaks worse curses than yours.'],
  [Hatter,          'A frog at my table! Hop along to the lake, dear. One cold kiss and you\'ll be late for tea again.'],
  [Storyteller,     'Ah, the oldest tale. The frog goes down to the deep water, and the one who waits there gives the kiss.'],
  [PuzzleSpirit,    'A curse is a lock. The lake keeps its key.'],
  [BridgeWorker,    'Can\'t build for a frog. Ask the lake. Something in it has a soft spot for your kind.'],
  [AlchemistNPC,    'No tonic undoes that. Only lake water, and whoever lives beneath it.'],
  [FairyKing,       'My fairies mend wounds, not witchcraft. Seek the lake, little one.'],
  [FriendlyGoblin,  'Hah! Ribbit! ...Go jump in a lake. No, really.'],
  [Charon,          'I ferry souls, not frogs. The lake will take you as you are.'],
  [ErrandCharacter, 'Can\'t send a frog on errands. Go soak in the lake until somebody kisses you.'],
  [WiseFellow,      'Every frog in every story is waiting on a kiss. Look for still water.'],
  [Shopkeeper,      'No frogs in the shop. Take it up with the lake.'],
  [Jeweler,         'A frog with no fingers for a ring. The lake has a kiss that fixes that.'],
  [WizardNPC,       'Hedge-witch work. It comes undone where the water is deepest.'],
]);
