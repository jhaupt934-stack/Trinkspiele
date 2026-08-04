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
    phase: "play", // play | verteilen | leerfrage | bestaetigen | finished
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
    antwort: [null, null, null, null], // "leer" / "nein" nach jeder Runde
    leer: null,              // welcher Anspruch gerade bestaetigt werden soll
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
  let korken = ende.map((k, i) => ({ x: k.x, y: k.y, team: g.korken[i].team, raus: k.raus }));

  // Wer noch gar nicht dran war, darf nicht um seinen Zug gebracht werden:
  // faellt sein Korken vom Tisch, kommt er zurueck in seine Ecke. Nur wer
  // schon geschnippst hat, bleibt weg - sonst waere das Wegschiessen sinnlos.
  const spaeter = new Set(g.reihe.slice(g.dran + 1));
  korken = korken.map((k, i) => {
    if (!k.raus || !spaeter.has(i) || vorher[i].raus) return k;
    return { ...startKorken()[i], team: k.team };
  });

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

  const weiter = { ...g, getrunken, offen, letzte: g.letzte ? { ...g.letzte, verteilt } : g.letzte };
  return offen[0] + offen[1] > 0 ? { ...weiter, phase: "verteilen" } : frageStellen(weiter);
}

// ---------------------------------------------------------------------------
// Nach dem Aufteilen: Ist deine Flasche leer?
// ---------------------------------------------------------------------------
//
// Jeder sagt einmal je Runde, ob seine Flasche leer ist. Erst wenn alle vier
// geantwortet haben, geht es weiter - entweder in die Bestaetigung oder gleich
// in die naechste Runde. Wer schon fertig ist, wird nicht nochmal gefragt.

function frageStellen(g) {
  const antwort = PLAETZE.map((p) => (g.fertig[p.nr] ? "fertig" : null));
  return pruefeAntworten({ ...g, antwort, phase: "leerfrage" });
}

/** "Meine Flasche ist leer" oder "noch nicht". */
export function antworte(g, playerId, istLeer) {
  if (g.phase !== "leerfrage") return g;
  const nr = platzVon(g, playerId);
  if (nr < 0 || g.antwort[nr] !== null) return g;

  const antwort = [...g.antwort];
  antwort[nr] = istLeer ? "leer" : "nein";
  return pruefeAntworten({ ...g, antwort });
}

/**
 * Haben alle geantwortet? Dann kommen die Ansprueche dran - jeder einzeln, und
 * jeder muss vom anderen Team bestaetigt werden. Sonst koennte man einfach
 * draufdruecken und haette gewonnen.
 */
function pruefeAntworten(g) {
  if (g.antwort.some((a) => a === null)) return g;

  const ansprueche = g.antwort.map((a, nr) => (a === "leer" ? nr : -1)).filter((nr) => nr >= 0);
  if (!ansprueche.length) return naechsteRunde(g);
  return { ...g, phase: "bestaetigen", leer: { nr: ansprueche[0], rest: ansprueche.slice(1) } };
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

  // Sind beide Teams durch, kommt die Frage nach der Flasche.
  const weiter = { ...g, getrunken, offen, letzte: { ...g.letzte, verteilt } };
  return offen[0] + offen[1] > 0 ? weiter : frageStellen(weiter);
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
// Bestaetigen
// ---------------------------------------------------------------------------

/** Wer ist gerade mit einem Anspruch dran? */
export const anspruchVon = (g) => (g.phase === "bestaetigen" ? g.leer?.nr ?? null : null);

/** Darf dieser Spieler ueber den offenen Anspruch entscheiden? */
export function darfBestaetigen(g, playerId) {
  if (g.phase !== "bestaetigen") return false;
  const wer = platzVon(g, playerId);
  return wer >= 0 && PLAETZE[wer].team !== PLAETZE[g.leer.nr].team;
}

/** Den naechsten Anspruch vorholen - oder die Runde beenden. */
function naechsterAnspruch(g, fertig) {
  // Gewonnen hat, wessen beide Flaschen leer sind.
  for (const t of [0, 1]) {
    if (teamPlaetze(t).every((nr) => fertig[nr])) {
      return { ...g, fertig, leer: null, phase: "finished", sieger: t };
    }
  }
  const rest = g.leer.rest;
  if (rest.length) return { ...g, fertig, leer: { nr: rest[0], rest: rest.slice(1) } };
  return naechsteRunde({ ...g, fertig, leer: null });
}

/**
 * Das andere Team bestaetigt. Damit ist EINE Flasche leer - gewonnen hat ein
 * Team erst, wenn beide leer sind. Bis dahin schnippst der Fertige weiter mit,
 * bekommt aber nichts mehr zu trinken.
 */
export function leerBestaetigen(g, playerId) {
  if (!darfBestaetigen(g, playerId)) return g;
  const fertig = [...g.fertig];
  fertig[g.leer.nr] = true;
  return naechsterAnspruch(g, fertig);
}

/** Oder eben nicht - dann trinkt er weiter. */
export function leerAblehnen(g, playerId) {
  if (!darfBestaetigen(g, playerId)) return g;
  return naechsterAnspruch(g, [...g.fertig]);
}

/**
 * Die naechste Runde. Der Anfang wandert einen Platz weiter im Kreis.
 *
 * Der naheliegende Weg - "es faengt der an, der zuletzt Zweiter war" - klingt
 * gut, laeuft aber im Kreis zwischen genau zwei Plaetzen. Zwei der vier kaemen
 * nie an den Anfang.
 */
export function naechsteRunde(g) {
  return {
    ...g,
    phase: "play",
    runde: g.runde + 1,
    reihe: reihenfolge((g.reihe[0] + 1) % PLAETZE.length),
    dran: 0,
    korken: startKorken(),
    antwort: [null, null, null, null],
    leer: null,
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

  // Ein Anspruch liegt vor - jetzt sind die beiden vom anderen Team gefragt.
  if (g.phase === "bestaetigen") {
    return teamPlaetze(1 - PLAETZE[g.leer.nr].team).map((i) => g.players[i]?.id).filter(Boolean);
  }

  // Die Frage nach der Flasche: alle, die noch nicht geantwortet haben.
  if (g.phase === "leerfrage") {
    return g.antwort.map((a, nr) => (a === null ? g.players[nr]?.id : null)).filter(Boolean);
  }

  // Aufteilen: BEIDE Teams gleichzeitig, jedes fuer sich.
  if (g.phase === "verteilen") {
    return [0, 1]
      .filter((t) => g.offen[t] > 0)
      .flatMap((t) => teamPlaetze(t).map((i) => g.players[i]?.id))
      .filter(Boolean);
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
