// Leberschuss - das Schnippsen.
//
// Hier steht nur die Rechnerei: Spielfeld, Kronkorken, Reibung, Zusammenstoesse
// und die Wertung. Kein Zeichnen, kein Antippen - das macht schnipps.html.
//
// Zwei Dinge sind wichtig:
//
// 1. KEINE BANDE. Gespielt wird auf einer Matte auf dem Tisch. Wer zu fest
//    schnippst, dessen Korken fliegt hinten runter und ist weg - der zaehlt
//    nicht mehr und steht in der naechsten Runde auch nicht mehr zur
//    Verfuegung. Das ist die eigentliche Strafe fuers Uebertreiben.
//
// 2. Ein Schuss geht IMMER gleich aus: gleicher Anfang, gleicher Schuss,
//    gleiches Ergebnis. Deshalb wird in festen Zeitschritten gerechnet und
//    nichts aus der echten Uhr gelesen. Online kann dann jedes Handy denselben
//    Schuss selbst nachrechnen, statt dass jemand die Animation verschickt.
//
// Gerechnet wird in Zentimetern, die Matte ist 40 x 120 cm wie auf dem Tisch.

export const FELD = { breite: 40, laenge: 120 };
export const KORKEN_R = 1.5; // Kronkorken sind knapp 3 cm breit

// --- Wie sich ein geschnippster Kronkorken wirklich verhaelt ---------------
//
// Ein Kronkorken rutscht nicht wie ein Puck auf Eis, sondern schabt ueber die
// Matte. Dabei gilt trockene Reibung: die Bremsung ist naeherungsweise KONSTANT
// und haengt nicht vom Tempo ab. a = mue * g. Fuer Blech auf Kunststoff liegt
// mue bei etwa 0,35, also a = 0,35 * 981 = rund 340 cm/s².
//
// Was daraus folgt, und was das Spiel schwer macht:
//   * Ein Schuss ueber einen Meter braucht knapp 3 m/s Anfangstempo und ist
//     nach 0,8 Sekunden vorbei. Kein Dahingleiten, sondern ein kurzer Schuss.
//   * Die Weite waechst mit dem QUADRAT des Tempos (s = v² / 2a). Doppelt so
//     fest heisst viermal so weit. Deshalb ist Dosieren so undankbar.
//   * Und ein Finger schnippst nie exakt geradeaus. Je fester, desto
//     ungenauer - das steckt als Streuung mit drin.
const G = 981; // Erdbeschleunigung in cm/s²
const MUE = 0.35; // Reibungszahl Blech auf Kunststoffmatte
const BREMSE = MUE * G; // cm/s², konstant

// Ganz am Anfang huepft und taumelt der Korken noch, statt sauber zu schaben -
// in den ersten Hundertstelsekunden bremst er deshalb weniger.
const HUEPF_ZEIT = 0.06; // Sekunden
const HUEPF_BREMSE = 0.45; // so viel Reibung wirkt in der Zeit

// Kleine Schritte, weil die Korken schnell sind: bei 300 cm/s waeren es bei
// 1/120 s schon 2,5 cm pro Schritt - mehr als ein halber Korken.
const DT = 1 / 480;
const ABPRALL = 0.5; // Blech gegen Glasflasche - das springt gut zurueck
const STOSS_VERLUST = 0.95; // Korken gegen Korken, fast elastisch
const STILL = 2; // langsamer als das bleibt er liegen (cm/s)
const MAX_SCHRITTE = 2400; // Notbremse, 5 Sekunden

// Hoechsttempo bei vollem Ausholen. Damit fliegt der Korken rund 1,60 m weit -
// also weit ueber die Matte hinaus und runter. Wer treffen will, muss deutlich
// darunter bleiben. test-schnipps.js rechnet die Weiten nach.
export const MAX_TEMPO = 330;

// Wie krumm ein Schnipp hoechstens geht, im Bogenmass. Bei voller Kraft sind
// das gut drei Grad - auf einen Meter also rund fuenf Zentimeter daneben.
const STREUUNG = 0.055;

/**
 * Die Wertungsfelder der gegnerischen Haelfte.
 *
 * Herkunft der Zahlen: aus dem Foto der Matte ausgemessen (40 x 120 cm,
 * 7,17 Pixel je Zentimeter). Die Kantenerkennung liefert aber krumme Werte -
 * links 3,1 und rechts 36,8 statt sauber symmetrisch. Die echte Matte ist
 * gedruckt und damit spiegelsymmetrisch zur Mittelachse, also sind die Werte
 * hier auf x = 20 gespiegelt und die gemeinsamen Kanten auf dieselbe Hoehe
 * gelegt. Das ist naeher an der Vorlage als das Messergebnis selbst.
 *
 * Die drei Felder bilden zusammen eine Raute: vorne die schmale Spitze der
 * "3", zur Tischmitte hin die breite "1", die wieder spitz auslaeuft.
 *
 * Nullpunkt unten links aus Sicht dessen, der gerade schnippst.
 */
export const FELDER = [
  {
    name: "1 Schluck",
    punkte: 1,
    schrift: [20, 79.5],
    ecken: [
      [6.5, 85.0], [33.5, 85.0], [36.85, 78.35], [20, 68.0], [3.15, 78.35],
    ],
  },
  {
    name: "2 Schlücke",
    punkte: 2,
    schrift: [20, 91.5],
    ecken: [
      [6.75, 85.7], [33.25, 85.7], [26.95, 97.6], [13.05, 97.6],
    ],
  },
  {
    name: "3 Schlücke",
    punkte: 3,
    schrift: [20, 102],
    ecken: [
      [13.5, 98.2], [26.5, 98.2], [20, 110.0],
    ],
  },
  {
    // Ganz hinten ZWISCHEN den Flaschen. Zaehlt vor allen anderen Feldern.
    // Die Form kommt weiter unten aus mamaForm() - sie haengt an den Flaschen.
    name: "Deine Mama",
    mama: true,
    punkte: 0,
    schrift: [20, 115.2],
    ecken: [],
  },
];

/**
 * Die Flaschen stehen in den beiden Aussparungen links und rechts von "Deine
 * Mama". `r` ist der halbe Durchmesser einer 0,33er - genau so dick, wie sie
 * auch gezeichnet wird.
 *
 * Vorher stand hier die Groesse der AUSSPARUNG auf der Matte (3,9 cm). Der
 * Korken prallte dadurch schon einen Zentimeter vor dem Glas ab, also sichtbar
 * an nichts. Die Luecke zu "Deine Mama" wird damit breiter - genau so breit,
 * wie sie zwischen zwei echten Flaschen eben ist.
 */
export const FLASCHEN_R = 3.0;

/** Die beiden Flaschen der gegnerischen Haelfte. */
export const FLASCHEN = [
  { x: 14.5, y: 111.4, r: FLASCHEN_R },
  { x: 25.5, y: 111.4, r: FLASCHEN_R },
];

/**
 * ALLE VIER Flaschen - auch die beiden auf der eigenen Haelfte.
 *
 * Es standen immer vier auf dem Tisch, gezeichnet wurden auch vier, aber
 * gerechnet wurde nur mit den zwei da hinten. Die beiden vorne, direkt neben
 * den eigenen Startecken, waren fuer den Korken nicht vorhanden: er flog
 * mitten durch das Glas oder blieb darin liegen. Wer hier eine Schleife ueber
 * Flaschen schreibt, nimmt DIESE Liste.
 */
export const FLASCHEN_ALLE = FLASCHEN.flatMap((f) => [
  { ...f },
  { ...f, y: FELD.laenge - f.y },
]);

/** Wie weit "Deine Mama" nach hinten reicht. */
const MAMA_HINTEN = 117.6;
/**
 * Und wo es vorne anfaengt. Genau wie beim alten Rechteck: einen Tick hinter
 * der Mitte der Flaschen. Weiter vorne wuerde das Feld die Spitze der "3"
 * verschlucken - ein Korken dort beruehrt beides, und Mama zaehlt vor allem
 * anderen.
 */
const MAMA_VORNE = 111.8;
/** Und wie viel Luft zwischen Feldrand und Glas bleibt. */
const MAMA_LUFT = 0.25;

/**
 * Die Form von "Deine Mama": der Zwickel hinter und zwischen den Flaschen.
 *
 * Frueher war das ein Rechteck. Das lag zu einem guten Teil UNTER den Flaschen -
 * Punkte, die man gar nicht treffen kann, weil dort Glas steht, und beim
 * Zeichnen schaute das Rot unter der Flasche hervor. Jetzt laeuft der Rand in
 * einem Bogen an beiden Flaschen entlang.
 *
 * Der Weg hinein ist damit genau die Luecke zwischen den beiden Flaschen -
 * also das, was man am Tisch auch treffen muss.
 */
function mamaForm() {
  const [links, rechts] = FLASCHEN;
  const r = FLASCHEN_R + MAMA_LUFT;
  const bogen = (f, von, bis, n = 9) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const w = von + ((bis - von) * i) / n;
      return [f.x + Math.cos(w) * r, f.y + Math.sin(w) * r];
    });

  const H = Math.PI / 2;
  // Wo der Bogen anfaengt: dort, wo die Flasche die vordere Kante schneidet.
  const start = Math.asin(Math.max(-1, Math.min(1, (MAMA_VORNE - links.y) / r)));

  return [
    // Rechte Seite der linken Flasche, von der vorderen Kante nach hinten
    ...bogen(links, start, H),
    [links.x, MAMA_HINTEN],
    [rechts.x, MAMA_HINTEN],
    // Linke Seite der rechten Flasche, von hinten zurueck nach vorne
    ...bogen(rechts, H, Math.PI - start),
  ];
}

FELDER.find((f) => f.mama).ecken = mamaForm();

/**
 * Nur zum Zeichnen: der gelbe Rahmen, die beiden Keile zur Mitte hin und das
 * rote X in der Mitte. Ebenfalls aus dem Foto, ebenfalls auf die Mittelachsen
 * ausgerichtet.
 */
export const DEKO = {
  rahmen: 1.1, // Breite des gelben Randes
  ecke: 5.4, // wie weit die Ecken abgeschraegt sind
  keile: [
    [[0, 43.3], [12.3, 60], [0, 76.7]],
    [[40, 43.3], [27.7, 60], [40, 76.7]],
  ],
  x: { x: 20, y: 60, gross: 3.4 },
};

/** Startplaetze der Korken: die beiden Ecken der eigenen Seite. */
export const ECKEN = [
  { x: 4.5, y: 5 },
  { x: 35.5, y: 5 },
];

export const FARBEN = {
  matte: "#001119",
  gelb: "#FAB001",
  rot: "#E3010C",
  tisch: "#241A12",
};

// ---------------------------------------------------------------------------
// Rechnen
// ---------------------------------------------------------------------------

const laenge = (x, y) => Math.hypot(x, y);

/**
 * Ein Schuss. `korken` ist die Liste aller Korken auf der Matte, `nr` der, der
 * geschnippst wird, `richtung` ein Winkel im Bogenmass und `kraft` 0 bis 1.
 *
 * Zurueck kommt die ganze Bewegung: fuer jeden Zeitschritt die Positionen.
 * Korken, die runtergefallen sind, haben `raus: true`.
 */
/**
 * Aus den Schussdaten eine feste Zufallszahl zwischen -1 und 1 machen.
 *
 * Es muss Streuung geben, sonst trifft man jedes Mal exakt dasselbe. Es darf
 * aber kein echter Zufall sein, sonst rechnet online jedes Handy etwas anderes
 * aus. Also wird aus Ausgangslage, Winkel und Kraft eine Zahl gewuerfelt - bei
 * gleichem Schuss immer dieselbe.
 */
function streuZahl(korken, nr, richtung, kraft) {
  let h = 2166136261;
  const rein = (v) => {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  rein(nr);
  rein(richtung);
  rein(kraft);
  for (const k of korken) {
    rein(k.x);
    rein(k.y);
  }
  return ((h >>> 0) % 20001) / 10000 - 1;
}

/**
 * Ein Schuss. `korken` ist die Liste aller Korken auf der Matte, `nr` der, der
 * geschnippst wird, `richtung` ein Winkel im Bogenmass und `kraft` 0 bis 1.
 *
 * Zurueck kommt die ganze Bewegung: fuer jeden Zeitschritt die Positionen.
 * Korken, die runtergefallen sind, haben `raus: true`.
 */
export function schiesse(korken, nr, richtung, kraft) {
  const stand = korken.map((k) => ({ ...k, vx: 0, vy: 0, raus: !!k.raus, zeit: 0 }));
  // Falls aus einer aelteren Fassung noch ein Korken in einer Flasche steckt:
  // erst einmal freiraeumen, sonst schiebt er sich den ganzen Schuss lang an
  // ihr entlang.
  for (const k of stand) if (!k.raus) flaschenStoss(k, k.x, k.y);

  const treffer = stand[nr];
  if (!treffer || treffer.raus) return { bilder: [], ende: stand, dt: DT };

  const k = Math.max(0, Math.min(1, kraft));
  // Die Kraft geht aufs TEMPO, nicht auf die Weite. Die Weite ergibt sich
  // daraus von selbst - und zwar im Quadrat, so wie in echt.
  const tempo = k * MAX_TEMPO;
  // Je fester geschnippst, desto krummer geht es
  const schief = streuZahl(korken, nr, richtung, kraft) * STREUUNG * k * k;
  const winkel = richtung + schief;

  treffer.vx = Math.cos(winkel) * tempo;
  treffer.vy = Math.sin(winkel) * tempo;

  const bild = () => stand.map((s) => ({ x: s.x, y: s.y, raus: s.raus }));
  const bilder = [];
  for (let schritt = 0; schritt < MAX_SCHRITTE; schritt++) {
    bilder.push(bild());
    if (!einSchritt(stand)) break;
  }
  bilder.push(bild());
  return { bilder, ende: stand.map(({ x, y, raus }) => ({ x, y, raus })), dt: DT };
}

/**
 * Der Korken ist gerade von (vorX, vorY) auf (k.x, k.y) gerutscht - stand ihm
 * dabei eine Flasche im Weg?
 *
 * Geprueft wird die ganze STRECKE, nicht nur der Endpunkt. Bei vollem Tempo
 * sind das zwar nur 0,7 cm je Schritt, und eine Flasche ist mit dem Korken
 * zusammen 9 cm dick - durchfliegen kann er also eigentlich nicht. "Eigentlich"
 * ist beim Rechnen aber kein gutes Wort: sobald jemand den Zeitschritt vergroe-
 * ssert oder das Hoechsttempo anhebt, faengt genau das an. So bleibt es dicht.
 *
 * Danach wird noch ein paarmal nachgeschaut. Ein Korken, den die eine Flasche
 * wegdrueckt, kann in der Luecke daneben gleich in der naechsten stecken.
 */
function flaschenStoss(k, vorX, vorY) {
  for (let runde = 0; runde < 4; runde++) {
    let getroffen = null;
    let besteZeit = Infinity;

    for (const f of FLASCHEN_ALLE) {
      const min = f.r + KORKEN_R;

      // Steckt er schon drin? Dann sofort heraus - das ist der haeufige Fall.
      const dx = k.x - f.x;
      const dy = k.y - f.y;
      const d = laenge(dx, dy);
      if (d < min) {
        if (0 < besteZeit) {
          besteZeit = 0;
          getroffen = { f, nx: d === 0 ? 1 : dx / d, ny: d === 0 ? 0 : dy / d, min };
        }
        continue;
      }

      // Sonst: schneidet die Strecke den Kreis? Ein Punkt auf der Strecke ist
      // vorher + t * (nachher - vorher); gesucht ist das kleinste t, bei dem
      // der Abstand zum Mittelpunkt genau `min` ist.
      const sx = k.x - vorX;
      const sy = k.y - vorY;
      const a = sx * sx + sy * sy;
      if (a === 0) continue;
      const mx = vorX - f.x;
      const my = vorY - f.y;
      const b = 2 * (mx * sx + my * sy);
      const c = mx * mx + my * my - min * min;
      const unter = b * b - 4 * a * c;
      if (unter < 0) continue;
      const t = (-b - Math.sqrt(unter)) / (2 * a);
      if (t < 0 || t > 1 || t >= besteZeit) continue;

      const tx = vorX + sx * t;
      const ty = vorY + sy * t;
      besteZeit = t;
      getroffen = { f, nx: (tx - f.x) / min, ny: (ty - f.y) / min, min };
    }

    if (!getroffen) return;

    // Auf die Glaswand setzen und abprallen lassen
    const { f, nx, ny, min } = getroffen;
    k.x = f.x + nx * min;
    k.y = f.y + ny * min;
    const rein = k.vx * nx + k.vy * ny;
    if (rein < 0) {
      k.vx -= (1 + ABPRALL) * rein * nx;
      k.vy -= (1 + ABPRALL) * rein * ny;
    }
    // Ab hier faengt die Strecke am Abprallpunkt neu an.
    vorX = k.x;
    vorY = k.y;
  }
}

/** Ein Zeitschritt. Gibt zurueck, ob sich noch etwas bewegt. */
function einSchritt(stand) {
  let bewegt = false;

  for (const k of stand) {
    if (k.raus) continue;
    const v = laenge(k.vx, k.vy);
    if (v < STILL) {
      k.vx = 0;
      k.vy = 0;
      continue;
    }
    bewegt = true;

    // Trockene Reibung: konstante Bremsung, unabhaengig vom Tempo. In den
    // ersten Hundertstelsekunden weniger, da huepft der Korken noch.
    k.zeit = (k.zeit ?? 0) + DT;
    const bremse = BREMSE * (k.zeit < HUEPF_ZEIT ? HUEPF_BREMSE : 1);
    const neu = Math.max(0, v - bremse * DT);
    k.vx = (k.vx / v) * neu;
    k.vy = (k.vy / v) * neu;

    const vorX = k.x;
    const vorY = k.y;
    k.x += k.vx * DT;
    k.y += k.vy * DT;

    // Keine Bande: ueber den Rand hinaus ist der Korken vom Tisch. Er faellt
    // erst, wenn er wirklich drueber ist - halb ueber der Kante liegt noch.
    if (
      k.x < -KORKEN_R ||
      k.x > FELD.breite + KORKEN_R ||
      k.y < -KORKEN_R ||
      k.y > FELD.laenge + KORKEN_R
    ) {
      k.raus = true;
      k.vx = 0;
      k.vy = 0;
      continue;
    }

    flaschenStoss(k, vorX, vorY);
  }

  // Korken untereinander: gleiche Masse, gerader Stoss
  for (let i = 0; i < stand.length; i++) {
    for (let j = i + 1; j < stand.length; j++) {
      const a = stand[i];
      const b = stand[j];
      if (a.raus || b.raus) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = laenge(dx, dy);
      const min = KORKEN_R * 2;
      if (d >= min || d === 0) continue;

      const nx = dx / d;
      const ny = dy / d;
      const ueberlapp = (min - d) / 2;
      a.x -= nx * ueberlapp;
      a.y -= ny * ueberlapp;
      b.x += nx * ueberlapp;
      b.y += ny * ueberlapp;

      const rein = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rein > 0) continue; // fliegen schon auseinander
      const stoss = rein * STOSS_VERLUST; // Blech auf Blech, fast nichts geht verloren
      a.vx += stoss * nx;
      a.vy += stoss * ny;
      b.vx -= stoss * nx;
      b.vy -= stoss * ny;
      // Der Angestossene springt kurz an, bevor er sauber schabt
      a.zeit = 0;
      b.zeit = 0;
    }
  }

  // Beim Auseinanderschieben kann ein Korken in eine Flasche geraten - auch
  // ein Korken, der laengst stillliegt und deshalb oben uebersprungen wurde.
  // Also zum Schluss noch einmal alle freiraeumen.
  for (const k of stand) if (!k.raus) flaschenStoss(k, k.x, k.y);

  return bewegt;
}

// ---------------------------------------------------------------------------
// Wertung
// ---------------------------------------------------------------------------

/** Liegt der Punkt innerhalb des Vielecks? Strahl nach rechts, Kanten zaehlen. */
function drin(px, py, ecken) {
  let innen = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const [xi, yi] = ecken[i];
    const [xj, yj] = ecken[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) innen = !innen;
  }
  return innen;
}

/** Kuerzester Abstand von einem Punkt zu einer Strecke. */
function abstandZurKante(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return laenge(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Beruehrt ein Korken das Feld? Beruehren reicht - wie am Tisch, wo ein
 * Korken zaehlt, sobald er die Linie kuesst.
 */
function beruehrt(k, f) {
  if (k.raus) return false;
  if (drin(k.x, k.y, f.ecken)) return true;
  for (let i = 0, j = f.ecken.length - 1; i < f.ecken.length; j = i++) {
    if (abstandZurKante(k.x, k.y, f.ecken[j], f.ecken[i]) <= KORKEN_R) return true;
  }
  return false;
}

/**
 * Was bringt ein einzelner Korken? Beruehrt er mehrere Felder, zaehlt das
 * bessere. "Deine Mama" schlaegt alles.
 */
export function wertungIn(k, felder) {
  let bestes = null;
  for (const f of felder) {
    if (!beruehrt(k, f)) continue;
    if (f.mama) return f;
    if (!bestes || f.punkte > bestes.punkte) bestes = f;
  }
  return bestes;
}

/** Die Felder der fernen Haelfte - das Ziel von Team 0. */
export const wertung = (k) => wertungIn(k, FELDER);

/**
 * Dieselben Felder, gespiegelt an der Mitte: das sind die Felder auf der
 * eigenen Haelfte von Team 0, also das Ziel von Team 1.
 */
export const FELDER_UNTEN = FELDER.map((f) => ({
  ...f,
  ecken: f.ecken.map(([x, y]) => [FELD.breite - x, FELD.laenge - y]),
  schrift: [FELD.breite - f.schrift[0], FELD.laenge - f.schrift[1]],
}));

/**
 * Fuer wen zaehlt ein Korken?
 *
 * Die Seite entscheidet, nicht der Besitzer. Ein Korken in einem Feld der
 * FERNEN Haelfte bringt Team 0 die Schluecke, einer in der NAHEN Haelfte
 * Team 1. Damit ist beides abgedeckt: der saubere Treffer beim Gegner - und
 * der eigene Korken, der auf der eigenen Seite liegenbleibt und dem Gegner
 * die Schluecke schenkt.
 */
export function wertungSeite(k) {
  const fern = wertungIn(k, FELDER);
  if (fern) return { feld: fern, team: 0 };
  const nah = wertungIn(k, FELDER_UNTEN);
  if (nah) return { feld: nah, team: 1 };
  return null;
}

/**
 * Die ganze Runde nach Teams getrennt. `mama[t]` heisst: Team t hat "Deine
 * Mama" getroffen - das andere Team muss dann beide Flaschen leeren und neue
 * aufmachen, faengt also wieder bei null an.
 */
export function teamWertung(korken) {
  const schluecke = [0, 0];
  const mama = [false, false];
  const einzeln = korken.map((k) => {
    const w = wertungSeite(k);
    if (!w) return null;
    if (w.feld.mama) mama[w.team] = true;
    else schluecke[w.team] += w.feld.punkte;
    return w;
  });
  return { schluecke, mama, einzeln };
}

/** Die ganze Runde: Summe der Schluecke und ob "Deine Mama" dabei war. */
export function rundenWertung(korken) {
  let schluecke = 0;
  let mama = false;
  const einzeln = korken.map((k) => {
    const f = wertung(k);
    if (f?.mama) mama = true;
    else if (f) schluecke += f.punkte;
    return f;
  });
  return { schluecke, mama, einzeln };
}

/** Wie viele Korken liegen noch auf der Matte? */
export const nochDa = (korken) => korken.filter((k) => !k.raus).length;
