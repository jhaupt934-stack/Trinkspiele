// Oberflaeche der Web-App.
//
// Kein Framework, kein Build-Schritt: Der Zustand liegt in `S`, nach jeder
// Aenderung wird `render()` aufgerufen und der Bildschirm neu gezeichnet.
//
// Lokal (ein Geraet) rechnet der Browser selbst mit derselben Spiellogik, die
// online der Server benutzt. Online schickt der Browser nur Aktionen hin und
// bekommt den fertigen Spielstand zurueck.

import {
  initGame,
  ROUND_TITLES,
  currentRowCard,
  playersWithMatch,
  matchCount,
  allowedPyramidIndices,
  sipTargets,
  pendingFor,
  pendingTotal,
  distributorIds,
  activePlayerId,
  playerById,
  canUndo,
  givenSoFar,
  warteBis,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "/game/engine.js";
import {
  initRace,
  betsOn,
  allBetsIn,
  ZIEL,
  STRECKENKARTEN,
  MIN_EINSATZ,
  MAX_EINSATZ,
  HORSE_ORDER,
} from "/game/race.js";
import {
  initBuild,
  currentPlayer,
  erlaubteReihen,
  randKarte,
  longestLength,
  seiteName,
  tippName,
  durchgaenge,
  istFertig,
  REIHEN,
  TREFFER,
  DURCHGAENGE,
} from "/game/build.js";
import {
  initLeber,
  amZug as amZugLeber,
  currentPlayer as currentPlayerLeber,
  platzVon,
  teamVon,
  teamPlaetze,
  letzteBewegung,
  pfeilRichtung,
  balkenKraft,
  PLAETZE,
  TEAM_NAME,
} from "/game/leber.js";
import { macheZeichner } from "/leber3d.js";
import { applyAction, mayAct, wartetAuf, grenzen } from "/game/actions.js";
import { isRed, suitSymbol, suitName } from "/game/deck.js";

// ---------------------------------------------------------------------------
// Die Spiele: Name, Symbol, Regeltext
// ---------------------------------------------------------------------------
// Steht bewusst hier drin und nicht in einer eigenen Datei - je weniger
// Dateien, desto weniger kann beim Hochladen schiefgehen.

const SPIELE = [
  { id: "bus", emoji: "🚌", name: "Busfahren", kurz: "ca. 15 Min." },
  { id: "race", emoji: "🐎", name: "Pferderennen", kurz: "ca. 5 Min." },
  { id: "build", emoji: "🔼", name: "Drüber Drunter", kurz: "ca. 10 Min." },
  { id: "leber", emoji: "🍾", name: "Leberschuss", kurz: "2 gegen 2" },
];
const spielName = (id) => SPIELE.find((s) => s.id === id)?.name ?? "";
const spielEmoji = (id) => SPIELE.find((s) => s.id === id)?.emoji ?? "🃏";

// Die Zahlen kommen aus der Spiellogik, damit Regeltext und Regeln nie
// auseinanderlaufen.
const REGELN = {
  bus: `
    <h3>Worum geht's?</h3>
    <p>Vier Ratefragen, dann zwei Kartenreihen. Wer am Ende die meisten Karten
    übrig hat, muss Bus fahren – und das tut weh.</p>

    <h3>1. Karten raten</h3>
    <p>Reihum zieht jeder vier Karten und rät vorher jedes Mal:</p>
    <ol>
      <li><strong>Rot oder Schwarz?</strong> – 1 Schluck</li>
      <li><strong>Höher oder niedriger</strong> als deine erste Karte? – 2 Schlücke</li>
      <li><strong>Dazwischen oder außerhalb</strong> deiner ersten beiden? – 3 Schlücke</li>
      <li><strong>Hattest du das Symbol schon?</strong> – 4 Schlücke</li>
    </ol>
    <p>Richtig geraten: Du verteilst die Schlücke. Falsch: Du trinkst sie selbst.
    Gleicher Wert zählt als falsch.</p>

    <h3>2. Die zwei Reihen</h3>
    <p>Acht Karten liegen in zwei Reihen zu je vier – <em>selber trinken</em> und
    <em>verteilen</em>, mit 1 bis 4 Schlücken. Der Host deckt eine nach der
    anderen auf.</p>
    <p>Wer eine Karte mit demselben Wert auf der Hand hat, legt sie ab und trinkt
    beziehungsweise verteilt. Mehrere gleichzeitig ist ausdrücklich erlaubt –
    ihr müsst nicht aufeinander warten. Karten loswerden ist gut.</p>

    <h3>3. Wer fährt Bus?</h3>
    <p>Wer die meisten Karten übrig hat. Bei Gleichstand wird so lange eine Karte
    umgedreht, bis jemand ablegen kann – wer ablegt, ist raus. Geht das nicht
    mehr auf, zieht jeder eine Karte und die niedrigste fährt.</p>

    <h3>4. Die Pyramide</h3>
    <p>Alle Handkarten kommen weg. Aus dem ganzen Deck liegen 15 Karten als
    Pyramide (5-4-3-2-1), der Rest ist Nachziehstapel.</p>
    <p>Der Busfahrer arbeitet sich von unten nach oben, jede Karte muss an die
    vorherige angrenzen. <strong>Zahlenkarte:</strong> weiter.
    <strong>Bild – Bube, Dame, König oder Ass:</strong> so viele Schlücke wie die
    Reihe hoch ist, alles wieder zudecken, von vorne – auch an der Spitze.</p>
    <p>Ist der Nachziehstapel leer, ist die Runde vorbei. Geschafft oder nicht.</p>`,

  race: `
    <h3>Worum geht's?</h3>
    <p>Die vier Asse sind Pferde. Du setzt Schlücke auf eins davon und
    <strong>trinkst sie sofort</strong>. Gewinnt dein Pferd, darfst du am Ende
    das <strong>Doppelte</strong> verteilen.</p>

    <h3>Der Aufbau</h3>
    <p>Die vier Asse stehen nebeneinander am Start. ${STRECKENKARTEN} Karten
    liegen verdeckt an der Strecke – eine neben jedem der Felder 1 bis
    ${STRECKENKARTEN}. Der Rest ist Nachziehstapel.</p>

    <h3>Setzen und trinken</h3>
    <p>Vor dem Start setzt jeder <strong>${MIN_EINSATZ} bis ${MAX_EINSATZ}
    Schlücke</strong> auf ein Pferd – und trinkt sie direkt. Auch die, die später
    gewinnen: Der Einsatz ist weg, sobald er gesetzt ist.</p>
    <p>Deshalb kann man die Wette danach auch nicht mehr ändern. Ihr seht alle,
    wer auf welches Pferd gesetzt hat und mit wie viel.</p>

    <h3>Das Rennen</h3>
    <p>Der Host deckt eine Karte nach der anderen auf. Kommt zum Beispiel Herz,
    rückt das Herz-Ass ein Feld vor. Wer <strong>Feld ${ZIEL}</strong> erreicht –
    also hinter der letzten Streckenkarte – hat gewonnen.</p>
    <p>Kommt ein Pferd ins Ziel, auf das <em>niemand</em> gesetzt hat, ist das
    Rennen aber nicht vorbei: Dieses Pferd ist durch und läuft nicht mehr mit,
    die anderen rennen weiter. Erst das erste Pferd mit einer Wette beendet
    das Rennen.</p>

    <h3>Die Streckenkarten</h3>
    <p>Sobald <em>alle vier</em> Pferde mindestens auf Höhe einer Streckenkarte
    stehen, wird diese aufgedeckt. Ihr Symbol sagt, welches Pferd wieder ein Feld
    <strong>zurück</strong> muss.</p>
    <p>Beispiel: Stehen die Pferde auf 1, 0, 2, 3, passiert noch nichts – das
    zweite ist ja noch nicht auf Höhe 1. Erst wenn auch das letzte auf 1 steht,
    geht die erste Streckenkarte hoch.</p>

    <h3>Am Ende</h3>
    <p>Wer auf das siegreiche Pferd gesetzt hat, verteilt jetzt das
    <strong>Doppelte</strong> von dem, was er am Anfang getrunken hat. Haben
    mehrere richtig gesetzt, verteilen sie gleichzeitig.</p>
    <p>Alle anderen haben ihren Einsatz umsonst getrunken. Hoch setzen lohnt
    sich also nur, wenn man auch richtig liegt.</p>`,

  build: `
    <h3>Worum geht's?</h3>
    <p>${REIHEN} Karten liegen offen aus, jede für sich eine Reihe. Du baust
    daran weiter – drüber oder drunter – und musst
    <strong>${TREFFER} Mal hintereinander</strong> richtig liegen, dann ist der
    Nächste dran.</p>

    <h3>Dein Zug</h3>
    <p>Such dir eine Reihe aus und eine Seite: <strong>links</strong> oder
    <strong>rechts</strong> von der Reihe. Dann sagst du
    <strong>höher</strong>, <strong>tiefer</strong> oder <strong>gleich</strong> –
    verglichen wird mit der äußeren Karte auf genau dieser Seite.</p>
    <p>Die <strong>erste</strong> Karte eines Anlaufs muss immer an die
    <strong>längste</strong> Reihe. Sind mehrere gleich lang, darfst du dir eine
    aussuchen. Ab der zweiten Karte darfst du überall anbauen.</p>

    <h3>Wenn du falsch liegst</h3>
    <p>Die Karte bleibt erst mal groß stehen, damit du siehst, was gekommen
    ist. Du trinkst so viele Schlücke, wie die Reihe lang war – die neue Karte
    zählt nicht mit. Sie kommt weg, die längste Reihe wird abgebaut und auf eine
    Karte zurückgesetzt.</p>
    <p>Dein Zähler geht auf null, aber du bleibst dran. Du kommst erst weg, wenn
    du deine ${TREFFER} zusammen hast.</p>

    <h3>Am Ende</h3>
    <p>Jeder muss seine ${TREFFER} <strong>${DURCHGAENGE} Mal</strong> zusammen
    bekommen. Danach ist die Runde vorbei. In der Leiste oben steht bei jedem,
    wie viele Durchgänge er schon hat.</p>`,

  leber: `
    <h3>Worum geht's?</h3>
    <p>Zwei gegen zwei um eine Matte herum. Jeder hat einen Kronkorken in seiner
    Ecke und schnippst ihn auf die gegnerische Hälfte. <strong>Schlücke sind
    Fortschritt</strong> – wer sein Bier zuerst leer hat, gewinnt.</p>

    <h3>Reihenfolge</h3>
    <p>Wer anfängt, wird ausgelost. Danach kommt der <strong>diagonal
    Gegenüber</strong>, dann der Teampartner des Anfängers, zuletzt der
    Übriggebliebene. Die Teams wechseln sich dadurch immer ab.</p>
    <p>Nach diesen vier Schüssen wird abgerechnet, alle Korken kommen zurück in
    die Ecken, und der Anfang wandert einen Platz weiter.</p>

    <h3>Schnippsen</h3>
    <p>Aussuchen musst du nichts – du schnippst immer deinen eigenen Korken, und
    der ist gelb umringt. Dreimal drücken:</p>
    <ol>
      <li><strong>Losschnippsen.</strong></li>
      <li>Der <strong>Pfeil</strong> schwingt hin und her. Stopp, wenn er
      richtig steht.</li>
      <li>Der <strong>Kraftbalken</strong> läuft hin und her. Nochmal Stopp.
      Links zu lasch, rechts fliegt der Korken vom Tisch.</li>
    </ol>
    <p>Es gibt keine Bande: Wer zu fest schnippst, dessen Korken ist weg und
    fällt für den Rest der Runde aus. Gegnerische Korken darf man wegschießen.</p>

    <h3>Wertung</h3>
    <p>Berührt ein Korken ein Feld auch nur mit dem Rand, zählt es. Liegt er auf
    der Grenze zwischen zweien, zählt das <strong>wertvollere</strong>.</p>
    <p>Entscheidend ist die Seite, nicht wem der Korken gehört:</p>
    <ul>
      <li>In einem Feld auf der <strong>gegnerischen</strong> Hälfte → die
      Schlücke gehen an <strong>dein</strong> Team.</li>
      <li>In einem Feld auf der <strong>eigenen</strong> Hälfte → sie gehen ans
      <strong>Gegnerteam</strong>. Wer seinen Korken nicht über die Mitte
      bekommt, verschenkt sie also.</li>
    </ul>
    <p>Nach jeder Runde schaut ihr von oben auf die Matte, und jedes getroffene
    Feld leuchtet auf.</p>

    <h3>Deine Mama</h3>
    <p>Der rote Bereich ganz hinten zwischen den Flaschen schlägt alles: das
    andere Team <strong>ext beide Flaschen und macht neue auf</strong> – es
    fängt also wieder bei null an.</p>

    <h3>Aufteilen</h3>
    <p>Die Schlücke gehören dem <strong>Team</strong>. Nach jeder Runde macht ihr
    selbst aus, wer davon wie viele trinkt – alle sehen die Aufteilung.</p>

    <h3>Am Ende</h3>
    <p>Es gibt keinen Punktestand. Wer seine Flasche leer hat, drückt
    <strong>„Flasche leer"</strong> – und das <strong>andere Team muss
    bestätigen</strong>. Sonst könnte man einfach draufdrücken.</p>
    <p>Gewonnen hat ein Team, wenn <strong>beide</strong> Flaschen leer sind.
    Wer schon fertig ist, schnippst weiter mit, bekommt aber nichts mehr ab –
    seine Schlücke gehen automatisch an den Partner.</p>`,
};
const regelnHtml = (id) => REGELN[id] ?? "<p>Für dieses Spiel gibt es noch keine Erklärung.</p>";

// Steht unten auf der Startseite. Wenn etwas komisch aussieht, sagt diese
// Nummer sofort, welche Fassung auf dem Handy wirklich laeuft.
const VERSION = "v35";

const el = document.getElementById("app");

// Laeuft in Phase 2 gerade eine Wartezeit, wird einmal pro Sekunde neu
// gezeichnet - so zaehlt der Knopf herunter und gibt sich selbst frei.
let tickTimer = null;

// Der Name wird im Browser gespeichert und beim naechsten Oeffnen
// automatisch wieder benutzt.
const NAME_KEY = "trinkspiele.name";
const savedName = () => (localStorage.getItem(NAME_KEY) ?? "").trim();
const saveName = (n) => localStorage.setItem(NAME_KEY, n.trim());

// Auch das zuletzt gewaehlte Profilbild merken.
const AV_KEY = "trinkspiele.avatar";
const savedAvatar = () => localStorage.getItem(AV_KEY) ?? null;
const saveAvatar = (a) => localStorage.setItem(AV_KEY, a);

/**
 * Der Link zur eigenen Lobby. Laeuft ueber dieselbe Adresse, unter der die App
 * gerade laeuft - funktioniert also auch, wenn ihr sie im Heimnetz startet.
 */
function lobbyLink(code) {
  const basis =
    typeof location !== "undefined" && location.origin && location.origin !== "null"
      ? location.origin + location.pathname.replace(/index\.html$/, "")
      : "https://trinkspiele.org/";
  return `${basis.replace(/\/+$/, "")}/?c=${code}`;
}

/**
 * Kurz brummen lassen. Android kann das, Apple erlaubt es Webseiten nicht -
 * dort passiert schlicht nichts, deshalb ohne Aufhebens.
 */
function brumm(muster) {
  if (S.stumm) return;
  try {
    navigator.vibrate?.(muster);
  } catch {
    /* kein Grund, deshalb das Spiel abzubrechen */
  }
}

const VIBRATION_KEY = "trinkspiele.vibration";

const S = {
  // name | home | games | rules | setup | lobby | game
  screen: savedName() ? "home" : "name",
  mode: "local", // local | online
  spiel: "bus", // bus | race
  rulesFor: null, // welches Spiel gerade erklärt wird
  bet: { suit: null, amount: 3 }, // Wett-Entwurf beim Pferderennen
  name: savedName(),
  names: ["", ""],
  game: null,
  // Online
  socket: null,
  lobby: null,
  myId: null,
  code: "",
  error: null,
  connected: false,
  sipSeen: 0, // hoechste bereits gezeigte Schluck-Meldung
  stumm: localStorage.getItem(VIBRATION_KEY) === "aus",
  warDran: false, // fuers Brummen: war ich beim letzten Zeichnen schon dran?
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen zum Zeichnen
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Profilbilder: Gesichter mit verschiedenen Hauttoenen, Frisuren und Baerten,
// damit man sie am Tisch sofort auseinanderhaelt.
// Dieselbe Liste steht in server.js - test-ui.js prueft, dass beide gleich sind.
const AVATARE = [
  "👩🏻‍🦰", "🧔🏻", "👱🏼", "👨🏻‍🦲",
  "👩🏼‍🦱", "🧔🏽", "👨🏽", "👩🏽",
  "👳🏽", "🧕🏽", "👨🏾‍🦱", "👩🏾",
  "🧔🏿", "👩🏿‍🦳", "👨🏿‍🦲", "👵🏼",
];

// Wer kein Bild hat (lokales Spiel), bekommt einen farbigen Kreis mit
// dem Anfangsbuchstaben. Die Farbe haengt am Namen, bleibt also gleich.
const AV_COLORS = ["#FF5FA2", "#8B5CF6", "#2EE6C5", "#FFC93C", "#FF9F43", "#5BC0FF", "#A0E85B", "#FF7A7A"];
function avatarColor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return AV_COLORS[h % AV_COLORS.length];
}

/** `wer` darf ein Spieler-Objekt oder einfach ein Name sein. */
function avatar(wer, small) {
  const name = typeof wer === "string" ? wer : wer?.name ?? "?";
  const bild = typeof wer === "object" ? wer?.avatar : null;
  const cls = `av${small ? " sm" : ""}`;
  if (bild) return `<span class="${cls} emoji">${bild}</span>`;
  return `<span class="${cls}" style="background:${avatarColor(name)}">${esc(
    (name || "?").trim().charAt(0).toUpperCase()
  )}</span>`;
}

/**
 * Eine Spielkarte. Bewusst schlicht: Wert und Symbol mittig untereinander,
 * sonst nichts. Dadurch sitzt bei jeder Groesse alles sauber - Ecken und
 * Symbolbilder verrutschen erfahrungsgemaess auf kleinen Bildschirmen.
 */
function cardHtml(card, size = "m", opts = {}) {
  const cls = ["card", size];
  if (opts.dim) cls.push("dim");
  if (opts.pick) cls.push("pick");
  const style = opts.style ? ` style="${opts.style}"` : "";
  const data = opts.data ?? "";

  if (!card || opts.faceDown) {
    cls.push("back");
    return `<div class="${cls.join(" ")}"${style} ${data}></div>`;
  }
  cls.push(isRed(card) ? "red" : "black");
  return (
    `<div class="${cls.join(" ")}"${style} ${data}>` +
    `<span class="rk">${card.rank}</span>` +
    `<span class="st">${suitSymbol(card.suit)}</span>` +
    `</div>`
  );
}

/** Aufgefaecherte Hand - die aeusseren Karten gekippt und tiefer. */
function handHtml(player) {
  const n = player.cards.length;
  if (n === 0) return `<div class="hand"><p class="sub">Noch keine Karten.</p></div>`;
  const cards = player.cards
    .map((c, i) => {
      const off = i - (n - 1) / 2;
      const style = `transform: rotate(${(off * 7).toFixed(1)}deg); margin-top:${Math.abs(off) * 10}px`;
      return cardHtml(c, "xl", { style });
    })
    .join("");
  return `<div class="hand">${cards}</div>`;
}

/** `active` darf eine Id oder eine Liste von Ids sein (mehrere Verteiler). */
function seatsHtml(players, active) {
  const activeIds = new Set([active].flat().filter(Boolean));
  return (
    `<div class="seats">` +
    players
      .map((p) => {
        const cards =
          p.cards.length === 0
            ? `<span class="sub" style="margin:0">keine</span>`
            : p.cards
                .map((c, i) => {
                  // Nur flach drehen - 3D-Kippen macht die Karten unscharf.
                  const off = i - (p.cards.length - 1) / 2;
                  return cardHtml(c, "xs", { style: `transform: rotate(${(off * 4).toFixed(1)}deg)` });
                })
                .join("");
        return (
          `<div class="seat ${activeIds.has(p.id) ? "active" : ""}">` +
          `<div class="head">${avatar(p, true)}<span class="name">${esc(p.name)}</span>` +
          `<span class="badge">${p.sips}</span></div>` +
          `<div class="cards">${cards}</div>` +
          (p.connected === false ? `<div class="off">offline</div>` : "") +
          `</div>`
        );
      })
      .join("") +
    `</div>`
  );
}

/** Kurze Einblendung oben. Mehrere stapeln sich untereinander. */
function toast(html, art = "") {
  let box = document.querySelector(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = art ? `toast ${art}` : "toast";
  t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.classList.add("out"), 4200);
  setTimeout(() => t.remove(), 4700);
}

/**
 * Meldungen ueber bekommene Schluecke. Der Server schreibt sie erst, wenn
 * jemand seine Verteilung komplett abgeschlossen hat - pro Empfaenger genau
 * eine Meldung mit der Gesamtzahl, nicht eine pro Schluck.
 */
function checkSipToast(g) {
  const log = g?.sipLog ?? [];
  if (log.length === 0) return;
  const neu = log.filter((e) => e.seq > S.sipSeen);
  S.sipSeen = Math.max(S.sipSeen, ...log.map((e) => e.seq));
  if (S.mode !== "online") return;

  for (const e of neu) {
    if (e.toId !== S.myId) continue;
    const from = g.players.find((p) => p.id === e.fromId)?.name ?? "Jemand";
    toast(`${avatar(from)}<span><strong>${esc(from)}</strong> gibt dir
           <strong>${e.count} Schluck${e.count > 1 ? "e" : ""}</strong> 🍺</span>`);
    // Zweimal kurz - man guckt beim Spielen ja nicht dauernd aufs Handy
    brumm([40, 60, 40]);
  }
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

/**
 * Aktionen, bei denen eine Karte vom Stapel gezogen wird. Ist der Stapel
 * gerade leer, wird neu gemischt - was dabei kommt, kann der Browser nicht
 * erraten. Dann wird nicht vorausgerechnet, sondern gewartet.
 */
const ZIEHT = new Set([
  "guess",
  "guessBuild",
  "flip",
  "revealRow",
  "tiebreakFlip",
  "tiebreakDraw",
  "pickPyramid",
  "restartPyramid",
  "discard",
]);

/**
 * Online wird jede Aktion sofort auch im Browser gerechnet und gezeichnet -
 * sonst passiert beim Tippen erst mal gar nichts, bis der Server geantwortet
 * hat. Gleich danach kommt sein Stand und ueberschreibt das Ergebnis; er hat
 * immer recht. Weil beide Seiten denselben Regelcode benutzen, kommt in aller
 * Regel genau dasselbe heraus.
 */
function dispatch(action) {
  if (S.mode === "online") {
    S.socket?.emit("action", action);
    if (!S.game || !S.myId) return;
    const leererStapel = (S.game.deck?.length ?? 0) === 0;
    if (leererStapel && ZIEHT.has(action.type)) return;
    if (!mayAct(S.game, S.myId, action)) return;

    const voraus = applyAction(S.game, action, S.myId);
    if (voraus === S.game) return;
    S.game = voraus;
    render();
    return;
  }
  S.game = applyAction(S.game, action);
  render();
}

/** Ein frisches Spiel derselben Sorte - lokal wird hier selbst gerechnet. */
function neuesSpiel(id, players) {
  if (id === "race") return initRace(players);
  if (id === "build") return initBuild(players);
  if (id === "leber") return initLeber(players);
  return initGame(players);
}

/** Wer sitzt unten am Tisch? Online ich, lokal wer gerade dran ist. */
function meId() {
  if (S.mode === "online") return S.myId;
  if (!S.game) return null;
  if (S.game.game === "build") return currentPlayer(S.game)?.id ?? S.game.players[0].id;
  if (S.game.game === "leber") return currentPlayerLeber(S.game)?.id ?? S.game.players[0].id;
  return activePlayerId(S.game) ?? S.game.players[0].id;
}

function canAct(action) {
  if (!S.game) return false;
  if (S.mode === "local") return true; // ein Geraet, wird herumgereicht
  return S.myId ? mayAct(S.game, S.myId, action) : false;
}

// ---------------------------------------------------------------------------
// Bildschirme
// ---------------------------------------------------------------------------

function nameScreen() {
  return `
    <h1>🍻 Willkommen!</h1>
    <p class="sub">Wie sollen dich die anderen nennen? Der Name wird auf diesem
    Gerät gespeichert – du musst ihn nur einmal eintragen.</p>
    <input id="nameInput" value="${esc(S.name)}" placeholder="Dein Name" maxlength="14" autofocus>
    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
    <div style="height:16px"></div>
    <button class="wide" data-a="saveName">Weiter</button>`;
}

function homeScreen() {
  return `
    <div class="greet">
      ${avatar(S.name)}
      <div class="who">
        <div class="hi">Willkommen zurück</div>
        <div class="nm">${esc(S.name)}</div>
      </div>
      <button class="ghost small" data-a="editName">ändern</button>
    </div>

    <h1>Trinkspiele 🍻</h1>
    <p class="sub">Wie wollt ihr spielen?</p>

    <div class="stack">
      <button data-a="online">🌍 Online mit Freunden</button>
      <button class="secondary" data-a="local">📱 Alle an einem Handy</button>
    </div>
    <p class="version">${VERSION}</p>`;
}

/**
 * Die Spielauswahl. Steht direkt da, wo gestartet wird: online in der Lobby
 * beim Host, lokal auf dem Namens-Bildschirm.
 */
function gamePicker(aktiv, waehlbar = true) {
  return (
    `<div class="games">` +
    SPIELE.map(
      (s) => `
      <button class="gamecard ${s.id === aktiv ? "sel" : ""}" ${
        waehlbar ? `data-a="pickGame" data-id="${s.id}"` : "disabled"
      }>
        <span class="emo">${s.emoji}</span>
        <span class="nm">${esc(s.name)}</span>
        <span class="kz">${esc(s.kurz)}</span>
      </button>`
    ).join("") +
    `</div>`
  );
}

/**
 * Profilbild-Auswahl. Jedes Bild gibt es in einer Lobby nur einmal - was
 * schon jemand hat, ist gesperrt und zeigt seinen Namen.
 */
function avatarPicker(players, meins) {
  const belegt = new Map(players.filter((p) => p.avatar).map((p) => [p.avatar, p]));
  return (
    `<div class="avpick">` +
    AVATARE.map((a) => {
      const wer = belegt.get(a);
      if (a === meins) return `<button class="avopt mine" disabled>${a}</button>`;
      if (wer)
        return `<button class="avopt weg" disabled title="${esc(wer.name)}">${a}<i>${esc(
          wer.name.charAt(0).toUpperCase()
        )}</i></button>`;
      return `<button class="avopt" data-a="pickAvatar" data-av="${a}">${a}</button>`;
    }).join("") +
    `</div>`
  );
}

function rulesScreen() {
  const s = SPIELE.find((x) => x.id === S.rulesFor) ?? SPIELE[0];
  return `
    <h2>${s.emoji} ${esc(s.name)}</h2>
    <div class="rules">${regelnHtml(s.id)}</div>
    <div class="actions">
      <button class="wide" data-a="rulesBack">Alles klar</button>
    </div>`;
}

/**
 * Die Zeile ganz oben: wer ist dran. Mit Gesicht, damit man es am Tisch
 * auf einen Blick sieht - grün heißt immer "du".
 */
function turnBar(wer, text, ichBinDran, extra = "") {
  return (
    `<div class="turn ${ichBinDran ? "me" : ""}">` +
    (wer ? avatar(wer, true) : "") +
    `<span class="t">${text}</span>` +
    (extra ? `<span class="x">${extra}</span>` : "") +
    `</div>`
  );
}

function setupScreen() {
  const rows = S.names
    .map(
      (v, i) => `
      <div class="row" style="margin-bottom:10px">
        <input data-i="${i}" value="${esc(v)}" placeholder="Spieler ${i + 1}" maxlength="14">
        ${S.names.length > MIN_PLAYERS ? `<button class="ghost small" data-a="rm" data-i="${i}" style="flex:0 0 auto">✕</button>` : ""}
      </div>`
    )
    .join("");

  return `
    <h2>Alle an einem Handy</h2>
    ${rows}
    ${S.names.length < MAX_PLAYERS ? `<button class="secondary wide" data-a="add">+ Spieler</button>` : ""}
    <p class="label">Spiel</p>
    ${gamePicker(S.spiel)}
    ${
      passtDieZahl(S.spiel, S.names.length)
        ? ""
        : `<p class="error">${spielName(S.spiel)}: ${spielerBedarf(S.spiel)}</p>`
    }
    <div class="actions">
      <div class="row">
        <button class="secondary" data-a="rules" data-id="${S.spiel}">📖 Regeln</button>
        <button data-a="start">${spielEmoji(S.spiel)} Los geht's</button>
      </div>
      <button class="ghost wide" data-a="home">Zurück</button>
    </div>`;
}

/** Name des Hosts im Warteraum. */
const hostNameLobby = () => S.lobby?.players.find((p) => p.isHost)?.name ?? "der Host";

function lobbyScreen() {
  // Warteraum
  if (S.lobby) {
    const me = S.lobby.players.find((p) => p.id === S.myId);
    const binHost = !!me?.isHost;
    const spiel = S.lobby.spiel ?? "bus";
    const gr = grenzen(spiel);
    const anzahl = S.lobby.players.length;
    const enough = anzahl >= gr.min && anzahl <= gr.max;

    const link = lobbyLink(S.lobby.code);

    // Alles muss auf einen Bildschirm passen, ohne zu schieben. Deshalb steht
    // hier nichts untereinander, was auch nebeneinander geht: Code neben dem
    // QR-Bild, die Leute als Namensschilder statt als Liste, die Spiele im
    // Raster statt in einer Reihe.
    return `
      <div class="lobbykopf">
        <h2>Lobby</h2>
        <button class="ghost small" data-a="leave">Verlassen</button>
      </div>

      <div class="einladen">
        ${qrSvg(link)}
        <div class="dazu">
          <div class="lcode">${S.lobby.code}</div>
          <div class="row">
            <button class="secondary small" data-a="linkKopieren">🔗 Link</button>
            ${
              typeof navigator !== "undefined" && navigator.share
                ? `<button class="secondary small" data-a="linkTeilen">Teilen</button>`
                : ""
            }
          </div>
        </div>
      </div>

      ${!S.connected ? `<p class="error">Verbindung unterbrochen…</p>` : ""}

      <div class="leute">
        ${S.lobby.players
          .map(
            (p) => `
          <span class="schild ${p.id === S.myId ? "ich" : ""} ${p.connected ? "" : "weg"}">
            ${avatar(p)}<b>${esc(p.name)}</b>${p.isHost ? `<i>Host</i>` : ""}
          </span>`
          )
          .join("")}
      </div>

      <p class="label">Dein Bild</p>
      ${avatarPicker(S.lobby.players, me?.avatar)}

      <p class="label">${binHost ? "Spiel" : `Spiel – wählt ${esc(hostNameLobby())}`}</p>
      ${gamePicker(spiel, binHost)}
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}

      <div class="actions">
        <div class="row">
          <button class="secondary" data-a="rules" data-id="${spiel}">📖 Regeln</button>
          ${
            binHost
              ? `<button data-a="startOnline" ${enough ? "" : "disabled"}>${
                  enough ? `${spielEmoji(spiel)} Starten` : spielerBedarf(spiel)
                }</button>`
              : `<button class="secondary" disabled>Host startet…</button>`
          }
        </div>
      </div>`;
  }

  // Lobby aufmachen oder beitreten - das Spiel wird erst drinnen gewählt.
  return `
    <h2>Online mit Freunden</h2>
    <p class="sub">Du spielst als <strong>${esc(S.name)}</strong>.</p>

    <button class="wide" data-a="create">Neue Lobby erstellen</button>

    <p class="sub" style="text-align:center;margin:22px 0 12px">oder beitreten</p>
    <input id="codeInput" class="code" value="${esc(S.code)}" placeholder="CODE" maxlength="4">
    <div style="height:12px"></div>
    <button class="secondary wide" data-a="join">Beitreten</button>

    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
    <div style="height:12px"></div>
    <button class="ghost wide" data-a="home">Zurück</button>`;
}

// --- Spiel ---

/** Name des Hosts - er steuert in Phase 2 das Aufdecken. */
function hostName(g) {
  return g.players.find((p) => p.id === g.hostId)?.name ?? "Der Host";
}

/**
 * Das Verteil-Feld fuer einen bestimmten Spieler.
 *
 * Der Zurueck-Knopf sitzt bewusst OBEN in der Kopfzeile. Unten stand er
 * genau dort, wo eben noch eine Namenskachel war - wer schnell tippt, hat
 * damit versehentlich zurueckgenommen.
 */
function handOutPanel(g, fromId) {
  const n = pendingFor(g, fromId);
  const gegeben = givenSoFar(g, fromId);
  const zurueck = canUndo(g, fromId);
  if (n === 0 && !zurueck) return "";
  const from = playerById(g, fromId);
  const wer = S.mode === "local" ? `${esc(from.name)}: ` : "";

  // Jede Person, der man in dieser Verteilung etwas gegeben hat, bekommt ein
  // eigenes Minus. So kann man gezielt bei dem zuruecknehmen, bei dem man sich
  // vertippt hat - nicht nur beim zuletzt Angetippten.
  const zeilen = sipTargets(g, fromId)
    .map((p) => {
      const meins = gegeben[p.id] ?? 0;
      const plus =
        `<button class="tile" data-a="sip" data-id="${p.id}" data-from="${fromId}" ${
          n === 0 ? "disabled" : ""
        }>${avatar(p)}<span class="nm">${esc(p.name)}</span>` +
        (meins > 0 ? `<span class="von">+${meins}</span>` : "") +
        `<span class="badge">${p.sips}</span></button>`;
      const minus =
        meins > 0
          ? `<button class="minus" data-a="undo" data-id="${p.id}" data-from="${fromId}"
               title="Einen Schluck bei ${esc(p.name)} zurücknehmen">−</button>`
          : "";
      return `<div class="tilerow">${plus}${minus}</div>`;
    })
    .join("");

  return `
    <div class="panel ${n > 0 ? "accent" : ""}">
      <div class="ph">
        <h3>${n > 0 ? `${wer}${n} Schluck${n > 1 ? "e" : ""} verteilen 🍺` : `${wer}fertig verteilt ✓`}</h3>
      </div>
      <div class="tiles">${zeilen}</div>
    </div>`;
}

/** Hinweis auf alle anderen, die parallel noch verteilen. */
function othersDistributing(g, exceptId) {
  const rest = distributorIds(g).filter((id) => id !== exceptId);
  if (rest.length === 0) return "";
  const text = rest
    .map((id) => `${esc(playerById(g, id).name)} (${pendingFor(g, id)})`)
    .join(", ");
  return `<p class="banner">Verteil${rest.length > 1 ? "en" : "t"} noch: ${text}</p>`;
}

function guessScreen(g) {
  const me = g.players.find((p) => p.id === meId());
  const others = g.players.filter((p) => p.id !== meId());
  const turn = g.players[g.turn];
  const sips = g.round + 1;

  const options = [
    [["🔴 Rot", "red"], ["⚫ Schwarz", "black"]],
    [["⬆️ Höher", "higher"], ["⬇️ Niedriger", "lower"]],
    [["↔️ Dazwischen", "inside"], ["↕️ Außerhalb", "outside"]],
    [["Hatte ich schon", "seen"], ["Ist neu", "new"]],
  ][g.round];

  // In Phase 1 verteilt immer nur der, der gerade geraten hat.
  let footer;
  if (pendingTotal(g) > 0) {
    footer =
      S.mode === "local" || pendingFor(g, S.myId) > 0
        ? handOutPanel(g, distributorIds(g)[0])
        : `<p class="banner">${esc(turn.name)} verteilt noch ${pendingFor(g, turn.id)} Schluck${
            pendingFor(g, turn.id) > 1 ? "e" : ""
          }.</p>`;
  } else if (canAct({ type: "guess", value: "red" }))
    footer = `<div class="row" style="margin-top:16px">${options
      .map(([label, v]) => `<button data-a="guess" data-v="${v}">${label}</button>`)
      .join("")}</div>`;
  else footer = `<p class="banner">${esc(turn.name)} ist dran.</p>`;

  const ichDran = S.mode === "local" || turn.id === S.myId;
  const verteiler = distributorIds(g)[0];
  const dranText =
    pendingTotal(g) > 0
      ? verteiler === S.myId && S.mode !== "local"
        ? "Du verteilst"
        : `${esc(playerById(g, verteiler)?.name ?? "")} verteilt`
      : ichDran && S.mode !== "local"
      ? "Du bist dran"
      : `${esc(turn.name)} ist dran`;

  const dranWer = pendingTotal(g) > 0 ? playerById(g, verteiler) : turn;
  return `
    ${turnBar(dranWer, dranText, ichDran, `${sips} 🍺`)}
    <h2>${ROUND_TITLES[g.round]}</h2>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, turn.id)}
    <div class="felt">
      <span class="note">Nachziehstapel</span>
      ${cardHtml(null, "m", { faceDown: true })}
      <span class="note">${g.deck.length} Karten</span>
    </div>
    ${meBlock(me, turn.id)}
    <div class="actions">${footer}</div>`;
}

function rowsScreen(g) {
  const me = g.players.find((p) => p.id === meId());
  const others = g.players.filter((p) => p.id !== meId());
  const cur = currentRowCard(g);
  const matches = playersWithMatch(g);
  const offen = pendingTotal(g) > 0;
  const binHost = S.mode === "local" || g.hostId === S.myId;

  const line = (row, kind) =>
    `<div class="line">` +
    row
      .map((c) => {
        const isCur = g.revealedNow && cur?.kind === kind && cur?.card === c;
        return (
          `<div class="slot">` +
          cardHtml(c.card, "s", { faceDown: !c.revealed, pick: isCur }) +
          `<span class="val">${c.value}</span></div>`
        );
      })
      .join("") +
    `</div>`;

  // 1. Eigene Verteil-Auftraege. Lokal liegen alle auf demselben Geraet.
  const panels =
    S.mode === "local"
      ? distributorIds(g)
          .map((id) => handOutPanel(g, id))
          .join("")
      : handOutPanel(g, S.myId);

  // 2. Ablegen - das geht auch, waehrend jemand anders noch verteilt.
  let ablegen = "";
  if (g.revealedNow) {
    const meine = S.mode === "local" ? matches : matches.filter((p) => p.id === S.myId);
    const fremde = S.mode === "local" ? [] : matches.filter((p) => p.id !== S.myId);
    ablegen = `
      <div class="panel">
        <h3>${cur?.card.card.rank} – ${cur?.kind === "drink" ? "selber trinken" : "verteilen"}, ${
      cur?.card.value
    } Schluck${cur?.card.value > 1 ? "e" : ""}</h3>
        ${matches.length === 0 ? `<p class="hint" style="margin:0">Passt bei niemandem.</p>` : ""}
        ${meine
          .map((p) => {
            const n = matchCount(g, p.id);
            return (
              `<button class="accent wide" data-a="discard" data-id="${p.id}" style="margin-bottom:8px">` +
              `${S.mode === "local" ? esc(p.name) + ": " : ""}` +
              `${n > 1 ? `${n} Karten ablegen (${n * cur.card.value} 🍺)` : "Karte ablegen"}</button>`
            );
          })
          .join("")}
        ${
          fremde.length
            ? `<p class="hint" style="margin:0">Passt außerdem bei: ${fremde
                .map((p) => esc(p.name))
                .join(", ")}</p>`
            : ""
        }
      </div>`;
  }

  // 3. Aufdecken bzw. weiterblaettern. Weiter geht erst, wenn keiner mehr
  // ablegen kann - oder nach 10 Sekunden. Dann ist jeder selbst schuld.
  const restMs = Math.max(0, warteBis(g) - Date.now());
  const sek = Math.ceil(restMs / 1000);
  const letzte = g.cursor + 1 >= g.order.length;
  const blockiert = restMs > 0 || (letzte && offen);

  let steuerung;
  if (!g.revealedNow) {
    steuerung = binHost
      ? `<button class="wide" data-a="reveal">Karte aufdecken (${g.cursor + 1} von 8)</button>`
      : `<p class="banner">${esc(hostName(g))} deckt die nächste Karte auf.</p>`;
  } else {
    steuerung = binHost
      ? `<button class="secondary wide" data-a="next" ${blockiert ? "disabled" : ""}>${
          restMs > 0
            ? `Weiter in ${sek}s`
            : letzte && offen
            ? "Warten: Schlücke noch offen"
            : "Weiter"
        }</button>`
      : `<p class="banner">${esc(hostName(g))} blättert weiter.</p>`;
  }

  const footer =
    panels + ablegen + (S.mode === "local" ? "" : othersDistributing(g, S.myId)) + steuerung;

  const meinePendings = pendingFor(g, S.myId) > 0;
  const dranText = offen
    ? meinePendings && S.mode !== "local"
      ? "Du verteilst"
      : `${distributorIds(g)
          .map((id) => esc(playerById(g, id).name))
          .join(" & ")} verteil${distributorIds(g).length > 1 ? "en" : "t"}`
    : matches.length > 0 && g.revealedNow
    ? `Ablegen: ${matches.map((p) => esc(p.name)).join(", ")}`
    : binHost
    ? "Du deckst auf"
    : `${esc(hostName(g))} deckt auf`;

  const dranWer = offen
    ? playerById(g, distributorIds(g)[0])
    : matches.length > 0 && g.revealedNow
    ? matches[0]
    : playerById(g, g.hostId);
  return `
    ${turnBar(
      dranWer,
      dranText,
      meinePendings || matches.some((p) => p.id === meId()) || binHost,
      `${g.cursor + 1}/8`
    )}
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, distributorIds(g))}
    <div class="felt">
      <span class="tag drink">Selber trinken</span>
      ${line(g.drinkRow, "drink")}
      <span class="tag give">Verteilen</span>
      ${line(g.giveRow, "give")}
    </div>
    ${meBlock(me, distributorIds(g))}
    <div class="actions">${footer}</div>`;
}

function tiebreakScreen(g) {
  const me = g.players.find((p) => p.id === meId());
  const others = g.players.filter((p) => p.id !== meId());

  // Der Fahrer steht fest: erst das Ergebnis zeigen, dann weiter. Sonst
  // blitzt die entscheidende Karte nur auf und keiner sieht, was passiert ist.
  if (g.tieResult) {
    const fahrer = playerById(g, g.tieResult.driverId);
    const raus = g.tieResult.escaped.map((id) => playerById(g, id));
    const binHost = S.mode === "local" || g.hostId === S.myId;
    const ichFahre = fahrer.id === meId();

    return `
      ${turnBar(fahrer, ichFahre ? "Du fährst Bus 🚌" : `${esc(fahrer.name)} fährt Bus 🚌`, ichFahre)}
      <p class="msg">${esc(g.message ?? "")}</p>
      <div class="felt">
        ${
          g.tieMode === "draw"
            ? `<span class="note">Gezogene Karten</span>
               <div class="line">${g.candidates
                 .concat(g.tieResult.escaped)
                 .filter((id, i, a) => a.indexOf(id) === i)
                 .map(
                   (id) => `<div class="slot">${cardHtml(g.drawn?.[id], "m")}
                     <span class="val">${esc(playerById(g, id).name)}</span></div>`
                 )
                 .join("")}</div>`
            : `<span class="note">Aufgedeckt</span>${cardHtml(g.flipped, "m")}
               <span class="note">${raus
                 .map((p) => esc(p.name))
                 .join(", ")} konnte ablegen und ist raus</span>`
        }
      </div>
      <div class="actions">${
        binHost
          ? `<button class="wide" data-a="tieGo">Weiter zur Pyramide 🚌</button>`
          : `<p class="banner">${esc(hostName(g))} macht weiter.</p>`
      }</div>`;
  }

  const namen = g.candidates.map((id) => playerById(g, id).name);
  const darf = canAct({ type: g.tieMode === "flip" ? "tiebreakFlip" : "tiebreakDraw" });

  const mitte =
    g.tieMode === "draw"
      ? `<span class="note">Jeder zieht eine Karte – die niedrigste fährt</span>
         <div class="line">${
           g.drawn
             ? g.candidates.map((id) => `<div class="slot">${cardHtml(g.drawn[id], "m")}
                 <span class="val">${esc(playerById(g, id).name)}</span></div>`).join("")
             : g.candidates.map(() => cardHtml(null, "m", { faceDown: true })).join("")
         }</div>`
      : `<span class="note">Wer ablegen kann, ist raus</span>
         ${cardHtml(g.flipped, "m", { faceDown: !g.flipped })}
         <span class="note">${g.deck.length} Karten im Stapel</span>`;

  const knopf =
    g.tieMode === "draw"
      ? `<button class="wide" data-a="tieDraw">Karten ziehen</button>`
      : `<button class="wide" data-a="tieFlip">Nächste Karte aufdecken</button>`;

  return `
    ${turnBar(playerById(g, g.hostId), darf ? "Du deckst auf" : `${esc(hostName(g))} deckt auf`, darf)}
    <h2>Stechen ⚔️ <span class="leicht">${esc(namen.join(" gegen "))}</span></h2>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, null)}
    <div class="felt">${mitte}</div>
    ${meBlock(me, null)}
    <div class="actions">${
      darf ? knopf : `<p class="banner">${esc(hostName(g))} deckt auf.</p>`
    }</div>`;
}

function pyramidScreen(g) {
  const driver = g.players.find((p) => p.id === g.driverId);
  // Unter der Pyramide steht der, um den es hier geht: der Busfahrer.
  // Nur wer selbst faehrt, sieht dort sich selbst.
  const iDriveNow = g.driverId === meId() || S.mode === "local";
  const me = iDriveNow ? g.players.find((p) => p.id === meId()) : driver;
  const others = g.players.filter((p) => p.id !== me?.id);
  const level = g.path.length;
  const allowed = allowedPyramidIndices(g);
  const iDrive = iDriveNow;

  const pyramid = g.rows
    .map((row, r) => ({ row, r }))
    .reverse()
    .map(({ row, r }) => {
      const isCurrent = r === level && !g.finished && !g.failedAt;
      const cards = row
        .map((card, i) => {
          const onPath = r < g.path.length && g.path[r] === i;
          const isFail = g.failedAt?.row === r && g.failedAt?.index === i;
          const open = onPath || isFail;
          const pick = isCurrent && allowed.includes(i) && iDrive;
          return cardHtml(card, "s", {
            faceDown: !open,
            pick,
            dim: isCurrent && !allowed.includes(i),
            data: pick ? `data-a="pyr" data-i="${i}"` : "",
          });
        })
        .join("");
      return `<div class="line">${cards}</div>`;
    })
    .join("");

  let footer;
  if (g.finished) {
    footer = g.outOfCards
      ? `<p class="success" style="color:var(--gold)">Das Deck ist leer – ${esc(driver.name)} hat's nicht geschafft.</p>
         <button class="wide" data-a="finish">Ergebnis anzeigen</button>`
      : `<p class="success">🎉 Oben angekommen! ${esc(driver.name)} ist raus.</p>
         <button class="wide" data-a="finish">Ergebnis anzeigen</button>`;
  } else if (g.failedAt) {
    footer = iDrive
      ? `<button class="accent wide" data-a="restart">Karten zudecken, nochmal von unten</button>`
      : `<p class="banner">${esc(driver.name)} fängt neu an.</p>`;
  } else {
    footer = iDrive
      ? `<p class="banner">${
          level === 0
            ? "Such dir unten eine der fünf Karten aus."
            : "Nur die markierten Karten grenzen an deine letzte an."
        }</p>`
      : `<p class="banner">${esc(driver.name)} fährt Bus – trinken muss nur er.</p>`;
  }

  return `
    ${turnBar(
      driver,
      iDrive ? "Du fährst Bus 🚌" : `${esc(driver.name)} fährt Bus 🚌`,
      iDrive,
      `Reihe ${Math.min(level + 1, 5)}/5 · Versuch ${g.attempts}`
    )}
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, driver.id)}
    <div class="felt">${pyramid}</div>
    ${meBlock(me, driver.id, iDrive ? "du bist dran" : "fährt Bus 🚌")}
    <div class="actions">${footer}</div>`;
}

// ---------------------------------------------------------------------------
// Pferderennen
// ---------------------------------------------------------------------------

const suitCls = (s) => (s === "hearts" || s === "diamonds" ? "red" : "black");

/** Die kleinen Namensschilder unter einem Pferd - wer hat wie viel gesetzt? */
function betChips(g, suit) {
  const wetten = betsOn(g, suit);
  if (wetten.length === 0) return "";
  return (
    `<div class="bets">` +
    wetten
      .map(
        (p) =>
          `<span class="bet ${p.id === meId() ? "mine" : ""}">${avatar(p, true)}` +
          `<span>${esc(p.name)}</span><b>${g.bets[p.id].amount}</b></span>`
      )
      .join("") +
    `</div>`
  );
}

/** Ein Ass als Spielkarte - die Farbe ist das Pferd. */
const horseCard = (suit, size = "s") =>
  cardHtml({ rank: "A", suit }, size);

function betScreen(g) {
  const meine = g.bets[meId()];
  const binHost = S.mode === "local" || g.hostId === S.myId;
  const fehlen = g.players.filter((p) => !g.bets[p.id]);

  // Lokal setzt man reihum: der erste ohne Wette ist dran.
  const wer = S.mode === "local" ? fehlen[0] ?? null : playerById(g, S.myId);
  const entwurf = S.bet.suit ?? meine?.suit ?? null;
  const betrag = Math.min(MAX_EINSATZ, Math.max(MIN_EINSATZ, S.bet.amount));

  const pferde = HORSE_ORDER.map(
    (suit) => `
    <button class="horse ${entwurf === suit ? "sel" : ""}" data-a="pickHorse" data-suit="${suit}">
      ${horseCard(suit, "m")}
      <span class="nm">${suitName(suit)}</span>
      ${betChips(g, suit)}
    </button>`
  ).join("");

  // Wichtig: zuerst prüfen, ob überhaupt noch jemand fehlt. Sonst bekommt der
  // Host online nie den Startknopf zu sehen und es geht nicht weiter.
  let footer;
  if (fehlen.length === 0) {
    footer = binHost
      ? `<button class="wide" data-a="startRace">🏁 Rennen starten</button>`
      : `<p class="banner">${esc(playerById(g, g.hostId)?.name ?? "Der Host")} startet gleich.</p>`;
  } else if (meine && S.mode !== "local") {
    // Schon gesetzt und getrunken - jetzt gibt es nichts mehr zu tun.
    footer = `<p class="banner">Du: <strong>${meine.amount}</strong> auf
      <strong>${suitName(meine.suit)}</strong> ✓</p>`;
  } else {
    const schnell = [1, 2, 3, 5, 10, 20].filter((n) => n <= MAX_EINSATZ);
    footer = `
      <div class="panel accent">
        <h3>${S.mode === "local" ? esc(wer.name) + ": " : ""}Einsatz${
      entwurf ? " auf " + suitName(entwurf) : ""
    }</h3>
        ${entwurf ? "" : `<p class="hint">Erst ein Pferd antippen.</p>`}
        <div class="stepper">
          <button class="step" data-a="betMinus" ${betrag <= MIN_EINSATZ ? "disabled" : ""}>−</button>
          <span class="num">${betrag}</span>
          <button class="step" data-a="betPlus" ${betrag >= MAX_EINSATZ ? "disabled" : ""}>+</button>
        </div>
        <div class="chips">
          ${schnell
            .map((n) => `<button class="small ${n === betrag ? "accent" : "secondary"}" data-a="betSet" data-n="${n}">${n}</button>`)
            .join("")}
        </div>
      </div>
      <button class="wide" data-a="placeBet" ${entwurf ? "" : "disabled"}>
        ${betrag} auf ${entwurf ? suitName(entwurf) : "…"} setzen &amp; trinken 🍺</button>`;
  }

  const dranText =
    fehlen.length === 0
      ? "Alle haben gesetzt 🏁"
      : S.mode === "local"
      ? `${esc(wer.name)} setzt`
      : meine
      ? `Warten auf ${fehlen.map((p) => esc(p.name)).join(", ")}`
      : "Du bist dran – setzen";

  return `
    ${turnBar(wer ?? null, dranText, S.mode === "local" || (!meine && fehlen.length > 0))}
    <h2>Wetten 🐎 <span class="leicht">Einsatz wird sofort getrunken</span></h2>
    <div class="horses">${pferde}</div>
    <div class="actions">${footer}</div>`;
}

/**
 * Wer auf dieses Pferd gesetzt hat - ganz knapp, nur die Gesichter.
 * Feste Hoehe und hoechstens drei Stueck, damit alle Spalten gleich hoch
 * bleiben. Wer wie viel gesetzt hat, steht auf dem Wettzettel.
 */
function betsMini(g, suit) {
  const wetten = betsOn(g, suit);
  if (wetten.length === 0) return `<span class="bmini"></span>`;
  const zeigen = wetten
    .slice(0, 3)
    .map((p) => p.avatar ?? esc(p.name.charAt(0).toUpperCase()))
    .join("");
  return `<span class="bmini">${zeigen}${wetten.length > 3 ? `<b>+${wetten.length - 3}</b>` : ""}</span>`;
}

// Streckenkarte und Pferd sind gleich gross und stehen immer auf derselben
// Hoehe. SCHRITT ist der Abstand von Stufe zu Stufe, KARTE_H die Kartenhoehe
// (muss zu .card.t im Stylesheet passen - test-ui.js prueft das).
const SCHRITT = 59;
const KARTE_H = 53;
const BAHN_H = ZIEL * SCHRITT + KARTE_H;

/**
 * Die Rennbahn laeuft von oben nach unten: oben der Start, unten das Ziel.
 * Jedes Pferd hat eine eigene farbige Bahn, hinter sich eine Spur, die zeigt,
 * wie weit es schon ist. Links stehen die Streckenkarten als Schilder.
 *
 * Die Pferde sitzen frei positioniert statt in einem Raster - dadurch bleiben
 * alle Bahnen gleich hoch, egal wie viele wo stehen.
 */
function raceScreen(g) {
  const binHost = S.mode === "local" || g.hostId === S.myId;
  const hostName = playerById(g, g.hostId)?.name ?? "Host";

  // Kopfzeile: farbiger Kreis mit dem Symbol, darunter wer gesetzt hat.
  const kopf =
    `<div class="rhead"><span class="mk-sp"></span>` +
    HORSE_ORDER.map(
      (suit) =>
        `<span class="hcol"><span class="roundel ${suit}">${suitSymbol(suit)}</span>` +
        betsMini(g, suit) +
        `</span>`
    ).join("") +
    `</div>`;

  // Hintergrund: die vier farbigen Bahnen mit ihrer Fortschritts-Spur.
  const bahnen =
    `<div class="bg"><span></span>` +
    HORSE_ORDER.map((suit) => {
      const pos = g.horses[suit];
      const cls = ["lane", suit, g.winner === suit ? "win" : "", g.lastMove?.suit === suit ? "moved" : ""]
        .join(" ")
        .trim();
      return `<span class="${cls}">
                <span class="trail" style="height:${pos * SCHRITT + KARTE_H / 2}px"></span>
                <span class="ziellinie"></span>
              </span>`;
    }).join("") +
    `</div>`;

  // Eine Zeile je Stufe. Streckenkarte und Pferde stehen im SELBEN Element -
  // nur so koennen sie nicht gegeneinander verrutschen.
  const stufen = Array.from({ length: ZIEL + 1 }, (_, feld) => {
    let marke;
    if (feld === 0) marke = `<span class="mk-start">START</span>`;
    else if (feld > STRECKENKARTEN) marke = `<span class="mk-ziel">🏁</span>`;
    else {
      const s = g.side[feld - 1];
      marke = cardHtml(s.card, "t", { faceDown: !s.revealed });
    }

    const zellen = HORSE_ORDER.map((suit) => {
      if (g.horses[suit] !== feld) return `<span class="pf"></span>`;
      return `<span class="pf ${suit}"><span class="hw">${horseCard(suit, "t")}
                <span class="stufe">${feld === ZIEL ? "🏁" : feld}</span></span></span>`;
    }).join("");

    return `<div class="step" style="top:${feld * SCHRITT}px;height:${KARTE_H}px">
              <span class="mk">${marke}</span>${zellen}
            </div>`;
  }).join("");

  // Trennlinien genau zwischen zwei Stufen.
  const linien = Array.from(
    { length: ZIEL },
    (_, i) => `<span class="rowline" style="top:${i * SCHRITT + SCHRITT / 2 + KARTE_H / 2}px"></span>`
  ).join("");

  const footer = binHost
    ? `<button class="wide" data-a="flip">Nächste Karte aufdecken</button>`
    : `<p class="banner">${esc(hostName)} deckt auf.</p>`;

  // Gezogene Karte und "wer ist dran" in einer Zeile - spart Platz.
  const kopfleiste = `
    <div class="racehead ${binHost ? "me" : ""}">
      ${cardHtml(g.flipped, "t", { faceDown: !g.flipped })}
      <span class="txt">
        <b>${avatar(playerById(g, g.hostId), true)} ${
          binHost ? "Du deckst auf" : `${esc(hostName)} deckt auf`
        }</b>
        <i>${g.message ? esc(g.message) : "Gleich geht's los."}</i>
      </span>
    </div>`;

  return `
    ${kopfleiste}
    <div class="track">
      ${kopf}
      <div class="lanes" style="height:${BAHN_H}px">
        ${bahnen}
        ${linien}
        ${stufen}
      </div>
    </div>
    <div class="actions">${footer}</div>`;
}

function raceEndScreen(g) {
  const sieger = g.winner;
  const gewinner = betsOn(g, sieger);
  const meins = g.bets[meId()]?.suit === sieger;

  // Auszahlung: dieselbe Verteil-Mechanik wie bei Busfahren.
  const panels =
    S.mode === "local"
      ? distributorIds(g)
          .map((id) => handOutPanel(g, id))
          .join("")
      : handOutPanel(g, S.myId);

  let footer = panels;
  if (g.phase === "payout") {
    footer += S.mode === "local" ? "" : othersDistributing(g, S.myId);
    if (!panels && S.mode !== "local") {
      footer += `<p class="banner">Die Gewinner verteilen gerade.</p>`;
    }
  } else {
    footer += resultFooter(g);
  }

  return `
    <h2>${suitName(sieger)} gewinnt! 🏁</h2>
    <p class="sub">${
      gewinner.length === 0
        ? "Darauf hatte niemand gesetzt – alle Einsätze umsonst getrunken."
        : meins
        ? `Du hast richtig gesetzt und verteilst das Doppelte deines Einsatzes.`
        : `Richtig gesetzt: ${gewinner.map((p) => esc(p.name)).join(", ")}.
           Sie verteilen das Doppelte ihres Einsatzes.`
    }</p>
    <div class="winner">${horseCard(sieger, "l")}</div>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${
      g.phase === "finished"
        ? [...g.players]
            .sort((a, b) => b.sips - a.sips)
            .map(
              (p, i) => `
        <div class="result ${i === 0 ? "first" : ""}">
          <span class="rank">${i + 1}</span>${avatar(p)}
          <span class="name">${esc(p.name)}</span>
          <span class="badge">${p.sips}</span>
        </div>`
            )
            .join("")
        : ""
    }
    <div class="actions">${footer}</div>`;
}

// ---------------------------------------------------------------------------
// Bus bauen
// ---------------------------------------------------------------------------

/**
 * Eine Reihe: links ein Anbau-Feld, dann die Karten, rechts noch eins.
 * Angetippt wird der Platz, nicht die Karte - deshalb sind die Felder gross
 * genug zum Treffen.
 */
// Karten fuer Drueber Drunter: die kleine Standardgroesse .card.t aus
// style.css. Die Breite steht hier nochmal, weil der Ueberlapp damit
// gerechnet wird - test-ui.js prueft, dass beides zusammenpasst.
const DD_KARTE = 38;
const DD_LUECKE = 5;
const DD_MIN_SCHRITT = 6; // so viel von einer Karte bleibt mindestens sichtbar

/**
 * Wie viel Platz hat eine Reihe wirklich? Haengt am Handy, deshalb wird die
 * Fensterbreite genommen statt einer festen Zahl - auf einem grossen Display
 * liegen die Karten dadurch weiter auseinander. Abgezogen werden Seitenrand,
 * Filzrand, Reihenrand, die beiden Anbau-Felder, die Laengen-Anzeige und die
 * Luecken dazwischen; ein bisschen Sicherheitsabstand bleibt zusaetzlich.
 */
function reihePlatz() {
  const fenster = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 390;
  const breite = Math.min(fenster, 620); // breiter wird .app nicht
  const drumherum =
    2 * 18 + // Seitenrand der Seite
    2 * 8 + // Rand des Filzes
    2 * 5 + // Rand der Reihe
    2 * 32 + // die beiden Anbau-Felder
    2 * 5 + // Luecke links und rechts davon
    22 + // die Laengen-Anzeige
    8; // Sicherheitsabstand, damit nichts am Rand klebt
  return Math.max(110, breite - drumherum);
}

/**
 * Wie weit ruecken die Karten einer Reihe auseinander? Solange Platz ist, mit
 * normaler Luecke - danach schieben sie sich zusammen, und je laenger die
 * Reihe, desto mehr. Die Karten selbst bleiben immer gleich gross.
 */
function schrittWeite(n, platz = reihePlatz()) {
  if (n <= 1) return DD_KARTE;
  if (n * DD_KARTE + (n - 1) * DD_LUECKE <= platz) return DD_KARTE + DD_LUECKE;
  return Math.max(DD_MIN_SCHRITT, Math.floor((platz - DD_KARTE) / (n - 1)));
}

function buildRow(g, i, darfIch, platz) {
  const erlaubt = erlaubteReihen(g).includes(i);
  const karten = g.rows[i];
  const versatz = schrittWeite(karten.length, platz) - DD_KARTE; // negativ, wenn es eng wird
  const gewaehlt = (seite) => g.pick?.row === i && g.pick?.side === seite;

  const slot = (seite) => {
    const an = gewaehlt(seite);
    const aktiv = darfIch && erlaubt;
    const pfeil = seite === "left" ? "◀" : "▶";
    return (
      `<button class="slot ${seite} ${an ? "on" : ""}" ${aktiv ? "" : "disabled"} ` +
      `data-a="spot" data-row="${i}" data-side="${seite}" ` +
      `aria-label="${seiteName(seite)} an Reihe ${i + 1}">` +
      `<span class="pl">${an ? "✓" : "+"}</span><span class="ar">${pfeil}</span></button>`
    );
  };

  // Die frisch angelegte Karte kurz hervorheben, und die Karte, gegen die
  // gerade getippt wird, deutlich einrahmen - sonst raet man ins Blaue.
  const neu = g.letzte?.ok && g.letzte.row === i ? g.letzte.card.id : null;
  const ref = g.pick?.row === i ? randKarte(g, i, g.pick.side)?.id : null;
  // Die Stapelung hat ihren tiefsten Punkt in der Mitte: nach aussen hin liegt
  // jede Karte ueber ihrer Nachbarin. Dadurch sind die beiden Aussenkarten
  // immer ganz zu sehen, egal wie lang die Reihe ist - an die wird angelegt.
  const cards = karten
    .map((c, k) =>
      cardHtml(c, "t", {
        style: [
          k > 0 ? `margin-left:${versatz}px` : "",
          `z-index:${20 - Math.min(k, karten.length - 1 - k)}`,
          c.id === neu ? "box-shadow:0 0 0 3px var(--mint)" : "",
          c.id === ref ? "box-shadow:0 0 0 3px var(--gold)" : "",
        ]
          .filter(Boolean)
          .join(";"),
      })
    )
    .join("");

  // Die Laenge steht links daneben: so viele Schluecke kostet es, wenn man
  // sich hier verbaut. Ab fuenf wird die Zahl gelb, ab acht rot.
  const n = karten.length;
  const stufe = n >= 8 ? "heiss" : n >= 5 ? "warm" : "";

  return (
    `<div class="brow ${erlaubt ? "" : "sperr"} ${g.pick?.row === i ? "sel" : ""}">` +
    `<span class="len ${stufe}" title="${n} Schluck${n > 1 ? "e" : ""}, wenn du hier falsch liegst">${n}</span>` +
    slot("left") +
    `<div class="bcards">${cards}</div>` +
    slot("right") +
    `</div>`
  );
}

/** Schmale Leiste mit allen Spielern und ihrem Schluck-Stand. */
function sipStrip(g, dranId) {
  return (
    `<div class="strip">` +
    g.players
      .map(
        (p) =>
          `<span class="sp ${p.id === dranId ? "on" : ""} ${istFertig(g, p.id) ? "done" : ""} ` +
          `${p.connected === false ? "weg" : ""}">` +
          `${avatar(p, true)}<span>${esc(p.name)}</span>` +
          `<i>${p.connected === false ? "offline" : `${durchgaenge(g, p.id)}/${DURCHGAENGE}`}</i>` +
          `<b>${p.sips}</b></span>`
      )
      .join("") +
    `</div>`
  );
}

/**
 * Die grosse Anzeige nach einem Fehler: links die Karte, gegen die getippt
 * wurde, rechts die, die gekommen ist. So sieht jeder sofort, warum es
 * danebenging - vorher war die Karte schon wieder weg, bevor man sie lesen
 * konnte.
 */
function buildFehler(g, ichBinDran) {
  const l = g.letzte;
  const pfeil = { higher: "↑", lower: "↓", equal: "=" }[l.tipp] ?? "?";
  return `
    <div class="panel bad">
      <div class="ph"><h3>Daneben – ${l.sips} Schluck${l.sips > 1 ? "e" : ""} 🍺</h3></div>
      <div class="gegen">
        ${cardHtml(l.gegen, "m")}
        <span class="op">${pfeil}<i>${esc(tippName(l.tipp))}?</i></span>
        ${cardHtml(l.card, "m")}
      </div>
      <p class="hint" style="text-align:center;margin:12px 0 0">
        ${l.weg !== null ? `Reihe ${l.weg + 1} wird abgebaut. ` : ""}Weiter bei null.
      </p>
    </div>
    ${
      ichBinDran
        ? `<button class="wide" data-a="weiter">Nochmal probieren</button>`
        : `<p class="banner">${esc(currentPlayer(g)?.name ?? "")} schaut sich die Karte an.</p>`
    }`;
}

function buildScreen(g) {
  const dran = currentPlayer(g);
  const ichBinDran = S.mode === "local" || dran?.id === S.myId;
  const darfIch = ichBinDran && !g.wartet;
  const nurLaengste = g.streak === 0;

  const punkte = Array.from(
    { length: TREFFER },
    (_, i) => `<span class="dot ${i < g.streak ? "on" : ""}"></span>`
  ).join("");

  // Einmal ausrechnen und an alle Reihen weiterreichen, damit sie denselben
  // Platz zugrunde legen.
  const platz = reihePlatz();
  const reihen = g.rows.map((_, i) => buildRow(g, i, darfIch, platz)).join("");

  // Kopfzeile: wer baut, wie weit, und die zuletzt aufgedeckte Karte.
  const kopf = `
    <div class="bhead ${ichBinDran ? "me" : ""}">
      ${cardHtml(g.letzte?.card, "s", { faceDown: !g.letzte })}
      <span class="txt">
        <b>${avatar(dran, true)} ${ichBinDran ? "Du bist dran" : `${esc(dran?.name ?? "")} baut`}</b>
        <span class="streak">${punkte}<i>${g.streak}/${TREFFER}</i>
          <em>Durchgang ${Math.min(durchgaenge(g, dran?.id) + 1, DURCHGAENGE)}/${DURCHGAENGE}</em></span>
      </span>
    </div>`;

  let footer;
  if (g.wartet) {
    footer = buildFehler(g, ichBinDran);
  } else if (!ichBinDran) {
    // Wer dran ist, ist gerade weg? Dann steht das Spiel - das sollte man
    // sehen, statt sich zu wundern, warum nichts passiert.
    footer =
      dran?.connected === false
        ? `<p class="banner" style="border-color:var(--danger)">${esc(dran.name)} ist offline.
           Ihr müsst warten, bis er die Seite wieder aufmacht.</p>`
        : `<p class="banner">${esc(dran?.name ?? "")} baut gerade.</p>`;
  } else if (!g.pick) {
    footer = `<p class="banner">${
      nurLaengste
        ? `Neuer Anlauf: nur an die längste Reihe (${longestLength(g)} Karten).`
        : "Tipp auf + links oder rechts neben einer Reihe."
    }</p>`;
  } else {
    const ref = randKarte(g, g.pick.row, g.pick.side);
    const risiko = g.rows[g.pick.row].length;
    footer =
      `<div class="panel accent"><div class="ph"><h3>Gegen ` +
      `<span class="${isRed(ref) ? "rot" : ""}">${ref.rank}${suitSymbol(ref.suit)}</span>` +
      ` – daneben kostet ${risiko} 🍺</h3></div>` +
      `<div class="tipps">` +
      `<button data-a="tipp" data-t="lower"><b>↓</b>tiefer</button>` +
      `<button data-a="tipp" data-t="equal"><b>=</b>gleich</button>` +
      `<button data-a="tipp" data-t="higher"><b>↑</b>höher</button>` +
      `</div></div>`;
  }

  return `
    ${kopf}
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${sipStrip(g, dran?.id)}
    <div class="felt build">${reihen}</div>
    <div class="actions">${footer}</div>`;
}

/**
 * Was nach einer fertigen Runde unten steht. Online bleibt die Lobby mit
 * demselben Code bestehen - ihr müsst euch nicht neu zusammenfinden, weder für
 * noch eine Runde noch für ein anderes Spiel.
 */
function resultFooter(g) {
  const name = SPIELE.find((s) => s.id === (g.game ?? "bus"))?.name ?? "";
  if (S.mode !== "online") {
    return `<button class="wide" data-a="localAgain">Nochmal spielen 🎉</button>
            <button class="ghost wide" data-a="home">Zurück zum Start</button>`;
  }
  if (g.hostId === S.myId) {
    return `<button class="wide" data-a="againNow">Nochmal ${esc(name)} 🎉</button>
            <button class="secondary wide" data-a="toLobby" style="margin-top:10px">
              Lobby: anderes Spiel wählen</button>
            <p class="sub" style="text-align:center;margin:10px 0 0">Die Lobby
            <strong>${esc(S.lobby?.code ?? "")}</strong> bleibt bestehen.</p>`;
  }
  return `<p class="banner">${esc(playerById(g, g.hostId)?.name ?? "Der Host")} startet die
          nächste Runde. Ihr bleibt zusammen in Lobby
          <strong>${esc(S.lobby?.code ?? "")}</strong>.</p>
          <button class="ghost wide" data-a="leave" style="margin-top:10px">Lobby verlassen</button>`;
}

function resultScreen(g) {
  const ranked = [...g.players].sort((a, b) => b.sips - a.sips);
  const footer = resultFooter(g);

  return `
    <h2>Ergebnis 🏆</h2>
    <p class="sub">Schlucke gesamt</p>
    ${ranked
      .map(
        (p, i) => `
      <div class="result ${i === 0 ? "first" : ""}">
        <span class="rank">${i + 1}</span>
        ${avatar(p)}
        <span class="name">${esc(p.name)}</span>
        <span class="badge">${p.sips}</span>
      </div>`
      )
      .join("")}
    <div style="height:20px"></div>
    <div class="actions">${footer}</div>`;
}

function meBlock(me, active, zusatz = "du bist dran") {
  if (!me) return "";
  const dran = new Set([active].flat().filter(Boolean)).has(me.id);
  return `
    <div class="me">
      <div class="head">
        ${avatar(me)}
        <span class="name">${esc(me.name)}${dran ? ` – ${zusatz}` : ""}</span>
        <span class="badge">${me.sips}</span>
      </div>
      ${handHtml(me)}
    </div>`;
}

// ---------------------------------------------------------------------------
// QR-Code fuer den Lobby-Link
// ---------------------------------------------------------------------------
// Klein und selbstgebaut.
//
// Warum nicht eine fertige Bibliothek? Weil die App ohne Build-Schritt und
// ohne fremde Server auskommen soll. Der Lobby-Link ist immer kurz (rund 30
// Zeichen), deshalb reichen die Versionen 1 bis 4 mit der niedrigsten
// Fehlerkorrektur - das ist ein Bruchteil dessen, was eine komplette
// QR-Bibliothek kann.
//
// Geprueft wird das nicht am Code, sondern am Ergebnis: test-qr.js malt die
// Codes als Bild und laesst sie von einem echten QR-Leser (OpenCV) einlesen.

// Fuer jede Version: [Gesamt-Codewoerter, Datenwoerter bei Stufe L]
// Bis Version 4 gibt es bei Stufe L genau einen Block, das macht es einfach.
const VERSIONEN = [
  null,
  { total: 26, daten: 19 },
  { total: 44, daten: 34 },
  { total: 70, daten: 55 },
  { total: 100, daten: 80 },
];

// Mittelpunkte der Ausrichtungsmuster je Version (Version 1 hat keine).
const AUSRICHTUNG = [null, [], [6, 18], [6, 22], [6, 26]];

// --- Rechnen im Galois-Feld GF(256) ----------------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generatorpolynom fuer n Fehlerkorrektur-Woerter. */
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** Reed-Solomon: aus den Datenwoertern die Fehlerkorrektur-Woerter rechnen. */
function fehlerkorrektur(daten, anzahl) {
  const g = generator(anzahl);
  const rest = new Array(anzahl).fill(0);
  for (const wert of daten) {
    const faktor = wert ^ rest[0];
    rest.shift();
    rest.push(0);
    if (faktor !== 0) {
      for (let i = 0; i < anzahl; i++) rest[i] ^= mul(g[i + 1], faktor);
    }
  }
  return rest;
}

// --- Daten in Bits verpacken ------------------------------------------------

/** Text als UTF-8-Bytes. */
function bytes(text) {
  if (typeof TextEncoder !== "undefined") return [...new TextEncoder().encode(text)];
  return [...unescape(encodeURIComponent(text))].map((c) => c.charCodeAt(0));
}

function datenwoerter(text, version) {
  const roh = bytes(text);
  const platz = VERSIONEN[version].daten;
  const bits = [];
  const schreib = (wert, laenge) => {
    for (let i = laenge - 1; i >= 0; i--) bits.push((wert >> i) & 1);
  };

  schreib(0b0100, 4); // Modus: einzelne Bytes
  schreib(roh.length, 8); // Laengenangabe (bis Version 9: 8 Bit)
  for (const b of roh) schreib(b, 8);

  // Abschluss, dann auf volle Bytes auffuellen
  for (let i = 0; i < 4 && bits.length < platz * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const woerter = [];
  for (let i = 0; i < bits.length; i += 8) {
    woerter.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
  }
  // Rest mit dem vorgeschriebenen Muster fuellen
  const fueller = [0xec, 0x11];
  while (woerter.length < platz) woerter.push(fueller[(woerter.length - Math.ceil(bits.length / 8)) % 2]);
  return woerter;
}

/** Die kleinste Version, in die der Text passt. */
function passendeVersion(text) {
  const laenge = bytes(text).length;
  for (let v = 1; v < VERSIONEN.length; v++) {
    if (2 + laenge <= VERSIONEN[v].daten) return v;
  }
  return null;
}

// --- Das Muster aufbauen ----------------------------------------------------

function leeresRaster(groesse) {
  return {
    feld: Array.from({ length: groesse }, () => new Array(groesse).fill(0)),
    fest: Array.from({ length: groesse }, () => new Array(groesse).fill(false)),
    groesse,
  };
}

function setz(r, x, y, wert, fest = true) {
  if (x < 0 || y < 0 || x >= r.groesse || y >= r.groesse) return;
  r.feld[y][x] = wert ? 1 : 0;
  r.fest[y][x] = fest;
}

/** Die drei grossen Ecken plus ihr weisser Rand. */
function suchmuster(r, x0, y0) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const rand = dx === -1 || dx === 7 || dy === -1 || dy === 7;
      const aussen = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const innen = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      setz(r, x0 + dx, y0 + dy, !rand && (aussen || innen));
    }
  }
}

function grundmuster(version) {
  const groesse = 17 + 4 * version;
  const r = leeresRaster(groesse);

  suchmuster(r, 0, 0);
  suchmuster(r, groesse - 7, 0);
  suchmuster(r, 0, groesse - 7);

  // Taktleisten
  for (let i = 8; i < groesse - 8; i++) {
    setz(r, i, 6, i % 2 === 0);
    setz(r, 6, i, i % 2 === 0);
  }

  // Ausrichtungsmuster
  const mitten = AUSRICHTUNG[version];
  for (const cy of mitten) {
    for (const cx of mitten) {
      const beiSuchmuster =
        (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= groesse - 9) || (cx >= groesse - 9 && cy <= 8);
      if (beiSuchmuster) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          setz(r, cx + dx, cy + dy, ring !== 1);
        }
      }
    }
  }

  // Immer dunkel
  setz(r, 8, groesse - 8, 1);

  // Plaetze fuer die Formatangabe freihalten
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setz(r, i, 8, 0);
      setz(r, 8, i, 0);
    }
  }
  for (let i = 0; i < 8; i++) {
    setz(r, groesse - 1 - i, 8, 0);
    setz(r, 8, groesse - 1 - i, 0);
  }
  return r;
}

/** Die Codewoerter im Zickzack von rechts unten nach oben einfuellen. */
function fuelle(r, woerter) {
  const bits = [];
  for (const w of woerter) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1);

  let bit = 0;
  let hoch = true;
  for (let rechts = r.groesse - 1; rechts > 0; rechts -= 2) {
    if (rechts === 6) rechts--; // die senkrechte Taktleiste ueberspringen
    for (let n = 0; n < r.groesse; n++) {
      const y = hoch ? r.groesse - 1 - n : n;
      for (const x of [rechts, rechts - 1]) {
        if (r.fest[y][x]) continue;
        r.feld[y][x] = bit < bits.length ? bits[bit] : 0;
        bit++;
      }
    }
    hoch = !hoch;
  }
}

const MASKEN = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Formatangabe: Fehlerkorrektur-Stufe L und die Maskennummer, mit BCH-Schutz. */
function formatBits(maske) {
  let wert = (0b01 << 3) | maske; // 01 = Stufe L
  let rest = wert << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rest >> i) & 1) rest ^= 0b10100110111 << (i - 10);
  }
  return ((wert << 10) | rest) ^ 0b101010000010010;
}

function setzeFormat(r, maske) {
  const bits = formatBits(maske);
  const b = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i++) setz(r, 8, i, b(i));
  setz(r, 8, 7, b(6));
  setz(r, 8, 8, b(7));
  setz(r, 7, 8, b(8));
  for (let i = 9; i <= 14; i++) setz(r, 14 - i, 8, b(i));

  for (let i = 0; i <= 7; i++) setz(r, r.groesse - 1 - i, 8, b(i));
  for (let i = 8; i <= 14; i++) setz(r, 8, r.groesse - 15 + i, b(i));
  setz(r, 8, r.groesse - 8, 1);
}

/** Wie unschoen ist dieses Muster? Je kleiner, desto besser lesbar. */
function strafe(feld) {
  const n = feld.length;
  let punkte = 0;

  const reihe = (hol) => {
    for (let a = 0; a < n; a++) {
      let lauf = 1;
      for (let b = 1; b < n; b++) {
        if (hol(a, b) === hol(a, b - 1)) {
          lauf++;
        } else {
          if (lauf >= 5) punkte += lauf - 2;
          lauf = 1;
        }
      }
      if (lauf >= 5) punkte += lauf - 2;
    }
  };
  reihe((y, x) => feld[y][x]);
  reihe((x, y) => feld[y][x]);

  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const s = feld[y][x] + feld[y][x + 1] + feld[y + 1][x] + feld[y + 1][x + 1];
      if (s === 0 || s === 4) punkte += 3;
    }
  }

  const muster = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const gedreht = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const suche = (hol) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 11 <= n; b++) {
        const teil = Array.from({ length: 11 }, (_, i) => hol(a, b + i));
        if (teil.every((v, i) => v === muster[i]) || teil.every((v, i) => v === gedreht[i])) {
          punkte += 40;
        }
      }
    }
  };
  suche((y, x) => feld[y][x]);
  suche((x, y) => feld[y][x]);

  const dunkel = feld.flat().reduce((s, v) => s + v, 0);
  const anteil = (dunkel * 100) / (n * n);
  punkte += Math.floor(Math.abs(anteil - 50) / 5) * 10;
  return punkte;
}

/**
 * Erzeugt die Matrix zum Text: ein Array aus Zeilen, jede Zeile ein Array aus
 * 0 und 1. Gibt null zurueck, wenn der Text zu lang ist.
 */
function qrMatrix(text) {
  const version = passendeVersion(text);
  if (!version) return null;

  const daten = datenwoerter(text, version);
  const ec = fehlerkorrektur(daten, VERSIONEN[version].total - VERSIONEN[version].daten);
  const woerter = [...daten, ...ec];

  let bestes = null;
  let bestePunkte = Infinity;
  for (let maske = 0; maske < 8; maske++) {
    const r = grundmuster(version);
    fuelle(r, woerter);
    for (let y = 0; y < r.groesse; y++) {
      for (let x = 0; x < r.groesse; x++) {
        if (!r.fest[y][x] && MASKEN[maske](x, y)) r.feld[y][x] ^= 1;
      }
    }
    setzeFormat(r, maske);
    const punkte = strafe(r.feld);
    if (punkte < bestePunkte) {
      bestePunkte = punkte;
      bestes = r.feld;
    }
  }
  return bestes;
}

/**
 * Fertiges SVG. `rand` ist die weisse Zone drumherum - ohne die findet kein
 * Leser den Code.
 */
function qrSvg(text, { rand = 3, klasse = "qr" } = {}) {
  const m = qrMatrix(text);
  if (!m) return "";
  const n = m.length;
  const gesamt = n + rand * 2;

  let pfad = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) pfad += `M${x + rand} ${y + rand}h1v1h-1z`;
    }
  }
  return (
    `<svg class="${klasse}" viewBox="0 0 ${gesamt} ${gesamt}" xmlns="http://www.w3.org/2000/svg" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR-Code zur Lobby">` +
    `<rect width="${gesamt}" height="${gesamt}" fill="#fff"/>` +
    `<path d="${pfad}" fill="#000"/></svg>`
  );
}

// ---------------------------------------------------------------------------
// Leberschuss
// ---------------------------------------------------------------------------
//
// Anders als die Kartenspiele lebt Leberschuss auf einem Canvas, und das
// vertraegt sich schlecht mit dem sonstigen Vorgehen ("bei jeder Aenderung das
// ganze HTML neu schreiben"): ein neues Canvas waere jedes Mal leer und der
// vorgebackene Hintergrund weg.
//
// Deshalb gibt es genau EIN Canvas, das ausserhalb der Seite lebt und nach
// jedem Neuzeichnen wieder in seinen Platzhalter gehaengt wird. Zeichner,
// Zielvorgang und laufende Animation haengen daran.

const L = {
  cv: null,        // das dauerhafte Canvas
  zeichner: null,
  zielen: null,    // { nr, phase, t0, richtung, kraft }
  abspielen: null, // laufende Schussanimation
  gezeigt: 0,      // welcher Schuss schon abgespielt wurde
  kamera: null,    // was gerade eingestellt ist
  breite: 0,
  hoehe: 0,
};

/** Wie viele Leute braucht das Spiel? Fuer Knoepfe und Fehlermeldungen. */
function spielerBedarf(id) {
  const g = grenzen(id);
  return g.min === g.max ? `genau ${g.min} Spieler` : `${g.min} bis ${g.max} Spieler`;
}
const passtDieZahl = (id, n) => n >= grenzen(id).min && n <= grenzen(id).max;


/**
 * Wer handelt gerade an diesem Geraet? Online immer ich; lokal wird das Handy
 * herumgereicht, da darf der, der gerade gefragt ist.
 */
const leberIch = (g) => (S.mode === "online" ? S.myId : null);
const leberDarf = (g, action, alsWer) =>
  S.mode === "local" ? mayAct(g, alsWer, action) : mayAct(g, S.myId, action);

function leberScreen(g) {
  const nr = amZugLeber(g);
  const dran = currentPlayerLeber(g);
  const meinPlatz = S.mode === "online" ? platzVon(g, S.myId) : nr;
  const meinTeam = PLAETZE[meinPlatz]?.team ?? null;

  let text = "";
  let knoepfe = "";

  if (g.phase === "finished") {
    text = `<b>${TEAM_NAME[g.sieger]}</b> hat beide Flaschen leer. Gewonnen!`;
  } else if (g.phase === "leer") {
    const wer = g.players[platzVon(g, g.leer.playerId)];
    const gegner = teamPlaetze(1 - teamVon(g, g.leer.playerId));
    const darfIch = leberDarf(g, { type: "leerJa" }, g.players[gegner[0]].id);
    text = `<b>${esc(wer?.name ?? "")}</b> sagt: Flasche leer.`;
    knoepfe = darfIch
      ? `<div class="row">
           <button class="secondary" data-a="leberNein" data-p="${g.players[gegner[0]].id}">Nee</button>
           <button data-a="leberJa" data-p="${g.players[gegner[0]].id}">Stimmt</button>
         </div>`
      : `<p class="sub" style="margin:0">${TEAM_NAME[1 - teamVon(g, g.leer.playerId)]} muss bestätigen.</p>`;
  } else if (g.phase === "verteilen") {
    const dranTeam = g.offen[0] > 0 ? 0 : 1;
    const darfIch = S.mode === "local" || meinTeam === dranTeam;
    const wessen = S.mode === "local" ? dranTeam : meinTeam;

    if (darfIch) {
      const team = S.mode === "local" ? dranTeam : meinTeam;
      text = `<b>${g.offen[team]}</b> ${g.offen[team] === 1 ? "Schluck" : "Schlücke"} – wer trinkt?`;
      knoepfe =
        `<div class="row">` +
        teamPlaetze(team)
          .map((i) => {
            const p = g.players[i];
            const zahl = g.letzte?.verteilt[i] ?? 0;
            return g.fertig[i]
              ? `<button class="secondary" disabled>${esc(p.name)} ist leer</button>`
              : `<button data-a="leberGib" data-p="${p.id}">${esc(p.name)}${
                  zahl ? ` <b>${zahl}</b>` : ""
                }</button>`;
          })
          .join("") +
        `</div>` +
        (g.letzte?.verteilt.some((v) => v > 0)
          ? `<button class="ghost wide" data-a="leberZurueck" data-p="${
              g.players[teamPlaetze(team).find((i) => g.letzte.verteilt[i] > 0)].id
            }">Zurück</button>`
          : "");
    } else {
      text = `${TEAM_NAME[dranTeam]} teilt ${g.offen[dranTeam]} auf.`;
    }
  } else if (g.phase === "rundenende") {
    text = leberSplit(g);
    knoepfe = leberDarf(g, { type: "weiterLeber" }, g.players[0].id)
      ? `<button class="wide" data-a="leberAktion">Weiter</button>`
      : `<p class="sub" style="margin:0">${esc(hostName(g))} klickt weiter.</p>`;
  } else if (meinPlatz !== nr) {
    text = `${avatar(dran, true)} <b>${esc(dran?.name ?? "")}</b> ist dran.`;
  } else if (L.zielen?.phase === "kraft") {
    text = "Kraft stoppen.";
    knoepfe = `<button class="wide stopp" data-a="leberAktion">Stopp</button>`;
  } else if (L.zielen) {
    text = "Pfeil stoppen.";
    knoepfe = `<button class="wide stopp" data-a="leberAktion">Stopp</button>`;
  } else {
    const platz = PLAETZE[nr];
    text = `Du bist dran – ${platz.seite === "nah" ? "vorne" : "hinten"} ${platz.hand}.`;
    knoepfe = `<button class="wide" data-a="leberAktion">Losschnippsen</button>`;
  }

  return `
    <div id="leberBuehne" class="lbuehne"></div>
    <p class="lhinweis">${text}</p>
    ${leberMamaZeile(g)}
    <div class="actions">${knoepfe}${leerKnopf(g)}</div>`;
}

/** Wie die letzten Schlücke aufgeteilt wurden - kurz und für alle sichtbar. */
function leberSplit(g) {
  const v = g.letzte?.verteilt ?? [];
  const teile = [0, 1]
    .filter((t) => teamPlaetze(t).some((i) => v[i] > 0))
    .map((t) => {
      const wer = teamPlaetze(t)
        .filter((i) => v[i] > 0)
        .map((i) => `${esc(g.players[i].name)} ${v[i]}`)
        .join(" · ");
      return `<b>${TEAM_NAME[t]}</b> ${wer}`;
    });
  return teile.length ? teile.join(" &nbsp;|&nbsp; ") : "Nichts getroffen.";
}

/** "Deine Mama" ist die einzige Sache, die eine eigene Zeile wert ist. */
function leberMamaZeile(g) {
  const m = g.letzte?.mama;
  if (!m || (!m[0] && !m[1]) || g.phase === "play" || g.phase === "finished") return "";
  return `<p class="lregel"><b>${TEAM_NAME[m[0] ? 1 : 0]}</b> ext beide Flaschen und macht neue auf.</p>`;
}

/**
 * "Flasche leer" - klein und unaufdringlich, aber immer erreichbar. Lokal
 * stehen alle da, die schon getrunken haben; online nur man selbst.
 */
function leerKnopf(g) {
  if (g.phase === "leer" || g.phase === "finished") return "";

  const wer =
    S.mode === "online"
      ? mayAct(g, S.myId, { type: "flascheLeer" })
        ? [g.players[platzVon(g, S.myId)]]
        : []
      : g.players.filter((p) => mayAct(g, p.id, { type: "flascheLeer" }));
  if (!wer.length) return "";

  return (
    `<div class="lleer">` +
    wer
      .map(
        (p) =>
          `<button class="ghost small" data-a="leberLeer" data-p="${p.id}">🍾 ${
            S.mode === "online" ? "Flasche leer" : esc(p.name) + " leer"
          }</button>`
      )
      .join("") +
    `</div>`
  );
}

/**
 * Das Canvas in den frisch gezeichneten Platzhalter haengen und alles
 * nachziehen. Wird nach jedem render() aufgerufen.
 */
function leberAnbauen(g) {
  const buehne = document.getElementById("leberBuehne");
  if (!buehne) return;

  if (!L.cv) {
    L.cv = document.createElement("canvas");
    L.cv.className = "lfeld";
    L.cv.addEventListener("pointerdown", leberAktion);
  }
  if (L.cv.parentNode !== buehne) buehne.appendChild(L.cv);
  if (!L.zeichner) L.zeichner = macheZeichner(L.cv);

  leberPruefeSchuss(g);
  leberKamera(g);
  leberZeichnen(g);
}

/**
 * Kamera stellen. Waehrend ein Schuss laeuft bleibt sie stehen - sonst
 * sprænge man mitten in der Bewegung in die Draufsicht.
 */
function leberKamera(g) {
  if (L.abspielen) return;
  // Nur beim Schnippsen schaut man von seinem Platz - beim Abrechnen und
  // Aufteilen von oben, da sieht man erst, wo alles liegt.
  const spielt = g.phase === "play";
  const nr = spielt ? amZugLeber(g) : g.reihe[g.reihe.length - 1];
  const art = (spielt ? "spieler" : "oben") + ":" + nr;
  const b = L.cv.getBoundingClientRect();
  if (art === L.kamera && b.width === L.breite && b.height === L.hoehe) return;

  L.kamera = art;
  L.breite = b.width;
  L.hoehe = b.height;
  if (spielt) L.zeichner.kameraSpieler(nr);
  else L.zeichner.kameraOben(nr);
}

function leberZeichnen(g) {
  if (!L.zeichner) return;
  L.zeichner.zeichne({
    korken: L.abspielen?.korken ?? g.korken,
    eigener: g.phase === "play" && !L.abspielen ? amZugLeber(g) : -1,
    zielen: L.zielen,
    getroffen:
      g.phase === "play" || L.abspielen
        ? []
        : (g.letzte?.einzeln ?? []).filter(Boolean).map((w) => w.feld),
  });
}

/**
 * Ist ein Schuss dazugekommen, den wir noch nicht gezeigt haben? Das gilt fuer
 * den eigenen genauso wie fuer die der anderen: aus (Richtung, Kraft) und der
 * Ausgangslage rechnet jedes Handy dieselbe Bahn nach.
 */
function leberPruefeSchuss(g) {
  const n = g.schuss?.nummer ?? 0;
  if (n <= L.gezeigt || L.abspielen) return;
  L.gezeigt = n;
  const bewegung = letzteBewegung(g);
  if (!bewegung) return;
  L.abspielen = { ...bewegung, start: undefined, korken: g.korken };
  requestAnimationFrame(leberLauf);
}

function leberLauf(jetzt) {
  const a = L.abspielen;
  const g = S.game;
  if (!a || !g || g.game !== "leber") {
    L.abspielen = null;
    return;
  }
  if (a.start === undefined) a.start = jetzt;

  const i = Math.max(0, Math.min(Math.round((jetzt - a.start) / 1000 / a.dt), a.bilder.length - 1));
  a.korken = a.bilder[i].map((p, n) => ({ ...g.korken[n], x: p.x, y: p.y, raus: p.raus }));
  leberZeichnen(g);

  if (i >= a.bilder.length - 1) {
    L.abspielen = null;
    return render();
  }
  requestAnimationFrame(leberLauf);
}

/** Der Zielpfeil bzw. der Kraftbalken schwingt. */
function leberSchleife() {
  if (!L.zielen || !S.game) return;
  const seit = performance.now() - L.zielen.t0;
  if (L.zielen.phase === "richtung") {
    L.zielen.richtung = pfeilRichtung(S.game.korken, L.zielen.nr, seit);
  } else {
    L.zielen.kraft = balkenKraft(seit);
  }
  leberZeichnen(S.game);
  requestAnimationFrame(leberSchleife);
}

/** Ein Tipp aufs Feld oder auf den Knopf - beides tut dasselbe. */
function leberAktion() {
  const g = S.game;
  if (!g || g.game !== "leber" || L.abspielen) return;

  if (g.phase === "rundenende") {
    L.zielen = null;
    if (leberDarf(g, { type: "weiterLeber" }, g.players[0].id)) {
      dispatch({ type: "weiterLeber", playerId: g.players[0].id });
    }
    return;
  }
  if (g.phase !== "play") return;

  const nr = amZugLeber(g);
  const meinPlatz = S.mode === "online" ? platzVon(g, S.myId) : nr;
  if (meinPlatz !== nr || g.korken[nr]?.raus) return;

  if (L.zielen) {
    // Wichtig: der Wert wird JETZT aus der Uhr gerechnet, nicht aus dem
    // zuletzt gezeichneten Bild. Sonst entscheidet nicht der Moment des
    // Drueckens, sondern wann der Browser zuletzt zum Zeichnen kam.
    const seit = performance.now() - L.zielen.t0;
    if (L.zielen.phase === "richtung") {
      L.zielen.richtung = pfeilRichtung(g.korken, L.zielen.nr, seit);
      L.zielen.phase = "kraft";
      L.zielen.t0 = performance.now();
      L.zielen.kraft = 0;
      return render();
    }
    const { richtung } = L.zielen;
    const kraft = balkenKraft(seit);
    L.zielen = null;
    dispatch({ type: "schuss", playerId: g.players[nr].id, richtung, kraft });
    return;
  }

  L.zielen = { nr, phase: "richtung", t0: performance.now(), richtung: 0, kraft: 0 };
  leberSchleife();
  render();
}

// ---------------------------------------------------------------------------
// Zeichnen
// ---------------------------------------------------------------------------

function render() {
  let html;
  if (S.screen === "name") html = nameScreen();
  else if (S.screen === "home") html = homeScreen();
  else if (S.screen === "rules") html = rulesScreen();
  else if (S.screen === "setup") html = setupScreen();
  else if (S.screen === "lobby") html = lobbyScreen();
  else if (S.game?.game === "race") {
    const g = S.game;
    if (g.phase === "bets") html = betScreen(g);
    else if (g.phase === "race") html = raceScreen(g);
    else html = raceEndScreen(g);
  } else if (S.game?.game === "build") {
    const g = S.game;
    html = g.phase === "play" ? buildScreen(g) : resultScreen(g);
  } else if (S.game?.game === "leber") {
    html = leberScreen(S.game);
  } else if (S.game) {
    const g = S.game;
    if (g.phase === "guess") html = guessScreen(g);
    else if (g.phase === "rows") html = rowsScreen(g);
    else if (g.phase === "tiebreak") html = tiebreakScreen(g);
    else if (g.phase === "pyramid") html = pyramidScreen(g);
    else html = resultScreen(g);
  } else {
    html = `<p class="sub">Warte auf das Spiel…</p>`;
  }

  if (S.mode === "online" && !S.connected && S.screen === "game") {
    html += `<div class="offline-bar">Keine Verbindung – versuche neu zu verbinden…</div>`;
  }
  el.innerHTML = html;
  if (S.screen === "game" && S.game?.game === "leber") leberAnbauen(S.game);

  clearTimeout(tickTimer);
  if (S.screen === "game" && S.game?.game !== "race" && S.game?.phase === "rows") {
    const rest = warteBis(S.game) - Date.now();
    if (rest > 0) tickTimer = setTimeout(render, Math.min(1000, rest + 60));
  }

  const focusMe = document.getElementById("nameInput") ?? document.getElementById("codeInput");
  if (S.screen === "name") focusMe?.focus();

  // Bin ich gerade neu an der Reihe? Dann einmal laenger brummen. Nur online -
  // lokal reicht man das Handy ja weiter und sieht es sowieso.
  const dran =
    S.mode === "online" &&
    S.screen === "game" &&
    !!S.game &&
    S.game.phase !== "finished" &&
    (wartetAuf(S.game) ?? []).includes(S.myId);
  if (dran && !S.warDran) brumm(150);
  S.warDran = dran;
}

// ---------------------------------------------------------------------------
// Netzwerk
// ---------------------------------------------------------------------------

/** In die Lobby mit dem Code aus S.code. Wird vom Knopf und vom Link benutzt. */
function beitreten() {
  if (S.code.length < 4) {
    S.error = "Bitte den vierstelligen Code eintragen.";
    return render();
  }
  connect().emit("joinLobby", { code: S.code, name: S.name.trim(), avatar: savedAvatar() }, (res) => {
    if (res.ok) Object.assign(S, { myId: res.playerId, lobby: res.lobby, connected: true });
    else S.error = res.error;
    render();
  });
}

function connect() {
  if (S.socket) return S.socket;
  const socket = io();
  S.socket = socket;

  socket.on("connect", () => {
    S.connected = true;
    if (S.lobby && S.myId) socket.emit("rejoin", { code: S.lobby.code, playerId: S.myId });
    render();
  });
  socket.on("disconnect", () => {
    S.connected = false;
    render();
  });
  socket.on("lobby", (lobby) => {
    S.lobby = lobby;
    if (lobby.started && S.screen === "lobby") S.screen = "game";
    render();
  });
  socket.on("game", (game, von) => {
    // Eigene Aktionen hat dieser Browser schon selbst gerechnet. Kommt die
    // Bestätigung für einen älteren Stand, während man schon weitergetippt
    // hat, wird sie weggeworfen - sonst springt die Anzeige zurück.
    if (von && von === S.myId && (game.rev ?? 0) < (S.game?.rev ?? 0)) return;

    // Frische Runde: der Meldungszähler fängt wieder bei null an.
    if ((game.sipLog ?? []).length === 0) S.sipSeen = 0;
    S.game = game;
    S.screen = "game";
    render();
    checkSipToast(game);
  });

  // Runde vorbei, aber die Lobby bleibt: alle zurück in den Warteraum.
  socket.on("backToLobby", () => {
    S.game = null;
    S.sipSeen = 0;
    S.screen = "lobby";
    render();
  });
  // Im Spiel gibt es keine Stelle fuer Fehlertexte - frueher passierte beim
  // Ablehnen eines Zuges einfach gar nichts. Jetzt kommt eine Einblendung.
  socket.on("errorMsg", (msg) => {
    S.error = msg;
    if (S.screen === "game") toast(`<span>⚠️ ${esc(msg)}</span>`, "bad");
    render();
  });
  return socket;
}

function readInputs() {
  const name = document.getElementById("nameInput");
  const code = document.getElementById("codeInput");
  if (name) S.name = name.value;
  if (code) S.code = code.value.toUpperCase();
  document.querySelectorAll("input[data-i]").forEach((inp) => {
    S.names[Number(inp.dataset.i)] = inp.value;
  });
}

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

// Dreht jemand das Handy oder klappt die Tastatur weg, aendert sich die
// Breite - und damit, wie viele Karten nebeneinander passen. Also neu zeichnen.
if (typeof window !== "undefined" && window.addEventListener) {
  let dreh = null;
  window.addEventListener("resize", () => {
    clearTimeout(dreh);
    dreh = setTimeout(() => {
      if (S.screen === "game" && S.game?.game === "build") render();
    }, 120);
  });
}

el.addEventListener("click", (e) => {
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const a = t.dataset.a;
  readInputs();
  S.error = null;

  switch (a) {
    case "leberAktion":
      leberAktion();
      return;

    // Die kleinen Leberschuss-Knoepfe tragen den Spieler im data-p, damit das
    // auch am gemeinsam benutzten Handy eindeutig ist.
    case "leberGib":
      dispatch({ type: "verteileLeber", playerId: t.dataset.p, targetId: t.dataset.p });
      return;
    case "leberZurueck":
      dispatch({ type: "verteilenZurueck", playerId: t.dataset.p, targetId: t.dataset.p });
      return;
    case "leberLeer":
      dispatch({ type: "flascheLeer", playerId: t.dataset.p });
      return;
    case "leberJa":
      dispatch({ type: "leerJa", playerId: t.dataset.p });
      return;
    case "leberNein":
      dispatch({ type: "leerNein", playerId: t.dataset.p });
      return;

    case "saveName":
      if (!S.name.trim()) {
        S.error = "Bitte trag einen Namen ein.";
        break;
      }
      saveName(S.name);
      S.screen = "home";
      // Wer ueber einen Einladungslink kam, soll nach dem Namen direkt in die
      // Lobby - nicht erst wieder durchs Menue klicken.
      if (S.perLink) {
        beitreten();
        return;
      }
      break;

    case "editName":
      S.screen = "name";
      break;

    case "home":
      if (S.mode === "online") {
        S.socket?.emit("leaveLobby");
        S.socket?.disconnect();
        S.socket = null;
      }
      Object.assign(S, { screen: "home", mode: "local", game: null, lobby: null, myId: null });
      break;

    case "local":
      S.mode = "local";
      S.screen = "setup";
      if (!S.names[0]) S.names[0] = S.name; // eigener Name steht schon in Feld 1
      break;

    case "online":
      S.mode = "online";
      S.screen = "lobby";
      connect();
      break;

    // --- Spielauswahl ---
    case "pickGame":
      S.spiel = t.dataset.id;
      // In der Lobby entscheidet der Host für alle - der Server sagt es weiter.
      if (S.mode === "online" && S.lobby) S.socket?.emit("setGame", { spiel: S.spiel });
      break;

    case "pickAvatar":
      saveAvatar(t.dataset.av);
      S.socket?.emit("setAvatar", { avatar: t.dataset.av });
      return;

    case "rules":
      S.rulesFor = t.dataset.id;
      S.screen = "rules";
      break;

    case "rulesBack":
      S.screen = S.mode === "online" ? "lobby" : "setup";
      break;

    case "add":
      if (S.names.length < MAX_PLAYERS) S.names.push("");
      break;
    case "rm":
      S.names.splice(Number(t.dataset.i), 1);
      break;

    case "start": {
      if (!passtDieZahl(S.spiel, S.names.length)) {
        S.error = `${spielName(S.spiel)}: ${spielerBedarf(S.spiel)}`;
        break;
      }
      const players = S.names.map((n, i) => ({ id: "p" + i, name: n.trim() || `Spieler ${i + 1}` }));
      // ohne hostId: am selben Gerät darf jeder aufdecken
      S.game = neuesSpiel(S.spiel, players);
      S.bet = { suit: null, amount: 3 };
      S.screen = "game";
      break;
    }

    case "create":
      connect().emit("createLobby", { name: S.name.trim(), spiel: S.spiel, avatar: savedAvatar() }, (res) => {
        if (res.ok) Object.assign(S, { myId: res.playerId, lobby: res.lobby, connected: true });
        else S.error = res.error;
        render();
      });
      return;

    case "linkKopieren": {
      const link = lobbyLink(S.lobby?.code ?? "");
      navigator.clipboard
        ?.writeText(link)
        .then(() => toast(`<span>Link kopiert – jetzt verschicken 🔗</span>`))
        .catch(() => toast(`<span>Kopieren ging nicht: ${esc(link)}</span>`, "bad"));
      return;
    }
    case "linkTeilen":
      navigator
        .share?.({ title: "Trinkspiele", text: "Komm in die Lobby!", url: lobbyLink(S.lobby?.code ?? "") })
        .catch(() => {
          /* abgebrochen ist kein Fehler */
        });
      return;

    case "join":
      beitreten();
      return;

    case "startOnline":
      S.bet = { suit: null, amount: 3 };
      S.socket?.emit("startGame", { spiel: S.lobby?.spiel ?? S.spiel });
      return;

    case "leave":
      S.socket?.emit("leaveLobby");
      S.socket?.disconnect();
      S.socket = null;
      Object.assign(S, { screen: "home", mode: "local", lobby: null, myId: null, game: null });
      break;

    case "againNow": // gleiche Lobby, sofort dasselbe Spiel nochmal
      S.bet = { suit: null, amount: 3 };
      S.socket?.emit("playAgain", { restart: true });
      return;

    case "toLobby": // gleiche Lobby, zurück in den Warteraum
      S.socket?.emit("playAgain", { restart: false });
      return;

    case "localAgain": {
      const players = S.game.players.map((p) => ({ id: p.id, name: p.name }));
      S.game = neuesSpiel(S.game.game, players);
      S.bet = { suit: null, amount: 3 };
      S.screen = "game";
      break;
    }

    // --- Pferderennen ---
    case "pickHorse":
      S.bet = { ...S.bet, suit: t.dataset.suit };
      break;
    case "betPlus":
      S.bet = { ...S.bet, amount: Math.min(MAX_EINSATZ, S.bet.amount + 1) };
      break;
    case "betMinus":
      S.bet = { ...S.bet, amount: Math.max(MIN_EINSATZ, S.bet.amount - 1) };
      break;
    case "betSet":
      S.bet = { ...S.bet, amount: Number(t.dataset.n) };
      break;

    case "placeBet": {
      // Lokal setzt der Reihe nach, wer noch keine Wette hat.
      const wer =
        S.mode === "local"
          ? S.game.players.find((p) => !S.game.bets[p.id])?.id
          : S.myId;
      if (!wer || !S.bet.suit) break;
      dispatch({ type: "bet", playerId: wer, suit: S.bet.suit, amount: S.bet.amount });
      S.bet = { suit: null, amount: 3 };
      break;
    }

    case "startRace":
      return dispatch({ type: "startRace" });
    case "flip":
      return dispatch({ type: "flip" });

    // Spielzüge
    case "guess":
      return dispatch({ type: "guess", value: t.dataset.v });
    // `playerId` braucht nur das lokale Spiel - online setzt der Server den
    // Absender selbst, damit niemand fuer einen anderen bauen kann.
    case "spot":
      return dispatch({
        type: "pickSpot",
        playerId: meId(),
        row: Number(t.dataset.row),
        side: t.dataset.side,
      });
    case "tipp":
      return dispatch({ type: "guessBuild", playerId: meId(), tipp: t.dataset.t });
    case "weiter":
      return dispatch({ type: "weiterBuild", playerId: meId() });
    case "undo":
      return dispatch({ type: "undoSip", fromId: t.dataset.from, targetId: t.dataset.id });
    case "sip":
      // `fromId` sagt, wessen Schlucke verteilt werden - online prüft der
      // Server das ohnehin nochmal gegen den echten Absender.
      return dispatch({ type: "handOutSip", targetId: t.dataset.id, fromId: t.dataset.from });
    case "reveal":
      return dispatch({ type: "revealRow" });
    case "discard":
      return dispatch({ type: "discard", playerId: t.dataset.id });
    case "next":
      return dispatch({ type: "nextRow" });
    case "tieFlip":
      return dispatch({ type: "tiebreakFlip" });
    case "tieDraw":
      return dispatch({ type: "tiebreakDraw" });
    case "tieGo":
      return dispatch({ type: "tiebreakGo" });
    case "pyr":
      return dispatch({ type: "pickPyramid", index: Number(t.dataset.i) });
    case "restart":
      return dispatch({ type: "restartPyramid" });
    case "finish":
      return dispatch({ type: "finish" });
  }
  render();
});

// Enter im Namensfeld schickt ab.
el.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "nameInput" && S.screen === "name") {
    readInputs();
    if (S.name.trim()) {
      saveName(S.name);
      S.screen = "home";
      render();
      if (S.perLink) beitreten();
    }
  }
});

/**
 * Beitreten per Link: .../?c=ARJV
 *
 * Der Code wird herausgezogen und die Adresse gleich wieder saubergemacht -
 * sonst landet man beim Neuladen immer wieder in derselben alten Lobby.
 */
S.code = (() => {
  try {
    const c = new URLSearchParams(location.search).get("c") ?? "";
    return c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  } catch {
    return "";
  }
})();

if (S.code.length === 4) {
  S.perLink = true;
  S.mode = "online";
  S.screen = savedName() ? "lobby" : "name";
  try {
    history.replaceState(null, "", location.pathname);
  } catch {
    /* nicht schlimm, dann steht der Code eben noch in der Adresszeile */
  }
}

render();

// Name schon bekannt? Dann direkt rein, ohne dass jemand noch etwas tippen muss.
if (S.perLink && savedName()) beitreten();
