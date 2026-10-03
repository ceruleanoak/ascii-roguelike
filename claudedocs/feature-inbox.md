# Feature Inbox

Quick-capture list for feature/content ideas noticed during play/dev, before they've been triaged. Add a line, no format friction.

**This is a work queue, not a ledger.** It holds only unimplemented ideas — nothing else. The moment an idea is built (or deliberately dropped), delete its line — don't mark it, don't archive it here. If it needs a durable record instead, that's `docs/adr/` (architecturally significant decisions) or a `claudedocs/*.md` design doc — this file must not duplicate either.

Just one idea per line below, plain text.
tower shield should have a new variable that deflects charge attacks, stunning the enemy. This is a new type of check that is in the loop where the player would take damage. Parry exists as an exclusive enemy mechanic, but it should be available to the player as well. So Parry and Deflect (protects against charging enemies) and Arrow Guard (protects against arrows) all fall into this category of check.
Add accessory "field guide", which is crafted from two "Paper" ingredients, which can only be dropped by humanoid enemies and crafted using the press (slurry).
Sand + furnace system gives "empty bottle".
"Cursed Run" should unlock a new secret crafting menu of cursed items, like Cursed Skull. Cursed recipes are dropped by all undead enemies as Rare. 
"Cursed Belt" only appears on a cursed run. It doubles (rounded down when hitting level limit per zone) the level progression from each exit. e.g. L1 -> L3 -> L5
Add "Charon" NPC. When you go to REST, the North Exit closes (once you are above L1), and Charon stands before the exit. You must interact with him, and his dialogue will say "YOUR BURDEN IS NOT LIGHT. LET ME CARRY IT FOR YOU. HAHAHA!" and proceeds to remove (visually) random ingredients from your inventory equal to the current ingredient count divided by 3, rounded up. Charon will always take coins first. He does not take treasures. After taking his pay, he disappears and the exit re-opens.
Zone color changes should only be offered on levels in a multiple of 3 such as L3 and L6. However, this logic is overridden in zone-completion scenarios and shortcuts/warps.
Dragon Heart is equipped as a consumable, but falls in a class that is passive effect, is not consumed. Is destroyed in HP hits 0 (even if revied/saved). Check if there are other candidates for this kind, there should probably be a lower tier of this same effect that is one ingredient for Dragon Heart. Heart is too powerful and fits this in name, so rework and pass the current "Heart Effect" to a "Fairy King in a Bottle" (1 in every 100 fairies is a king, is a deeper color pink)
Frog Coin only offers damage boost when player is wet.
Increase red well cost (5 coins), need a wise man clue for this. And Well text should be "NO RESPONSE" for the first 4 coins and "YOUR PERSISTENCE IS REWARDED" for the buff.
Tooth Necklace doesn't do anything "damageBonus" isn't tooled. It should be a +5% crit chance
In red, lava hazard % of room should increase incrementally at the same 3 counts as enemy difficulty. In yellow, thunder strike frequency and amounts of ponds and streams should increase to a similar degree. In cyan, amount of ice and deep snow should increase.
Rework enemy spawns for red, yellow, cyan to account for the L3 and L6 gates (zone caps at 10)
Scales are OP, they should not work in the generic crafting table and require the Dragon Forge, found in the B room of Green Zone after defeating the Goo Dragon, which should drop some scales. Search for current "scale" drops and significantly pair them down to match their epic equivalency.
If you throw your only weapon, create an animated/cycling dotted line towards the nearest dropped weapon, encouraging a pickup. If there are no weapons available, render a blinking arrow that points to rest with the words CRAFT rendered instead of REST.