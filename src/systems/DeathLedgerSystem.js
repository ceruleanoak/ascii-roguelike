// Death ledger — captures a full snapshot on player death for design analysis.
// True deaths AND revive intercepts (Fairy in a Bottle, Phoenix Feather) are both
// recorded; records sharing a runId belong to the same run. Records are POSTed to
// Google Sheets (all environments) and to the Vite dev server (dev only, appends
// to claudedocs/death-ledger.jsonl).

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyInq93Ldkax78sERsdlu20DAvaDSMaNdIFbCkIVTkAnwZ2iNroKgYMXRglFGvD6KLT/exec';

export const sessionDeaths = [];

// Compact unique id linking all ledger records from one run.
export function newRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// event: 'death' (true death) | 'revive' (death intercepted by a revive item).
// revivedBy names the intercepting item on revive records.
export function captureDeath(game, { event = 'death', revivedBy = null } = {}) {
  const player = game.player;
  const inv = game.inventorySystem;
  const killer = player._lastAttacker;

  const record = {
    timestamp: new Date().toISOString(),
    runId: game.runId ?? null,
    event,
    ...(revivedBy ? { revivedBy } : {}),
    character: game.activeCharacterType,
    cheatMenu: game.cheatUsed ? 'Y' : 'N',
    killedBy: killer?.data
      ? { name: killer.data.name, char: killer.char, tier: killer.data.tier ?? null }
      : (game.lastDeathCause ?? null),
    zoneDepths: { ...game.zoneDepths },
    currentZone: game.zoneSystem?.currentZone ?? null,
    currentDepth: game.getCurrentZoneDepth?.() ?? 0,
    stats: {
      hp: player.hp,
      maxHp: player.maxHp,
      defense: player.defense,
    },
    equipment: {
      quickSlots: player.quickSlots.map(s =>
        s ? { char: s.char, name: s.data?.name ?? null } : null
      ),
      armor: inv.equippedArmor
        ? { char: inv.equippedArmor.char, name: inv.equippedArmor.data?.name ?? null }
        : null,
      consumables: inv.equippedConsumables.map(c =>
        c ? { char: c.char, name: c.data?.name ?? null } : null
      ),
    },
    inventory: {
      ingredients: [...player.inventory],
      armorCollected: inv.armorInventory.map(a => ({
        char: a.char, name: a.data?.name ?? null,
      })),
      consumablesCollected: inv.consumableInventory.map(c => ({
        char: c.char, name: c.data?.name ?? null,
      })),
    },
  };

  sessionDeaths.push(record);

  // Google Sheets — works in all environments (no-cors avoids preflight)
  fetch(SHEETS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(record),
  }).catch(() => {});

  // Local dev server — appends to claudedocs/death-ledger.jsonl during npm run dev
  fetch('/api/death-ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  }).catch(() => {});

  return record;
}

export function downloadSessionLedger() {
  if (sessionDeaths.length === 0) return;
  const jsonl = sessionDeaths.map(r => JSON.stringify(r)).join('\n');
  const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deaths-${new Date().toISOString().slice(0, 10)}.jsonl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
