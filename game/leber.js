// Leberschuss - der Spielablauf. 2 gegen 2, vier Leute, vier Kronkorken.
//
// Hier stehen nur die Regeln: wer wann dran ist, wer wie viel trinken darf,
// wann eine Runde vorbei ist und wann jemand gewonnen hat. Das Schnippsen
// selbst (Reibung, Zusammenstoesse, Wertungsfelder) steht in schnipps.js, das
// Zeichnen in public/leber3d.js.
//
// Der Kern in einem Satz: Schluecke sind FORTSCHRITT. Wer zuerst sein Bier
// leer hat, gewinnt. Deshalb ist ein Treffer beim Gegner gut fuers eigene
// Team, und ein Korken, der auf der eigenen Seite in einem Feld liegenbleibt,
// schenkt dem Gegner Schluecke.
//
// Reines JavaScript ohne Nebenwirkungen, laeuft im Browser wie im Server.

// Kein Import aus sips.js: bei Leberschuss verteilt niemand einzelne Schluecke
// an einzelne Leute - es wird pro TEAM abgerechnet. Der Zaehler `getrunken`
// ersetzt den ganzen Verteil-Apparat der Kartenspiele.
import { ECKEN, FELD, schiesse, teamWertung } from "./schnipps.js";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 4;

/** Ein Bier hat so viele Schluecke, jedes Team hat zwei Flaschen. */
export const SCHLUCK_JE_FLASCHE = 14;
export const FLASCHEN_JE_TEAM = 2;
export const ZIEL = SCHLUCK_JE_FLASCHE * FLASCHEN_JE_TEAM;

export const TEAM_NAME = ["Team 1", "Team 2"];

/**
 * Vier Plaetze am Tisch. Die Nummer ist zugleich die des Kronkorkens und die
 * Stelle in der Spielerliste:
 *
 *      ferne Kante
 *        2     3        <- Team 2
 *        |     |
 *        0     1        <- Team 1
 *      eigene Kante
 */
export const PLAETZE = [
  { nr: 0, team: 0, seite: "nah", hand: "links" },
  { nr: 1, team: 0, seite: "nah", hand: "rechts" },
  { nr: 2, team: 1, seite: "fern", hand: "links" },
  { nr: 3, team: 1, seite: "fern", hand: "rechts" },
];

/**
 * Wer sitzt DIAGONAL gegenueber? Also ueber Eck, nicht direkt gegenueber:
 * Platz 0 (vorne links) und Platz 3 (hinten rechts) sind ein Paar.
 */
export const diagonal = (nr) => [3, 2, 1, 0][nr];

/** Und wer ist der eigene Teampartner? */
export const partner = (nr) => [1, 0, 3, 2][nr];

/**
 * Die Reihenfolge einer Runde: Anfaenger, der diagonal gegenueber, dann der
 * Teampartner des Anfaengers, zuletzt der Uebriggebliebene.
 *
 * Dadurch wechseln sich die Teams zwangslaeufig ab - niemand kommt zweimal
 * hintereinander dran - und es geht immer ueber Eck.
 */
export function reihenfolge(anfang) {
  const p = partner(anfang);
  return [anfang, diagonal(anfang), p, diagonal(p)];
}

/** Die vier Korken in ihren Ecken. */
export const startKorken = () => [
  { x: ECKEN[0].x, y: ECKEN[0].y, team: 0, raus: false },
  { x: ECKEN[1].x, y: ECKEN[1].y, team: 0, raus: false },
  { x: ECKEN[0].x, y: FELD.laenge - ECKEN[0].y, team: 1, raus: false },
  { x: ECKEN[1].x, y: FELD.laenge - ECKEN[1].y, team: 1, raus: false },
];

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function initLeber(players, rng = Math.random, hostId = null) {
  if (players.length !== MIN_PLAYERS) throw new Error("Leberschuss geht nur zu viert.");

  // Wer anfaengt, wird ausgelost.
  const anfang = Math.floor(rng() * PLAETZE.length) % PLAETZE.length;

  return {
    game: "leber",
    phase: "play", // play | rundenende | finished
    players,
    hostId,
    korken: startKorken(),
    runde: 1,
    reihe: reihenfolge(anfang),
    dran: 0,
    getrunken: [0, 0],
    letzte: null,  // Auswertung der letzten Runde
    schuss: null,  // der letzte Schuss, damit alle Handys dieselbe Animation sehen
    sieger: null,

    rev: 0,
    message: "",
  };
}

// ---------------------------------------------------------------------------
// Wer ist dran
// ---------------------------------------------------------------------------

/**
 * Ist das Spiel entschieden?
 *
 * Bitte immer diese Funktion benutzen und nicht `if (g.sieger)` schreiben:
 * Team 0 ist die Zahl 0, und die gilt in JavaScript als "falsch". Ein Sieg von
 * Team 1 wuerde damit stillschweigend uebersehen.
 */
export const istEntschieden = (g) => g.sieger !== null && g.sieger !== undefined;

/** Der Platz, der gerade dran ist - oder undefined, wenn die Runde durch ist. */
export const amZug = (g) => g.reihe[g.dran];

/** Ist die Runde durch - haben also alle vier geschnippst? */
export const rundeVorbei = (g) => g.dran >= g.reihe.length;

/** Welchen Platz hat dieser Spieler? */
export const platzVon = (g, playerId) => g.players.findIndex((p) => p.id === playerId);

/** Wer ist gerade dran? Gibt den Spieler zurueck, nicht die Nummer. */
export const currentPlayer = (g) => (rundeVorbei(g) ? null : g.players[amZug(g)] ?? null);

/** Zu welchem Team gehoert dieser Spieler? */
export const teamVon = (g, playerId) => PLAETZE[platzVon(g, playerId)]?.team ?? null;

/**
 * Alle ueberspringen, die keinen Korken mehr auf der Matte haben. Auch der
 * Erste einer Runde kann betroffen sein - sein Korken kann in der Runde davor
 * runtergefallen sein.
 */
function zugVorbereiten(g) {
  let dran = g.dran;
  while (dran < g.reihe.length && g.korken[g.reihe[dran]]?.raus) dran++;
  return dran === g.dran ? g : { ...g, dran };
}

// ---------------------------------------------------------------------------
// Ein Schuss
// ---------------------------------------------------------------------------

/**
 * Schnippsen. `richtung` ist ein Winkel im Bogenmass, `kraft` 0 bis 1.
 *
 * Verschickt wird online NUR dieses Paar - nicht die Animation. Jedes Handy
 * rechnet die Bewegung selbst nach, und weil schiesse() bei gleichem Anfang
 * immer dasselbe ergibt, sehen alle dieselbe Bahn. Damit auch die anderen
 * abspielen koennen, wird die Ausgangslage mitgeschrieben: aus ihrem eigenen
 * Stand kaemen sie sonst nicht mehr an den Anfang des Schusses.
 */
export function schuss(g, playerId, richtung, kraft) {
  if (g.phase !== "play") return g;
  const nr = platzVon(g, playerId);
  if (nr < 0 || nr !== amZug(g)) return g;
  if (g.korken[nr]?.raus) return g;
  if (!Number.isFinite(richtung) || !Number.isFinite(kraft)) return g;

  const vorher = g.korken.map((k) => ({ x: k.x, y: k.y, team: k.team, raus: k.raus }));
  const { ende } = schiesse(g.korken, nr, richtung, Math.max(0, Math.min(1, kraft)));
  const korken = ende.map((k, i) => ({ x: k.x, y: k.y, team: g.korken[i].team, raus: k.raus }));

  // Die Nummer zaehlt ueber das ganze Spiel durch und wird nie
  // zurueckgesetzt. Daran erkennt jedes Handy, ob ein Schuss neu ist und noch
  // abgespielt werden muss - bei einem Zaehler je Runde faenge er nach jeder
  // Abrechnung wieder bei eins an, und der erste Schuss der neuen Runde bliebe
  // unsichtbar.
  const schussNr = (g.schussNr ?? 0) + 1;
  let next = {
    ...g,
    korken,
    schussNr,
    schuss: {
      nr,
      richtung,
      kraft: Math.max(0, Math.min(1, kraft)),
      vorher,
      nummer: schussNr,
    },
  };

  next = zugVorbereiten({ ...next, dran: next.dran + 1 });
  return rundeVorbei(next) ? rundeAuswerten(next) : next;
}

/**
 * Die Bewegung des letzten Schusses, zum Abspielen.
 *
 * Aus dem gespeicherten Anfang und dem Paar (Richtung, Kraft) rechnet jedes
 * Handy dieselbe Bahn nach. Verschickt werden dadurch drei Zahlen statt
 * hunderter Positionen - und alle sehen genau dasselbe.
 */
export function letzteBewegung(g) {
  if (!g?.schuss) return null;
  const { vorher, nr, richtung, kraft } = g.schuss;
  return { ...schiesse(vorher, nr, richtung, kraft), nummer: g.schuss.nummer };
}

// ---------------------------------------------------------------------------
// Zielen: zwei Mal im richtigen Moment anhalten
// ---------------------------------------------------------------------------
//
// Kein Ziehen wie bei einer Schleuder - damit traefe man alles, was man will.
// Stattdessen schwingt erst der Pfeil hin und her, dann der Kraftbalken. Genau
// wie am Tisch entscheidet der Moment, nicht die ruhige Hand.
//
// Die drei Zahlen sind die Schwierigkeit des Spiels. Sie stehen hier und nicht
// in der Oberflaeche, damit alle Ansichten dieselbe Schwierigkeit haben.

export const SCHWINGE_RICHTUNG = 1.25; // Sekunden fuer einmal hin und zurueck
export const SCHWINGE_KRAFT = 0.95;
export const MAX_WINKEL = 0.6;         // gut 34 Grad nach jeder Seite

/** Dreieckschwingung: laeuft gleichmaessig von 0 auf 1 und zurueck. */
export function schwingung(seitMs, dauer) {
  const t = (seitMs / 1000 / dauer) % 1;
  return 2 * Math.abs(t - 0.5);
}

/** Wohin zeigt der Pfeil nach `seitMs` Millisekunden Zielen? */
export function pfeilRichtung(korken, nr, seitMs) {
  const geradeaus = korken[nr].y < FELD.laenge / 2 ? Math.PI / 2 : -Math.PI / 2;
  return geradeaus + (schwingung(seitMs, SCHWINGE_RICHTUNG) * 2 - 1) * MAX_WINKEL;
}

/** Wo steht der Kraftbalken? */
export const balkenKraft = (seitMs) => schwingung(seitMs, SCHWINGE_KRAFT);

// ---------------------------------------------------------------------------
// Abrechnen
// ---------------------------------------------------------------------------

/**
 * Die Runde auswerten und die Schluecke gutschreiben.
 *
 * "Deine Mama" - der rote Bereich ganz hinten zwischen den Flaschen - heisst:
 * das andere Team ext beide Flaschen und macht neue auf. Es hat also alles
 * getrunken, faengt aber wieder bei null an und ist damit weiter vom Sieg
 * entfernt als vorher.
 */
export function rundeAuswerten(g) {
  const { schluecke, mama, einzeln } = teamWertung(g.korken);

  const getrunken = [g.getrunken[0] + schluecke[0], g.getrunken[1] + schluecke[1]];
  if (mama[0]) getrunken[1] = 0;
  if (mama[1]) getrunken[0] = 0;

  let sieger = null;
  const fertig = [getrunken[0] >= ZIEL, getrunken[1] >= ZIEL];
  if (fertig[0] && !fertig[1]) sieger = 0;
  else if (fertig[1] && !fertig[0]) sieger = 1;
  else if (fertig[0] && fertig[1]) {
    // Beide gleichzeitig fertig: der mit dem groesseren Ueberschuss gewinnt,
    // bei Gleichstand geht es weiter.
    const a = getrunken[0] - ZIEL;
    const b = getrunken[1] - ZIEL;
    sieger = a === b ? null : a > b ? 0 : 1;
  }

  return {
    ...g,
    getrunken,
    sieger,
    letzte: { schluecke, mama, einzeln },
    phase: sieger === null ? "rundenende" : "finished",
  };
}

/**
 * Die naechste Runde. Der Anfang wandert einen Platz weiter im Kreis.
 *
 * Der naheliegende Weg - "es faengt der an, der zuletzt Zweiter war" - klingt
 * gut, laeuft aber im Kreis zwischen genau zwei Plaetzen. Zwei der vier kaemen
 * nie an den Anfang.
 */
export function naechsteRunde(g) {
  if (g.phase !== "rundenende") return g;
  return {
    ...g,
    phase: "play",
    runde: g.runde + 1,
    reihe: reihenfolge((g.reihe[0] + 1) % PLAETZE.length),
    dran: 0,
    korken: startKorken(),
    letzte: null,
    schuss: null,
  };
}

/** Wie weit ist ein Team? 0 bis 1, fuer den Balken. */
export const fortschritt = (g, team) => Math.min(1, g.getrunken[team] / ZIEL);

/** Wie viele volle Flaschen hat ein Team schon geschafft? */
export const flaschenLeer = (g, team) =>
  Math.min(FLASCHEN_JE_TEAM, Math.floor(g.getrunken[team] / SCHLUCK_JE_FLASCHE));

// ---------------------------------------------------------------------------
// Wenn jemand weg ist
// ---------------------------------------------------------------------------

/** Auf wen wartet die Runde gerade? */
export function wartetAufLeber(g) {
  if (!g || g.phase === "finished") return [];
  if (g.phase === "rundenende") {
    const host = g.hostId ?? g.players[0]?.id;
    return host ? [host] : [];
  }
  const p = currentPlayer(g);
  return p ? [p.id] : [];
}

/**
 * Diesen Spieler ueberspringen, weil er zu lange weg ist: sein Schuss faellt
 * aus, sein Korken bleibt liegen, wo er liegt.
 */
export function ueberspringenLeber(g, playerId) {
  if (!g || g.phase !== "play") return g;
  const nr = platzVon(g, playerId);
  if (nr < 0 || nr !== amZug(g)) return g;

  const next = zugVorbereiten({ ...g, dran: g.dran + 1 });
  return rundeVorbei(next) ? rundeAuswerten(next) : next;
}
