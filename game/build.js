// Drueber Drunter - Hausregeln von Jonas.
//
// Aufbau:
//   Fuenf Karten liegen offen untereinander, jede fuer sich eine Reihe.
//
// Ablauf:
//   Wer dran ist, sucht sich eine Reihe aus und eine Seite (links oder rechts
//   davon) und sagt hoeher, tiefer oder gleich. Dann wird die naechste Karte
//   aufgedeckt und neben die aeussere Karte dieser Seite gelegt.
//
//   * Die ERSTE Karte eines Anlaufs muss immer an die laengste Reihe. Sind
//     mehrere gleich lang, darf man sich eine aussuchen. Ab der zweiten Karte
//     darf man ueberall anbauen.
//   * Fuenf richtige Karten hintereinander - dann ist der Naechste dran.
//   * Falsch angebaut: Du trinkst so viele Schluecke, wie die Reihe lang war.
//     Die falsche Karte kommt weg, die laengste Reihe wird abgebaut und auf
//     eine Karte zurueckgesetzt - und du faengst wieder bei null an. Du bleibst
//     also dran, bis du deine fuenf zusammen hast.
//     Damit man sieht, WAS da gekommen ist, haelt das Spiel dabei an: die Karte
//     bleibt gross stehen, bis der Spieler auf "Nochmal" tippt (`wartet`).
//
// Reines JavaScript ohne Nebenwirkungen, laeuft im Browser wie im Server.

import { createDeck, createShuffledDeck, rankValue, shuffle } from "./deck.js";
import { emptySips } from "./sips.js";

export const REIHEN = 5; // so viele Reihen liegen aus
export const TREFFER = 5; // so viele richtige Karten hintereinander
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const TIPPS = ["higher", "lower", "equal"];
const TIPP_TEXT = { higher: "höher", lower: "tiefer", equal: "gleich" };
export const tippName = (t) => TIPP_TEXT[t] ?? t;
export const seiteName = (s) => (s === "left" ? "links" : "rechts");

export const playerById = (g, id) => g.players.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function initBuild(players, rng, hostId = null) {
  if (players.length < MIN_PLAYERS) throw new Error("Mindestens 2 Spieler.");

  const deck = createShuffledDeck(rng);
  const rows = Array.from({ length: REIHEN }, (_, i) => [deck[i]]);

  return {
    game: "build",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? null,
      sips: 0,
      connected: true,
    })),
    hostId,
    phase: "play", // play | finished
    turn: 0, // Sitzplatz, der gerade baut
    rows,
    deck: deck.slice(REIHEN),
    streak: 0, // wie viele richtig hintereinander
    pick: null, // { row, side } - Platz ausgesucht, Tipp fehlt noch
    letzte: null, // { card, gegen, row, side, tipp, ok, sips, weg } fuer die Anzeige
    wartet: false, // nach einem Fehler: Karte anschauen, dann weiter
    fertig: [], // Spieler, die ihre fuenf schon hatten
    ...emptySips(),
    message: "Such dir eine Reihe aus – die erste Karte muss an die längste.",
  };
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

export const currentPlayer = (g) => g.players[g.turn] ?? null;

export const rowLength = (g, row) => g.rows[row]?.length ?? 0;

export const longestLength = (g) => Math.max(...g.rows.map((r) => r.length));

/**
 * Welche Reihen darf ich gerade bebauen? Bei einem frischen Anlauf nur die
 * laengste - sind mehrere gleich lang, darf man sich eine aussuchen. Ab der
 * zweiten Karte ist alles frei.
 */
export function erlaubteReihen(g) {
  const alle = g.rows.map((_, i) => i);
  if (g.streak > 0) return alle;
  const max = longestLength(g);
  return alle.filter((i) => g.rows[i].length === max);
}

/** Die Karte, an die angelegt wird - je nach Seite die erste oder letzte. */
export function randKarte(g, row, side) {
  const r = g.rows[row];
  if (!r || r.length === 0) return null;
  return side === "left" ? r[0] : r[r.length - 1];
}

/** Passt die neue Karte zum Tipp? */
export function stimmt(tipp, neu, referenz) {
  const a = rankValue(neu.rank);
  const b = rankValue(referenz.rank);
  if (tipp === "higher") return a > b;
  if (tipp === "lower") return a < b;
  if (tipp === "equal") return a === b;
  return false;
}

/**
 * Nachschub, wenn der Stapel leer wird: ein frisches Deck ohne die Karten,
 * die gerade auf dem Tisch liegen.
 */
function refill(rows, deck) {
  if (deck.length > 0) return deck;
  const liegt = new Set(rows.flat().map((c) => c.id));
  return shuffle(createDeck().filter((c) => !liegt.has(c.id)));
}

/**
 * Die laengste Reihe abbauen und durch eine einzelne frische Karte ersetzen.
 * Sind mehrere gleich lang, wird die genommen, an der eben gebaut wurde -
 * sonst die oberste.
 */
function abbauen(g, deck, gespielt) {
  const max = Math.max(...g.rows.map((r) => r.length));
  const lang = g.rows.map((r, i) => (r.length === max ? i : -1)).filter((i) => i >= 0);
  const weg = lang.includes(gespielt) ? gespielt : lang[0];
  // Es kann sein, dass der Stapel genau jetzt leer ist - dann erst nachlegen.
  const voll = refill(g.rows, deck);
  return {
    rows: g.rows.map((r, i) => (i === weg ? [voll[0]] : r)),
    deck: voll.slice(1),
    weg,
    laenge: max,
  };
}

// ---------------------------------------------------------------------------
// Spielzuege
// ---------------------------------------------------------------------------

/** Platz aussuchen: welche Reihe, welche Seite. Nochmal tippen hebt es auf. */
export function pickSpot(g, playerId, row, side) {
  if (g.phase !== "play" || g.wartet) return g;
  if (currentPlayer(g)?.id !== playerId) return g;
  if (!erlaubteReihen(g).includes(row)) return g;
  if (side !== "left" && side !== "right") return g;

  const gleich = g.pick && g.pick.row === row && g.pick.side === side;
  return {
    ...g,
    pick: gleich ? null : { row, side },
    message: gleich
      ? "Such dir einen Platz aus."
      : `${seiteName(side)} von Reihe ${row + 1} – höher, tiefer oder gleich?`,
  };
}

/**
 * Der eigentliche Zug: Karte aufdecken und vergleichen.
 *
 * Richtig -> die Karte bleibt liegen, der Zaehler geht hoch. Bei fuenf
 * richtigen ist der Naechste dran.
 * Falsch  -> so viele Schluecke wie die Reihe lang war (die neue Karte zaehlt
 * nicht mit), die Karte kommt weg, die laengste Reihe wird abgebaut, und man
 * faengt wieder bei null an - bleibt aber selbst dran.
 */
export function guessBuild(g, playerId, tipp) {
  if (g.phase !== "play" || g.wartet || !g.pick) return g;
  const spieler = currentPlayer(g);
  if (spieler?.id !== playerId) return g;
  if (!TIPPS.includes(tipp)) return g;

  const { row, side } = g.pick;
  const deck = refill(g.rows, g.deck);
  const karte = deck[0];
  const rest = deck.slice(1);
  const referenz = randKarte(g, row, side);
  const richtig = stimmt(tipp, karte, referenz);
  const laenge = g.rows[row].length;

  const letzte = {
    card: karte,
    gegen: referenz,
    row,
    side,
    tipp,
    ok: richtig,
    sips: richtig ? 0 : laenge,
    weg: null,
  };

  if (richtig) {
    const rows = g.rows.map((r, i) =>
      i !== row ? r : side === "left" ? [karte, ...r] : [...r, karte]
    );
    const streak = g.streak + 1;
    const basis = { ...g, rows, deck: rest, pick: null, letzte };

    if (streak < TREFFER) {
      return {
        ...basis,
        streak,
        message: `Richtig – ${streak} von ${TREFFER}.`,
      };
    }
    return naechsterSpieler({ ...basis, streak: 0 });
  }

  // Falsch: trinken, Karte weg, laengste Reihe abbauen, von vorne.
  const nachAbbau = abbauen(g, rest, row);
  return {
    ...g,
    rows: nachAbbau.rows,
    deck: nachAbbau.deck,
    pick: null,
    letzte: { ...letzte, weg: nachAbbau.weg },
    wartet: true,
    streak: 0,
    players: g.players.map((p) => (p.id === playerId ? { ...p, sips: p.sips + laenge } : p)),
    message:
      `${karte.rank} war nicht ${tippName(tipp)} – ${laenge} Schluck${laenge > 1 ? "e" : ""} für ` +
      `${spieler.name}. Reihe ${nachAbbau.weg + 1} wird abgebaut, weiter bei null.`,
  };
}

/**
 * "Nochmal" nach einem Fehler: die aufgedeckte Karte war lang genug zu sehen,
 * jetzt geht es weiter. Erst danach darf wieder gebaut werden.
 */
export function weiterBuild(g, playerId) {
  if (g.phase !== "play" || !g.wartet) return g;
  if (currentPlayer(g)?.id !== playerId) return g;
  return {
    ...g,
    wartet: false,
    message: "Neuer Anlauf – die erste Karte muss an die längste Reihe.",
  };
}

/** Fuenf geschafft: abhaken und weiterreichen. Waren alle dran, ist Schluss. */
function naechsterSpieler(g) {
  const fertig = [...g.fertig, currentPlayer(g).id];
  const offen = g.players.filter((p) => !fertig.includes(p.id));

  if (offen.length === 0) {
    return { ...g, fertig, phase: "finished", message: "Der Bus steht. Alle waren dran." };
  }

  const naechster = g.players.findIndex((p) => p.id === offen[0].id);
  return {
    ...g,
    fertig,
    turn: naechster,
    message: `${currentPlayer(g).name} hat's geschafft. Jetzt ${offen[0].name}.`,
  };
}

// ---------------------------------------------------------------------------
// Hilfen fuer die Oberflaeche
// ---------------------------------------------------------------------------

/** Wie viele Zuege haben die anderen noch vor sich? */
export const nochOffen = (g) => g.players.filter((p) => !g.fertig.includes(p.id)).length;

export const istDran = (g, playerId) => g.phase === "play" && currentPlayer(g)?.id === playerId;

/** Darf gerade gebaut werden, oder schaut man noch die letzte Karte an? */
export const darfBauen = (g, playerId) => istDran(g, playerId) && !g.wartet;
