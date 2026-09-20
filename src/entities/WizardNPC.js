import { NeutralCharacter } from './NeutralCharacter.js';

/**
 * WizardNPC — red-zone Wizard Hut resident who summons golems.
 *
 * Deliberately has no getDialogueLines() — DialogueSystem.tryOpenNearby()
 * skips any NPC lacking that method, so SPACE near this NPC is owned
 * entirely by WizardSystem and never opens a plain dialogue box. Mirrors
 * Shopkeeper's identical convention.
 */
export class WizardNPC extends NeutralCharacter {
  constructor(x, y) {
    super('z', '#cc88ff', x, y);
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
