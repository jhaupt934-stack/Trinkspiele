// Busfahren - Hausregeln von Jonas.
//
// Die kompletten Spielregeln, als reine Funktionen ohne Nebenwirkungen.
// Dieselbe Datei laeuft im Browser (lokales Spiel) und im Server (Online-Spiel),
// dadurch kann es keine zwei Regelwerke geben, die auseinanderlaufen.
//
// Ablauf:
//   1. "guess"   - 4 Runden, jeder zieht reihum eine eigene Karte und raet:
//                  rot/schwarz (1), hoeher/niedriger (2), dazwischen/ausserhalb (3),
//                  Symbol schon dabei (4). Richtig = verteilen, falsch = selber trinken.
//   2. "rows"    - zwei Reihen a 4 Karten (1-4 Schluecke): "selber trinken" und
//                  "verteilen". Passende eigene Karten werden abgelegt.
//   3. "pyramid" - wer die meisten Karten uebrig hat, sucht sich unten eine Karte
//                  und geht nach oben - immer nur auf eine angrenzende Karte.
//                  Bildkarte = zurueck nach unten, Schluecke = wie weit man kam.
//
// Verteilte Schluecke darf man sich nie selbst geben.
//
// KARTENDECK: Es wird durchgehend EIN Deck benutzt. Handkarten, die zwei Reihen und
// die Pyramide kommen aus demselben Stapel, es kann also keine Karte doppelt auf dem
// Tisch liegen. Reicht der Reststapel fuer eine neue Pyramide nicht (bei 8 Spielern
// sind schon 40 Karten weg), werden alle abgelegten Karten neu gemischt.

import { createDeck, createShuffledDeck, draw, isRed, rankValue, shuffle } from "./deck.js";

export const ROUND_TITLES = [
  "Runde 1 – Rot oder Schwarz?",
  "Runde 2 – Höher oder niedriger?",
  "Runde 3 – Dazwischen oder außerhalb?",
  "Runde 4 – Symbol schon dabei?",
];

const PYRAMID_ROWS = [5, 4, 3, 2, 1];
const PYRAMID_CARDS = PYRAMID_ROWS.reduce((a, b) => a + b, 0);
const FACE = new Set(["J", "Q", "K"]);

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
    players: players.map((p) => ({ id: p.id, name: p.name, sips: 0, cards: [], connected: true })),
    hostId,
    deck: createShuffledDeck(rng),
    phase: "guess",
    round: 0,
    turn: 0,
    pendingSips: 0,
    message: null,
  };
}

export const currentPlayer = (g) => g.players[g.turn];
export const playerById = (g, id) => g.players.find((p) => p.id === id);

/** Wer darf gerade Schlucke verteilen? Der darf sie sich nicht selbst geben. */
export function distributorId(g) {
  if (g.phase === "guess" && g.pendingSips > 0) return g.players[g.turn].id;
  if (g.phase === "rows" && g.pendingSips > 0) return g.pendingFromId ?? null;
  return null;
}

export function sipTargets(g) {
  const from = distributorId(g);
  return g.players.filter((p) => p.id !== from);
}

// ---------------------------------------------------------------------------
// Phase 1 – Karten raten
// ---------------------------------------------------------------------------

/** guess: "red"|"black" | "higher"|"lower" | "inside"|"outside" | "seen"|"new" */
export function makeGuess(g, guess) {
  if (g.phase !== "guess" || g.pendingSips > 0) return g;

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
      // Gleicher Wert zaehlt als falsch.
      correct = cur !== ref && guess === (cur > ref ? "higher" : "lower");
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
      pendingSips: sips,
      message: `${player.name} hat richtig geraten und verteilt ${sips} Schluck${plural}.`,
    };
  }

  return nextTurn(
    { ...g, players, deck: rest },
    `${player.name} lag daneben und trinkt ${sips} Schluck${plural}.`
  );
}

export function handOutSip(g, targetId) {
  if (targetId === distributorId(g) || g.pendingSips <= 0) return g;

  const players = g.players.map((p) => (p.id === targetId ? { ...p, sips: p.sips + 1 } : p));
  const left = g.pendingSips - 1;

  if (g.phase === "guess") {
    if (left > 0) return { ...g, players, pendingSips: left };
    return nextTurn({ ...g, players, pendingSips: 0 }, null);
  }
  if (g.phase === "rows") {
    return { ...g, players, pendingSips: left, pendingFromId: left > 0 ? g.pendingFromId : null };
  }
  return g;
}

function nextTurn(g, message) {
  let turn = g.turn + 1;
  let round = g.round;
  if (turn >= g.players.length) {
    turn = 0;
    round += 1;
  }
  if (round > 3) return startRows(g, message);
  return { ...g, phase: "guess", round, turn, pendingSips: 0, message };
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
    pendingSips: 0,
    pendingFromId: null,
    message: message ?? "Jetzt die zwei Reihen. Passende Karten ablegen!",
  };
}

export function currentRowCard(g) {
  if (g.phase !== "rows" || g.cursor >= g.order.length) return null;
  const slot = g.order[g.cursor];
  const card = slot.kind === "drink" ? g.drinkRow[slot.index] : g.giveRow[slot.index];
  return { kind: slot.kind, card };
}

export function revealRow(g) {
  if (g.phase !== "rows" || g.revealedNow || g.cursor >= g.order.length) return g;
  const slot = g.order[g.cursor];
  const flip = (row) => row.map((c, i) => (i === slot.index ? { ...c, revealed: true } : c));
  return {
    ...g,
    drinkRow: slot.kind === "drink" ? flip(g.drinkRow) : g.drinkRow,
    giveRow: slot.kind === "give" ? flip(g.giveRow) : g.giveRow,
    revealedNow: true,
    message: null,
  };
}

/** Wer kann auf die gerade aufgedeckte Karte ablegen? */
export function playersWithMatch(g) {
  const cur = currentRowCard(g);
  if (!cur || !g.revealedNow) return [];
  return g.players.filter((p) => p.cards.some((c) => c.rank === cur.card.card.rank));
}

export function discardCard(g, playerId) {
  if (g.phase !== "rows" || !g.revealedNow || g.pendingSips > 0) return g;
  const cur = currentRowCard(g);
  if (!cur) return g;

  const player = playerById(g, playerId);
  if (!player) return g;
  const idx = player.cards.findIndex((c) => c.rank === cur.card.card.rank);
  if (idx < 0) return g;

  const value = cur.card.value;
  const plural = value > 1 ? "e" : "";
  const players = g.players.map((p) =>
    p.id !== playerId
      ? p
      : {
          ...p,
          cards: p.cards.filter((_, i) => i !== idx),
          sips: cur.kind === "drink" ? p.sips + value : p.sips,
        }
  );

  if (cur.kind === "drink") {
    return { ...g, players, message: `${player.name} legt ab und trinkt ${value} Schluck${plural}.` };
  }
  return {
    ...g,
    players,
    pendingSips: value,
    pendingFromId: playerId,
    message: `${player.name} legt ab und verteilt ${value} Schluck${plural}.`,
  };
}

export function nextRow(g) {
  if (g.phase !== "rows" || g.pendingSips > 0) return g;
  const cursor = g.cursor + 1;
  if (cursor >= g.order.length) return startPyramid({ ...g, cursor, revealedNow: false });
  return { ...g, cursor, revealedNow: false, message: null };
}

// ---------------------------------------------------------------------------
// Phase 3 – Die Pyramide
// ---------------------------------------------------------------------------

/**
 * Liefert einen Stapel mit mindestens `need` Karten und nimmt dabei nie eine
 * Karte, die vor einem Spieler liegt. Reicht der Rest nicht, wird alles
 * Abgelegte neu gemischt - so wie am echten Tisch.
 */
function deckWithAtLeast(g, need) {
  if (g.deck.length >= need) return g.deck;
  const inHands = new Set();
  for (const p of g.players) for (const c of p.cards) inHands.add(c.id);
  return shuffle(createDeck().filter((c) => !inHands.has(c.id)));
}

function dealPyramid(g) {
  const deck = deckWithAtLeast(g, PYRAMID_CARDS);
  const rows = [];
  let cursor = 0;
  for (const size of PYRAMID_ROWS) {
    rows.push(deck.slice(cursor, cursor + size));
    cursor += size;
  }
  return { rows, deck: deck.slice(cursor) };
}

function startPyramid(g) {
  const driver = g.players.reduce((worst, p) => (p.cards.length > worst.cards.length ? p : worst), g.players[0]);
  const { rows, deck } = dealPyramid(g);
  return {
    ...g,
    deck,
    phase: "pyramid",
    driverId: driver.id,
    rows,
    path: [],
    failedAt: null,
    attempts: 1,
    finished: false,
    message: `${driver.name} hat die meisten Karten und muss in die Pyramide.`,
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
  return { ...g, path, finished, message: finished ? null : "Geschafft – weiter nach oben!" };
}

/** Nach einer Bildkarte: neue Pyramide aus demselben Stapel, wieder von unten. */
export function restartPyramid(g) {
  if (g.phase !== "pyramid" || !g.failedAt) return g;
  const { rows, deck } = dealPyramid(g);
  return {
    ...g,
    deck,
    rows,
    path: [],
    failedAt: null,
    attempts: g.attempts + 1,
    message: "Neue Pyramide – such dir unten eine Karte aus.",
  };
}

export const finishGame = (g) => ({ ...g, phase: "finished", message: null });

/** Wer ist gerade am Zug? Null, wenn die Phase keinen festen Spieler hat. */
export function activePlayerId(g) {
  if (g.phase === "guess") return g.players[g.turn].id;
  if (g.phase === "rows") return g.pendingSips > 0 ? g.pendingFromId : null;
  if (g.phase === "pyramid") return g.driverId;
  return null;
}
