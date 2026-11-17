// Every dash an Enemy can commit to (Charge, Leap windup, Frost Lunge, Dart)
// is cut short by the same interrupts: sleep, stun, freeze, zap, knockback,
// and a Tortoise ducking into its shell. Each call site goes through this one
// function, so a new dash mechanic is wired everywhere by adding it here.
// Each mechanic's interrupt() is a no-op when that dash is idle or disabled.

import { ChargeMechanic } from './ChargeMechanic.js';
import { LeapAttackMechanic } from './LeapAttackMechanic.js';
import { FrostLungeMechanic } from './FrostLungeMechanic.js';
import { DartMechanic } from './DartMechanic.js';

export function interruptDashes(enemy) {
  ChargeMechanic.interrupt(enemy);
  LeapAttackMechanic.interrupt(enemy);
  FrostLungeMechanic.interrupt(enemy);
  DartMechanic.interrupt(enemy);
}
