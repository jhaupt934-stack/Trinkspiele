// Schluecke verteilen - gemeinsam fuer alle Spiele.
//
// Wer Schluecke zu vergeben hat, steht in `pending`:
//   pending = { "p-abc": 3, "p-xyz": 1 }
// Mehrere koennen gleichzeitig darin stehen und arbeiten unabhaengig
// voneinander ab - niemand muss auf einen anderen warten.
//
// Gemeldet wird erst am Schluss: waehrend jemand tippt, wird in `draft` nur
// mitgezaehlt. Ist der letzte Schluck vergeben, wandert das Ergebnis nach
// `sipLog` - eine Meldung pro Empfaenger mit der Gesamtzahl, nicht eine pro
// einzelnem Schluck.

export const pendingFor = (g, id) => (id && g.pending ? g.pending[id] ?? 0 : 0);

export const pendingTotal = (g) => Object.values(g.pending ?? {}).reduce((a, b) => a + b, 0);

export const distributorIds = (g) => Object.keys(g.pending ?? {}).filter((id) => g.pending[id] > 0);

/** An wen darf `fromId` Schluecke geben? An alle ausser sich selbst. */
export const sipTargets = (g, fromId) => g.players.filter((p) => p.id !== fromId);

/** Neuer Verteil-Auftrag: `anzahl` Schluecke fuer `id`. */
export function addPending(g, id, anzahl) {
  const dist = (g.dist ?? 0) + 1;
  return {
    dist,
    runs: { ...(g.runs ?? {}), [id]: dist },
    pending: { ...(g.pending ?? {}), [id]: pendingFor(g, id) + anzahl },
  };
}

/** Einen Schluck zum Zwischenstand der laufenden Verteilung dazuzaehlen. */
function noteSip(g, fromId, toId) {
  const bisher = (g.draft ?? {})[fromId] ?? {};
  return { ...(g.draft ?? {}), [fromId]: { ...bisher, [toId]: (bisher[toId] ?? 0) + 1 } };
}

/** Verteilung fertig: fuer jeden Empfaenger genau eine Meldung schreiben. */
function flushSips(g, fromId) {
  const stand = (g.draft ?? {})[fromId];
  const draft = { ...(g.draft ?? {}) };
  delete draft[fromId];
  if (!stand) return { draft };

  let seq = g.sipSeq ?? 0;
  const neu = Object.entries(stand).map(([toId, count]) => ({
    seq: ++seq,
    run: (g.runs ?? {})[fromId] ?? 0,
    fromId,
    toId,
    count,
  }));
  return { draft, sipSeq: seq, sipLog: [...(g.sipLog ?? []), ...neu].slice(-24) };
}

/**
 * `fromId` gibt `targetId` einen Schluck. Gibt den unveraenderten Zustand
 * zurueck, wenn der Zug nicht erlaubt ist. Was danach passiert (naechster
 * Spieler, Spielende), entscheidet das jeweilige Spiel.
 */
export function giveSip(g, targetId, fromId) {
  const offen = pendingFor(g, fromId);
  if (!fromId || offen <= 0 || targetId === fromId) return g;
  if (!g.players.some((p) => p.id === targetId)) return g;

  const players = g.players.map((p) => (p.id === targetId ? { ...p, sips: p.sips + 1 } : p));
  const pending = { ...g.pending };
  if (offen - 1 > 0) pending[fromId] = offen - 1;
  else delete pending[fromId];

  // Fuer "Rueckgaengig" wird jeder vergebene Schluck der Reihe nach gemerkt.
  // Dadurch kann man sich Schritt fuer Schritt zurueckarbeiten und nicht nur
  // den allerletzten zuruecknehmen.
  const stapel = { ...(g.undoStack ?? {}), [fromId]: [...(g.undoStack?.[fromId] ?? []), targetId] };

  const next = { ...g, players, pending, draft: noteSip(g, fromId, targetId), undoStack: stapel };
  return offen - 1 === 0 ? { ...next, ...flushSips(next, fromId) } : next;
}

/** Hat dieser Spieler noch etwas zurueckzunehmen? */
export const canUndo = (g, playerId) => (g.undoStack?.[playerId]?.length ?? 0) > 0;

/** An wen ging der Schluck, der als naechstes zurueckgenommen wird? */
export function undoTarget(g, playerId) {
  const stapel = g.undoStack?.[playerId] ?? [];
  return stapel.length ? stapel[stapel.length - 1] : null;
}

/**
 * Den zuletzt vergebenen Schluck zuruecknehmen. Mehrfach hintereinander
 * moeglich, bis die ganze Verteilung wieder offen ist. Sobald die Runde
 * weiterlaeuft (aufdecken, weiterblaettern, naechster Spieler), ist Schluss.
 */
export function undoSip(g, playerId) {
  if (!canUndo(g, playerId)) return g;
  const fromId = playerId;
  const stapel = g.undoStack[fromId];
  const toId = stapel[stapel.length - 1];

  const players = g.players.map((p) => (p.id === toId ? { ...p, sips: Math.max(0, p.sips - 1) } : p));
  const pending = { ...g.pending, [fromId]: pendingFor(g, fromId) + 1 };

  let draft = { ...(g.draft ?? {}) };
  let sipLog = g.sipLog ?? [];
  const run = (g.runs ?? {})[fromId] ?? 0;

  // War die Verteilung schon abgeschlossen, sind die Meldungen bereits raus.
  // Die holen wir zurueck in den Zwischenstand - dann geht am Ende wieder
  // genau eine Meldung pro Empfaenger raus, mit der korrigierten Anzahl.
  if (!draft[fromId]) {
    const meine = sipLog.filter((e) => e.run === run && e.fromId === fromId);
    if (meine.length) {
      draft[fromId] = Object.fromEntries(meine.map((e) => [e.toId, e.count]));
      sipLog = sipLog.filter((e) => !(e.run === run && e.fromId === fromId));
    }
  }

  const meins = { ...(draft[fromId] ?? {}) };
  if (meins[toId] > 1) meins[toId] -= 1;
  else delete meins[toId];
  if (Object.keys(meins).length) draft[fromId] = meins;
  else delete draft[fromId];

  const rest = stapel.slice(0, -1);
  const undoStack = { ...g.undoStack };
  if (rest.length) undoStack[fromId] = rest;
  else delete undoStack[fromId];

  return { ...g, players, pending, draft, sipLog, undoStack };
}

/** Leerer Ausgangszustand fuer die Schluck-Verwaltung. */
export const emptySips = () => ({
  pending: {}, runs: {}, dist: 0, draft: {}, sipLog: [], sipSeq: 0, undoStack: {},
});
