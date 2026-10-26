// Camp NPC sayings — the C-room mercenary's campfire talk, told one per SPACE
// when the player has no coin to offer (a coin still buys the zone's wise
// saying; CampNPCSystem.handleSpacePress). Read only by CampNPC.getDialogueLines.
//
// Folk wisdom about getting by out there, not instructions: each line points
// at something the world really does and leaves the doing to the player.
// Every line must stay TRUE — when a mechanic below changes, change its line.
//   Tinder           — TinderSystem (blade swing splits a ground Stick; fire lights it)
//   Tree / Bush wood — InteractionSystem axe gate on 'Y'; Bush dropEffect Stick
//   Fire cooking     — FireplaceSystem (Grain → Bread, Meat → Meat Jerky,
//                      Sand → Empty Bottle, Ore → Metal 30%, Sticks → Ash/Fire Essence)
//   Torch-lit hearth — FireplaceSystem.update (Torch/Lantern in any quick slot)
//   Water            — PhysicsSystem (wet clears burn, washes Oil off; electrified
//                      water shocks; deep water drowns), PlayerDodgeRollSystem
//                      (no roll in deep water)
//   Bread            — Sandwich recipe (Bread + Meat); CompanionSystem rat taming
//   Tall Grass       — flammability 'high'
export const CAMP_NPC_SAYINGS = [
  'SPLIT A STICK WHERE IT LIES, THEN GIVE IT A SPARK. THAT IS A CAMP.',
  'A TREE KEEPS ITS WOOD FROM ANYTHING BUT AN AXE.',
  'BREAK ENOUGH BUSHES AND ONE WILL GIVE YOU A STICK.',
  'GIVE A FIRE YOUR GRAIN AND IT GIVES YOU BREAD.',
  'THE FIRE MAKES JERKY OF ANY MEAT YOU BRING IT.',
  'SAND GOES INTO A FIRE AND COMES OUT A BOTTLE.',
  'ORE IN THE FLAMES. MOSTLY SLAG. NOW AND THEN, METAL.',
  'FEED A FIRE STICKS AND NOW AND THEN IT GIVES SOMETHING BACK.',
  'CARRY A TORCH AND A COLD HEARTH LIGHTS ITSELF AS YOU PASS.',
  'IF YOU CATCH FIRE, FIND WATER.',
  'WATER TAKES THE OIL RIGHT OFF A BLADE.',
  'WHEN LIGHTNING IS ABOUT, KEEP YOUR FEET DRY.',
  'WHERE THE WATER RUNS DARK, YOUR BREATH RUNS OUT.',
  'NOBODY ROLLS IN DEEP WATER.',
  'BREAD AND MEAT MAKE A MEAL.',
  'A RAT THAT EATS YOUR BREAD IS YOUR RAT.',
  'TALL GRASS CATCHES QUICK. MIND WHERE YOU BURN.'
];
