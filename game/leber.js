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
// Es gibt KEINEN Punktestand. Gezaehlt wird nur, damit ein Team seine Schluecke
// untereinander aufteilen kann. Gewonnen hat ein Team, wenn BEIDE Flaschen leer
// sind - und jede einzelne muss vom anderen Team bestaetigt werden. Wer fertig
// ist, bekommt keine Schluecke mehr ab; die gehen dann alle an den Partner.
//
// Reines JavaScript ohne Nebenwirkungen, laeuft im Browser wie im Server.

// Kein Import aus sips.js: dort verteilt jeder Schluecke an alle am Tisch. Hier
// bekommt ein TEAM die Schluecke und teilt sie unter seinen zwei Leuten auf -
// das ist einfacher und passt nicht auf denselben Apparat.
import { ECKEN, FELD, schiesse, teamWertung } from "./schnipps.js";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 4;

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
    phase: "play", // play | verteilen | rundenende | leer | finished
    players,
    hostId,
    korken: startKorken(),
    runde: 1,
    reihe: reihenfolge(anfang),
    dran: 0,
    getrunken: [0, 0, 0, 0], // je SPIELER, nicht je Team
    fertig: [false, false, false, false], // wessen Flasche schon leer ist
    offen: [0, 0],           // noch aufzuteilende Schluecke je Team
    letzte: null,            // Auswertung der letzten Runde
    schuss: null,            // der letzte Schuss, damit alle dieselbe Animation sehen
    leer: null,              // jemand sagt "Flasche leer" und wartet auf Bestaetigung
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
 * Die Runde auswerten. Die Schluecke werden dem TEAM gutgeschrieben - wer sie
 * davon trinkt, macht das Team gleich danach selbst aus (Phase "verteilen").
 *
 * "Deine Mama" - der rote Bereich ganz hinten zwischen den Flaschen - heisst:
 * das andere Team ext beide Flaschen und macht neue auf. Alles, was die beiden
 * bis dahin getrunken haben, zaehlt damit nicht mehr - sie fangen mit vollen
 * Flaschen wieder an.
 */
export function rundeAuswerten(g) {
  const { schluecke, mama, einzeln } = teamWertung(g.korken);

  // "Deine Mama": neue Flaschen fuer das andere Team. Damit ist auch niemand
  // dort mehr fertig - eine frische Flasche ist nun mal nicht leer.
  const getrunken = [...g.getrunken];
  const fertig = [...g.fertig];
  for (const t of [0, 1]) {
    if (!mama[t]) continue;
    for (const nr of teamPlaetze(1 - t)) {
      getrunken[nr] = 0;
      fertig[nr] = false;
    }
  }

  return sortiereEin({
    ...g,
    getrunken,
    fertig,
    offen: [schluecke[0], schluecke[1]],
    letzte: { schluecke, mama, einzeln, verteilt: [0, 0, 0, 0] },
  });
}

/** Die beiden Plaetze eines Teams. */
export const teamPlaetze = (team) => PLAETZE.filter((p) => p.team === team).map((p) => p.nr);

/**
 * Was sich nicht mehr aufteilen laesst, wird gleich zugeteilt.
 *
 * Wer seine Flasche leer hat, schnippst weiter mit, trinkt aber nichts mehr.
 * Bleibt in einem Team also nur noch einer uebrig, gibt es nichts zu
 * entscheiden - die Schluecke gehen alle an ihn, ohne dass jemand tippen muss.
 * Danach steht die Phase fest: aufteilen nur, wenn noch etwas offen ist.
 */
function sortiereEin(g) {
  const getrunken = [...g.getrunken];
  const offen = [...g.offen];
  const verteilt = [...(g.letzte?.verteilt ?? [0, 0, 0, 0])];

  for (const t of [0, 1]) {
    if (offen[t] <= 0) continue;
    const frei = teamPlaetze(t).filter((nr) => !g.fertig[nr]);
    if (frei.length !== 1) continue;
    getrunken[frei[0]] += offen[t];
    verteilt[frei[0]] += offen[t];
    offen[t] = 0;
  }

  return {
    ...g,
    getrunken,
    offen,
    letzte: g.letzte ? { ...g.letzte, verteilt } : g.letzte,
    phase: offen[0] + offen[1] > 0 ? "verteilen" : "rundenende",
  };
}

/**
 * Einen Schluck an ein Teammitglied geben. Aufteilen darf jeder aus dem Team,
 * dem die Schluecke gehoeren - auch fuer den Partner.
 */
export function verteile(g, playerId, zielId) {
  if (g.phase !== "verteilen") return g;
  const wer = platzVon(g, playerId);
  const ziel = platzVon(g, zielId);
  if (wer < 0 || ziel < 0) return g;

  const team = PLAETZE[wer].team;
  if (PLAETZE[ziel].team !== team) return g; // nur im eigenen Team
  if (g.offen[team] <= 0) return g;
  if (g.fertig[ziel]) return g;              // wer leer hat, trinkt nicht mehr

  const getrunken = [...g.getrunken];
  getrunken[ziel]++;
  const verteilt = [...g.letzte.verteilt];
  verteilt[ziel]++;
  const offen = [...g.offen];
  offen[team]--;

  return {
    ...g,
    getrunken,
    offen,
    letzte: { ...g.letzte, verteilt },
    phase: offen[0] + offen[1] > 0 ? "verteilen" : "rundenende",
  };
}

/** Vertippt? Einen schon vergebenen Schluck wieder zuruecknehmen. */
export function verteilenZurueck(g, playerId, zielId) {
  if (g.phase !== "verteilen") return g;
  const wer = platzVon(g, playerId);
  const ziel = platzVon(g, zielId);
  if (wer < 0 || ziel < 0) return g;

  const team = PLAETZE[wer].team;
  if (PLAETZE[ziel].team !== team) return g;
  if (!(g.letzte?.verteilt[ziel] > 0)) return g;

  const getrunken = [...g.getrunken];
  getrunken[ziel]--;
  const verteilt = [...g.letzte.verteilt];
  verteilt[ziel]--;
  const offen = [...g.offen];
  offen[team]++;

  return { ...g, getrunken, offen, letzte: { ...g.letzte, verteilt } };
}

// ---------------------------------------------------------------------------
// Flasche leer
// ---------------------------------------------------------------------------
//
// Es gibt keinen Punktestand. Das Spiel endet, wenn jemand sagt, seine Flasche
// sei leer - und das andere Team es bestaetigt. Ohne diese Bestaetigung koennte
// man einfach draufdruecken und haette gewonnen.

/** "Meine Flasche ist leer." Geht erst, wenn man ueberhaupt getrunken hat. */
export function flascheLeer(g, playerId) {
  if (g.phase === "finished" || g.phase === "leer") return g;
  const nr = platzVon(g, playerId);
  if (nr < 0 || g.fertig[nr] || g.getrunken[nr] < 1) return g;
  return { ...g, phase: "leer", leer: { playerId, zurueck: g.phase } };
}

/**
 * Das andere Team bestaetigt. Damit ist EINE Flasche leer - gewonnen hat ein
 * Team erst, wenn beide leer sind. Bis dahin geht es weiter, der Fertige
 * schnippst also weiter mit, bekommt aber nichts mehr zu trinken.
 */
export function leerBestaetigen(g, playerId) {
  if (g.phase !== "leer") return g;
  const wer = platzVon(g, playerId);
  const anspruch = platzVon(g, g.leer.playerId);
  if (wer < 0 || PLAETZE[wer].team === PLAETZE[anspruch].team) return g;

  const fertig = [...g.fertig];
  fertig[anspruch] = true;

  const team = PLAETZE[anspruch].team;
  const beide = teamPlaetze(team).every((nr) => fertig[nr]);
  if (beide) return { ...g, fertig, phase: "finished", sieger: team, leer: null };

  // Waren noch Schluecke offen, wandern sie jetzt automatisch zum Partner -
  // er ist ja der Einzige, der noch trinken kann.
  const weiter = { ...g, fertig, leer: null };
  if (g.leer.zurueck === "verteilen") return sortiereEin(weiter);
  return { ...weiter, phase: g.leer.zurueck ?? "play" };
}

/** Oder eben nicht - dann geht es weiter, wo es aufgehoert hat. */
export function leerAblehnen(g, playerId) {
  if (g.phase !== "leer") return g;
  const wer = platzVon(g, playerId);
  const anspruch = platzVon(g, g.leer.playerId);
  if (wer < 0 || PLAETZE[wer].team === PLAETZE[anspruch].team) return g;
  return { ...g, phase: g.leer.zurueck ?? "play", leer: null };
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

/** Wie viel hat ein Team zusammen getrunken? Nur zur Anzeige. */
export const teamGetrunken = (g, team) =>
  teamPlaetze(team).reduce((summe, nr) => summe + g.getrunken[nr], 0);

// ---------------------------------------------------------------------------
// Wenn jemand weg ist
// ---------------------------------------------------------------------------

/** Auf wen wartet die Runde gerade? */
export function wartetAufLeber(g) {
  if (!g || g.phase === "finished") return [];

  // Jemand sagt "leer" - jetzt sind die beiden vom anderen Team gefragt.
  if (g.phase === "leer") {
    const nr = platzVon(g, g.leer.playerId);
    return teamPlaetze(1 - PLAETZE[nr].team).map((i) => g.players[i]?.id).filter(Boolean);
  }

  // Aufteilen: jedes Team, das noch Schluecke offen hat.
  if (g.phase === "verteilen") {
    return [0, 1]
      .filter((t) => g.offen[t] > 0)
      .flatMap((t) => teamPlaetze(t).map((i) => g.players[i]?.id))
      .filter(Boolean);
  }

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
