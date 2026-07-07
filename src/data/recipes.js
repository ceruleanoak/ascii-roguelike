// Crafting recipes (hidden from player - pure discovery)
// Format: [leftItem, rightItem] -> resultItem

export const RECIPES = [
  // === MANA CONVERSIONS (skeletal/organ/nature ingredients → raw mana) ===
  // Future use: mana flasks in consumable slots for magic builds
  { left: 'j', right: 'e', result: '𝑚', name: 'Mana' },  // Jaw + Eye    (creature essence)
  { left: 'l', right: 'r', result: '𝑚', name: 'Mana' },  // Leaf + Root  (nature essence)
  { left: 'd', right: 'b', result: '𝑚', name: 'Mana' },  // Dust + Bone  (remains)

  // === ROCK RECIPES ===
  { left: '0', right: '0', result: '⊿', name: 'Axe head' },       // Rock + Rock = Axe head
  { left: '⊿', right: '0', result: '△', name: 'Arrowhead' },      // Axe head + Rock = Arrowhead
  { left: '0', right: '|', result: '⊥', name: 'Hammer' },        // Rock + Stick = Hammer
  { left: '⊥', right: '⊥', result: '⟘', name: 'Maul' },          // Hammer + Hammer = Maul (radial knockback; explicit so T1 never slot-machines)
  { left: '⊥', right: '⬧', result: '⬢', name: 'Onyx Hammer' },   // Hammer + Onyx = Onyx Hammer (crit + faster windup)
  { left: '0', right: '~', result: '⊸', name: 'Sling' },         // Rock + String = Sling
  { left: '|', right: '△', result: '⇈', name: 'Fletch of Arrows' }, // Stick + Arrowhead = Fletch of Arrows
  { left: '⊿', right: '|', result: '⊦', name: 'Axe' },           // Axe head + Stick = Axe (distinct ingredients now — no slot-order clash with Fletch)
  { left: '/', right: '△', result: '↑', name: 'Spear' },         // Staff + Arrowhead = Spear

  // Basic weapon upgrades
  { left: '¬', right: 'M', result: 'ᛉ', name: 'Shotgun' },       // Gun + Metal = Shotgun
  { left: '†', right: 'F', result: '‡', name: 'Flame Sword' },   // Sword + Fire = Flame Sword
  { left: 'F', right: '|', result: '♨', name: 'Torch' },         // Fire Essence + Stick = Torch
  { left: 'o', right: '|', result: '♨', name: 'Torch' },         // Oil + Stick = Torch (alt)
  { left: '†', right: '†', result: '⫯', name: 'Longsword' },     // Sword + Sword = Longsword
  { left: '|', right: '~', result: ')', name: 'Bow' },           // Stick + String = Bow
  { left: '|', right: '|', result: '/', name: 'Staff' },         // Stick + Stick = Staff
  { left: '/', right: '/', result: 'Ⲯ', name: 'Thick Staff' },   // Staff + Staff = Thick Staff
  { left: 'Ⲯ', right: 'Ⲯ', result: '¡', name: 'Bat' },           // Thick Staff + Thick Staff = Bat (windup slugger)
  { left: 'g', right: '|', result: '‖', name: 'Rubber Bat' },    // Goo + Stick = Rubber Bat (0 dmg, launch only)
  { left: '¡', right: 'M', result: '⸘', name: 'Metal Bat' },     // Bat + Metal = Metal Bat (double damage)
  { left: 'M', right: '|', result: '↾', name: 'Dagger' },      // Metal + Stick = Dagger

  // === GEM WANDS (Staff + gemstone) ===
  { left: '/', right: '◈', result: '⚝', name: 'Ruby Staff' },     // Staff + Ruby
  { left: '/', right: '⬨', result: '⚹', name: 'Sapphire Staff' }, // Staff + Sapphire
  { left: '/', right: '◇', result: '⚶', name: 'Topaz Staff' },    // Staff + Topaz
  { left: '/', right: '⬧', result: '⚸', name: 'Onyx Staff' },     // Staff + Onyx
  { left: '/', right: '⬦', result: '⚘', name: 'Emerald Staff' },  // Staff + Emerald
  { left: '/', right: '⬥', result: '⚭', name: 'Garnet Staff' },   // Staff + Garnet
  { left: '/', right: '⧫', result: '⚳', name: 'Force Wand' },    // Staff + Diamond

  // === GEM WHIPS (Whip + gemstone) — magic-infused whipcrack ===
  { left: '≋', right: '◈', result: '∿', name: 'Ruby Whip' },      // Whip + Ruby     = burn lash
  { left: '≋', right: '⬨', result: '≀', name: 'Sapphire Whip' },  // Whip + Sapphire = freeze lash
  { left: '≋', right: '◇', result: '⤳', name: 'Topaz Whip' },     // Whip + Topaz    = electric stun lash
  { left: '≋', right: '⬦', result: '∽', name: 'Emerald Whip' },   // Whip + Emerald  = poison lash


  // Dual wielding
  { left: '¬', right: '¬', result: 'X', name: 'Dual Pistols' },  // Gun + Gun = Dual Pistols
  { left: '¬', right: 'b', result: 'ƒ', name: "Fester's Gun" }, // Gun + Bone = Fester's Gun

  // Armor/defense
  { left: 'b', right: 'g', result: '𐤌', name: 'Slime Suit' },    // Bone + Goo = Slime Suit
  { left: 'b', right: 'b', result: '𐤔', name: 'Bone Armor' },    // Bone + Bone = Bone Armor


  // Consumables
  { left: 'F', right: 'g', result: '@', name: 'Bomb' },          // Fire + Goo = Bomb
  { left: 'm', right: 'F', result: 'H', name: 'Health Potion' }, // Meat + Fire = Health Potion
  { left: 'y', right: 'y', result: '@', name: 'Bomb' },           // Firecracker + Firecracker = Bomb
  { left: 'G', right: 'm', result: 'H', name: 'Health Potion' },  // Base Potion + Meat = Health Potion
  { left: 'G', right: 'w', result: 'q', name: 'Haste Draught' },  // Base Potion + Wing = Haste Draught
  { left: 'G', right: 'b', result: 'x', name: 'Stone Skin' },     // Base Potion + Bone = Stone Skin
  { left: 'G', right: 't', result: 'u', name: 'Battle Elixir' },  // Base Potion + Teeth = Battle Elixir
  { left: 'G', right: 'h', result: 'z', name: 'Mending Brew' },   // Base Potion + Herb = Mending Brew
  { left: 'G', right: '𝑚', result: '🜛', name: 'Mana Potion' },   // Base Potion + Mana = Mana Potion

  // Purified Potion true-potion recipes — same results as Base Potion;
  // AlchemySystem stamps the buffed potionModifier onto the result instance.
  { left: '🜅', right: 'm', result: 'H', name: 'Health Potion' },
  { left: '🜅', right: 'w', result: 'q', name: 'Haste Draught' },
  { left: '🜅', right: 'b', result: 'x', name: 'Stone Skin' },
  { left: '🜅', right: 't', result: 'u', name: 'Battle Elixir' },
  { left: '🜅', right: 'h', result: 'z', name: 'Mending Brew' },

  // Unstable Potion true-potion recipes — same results as Base Potion;
  // AlchemySystem stamps the unstable potionModifier onto the result instance.
  { left: '🜆', right: 'm', result: 'H', name: 'Health Potion' },
  { left: '🜆', right: 'w', result: 'q', name: 'Haste Draught' },
  { left: '🜆', right: 'b', result: 'x', name: 'Stone Skin' },
  { left: '🜆', right: 't', result: 'u', name: 'Battle Elixir' },
  { left: '🜆', right: 'h', result: 'z', name: 'Mending Brew' },

  // Advanced weapons
  { left: '†', right: 's', result: 'ᛖ', name: 'Dragon Blade' },  // Sword + Scale = Dragon Blade
  { left: ')', right: 'F', result: '⟩', name: 'Fire Bow' },      // Bow + Fire = Fire Bow
  { left: 'b', right: 'M', result: '⊤', name: 'Bone Axe' },      // Bone + Metal = Bone Axe

  // Utility
  { left: 'f', right: '~', result: '𐤄', name: 'Robe' },          // Fur + String = Rope
  { left: 't', right: '|', result: '↑', name: 'Spear' },         // Teeth + Stick = Spear
  { left: '↑', right: 'v', result: '↟', name: 'Venom Lance' },  // Spear + Venom = Venom Lance
  { left: '↑', right: 'j', result: 'ⲯ', name: 'Trident' },      // Spear + Jaw = Trident (jaw-bone prongs)
  { left: '↑', right: 'M', result: '⇑', name: 'War Spear' },    // Spear + Metal = War Spear
  { left: '/', right: 'M', result: 'Ƨ', name: 'Scythe' },        // Staff + Metal = Scythe (long handle + curved blade)

  // Secret recipes
  { left: 's', right: 's', result: '♦', name: 'Dragon Heart' },  // Scale + Scale = Dragon Heart
  { left: 'g', right: 'g', result: '●', name: 'Slime Bomb' },    // Goo + Goo = Slime Bomb (trap)
  { left: 'w', right: 'w', result: '∞', name: 'Wings' },         // Wing + Wing = Wings (speed boost)

  // === GREEN GAP RECIPES (early game common ingredients) ===
  { left: 'm', right: 'm', result: 'ᒧ', name: 'Meat Jerky' },    // Meat + Meat = Meat Jerky (heal 2)
  { left: 'b', right: 'a', result: 'ᐧ', name: 'Bone Dust' },     // Bone + Ash = Bone Dust (panic blind)
  { left: 'f', right: 'f', result: 'ᐤ', name: 'Fur Cloak' },     // Fur + Fur = Fur Cloak (auto-dodge)
  { left: 't', right: 't', result: 'ᑕ', name: 'Tooth Necklace' }, // Teeth + Teeth = Tooth Necklace (+1 dmg)
  { left: '❦', right: '❦', result: '𐤒', name: 'Moss Cloak' },    // Moss + Moss = Moss Cloak (stealth bush transform)

  // More combinations
  { left: 'M', right: 'M', result: '¬', name: 'Gun' },           // Metal + Metal = Gun

  // Item upgrades - use existing items to create better versions
  { left: 'ᛉ', right: 's', result: 'ᚲ', name: 'Dragon Shotgun' }, // Shotgun + Scale = Dragon Shotgun
  { left: '‡', right: 's', result: '⚔', name: 'Legendary Flame Sword' }, // Flame Sword + Scale = Legendary
  { left: '‡', right: 'a', result: 'ᚠ', name: 'Lava Sword' },             // Flame Sword + Ash = Lava Sword
  { left: 'X', right: 'M', result: 'ᚷ', name: 'Heavy Pistols' },  // Dual Pistols + Metal = Heavy Pistols
  { left: 'ᛖ', right: 'g', result: 'ᛡ', name: 'Venom Blade' },    // Dragon Blade + Goo = Venom Blade
  { left: '⟩', right: 'w', result: '⇒', name: 'Sky Bow' },        // Fire Bow + Wing = Sky Bow
  { left: '⊤', right: 'b', result: '⚒', name: 'Bone Crusher' },   // Bone Axe + Bone = Bone Crusher

  // New ingredient combinations
  { left: 'w', right: 'F', result: '✦', name: 'Phoenix Feather' }, // Wing + Fire = Phoenix Feather
  { left: 's', right: 'M', result: '𐤓', name: 'Dragon Scale Armor' }, // Scale + Metal = Dragon Scale Armor
  { left: '↾', right: 'g', result: 'ᚢ', name: 'Acid Blade' },     // Dagger + Goo = Acid Blade
  { left: 'b', right: 'F', result: '☠', name: 'Cursed Skull' },   // Bone + Fire = Cursed Skull
  { left: 'm', right: '~', result: '♥', name: 'Heart' },          // Meat + String = Heart
  { left: 'c', right: 'F', result: '★', name: 'Lucky Coin' },     // Coin + Fire = Lucky Coin
  { left: 'a', right: 'c', result: '¤', name: 'Infused Coin' },   // Ash + Coin = Infused Coin (offering for Well)

  // === NEW GUN RECIPES (10) ===
  { left: 'ᛉ', right: 'j', result: '⌐', name: 'Machine Gun' },     // Shotgun + Goo = Machine Gun
  { left: '¬', right: '⬨', result: 'ᛁ', name: 'Freeze Ray' },      // Gun + Sapphire = Freeze Ray
  { left: '¬', right: 'F', result: '↯', name: 'Lightning Gun' },   // Gun + Fire = Lightning Gun
  { left: 'ᛉ', right: 'F', result: '⟰', name: 'Rocket Launcher' }, // Shotgun + Fire = Rocket Launcher
  { left: '¬', right: 's', result: 'ᛞ', name: 'Plasma Rifle' },    // Gun + Scale = Plasma Rifle
  { left: '⌐', right: 'F', result: 'ᛋ', name: 'Laser Cannon' },    // Machine Gun + Fire = Laser Cannon
  { left: 'ᛉ', right: 'M', result: 'ᚺ', name: 'Scatter Gun' },     // Shotgun + Metal = Scatter Gun
  { left: 'X', right: 'g', result: 'ᚦ', name: 'Venom Pistol' },    // Dual Pistols + Goo = Venom Pistol
  { left: '¬', right: 'w', result: 'ᚾ', name: 'Stun Gun' },        // Gun + Wing = Stun Gun
  { left: 'ᚷ', right: 'M', result: 'ᚱ', name: 'Ricochet Rifle' },  // Heavy Pistols + Metal = Ricochet Rifle

  // === NEW MELEE RECIPES (10) ===
  { left: '⊤', right: '⬨', result: 'ᛜ', name: 'Ice Hammer' },      // Bone Axe + Sapphire = Ice Hammer
  { left: '~', right: '~', result: '≋', name: 'Whip' },            // String + String = Whip
  { left: 'j', right: '~', result: '○', name: 'Flail' },           // Jaw + String = Flail
  { left: '⊤', right: 'F', result: 'ᚨ', name: 'Thunder Axe' },     // Bone Axe + Fire = Thunder Axe
  { left: '⊤', right: '@', result: '✺', name: 'Exploding Mace' },  // Bone Axe + Bomb = Exploding Mace
  { left: '↑', right: 'w', result: '⌁', name: 'Stun Baton' },      // Spear + Wing = Stun Baton
  { left: '‡', right: 'm', result: 'ᛘ', name: 'Vampire Dagger' },  // Flame Sword + Meat = Vampire Dagger
  { left: '⚒', right: 'M', result: '⏚', name: 'Earthquake Hammer' }, // Bone Crusher + Metal = Earthquake Hammer
  { left: 'ᛖ', right: 'F', result: 'ᛠ', name: 'Chaos Blade' },     // Dragon Blade + Fire = Chaos Blade

  // === NEW BOW RECIPES (8) ===
  { left: ')', right: '⬨', result: 'ᛇ', name: 'Ice Bow' },         // Bow + Sapphire = Ice Bow
  { left: ')', right: ')', result: '⋙', name: 'Multi-Shot Bow' },  // Bow + Bow = Multi-Shot Bow
  { left: ')', right: '@', result: 'ᛒ', name: 'Explosive Bow' },   // Bow + Bomb = Explosive Bow
  { left: ')', right: 'w', result: 'ᛟ', name: 'Homing Bow' },      // Bow + Wing = Homing Bow
  { left: ')', right: 'M', result: 'ᛏ', name: 'Piercing Bow' },    // Bow + Metal = Piercing Bow
  { left: '⟩', right: 'F', result: 'ᛚ', name: 'Chain Bow' },       // Fire Bow + Fire = Chain Bow
  { left: ')', right: 's', result: 'ᛃ', name: 'Split Bow' },       // Bow + Scale = Split Bow
  { left: '⇒', right: 'F', result: 'ᛈ', name: 'Burst Bow' },       // Sky Bow + Fire = Burst Bow

  // === SHIELD RECIPES ===
  { left: 'k', right: 'b', result: 'S', name: 'Shield' },          // Silk + Bone = Shield
  { left: 'k', right: 'M', result: 'U', name: 'Tower Shield' },    // Silk + Metal = Tower Shield

  // === TRAP RECIPES ===
  // One-time traps
  { left: 'i', right: 'M', result: '[', name: 'Freeze Trap' },     // Ice + Metal = Freeze Trap
  { left: 'M', right: 'c', result: '{', name: 'Stun Trap' },       // Metal + Coin = Stun Trap
  { left: '~', right: 'F', result: '^', name: 'Fire Trap' },       // String + Fire = Fire Trap
  { left: 'w', right: 'm', result: ';', name: 'Sleep Bomb' },      // Wing + Meat = Sleep Bomb
  { left: 'f', right: '|', result: '∩', name: 'Snare Trap' },      // Fur + Stick = Snare Trap (permanently roots a beast)
  { left: 'c', right: 's', result: "'", name: 'Charm Lure' },      // Coin + Scale = Charm Lure
  // Persistent placeables
  { left: 'c', right: '~', result: '"', name: 'Music Box' },       // Coin + String = Music Box
  { left: 'b', right: '~', result: ':', name: 'Noise-maker' },     // Bone + String = Noise-maker
  { left: 'M', right: 'F', result: ']', name: 'Tesla Coil' },      // Metal + Fire = Tesla Coil
  { left: '|', right: 'w', result: '↩', name: 'Boomerang' },       // Stick + Wing = Boomerang
  { left: 'g', right: '~', result: '⌇', name: 'Sticky Tripline' }, // Goo + String = Sticky Tripline

  // === ARMOR UPGRADES (basic ingredient + base armor) ===
  { left: '𐤀', right: '~', result: '𐤅', name: 'Stitched Vest' },        // Fur Vest + String = Stitched Vest
  { left: '𐤌', right: 'b', result: '𐤎', name: 'Reinforced Slime Suit' }, // Slime Suit + Bone = Reinforced Slime Suit
  { left: '𐤔', right: 'f', result: '𐤊', name: 'Padded Bone Armor' },     // Bone Armor + Fur = Padded Bone Armor

  // === NEW ARMOR RECIPES (7) ===
  { left: 'f', right: 'b', result: '𐤂', name: 'Leather Armor' },   // Fur + Bone = Leather Armor
  { left: 'M', right: '~', result: '⛓', name: 'Chain Mail' },      // Metal + String = Chain Mail
  { left: 'k', right: 'F', result: '𐤄', name: 'Robe' },            // Silk + Fire = Robe
  { left: 'M', right: 'b', result: '𐤆', name: 'Warplate' },        // Metal + Bone = Warplate
  { left: 'k', right: 'v', result: '𐤏', name: 'Ninja Garb' },      // Silk + Venom = Ninja Garb
  { left: 'a', right: 'M', result: '𐤉', name: 'Ember Cloak' },     // Ash + Metal = Ember Cloak
  { left: 'i', right: 's', result: '𐤍', name: 'Ice Plate' },       // Ice + Scale = Ice Plate
  { left: 'ł', right: 'f', result: '𐤖', name: 'Bloom Mantle' },    // Pollen + Fur = Bloom Mantle (on-hit pollen smoke screen)

  // === INFUSED ROBES (Robe + elemental gemstone) ===
  { left: '𐤄', right: '⬨', result: '𐤇', name: 'Frost Robe' },   // Robe + Sapphire = Frost Robe
  { left: '𐤄', right: '◈', result: '𐤋', name: 'Flame Robe' },   // Robe + Ruby     = Flame Robe
  { left: '𐤄', right: '◇', result: '𐤈', name: 'Storm Robe' },   // Robe + Topaz    = Storm Robe
  { left: '𐤄', right: '⬥', result: '𐤁', name: 'Blood Robe' },   // Robe + Garnet   = Blood Robe
  { left: '𐤄', right: '⬦', result: '𐤐', name: 'Emerald Robe' }, // Robe + Emerald  = Emerald Robe
  { left: '𐤄', right: '⬧', result: '𐤃', name: 'Shadow Robe' },  // Robe + Onyx     = Shadow Robe
  { left: '𐤄', right: 's', result: '⊛', name: 'Whirlwind Cape' }, // Robe + Scale    = Whirlwind Cape

  // === FISHING ===
  { left: '/', right: '~', result: 'ߒ', name: 'Fishing Pole' },  // Staff + String = Fishing Pole

  // === UTILITY ===
  { left: 'w', right: 'f', result: 'ѡ', name: 'Floating Boots' }, // Wing + Fur = Floating Boots

  // === BLUE-ZONE ARMOR (water-only mechanics) ===
  { left: 'p', right: 'n', result: '∆', name: 'Shark Mask' },       // Pearl Shard + Sharkbone = Shark Mask
  { left: 'p', right: 'C', result: '𐤕', name: 'Coral Crown' },      // Pearl Shard + Coral Cluster = Coral Crown
  { left: 'p', right: 'Y', result: '⚲', name: 'Stingray Mantle' },  // Pearl Shard + Stingray Barb = Stingray Mantle

  // Charged Potion true-potion recipes (from Charged Starter '!');
  // AlchemySystem stamps the charge potionModifier onto the result instance.
  { left: '!', right: 'm', result: 'H', name: 'Health Potion' },
  { left: '!', right: 'w', result: 'q', name: 'Haste Draught' },
  { left: '!', right: 'b', result: 'x', name: 'Stone Skin' },
  { left: '!', right: 't', result: 'u', name: 'Battle Elixir' },
  { left: '!', right: 'h', result: 'z', name: 'Mending Brew' },

  // Burning Potion true-potion recipes (from Burning Starter '«');
  // AlchemySystem stamps the burn potionModifier onto the result instance.
  { left: '«', right: 'm', result: 'H', name: 'Health Potion' },
  { left: '«', right: 'w', result: 'q', name: 'Haste Draught' },
  { left: '«', right: 'b', result: 'x', name: 'Stone Skin' },
  { left: '«', right: 't', result: 'u', name: 'Battle Elixir' },
  { left: '«', right: 'h', result: 'z', name: 'Mending Brew' },

  // Primal Potion true-potion recipes (from Primal Starter '∿');
  // AlchemySystem stamps the primal potionModifier onto the result instance.
  { left: '∿', right: 'm', result: 'H', name: 'Health Potion' },
  { left: '∿', right: 'w', result: 'q', name: 'Haste Draught' },
  { left: '∿', right: 'b', result: 'x', name: 'Stone Skin' },
  { left: '∿', right: 't', result: 'u', name: 'Battle Elixir' },
  { left: '∿', right: 'h', result: 'z', name: 'Mending Brew' },

  // Jolt Jar: charged potion + coin
  { left: '!', right: 'c', result: 'J', name: 'Jolt Jar' },          // Charged Potion + Coin

  // Spectacles (⊙) are not craftable. Obtained by clearing a Maze (M room) —
  // breaking every cover object and collecting every dropped ingredient —
  // without ever letting one blink out into a ghost. See MazeSystem.js.
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
