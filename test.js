// Automatische Pruefung der Spielregeln. Aufruf: npm test
//
// Spielt komplette Partien durch und prueft dabei die Dinge, die man beim
// Klicken leicht uebersieht: doppelte Karten, falsche Wege in der Pyramide,
// Zuege ausser der Reihe.

import {
  initGame,
  makeGuess,
  handOutSip,
  revealRow,
  discardCard,
  playersWithMatch,
  nextRow,
  tiebreakFlip,
  tiebreakDraw,
  pickPyramid,
  restartPyramid,
  allowedPyramidIndices,
  sipTargets,
  pendingFor,
  pendingTotal,
  distributorIds,
  playerById,
  finishGame,
  isFaceCard,
} from "./game/engine.js";
import { handleAction } from "./game/actions.js";
import { createShuffledDeck } from "./game/deck.js";

let fails = 0;
const ok = (cond, text) => {
  if (!cond) {
    console.log("  FEHLER: " + text);
    fails++;
  }
};
const section = (t) => console.log("\n" + t);

/**
 * Alle Karten, die im aktuellen Zustand irgendwo liegen. Abgelegte Karten
 * zaehlen nicht mit - die sind aus dem Spiel. Keine Id darf doppelt auftauchen.
 */
function kartenImSpiel(g) {
  const ids = [];
  for (const p of g.players) for (const c of p.cards) ids.push(c.id);
  for (const c of g.deck) ids.push(c.id);
  if (g.phase === "rows") {
    for (const c of g.drinkRow ?? []) ids.push(c.card.id);
    for (const c of g.giveRow ?? []) ids.push(c.card.id);
  }
  if (g.phase === "tiebreak") {
    for (const c of g.drinkRow ?? []) ids.push(c.card.id);
    for (const c of g.giveRow ?? []) ids.push(c.card.id);
    if (g.flipped) ids.push(g.flipped.id);
    for (const id of Object.keys(g.drawn ?? {})) ids.push(g.drawn[id].id);
  }
  if (g.phase === "pyramid") for (const r of g.rows) for (const c of r) ids.push(c.id);
  return ids;
}

function pruefeEindeutig(g, wo) {
  const ids = kartenImSpiel(g);
  const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok(doppelt.length === 0, `${wo}: Karte(n) doppelt im Spiel – ${[...new Set(doppelt)].join(", ")}`);
  ok(ids.length <= 52, `${wo}: mehr als 52 Karten im Spiel (${ids.length})`);
  return ids.length;
}

// --- 1. Deck ---------------------------------------------------------------
section("Kartendeck");
{
  const d = createShuffledDeck();
  ok(d.length === 52, "Deck hat nicht 52 Karten");
  ok(new Set(d.map((c) => c.id)).size === 52, "Deck enthaelt Karten doppelt");

  const N = 100000;
  const counts = new Array(52).fill(0);
  for (let i = 0; i < N; i++) counts[createShuffledDeck().findIndex((c) => c.id === "spades-A")]++;
  const exp = N / 52;
  const chi = counts.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
  ok(chi < 68.7, `Mischen ungleich verteilt (Chi-Quadrat ${chi.toFixed(1)}, Grenze 68.7)`);
  console.log(`  52 eindeutige Karten, Chi-Quadrat ${chi.toFixed(1)} bei Grenze 68.7 – gleichverteilt`);
}

// --- 2. Pyramiden-Wege -----------------------------------------------------
section("Pyramide: erlaubte Wege");
{
  const widths = [5, 4, 3, 2, 1];
  let geprueft = 0;
  for (let level = 1; level < 5; level++) {
    for (let prev = 0; prev < widths[level - 1]; prev++) {
      const g = {
        phase: "pyramid",
        finished: false,
        failedAt: null,
        path: Array.from({ length: level }, (_, i) => (i === level - 1 ? prev : 0)),
        rows: widths.map((w) => new Array(w).fill({ rank: "2", suit: "clubs" })),
      };
      const allowed = allowedPyramidIndices(g);
      const soll = [prev - 1, prev].filter((i) => i >= 0 && i < widths[level]);
      ok(JSON.stringify(allowed) === JSON.stringify(soll), `Reihe ${level}, Index ${prev}`);
      const rand = prev === 0 || prev === widths[level - 1] - 1;
      ok(allowed.length === (rand ? 1 : 2), `Reihe ${level}, Index ${prev}: falsche Anzahl Wege`);
      geprueft++;
    }
  }
  console.log(`  ${geprueft} Positionen geprueft – am Rand genau ein Weg, in der Mitte zwei`);
}

// --- 3. Meldungen: erst am Ende, gebuendelt pro Empfaenger ------------------
section("Schluck-Meldungen");
{
  // Kuenstlicher Zustand: A verteilt 4 Schluecke, B gleichzeitig 2.
  const spieler = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, sips: 0, cards: [], connected: true }));
  let g = {
    players: spieler,
    hostId: "A",
    deck: [],
    phase: "rows",
    revealedNow: true,
    pending: { A: 4, B: 2 },
    runs: { A: 1, B: 2 },
    dist: 2,
    draft: {},
    sipLog: [],
    sipSeq: 0,
  };

  ok(distributorIds(g).length === 2, "es verteilen nicht zwei gleichzeitig");

  // A gibt: C, C, D, und dazwischen verteilt B einen an C.
  g = handOutSip(g, "C", "A");
  g = handOutSip(g, "C", "A");
  ok(g.sipLog.length === 0, "Meldung kam schon waehrend des Verteilens");

  g = handOutSip(g, "C", "B"); // B ist noch nicht fertig (2. Schluck fehlt)
  ok(g.sipLog.length === 0, "Meldung kam, obwohl B noch nicht fertig ist");

  g = handOutSip(g, "D", "B"); // B fertig -> genau zwei Meldungen von B
  const vonB = g.sipLog.filter((e) => e.fromId === "B");
  ok(g.sipLog.length === 2, `nach B's letztem Schluck sind es ${g.sipLog.length} statt 2 Meldungen`);
  ok(vonB.length === 2, "B hat nicht genau zwei Empfaenger gemeldet");
  ok(vonB.every((e) => e.count === 1), "B's Meldungen haben die falsche Anzahl");
  ok(pendingFor(g, "B") === 0, "B hat noch offene Schluecke");
  ok(pendingFor(g, "A") === 2, "A wurde vom Verteilen anderer beeinflusst");

  g = handOutSip(g, "D", "A");
  ok(g.sipLog.length === 2, "A hat zu frueh gemeldet");
  g = handOutSip(g, "D", "A"); // A fertig: 2x an C, 2x an D
  const vonA = g.sipLog.filter((e) => e.fromId === "A");
  ok(vonA.length === 2, `A meldet an ${vonA.length} Empfaenger statt an 2`);
  ok(vonA.find((e) => e.toId === "C")?.count === 2, "A: falsche Anzahl fuer C");
  ok(vonA.find((e) => e.toId === "D")?.count === 2, "A: falsche Anzahl fuer D");
  ok(new Set(g.sipLog.map((e) => e.seq)).size === g.sipLog.length, "doppelte Meldungs-Nummern");

  ok(playerById(g, "C").sips === 3, "C hat die falsche Schluckzahl");
  ok(playerById(g, "D").sips === 3, "D hat die falsche Schluckzahl");
  ok(playerById(g, "A").sips === 0 && playerById(g, "B").sips === 0, "Verteiler haben selbst getrunken");
  ok(pendingTotal(g) === 0, "es sind noch Schluecke offen");
  ok(handOutSip(g, "C", "A") === g, "A konnte nach dem Ende weiter verteilen");

  console.log("  4 Meldungen statt 6 Einzelmeldungen, jede mit der richtigen Anzahl");
  console.log("  A und B haben sich beim gleichzeitigen Verteilen nicht gestoert");
}

// --- 4. Komplette Partien --------------------------------------------------
section("Komplette Partien");
{
  let partien = 0,
    deckPruefungen = 0,
    blockiert = 0,
    erlaubt = 0,
    mitStechen = 0,
    perZiehen = 0,
    gleichzeitig = 0,
    geschafft = 0,
    deckLeer = 0;
  const versuche = [];

  for (let t = 0; t < 200; t++) {
    const n = 2 + (t % 7); // 2 bis 8 Spieler
    let g = initGame(Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i })));
    let guard = 0;

    // Phase 1
    while (g.phase === "guess") {
      if (++guard > 900) throw new Error("Phase 1 endet nicht");
      deckPruefungen += pruefeEindeutig(g, "Phase 1") > 0 ? 1 : 1;
      if (pendingTotal(g) > 0) {
        const from = distributorIds(g)[0];
        const targets = sipTargets(g, from);
        ok(!targets.some((x) => x.id === from), "Verteiler steht in der eigenen Zielliste");
        const vorher = g.players.find((p) => p.id === from).sips;
        ok(handOutSip(g, from, from).players.find((p) => p.id === from).sips === vorher,
           "Verteiler konnte sich selbst Schluecke geben");
        blockiert++;
        g = handOutSip(g, targets[guard % targets.length].id, from);
        continue;
      }
      const dran = g.players[g.turn].id;
      const anderer = g.players.find((p) => p.id !== dran);
      ok(handleAction(g, anderer.id, { type: "guess", value: "red" }).rejected !== null,
         "Spieler ausser der Reihe durfte raten");
      blockiert++;
      g = makeGuess(g, ["red", "higher", "inside", "seen"][g.round]);
      erlaubt++;
    }
    for (const p of g.players) ok(p.cards.length === 4, "Spieler hat nicht 4 Karten");

    // Phase 2
    guard = 0;
    while (g.phase === "rows") {
      if (++guard > 900) throw new Error("Phase 2 endet nicht");
      deckPruefungen++;
      pruefeEindeutig(g, "Phase 2");

      if (!g.revealedNow) {
        g = revealRow(g);
        continue;
      }

      // Zuerst legen alle ab, die koennen - ausdruecklich auch dann, wenn
      // schon jemand anderes einen offenen Verteil-Auftrag hat.
      const passt = playersWithMatch(g);
      if (passt.length > 0) {
        const owner = passt[0].id;
        const fremder = g.players.find((p) => p.id !== owner);
        ok(handleAction(g, fremder.id, { type: "discard", playerId: owner }).rejected !== null,
           "Fremder konnte die Karte eines anderen ablegen");
        blockiert++;
        g = discardCard(g, owner);
        continue;
      }

      // Danach verteilen alle ihre Schluecke, kreuz und quer durcheinander.
      if (pendingTotal(g) > 0) {
        const ids = distributorIds(g);
        if (ids.length > 1) gleichzeitig++;
        const from = ids[guard % ids.length];

        ok(nextRow(g) === g, "Weiterblaettern ging trotz offener Schluecke");
        ok(revealRow({ ...g, revealedNow: false }) === undefined ||
           revealRow({ ...g, revealedNow: false }).revealedNow !== true,
           "Aufdecken ging trotz offener Schluecke");
        const anderer = g.players.find((p) => p.id !== from && pendingFor(g, p.id) === 0);
        if (anderer) {
          ok(handleAction(g, anderer.id, { type: "handOutSip", targetId: from }).rejected !== null,
             "Jemand ohne offene Schluecke durfte verteilen");
          blockiert++;
        }

        g = handOutSip(g, sipTargets(g, from)[guard % (g.players.length - 1)].id, from);
        erlaubt++;
        continue;
      }

      g = nextRow(g);
    }
    ok(pendingTotal(g) === 0, "Phase 2 endet mit offenen Schluecken");

    // Phase 3: Stechen bei Gleichstand
    if (g.phase === "tiebreak") {
      mitStechen++;
      const most = Math.max(...g.players.map((p) => p.cards.length));
      ok(g.candidates.every((id) => playerById(g, id).cards.length === most),
         "Kandidat im Stechen hat nicht die meisten Karten");
      guard = 0;
      while (g.phase === "tiebreak") {
        if (++guard > 500) throw new Error("Stechen endet nicht");
        deckPruefungen++;
        pruefeEindeutig(g, "Stechen");
        if (g.tieMode === "draw") perZiehen++;
        g = g.tieMode === "flip" ? tiebreakFlip(g) : tiebreakDraw(g);
      }
    }

    // Phase 4: Pyramide
    ok(g.phase === "pyramid", "Pyramide nicht erreicht");
    ok(g.players.every((p) => p.cards.length === 0), "Spieler haben in der Pyramide noch Karten");
    ok(g.deck.length === 37, `Reststapel ist ${g.deck.length}, erwartet 37`);
    ok(kartenImSpiel(g).length === 52, "Pyramide plus Reststapel sind nicht 52 Karten");

    guard = 0;
    while (g.phase === "pyramid" && !g.finished) {
      if (++guard > 5000) throw new Error("Pyramide endet nicht");
      deckPruefungen++;
      pruefeEindeutig(g, "Pyramide");

      if (g.failedAt) {
        const vorher = g.deck.length;
        const offen = g.path.length + 1;
        g = restartPyramid(g);
        if (!g.outOfCards) ok(g.deck.length === vorher - offen, "falsche Anzahl Karten nachgelegt");
        continue;
      }
      const allowed = allowedPyramidIndices(g);
      ok(allowed.length > 0, "kein Weg nach oben moeglich");

      const verboten = [0, 1, 2, 3, 4].find((i) => !allowed.includes(i) && i < g.rows[g.path.length].length);
      if (verboten !== undefined) {
        ok(pickPyramid(g, verboten) === g, "nicht angrenzende Karte wurde akzeptiert");
        blockiert++;
      }
      const fremder = g.players.find((p) => p.id !== g.driverId);
      ok(handleAction(g, fremder.id, { type: "pickPyramid", index: allowed[0] }).rejected !== null,
         "Nicht-Fahrer durfte in der Pyramide ziehen");
      blockiert++;

      const level = g.path.length;
      const karte = g.rows[level][allowed[0]];
      const vorher = playerById(g, g.driverId).sips;
      g = pickPyramid(g, allowed[0]);
      if (isFaceCard(karte)) {
        ok(g.failedAt !== null, "Bildkarte hat keinen Neustart ausgeloest");
        ok(playerById(g, g.driverId).sips === vorher + level + 1, "falsche Schluckzahl nach Bildkarte");
      }
      erlaubt++;
    }

    ok(g.finished === true, "Pyramide nicht sauber beendet");
    if (g.outOfCards) deckLeer++;
    else {
      geschafft++;
      ok(g.path.length === 5, "oben angekommen, aber Weg ist nicht 5 Schritte lang");
      for (let i = 1; i < g.path.length; i++) {
        const d = g.path[i - 1] - g.path[i];
        ok(d === 0 || d === 1, "Weg durch die Pyramide ist nicht lueckenlos angrenzend");
      }
    }
    versuche.push(g.attempts);
    g = finishGame(g);
    ok(g.phase === "finished", "Endphase nicht erreicht");
    for (const p of g.players) ok(p.sips >= 0, "negative Schluckzahl");
    partien++;
  }

  const schnitt = (versuche.reduce((a, b) => a + b, 0) / versuche.length).toFixed(1);
  console.log(`  ${partien} Partien mit 2 bis 8 Spielern durchgespielt`);
  console.log(`  ${deckPruefungen} Deck-Pruefungen – nie lag eine Karte doppelt im Spiel`);
  console.log(`  ${erlaubt} erlaubte Zuege durchgelassen, ${blockiert} unerlaubte blockiert`);
  console.log(`  ${mitStechen} Partien mit Stechen (${perZiehen} davon per Kartenziehen entschieden)`);
  console.log(`  ${gleichzeitig} mal haben mehrere gleichzeitig Schluecke verteilt`);
  console.log(`  Pyramide: ${geschafft} mal geschafft, ${deckLeer} mal Deck leer, im Schnitt ${schnitt} Versuche`);
}

console.log("");
if (fails === 0) {
  console.log("ALLES GRUEN – die Spielregeln funktionieren.");
} else {
  console.log(`${fails} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
