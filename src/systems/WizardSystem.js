import { GRID } from '../game/GameConfig.js';
import { WizardNPC } from '../entities/WizardNPC.js';
import { GOLEM_TYPES, GOLEM_CAP } from '../data/golems.js';

// The 3 raw-ingredient pairs that resolve to Mana (see data/recipes.js) —
// hardcoded here rather than derived from RECIPES because
// findRecipeByResult() only returns the first match for a given result char,
// and Summon Golem needs to know about all 3 combos at once.
const MANA_COMBOS = [
  ['j', 'e'], // Jaw + Eye
  ['l', 'r'], // Leaf + Root
  ['d', 'b'], // Dust + Bone
];

/**
 * WizardSystem — operates the red-zone Wizard Hut (feature-inbox).
 *
 * SPACE near the Wizard opens a 2-option menu:
 *   GATHER MATERIALS — names one of the 3 Mana combos at random (re-rolled
 *     every visit), never explaining that the player could brew Mana
 *     themselves — just a want-list.
 *   SUMMON GOLEM — scans the player's held ingredients for a golem
 *     ingredient (Slag/Bottle of Mud/Rock/Metal/Bottle of Magma) the player
 *     also holds a complete Mana pair for, picks one such combo at random,
 *     consumes all 3 items, and — after a brief lightning strike on the
 *     hut's summoning circle (LightningStrikeSystem, same pipeline as the
 *     Lightning Sword) — spawns that golem type. Refuses outright at
 *     GOLEM_CAP or with nothing valid to consume.
 */
export class WizardSystem {
  constructor(game) {
    this.game = game;
    this.npc = null; // the Wizard currently in range — set by handleSpacePress
  }

  /** The Wizard NPC in the active hut interior, if the player is near them. */
  _findNearbyWizard() {
    const game = this.game;
    if (!game.player?.inHut || !game.activeFloor) return null;
    const npc = game.activeFloor.npcs?.find(n => n instanceof WizardNPC);
    if (!npc || !npc.isInRange(game.player)) return null;
    return npc;
  }

  /** SPACE near the Wizard → open the Wizard menu. */
  handleSpacePress() {
    const npc = this._findNearbyWizard();
    if (!npc) return false;
    this.npc = npc;
    this._openMenu();
    return true;
  }

  _openMenu() {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = 'wizard';
    game.selectedMenuIndex = 0;
    game.menuItems = [
      { action: 'gather', label: 'GATHER MATERIALS' },
      { action: 'summon', label: 'SUMMON GOLEM' },
    ];
    game.renderController.menuOverlay.render(game);
    game.menuSystem.closeOnMovement = true;
  }

  /** MenuSystem.selectMenuItem() dispatch — confirmed menu selection. */
  commitSelection(selectedItem) {
    if (selectedItem?.action === 'gather') this._gatherMaterials();
    else if (selectedItem?.action === 'summon') this._summonGolem();
  }

  _gatherMaterials() {
    const game = this.game;
    game.closeMenu();
    const [left, right] = MANA_COMBOS[Math.floor(Math.random() * MANA_COMBOS.length)];
    const leftName = game.getIngredientData(left).name;
    const rightName = game.getIngredientData(right).name;
    this._say(`Bring me a ${leftName} and a ${rightName}. I can put them to good use.`);
  }

  _summonGolem() {
    const game = this.game;
    game.closeMenu();

    if ((game.golems?.length ?? 0) >= GOLEM_CAP) {
      this._say('I already tend all the golems I can manage.');
      return;
    }

    // Every (golem type, Mana combo) pairing the player can currently afford.
    const candidates = [];
    for (const [type, def] of Object.entries(GOLEM_TYPES)) {
      if (game.countIngredient(def.ingredientChar) <= 0) continue;
      for (const [left, right] of MANA_COMBOS) {
        if (game.countIngredient(left) > 0 && game.countIngredient(right) > 0) {
          candidates.push({ type, ingredientChar: def.ingredientChar, left, right });
        }
      }
    }
    if (candidates.length === 0) {
      this._say('Bring me what a golem needs, and I will summon one for you.');
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    game.removeIngredient(pick.ingredientChar);
    game.removeIngredient(pick.left);
    game.removeIngredient(pick.right);
    game.audioSystem?.playSFX?.('craft');

    const circle = game.activeFloor?.wizardCirclePosition;
    game.lightningStrikeSystem?.scheduleStrike({
      x: circle?.x ?? game.player.position.x,
      y: circle?.y ?? game.player.position.y,
      hitsPlayer: false,
      damage: 0,
      onResolve: () => this._resolveSummon(pick.type, circle),
    });
  }

  /** Fires when the telegraphed bolt lands — actually spawns the golem. */
  _resolveSummon(type, circle) {
    const game = this.game;
    const golem = game.companionSystem.spawnGolem(type);
    if (!golem) return;

    // Anchor the new golem to the interior it was actually summoned in —
    // CompanionSystem.spawnGolem defaults to game.currentRoom's exterior
    // collision map, which is wrong while player.inHut (mirrors
    // HutSystem._enterHut's identical resync for game.companion).
    if (game.activeFloor) {
      golem.setCollisionMap(game.activeFloor.collisionMap);
      golem.setBackgroundObjects(game.activeFloor.backgroundObjects);
    }
    if (circle) {
      golem.position.x = circle.x - GRID.CELL_SIZE / 2;
      golem.position.y = circle.y - GRID.CELL_SIZE / 2;
    }

    game.showPickupMessage(GOLEM_TYPES[type].name);
    game.updateUI();
  }

  _say(line) {
    if (this.npc) this.game.dialogueSystem.open(this.npc, [line]);
  }
}
