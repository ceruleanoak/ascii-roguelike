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
