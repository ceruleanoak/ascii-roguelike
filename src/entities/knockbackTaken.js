// How hard a player weapon hit shoves an Enemy, by what kind of weapon landed it.
//
// `data.knockbackTaken = { default, bySubtype: { hammer: 1.8, ... } }` scales the
// attack's own knockback force before PhysicsSystem sees it. The Bumper is the
// first reader: it shrugs off most weapons (a low default) but a hammer sends it
// flying — the right tool, readable from the hit itself. An Enemy without the
// field takes every weapon's knockback unscaled.
//
// Sits beside elementalAffinity.js for the same reason: a per-Enemy response
// table keyed by what struck it. It is not knockbackResistance — that is a flat,
// weapon-blind reduction (shells, the Training Dummy) applied inside PhysicsSystem
// to every shove, weapon or not. This scales only player weapon hits, before them.

export function knockbackTakenScale(enemy, attack) {
  const table = enemy.data?.knockbackTaken;
  if (!table) return 1;
  return table.bySubtype?.[attack.weaponSubtype] ?? table.default ?? 1;
}
