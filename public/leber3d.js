// Leberschuss - das Zeichnen.
//
// Hier steht ausschliesslich, wie das Spielfeld aussieht: die Schraegansicht,
// die Flaschen, die Kronkorken, der Zielpfeil. Von den Regeln weiss dieses
// Modul nichts - es bekommt ein fertiges Bild beschrieben und malt es:
//
//   zeichner.zeichne({
//     korken:    [{x, y, team, raus}, ...],
//     eigener:   Nummer des Korkens, der einen Ring bekommt (oder -1),
//     zielen:    null oder { nr, phase: "richtung"|"kraft", richtung, kraft },
//     getroffen: Felder, die nach der Runde aufleuchten sollen,
//     namen:     Namen der vier Leute - werden nur in der Draufsicht gemalt,
//   })
//
// Dadurch laesst es sich sowohl von der einzelnen Testseite als auch aus der
// App heraus benutzen, ohne dass eine der beiden etwas von der anderen weiss.

// Relativ und nicht "/game/schnipps.js": so findet nicht nur der Browser die
// Datei, sondern auch Node beim Prüfen und beim Bilder-Rendern.
import {
  FELD, FELDER, FLASCHEN, FLASCHEN_ALLE, FLASCHEN_R, ECKEN, KORKEN_R, DEKO, FARBEN,
} from "../game/schnipps.js";

/** Die vier Ecken, an denen die Spieler sitzen - nur fuer die Kamera. */
const ECKE = [
  { x: ECKEN[0].x, y: ECKEN[0].y },
  { x: ECKEN[1].x, y: ECKEN[1].y },
  { x: ECKEN[0].x, y: FELD.laenge - ECKEN[0].y },
  { x: ECKEN[1].x, y: FELD.laenge - ECKEN[1].y },
];

/**
 * Einen Zeichner fuer dieses Canvas bauen. Alles Weitere - Kamera, vorgebackener
 * Hintergrund, Zwischenstaende - bleibt in diesem Verschluss und stoert
 * niemanden von aussen.
 */
export function macheZeichner(cv) {
const bildschirm = cv.getContext("2d");

// Gezeichnet wird immer auf `ctx`. Das ist normalerweise der Bildschirm, beim
// Vorbacken des Hintergrunds aber kurzzeitig eine unsichtbare zweite Flaeche.
let ctx = bildschirm;

// ===========================================================================
// 1. Die Kamera
// ===========================================================================
//
// Man sitzt nicht senkrecht über dem Tisch, sondern schräg an der Ecke. Also
// wird alles perspektivisch gerechnet: eine Kamera hinter der eigenen Kante,
// etwas zur Seite versetzt, knapp einen Meter über der Platte.
//
// Die Rechnerei in schnipps.js bleibt davon unberührt - die arbeitet weiter
// flach in Zentimetern. Hier wird nur anders gemalt.

/**
 * Jeder Platz hat seinen eigenen Blick. Man sitzt ja an seiner Ecke - der
 * Spieler links vorne schaut anders aufs Feld als der rechts hinten, und wer
 * an der fernen Kante sitzt, sieht die Matte andersherum.
 *
 * Die Kamera wird deshalb aus dem Startplatz des eigenen Korkens abgeleitet:
 * dahinter, etwas zur Seite versetzt, gut einen Meter über der Platte.
 */
function kameraFuer(nr) {
  const s = ECKE[nr] ?? ECKE[0];
  const nah = s.y < FELD.laenge / 2;
  return {
    // Deutlich weiter außen als die eigene Ecke: man sitzt schräg am Tisch,
    // nicht dahinter. Zusammen mit der niedrigen Höhe ergibt das den flachen
    // Blick über die Matte, bei dem die hintere Hälfte klein wird.
    x: FELD.breite / 2 + (s.x - FELD.breite / 2) * 1.5,
    y: nah ? -78 : FELD.laenge + 78,          // dicht am Tisch
    z: 84,                                    // etwa Augenhöhe im Sitzen
    zielX: FELD.breite / 2,
    zielY: nah ? 56 : FELD.laenge - 56,       // knapp über die Mitte hinaus
    zielZ: 7,
    brenn: 96,                                // je größer, desto flacher
  };
}

/**
 * Nach der Runde: senkrecht von oben. Nur so sieht man wirklich, wo die Korken
 * lagen - in der Schrägansicht verdeckt die eigene Perspektive genau das.
 *
 * Der winzige Versatz in y ist Absicht: aus ihm rechnet sich die Blickrichtung
 * aus. Ohne ihn stünde die Kamera exakt über dem Ziel und wüsste nicht, wo bei
 * ihr oben ist - so bleibt die eigene Hälfte unten, wie beim Schnippsen.
 */
function kameraVonOben(nr) {
  const s = ECKE[nr] ?? ECKE[0];
  const nah = s.y < FELD.laenge / 2;
  const mitte = FELD.laenge / 2;
  return {
    x: FELD.breite / 2,
    y: mitte + (nah ? -1 : 1),
    z: 240,
    zielX: FELD.breite / 2,
    zielY: mitte,
    zielZ: 0,
    brenn: 260,
  };
}

let KAMERA = kameraFuer(0);
let vonOben = false;

/** Die Matte ist kein Aufkleber, sondern hat Dicke. Alles liegt darauf. */
const MATTE_Z = 0.4;

let gier = 0;
let nick = 0;
let skala = 1;
let mitteX = 0;
let mitteY = 0;

function kameraAusrichten() {
  const dx = KAMERA.zielX - KAMERA.x;
  const dy = KAMERA.zielY - KAMERA.y;
  const dz = KAMERA.zielZ - KAMERA.z;
  gier = Math.atan2(dx, dy);
  nick = Math.atan2(dz, Math.hypot(dx, dy));
}

/**
 * Ein Punkt der Tischwelt auf den Bildschirm. `z` ist die Höhe über der
 * Platte. Zurück kommen Bildschirmkoordinaten und die Tiefe - die brauchen
 * wir, um Weiter-hinten-Stehendes zuerst zu malen.
 */
function proj(x, y, z = 0) {
  const dx = x - KAMERA.x;
  const dy = y - KAMERA.y;
  const dz = z - KAMERA.z;

  // Um die Hochachse drehen, bis die Kamera geradeaus schaut
  const cg = Math.cos(gier);
  const sg = Math.sin(gier);
  const rx = dx * cg - dy * sg;
  const vor = dx * sg + dy * cg;

  // Und nach unten kippen
  const cn = Math.cos(nick);
  const sn = Math.sin(nick);
  const hoch = dz * cn - vor * sn;
  const tiefe = vor * cn + dz * sn;

  const f = KAMERA.brenn / Math.max(tiefe, 4);
  return { x: mitteX + rx * f * skala, y: mitteY - hoch * f * skala, tiefe };
}

// ===========================================================================
// 2. Licht
// ===========================================================================
//
// Damit etwas rund aussieht, reicht kein Farbverlauf. Jede kleine Fläche
// bekommt ihre eigene Helligkeit, je nachdem wie sie zur Lampe steht - genau
// wie in echt. Dazu ein zweites, schwaches Licht von hinten, damit die
// abgewandte Seite nicht schwarz absäuft, und ein Glanzpunkt fürs Material.

// Die Lampe hängt nicht senkrecht über dem Tisch, sondern schräg vorne links -
// nur dann bekommen auch die senkrechten Flächen Licht ab, also die
// Flaschenbäuche und die Etiketten. Steht sie zu hoch, wird alles grau.
const LICHT = { x: -60, y: -45, z: 120 };
const GEGENLICHT = { x: 110, y: 175, z: 60 }; // schwaches Licht von hinten rechts
const UMGEBUNG = 0.3;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const skalar = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const hin = (p, q) => norm([q.x - p[0], q.y - p[1], q.z - p[2]]);
const klemm = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Die Normale einer Fläche nach Newell - klappt auch bei krummen Vierecken. */
function normale(p) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([nx, ny, nz]);
}

function schwerpunkt(p) {
  let x = 0, y = 0, z = 0;
  for (const q of p) { x += q[0]; y += q[1]; z += q[2]; }
  return [x / p.length, y / p.length, z / p.length];
}

/**
 * Wie hell ist diese Fläche? `n` ist ihre Normale, `m` ihr Mittelpunkt.
 *
 * Streulicht (matt) plus Glanzpunkt (Spiegelung). `haerte` sagt, wie klein der
 * Glanzpunkt ist: Blech hat einen kleinen scharfen, Papier gar keinen.
 */
function beleuchte(n, m, haut) {
  const l = hin(m, LICHT);
  const g = hin(m, GEGENLICHT);
  const b = hin(m, KAMERA);
  const halb = norm([l[0] + b[0], l[1] + b[1], l[2] + b[2]]);

  let glanz = Math.pow(Math.max(0, skalar(n, halb)), haut.haerte) * haut.staerke;
  // Ein zweiter, weicherer Reflex: so sieht beschlagenes Glas aus, nicht wie
  // poliertes Blech mit einem einzelnen Punkt darauf.
  if (haut.glanz2) {
    glanz += Math.pow(Math.max(0, skalar(n, halb)), haut.glanz2.haerte) * haut.glanz2.staerke;
  }
  let f = (haut.grund ?? UMGEBUNG) + 0.72 * Math.max(0, skalar(n, l)) + 0.15 * Math.max(0, skalar(n, g));

  // Glas wird dort dunkel, wo man streifend durchschaut - da ist es dicker.
  if (haut.kante) {
    const k = 1 - Math.abs(skalar(n, b));
    f *= 1 - haut.kante * k * k;
  }
  const c = haut.farbe;
  return `rgb(${klemm(c[0] * f + 255 * glanz)},${klemm(c[1] * f + 255 * glanz)},${klemm(c[2] * f + 255 * glanz)})`;
}

// ===========================================================================
// 3. Die Körper
// ===========================================================================
//
// Flasche und Kronkorken sind Drehkörper: ein Umriss, um die Hochachse
// gedreht. Genau so werden sie auch wirklich hergestellt. Daraus entstehen
// lauter kleine Vierecke, und jedes bekommt sein eigenes Licht ab.

const TAU = Math.PI * 2;

function drehkoerper(profil, seiten, hautFuer, rMod) {
  const flaechen = [];
  for (let i = 0; i < profil.length - 1; i++) {
    const [z0, r0] = profil[i];
    const [z1, r1] = profil[i + 1];
    const haut = hautFuer((z0 + z1) / 2);

    // Die echte Normale des Drehkörpers an dieser Stelle - nicht die des
    // Vierecks. Damit lässt sich später weich von Kante zu Kante schattieren,
    // sonst sieht eine runde Flasche aus wie ein Fass mit Dauben.
    const nl = Math.hypot(z1 - z0, r1 - r0) || 1;
    const nr = (z1 - z0) / nl;
    const nz = -(r1 - r0) / nl;
    const echteNormale = (w) => [Math.cos(w) * nr, Math.sin(w) * nr, nz];

    for (let s = 0; s < seiten; s++) {
      const a = (s / seiten) * TAU;
      const b = ((s + 1) / seiten) * TAU;
      const ra0 = rMod ? rMod(r0, z0, a) : r0;
      const rb0 = rMod ? rMod(r0, z0, b) : r0;
      const rb1 = rMod ? rMod(r1, z1, b) : r1;
      const ra1 = rMod ? rMod(r1, z1, a) : r1;
      flaechen.push({
        haut,
        // Bei gewelltem Rand (Kronkorken) stimmt die glatte Normale nicht -
        // dort sind die Kanten ja gewollt.
        weich: rMod ? null : [echteNormale(a), echteNormale((a + b) / 2), echteNormale(b)],
        p: [
          [Math.cos(a) * ra0, Math.sin(a) * ra0, z0],
          [Math.cos(b) * rb0, Math.sin(b) * rb0, z0],
          [Math.cos(b) * rb1, Math.sin(b) * rb1, z1],
          [Math.cos(a) * ra1, Math.sin(a) * ra1, z1],
        ],
      });
    }
  }
  return flaechen;
}

/** Materialien. `dicht` heißt: undurchsichtig, Rückseite kann weg. */
// Nasses Glas: dunkler in der Grundfarbe, dafuer ein harter kleiner Glanzpunkt
// und ein zweiter, weicherer darueber. Ein trockenes Etikett bleibt matt - der
// Unterschied macht den Eindruck erst aus.
const GLAS = {
  farbe: [96, 48, 8],
  haerte: 110,   // kleiner, harter Reflex statt breitem Schimmer
  staerke: 1.35,
  glanz2: { haerte: 16, staerke: 0.3 }, // feuchter Schleier drumherum
  kante: 0.5,
  dicht: true,
};
// Papier hat einen hohen Grundwert: es streut das Licht aus dem ganzen Raum,
// deshalb bleibt ein Etikett auch im Schatten hell statt grau zu werden.
const PAPIER = { farbe: [255, 253, 248], haerte: 6, staerke: 0.05, grund: 0.58, dicht: true };
const PAPIER_GRUEN = { farbe: [0, 148, 62], haerte: 10, staerke: 0.1, grund: 0.5, dicht: true };
const KAPPE_WEISS = { farbe: [250, 250, 250], haerte: 26, staerke: 0.55, grund: 0.5, dicht: true };
const SILBER = { farbe: [176, 178, 184], haerte: 28, staerke: 0.8, dicht: true };

/**
 * Umriss einer Longneck in Zentimetern: [Höhe, Radius].
 * Eng gesetzte Punkte an Schulter und Hals, weite auf dem geraden Bauch -
 * dort ändert sich die Wölbung ja nicht.
 */
const FLASCHEN_PROFIL = [
  [0, 0], [0, 2.90], [0.10, 3.14], [0.32, 3.28], [0.75, 3.32], [1.30, 3.33],
  // Die engen Punkte hier sind die Kanten des Etiketts. Ohne sie gäbe es keine
  // Ringe, auf denen das Papier überhaupt sitzen könnte.
  [2.60, 3.33], [2.62, 3.36], [3.20, 3.36], [9.30, 3.36], [9.60, 3.36],
  [11.05, 3.36], [11.08, 3.28],
  [11.10, 3.22], [11.90, 3.08],
  [12.70, 2.88], [13.40, 2.64], [14.10, 2.36], [14.80, 2.06],
  [15.50, 1.78], [16.10, 1.55], [16.60, 1.41], [17.10, 1.33],
  [17.60, 1.30], [20.10, 1.30], [20.35, 1.38], [20.62, 1.47],
  [20.96, 1.49], [21.22, 1.42], [21.42, 1.29], [21.55, 1.26], [21.55, 0],
];

/**
 * Wie groß die Flasche gezeichnet wird, sagt die Rechnerei: FLASCHEN_R ist der
 * halbe Durchmesser, an dem ein Korken abprallt. Der Maßstab wird daraus
 * abgeleitet, damit Bild und Trefferzone nicht auseinanderlaufen - sonst
 * prallte der Korken sichtbar an nichts ab.
 */
const BAUCH = Math.max(...FLASCHEN_PROFIL.map(([, r]) => r));
const MASSTAB = FLASCHEN_R / BAUCH;
const FLASCHE = { hoehe: 21.55 * MASSTAB + 0.6 };

/**
 * Das Etikett, angelehnt an eine Veltins: weiß, mit einem grünen Band oben und
 * einem schmalen grünen Streifen unten, dazu die weiße Kronkorkenkappe. Das
 * Glas ist heller und goldener als bei einer normalen braunen Flasche - so
 * sieht eine volle Veltins aus.
 *
 * Schrift gibt es nicht - die Flasche ist auf dem Handy keinen Zentimeter
 * hoch, da wäre kein Buchstabe zu erkennen. Und das Markenzeichen male ich
 * ohnehin nicht nach; das hier ist eine Anlehnung, keine Kopie.
 */
function flaschenHaut(z) {
  if (z > 2.60 && z < 11.08) {
    if (z < 3.20) return PAPIER_GRUEN;   // schmaler Streifen unten
    if (z > 9.60) return PAPIER_GRUEN;   // das breite Band oben
    return PAPIER;
  }
  return GLAS;
}

/** Ein fertiges Netz kleiner oder größer machen. */
const skaliere = (netz, f) =>
  netz.map((s) => ({ ...s, p: s.p.map(([x, y, z]) => [x * f, y * f, z * f]) }));

const FLASCHEN_NETZ = skaliere(drehkoerper(FLASCHEN_PROFIL, 40, flaschenHaut), MASSTAB);

/**
 * Ein Kronkorken hat 21 Zacken - das ist genormt. Der Rand wird also nicht
 * rund, sondern gewellt, und jede Welle fängt das Licht anders ein. Genau
 * daran erkennt man einen Kronkorken.
 */
const RIFFEL = 21;
const KORKEN_PROFIL = [
  [0, 1.34], [0.06, 1.47], [0.30, 1.50], [0.41, 1.46],
  [0.48, 1.36], [0.54, 1.16], [0.59, 0.80], [0.62, 0.40], [0.63, 0],
];
const KORKEN_H = 0.63;

function korkenMod(r, z, w) {
  if (r < 0.9) return r;
  const tief = z < 0.42 ? 1 : Math.max(0, (0.56 - z) / 0.14);
  return r - 0.13 * tief * (0.5 + 0.5 * Math.cos(RIFFEL * w));
}

function korkenNetz(rand, deckel) {
  return [
    // Boden - sieht man nie, schließt aber den Umriss sauber ab
    ...drehkoerper([[0, 0], [0, 1.34]], RIFFEL, () => rand),
    ...drehkoerper(KORKEN_PROFIL, RIFFEL * 3, (z) => (z < 0.45 ? rand : deckel), korkenMod),
  ];
}

const KORKEN_HAUT = [
  [
    { farbe: [150, 152, 158], haerte: 30, staerke: 0.85, dicht: true },
    { farbe: [206, 208, 214], haerte: 26, staerke: 0.75, dicht: true },
  ],
  [
    { farbe: [26, 78, 122], haerte: 30, staerke: 0.85, dicht: true },
    { farbe: [48, 122, 182], haerte: 26, staerke: 0.75, dicht: true },
  ],
];

const KORKEN_NETZE = KORKEN_HAUT.map(([r, d]) => korkenNetz(r, d));

const FLASCHEN_KORKEN = skaliere(korkenNetz(SILBER, KAPPE_WEISS), MASSTAB);
const FLASCHEN_KORKEN_Z = 21.55 * MASSTAB;

/**
 * Ein Netz an eine Stelle setzen und beleuchten. Zurück kommen fertige
 * Bildschirm-Vielecke mit ihrer Farbe, von hinten nach vorne sortiert.
 *
 * Rückseiten werden weggelassen: bei undurchsichtigen Sachen sieht man sie
 * nicht, und bei Glas übernimmt das dunkle Innere die Arbeit.
 */
function netzFlaechen(netz, mx, my, mz = MATTE_Z) {
  const raus = [];
  for (const f of netz) {
    const w = f.p.map(([x, y, z]) => [x + mx, y + my, z + mz]);
    const m = schwerpunkt(w);
    const n = normale(w);
    if (skalar(n, hin(m, KAMERA)) <= 0) continue; // Rückseite
    const pkt = w.map(([x, y, z]) => proj(x, y, z));
    let farbe = beleuchte(n, m, f.haut);

    // Weich schattieren: links, Mitte und rechts einzeln beleuchten und einen
    // Verlauf darüberlegen. So verschwinden die Kanten zwischen den Vierecken,
    // und aus einem Vieleck wird optisch eine runde Flasche.
    if (f.weich) {
      const g = ctx.createLinearGradient(
        (pkt[0].x + pkt[3].x) / 2, (pkt[0].y + pkt[3].y) / 2,
        (pkt[1].x + pkt[2].x) / 2, (pkt[1].y + pkt[2].y) / 2
      );
      g.addColorStop(0, beleuchte(f.weich[0], m, f.haut));
      g.addColorStop(0.5, beleuchte(f.weich[1], m, f.haut));
      g.addColorStop(1, beleuchte(f.weich[2], m, f.haut));
      farbe = g;
    }

    raus.push({
      tiefe: proj(m[0], m[1], m[2]).tiefe,
      farbe,
      pkt: aufblasen(pkt.map((p) => [p.x, p.y]), 0.4),
    });
  }
  raus.sort((a, b) => b.tiefe - a.tiefe);
  return raus;
}

/**
 * Jedes Viereck einen Hauch aufblasen. Sonst blitzt zwischen zwei Flächen
 * eine haarfeine Lücke durch - ein Fehler, den man sofort als "billig"
 * wahrnimmt, ohne zu wissen warum.
 */
function aufblasen(pkt, d) {
  let cx = 0, cy = 0;
  for (const p of pkt) { cx += p[0]; cy += p[1]; }
  cx /= pkt.length;
  cy /= pkt.length;
  return pkt.map(([x, y]) => {
    const l = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / l) * d, y + ((y - cy) / l) * d];
  });
}

function maleFlaechen(liste) {
  for (const f of liste) {
    ctx.fillStyle = f.farbe;
    ctx.beginPath();
    f.pkt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}

// ===========================================================================
// 4. Flächen auf der Matte
// ===========================================================================

function pfad(ecken, z = MATTE_Z) {
  ctx.beginPath();
  ecken.forEach(([x, y], i) => {
    const p = proj(x, y, z);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
}

function fuelle(ecken, farbe, z = MATTE_Z) {
  pfad(ecken, z);
  ctx.fillStyle = farbe;
  ctx.fill();
}

/**
 * Die Mattenform: Rechteck mit abgeschrägten Ecken.
 *
 * `rand` schiebt die Kanten nach innen. Bei der 45-Grad-Schräge verschiebt
 * sich der Eckpunkt dabei nicht um `rand`, sondern um rand * (1 + Wurzel 2) -
 * sonst wäre der gelbe Rahmen in den Ecken viel dicker als an den Seiten.
 */
function mattenForm(rand = 0) {
  const b = FELD.breite;
  const l = FELD.laenge;
  const e = DEKO.ecke - rand * (1 + Math.SQRT2);
  return [
    [rand + e, rand], [b - rand - e, rand], [b - rand, rand + e],
    [b - rand, l - rand - e], [b - rand - e, l - rand],
    [rand + e, l - rand], [rand, l - rand - e], [rand, rand + e],
  ];
}

/** Das X in der Mitte, aus vier Armen. */
function xForm(mx, my, gross) {
  const a = gross / 2;
  const d = gross / 5;
  return [
    [mx - a, my - a + d], [mx - a + d, my - a], [mx, my - d], [mx + a - d, my - a],
    [mx + a, my - a + d], [mx + d, my], [mx + a, my + a - d], [mx + a - d, my + a],
    [mx, my + d], [mx - a + d, my + a], [mx - a, my + a - d], [mx - d, my],
  ];
}

/** Ein Feld gespiegelt, damit auch die eigene Hälfte bemalt ist. */
const gespiegelt = (ecken) => ecken.map(([x, y]) => [FELD.breite - x, FELD.laenge - y]);

/** Eine liegende Ellipse auf Höhe z - so sieht ein Kreis von schräg oben aus. */
function ellipse(mx, my, r, z, schritte = 22) {
  ctx.beginPath();
  for (let i = 0; i <= schritte; i++) {
    const w = (i / schritte) * TAU;
    const p = proj(mx + Math.cos(w) * r, my + Math.sin(w) * r, z);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

/**
 * Weicher Schatten. Ein Schatten hat keine scharfe Kante, also werden mehrere
 * Ellipsen übereinandergelegt: innen dunkel, nach außen auslaufend.
 */
function schatten(mx, my, r, staerke = 1) {
  const wx = mx - LICHT.x;
  const wy = my - LICHT.y;
  const l = Math.hypot(wx, wy) || 1;
  ctx.fillStyle = "#000";
  ctx.globalAlpha = 0.045 * staerke;
  for (let i = 10; i >= 1; i--) {
    ellipse(mx + (wx / l) * i * 0.14, my + (wy / l) * i * 0.14, r * (0.5 + i * 0.12), MATTE_Z + 0.01, 20);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Die Ziffern auf der Matte ---------------------------------------------
//
// Die liegen flach auf der Matte, also müssen sie mitverzerrt werden. Als
// Schrift ginge das nicht - Text malt der Browser immer aufrecht auf den
// Bildschirm. Deshalb sind die Ziffern hier als Linienzüge hinterlegt und
// werden zu Flächen aufgedickt.

function bogen(cx, cy, r, von, bis, n = 14) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const w = ((von + (bis - von) * (i / n)) * Math.PI) / 180;
    p.push([cx + Math.cos(w) * r, cy + Math.sin(w) * r]);
  }
  return p;
}

const ZIFFERN = {
  1: [[-0.21, -0.27], [0.03, -0.46], [0.03, 0.46]],
  2: [...bogen(0, -0.16, 0.27, 190, 385, 20), [-0.27, 0.40], [0.29, 0.40]],
  3: [
    ...bogen(0, -0.21, 0.25, 178, 408, 20), // obere Schlaufe
    [-0.03, 0],                             // die Taille in der Mitte
    ...bogen(0, 0.21, 0.26, 312, 542, 20),  // untere Schlaufe
  ],
};

/** Eine runde Scheibe als Vieleck - für Ecken und Enden eines Strichs. */
function scheibe(mx, my, r, n = 12) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const w = (i / n) * TAU;
    p.push([mx + Math.cos(w) * r, my + Math.sin(w) * r]);
  }
  return p;
}

/**
 * Alle Teile gleich herum drehen. Beim Füllen zählt der Browser Umläufe: läuft
 * ein Teil andersherum als das darunter, löschen sie sich gegenseitig aus und
 * es entstehen Löcher. Genau daran lagen die kaputt aussehenden Ziffern.
 */
function gleichRum(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a < 0 ? p.slice().reverse() : p;
}

/**
 * Aus einem Linienzug einen dicken Strich machen: je Stück ein Balken, an
 * jedem Knick eine runde Scheibe. Zusammen gefüllt ergibt das saubere runde
 * Ecken - ohne das Einschnüren, das eine gemittelte Kante an scharfen Knicken
 * verursacht.
 */
function strich(pkt, breite) {
  const teile = [];
  for (let i = 0; i < pkt.length - 1; i++) {
    const [x0, y0] = pkt[i];
    const [x1, y1] = pkt[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) continue;
    const nx = (-dy / d) * breite;
    const ny = (dx / d) * breite;
    teile.push(gleichRum([
      [x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny],
    ]));
  }
  for (const [x, y] of pkt) teile.push(gleichRum(scheibe(x, y, breite)));
  return teile;
}

/** Mehrere Flächen in einem Rutsch füllen. */
function fuelleTeile(teile, farbe, z = MATTE_Z) {
  ctx.beginPath();
  for (const t of teile) {
    t.forEach(([x, y], i) => {
      const p = proj(x, y, z);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = farbe;
  ctx.fill();
}

/**
 * Eine Ziffer auf die Matte legen. `wende` dreht sie um 180 Grad - die eigene
 * Hälfte liest man ja von der anderen Seite.
 */
function maleZiffer(zahl, mx, my, gross, wende) {
  const linie = ZIFFERN[zahl];
  if (!linie) return;

  // Genau mittig: die Ziffern sind von Hand gezeichnet und deshalb nicht von
  // selbst um den Nullpunkt herum ausgeglichen - eine "1" haengt zum Beispiel
  // nach rechts. Also wird ihr tatsaechlicher Kasten gemessen und die Ziffer
  // um dessen Mitte gelegt.
  const dick = 0.098;
  const xs = linie.map((q) => q[0]);
  const ys = linie.map((q) => q[1]);
  const mu = (Math.min(...xs) + Math.max(...xs)) / 2;
  const mv = (Math.min(...ys) + Math.max(...ys)) / 2;

  const s = wende ? -1 : 1;
  const gelegt = linie.map(([u, v]) => [mx + s * (u - mu) * gross, my - s * (v - mv) * gross]);
  fuelleTeile(strich(gelegt, dick * gross), FARBEN.matte);
}

// ===========================================================================
// 5. Das ganze Bild
// ===========================================================================

let flaschenTeile = [];   // vorgerechnet, die Flaschen stehen ja still
let tischStriche = [];
let mattenRand = [];
let hintergrund = null;   // fertig gemalter Tisch samt Matte und Flaschen
let standbild = null;     // die eingefrorene Szene waehrend des Zielens
let dprJetzt = 1;         // wie fein gerechnet wird, gemerkt aus messen()

/**
 * Kamera einstellen und alles vorrechnen, was sich nie ändert. Die Flaschen
 * stehen fest - ihre Flächen müssen also nicht 60 mal je Sekunde neu
 * beleuchtet werden, sondern genau einmal.
 */
function messen() {
  const b = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  dprJetzt = dpr;
  standbild = null; // Kamera oder Groesse anders - das Eingefrorene gilt nicht mehr
  cv.width = Math.round(b.width * dpr);
  cv.height = Math.round(b.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  kameraAusrichten();
  skala = 1;
  mitteX = 0;
  mitteY = 0;

  // Erst einmal roh projizieren und schauen, wie groß das wird
  const ecken = [];
  for (const [x, y] of mattenForm(0)) ecken.push(proj(x, y, MATTE_Z));
  for (const f of FLASCHEN_ALLE) ecken.push(proj(f.x, f.y, MATTE_Z + FLASCHE.hoehe));
  const minX = Math.min(...ecken.map((p) => p.x));
  const maxX = Math.max(...ecken.map((p) => p.x));
  const minY = Math.min(...ecken.map((p) => p.y));
  const maxY = Math.max(...ecken.map((p) => p.y));

  skala = Math.min((b.width - 12) / (maxX - minX), (b.height - 12) / (maxY - minY));
  mitteX = b.width / 2 - ((minX + maxX) / 2) * skala;
  mitteY = b.height / 2 - ((minY + maxY) / 2) * skala;

  bauen();
  hintergrund = hintergrundBacken(b, dpr);
}

function bauen() {
  // Die vier Flaschen: Flächen einmal beleuchten und merken
  flaschenTeile = [];
  for (const f of FLASCHEN_ALLE) {
    flaschenTeile.push({
      x: f.x,
      y: f.y,
      tiefe: proj(f.x, f.y, MATTE_Z).tiefe,
      flaechen: netzFlaechen(FLASCHEN_NETZ, f.x, f.y)
        .concat(netzFlaechen(FLASCHEN_KORKEN, f.x, f.y, MATTE_Z + FLASCHEN_KORKEN_Z)),
    });
  }

  // Wie groß ist jede Flasche auf dem Bildschirm? Das brauchen wir gleich, um
  // zu erkennen, ob ein Korken hinter ihr liegt.
  for (const t of flaschenTeile) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const fl of t.flaechen) {
      for (const [x, y] of fl.pkt) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    t.rahmen = { x0, y0, x1, y1 };
  }

  // Maserung der Tischplatte
  tischStriche = [];
  for (let x = -70; x <= 115; x += 4.5) {
    const a = proj(x, -50, 0);
    const b = proj(x + 6, 190, 0);
    tischStriche.push([a.x, a.y, b.x, b.y]);
  }

  // Die Kante der Matte: welche Seiten sieht man von hier aus?
  const oben = mattenForm(0);
  mattenRand = [];
  for (let i = 0; i < oben.length; i++) {
    const a = oben[i];
    const b = oben[(i + 1) % oben.length];
    // Nach außen zeigende Normale der Kante
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (nx * (KAMERA.x - mx) + ny * (KAMERA.y - my) > 0) mattenRand.push([a, b]);
  }
}

/** Die Flasche von innen: dunkles Bier hinter dem Glas. */
function malFlascheInnen(mx, my) {
  const zurKamera = Math.atan2(my - KAMERA.y, mx - KAMERA.x);
  const qx = -Math.sin(zurKamera);
  const qy = Math.cos(zurKamera);

  const links = [];
  const rechts = [];
  for (const [hh, rr] of FLASCHEN_PROFIL) {
    if (rr <= 0) continue;
    const h = hh * MASSTAB;
    const r = rr * MASSTAB;
    links.push(proj(mx - qx * r, my - qy * r, MATTE_Z + h));
    rechts.push(proj(mx + qx * r, my + qy * r, MATTE_Z + h));
  }
  ctx.beginPath();
  links.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  for (let i = rechts.length - 1; i >= 0; i--) ctx.lineTo(rechts[i].x, rechts[i].y);
  ctx.closePath();

  const oben = proj(mx, my, MATTE_Z + FLASCHE.hoehe);
  const unten = proj(mx, my, MATTE_Z);
  const g = ctx.createLinearGradient(0, oben.y, 0, unten.y);
  g.addColorStop(0, "#170B03");
  g.addColorStop(0.3, "#301705");
  g.addColorStop(0.4, "#7A470B");
  g.addColorStop(1, "#3D1F05");
  ctx.fillStyle = g;
  ctx.fill();
}

// Kein Aufdruck auf dem Etikett. Zweimal versucht - einmal als Text, der zur
// Kamera schaut, einmal als gewickelte Buchstaben auf dem Glas - und beides
// sah bei einer Flasche von gut einem Zentimeter Hoehe schlechter aus als ein
// sauberes, leeres Etikett. Wenn es doch wieder rein soll: die zweite Fassung
// steht in der Fassung v39 dieser Datei.

/** Der Name über einem Korken - nur in der Draufsicht, sonst wird es voll. */
function malName(k, name) {
  if (!name) return;
  const p = proj(k.x, k.y, MATTE_Z + 1.6);
  ctx.save();
  ctx.font = '800 13px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(0,0,0,.75)";
  ctx.strokeText(name, p.x, p.y - 17);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(name, p.x, p.y - 17);
  ctx.restore();
}

function malKorken(bild, k, nr) {
  maleFlaechen(netzFlaechen(KORKEN_NETZE[k.team], k.x, k.y));

  // Der eigene Korken bekommt einen Ring, damit man ihn sofort findet -
  // beim Zielen hell, sonst nur angedeutet.
  if (bild.eigener !== nr) return;
  ellipse(k.x, k.y, KORKEN_R * 1.8, MATTE_Z + 0.02, 26);
  ctx.strokeStyle = bild.zielen ? "rgba(255,255,255,.9)" : "rgba(255,201,60,.75)";
  ctx.lineWidth = bild.zielen ? 3 : 2;
  ctx.stroke();
}

/**
 * Alles, was sich nie bewegt: Tisch, Matte, Aufdruck und die vier Flaschen.
 *
 * Das sind mehrere tausend kleine Flächen. Sie 60 mal je Sekunde neu zu malen
 * wäre Verschwendung - deshalb landet das einmal auf einer unsichtbaren
 * zweiten Fläche und wird danach nur noch als fertiges Bild aufgelegt.
 */
function maleHintergrund(b) {
  ctx.clearRect(0, 0, b.width, b.height);

  // --- Die Tischplatte ---
  const tg = ctx.createLinearGradient(0, 0, 0, b.height);
  tg.addColorStop(0, "#3B2A1B");
  tg.addColorStop(0.55, "#2A1D12");
  tg.addColorStop(1, "#150E08");
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, b.width, b.height);

  ctx.strokeStyle = "rgba(0,0,0,.13)";
  ctx.lineWidth = 1.1;
  for (const [x1, y1, x2, y2] of tischStriche) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // --- Die Matte, mit Dicke ---
  ctx.fillStyle = "rgba(0,0,0,.34)";
  for (const [a, c] of mattenRand) {
    const p = [proj(a[0], a[1], 0), proj(c[0], c[1], 0), proj(c[0], c[1], MATTE_Z), proj(a[0], a[1], MATTE_Z)];
    ctx.beginPath();
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#0B0F13";
  for (const [a, c] of mattenRand) {
    const p = [proj(a[0], a[1], MATTE_Z * 0.35), proj(c[0], c[1], MATTE_Z * 0.35),
               proj(c[0], c[1], MATTE_Z), proj(a[0], a[1], MATTE_Z)];
    ctx.beginPath();
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }

  fuelle(mattenForm(0), FARBEN.gelb);
  fuelle(mattenForm(DEKO.rahmen), FARBEN.matte);
  for (const k of DEKO.keile) fuelle(k, FARBEN.gelb);

  for (const f of FELDER) {
    for (const ecken of [f.ecken, gespiegelt(f.ecken)]) {
      fuelle(ecken, f.mama ? FARBEN.rot : FARBEN.gelb);
    }
  }

  // Ziffern - liegen flach auf der Matte und werden mitverzerrt
  for (const f of FELDER) {
    if (f.mama) continue;
    const gross = 8.2 - f.punkte * 1.05;
    maleZiffer(f.punkte, f.schrift[0], f.schrift[1], gross, false);
    maleZiffer(f.punkte, FELD.breite - f.schrift[0], FELD.laenge - f.schrift[1], gross, true);
  }

  // Das X in der Mitte
  const { x: xm, y: ym, gross } = DEKO.x;
  pfad(xForm(xm, ym, gross * 2.4));
  ctx.strokeStyle = FARBEN.gelb;
  ctx.lineWidth = 2;
  ctx.stroke();
  fuelle(xForm(xm, ym, gross), FARBEN.rot);

  // --- Der Lichtkegel liegt über Tisch UND Matte, wie eine echte Lampe ---
  const mitte = proj(FELD.breite / 2, FELD.laenge * 0.55, 0);
  const lg = ctx.createRadialGradient(mitte.x, mitte.y, 0, mitte.x, mitte.y, b.height * 0.55);
  lg.addColorStop(0, "rgba(255,238,205,.15)");
  lg.addColorStop(1, "rgba(255,238,205,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, b.width, b.height);

  // --- Die Flaschen samt Schatten, von hinten nach vorne ---
  for (const t of flaschenTeile) schatten(t.x, t.y, 3.5, 1.15);
  for (const t of [...flaschenTeile].sort((a, c) => c.tiefe - a.tiefe)) {
    malFlascheInnen(t.x, t.y);
    maleFlaechen(t.flaechen);
  }

  // --- Zum Rand hin abdunkeln, damit das Auge in der Mitte bleibt ---
  const vg = ctx.createRadialGradient(
    b.width / 2, b.height / 2, Math.min(b.width, b.height) * 0.35,
    b.width / 2, b.height / 2, Math.max(b.width, b.height) * 0.75
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, b.width, b.height);
}

/**
 * Den Hintergrund einmal auf eine unsichtbare Fläche malen.
 *
 * Klappt das nicht - etwa weil kein zweites Canvas zu haben ist - wird eben
 * jedes Bild alles neu gemalt. Sieht genauso aus, kostet nur mehr.
 */
function hintergrundBacken(b, dpr) {
  const off = typeof document.createElement === "function" ? document.createElement("canvas") : null;
  if (!off || !off.getContext) return null;
  off.width = Math.round(b.width * dpr);
  off.height = Math.round(b.height * dpr);

  const octx = off.getContext("2d");
  if (!octx) return null;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx = octx;
  maleHintergrund(b);
  ctx = bildschirm;
  return off;
}

/**
 * Ein leeres Zeichenbrett in Bildschirmgroesse. Gibt `null` zurueck, wenn es
 * keins zu haben ist - dann wird eben ohne gearbeitet.
 */
function leeresBrett(b) {
  const off = typeof document.createElement === "function" ? document.createElement("canvas") : null;
  if (!off || !off.getContext) return null;
  off.width = Math.round(b.width * dprJetzt);
  off.height = Math.round(b.height * dprJetzt);
  const octx = off.getContext("2d");
  if (!octx) return null;
  octx.setTransform(dprJetzt, 0, 0, dprJetzt, 0, 0);
  return { cv: off, ctx: octx };
}

/**
 * Ein Bild malen.
 *
 * BEIM ZIELEN wird die Szene EINGEFROREN. Waehrend der Pfeil schwingt bewegt
 * sich am Tisch naemlich gar nichts: die Korken liegen, wo sie liegen, die
 * Flaschen sowieso. Trotzdem wurden 60 mal je Sekunde vier Korkennetze samt
 * ihren Verlaeufen neu beleuchtet und notfalls noch eine ganze Flasche
 * darueber - und genau davon ruckelte der Balken.
 *
 * Jetzt wird die Szene einmal auf ein zweites Brett gemalt und danach nur noch
 * aufgelegt. Uebrig bleibt je Bild: ein Bild auflegen, ein Pfeil, ein Balken.
 */
/** Eine Flasche ueber den Korken legen, der hinter ihr liegt. */
function flascheDrueber(t) {
  malFlascheInnen(t.x, t.y);
  maleFlaechen(t.flaechen);
}

function malen(bild) {
  const b = cv.getBoundingClientRect();
  const breit = Math.round(b.width);
  const hoch = Math.round(b.height);

  if (bild.zielen) {
    const passt =
      standbild && standbild.breit === breit && standbild.hoch === hoch &&
      standbild.nr === bild.zielen.nr;

    if (!passt) {
      const brett = leeresBrett(b);
      standbild = null;
      if (brett) {
        const vorher = ctx;
        ctx = brett.ctx;
        szene(bild, b);
        ctx = vorher;
        standbild = { cv: brett.cv, breit, hoch, nr: bild.zielen.nr };
      }
    }

    if (standbild) {
      // Kein clearRect noetig: das Standbild ist deckend und deckt alles ab.
      ctx.drawImage(standbild.cv, 0, 0, b.width, b.height);
      maleZielhilfe(b, bild);
      return;
    }
  } else {
    standbild = null;
  }

  szene(bild, b);
  if (bild.zielen) maleZielhilfe(b, bild);
}

/** Der Tisch mit allem, was daraufliegt - aber ohne Pfeil und Kraftbalken. */
function szene(bild, b) {
  const korken = bild.korken;

  if (hintergrund) {
    ctx.clearRect(0, 0, b.width, b.height);
    ctx.drawImage(hintergrund, 0, 0, b.width, b.height);
  } else {
    maleHintergrund(b);
  }

  // Welches Feld gerade gezählt hat, wird hervorgehoben. Man soll ohne
  // Nachdenken sehen, WARUM es so viele Schlücke waren.
  for (const f of bild.getroffen ?? []) {
    ctx.globalAlpha = 0.3;
    fuelle(f.ecken, "#FFFFFF", MATTE_Z + 0.02);
    ctx.globalAlpha = 1;
    pfad(f.ecken, MATTE_Z + 0.02);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Die Korken: das Einzige, was sich bewegt.
  for (const k of korken) if (!k.raus) schatten(k.x, k.y, KORKEN_R, 0.8);

  const liegend = korken
    .map((k, i) => ({ k, i, tiefe: proj(k.x, k.y, MATTE_Z).tiefe }))
    .filter((e) => !e.k.raus)
    .sort((a, c) => c.tiefe - a.tiefe);

  // Korken UND Flaschen in EINER Reihe von hinten nach vorne.
  //
  // Vorher wurden erst alle Korken gemalt und danach jede Flasche, hinter der
  // einer lag, noch einmal obendrauf. Das ging schief, sobald ein zweiter
  // Korken VOR derselben Flasche lag: der verschwand dann unter ihr. Auf dem
  // Handy sah das aus, als tauche ploetzlich eine Flasche zu viel auf oder als
  // springe eine nach oben.
  //
  // Jetzt entscheidet die Tiefe. Eine Flasche wird dabei nur dann wirklich neu
  // gemalt, wenn vor ihr an der Reihe schon ein Korken lag, der sie ueberdeckt -
  // sonst steht sie ja unveraendert im vorgebackenen Bild.
  const reihe = [
    ...liegend.map((e) => ({ tiefe: e.tiefe, korken: e })),
    ...flaschenTeile.map((t) => ({ tiefe: t.tiefe, flasche: t })),
  ].sort((a, c) => c.tiefe - a.tiefe);

  const schonGemalt = [];
  for (const d of reihe) {
    if (d.korken) {
      malKorken(bild, d.korken.k, d.korken.i);
      schonGemalt.push(d.korken);
      continue;
    }

    // Verglichen wird mit dem Bildschirm-Rahmen der GANZEN Flasche, nicht mit
    // dem Abstand zu ihrem Fuss: eine Flasche ist gut zwanzig Zentimeter hoch,
    // ein Korken kann also weit oberhalb ihres Standpunkts hinter ihr
    // hervorlugen.
    const r = d.flasche.rahmen;
    const verdeckt = schonGemalt.some((e) => {
      const p = proj(e.k.x, e.k.y, MATTE_Z);
      const rand = Math.abs(proj(e.k.x + KORKEN_R * 1.6, e.k.y, MATTE_Z).x - p.x);
      return p.x > r.x0 - rand && p.x < r.x1 + rand && p.y > r.y0 - rand && p.y < r.y1 + rand;
    });
    if (verdeckt) flascheDrueber(d.flasche);
  }

  // Von oben ist Platz fuer die Namen - und genau dann will man wissen, wessen
  // Korken wo liegt. Die stehen ueber allem, auch ueber den Flaschen.
  if (vonOben && bild.namen) {
    for (const e of liegend) malName(e.k, bild.namen[e.i]);
  }
}

function maleZielhilfe(b, bild) {
  const zielen = bild.zielen;
  const k = bild.korken[zielen.nr];
  const ri = zielen.richtung;
  const weit = 20;

  // Der Pfeil liegt flach auf der Matte - also wird er auch mitverzerrt.
  const spitze = [k.x + Math.cos(ri) * weit, k.y + Math.sin(ri) * weit];
  const quer = [-Math.sin(ri), Math.cos(ri)];
  const start = [k.x + Math.cos(ri) * 2.4, k.y + Math.sin(ri) * 2.4];
  const kopf = [spitze[0] - Math.cos(ri) * 5.5, spitze[1] - Math.sin(ri) * 5.5];
  const form = [
    [start[0] + quer[0] * 0.75, start[1] + quer[1] * 0.75],
    [kopf[0] + quer[0] * 0.75, kopf[1] + quer[1] * 0.75],
    [kopf[0] + quer[0] * 2.3, kopf[1] + quer[1] * 2.3],
    spitze,
    [kopf[0] - quer[0] * 2.3, kopf[1] - quer[1] * 2.3],
    [kopf[0] - quer[0] * 0.75, kopf[1] - quer[1] * 0.75],
    [start[0] - quer[0] * 0.75, start[1] - quer[1] * 0.75],
  ];
  ctx.globalAlpha = zielen.phase === "richtung" ? 1 : 0.4;
  fuelle(form, "#FFFFFF", MATTE_Z + 0.05);
  pfad(form, MATTE_Z + 0.05);
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (zielen.phase !== "kraft") return;

  // Der Kraftbalken bleibt am Bildschirmrand - er gehört ja nicht zum Tisch.
  const kr = zielen.kraft;
  const bw = Math.min(b.width - 32, 360);
  const bx = (b.width - bw) / 2;
  const bh = 20;
  const by = b.height - bh - 12;

  ctx.fillStyle = "rgba(8,6,20,.72)";
  ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);

  const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  bg.addColorStop(0, "#2B6E5A");
  bg.addColorStop(0.3, "#2EE6C5");
  bg.addColorStop(0.62, "#FFD44D");
  bg.addColorStop(1, "#FF3B3B");
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(bx + bw * kr, by - 4, bw, bh + 8);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(bx + bw * kr - 2, by - 5, 4, bh + 10);
}

return {
  /** Groesse und Kamera neu ausrechnen, Hintergrund neu backen. */
  messen,
  /** Ein Bild malen. Siehe oben, was hineingehoert. */
  zeichne: malen,
  /** Kamera auf den Platz eines Spielers stellen. */
  kameraSpieler(nr) {
    KAMERA = kameraFuer(nr);
    vonOben = false;
    messen();
  },
  /** Kamera senkrecht von oben - fuer die Abrechnung und auf Knopfdruck. */
  kameraOben(nr) {
    KAMERA = kameraVonOben(nr);
    vonOben = true;
    messen();
  },
  /** Nur fuer Tests: ein Punkt der Tischwelt auf dem Bildschirm. */
  proj: (x, y, z) => proj(x, y, z),
  MATTE_Z,
};
}
