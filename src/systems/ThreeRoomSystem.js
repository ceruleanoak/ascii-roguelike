import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { captureDeath } from './DeathLedgerSystem.js';
import { ITEM_TYPES } from '../data/items.js';
import { STREAK_BARRICADES } from '../data/barricades.js';

/**
 * ThreeRoomSystem — the source room, its offerings, and what the door lets out.
 *
 * Discovery paths (both route into the neutral `threeRoom` script):
 *   Accidental — three consecutive north traversals. The streak counts real
 *                exits taken; any east/west/south move or REST entry breaks it.
 *   Inevitable — once per run, gray depth 3 replaces the north exit's letter
 *                with '3' (stamped by ExitSystem.generateExits; the exit
 *                object carries `threeRoom: true`, which the north-exit block
 *                in main.js intercepts).
 *
 * Division of labor inside the room: the neutral script builds the static
 * geometry (the slot cluster, the shut door); this system owns everything
 * alive — the offerings placed into the slots, the music that thickens with
 * each one, the gate on the door, and the staged arrival of Death behind it.
 * ThreeSlotGlobeSystem owns only the choosing; the judging is here.
 *
 * Contact routes through _resolveContactDeath(), which keeps REVIVE/CONTINUE
 * (the wish-cheat the Voice tempts) live exactly as for any other death.
 */

// North traversals in a row before the world runs out.
const NORTH_STREAK_TRIGGER = 3;

// ── The Barricade ───────────────────────────────────────────────────────────
//
// Insisting north three times is the ask; insisting is not enough. The second
// north is barricaded with rocks and the third with Petrified Trees, so the
// source is reached carrying a hammer and an axe or it is not reached at all.
// Keyed to the streak the run is already holding — one Barricade per room
// standing between the first north and the last.
//
// Nothing here is generous, and that is deliberate: the approach can ask for a
// tool the run never found, the same way the Globe of Offerings can only hand
// back glyphs the run actually touched. What it asks for is no longer fixed,
// though — the exit letter's colour picks the family, so a green north asks for
// a craft gate's answer instead of an axe, and only a colour with no family of
// its own (gray, and red until its gates are authored) still falls back to the
// rocks and Petrified Trees this streak was built around. The gray '3' exit is
// the one that matters for the inevitable path, and gray always falls back.
//
// The materials and the stamp itself live in BarricadeSystem and the barricades
// catalogue now — a Barricade is a general shape, and this streak is only one
// of the things that raises one. What stays here is the streak, because the
// streak is what this system knows.

// Death — behind the shut door, beyond naming. Printable ASCII per the
// encoding rule; the room around it does the implying.
//
// NOTE: '&' was the original pick and is wrong — it is live scatter
// vegetation (RoomGenerator organic weights, a crow perch, swept by
// SecretEventSystem), so Death rendered as a glyph the player walks past all
// run. '¥' is unclaimed by any background object, enemy, or item. This is a
// naming call flagged for the user; the constant is the only place to change.
const DEATH_CHAR = '¥';
const DEATH_COLOR = '#dddddd';

// Slower than the player's walk on purpose — but the room is sealed the
// moment the door opens, so the pace only decides how long the player has to
// watch it come, not whether they get away. It never stops following.
const DEATH_SPEED = 62;
// Contact distance for the kill — inside a cell's shadow.
const DEATH_KILL_RADIUS = GRID.CELL_SIZE * 0.55;

// ── The offering ────────────────────────────────────────────────────────────
//
// Each slot answers to one register of the Power of 3 and accepts only that
// register's FORM. Getting the form wrong is what curses the run; getting it
// right is merely permitted.
//
//   top   — Instinct    — a weapon
//   left  — Experience  — armor
//   right — Convention  — a consumable
//
// Two whole-set readings sit on top of that, and the order they are tested in
// is load-bearing. The true 3 is a strict INSTANCE of the power trio's form
// pattern (Hammer is a weapon, Spectacles are armor, Mana Potion is a
// consumable), so it satisfies both rules at once — test identity first or
// the south answer can never fire.
//
//   power trio  (any weapon / any armor / any consumable) — feeds the Voice,
//                opens the way north, and what stands there is Death.
//   the true 3  (these three items exactly) — liberates the path south of
//                REST: the run ends by permission rather than by dying.
const SLOT_FORMS = [ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR, ITEM_TYPES.CONSUMABLE];
const TRUE_THREE = ['⊥', '⊙', '🜛'];   // Hammer (top) / Spectacles (left) / Mana Potion (right)

const SLOT_COUNT = 3;

// Filled slots hold the offered glyph. A refused one keeps it too — grayed,
// inside a cracked frame — so the mistake stays legible instead of being
// replaced by a generic crack mark. The frame is drawn by ThreeRoomRenderer.
const SLOT_CRACKED_COLOR = '#5a5a5a';

// What comes up when a slot cracks. Far enough out to ring the whole cluster
// rather than crowd it, and few enough that a second crack visibly doubles it.
const CURSE_RISE_COUNT = 5;
const CURSE_RISE_RADIUS = GRID.CELL_SIZE * 4.5;

// The room's three loops. The music thickens as offerings land — one track
// per stage, swapped at the loop boundary so the change lands on the beat.
const MUSIC_TRACKS = ['three-1.mp3', 'three-2.mp3', 'three-3.mp3'];

// ── The Death cinematic ─────────────────────────────────────────────────────
//
// Opening the door used to spawn Death inside its own kill radius: the player
// pressed SPACE from interaction range, Death appeared at the door, and the
// kill landed inside a quarter second — nothing was ever seen. It is staged
// now. The darkening uses the game's stepped-fade idiom (ScreenFadeSystem's
// quantized opacity), not a smooth ramp.
const DARKEN_STEPS = 5;
const DARKEN_STEP_MS = 240;
// Death stands at the edge of the dark before it starts walking.
const ARRIVAL_HOLD_MS = 900;

export class ThreeRoomSystem {
  constructor() {
    this._northStreak = 0;
    this.cinematic = null;
  }

  // ── Discovery: N×3 ──────────────────────────────────────────────────────────

  /**
   * Record a north traversal. Returns true on the traversal that summons the
   * source room (the caller warps there instead of generating deeper); the
   * streak consumes itself so wandering back and insisting again can re-find it.
   *
   * A Cursed run is never answered. The streak still counts — insisting north
   * is not what the curse takes away — but the world has stopped replying, so
   * the third north is just another room.
   */
  recordNorthTraversal(game) {
    this._northStreak += 1;
    if (game?.cursedRun) return false;
    if (this._northStreak >= NORTH_STREAK_TRIGGER) {
      this._northStreak = 0;
      return true;
    }
    return false;
  }

  /** Any non-north step forgets the insistence. */
  breakStreak() {
    this._northStreak = 0;
  }

  /**
   * The Barricade this run's north streak asks for, or null if it asks for
   * none. BarricadeSystem calls this for every room the world builds and
   * decides what to do with the answer; the streak count is this system's to
   * know, and the stamping is not.
   */
  streakBarricade() {
    return STREAK_BARRICADES[this._northStreak] || null;
  }

  /** Full run-scoped reset — death/title. */
  hardReset() {
    this.breakStreak();
    this.cinematic = null;
  }

  // ── The offerings ───────────────────────────────────────────────────────────

  /** The room's slot objects in register order: top, left, right. */
  _slots(room) {
    const found = [];
    for (const obj of room?.backgroundObjects || []) {
      if (typeof obj.threeSlot === 'number') found[obj.threeSlot] = obj;
    }
    return found;
  }

  /** Every slot holds an offering — right or wrong. This is the door's gate. */
  _allFilled(room) {
    const slots = this._slots(room);
    return slots.length === SLOT_COUNT && slots.every(s => s?.threeFilled);
  }

  /**
   * SPACE near a slot (dispatched from main.js's NEUTRAL branch). Hands off to
   * the globe, which owns the choosing; placement comes back to placeOffering.
   * @returns {boolean} true when the press was consumed
   */
  handleSlotPress(game, slot) {
    return game.threeSlotGlobeSystem.open(slot);
  }

  /**
   * An offering lands. Writes the glyph into the slot, judges its form, and
   * thickens the music. Judging the whole set waits until all three are in.
   */
  placeOffering(game, slot, char, data) {
    const room = game.currentRoom;
    if (!slot || slot.threeFilled) return;

    slot.threeFilled = true;
    slot.threeOffering = char;

    const wanted = SLOT_FORMS[slot.threeSlot];
    const correctForm = !!data && data.type === wanted;

    if (correctForm) {
      slot.char = char;
      slot.animationChar = char;
      slot.color = data.color || '#ffffff';
      slot.animationColor = slot.color;
    } else {
      // Refused. The offering stays where it was put, drained of its color
      // inside a cracked frame — the run has to keep looking at it.
      slot.threeCracked = true;
      slot.char = char;
      slot.animationChar = char;
      slot.color = SLOT_CRACKED_COLOR;
      slot.animationColor = SLOT_CRACKED_COLOR;

      // The crack is the curse. It lands on the wrong placement, not on the
      // finished set — the remaining two slots can still be filled and the
      // door still opens, but the run is already owed.
      this._beginCurse(game, room);
    }

    this._advanceMusic(game, room);
    game.renderer.markBackgroundDirty();
  }

  /**
   * A slot cracked, so the run is Cursed from here on.
   *
   * Two things happen and they are separate on purpose. The flag is the one
   * the rest of the game reads — the world stops offering this room, REST
   * starts decaying, EXPLORE starts going gray — and it is set exactly once,
   * because a second wrong offering does not curse an already-cursed run any
   * harder. The Undead are the visible half, and they DO come up again with
   * every crack: three refused slots means three rings of them, so the room
   * shows how much was gotten wrong without anyone being told.
   *
   * They rise around the cluster rather than around the one bad slot. What was
   * refused is the offering, but what is answering is the object.
   */
  _beginCurse(game, room) {
    if (!game.cursedRun) {
      game.cursedRun = true;
      console.log('☠️ The run is Cursed.');
    }

    const { x, y } = this._clusterCenter(room);
    game.undeadSystem.rise(game, x, y, CURSE_RISE_COUNT, { radius: CURSE_RISE_RADIUS });
  }

  /** Middle of the slot cluster, read off the slots so it follows the layout. */
  _clusterCenter(room) {
    const slots = this._slots(room).filter(Boolean);
    if (!slots.length) return { x: GRID.WIDTH / 2, y: GRID.HEIGHT / 2 };
    let sx = 0, sy = 0;
    for (const s of slots) { sx += s.position.x; sy += s.position.y; }
    return { x: sx / slots.length, y: sy / slots.length };
  }

  /**
   * The whole-set reading, once every slot holds an offering. Identity is
   * tested before form — see the TRUE_THREE comment for why the order matters.
   * @returns {'true-three'|'power-trio'|'refused'}
   */
  readOffering(room) {
    const slots = this._slots(room);
    if (slots.length !== SLOT_COUNT || !slots.every(s => s?.threeFilled)) return 'refused';
    if (slots.some(s => s.threeCracked)) return 'refused';

    if (slots.every((s, i) => s.threeOffering === TRUE_THREE[i])) return 'true-three';
    return 'power-trio';
  }

  // ── Music ───────────────────────────────────────────────────────────────────

  /** Track index for the room's current state: one per offering landed. */
  _musicStage(room) {
    const filled = this._slots(room).filter(s => s?.threeFilled).length;
    return Math.min(filled, MUSIC_TRACKS.length - 1);
  }

  _trackPath(idx) {
    return `${import.meta.env.BASE_URL}assets/audio/${MUSIC_TRACKS[idx]}`;
  }

  /**
   * Entering the room takes the music over. Mono track filling both dual-layer
   * slots with the bassline muted — the same override MazeSystem uses, which
   * keeps the zone-music graph intact so leaving can hand it straight back.
   * Called from enterNeutralState; no-ops in every other room.
   */
  onRoomEnter(game) {
    const room = game.currentRoom;
    if (!room?.isThreeRoom) return;
    if (!game.audioSystem.isZoneMusicActive()) return;

    const track = this._trackPath(this._musicStage(room));
    game.audioSystem.switchMusic(track, track)
      .then(() => game.audioSystem.setLayer2Enabled(false));
  }

  /**
   * An offering landed — move to the next loop. Swapped at the loop boundary
   * so the change lands on the beat rather than cutting the current bar off;
   * the three bounces are the same length, so the boundary lines up exactly.
   */
  _advanceMusic(game, room) {
    if (!game.audioSystem.isZoneMusicActive()) return;
    const track = this._trackPath(this._musicStage(room));
    game.audioSystem.switchMusicAtLoopEnd(track, track)
      .then(() => game.audioSystem.setLayer2Enabled(false));
  }

  /**
   * Leaving hands the zone its music back. Forced, because the override above
   * never touched currentMusicZone (same reason MazeSystem forces it).
   * Called from the neutral-room exit path.
   */
  onRoomExit(game, room) {
    if (!room?.isThreeRoom) return;

    // The cinematic seals this room, so leaving mid-scene is not reachable
    // from inside it — but a wish-revive lands the player back in NEUTRAL and
    // can walk them out. Left set, a stale cinematic would black out the next
    // Three Room this run finds (N×3 can summon it again) before its door was
    // ever touched.
    this.cinematic = null;

    // The Undead risen around a cracked slot belong to this room. The curse
    // they announce does not go with them — game.cursedRun outlives the room,
    // and later phases raise their own in the graveyard and in REST.
    game.undeadSystem.clear();

    if (!game.audioSystem.isZoneMusicActive()) return;
    game.audioSystem.switchZoneMusic(game.currentRoom?.zone || 'green', import.meta.env.BASE_URL, true);
  }

  /**
   * Where retreating south out of the Three Room lands.
   *
   * Normally back into the EXPLORE room the player left, which is what the
   * saved state is for. On a Cursed run the world does not give that back —
   * the retreat walks all the way home, and the run's depth goes with it.
   * REST is where the curse shows itself next, so that is where it puts you.
   */
  retreatsToRest(game, room) {
    return !!room?.isThreeRoom && !!game.cursedRun;
  }

  // ── The door ────────────────────────────────────────────────────────────────

  /**
   * SPACE near the shut door (dispatched from main.js's NEUTRAL branch).
   * The door does not open until every slot holds an offering — anything at
   * all, right or wrong. Returns true when the press was consumed.
   */
  handleDoorPress(game) {
    const room = game.currentRoom;
    const door = room?.backgroundObjects?.find(o => o.threeDoor);
    if (!door || door._opened) return false;

    // Refused silently while the pattern is unfinished, like every other
    // non-instructive gate in the game.
    if (!this._allFilled(room)) return false;

    door._opened = true;
    // The way north stands open.
    door.char = '.';
    door.animationChar = '.';
    door.hasCollision = false;
    const { col, row } = door.threeDoorCell;
    if (room.collisionMap?.[row]) room.collisionMap[row][col] = false;

    // What is behind the door depends on what was offered. The power trio (or
    // anything refused) buys the north answer, and the north answer is Death.
    // The true 3 is the one set that opens the door and is spared — its way
    // out was never north; it is south of REST, which Phase 2 unseals.
    if (this.readOffering(room) !== 'true-three') this._beginCinematic(game);

    game.renderer.markBackgroundDirty();
    return true;
  }

  // ── Death, staged ───────────────────────────────────────────────────────────

  /**
   * The room goes out in steps, leaving the player lit and alone; Death then
   * stands up out of the dark at the far end and starts walking.
   *
   * The way back is shut first. Opening the door is a decision, not a look —
   * once it is made the room stops being somewhere the player can leave.
   */
  _beginCinematic(game) {
    this._sealReturn(game.currentRoom);
    this.cinematic = { phase: 'darkening', elapsed: 0, opacity: 0 };
  }

  /**
   * Close the entry edge behind the player. Clearing the exit flag is what
   * does the work in three places at once — the border draws solid over the
   * gap, the return warp zone stops being painted, and updateNeutralState's
   * return branch reads the same flag and refuses to fire. The collision cell
   * is set by hand because ExitSystem.updateExitCollisions only writes cells
   * for exits that still exist, so a cleared flag would otherwise leave the
   * gap walkable under a wall that looks closed.
   */
  _sealReturn(room) {
    if (!room?.exits) return;
    const edge = room.returnExit || 'south';
    if (!room.exits[edge]) return;

    room.exits[edge] = false;
    const cx = Math.floor(GRID.COLS / 2);
    const cy = Math.floor(GRID.ROWS / 2);
    const cell = { north: [0, cx], south: [GRID.ROWS - 1, cx],
                   west: [cy, 0], east: [cy, GRID.COLS - 1] }[edge];
    if (cell && room.collisionMap?.[cell[0]]) room.collisionMap[cell[0]][cell[1]] = true;
  }

  /**
   * Spawn Death as far from the player as the room allows. Once the room has
   * gone black there is no geometry left to respect — only the distance, and
   * the distance is the whole point of the scene. Spawning it at the door
   * (which is where the player is standing to have opened it) is what made
   * the original kill instant.
   */
  _releaseDeath(game) {
    const room = game.currentRoom;
    const p = game.player;
    const margin = GRID.CELL_SIZE * 1.5;
    const corners = [
      { x: margin, y: margin },
      { x: GRID.WIDTH - margin, y: margin },
      { x: margin, y: GRID.HEIGHT - margin },
      { x: GRID.WIDTH - margin, y: GRID.HEIGHT - margin }
    ];
    let best = corners[0];
    let bestDist = -1;
    for (const c of corners) {
      const d = Math.hypot(c.x - p.position.x, c.y - p.position.y);
      if (d > bestDist) { bestDist = d; best = c; }
    }

    const death = new BackgroundObject(DEATH_CHAR, best.x, best.y);
    death.isDeath = true;
    death.indestructible = true;
    death.color = DEATH_COLOR;
    death.animationColor = DEATH_COLOR;
    death.hasCollision = false;
    room.backgroundObjects.push(death);
    game.renderer.markBackgroundDirty();
  }

  /** Stepped darkness for the cinematic — quantized, never a smooth ramp. */
  _steppedOpacity(elapsed) {
    const step = Math.min(Math.floor(elapsed * 1000 / DARKEN_STEP_MS), DARKEN_STEPS);
    return step / DARKEN_STEPS;
  }

  // ── Runtime ─────────────────────────────────────────────────────────────────

  /**
   * Per-frame tick while the player is inside the Three Room. Drives the
   * cinematic and, once Death is walking, homes it at the player — straight
   * line, through walls, no leash, no ceiling on how long it follows. Called
   * from updateNeutralState; inert in every other room.
   */
  update(dt, game) {
    const room = game.currentRoom;
    if (!room?.isThreeRoom || !room.backgroundObjects) return;
    const p = game.player;
    if (!p || p.hp <= 0) return;

    const cin = this.cinematic;
    if (cin) {
      cin.elapsed += dt;
      if (cin.phase === 'darkening') {
        cin.opacity = this._steppedOpacity(cin.elapsed);
        if (cin.opacity >= 1) {
          cin.phase = 'arriving';
          cin.elapsed = 0;
          this._releaseDeath(game);
        }
        return;
      }
      if (cin.phase === 'arriving') {
        // It is simply there, and it waits a moment before it comes.
        if (cin.elapsed * 1000 >= ARRIVAL_HOLD_MS) {
          cin.phase = 'chasing';
          cin.elapsed = 0;
        }
        return;
      }
    }

    const death = room.backgroundObjects.find(o => o.isDeath);
    if (!death) return;

    const dx = p.position.x - death.position.x;
    const dy = p.position.y - death.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    death.position.x += (dx / dist) * DEATH_SPEED * dt;
    death.position.y += (dy / dist) * DEATH_SPEED * dt;

    if (dist < DEATH_KILL_RADIUS) {
      // It cannot be blocked, dodged, or tanked — its touch is the end.
      p.hp = 0;
      this._resolveContactDeath(game);
    }
  }

  /**
   * Death resolution for a kill that lands outside EXPLORE — EXPLORE's
   * hp<=0 catch-all never runs in NEUTRAL, so this is the minimal honest
   * path into GAME_OVER: same audio, same ledger, same transition. Keeps
   * REVIVE/CONTINUE live; the wish-revive routes back to NEUTRAL when the
   * death happened here (WishSystem.executeRevive).
   */
  _resolveContactDeath(game) {
    console.log('💀 Death reached the player.');
    captureDeath(game);
    game.audioSystem.stop();
    game.audioSystem.playSFX('player_death');
    game.combatSystem.clear();
    this.cinematic = null;
    game.stateMachine.transition(GAME_STATES.GAME_OVER);
  }
}
