// Prueft die Regeln vom Pferderennen. Aufruf: node test-race.js

import {
  initRace,
  placeBet,
  startRace,
  flipRace,
  handOutSipRace,
  allBetsIn,
  betsOn,
  playerById,
  ZIEL,
  STRECKENKARTEN,
  MAX_EINSATZ,
} from "./game/race.js";
import { handleAction, mayAct } from "./game/actions.js";
import { pendingFor, pendingTotal, distributorIds, sipTargets } from "./game/sips.js";
import { SUITS } from "./game/deck.js";

let fails = 0;
const ok = (cond, text) => {
  if (!cond) {
    console.log("  FEHLER: " + text);
    fails++;
  }
};
const section = (t) => console.log("\n" + t);
const spieler = (n) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i }));

/** Alle Karten, die gerade im Spiel sind - keine darf doppelt vorkommen. */
function kartenImSpiel(g) {
  const ids = g.deck.map((c) => c.id);
  for (const s of g.side) ids.push(s.card.id);
  if (g.flipped) ids.push(g.flipped.id);
  return ids;
}

// --- 1. Aufbau -------------------------------------------------------------
section("Aufbau");
{
  const g = initRace(spieler(4), undefined, "p0");
  ok(g.deck.length === 43, `Nachziehstapel hat ${g.deck.length} statt 43 Karten`);
  ok(g.side.length === STRECKENKARTEN, "es liegen nicht 5 Streckenkarten");
  ok(g.side.every((s) => !s.revealed), "eine Streckenkarte liegt schon offen");
  ok(Object.values(g.horses).every((v) => v === 0), "ein Pferd steht nicht auf Feld 0");
  ok([...g.deck, ...g.side.map((s) => s.card)].every((c) => c.rank !== "A"),
     "ein Ass liegt im Stapel statt auf der Bahn");
  const ids = [...g.deck, ...g.side.map((s) => s.card)].map((c) => c.id);
  ok(new Set(ids).size === 48, "die 48 Karten sind nicht eindeutig");
  console.log("  4 Asse auf der Bahn, 5 Streckenkarten verdeckt, 43 Karten im Stapel");
}

// --- 2. Wetten -------------------------------------------------------------
section("Wetten");
{
  let g = initRace(spieler(3), undefined, "p0");
  ok(!allBetsIn(g), "ohne Wetten gilt schon alles als gesetzt");
  ok(startRace(g) === g, "das Rennen startete ohne alle Wetten");

  g = placeBet(g, "p0", "hearts", 5);
  g = placeBet(g, "p1", "hearts", 2);
  ok(betsOn(g, "hearts").length === 2, "zwei Wetten aufs selbe Pferd wurden nicht erfasst");
  ok(betsOn(g, "spades").length === 0, "auf Pik hat niemand gesetzt");

  // Der Einsatz wird sofort getrunken - auch von denen, die spaeter gewinnen.
  ok(playerById(g, "p0").sips === 5, `p0 hat ${playerById(g, "p0").sips} statt 5 Schluecke getrunken`);
  ok(playerById(g, "p1").sips === 2, "p1 hat seinen Einsatz nicht getrunken");
  ok(playerById(g, "p2").sips === 0, "p2 hat getrunken, ohne zu setzen");

  ok(placeBet(g, "p2", "hearts", 0) === g, "Einsatz 0 wurde angenommen");
  ok(placeBet(g, "p2", "hearts", MAX_EINSATZ + 1) === g, `Einsatz ueber ${MAX_EINSATZ} wurde angenommen`);
  ok(placeBet(g, "p2", "herzchen", 3) === g, "erfundene Farbe wurde angenommen");
  ok(placeBet(g, "px", "hearts", 3) === g, "fremder Spieler konnte setzen");
  ok(!allBetsIn(g), "p2 hat noch nicht gesetzt, gilt aber als vollstaendig");

  // Getrunken ist getrunken: umentscheiden geht nicht mehr.
  const vorher = playerById(g, "p0").sips;
  const versuch = placeBet(g, "p0", "spades", 7);
  ok(versuch === g, "die Wette liess sich nachtraeglich aendern");
  ok(playerById(versuch, "p0").sips === vorher, "beim Aendern wurde nochmal getrunken");
  ok(betsOn(g, "hearts").length === 2, "die urspruengliche Wette ist verschwunden");

  ok(mayAct(g, "p1", { type: "bet", playerId: "p0", suit: "clubs", amount: 3 }) === false,
     "p1 durfte fuer p0 setzen");
  ok(mayAct(g, "p1", { type: "bet", playerId: "p1", suit: "clubs", amount: 3 }) === true,
     "p1 durfte nicht fuer sich selbst setzen");

  g = placeBet(g, "p2", "clubs", 1);
  ok(allBetsIn(g), "alle haben gesetzt, es zaehlt aber nicht");
  ok(g.players.reduce((s, p) => s + p.sips, 0) === 8, "die getrunkenen Einsaetze summieren sich nicht auf 8");
  ok(mayAct(g, "p1", { type: "startRace" }) === false, "ein Gast konnte das Rennen starten");
  ok(mayAct(g, "p0", { type: "startRace" }) === true, "der Host konnte das Rennen nicht starten");
  g = startRace(g);
  ok(g.phase === "race", "das Rennen laeuft nicht");
  ok(placeBet(g, "p1", "hearts", 9) === g, "nach dem Start konnte noch gesetzt werden");
  console.log("  Einsatz 1 bis 20, nur fuer sich selbst, Start erst wenn alle gesetzt haben");
}

// --- 3. Aufdecken der Streckenkarten ---------------------------------------
section("Streckenkarten");
{
  // Handgebauter Stand: Herz muss noch auf 1, dann ist die erste Karte faellig.
  const basis = initRace(spieler(2), undefined, "p0");
  let g = {
    ...basis,
    phase: "race",
    horses: { hearts: 0, diamonds: 2, clubs: 1, spades: 3 },
    side: [
      { card: { id: "clubs-7", suit: "clubs", rank: "7" }, revealed: false },
      { card: { id: "spades-9", suit: "spades", rank: "9" }, revealed: false },
      ...basis.side.slice(2),
    ],
    nextSide: 1,
    deck: [{ id: "hearts-3", suit: "hearts", rank: "3" }, ...basis.deck],
  };

  // Stand 0/2/1/3: noch nicht alle auf Hoehe 1 -> nichts passiert.
  ok(g.side[0].revealed === false, "Karte 1 lag schon offen");

  g = flipRace(g); // Herz zieht auf 1 -> jetzt sind alle mindestens auf 1
  ok(g.horses.hearts === 1, "Herz ist nicht vorgerueckt");
  ok(g.side[0].revealed === true, "Karte 1 wurde nicht aufgedeckt");
  ok(g.horses.clubs === 0, "Kreuz wurde nicht zurueckgesetzt");
  ok(g.nextSide === 2, "der Zeiger steht nicht auf Karte 2");
  ok(g.side[1].revealed === false, "Karte 2 wurde zu frueh aufgedeckt");
  console.log("  Karte 1 kam erst hoch, als auch das letzte Pferd auf Hoehe 1 stand");

  // Kettenreaktion: alle auf 2, Karte 2 deckt auf und setzt zurueck.
  let k = {
    ...g,
    horses: { hearts: 2, diamonds: 2, clubs: 2, spades: 2 },
    nextSide: 2,
    deck: [{ id: "diamonds-4", suit: "diamonds", rank: "4" }, ...g.deck],
  };
  k = flipRace(k);
  ok(k.side[1].revealed === true, "Karte 2 wurde nicht aufgedeckt");
  ok(k.horses.spades === 1, "Pik wurde von Karte 2 nicht zurueckgesetzt");
  ok(k.nextSide === 3, "der Zeiger ist nicht weitergerueckt");
  ok(k.side[2].revealed === false, "Karte 3 kam hoch, obwohl Pik zurueckgefallen ist");
  console.log("  Nach dem Rueckschlag bleibt die naechste Karte verdeckt");

  // Ein Pferd auf 0 kann nicht weiter zurueck.
  let n = {
    ...basis,
    phase: "race",
    horses: { hearts: 0, diamonds: 0, clubs: 0, spades: 0 },
    side: [{ card: { id: "hearts-5", suit: "hearts", rank: "5" }, revealed: false }, ...basis.side.slice(1)],
    nextSide: 1,
    deck: [
      { id: "hearts-6", suit: "hearts", rank: "6" },
      { id: "diamonds-6", suit: "diamonds", rank: "6" },
      { id: "clubs-6", suit: "clubs", rank: "6" },
      { id: "spades-6", suit: "spades", rank: "6" },
      ...basis.deck,
    ],
  };
  for (let i = 0; i < 4; i++) n = flipRace(n);
  ok(n.horses.hearts === 0, `Herz steht auf ${n.horses.hearts} statt auf 0 nach dem Rueckschlag`);
  ok(Object.values(n.horses).every((v) => v >= 0), "ein Pferd steht auf einem negativen Feld");
  console.log("  Auf Feld 0 kann kein Pferd weiter zurueckfallen");
}

// --- 4. Auszahlung ---------------------------------------------------------
section("Auszahlung");
{
  let g = initRace(spieler(4), undefined, "p0");
  g = placeBet(g, "p0", "hearts", 3);
  g = placeBet(g, "p1", "hearts", 2);
  g = placeBet(g, "p2", "spades", 5);
  g = placeBet(g, "p3", "clubs", 1);
  g = startRace(g);
  // Einsaetze sind schon getrunken: 3 / 2 / 5 / 1
  const einsatz = { p0: 3, p1: 2, p2: 5, p3: 1 };
  for (const id of Object.keys(einsatz)) {
    ok(playerById(g, id).sips === einsatz[id], `${id} hat seinen Einsatz nicht getrunken`);
  }

  // Herz sechsmal nach vorne = Sieg.
  g = {
    ...g,
    deck: Array.from({ length: 6 }, (_, i) => ({ id: "hearts-x" + i, suit: "hearts", rank: "3" })),
    horses: { hearts: 0, diamonds: 0, clubs: 0, spades: 0 },
  };
  for (let i = 0; i < 6; i++) g = flipRace(g);

  ok(g.winner === "hearts", "Herz hat nicht gewonnen");
  ok(g.horses.hearts === ZIEL, `Herz steht auf ${g.horses.hearts} statt auf ${ZIEL}`);
  ok(g.phase === "payout", "es geht nicht in die Auszahlung");
  ok(pendingFor(g, "p0") === 6, "p0 verteilt nicht den doppelten Einsatz (6)");
  ok(pendingFor(g, "p1") === 4, "p1 verteilt nicht den doppelten Einsatz (4)");
  ok(pendingFor(g, "p2") === 0, "ein Verlierer darf verteilen");
  ok(distributorIds(g).length === 2, "es verteilen nicht genau die zwei Gewinner");
  ok(flipRace(g) === g, "nach dem Ziel konnte weiter aufgedeckt werden");
  console.log("  Zwei Gewinner verteilen gleichzeitig 6 und 4 Schluecke");

  // Verlierer duerfen nicht verteilen, Gewinner nicht an sich selbst.
  ok(handleAction(g, "p2", { type: "handOutSip", targetId: "p3" }).rejected !== null,
     "ein Verlierer konnte Schluecke verteilen");
  ok(handOutSipRace(g, "p0", "p0") === g, "p0 konnte sich selbst Schluecke geben");
  ok(!sipTargets(g, "p0").some((p) => p.id === "p0"), "der Verteiler steht in der eigenen Liste");

  // p1 verteilt komplett: 3 an p2, 1 an p3 -> genau zwei Meldungen.
  for (let i = 0; i < 3; i++) g = handOutSipRace(g, "p2", "p1");
  ok(g.sipLog.length === 0, "Meldung kam mitten in der Verteilung");
  g = handOutSipRace(g, "p3", "p1");
  ok(g.sipLog.length === 2, `${g.sipLog.length} Meldungen statt 2`);
  ok(g.sipLog.find((e) => e.toId === "p2").count === 3, "falsche Anzahl in der Meldung an p2");
  ok(g.phase === "payout", "die Auszahlung ist zu frueh vorbei");

  // p0 verteilt alle 6 an p3.
  for (let i = 0; i < 6; i++) g = handOutSipRace(g, "p3", "p0");
  ok(pendingTotal(g) === 0, "es sind noch Schluecke offen");
  ok(g.phase === "finished", "das Spiel ist nach der Auszahlung nicht fertig");
  // Einsatz plus das, was in der Auszahlung dazukam.
  ok(playerById(g, "p3").sips === 1 + 1 + 6, `p3 hat ${playerById(g, "p3").sips} statt 8 Schluecke`);
  ok(playerById(g, "p2").sips === 5 + 3, `p2 hat ${playerById(g, "p2").sips} statt 8 Schluecke`);
  ok(playerById(g, "p0").sips === 3, "p0 hat mehr als seinen Einsatz getrunken");
  ok(playerById(g, "p1").sips === 2, "p1 hat mehr als seinen Einsatz getrunken");
  console.log("  Einsaetze vorab getrunken, danach 10 Schluecke aus der Auszahlung verteilt");

  // Niemand auf dem Sieger: das Rennen endet einfach.
  let leer = initRace(spieler(2), undefined, "p0");
  leer = placeBet(leer, "p0", "hearts", 4);
  leer = placeBet(leer, "p1", "hearts", 4);
  leer = startRace(leer);
  leer = { ...leer, deck: Array.from({ length: 6 }, (_, i) => ({ id: "spades-x" + i, suit: "spades", rank: "3" })),
           horses: { hearts: 0, diamonds: 0, clubs: 0, spades: 0 } };
  for (let i = 0; i < 6; i++) leer = flipRace(leer);
  ok(leer.winner === "spades" && leer.phase === "finished", "ohne Wette auf den Sieger haengt das Spiel");
  ok(pendingTotal(leer) === 0, "ohne Gewinner werden trotzdem Schluecke verteilt");
  ok(leer.players.every((p) => p.sips === 4), "die Einsaetze wurden nachtraeglich veraendert");
  console.log("  Gewinnt ein Pferd ohne Wette, ist die Runde einfach vorbei");
}

// --- 5. Viele komplette Rennen ---------------------------------------------
section("Komplette Rennen");
{
  let rennen = 0,
    zuege = 0,
    pruefungen = 0,
    blockiert = 0,
    mitGewinnern = 0,
    ohneGewinner = 0,
    parallel = 0,
    rueckschlaege = 0;
  const laengen = [];

  for (let t = 0; t < 300; t++) {
    const n = 2 + (t % 7);
    let g = initRace(spieler(n), undefined, "p0");

    for (let i = 0; i < n; i++) g = placeBet(g, "p" + i, SUITS[(t + i) % 4], 1 + ((t + i) % MAX_EINSATZ));
    ok(allBetsIn(g), "nicht alle Wetten sind angekommen");

    // Ausser der Reihe geht nichts.
    ok(handleAction(g, "p1", { type: "flip" }).rejected !== null, "ein Gast konnte vor dem Start aufdecken");
    blockiert++;
    g = startRace(g);

    let guard = 0;
    let offenVorher = 0;
    while (g.phase === "race") {
      if (++guard > 4000) throw new Error("Das Rennen endet nicht");
      pruefungen++;
      const ids = kartenImSpiel(g);
      ok(new Set(ids).size === ids.length, "eine Karte liegt doppelt im Spiel");
      ok(Object.values(g.horses).every((v) => v >= 0 && v <= ZIEL), "ein Pferd steht ausserhalb der Bahn");
      ok(g.side.filter((s) => s.revealed).length === g.nextSide - 1,
         "aufgedeckte Karten passen nicht zum Zeiger");

      // Die naechste verdeckte Karte darf nie faellig sein und trotzdem liegen bleiben.
      if (g.nextSide <= STRECKENKARTEN) {
        ok(Math.min(...Object.values(g.horses)) < g.nextSide,
           `Karte ${g.nextSide} haette aufgedeckt werden muessen`);
      }
      if (n > 1) {
        const gast = g.players[1].id;
        ok(handleAction(g, gast, { type: "flip" }).rejected !== null, "ein Gast konnte aufdecken");
        blockiert++;
      }

      const vorher = g.side.filter((s) => s.revealed).length;
      g = flipRace(g);
      rueckschlaege += g.side.filter((s) => s.revealed).length - vorher;
      zuege++;
    }

    ok(g.winner !== null, "das Rennen endete ohne Sieger");
    ok(g.horses[g.winner] === ZIEL, "der Sieger steht nicht im Ziel");
    laengen.push(guard);

    if (g.phase === "payout") {
      mitGewinnern++;
      const gewinner = distributorIds(g);
      if (gewinner.length > 1) parallel++;
      for (const id of gewinner) {
        ok(pendingFor(g, id) === g.bets[id].amount * 2, "es wird nicht der doppelte Einsatz verteilt");
      }
      // Kreuz und quer verteilen, damit sich die Gewinner nicht stoeren.
      let runde = 0;
      while (pendingTotal(g) > 0) {
        if (++runde > 500) throw new Error("Die Auszahlung endet nicht");
        const offen = distributorIds(g);
        const from = offen[runde % offen.length];
        const ziel = sipTargets(g, from)[runde % (n - 1)].id;
        g = handOutSipRace(g, ziel, from);
      }
      ok(g.phase === "finished", "nach der Auszahlung ist das Spiel nicht fertig");
      const gesamt = g.players.reduce((s, p) => s + p.sips, 0);
      const eingesetzt = g.players.reduce((s, p) => s + g.bets[p.id].amount, 0);
      const soll = eingesetzt + gewinner.reduce((s, id) => s + g.bets[id].amount * 2, 0);
      ok(gesamt === soll, `${gesamt} Schluecke insgesamt, erwartet ${soll}`);
      // Niemand gibt sich selbst etwas. Ein Gewinner darf aber sehr wohl
      // Schluecke von einem anderen Gewinner abbekommen.
      ok(!g.sipLog.some((e) => e.fromId === e.toId), "jemand hat sich selbst Schluecke gegeben");
    } else {
      ohneGewinner++;
      ok(g.phase === "finished", "ohne Gewinner ist das Spiel nicht fertig");
    }
    offenVorher += 0;
    rennen++;
  }

  const schnitt = (laengen.reduce((a, b) => a + b, 0) / laengen.length).toFixed(1);
  console.log(`  ${rennen} Rennen mit 2 bis 8 Spielern, im Schnitt ${schnitt} aufgedeckte Karten`);
  console.log(`  ${pruefungen} Zwischenpruefungen – nie eine Karte doppelt, nie ein Pferd neben der Bahn`);
  console.log(`  ${rueckschlaege} Streckenkarten aufgedeckt, immer erst wenn alle Pferde dran vorbei waren`);
  console.log(`  ${mitGewinnern} Rennen mit Auszahlung (${parallel} davon mit mehreren Gewinnern gleichzeitig)`);
  console.log(`  ${ohneGewinner} Rennen, auf deren Sieger niemand gesetzt hatte`);
  console.log(`  ${blockiert} unerlaubte Zuege blockiert`);
}

console.log("");
if (fails === 0) {
  console.log("PFERDERENNEN GRUEN – die Regeln funktionieren.");
} else {
  console.log(`${fails} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
