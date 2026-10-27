# Dungeon Recipes — draft per zone

Status: **Yellow, Red, Cyan and Gray are drafts for you to revise** (dungeon rework plan, Phase 6). Green is the shipped design. The data lives in `src/data/dungeon/recipes/<zone>.json`, and `npm run check:graphs` checks 500 seeded graphs per recipe (all five pass today).

Each zone's recipe is built from the same vocabulary (GLOSSARY: Dungeon Recipe, Floor Kind, Reveal, Hidden Descent), so a recipe can only vary:

- the corridor count,
- the chain/triangle weight (a triangle's loop is the bypass around the Skull Key),
- which kind of floor the Trap Room hangs off,
- the chance of a Hidden Descent and which Reveals may open it,
- the chance the Skull Key's door gets a gate-rock alternative (`keyGate.pushChance`).

## Placeholders (same in every draft)

- **`branchPuzzle: "panels"`**: every zone still uses Green's floor-panel NPC puzzle to reach the Pyramid. Each zone's own sub-solve is still to be designed (out of scope for the rework). The slot is reserved, so swapping a zone's puzzle in only means adding a new Reveal and changing this one field.
- **`boss: "green"`**: every Vault still holds the Hoardmaw (ADR backlog row 61).

## Summary

| Zone | Corridors | Chain : triangle | Trap Room hangs off | Hidden Descent | Reveals that open it | Gate rock |
|------|-----------|------------------|---------------------|----------------|----------------------|-----------|
| Green (shipped) | 1-3 | 1 : 1 | Branch or corridor | 0.5 | clear, triggers | 0.33 |
| Yellow (draft) | 2-3 | 1 : 3 | corridor or Branch | 0.6 | triggers | 0.2 |
| Red (draft) | 1-2 | 3 : 1 | corridor | 0.5 | clear | 0.5 |
| Cyan (draft) | 2-3 | 2 : 1 | Branch | 0.75 | triggers | 0.33 |
| Gray (draft) | 3 | chain only | corridor or Branch | 0 | — | 0 |

## Yellow — Storm / Channel

The draft reads chaos and energy through the routing:

- **Triangle-heavy (1 : 3).** The way through is a loop with more than one answer, so the route is co-created rather than set.
- **Hidden Descents open on `triggers` only.** A Mage's shortcut comes from working the room (its switches, panels and torches), not from emptying it.
- **A rare gate rock (0.2).** Brute force isn't the Mage's verb.

Sample (seed 29):

```
entrance ─E→ corridor1 ─E→ corridor2 ─E→ branch ─N/panels→ pyramid ─E/offering→ vault
             corridor1 ─N/key→ branch                (the triangle: the key is the shortcut)
             corridor1 ─W→ trapRoom
             corridor1 ─NE*/push→ branch             (gate rock beside the key door)
                         corridor2 ─N→ trial
                         corridor2 ─NW*/triggers→ trapRoom
```

## Red — Reaction / React

The draft is short and direct; the world comes at you:

- **Mostly a straight line (3 : 1), 1-2 corridors.** The fewest floors before the fight.
- **The Trap Room hangs off a corridor only.** The gauntlet sits on the way in, not tucked behind the Branch.
- **Hidden Descents open on `clear` only.** The shortcut is earned by winning the fight.
- **Gate rock at 0.5.** Red's Vault wall already "gives to brute force" (planning inbox, Push Rock solves), so shoving your way past the key fits.
- **Side effect:** a 1-corridor Red visit never rolls a Hidden Descent, because that corridor already leads to the Branch, the Trial and the Trap Room. Raise the corridor minimum to 2 if Red should always have a chance at one.

Sample (seed 3):

```
entrance ─E→ corridor1 ─E/key→ branch ─W/panels→ pyramid ─W/offering→ vault
             corridor1 ─N→ trial
             corridor1 ─W→ trapRoom
             corridor1 ─NE*/push→ branch
```

## Cyan — Stillness / Anticipate

The draft rewards seeing what the hurried miss:

- **The highest Hidden Descent chance (0.75), opened by `triggers` only.** The most secrets, and you find them by reading the room, not by fighting.
- **2-3 corridors, mostly a chain (2 : 1).** A longer walk where the payoff is the shortcut you noticed.
- **The Trap Room hangs off the Branch.** It's a deliberate choice deep in the dungeon, not something you stumble into.

Sample (seed 29):

```
entrance ─E→ corridor1 ─E→ corridor2 ─E→ branch ─N/panels→ pyramid ─E/offering→ vault
             corridor1 ─N/key→ branch
             corridor1 ─NE*/push→ branch
                         corridor2 ─N→ trial
                         corridor2 ─NW*/triggers→ trapRoom
                                                 branch ─W→ trapRoom
```

## Gray — Death / the terminus

The draft offers no way around anything:

- **Always 3 corridors in a chain.**
- **No Hidden Descent and no gate rock.** The only way past the Skull Key's door is the key.
- This matches Gray's "takes everything equally" and its `hardMode`/`noRest`. If it reads as plain tedium instead, the first knob to turn is a small `diagonals.chance` on `clear`.

Sample (seed 3):

```
entrance ─E→ corridor1 ─W→ corridor2 ─E→ corridor3 ─E/key→ branch ─W/panels→ pyramid ─N/offering→ vault
             corridor1 ─E→ trapRoom
                                         corridor3 ─N→ trial
```

`*` marks a Hidden Descent: drawn as bare floor until its Reveal fires. Unmarked edges are `open` unless a Reveal is named.
