import { GAME_STATES } from './GameConfig.js';

export class GameStateMachine {
  constructor() {
    this.currentState = null; // Start with no state
    this.previousState = null;
    this.stateHandlers = {};
    this.transitionHandlers = {};
  }

  registerStateHandler(state, handler) {
    this.stateHandlers[state] = handler;
  }

  registerTransitionHandler(fromState, toState, handler) {
    const key = `${fromState}->${toState}`;
    this.transitionHandlers[key] = handler;
  }

  transition(newState, data = {}) {
    if (this.currentState === newState) return;

    // COMBAT is a vestigial state constant — combat runs inside EXPLORE.
    // Guard here so a stray transition('COMBAT') fails loudly instead of
    // silently entering a state with no registered handler (which appears as a freeze).
    if (newState === 'COMBAT') {
      console.warn('[GameStateMachine] Attempted transition to vestigial COMBAT state — blocked. Combat runs inside EXPLORE.');
      return;
    }

    const transitionKey = `${this.currentState}->${newState}`;

    // Call transition handler if exists
    if (this.transitionHandlers[transitionKey]) {
      this.transitionHandlers[transitionKey](data);
    }

    this.previousState = this.currentState;
    this.currentState = newState;

    // Call new state handler if exists
    if (this.stateHandlers[newState]) {
      this.stateHandlers[newState](data);
    }
  }

  getCurrentState() {
    return this.currentState;
  }

  getPreviousState() {
    return this.previousState;
  }

  isState(state) {
    return this.currentState === state;
  }
}
