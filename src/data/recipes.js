// Crafting recipes (hidden from player - pure discovery)
// Format: [leftItem, rightItem] -> resultItem

export const RECIPES = [
  // Basic weapon upgrades
  { left: '¬', right: 'M', result: '⌂', name: 'Shotgun' },       // Gun + Metal = Shotgun
  { left: '†', right: 'F', result: '‡', name: 'Flame Sword' },   // Sword + Fire = Flame Sword
  { left: '|', right: '~', result: ')', name: 'Bow' },           // Stick + String = Bow
  { left: '|', right: '|', result: '/', name: 'Staff' },         // Stick + String = Staff
  { left: 'M', right: '|', result: '¬', name: 'Gun' },         // Stick + Metal = Gun


  // Dual wielding
  { left: '¬', right: '¬', result: 'X', name: 'Dual Pistols' },  // Gun + Gun = Dual Pistols

  // Armor/defense
  { left: 'b', right: 'g', result: 'O', name: 'Slime Suit' },    // Bone + Goo = Slime Suit
  { left: 'b', right: 'b', result: 'A', name: 'Bone Armor' },    // Bone + Bone = Bone Armor


  // Consumables
  { left: 'F', right: 'g', result: '@', name: 'Bomb' },          // Fire + Goo = Bomb
  { left: 'm', right: 'F', result: 'H', name: 'Health Potion' }, // Meat + Fire = Health Potion

  // Advanced weapons
  { left: '†', right: 's', result: '⌘', name: 'Dragon Blade' },  // Sword + Scale = Dragon Blade
  { left: ')', right: 'F', result: '⟩', name: 'Fire Bow' },      // Bow + Fire = Fire Bow
  { left: 'b', right: 'M', result: '⊤', name: 'Bone Axe' },      // Bone + Metal = Bone Axe

  // Utility
  { left: 'f', right: '~', result: 'R', name: 'Rope' },          // Fur + String = Rope
  { left: 't', right: '|', result: '↑', name: 'Spear' },         // Teeth + Stick = Spear

  // Secret recipes
  { left: 's', right: 's', result: '♦', name: 'Dragon Heart' },  // Scale + Scale = Dragon Heart
  { left: 'g', right: 'g', result: '●', name: 'Slime Bomb' },    // Goo + Goo = Slime Bomb (trap)
  { left: 'w', right: 'w', result: '∞', name: 'Wings' },         // Wing + Wing = Wings (speed boost)

  // === GREEN GAP RECIPES (early game common ingredients) ===
  { left: 'm', right: 'm', result: 'ᒧ', name: 'Meat Jerky' },    // Meat + Meat = Meat Jerky (heal 2)
  { left: 'b', right: 'b', result: 'ᐧ', name: 'Bone Dust' },     // Bone + Bone = Bone Dust (panic blind)
  { left: 'f', right: 'f', result: 'ᐤ', name: 'Fur Cloak' },     // Fur + Fur = Fur Cloak (auto-dodge)
  { left: 't', right: 't', result: 'ᑕ', name: 'Tooth Necklace' }, // Teeth + Teeth = Tooth Necklace (+1 dmg)

  // More combinations
  { left: 'M', right: 'M', result: '■', name: 'Metal Block' },   // Metal + Metal = Metal Block

  // Item upgrades - use existing items to create better versions
  { left: '⌂', right: 's', result: '☼', name: 'Dragon Shotgun' }, // Shotgun + Scale = Dragon Shotgun
  { left: '‡', right: 's', result: '⚔', name: 'Legendary Flame Sword' }, // Flame Sword + Scale = Legendary
  { left: 'X', right: 'M', result: '※', name: 'Heavy Pistols' },  // Dual Pistols + Metal = Heavy Pistols
  { left: '⌘', right: 'g', result: '☠', name: 'Venom Blade' },    // Dragon Blade + Goo = Venom Blade
  { left: '⟩', right: 'w', result: '⇒', name: 'Sky Bow' },        // Fire Bow + Wing = Sky Bow
  { left: '⊤', right: 'b', result: '⚒', name: 'Bone Crusher' },   // Bone Axe + Bone = Bone Crusher

  // New ingredient combinations
  { left: 'w', right: 'F', result: '✦', name: 'Phoenix Feather' }, // Wing + Fire = Phoenix Feather
  { left: 's', right: 'M', result: 'K', name: 'Dragon Scale Armor' }, // Scale + Metal = Dragon Scale Armor
  { left: 'g', right: 'M', result: '♠', name: 'Acid Blade' },     // Goo + Metal = Acid Blade
  { left: 'b', right: 'F', result: '☠', name: 'Cursed Skull' },   // Bone + Fire = Cursed Skull
  { left: 'm', right: '~', result: '♥', name: 'Heart' },          // Meat + String = Heart
  { left: 'c', right: 'F', result: '★', name: 'Lucky Coin' },     // Coin + Fire = Lucky Coin

  // === NEW GUN RECIPES (10) ===
  { left: '⌂', right: 'g', result: '⌐', name: 'Machine Gun' },     // Shotgun + Goo = Machine Gun
  { left: '¬', right: 'g', result: '❄', name: 'Freeze Ray' },      // Gun + Goo = Freeze Ray
  { left: '¬', right: 'F', result: 'ϟ', name: 'Lightning Gun' },   // Gun + Fire = Lightning Gun
  { left: '⌂', right: 'F', result: '⊕', name: 'Rocket Launcher' }, // Shotgun + Fire = Rocket Launcher
  { left: '¬', right: 's', result: '═', name: 'Plasma Rifle' },    // Gun + Scale = Plasma Rifle
  { left: '⌐', right: 'F', result: '◙', name: 'Laser Cannon' },    // Machine Gun + Fire = Laser Cannon
  { left: '⌂', right: 'M', result: '⊞', name: 'Scatter Gun' },     // Shotgun + Metal = Scatter Gun
  { left: 'X', right: 'g', result: '☣', name: 'Venom Pistol' },    // Dual Pistols + Goo = Venom Pistol
  { left: '¬', right: 'w', result: '╬', name: 'Stun Gun' },        // Gun + Wing = Stun Gun
  { left: '※', right: 'M', result: '⊿', name: 'Ricochet Rifle' },  // Heavy Pistols + Metal = Ricochet Rifle

  // === NEW MELEE RECIPES (10) ===
  { left: '⊤', right: 'g', result: '☃', name: 'Ice Hammer' },      // Bone Axe + Goo = Ice Hammer
  { left: '~', right: '~', result: '≋', name: 'Whip' },            // String + String = Whip
  { left: 'M', right: '~', result: '○', name: 'Flail' },           // Metal + String = Flail
  { left: '†', right: 'm', result: '╫', name: 'Blood Sword' },     // Sword + Meat = Blood Sword
  { left: '⊤', right: 'F', result: '⚯', name: 'Thunder Axe' },     // Bone Axe + Fire = Thunder Axe
  { left: '⊤', right: '@', result: '◉', name: 'Exploding Mace' },  // Bone Axe + Bomb = Exploding Mace
  { left: '↑', right: 'w', result: '╪', name: 'Stun Baton' },      // Spear + Wing = Stun Baton
  { left: '‡', right: 'm', result: '♣', name: 'Vampire Dagger' },  // Flame Sword + Meat = Vampire Dagger
  { left: '⚒', right: 'M', result: '▼', name: 'Earthquake Hammer' }, // Bone Crusher + Metal = Earthquake Hammer
  { left: '⌘', right: 'F', result: '◇', name: 'Chaos Blade' },     // Dragon Blade + Fire = Chaos Blade

  // === NEW BOW RECIPES (8) ===
  { left: ')', right: 'g', result: '❅', name: 'Ice Bow' },         // Bow + Goo = Ice Bow
  { left: ')', right: '~', result: '⋙', name: 'Multi-Shot Bow' },  // Bow + String = Multi-Shot Bow
  { left: ')', right: '@', result: '⊛', name: 'Explosive Bow' },   // Bow + Bomb = Explosive Bow
  { left: ')', right: 'w', result: '◈', name: 'Homing Bow' },      // Bow + Wing = Homing Bow
  { left: ')', right: 'M', result: '⇶', name: 'Piercing Bow' },    // Bow + Metal = Piercing Bow
  { left: '⟩', right: 'F', result: '≈', name: 'Chain Bow' },       // Fire Bow + Fire = Chain Bow
  { left: ')', right: 's', result: '⋰', name: 'Split Bow' },       // Bow + Scale = Split Bow
  { left: '⇒', right: 'F', result: '⋯', name: 'Burst Bow' },       // Sky Bow + Fire = Burst Bow

  // === SHIELD RECIPES ===
  { left: 'k', right: 'b', result: 'S', name: 'Shield' },          // Silk + Bone = Shield
  { left: 'k', right: 'M', result: 'U', name: 'Tower Shield' },    // Silk + Metal = Tower Shield

  // === TRAP RECIPES ===
  // One-time traps
  { left: 'f', right: 'M', result: '[', name: 'Freeze Trap' },     // Fur + Metal = Freeze Trap
  { left: 'M', right: 'c', result: '{', name: 'Stun Trap' },       // Metal + Coin = Stun Trap
  { left: '~', right: 'F', result: '^', name: 'Fire Trap' },       // String + Fire = Fire Trap
  { left: 'w', right: 'm', result: ';', name: 'Sleep Bomb' },      // Wing + Meat = Sleep Bomb
  { left: 'c', right: 's', result: "'", name: 'Charm Lure' },      // Coin + Scale = Charm Lure
  // Persistent placeables
  { left: 'c', right: '~', result: '"', name: 'Music Box' },       // Coin + String = Music Box
  { left: 'b', right: '~', result: ':', name: 'Noise-maker' },     // Bone + String = Noise-maker
  { left: 'M', right: 'F', result: ']', name: 'Tesla Coil' },      // Metal + Fire = Tesla Coil
  { left: 'g', right: '~', result: ',', name: 'Goo Dispenser' },   // Goo + String = Goo Dispenser

  // === NEW ARMOR RECIPES (7) ===
  { left: 'f', right: '~', result: 'L', name: 'Leather Armor' },   // Fur + String = Leather Armor
  { left: 'M', right: '~', result: '⛓', name: 'Chain Mail' },      // Metal + String = Chain Mail
  { left: 'k', right: 'F', result: 'R', name: 'Robe' },            // Silk + Fire = Robe
  { left: 'M', right: 'b', result: 'W', name: 'Warplate' },        // Metal + Bone = Warplate
  { left: 'k', right: 'v', result: 'N', name: 'Ninja Garb' },      // Silk + Venom = Ninja Garb
  { left: 'a', right: 'M', result: 'E', name: 'Ember Cloak' },     // Ash + Metal = Ember Cloak
  { left: 'g', right: 's', result: 'I', name: 'Ice Plate' }        // Goo + Scale = Ice Plate
];

export function findRecipe(leftChar, rightChar) {
  // Try both orderings
  let recipe = RECIPES.find(r => r.left === leftChar && r.right === rightChar);
  if (!recipe) {
    recipe = RECIPES.find(r => r.left === rightChar && r.right === leftChar);
  }
  return recipe;
}

export function getRecipeResult(leftChar, rightChar) {
  const recipe = findRecipe(leftChar, rightChar);
  return recipe ? recipe.result : null;
}

export function findRecipeByResult(resultChar) {
  const recipe = RECIPES.find(r => r.result === resultChar);
  return recipe ? { left: recipe.left, right: recipe.right } : null;
}
