// Pferderennen - Hausregeln von Jonas.
//
// Aufbau:
//   Die vier Asse sind die Pferde und stehen nebeneinander auf Feld 0.
//   Aus dem restlichen Deck (48 Karten) werden 5 Karten verdeckt an die
//   Strecke gelegt - eine neben Feld 1, eine neben Feld 2, und so weiter.
//   Die uebrigen 43 Karten sind der Nachziehstapel.
//
// Ablauf:
//   1. "bets"  - jeder setzt eine Anzahl Schluecke auf ein Pferd und trinkt
//                sie sofort. Auch die spaeteren Gewinner. Weil der Einsatz
//                schon im Hals ist, kann man ihn danach nicht mehr aendern.
//   2. "race"  - es wird eine Karte umgedreht; das Ass mit demselben Symbol
//                rueckt ein Feld vor. Wer Feld 6 erreicht - also hinter der
//                letzten Streckenkarte - hat gewonnen.
//                Kommt ein Pferd ins Ziel, auf das NIEMAND gesetzt hat, ist
//                das Rennen nicht vorbei: Dieses Pferd ist durch und laeuft
//                nicht mehr mit, die anderen rennen weiter. Erst das erste
//                Pferd mit einer Wette beendet das Rennen.
//                Sobald ALLE Pferde mindestens auf Hoehe einer Streckenkarte
//                stehen, wird diese aufgedeckt und das Pferd mit ihrem Symbol
//                muss ein Feld zurueck. Bei den Staenden 1/0/2/3 passiert also
//                noch nichts - erst wenn auch das letzte Pferd auf 1 steht.
//   3. "payout"- wer auf den Sieger gesetzt hat, verteilt das Doppelte von
//                dem, was er getrunken hat. Alle anderen gehen leer aus -
//                ihr Einsatz war schlicht umsonst.
//   4. "finished"
//
// Reines JavaScript ohne Nebenwirkungen, laeuft im Browser wie im Server.

import { SUITS, createDeck, shuffle, suitName } from "./deck.js";
import { addPending, emptySips, giveSip, pendingTotal } from "./sips.js";

export const ZIEL = 6; // Feld 6 = hinter der letzten Streckenkarte
export const STRECKENKARTEN = 5;
export const MIN_EINSATZ = 1;
export const MAX_EINSATZ = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const playerById = (g, id) => g.players.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function initRace(players, rng, hostId = null) {
  if (players.length < MIN_PLAYERS) throw new Error("Mindestens 2 Spieler.");

  // Die vier Asse stehen auf der Bahn, sie sind nicht im Stapel.
  const rest = shuffle(
    createDeck().filter((c) => c.rank !== "A"),
    rng
  );

  return {
    game: "race",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? null,
      sips: 0,
      connected: true,
    })),
    hostId,
    phase: "bets",
    bets: {}, // playerId -> { suit, amount }
    horses: Object.fromEntries(SUITS.map((s) => [s, 0])),
    side: rest.slice(0, STRECKENKARTEN).map((card) => ({ card, revealed: false })),
    deck: rest.slice(STRECKENKARTEN),
    nextSide: 1, // naechste Streckenkarte (1..5), 6 = alle offen
    flipped: null,
    lastMove: null, // { suit, dir: 1 | -1 }
    durch: [], // im Ziel, aber ohne Wette - laufen nicht mehr mit
    winner: null,
    ...emptySips(),
    message: "Setzt eure Schlücke auf ein Pferd – und trinkt sie gleich.",
  };
}

// ---------------------------------------------------------------------------
// Phase 1 – Wetten
// ---------------------------------------------------------------------------

/** Alle Wetten auf ein Pferd, damit man sieht, wer worauf gesetzt hat. */
export function betsOn(g, suit) {
  return g.players.filter((p) => g.bets[p.id]?.suit === suit);
}

export const allBetsIn = (g) => g.players.every((p) => g.bets[p.id]);

/**
 * Setzen heisst gleichzeitig trinken: Der Einsatz wandert sofort auf das
 * Schluck-Konto. Genau deshalb kann man die Wette danach nicht mehr aendern -
 * getrunken ist getrunken.
 */
export function placeBet(g, playerId, suit, amount) {
  if (g.phase !== "bets") return g;
  const player = playerById(g, playerId);
  if (!player || !SUITS.includes(suit)) return g;
  if (g.bets[playerId]) return g; // hat schon gesetzt und getrunken

  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < MIN_EINSATZ || n > MAX_EINSATZ) return g;

  return {
    ...g,
    bets: { ...g.bets, [playerId]: { suit, amount: n } },
    players: g.players.map((p) => (p.id === playerId ? { ...p, sips: p.sips + n } : p)),
    message: `${player.name} trinkt ${n} Schluck${n > 1 ? "e" : ""} und setzt auf ${suitName(suit)}.`,
  };
}

export function startRace(g) {
  if (g.phase !== "bets" || !allBetsIn(g)) return g;
  return { ...g, phase: "race", message: "Und los! Der Host deckt die Karten auf." };
}

// ---------------------------------------------------------------------------
// Phase 2 – Das Rennen
// ---------------------------------------------------------------------------

/**
 * Nachschub, falls der Stapel leer wird. Die schon gezogenen Karten werden
 * neu gemischt darunter gelegt; Streckenkarten und Asse bleiben aussen vor.
 */
function refill(g) {
  if (g.deck.length > 0) return g.deck;
  const raus = new Set(g.side.map((s) => s.card.id));
  return shuffle(createDeck().filter((c) => c.rank !== "A" && !raus.has(c.id)));
}

/**
 * Streckenkarten aufdecken, solange alle Pferde weit genug sind. Die
 * aufgedeckte Karte schickt ihr eigenes Pferd ein Feld zurueck - dadurch kann
 * die naechste Karte gleich wieder gesperrt sein, deshalb die Schleife.
 */
function revealSideCards(g) {
  let horses = { ...g.horses };
  let side = g.side;
  let nextSide = g.nextSide;
  const durch = g.durch ?? [];
  const meldungen = [];

  while (nextSide <= STRECKENKARTEN && Math.min(...Object.values(horses)) >= nextSide) {
    const idx = nextSide - 1;
    const karte = side[idx].card;
    side = side.map((s, i) => (i === idx ? { ...s, revealed: true } : s));

    // Ein Pferd, das schon durchs Ziel ist, holt keine Streckenkarte zurueck.
    if (durch.includes(karte.suit)) {
      meldungen.push(`Streckenkarte ${nextSide} ist ${suitName(karte.suit)} – das ist schon durch.`);
    } else {
      horses = { ...horses, [karte.suit]: Math.max(0, horses[karte.suit] - 1) };
      meldungen.push(`Streckenkarte ${nextSide} ist ${suitName(karte.suit)} – ${suitName(karte.suit)} muss zurück!`);
    }
    nextSide++;
  }

  return { horses, side, nextSide, meldungen };
}

/** Hat irgendjemand auf dieses Pferd gesetzt? */
const hatWette = (g, suit) => g.players.some((p) => g.bets[p.id]?.suit === suit);

/** Eine Karte vom Stapel: das passende Pferd rueckt vor. */
export function flipRace(g) {
  if (g.phase !== "race" || g.winner) return g;

  const deck = refill(g);
  const karte = deck[0];
  const rest = deck.slice(1);
  const durch = g.durch ?? [];

  // Pferde, die ohne Wette durchs Ziel sind, laufen nicht mehr mit.
  if (durch.includes(karte.suit)) {
    return {
      ...g,
      deck: rest,
      flipped: karte,
      lastMove: null,
      message: `${suitName(karte.suit)} ist schon durch und läuft nicht mehr mit.`,
    };
  }

  const horses = { ...g.horses, [karte.suit]: g.horses[karte.suit] + 1 };
  const base = { ...g, deck: rest, flipped: karte, horses, lastMove: { suit: karte.suit, dir: 1 } };

  if (horses[karte.suit] >= ZIEL) {
    // Nur ein Pferd, auf das jemand gesetzt hat, beendet das Rennen.
    if (hatWette(g, karte.suit)) return endRace({ ...base, winner: karte.suit });

    const weiter = { ...base, durch: [...durch, karte.suit] };
    const r = revealSideCards(weiter);
    return {
      ...weiter,
      horses: r.horses,
      side: r.side,
      nextSide: r.nextSide,
      message: [
        `${suitName(karte.suit)} ist im Ziel – aber darauf hatte niemand gesetzt. Es geht weiter!`,
        ...r.meldungen,
      ].join(" "),
    };
  }

  const { horses: h2, side, nextSide, meldungen } = revealSideCards(base);
  return {
    ...base,
    horses: h2,
    side,
    nextSide,
    message: [`${suitName(karte.suit)} zieht vor.`, ...meldungen].join(" "),
  };
}

// ---------------------------------------------------------------------------
// Phase 3 – Auszahlung
// ---------------------------------------------------------------------------

/**
 * Wer auf den Sieger gesetzt hat, verteilt das Doppelte von dem, was er zu
 * Beginn getrunken hat. Alle anderen haben ihren Einsatz einfach verloren.
 */
function endRace(g) {
  const gewinner = g.players.filter((p) => g.bets[p.id]?.suit === g.winner);
  const name = suitName(g.winner);

  if (gewinner.length === 0) {
    return {
      ...g,
      phase: "finished",
      message: `${name} gewinnt – aber darauf hatte niemand gesetzt. Pech für die Bank.`,
    };
  }

  let next = { ...g, phase: "payout" };
  for (const p of gewinner) next = { ...next, ...addPending(next, p.id, g.bets[p.id].amount * 2) };

  const liste = gewinner.map((p) => `${p.name} (${g.bets[p.id].amount * 2})`).join(", ");
  return { ...next, message: `${name} gewinnt! Zu verteilen: ${liste}.` };
}

export function handOutSipRace(g, targetId, fromId) {
  if (g.phase !== "payout") return g;
  const next = giveSip(g, targetId, fromId);
  if (next === g) return g;
  if (pendingTotal(next) === 0) return { ...next, phase: "finished", message: null, undo: null };
  return next;
}

// ---------------------------------------------------------------------------
// Hilfen fuer die Oberflaeche
// ---------------------------------------------------------------------------

/** Reihenfolge der Bahnen - fuehrendes Pferd zuerst waere unruhig, also fest. */
export const HORSE_ORDER = SUITS;

/** Steht dieses Pferd schon hinter der naechsten noch verdeckten Karte? */
export const wartetAuf = (g) => (g.nextSide > STRECKENKARTEN ? null : g.nextSide);

export const rennenLaeuft = (g) => g.phase === "race" && !g.winner;
