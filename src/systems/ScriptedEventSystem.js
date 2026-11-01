import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { inSamePlane, tagLootLayer } from './PlaneSystem.js';
import { SCRIPTED_EVENTS } from '../data/scriptedEvents.js';
import { ITEMS } from '../data/items.js';
import { INGREDIENTS } from '../data/ingredients.js';

// Cells per second an actor walks during a moveTo Event Command.
const WALK_SPEED = 4;

/**
 * ScriptedEventSystem — barebones RPG Maker-style events.
 *
 * A Scripted Event (data/scriptedEvents.js) is an actor, a trigger
 * condition, and a list of Event Commands run one after another. While one
 * runs the player is locked: every key is swallowed (isInputCaptured is true,
 * held movement is released) except SPACE, which only closes the dialogue box
 * so the next line can be told.
 *
 * Event Flags (`game.eventFlags`, a run-scoped Set) are the switches events
 * set and read — the RPG Maker "switch".
 *
 * Event Commands (`type`):
 *   say     { lines }          — the actor speaks through DialogueSystem, one
 *                                line per SPACE; the command ends when the
 *                                last line is closed
 *   moveTo  { col, row }       — the actor walks there (AnimationSystem), or
 *           { toPlayer: true } — to the cell beside the player
 *   wait    { duration }       — seconds
 *   take    { char }           — a carried Bottle of `char` leaves the player
 *                                (BottlesSystem.takeAt) into `run.vars.taken`
 *   give    { item }           — `item(game, run)` → Item or char, dropped as
 *                                ground loot at the player's feet
 *   hold    { item }           — the actor holds up an Item or char (or
 *                                `item(game, run)` → one) above its head;
 *                                null puts it away
 *   call    { fn }             — fn(game, run), for anything a system owns
 *   setFlag { name }           — adds an Event Flag
 *
 * Only one event runs at a time. It ends early when its actor leaves the
 * active room or interior (the player walked out, died, warped), and on any
 * room change (Reset Registry, `room` scope).
 */
export class ScriptedEventSystem {
  constructor(game) {
    this.game = game;
    // { event, actor, commandIndex, timer, waiting, vars } — the running event
    this.run = null;
  }

  isRunning() {
    return !!this.run;
  }

  setFlag(name) {
    this.game.eventFlags.add(name);
  }

  hasFlag(name) {
    return this.game.eventFlags.has(name);
  }

  /**
   * SPACE dispatch. While an event runs, SPACE belongs to it (closes the
   * dialogue box, nothing else). Otherwise SPACE beside an event's actor
   * whose condition holds starts that event — the RPG Maker action button.
   */
  handleSpacePress() {
    if (this.run) {
      this.game.dialogueSystem.advance();
      return true;
    }
    const { game } = this;
    const player = game.player;
    if (!player || player.polymorphed || game.dialogueSystem.isOpen()) return false;
    for (const event of SCRIPTED_EVENTS) {
      const actor = event.actor(game);
      if (!actor || !this._actorPresent(actor)) continue;
      if (!inSamePlane(actor, player) || !actor.isInRange(player)) continue;
      if (game.dialogueSystem.isMidSpeech(actor)) continue; // let a speech finish first
      if (!event.when(game, actor)) continue;
      this.start(event, actor);
      return true;
    }
    return false;
  }

  /**
   * Keydown while an event runs: every key is the event's. Returns whether
   * the key was consumed (main.js returns early).
   */
  handleKeydown(e) {
    if (!this.run) return false;
    if (e.key === ' ' && !e.repeat) this.handleSpacePress();
    e.preventDefault();
    return true;
  }

  start(event, actor) {
    const { game } = this;
    this.run = { event, actor, commandIndex: -1, timer: 0, waiting: false, vars: {} };
    // Release whatever the player was holding — keyups still clear these, but
    // a key held through the start must not keep walking or rolling.
    for (const k of ['w', 'a', 's', 'd', 'space', 'shift', 'tab']) game.keys[k] = false;
    for (const k of Object.keys(game.arrowKeys)) game.arrowKeys[k] = false;
    if (game.player?.velocity) { game.player.velocity.vx = 0; game.player.velocity.vy = 0; }
    actor.clearIndicator();
    this._next();
  }

  /** End the running event where it stands (room change, actor gone). */
  cancel() {
    const run = this.run;
    if (!run) return;
    this.run = null;
    this.game.animationSystem.cancelFor(run.actor);
    if (this.game.dialogueSystem.getState()?.npc === run.actor) this.game.dialogueSystem.close();
  }

  update(dt) {
    const run = this.run;
    if (!run) return;
    if (!this._actorPresent(run.actor)) { this.cancel(); return; }

    const command = run.event.commands[run.commandIndex];
    if (command.type === 'say') {
      const dialogue = this.game.dialogueSystem;
      if (dialogue.isOpen()) return;
      if (dialogue.isMidSpeech(run.actor)) { dialogue.talk(run.actor); return; }
      this._next();
    } else if (command.type === 'wait') {
      run.timer -= dt;
      if (run.timer <= 0) this._next();
    } else if (!run.waiting) {
      this._next();
    }
  }

  // ── Command execution ────────────────────────────────────────────────────

  _next() {
    const run = this.run;
    while (run === this.run) {
      run.commandIndex += 1;
      const command = run.event.commands[run.commandIndex];
      if (!command) { this.run = null; return; }
      // Instant commands run and fall through to the next; the rest hold
      // the event until update() sees them finish.
      if (!this._execute(command, run)) return;
    }
  }

  /** Run one command. Returns true when it finished instantly. */
  _execute(command, run) {
    const { game } = this;
    switch (command.type) {
      case 'say':
        game.dialogueSystem.open(run.actor, command.lines);
        return false;
      case 'wait':
        run.timer = command.duration;
        return false;
      case 'moveTo':
        this._walk(command, run);
        return false;
      case 'take':
        run.vars.taken = game.bottlesSystem.takeAt(game.bottlesSystem.findRef(command.char));
        return true;
      case 'give':
        this._give(command.item(game, run));
        return true;
      case 'hold':
        this._hold(typeof command.item === 'function' ? command.item(game, run) : command.item, run);
        return true;
      case 'call':
        command.fn(game, run);
        return true;
      case 'setFlag':
        this.setFlag(command.name);
        return true;
      default:
        throw new Error(`[ScriptedEventSystem] Unknown Event Command "${command.type}" in ${run.event.id}`);
    }
  }

  _walk(command, run) {
    const { actor } = run;
    const C = GRID.CELL_SIZE;
    let x, y;
    if (command.toPlayer) {
      ({ x, y } = this._cellBesidePlayer(actor));
    } else {
      x = command.col * C;
      y = command.row * C;
    }
    const cells = Math.hypot(x - actor.position.x, y - actor.position.y) / C;
    run.waiting = true;
    this.game.animationSystem.play(actor, [
      { type: 'moveTo', x, y, duration: Math.max(0.1, cells / WALK_SPEED), easing: 'easeInOut' }
    ], { onComplete: () => { if (this.run === run) run.waiting = false; } });
  }

  /** The nearest side of the player with no object on it, so the actor stops facing them. */
  _cellBesidePlayer(actor) {
    const { game } = this;
    const C = GRID.CELL_SIZE;
    const { x, y } = game.player.position;
    const near = (a, b) => Math.hypot(a.x - actor.position.x, a.y - actor.position.y)
      - Math.hypot(b.x - actor.position.x, b.y - actor.position.y);
    const sides = [{ x: x - C, y }, { x: x + C, y }, { x, y: y - C }, { x, y: y + C }].sort(near);
    const free = sides.find(side => !game._activeBackgroundObjects().some(obj =>
      !obj.destroyed && Math.hypot(obj.position.x - side.x, obj.position.y - side.y) < C));
    return free ?? sides[0];
  }

  _hold(item, run) {
    if (!item) { run.actor.clearIndicator(); return; }
    const char = item.char ?? item;
    run.actor.setIndicator(char, item.color ?? ITEMS[char]?.color ?? INGREDIENTS[char]?.color);
  }

  _give(item) {
    if (!item) return;
    const { game } = this;
    const player = game.player;
    const ground = typeof item === 'string' ? new Item(item, 0, 0) : item;
    ground.position.x = player.position.x;
    ground.position.y = player.position.y;
    game.items.push(tagLootLayer(game, ground));
  }

  _actorPresent(actor) {
    return this.game.interiorManager.activeNpcs().includes(actor);
  }
}
