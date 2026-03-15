import { CharacterNPC } from '../entities/CharacterNPC.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { GRID } from '../game/GameConfig.js';

export class CharacterSystem {
  constructor(game) {
    this.game = game;
  }

  applyCharacterType(type) {
    const game = this.game;
    const charData = CHARACTER_TYPES[type];
    if (!charData) {
      console.error(`Unknown character type: ${type}`);
      return;
    }

    // Switch inventory system to this character's banked inventory
    game.inventorySystem.setActiveCharacter(type);

    // Update player visual
    game.player.color = charData.color;
    game.player.baseColor = charData.color;

    // Update dodge roll properties
    game.player.dodgeRoll.type = charData.rollType;
    game.player.dodgeRoll.duration = charData.rollDuration;
    game.player.dodgeRoll.cooldown = charData.rollCooldown;
    game.player.dodgeRoll.speed = charData.rollSpeed;

    // Apply weapon affinities
    game.player.weaponAffinities = charData.weaponAffinities;

    // Store character type and apply character-specific properties
    game.player.characterType = type;
    game.player.actionCooldownMax = charData.actionCooldownMax || 0;
    game.player.greenIdleDamageBonus = charData.idleDamageBonus || 0;
    game.player.greenCombatDamagePenalty = charData.combatDamagePenalty || 0;
    // Reset green ranger state when switching characters
    game.player.actionCooldown = 0;
    game.player.rollCharge = game.player.actionCooldownMax; // Start with full charge
    game.player.continuousRollActive = false;
  }

  applyGreenDamageModifier(attack) {
    const game = this.game;
    if (!attack) return attack;
    // Green idle/combat bonus is applied at hit time (per-enemy) in CombatSystem.
    // Only bake in shrine/consumable damage bonuses here.
    let bonus = 0;
    if (game.player.damageBonusTimer > 0) bonus += game.player.damageBonusAmount;
    if (bonus === 0) return attack;
    if (Array.isArray(attack)) {
      return attack.map(a => ({ ...a, damage: Math.max(1, (a.damage || 1) + bonus) }));
    }
    return { ...attack, damage: Math.max(1, (attack.damage || 1) + bonus) };
  }

  triggerGreenActionCooldown() {
    const game = this.game;
    if (game.activeCharacterType === 'green' && game.player) {
      game.player.actionCooldown = game.player.actionCooldownMax;
    }
  }

  spawnCharacterNPCs() {
    const game = this.game;
    // Clear existing NPCs
    game.characterNPCs = [];

    const availableCharacters = game.unlockedCharacters.filter(
      type => type !== game.activeCharacterType && !game.deadCharacters.includes(type)
    );

    const centerX = GRID.WIDTH / 2;
    const baseY = GRID.CELL_SIZE * 8;
    const spacing = GRID.CELL_SIZE * 4;

    availableCharacters.forEach((type, index) => {
      const offsetX = (index - (availableCharacters.length - 1) / 2) * spacing;
      const npc = new CharacterNPC(type, centerX + offsetX, baseY);
      game.characterNPCs.push(npc);
    });
  }

  swapWithCharacter(newType) {
    const game = this.game;
    if (newType === game.activeCharacterType) {
      return;
    }

    if (game.deadCharacters.includes(newType)) {
      game.showPickupMessage('This character has already died');
      return;
    }

    game.activeCharacterType = newType;
    game.applyCharacterType(newType);

    game.spawnCharacterNPCs();

    const charData = CHARACTER_TYPES[newType];
    game.showPickupMessage(charData.name);
  }
}
