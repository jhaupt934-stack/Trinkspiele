// Busfahren - Hausregeln von Jonas.
//
// Die kompletten Spielregeln, als reine Funktionen ohne Nebenwirkungen.
// Dieselbe Datei laeuft im Browser (lokales Spiel) und im Server (Online-Spiel),
// dadurch kann es keine zwei Regelwerke geben, die auseinanderlaufen.
//
// Ablauf:
//   1. "guess"    - 4 Runden, jeder zieht reihum eine eigene Karte und raet:
//                   rot/schwarz (1), hoeher/niedriger (2), dazwischen/ausserhalb (3),
//                   Symbol schon dabei (4). Richtig = verteilen, falsch = selber trinken.
//   2. "rows"     - zwei Reihen a 4 Karten (1-4 Schluecke): "selber trinken" und
//                   "verteilen". Passende eigene Karten werden abgelegt.
//   3. "tiebreak" - nur falls mehrere gleich viele Karten uebrig haben (siehe unten).
//   4. "pyramid"  - der Verlierer kaempft sich von unten nach oben.
//
// Verteilte Schluecke darf man sich nie selbst geben. Wie das Verteilen
// funktioniert - auch mehrere Spieler gleichzeitig - steht in sips.js.

import { createDeck, createShuffledDeck, draw, isRed, rankValue, shuffle } from "./deck.js";
import {
  addPending,
  canUndo,
  undoTarget,
  distributorIds,
  emptySips,
  giveSip,
  undoSip,
  pendingFor,
  pendingTotal,
  sipTargets,
} from "./sips.js";

// Damit die Oberflaeche alles aus einer Datei holen kann.
export { canUndo, undoTarget, distributorIds, pendingFor, pendingTotal, sipTargets, undoSip };

export const ROUND_TITLES = [
  "Runde 1 – Rot oder Schwarz?",
  "Runde 2 – Höher oder niedriger?",
  "Runde 3 – Dazwischen oder außerhalb?",
  "Runde 4 – Symbol schon dabei?",
];

const PYRAMID_ROWS = [5, 4, 3, 2, 1];
const PYRAMID_CARDS = PYRAMID_ROWS.reduce((a, b) => a + b, 0); // 15
// In der Pyramide zaehlt das Ass mit zu den Bildkarten - es setzt genauso zurueck.
const FACE = new Set(["J", "Q", "K", "A"]);

export const isFaceCard = (card) => FACE.has(card.rank);
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * `players` ist [{id, name}] - im lokalen Spiel vergeben wir die Ids selbst.
 * `hostId` bestimmt, wer in Phase 2 die Karten aufdecken darf. Bleibt es leer
 * (lokales Spiel auf einem Geraet), darf das jeder.
 */
export function initGame(players, rng, hostId = null) {
  if (players.length < MIN_PLAYERS) throw new Error("Mindestens 2 Spieler.");
  return {
    game: "bus",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? null,
      sips: 0,
      cards: [],
      connected: true,
    })),
    hostId,
    deck: createShuffledDeck(rng),
    phase: "guess",
    round: 0,
    turn: 0,
    ...emptySips(),
    message: null,
  };
}

export const currentPlayer = (g) => g.players[g.turn];
export const playerById = (g, id) => g.players.find((p) => p.id === id);

/**
 * Alle Karten, die gerade irgendwo liegen: auf den Haenden, in den zwei Reihen,
 * im Stechen aufgedeckt oder in der Pyramide. Wird gebraucht, damit beim
 * Nachmischen keine Karte ein zweites Mal ins Spiel kommt.
 */
function inPlayIds(g) {
  const ids = new Set();
  for (const p of g.players) for (const c of p.cards) ids.add(c.id);
  for (const c of g.drinkRow ?? []) ids.add(c.card.id);
  for (const c of g.giveRow ?? []) ids.add(c.card.id);
  if (g.flipped) ids.add(g.flipped.id);
  for (const k of Object.keys(g.drawn ?? {})) ids.add(g.drawn[k].id);
  if (g.phase === "pyramid") for (const row of g.rows ?? []) for (const c of row) ids.add(c.id);
  for (const c of g.deck) ids.add(c.id);
  return ids;
}

/**
 * Nachschub, wenn der Stapel nicht mehr reicht: die abgelegten Karten werden
 * gemischt und unter den Reststapel gelegt - wie wenn man am Tisch den
 * Ablagestapel wieder aufnimmt. Karten, die gerade offen liegen, bleiben aussen vor.
 */
function refill(g, need) {
  if (g.deck.length >= need) return g.deck;
  const inPlay = inPlayIds(g);
  const abgelegt = shuffle(createDeck().filter((c) => !inPlay.has(c.id)));
  return [...g.deck, ...abgelegt];
}

// ---------------------------------------------------------------------------
// Schluecke verteilen
// ---------------------------------------------------------------------------

/**
 * `fromId` gibt `targetId` einen Schluck. Die eigentliche Arbeit macht
 * sips.js - dieselbe Mechanik benutzt auch das Pferderennen. Hier kommt nur
 * dazu, was fuer Busfahren gilt: In Phase 1 ist nach dem letzten Schluck der
 * naechste Spieler dran.
 */
export function handOutSip(g, targetId, fromId) {
  const next = giveSip(g, targetId, fromId);
  if (next === g) return g;

  // Ueber den Zugwechsel hinweg laesst sich nichts mehr zurueckholen.
  if (g.phase === "guess" && pendingTotal(next) === 0) return nextTurn({ ...next, undoStack: {} }, null);
  return next;
}

// ---------------------------------------------------------------------------
// Phase 1 – Karten raten
// ---------------------------------------------------------------------------

/** guess: "red"|"black" | "higher"|"lower" | "inside"|"outside" | "seen"|"new" */
export function makeGuess(g, guess) {
  if (g.phase !== "guess" || pendingTotal(g) > 0) return g;

  const { drawn, rest } = draw(g.deck, 1);
  const card = drawn[0];
  if (!card) return g;

  const player = g.players[g.turn];
  const own = player.cards;
  let correct;

  switch (g.round) {
    case 0:
      correct = guess === (isRed(card) ? "red" : "black");
      break;
    case 1: {
      const ref = rankValue(own[0].rank);
      const cur = rankValue(card.rank);
      correct = cur !== ref && guess === (cur > ref ? "higher" : "lower"); // gleicher Wert = falsch
      break;
    }
    case 2: {
      const a = rankValue(own[0].rank);
      const b = rankValue(own[1].rank);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const cur = rankValue(card.rank);
      correct = cur !== lo && cur !== hi && guess === (cur > lo && cur < hi ? "inside" : "outside");
      break;
    }
    default: {
      const seen = own.some((c) => c.suit === card.suit);
      correct = guess === (seen ? "seen" : "new");
      break;
    }
  }

  const sips = g.round + 1;
  const players = g.players.map((p, i) =>
    i === g.turn ? { ...p, cards: [...p.cards, card], sips: correct ? p.sips : p.sips + sips } : p
  );
  const plural = sips > 1 ? "e" : "";

  if (correct) {
    return {
      ...g,
      players,
      deck: rest,
      ...addPending(g, player.id, sips),
      message: `${player.name} hat richtig geraten und verteilt ${sips} Schluck${plural}.`,
    };
  }

  return nextTurn(
    { ...g, players, deck: rest },
    `${player.name} lag daneben und trinkt ${sips} Schluck${plural}.`
  );
}

function nextTurn(g, message) {
  let turn = g.turn + 1;
  let round = g.round;
  if (turn >= g.players.length) {
    turn = 0;
    round += 1;
  }
  if (round > 3) return startRows(g, message);
  return { ...g, phase: "guess", round, turn, pending: {}, message };
}

// ---------------------------------------------------------------------------
// Phase 2 – Die zwei Reihen
// ---------------------------------------------------------------------------

function startRows(g, message) {
  const { drawn, rest } = draw(g.deck, 8);
  const mk = (cards) => cards.map((card, i) => ({ card, revealed: false, value: i + 1 }));

  // Abwechselnd aufdecken: Trinken 1, Verteilen 1, Trinken 2, ...
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push({ kind: "drink", index: i });
    order.push({ kind: "give", index: i });
  }

  return {
    ...g,
    deck: rest,
    phase: "rows",
    drinkRow: mk(drawn.slice(0, 4)),
    giveRow: mk(drawn.slice(4, 8)),
    order,
    cursor: 0,
    revealedNow: false,
    revealedAt: 0,
    pending: {},
    message: message ?? "Jetzt die zwei Reihen. Passende Karten ablegen!",
  };
}

export function currentRowCard(g) {
  if (g.phase !== "rows" || g.cursor >= g.order.length) return null;
  const slot = g.order[g.cursor];
  const card = slot.kind === "drink" ? g.drinkRow[slot.index] : g.giveRow[slot.index];
  return { kind: slot.kind, card };
}

export function revealRow(g, jetzt = Date.now()) {
  if (g.phase !== "rows" || g.revealedNow || g.cursor >= g.order.length) return g;
  const slot = g.order[g.cursor];
  const flip = (row) => row.map((c, i) => (i === slot.index ? { ...c, revealed: true } : c));
  return {
    ...g,
    drinkRow: slot.kind === "drink" ? flip(g.drinkRow) : g.drinkRow,
    giveRow: slot.kind === "give" ? flip(g.giveRow) : g.giveRow,
    revealedNow: true,
    revealedAt: jetzt,
    message: null,
  };
}

/** Wer kann auf die gerade aufgedeckte Karte ablegen? */
export function playersWithMatch(g) {
  const cur = currentRowCard(g);
  if (!cur || !g.revealedNow) return [];
  return g.players.filter((p) => p.cards.some((c) => c.rank === cur.card.card.rank));
}

/**
 * Ablegen. Mehrere Spieler duerfen auf dieselbe aufgedeckte Karte ablegen, und
 * zwar auch dann, wenn ein anderer gerade noch am Verteilen ist - jeder bekommt
 * seinen eigenen Verteil-Auftrag und arbeitet ihn unabhaengig ab.
 */
/** Wie viele Karten mit dem aufgedeckten Wert hat dieser Spieler? */
export function matchCount(g, playerId) {
  const cur = currentRowCard(g);
  if (!cur || !g.revealedNow) return 0;
  return playerById(g, playerId)?.cards.filter((c) => c.rank === cur.card.card.rank).length ?? 0;
}

/**
 * Ablegen. Hat jemand den Wert zweimal, gehen beide Karten mit EINEM Tipp weg
 * und die Schluecke zaehlen doppelt - man soll nicht zweimal tippen muessen.
 */
export function discardCard(g, playerId) {
  if (g.phase !== "rows" || !g.revealedNow) return g;
  const cur = currentRowCard(g);
  if (!cur) return g;

  const player = playerById(g, playerId);
  if (!player) return g;
  const rank = cur.card.card.rank;
  const anzahl = player.cards.filter((c) => c.rank === rank).length;
  if (anzahl === 0) return g;

  const gesamt = cur.card.value * anzahl;
  const plural = gesamt > 1 ? "e" : "";
  const wieViele = anzahl > 1 ? `${anzahl} Karten` : "ab";
  const players = g.players.map((p) =>
    p.id !== playerId
      ? p
      : {
          ...p,
          cards: p.cards.filter((c) => c.rank !== rank),
          sips: cur.kind === "drink" ? p.sips + gesamt : p.sips,
        }
  );

  if (cur.kind === "drink") {
    return { ...g, players, message: `${player.name} legt ${wieViele} ab und trinkt ${gesamt} Schluck${plural}.` };
  }
  return {
    ...g,
    players,
    ...addPending(g, playerId, gesamt),
    message: `${player.name} legt ${wieViele} ab und verteilt ${gesamt} Schluck${plural}.`,
  };
}

/**
 * Wie lange der Host mindestens warten muss, bevor er weiterblaettern darf.
 *
 * Sinn: Wer ablegen kann, soll die Chance dazu bekommen - aber niemand soll
 * die Runde aufhalten. Nach 10 Sekunden geht es weiter, dann ist jeder selbst
 * schuld, der nicht getippt hat. Kann ueberhaupt niemand ablegen und verteilt
 * auch keiner mehr, geht es sofort weiter.
 */
export const WARTEZEIT_MS = 10000;

export function warteBis(g) {
  if (g.phase !== "rows" || !g.revealedNow) return 0;
  const jemandKann = playersWithMatch(g).length > 0 || pendingTotal(g) > 0;
  return jemandKann ? (g.revealedAt ?? 0) + WARTEZEIT_MS : 0;
}

/** Darf jetzt weitergeblaettert werden? */
export function darfWeiter(g, jetzt = Date.now()) {
  if (g.phase !== "rows") return false;
  // Die letzte Karte darf die Runde nicht mit offenen Schlucken beenden -
  // die wuerden beim Wechsel in die Pyramide verlorengehen.
  const letzte = g.cursor + 1 >= (g.order?.length ?? 0);
  if (letzte && pendingTotal(g) > 0) return false;
  // 500 ms Kulanz, damit ein Handy mit leicht anderer Uhr nicht abgewiesen wird.
  return jetzt >= warteBis(g) - 500;
}

export function nextRow(g, jetzt = Date.now()) {
  if (!darfWeiter(g, jetzt)) return g;
  const cursor = g.cursor + 1;
  if (cursor >= g.order.length) return decideDriver({ ...g, cursor, revealedNow: false });
  return { ...g, cursor, revealedNow: false, revealedAt: 0, message: null };
}

// ---------------------------------------------------------------------------
// Phase 3 – Wer muss fahren?
// ---------------------------------------------------------------------------

/**
 * Es faehrt, wer die meisten Karten uebrig hat. Bei Gleichstand entscheidet ein
 * Stechen: Es wird so lange je eine Karte aufgedeckt, bis nur noch einer uebrig
 * ist - wer ablegen kann, ist raus. Geht das nicht mehr auf (die passenden Karten
 * sind nicht mehr im Stapel), zieht jeder eine Karte und der niedrigste faehrt.
 */
function decideDriver(g) {
  const most = Math.max(...g.players.map((p) => p.cards.length));
  const candidates = g.players.filter((p) => p.cards.length === most).map((p) => p.id);

  if (candidates.length === 1) return startPyramid(g, candidates[0]);

  const names = candidates.map((id) => playerById(g, id).name).join(", ");
  return {
    ...g,
    phase: "tiebreak",
    candidates,
    tieMode: tieCanBeResolvedByFlip(g, candidates) ? "flip" : "draw",
    flipped: null,
    drawn: null,
    tieResult: null,
    message: `Gleichstand mit ${most} Karten: ${names}. Wer zuerst ablegen kann, ist raus.`,
  };
}

/** Liegt ueberhaupt noch eine Karte im Stapel, die einer der Kandidaten hat? */
function tieCanBeResolvedByFlip(g, candidates) {
  const ranks = new Set();
  for (const id of candidates) for (const c of playerById(g, id).cards) ranks.add(c.rank);
  return refill(g, 1).some((c) => ranks.has(c.rank));
}

/**
 * Steht der Fahrer fest, springen wir NICHT sofort in die Pyramide, sondern
 * zeigen erst das Ergebnis. Sonst blitzt die entscheidende Karte nur kurz auf
 * und keiner sieht, warum es vorbei ist.
 */
function tiebreakErgebnis(g, driverId, escaped, text) {
  return { ...g, candidates: [driverId], tieResult: { driverId, escaped }, message: text };
}

/** Ergebnis bestaetigt - jetzt geht es in die Pyramide. */
export function tiebreakGo(g) {
  if (g.phase !== "tiebreak" || !g.tieResult) return g;
  return startPyramid({ ...g, tieResult: null }, g.tieResult.driverId, g.message);
}

/** Eine Karte aufdecken: Wer sie ablegen kann, muss nicht fahren. */
export function tiebreakFlip(g) {
  if (g.phase !== "tiebreak" || g.tieMode !== "flip" || g.tieResult) return g;

  const deck = refill(g, 1);
  const card = deck[0];
  const rest = deck.slice(1);

  const escaped = g.candidates.filter((id) => playerById(g, id).cards.some((c) => c.rank === card.rank));

  // Koennten alle ablegen, entscheidet die Karte nichts - dann bleibt es beim Gleichstand.
  const remaining = escaped.length === g.candidates.length || escaped.length === 0
    ? g.candidates
    : g.candidates.filter((id) => !escaped.includes(id));

  const base = { ...g, deck: rest, flipped: card };

  if (remaining.length === 1) {
    const fahrer = playerById(g, remaining[0]).name;
    const raus = escaped.map((id) => playerById(g, id).name).join(", ");
    return tiebreakErgebnis(
      base,
      remaining[0],
      escaped,
      `${card.rank} aufgedeckt – ${raus} kann ablegen und ist raus. ${fahrer} fährt Bus.`
    );
  }

  const raus = escaped.length && escaped.length < g.candidates.length
    ? escaped.map((id) => playerById(g, id).name).join(", ") + " ist raus."
    : "Keiner konnte ablegen.";

  return {
    ...base,
    candidates: remaining,
    tieMode: tieCanBeResolvedByFlip({ ...base, candidates: remaining }, remaining) ? "flip" : "draw",
    message: `${card.rank} aufgedeckt – ${raus}`,
  };
}

/** Patt: jeder zieht eine Karte, der niedrigste Wert faehrt. */
export function tiebreakDraw(g) {
  if (g.phase !== "tiebreak" || g.tieMode !== "draw" || g.tieResult) return g;

  let deck = refill(g, g.candidates.length);
  const drawn = {};
  g.candidates.forEach((id, i) => (drawn[id] = deck[i]));
  deck = deck.slice(g.candidates.length);

  const lowest = Math.min(...g.candidates.map((id) => rankValue(drawn[id].rank)));
  const losers = g.candidates.filter((id) => rankValue(drawn[id].rank) === lowest);

  if (losers.length === 1) {
    const name = playerById(g, losers[0]).name;
    const raus = g.candidates.filter((id) => id !== losers[0]);
    return tiebreakErgebnis(
      { ...g, deck, drawn },
      losers[0],
      raus,
      `${name} hat mit ${drawn[losers[0]].rank} die niedrigste Karte und fährt Bus.`
    );
  }

  return {
    ...g,
    deck,
    drawn,
    candidates: losers,
    message: "Gleiche Karten gezogen – nochmal.",
  };
}

// ---------------------------------------------------------------------------
// Phase 4 – Die Pyramide
// ---------------------------------------------------------------------------

/**
 * Beim Busfahren sind alle Handkarten weg und es wird ein frisches Deck benutzt:
 * 15 Karten liegen als Pyramide (5-4-3-2-1), die restlichen 37 sind der Nachziehstapel.
 * Nach jedem Fehlversuch werden genau die Karten, die man aufgedeckt hatte, mit
 * neuen Karten aus dem Stapel wieder zugedeckt. Ist der Stapel leer, ist die Runde
 * vorbei - auch wenn man es nicht nach oben geschafft hat.
 */
function startPyramid(g, driverId, extraMessage) {
  const deck = createShuffledDeck();
  const rows = [];
  let cursor = 0;
  for (const size of PYRAMID_ROWS) {
    rows.push(deck.slice(cursor, cursor + size));
    cursor += size;
  }

  const name = playerById(g, driverId).name;
  return {
    ...g,
    players: g.players.map((p) => ({ ...p, cards: [] })), // alle Karten sind abgelegt
    deck: deck.slice(PYRAMID_CARDS),
    // Alles aus den vorherigen Phasen wird eingesammelt - sonst lägen dieselben
    // Karten doppelt im Zustand, obwohl auf dem Tisch nur ein Deck liegt.
    drinkRow: null,
    giveRow: null,
    order: null,
    flipped: null,
    drawn: null,
    candidates: null,
    tieResult: null,
    pending: {},
    draft: {},
    phase: "pyramid",
    driverId,
    rows,
    path: [],
    failedAt: null,
    attempts: 1,
    finished: false,
    outOfCards: false,
    message: extraMessage ?? `${name} hat die meisten Karten und muss in die Pyramide.`,
  };
}

export const pyramidLevel = (g) => g.path.length;

/**
 * Welche Karten der aktuellen Reihe darf man aufdecken?
 * Unten alle fuenf. Danach nur die beiden, die direkt ueber der zuletzt
 * gewaehlten liegen - am Rand bleibt dadurch genau ein Weg uebrig.
 */
export function allowedPyramidIndices(g) {
  if (g.phase !== "pyramid" || g.finished || g.failedAt) return [];
  const level = g.path.length;
  if (level >= PYRAMID_ROWS.length) return [];
  if (level === 0) return g.rows[0].map((_, i) => i);
  const prev = g.path[level - 1];
  const width = g.rows[level].length;
  return [prev - 1, prev].filter((i) => i >= 0 && i < width);
}

export function pickPyramid(g, index) {
  if (g.phase !== "pyramid" || g.finished || g.failedAt) return g;
  if (!allowedPyramidIndices(g).includes(index)) return g;

  const level = g.path.length;
  const card = g.rows[level][index];
  if (!card) return g;

  // Bildkarte - auch ganz oben an der Spitze - setzt zurueck.
  if (isFaceCard(card)) {
    const sips = level + 1;
    const players = g.players.map((p) => (p.id === g.driverId ? { ...p, sips: p.sips + sips } : p));
    const driver = players.find((p) => p.id === g.driverId);
    return {
      ...g,
      players,
      failedAt: { row: level, index },
      message: `Bildkarte! ${driver.name} trinkt ${sips} Schluck${sips > 1 ? "e" : ""}.`,
    };
  }

  const path = [...g.path, index];
  const finished = path.length >= PYRAMID_ROWS.length;
  return {
    ...g,
    path,
    finished,
    message: finished ? null : "Geschafft – weiter nach oben!",
  };
}

/**
 * Nach einer Bildkarte: die aufgedeckten Stellen werden mit Karten aus dem
 * Reststapel wieder zugedeckt. Reicht der Stapel nicht mehr, endet die Runde.
 */
export function restartPyramid(g) {
  if (g.phase !== "pyramid" || !g.failedAt) return g;

  const need = g.path.length + 1; // alle Karten, die in diesem Versuch offen lagen
  if (g.deck.length < need) {
    return {
      ...g,
      failedAt: null,
      finished: true,
      outOfCards: true,
      message: "Das Deck ist leer – die Runde ist trotzdem vorbei.",
    };
  }

  const rows = g.rows.map((r) => r.slice());
  let deck = g.deck;
  for (let r = 0; r < g.path.length; r++) {
    rows[r][g.path[r]] = deck[0];
    deck = deck.slice(1);
  }
  rows[g.failedAt.row][g.failedAt.index] = deck[0];
  deck = deck.slice(1);

  return {
    ...g,
    rows,
    deck,
    path: [],
    failedAt: null,
    attempts: g.attempts + 1,
    message: `Neue Karten liegen drüber – nochmal von unten. Noch ${deck.length} Karten im Stapel.`,
  };
}

export const finishGame = (g) => ({ ...g, phase: "finished", message: null });

/**
 * Wer ist gerade am Zug? Null, wenn die Phase keinen festen Spieler hat -
 * in Phase 2 sind das oft mehrere gleichzeitig, siehe `distributorIds`.
 */
export function activePlayerId(g) {
  if (g.phase === "guess") return g.players[g.turn].id;
  if (g.phase === "pyramid") return g.driverId;
  return null;
}
