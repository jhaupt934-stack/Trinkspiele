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

  // Fuer "Rueckgaengig": nur der letzte Schluck laesst sich zuruecknehmen.
  const next = { ...g, players, pending, draft: noteSip(g, fromId, targetId), undo: { fromId, toId: targetId } };
  return offen - 1 === 0 ? { ...next, ...flushSips(next, fromId) } : next;
}

/**
 * Den letzten Schluck zuruecknehmen - fuer den Fall, dass man danebengetippt
 * hat. Gilt nur fuer den unmittelbar letzten und nur, solange die Runde nicht
 * weitergelaufen ist (jede andere Aktion loescht das Rueckgaengig).
 */
export function canUndo(g, playerId) {
  return !!g.undo && g.undo.fromId === playerId;
}

export function undoSip(g, playerId) {
  if (!canUndo(g, playerId)) return g;
  const { fromId, toId } = g.undo;

  const players = g.players.map((p) => (p.id === toId ? { ...p, sips: Math.max(0, p.sips - 1) } : p));
  const pending = { ...g.pending, [fromId]: pendingFor(g, fromId) + 1 };

  // Zwischenstand zurueckdrehen
  const draft = { ...(g.draft ?? {}) };
  const meins = { ...(draft[fromId] ?? {}) };
  if (meins[toId] > 1) meins[toId] -= 1;
  else delete meins[toId];
  if (Object.keys(meins).length) draft[fromId] = meins;
  else delete draft[fromId];

  // War die Meldung schon raus, wird sie mitkorrigiert. Die Nummer bleibt
  // gleich, damit beim Empfaenger nicht nochmal etwas aufpoppt.
  const run = (g.runs ?? {})[fromId] ?? 0;
  const sipLog = (g.sipLog ?? [])
    .map((e) =>
      e.run === run && e.fromId === fromId && e.toId === toId ? { ...e, count: e.count - 1 } : e
    )
    .filter((e) => e.count > 0);

  return { ...g, players, pending, draft, sipLog, undo: null };
}

/** Leerer Ausgangszustand fuer die Schluck-Verwaltung. */
export const emptySips = () => ({
  pending: {}, runs: {}, dist: 0, draft: {}, sipLog: [], sipSeq: 0, undo: null,
});
