// Leberschuss - der Spielablauf. Zwei Teams, vier Kronkorken.
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
// untereinander aufteilen kann. Gewonnen hat ein Team, wenn ALLE seine Flaschen
// leer sind - und jede einzelne muss vom anderen Team bestaetigt werden. Wer
// fertig ist, bekommt keine Schluecke mehr ab; die gehen dann an den Partner.
//
// PLATZ und SPIELER sind zweierlei. Es gibt immer vier PLAETZE mit vier
// Korken, aber nicht immer vier Leute: bei 1 gegen 1 oder 2 gegen 1 schnippst
// wer allein im Team ist, eben beide Korken seiner Seite. Getrunken wird immer
// je PERSON. Wer die beiden verwechselt, zaehlt bei 1 gegen 1 die Schluecke
// doppelt - deshalb heissen die Zaehler hier durchgehend nach Spielern und die
// Korken nach Plaetzen.
//
// Reines JavaScript ohne Nebenwirkungen, laeuft im Browser wie im Server.

// Kein Import aus sips.js: dort verteilt jeder Schluecke an alle am Tisch. Hier
// bekommt ein TEAM die Schluecke und teilt sie unter seinen Leuten auf - das
// ist einfacher und passt nicht auf denselben Apparat.
import { ECKEN, FELD, schiesse, teamWertung } from "./schnipps.js";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const TEAM_NAME = ["Team 1", "Team 2"];

/**
 * Vier Plaetze am Tisch. Die Nummer ist zugleich die des Kronkorkens:
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

/** Die beiden Plaetze eines Teams. */
export const teamPlaetze = (team) => PLAETZE.filter((p) => p.team === team).map((p) => p.nr);

/**
 * Der Kapitaenssitz jedes Teams: der linke Platz. Wer dort sitzt, teilt die
 * Schluecke auf und entscheidet ueber die Ansprueche des Gegners.
 *
 * Vorher durfte jeder aus dem Team tippen - zu zweit auf zwei Handys wurde
 * daraus ein Wettrennen, bei dem keiner wusste, ob der andere gerade schon
 * getippt hat. Einer entscheidet, der andere sieht zu. Ist ein Team nur eine
 * Person, ist die Frage ohnehin beantwortet.
 */
export const KAPITAENSPLATZ = [0, 2];

/**
 * Wer sitzt DIAGONAL gegenueber? Also ueber Eck, nicht direkt gegenueber:
 * Platz 0 (vorne links) und Platz 3 (hinten rechts) sind ein Paar.
 */
export const diagonal = (nr) => [3, 2, 1, 0][nr];

/** Und welcher Platz ist der zweite desselben Teams? */
export const partner = (nr) => [1, 0, 3, 2][nr];

/**
 * Die Reihenfolge einer Runde: Anfaenger, der diagonal gegenueber, dann der
 * zweite Platz des Anfaengerteams, zuletzt der Uebriggebliebene.
 *
 * Dadurch wechseln sich die Teams zwangslaeufig ab - kein Team kommt zweimal
 * hintereinander - und es geht immer ueber Eck. Bei 1 gegen 1 schnippst
 * dieselbe Person eben zweimal, aber nie zweimal am Stueck.
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
// Wer sitzt wo
// ---------------------------------------------------------------------------

/**
 * Aus der Besetzung einen Sitzplan machen.
 *
 * `besetzung` ist entweder
 *   - eine Liste von vier Plaetzen mit Spieler oder `null` (so kommt sie vom
 *     Platzwahl-Bildschirm), oder
 *   - einfach eine Spielerliste; dann werden die Plaetze der Reihe nach
 *     vergeben: zwei Leute sind 1 gegen 1, drei sind 2 gegen 1.
 *
 * Heraus kommt `{ players, sitze }`: die Leute in fester Reihenfolge und zu
 * jedem der vier Plaetze die Nummer der Person, die ihn schnippst. Ein leerer
 * Platz geht an den Teampartner - so bleiben es immer vier Korken.
 */
export function sitzplan(besetzung) {
  const alsPlaetze =
    besetzung.length === 4 && besetzung.some((p) => p == null)
      ? besetzung
      : verteilePlaetze(besetzung);

  const players = [];
  const roh = alsPlaetze.map((p) => {
    if (!p) return -1;
    const schon = players.findIndex((q) => q.id === p.id);
    if (schon >= 0) return schon;
    players.push(p);
    return players.length - 1;
  });

  const sitze = roh.map((i, nr) => (i >= 0 ? i : roh[partner(nr)]));
  if (sitze.some((i) => i < 0)) throw new Error("In jedem Team muss mindestens einer sitzen.");
  return { players, sitze };
}

/** Ohne Platzwahl: der Reihe nach auf die vier Plaetze setzen. */
function verteilePlaetze(players) {
  if (players.length < MIN_PLAYERS) throw new Error("Leberschuss geht ab zwei Leuten.");
  if (players.length > MAX_PLAYERS) throw new Error("Leberschuss geht bis vier Leute.");
  // 2 -> einer je Team, 3 -> zwei gegen einen, 4 -> voll besetzt.
  const plan = { 2: [0, null, 1, null], 3: [0, 1, 2, null], 4: [0, 1, 2, 3] }[players.length];
  return plan.map((i) => (i === null ? null : players[i]));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export function initLeber(besetzung, rng = Math.random, hostId = null) {
  const { players, sitze } = sitzplan(besetzung);

  // Zu welchem Team gehoert wer? Einmal ausrechnen statt jedesmal suchen.
  const teamOf = players.map((_, i) => PLAETZE[sitze.findIndex((s) => s === i)].team);

  // Wer anfaengt, wird ausgelost - ausgelost wird der PLATZ.
  const anfang = Math.floor(rng() * PLAETZE.length) % PLAETZE.length;

  const je = (wert) => players.map(() => wert);

  return {
    game: "leber",
    phase: "play", // play | verteilen | leerfrage | bestaetigen | finished
    players,
    sitze,   // je Platz: welche Person schnippst ihn
    teamOf,  // je Person: welches Team
    hostId,
    korken: startKorken(),
    runde: 1,
    reihe: reihenfolge(anfang),
    dran: 0,
    getrunken: je(0),     // je PERSON, nicht je Platz und nicht je Team
    fertig: je(false),    // wessen Flasche schon leer ist
    offen: [0, 0],        // noch aufzuteilende Schluecke je Team
    letzte: null,         // Auswertung der letzten Runde
    schuss: null,         // der letzte Schuss, damit alle dieselbe Animation sehen
    antwort: je(null),    // "leer" / "nein" nach jeder Runde
    leer: null,           // welcher Anspruch gerade bestaetigt werden soll
    sieger: null,

    rev: 0,
    message: "",
  };
}

// ---------------------------------------------------------------------------
// Plaetze und Personen
// ---------------------------------------------------------------------------

/** Die wievielte Person ist das? -1, wenn sie nicht mitspielt. */
export const spielerNr = (g, playerId) => g.players.findIndex((p) => p.id === playerId);

/** Welche Plaetze schnippst diese Person? Bei 1 gegen 1 sind es zwei. */
export function plaetzeVon(g, playerId) {
  const i = spielerNr(g, playerId);
  return i < 0 ? [] : g.sitze.map((s, nr) => (s === i ? nr : -1)).filter((nr) => nr >= 0);
}

/** Ihr erster Platz. Fuer alles, was nur EINEN Platz braucht. */
export const platzVon = (g, playerId) => plaetzeVon(g, playerId)[0] ?? -1;

/**
 * Von welchem Platz aus schaut diese Person gerade auf den Tisch?
 *
 * Wer zwei Korken hat, schnippst mal von links, mal von rechts - und dann
 * braucht er auch den Blick von der jeweiligen Ecke. Ein fester Blickwinkel
 * waere bei 1 gegen 1 die Haelfte der Zuege der falsche.
 *
 * Genommen wird der naechste eigene Platz, der in dieser Runde noch drankommt.
 * Ist man selbst am Zug, ist das genau der Korken, der gerade geschnippst wird;
 * wartet man, schaut man schon von der Ecke, von der man als naechstes
 * schiesst.
 */
export function kameraPlatz(g, playerId) {
  const meine = plaetzeVon(g, playerId);
  if (!meine.length) return 0;
  if (meine.length === 1) return meine[0];
  return g.reihe.slice(g.dran).find((nr) => meine.includes(nr)) ?? meine[0];
}

/** Wer schnippst diesen Platz? */
export const spielerAmPlatz = (g, nr) => g.players[g.sitze[nr]] ?? null;

/** Zu welchem Team gehoert diese Person? */
export const teamVon = (g, playerId) => g.teamOf[spielerNr(g, playerId)] ?? null;

/** Alle Personen eines Teams, als Nummern. */
export const teamSpieler = (g, team) =>
  g.players.map((_, i) => i).filter((i) => g.teamOf[i] === team);

/** Der Kapitaen eines Teams: wer auf dem linken Platz sitzt. */
export const kapitaenVon = (g, team) => g.players[g.sitze[KAPITAENSPLATZ[team]]] ?? null;

/** Ist diese Person Kapitaen ihres Teams? */
export const istKapitaen = (g, playerId) =>
  !!playerId && kapitaenVon(g, teamVon(g, playerId))?.id === playerId;

/** Wie ist es besetzt? "2 gegen 1" und so weiter - nur zur Anzeige. */
export const aufstellung = (g) => `${teamSpieler(g, 0).length} gegen ${teamSpieler(g, 1).length}`;

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

/** Ist die Runde durch - haben also alle vier Korken ihren Schuss gehabt? */
export const rundeVorbei = (g) => g.dran >= g.reihe.length;

/** Wer ist gerade dran? Gibt die Person zurueck, nicht die Nummer. */
export const currentPlayer = (g) => (rundeVorbei(g) ? null : spielerAmPlatz(g, amZug(g)));

/** Ist diese Person am Zug? */
export const istDran = (g, playerId) =>
  !rundeVorbei(g) && g.sitze[amZug(g)] === spielerNr(g, playerId) && spielerNr(g, playerId) >= 0;

/**
 * Alle Plaetze ueberspringen, deren Korken nicht mehr auf der Matte liegt. Auch
 * der Erste einer Runde kann betroffen sein - sein Korken kann in der Runde
 * davor runtergefallen sein.
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
  if (!istDran(g, playerId)) return g;
  const nr = amZug(g);
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
 * das andere Team ext seine Flaschen und macht neue auf. Alles, was dort bis
 * dahin getrunken wurde, zaehlt damit nicht mehr.
 */
export function rundeAuswerten(g) {
  const { schluecke, mama, einzeln } = teamWertung(g.korken);

  // "Deine Mama": neue Flaschen fuer das andere Team. Damit ist auch niemand
  // dort mehr fertig - eine frische Flasche ist nun mal nicht leer.
  const getrunken = [...g.getrunken];
  const fertig = [...g.fertig];
  for (const t of [0, 1]) {
    if (!mama[t]) continue;
    for (const i of teamSpieler(g, 1 - t)) {
      getrunken[i] = 0;
      fertig[i] = false;
    }
  }

  return sortiereEin({
    ...g,
    getrunken,
    fertig,
    offen: [schluecke[0], schluecke[1]],
    letzte: { schluecke, mama, einzeln, verteilt: g.players.map(() => 0) },
  });
}

/**
 * Was sich nicht mehr aufteilen laesst, wird gleich zugeteilt.
 *
 * Wer seine Flasche leer hat, schnippst weiter mit, trinkt aber nichts mehr.
 * Bleibt in einem Team also nur noch einer uebrig - und bei 1 gegen 1 ist das
 * von Anfang an so -, gibt es nichts zu entscheiden: die Schluecke gehen alle
 * an ihn, ohne dass jemand tippen muss. Danach steht die Phase fest: aufteilen
 * nur, wenn noch etwas offen ist.
 */
function sortiereEin(g) {
  const getrunken = [...g.getrunken];
  const offen = [...g.offen];
  const verteilt = [...(g.letzte?.verteilt ?? g.players.map(() => 0))];

  for (const t of [0, 1]) {
    if (offen[t] <= 0) continue;
    const frei = teamSpieler(g, t).filter((i) => !g.fertig[i]);
    // Niemand mehr da, der trinken koennte: die Schluecke verfallen. Kommt im
    // laufenden Spiel nicht vor - wer keine volle Flasche mehr hat, hat
    // gewonnen -, aber ohne diesen Zweig haenge die Runde fest.
    if (!frei.length) {
      offen[t] = 0;
      continue;
    }
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
// Jeder sagt einmal je Runde, ob seine Flasche leer ist. Erst wenn alle
// geantwortet haben, geht es weiter - entweder in die Bestaetigung oder gleich
// in die naechste Runde. Wer schon fertig ist, wird nicht nochmal gefragt.

function frageStellen(g) {
  const antwort = g.players.map((_, i) => (g.fertig[i] ? "fertig" : null));
  return pruefeAntworten({ ...g, antwort, phase: "leerfrage" });
}

/** "Meine Flasche ist leer" oder "noch nicht". */
export function antworte(g, playerId, istLeer) {
  if (g.phase !== "leerfrage") return g;
  const i = spielerNr(g, playerId);
  if (i < 0 || g.antwort[i] !== null) return g;

  const antwort = [...g.antwort];
  antwort[i] = istLeer ? "leer" : "nein";
  return pruefeAntworten({ ...g, antwort });
}

/**
 * Haben alle geantwortet? Dann kommen die Ansprueche dran - EINER NACH DEM
 * ANDEREN, und jeder muss vom Kapitaen des anderen Teams bestaetigt werden.
 * Sonst koennte man einfach draufdruecken und haette gewonnen.
 */
function pruefeAntworten(g) {
  if (g.antwort.some((a) => a === null)) return g;

  const ansprueche = g.antwort.map((a, i) => (a === "leer" ? i : -1)).filter((i) => i >= 0);
  if (!ansprueche.length) return naechsteRunde(g);
  return { ...g, phase: "bestaetigen", leer: { nr: ansprueche[0], rest: ansprueche.slice(1) } };
}

/**
 * Einen Schluck an ein Teammitglied geben. Aufteilen darf nur der Kapitaen,
 * und nur innerhalb des eigenen Teams.
 */
export function verteile(g, playerId, zielId) {
  if (g.phase !== "verteilen") return g;
  const wer = spielerNr(g, playerId);
  const ziel = spielerNr(g, zielId);
  if (wer < 0 || ziel < 0) return g;
  if (!istKapitaen(g, playerId)) return g;

  const team = g.teamOf[wer];
  if (g.teamOf[ziel] !== team) return g;  // nur im eigenen Team
  if (g.offen[team] <= 0) return g;
  if (g.fertig[ziel]) return g;           // wer leer hat, trinkt nicht mehr

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
  const wer = spielerNr(g, playerId);
  const ziel = spielerNr(g, zielId);
  if (wer < 0 || ziel < 0) return g;
  if (!istKapitaen(g, playerId)) return g;

  const team = g.teamOf[wer];
  if (g.teamOf[ziel] !== team) return g;
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

/** Wer ist gerade mit einem Anspruch dran? Die Nummer der Person. */
export const anspruchVon = (g) => (g.phase === "bestaetigen" ? g.leer?.nr ?? null : null);

/** Wie viele Ansprueche warten noch, diesen mitgezaehlt? */
export const ansprueche = (g) => (g.phase === "bestaetigen" ? 1 + (g.leer?.rest.length ?? 0) : 0);

/** Wer ist gerade gefragt? Der Kapitaen der Gegenseite. */
export const bestaetigerVon = (g) =>
  g.phase === "bestaetigen" ? kapitaenVon(g, 1 - g.teamOf[g.leer.nr]) : null;

/**
 * Darf diese Person ueber den offenen Anspruch entscheiden?
 *
 * Nur der KAPITAEN des anderen Teams - genau wie beim Aufteilen. Sagen zwei
 * Leute in derselben Runde "leer", kommen die Ansprueche nacheinander, und dann
 * klopfen sonst beide Handys der Gegenseite um dieselbe Frage: wer zuerst
 * tippt, entscheidet fuer beide, und dem anderen springt das Bild weg, ohne
 * dass er weiss warum.
 */
export function darfBestaetigen(g, playerId) {
  if (g.phase !== "bestaetigen") return false;
  return bestaetigerVon(g)?.id === playerId;
}

/** Den naechsten Anspruch vorholen - oder die Runde beenden. */
function naechsterAnspruch(g, fertig) {
  // Gewonnen hat das Team, dessen Flaschen alle leer sind.
  for (const t of [0, 1]) {
    if (teamSpieler(g, t).every((i) => fertig[i])) {
      return { ...g, fertig, leer: null, phase: "finished", sieger: t };
    }
  }
  const rest = g.leer.rest;
  if (rest.length) return { ...g, fertig, leer: { nr: rest[0], rest: rest.slice(1) } };
  return naechsteRunde({ ...g, fertig, leer: null });
}

/**
 * Der Kapitaen des anderen Teams bestaetigt. Damit ist EINE Flasche leer -
 * gewonnen hat ein Team erst, wenn alle seine leer sind. Bis dahin schnippst
 * der Fertige weiter mit, bekommt aber nichts mehr zu trinken.
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
    antwort: g.players.map(() => null),
    leer: null,
    schuss: null,
  };
}

/** Wie viel hat ein Team zusammen getrunken? Nur zur Anzeige. */
export const teamGetrunken = (g, team) =>
  teamSpieler(g, team).reduce((summe, i) => summe + g.getrunken[i], 0);

// ---------------------------------------------------------------------------
// Wenn jemand weg ist
// ---------------------------------------------------------------------------

/** Auf wen wartet die Runde gerade? */
export function wartetAufLeber(g) {
  if (!g || g.phase === "finished") return [];

  // Ein Anspruch liegt vor - gefragt ist der Kapitaen des anderen Teams.
  if (g.phase === "bestaetigen") {
    const id = bestaetigerVon(g)?.id;
    return id ? [id] : [];
  }

  // Die Frage nach der Flasche: alle, die noch nicht geantwortet haben.
  if (g.phase === "leerfrage") {
    return g.antwort.map((a, i) => (a === null ? g.players[i]?.id : null)).filter(Boolean);
  }

  // Aufteilen: BEIDE Teams gleichzeitig, aber je nur der Kapitaen.
  if (g.phase === "verteilen") {
    return [0, 1]
      .filter((t) => g.offen[t] > 0)
      .map((t) => kapitaenVon(g, t)?.id)
      .filter(Boolean);
  }

  const p = currentPlayer(g);
  return p ? [p.id] : [];
}

/**
 * Diese Person ueberspringen, weil sie zu lange weg ist: ihr Schuss faellt
 * aus, ihr Korken bleibt liegen, wo er liegt.
 */
export function ueberspringenLeber(g, playerId) {
  if (!g || g.phase !== "play") return g;
  if (!istDran(g, playerId)) return g;

  const next = zugVorbereiten({ ...g, dran: g.dran + 1 });
  return rundeVorbei(next) ? rundeAuswerten(next) : next;
}
