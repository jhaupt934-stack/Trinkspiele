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
  allowedPyramidIndices,
  sipTargets,
  pendingFor,
  pendingTotal,
  distributorIds,
  activePlayerId,
  playerById,
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
import { applyAction, mayAct } from "/game/actions.js";
import { isRed, suitSymbol, suitName } from "/game/deck.js";

// ---------------------------------------------------------------------------
// Die Spiele: Name, Symbol, Regeltext
// ---------------------------------------------------------------------------
// Steht bewusst hier drin und nicht in einer eigenen Datei - je weniger
// Dateien, desto weniger kann beim Hochladen schiefgehen.

const SPIELE = [
  { id: "bus", emoji: "🚌", name: "Busfahren", kurz: "ca. 15 Min." },
  { id: "race", emoji: "🐎", name: "Pferderennen", kurz: "ca. 5 Min." },
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
    <strong>Bild (Bube, Dame, König):</strong> so viele Schlücke wie die Reihe
    hoch ist, alles wieder zudecken, von vorne – auch an der Spitze.</p>
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
};
const regelnHtml = (id) => REGELN[id] ?? "<p>Für dieses Spiel gibt es noch keine Erklärung.</p>";

const el = document.getElementById("app");

// Der Name wird im Browser gespeichert und beim naechsten Oeffnen
// automatisch wieder benutzt.
const NAME_KEY = "trinkspiele.name";
const savedName = () => (localStorage.getItem(NAME_KEY) ?? "").trim();
const saveName = (n) => localStorage.setItem(NAME_KEY, n.trim());

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
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen zum Zeichnen
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Jeder Name bekommt dauerhaft dieselbe Farbe.
const AV_COLORS = ["#FF5FA2", "#8B5CF6", "#2EE6C5", "#FFC93C", "#FF9F43", "#5BC0FF", "#A0E85B", "#FF7A7A"];
function avatarColor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return AV_COLORS[h % AV_COLORS.length];
}
const avatar = (name, small) =>
  `<span class="av${small ? " sm" : ""}" style="background:${avatarColor(name)}">${esc(
    (name || "?").trim().charAt(0).toUpperCase()
  )}</span>`;

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
  const sym = suitSymbol(card.suit);
  return (
    `<div class="${cls.join(" ")}"${style} ${data}>` +
    `<span class="corner tl">${card.rank}<span>${sym}</span></span>` +
    `<span class="pip">${sym}</span>` +
    `<span class="corner br">${card.rank}<span>${sym}</span></span>` +
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
                  const off = i - (p.cards.length - 1) / 2;
                  return cardHtml(c, "xs", {
                    style: `transform: perspective(400px) rotateX(14deg) rotate(${(off * 4).toFixed(1)}deg)`,
                  });
                })
                .join("");
        return (
          `<div class="seat ${activeIds.has(p.id) ? "active" : ""}">` +
          `<div class="head">${avatar(p.name, true)}<span class="name">${esc(p.name)}</span>` +
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
function toast(html) {
  let box = document.querySelector(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast";
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
  }
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

function dispatch(action) {
  if (S.mode === "online") {
    S.socket?.emit("action", action);
    return;
  }
  S.game = applyAction(S.game, action);
  render();
}

/** Wer sitzt unten am Tisch? Online ich, lokal wer gerade dran ist. */
function meId() {
  if (S.mode === "online") return S.myId;
  if (!S.game) return null;
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
    </div>`;
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

function rulesScreen() {
  const s = SPIELE.find((x) => x.id === S.rulesFor) ?? SPIELE[0];
  return `
    <h2>${s.emoji} ${esc(s.name)}</h2>
    <div class="rules">${regelnHtml(s.id)}</div>
    <div class="actions">
      <button class="wide" data-a="rulesBack">Alles klar</button>
    </div>`;
}

/** Die auffällige Zeile ganz oben: wer ist dran? */
function turnBar(text, ichBinDran) {
  return `<div class="turn ${ichBinDran ? "me" : ""}">${text}</div>`;
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
    <div class="actions">
      <div class="row">
        <button class="secondary" data-a="rules" data-id="${S.spiel}">📖 Regeln</button>
        <button data-a="start">${spielEmoji(S.spiel)} Los geht's</button>
      </div>
      <button class="ghost wide" data-a="home">Zurück</button>
    </div>`;
}

function lobbyScreen() {
  // Warteraum
  if (S.lobby) {
    const me = S.lobby.players.find((p) => p.id === S.myId);
    const binHost = !!me?.isHost;
    const enough = S.lobby.players.length >= MIN_PLAYERS;
    const spiel = S.lobby.spiel ?? "bus";

    return `
      <h2>Eure Lobby</h2>
      <div class="codebox"><div class="code">${S.lobby.code}</div></div>

      ${!S.connected ? `<p class="error">Verbindung unterbrochen…</p>` : ""}
      <p class="label">Dabei (${S.lobby.players.length})</p>
      ${S.lobby.players
        .map(
          (p) => `
        <div class="player-row">
          ${avatar(p.name)}
          <span class="name">${esc(p.name)}${p.id === S.myId ? " (du)" : ""}</span>
          ${p.isHost ? `<span class="tag-host">Host</span>` : ""}
          ${!p.connected ? `<span style="color:var(--danger);font-size:12px">offline</span>` : ""}
        </div>`
        )
        .join("")}

      <p class="label">${binHost ? "Spiel wählen" : "Spiel"}</p>
      ${gamePicker(spiel, binHost)}
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}

      <div class="actions">
        ${
          binHost
            ? `<div class="row">
                 <button class="secondary" data-a="rules" data-id="${spiel}">📖 Regeln</button>
                 <button data-a="startOnline" ${enough ? "" : "disabled"}>${
                 enough ? `${spielEmoji(spiel)} Starten` : `Min. ${MIN_PLAYERS} Spieler`
               }</button>
               </div>`
            : `<div class="row">
                 <button class="secondary" data-a="rules" data-id="${spiel}">📖 Regeln</button>
                 <button class="secondary" disabled>Host startet…</button>
               </div>`
        }
        <button class="ghost wide" data-a="leave">Lobby verlassen</button>
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

/** Das Verteil-Feld fuer einen bestimmten Spieler. */
function handOutPanel(g, fromId) {
  const n = pendingFor(g, fromId);
  if (n === 0) return "";
  const from = playerById(g, fromId);
  const wer = S.mode === "local" ? `${esc(from.name)}: noch ` : "Noch ";

  return `
    <div class="panel accent">
      <h3>${wer}${n} Schluck${n > 1 ? "e" : ""} verteilen 🍺</h3>
      <p class="hint">Tipp auf den, der trinken soll. An dich selbst geht nicht.
      Die anderen erfahren es erst, wenn du fertig verteilt hast.</p>
      <div class="tiles">
        ${sipTargets(g, fromId)
          .map(
            (p) =>
              `<button class="tile" data-a="sip" data-id="${p.id}" data-from="${fromId}">${avatar(p.name)}` +
              `<span style="flex:1">${esc(p.name)}</span><span class="badge">${p.sips}</span></button>`
          )
          .join("")}
      </div>
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

  return `
    ${turnBar(dranText, ichDran)}
    <h2>${ROUND_TITLES[g.round]}</h2>
    <p class="sub">${sips} Schluck${sips > 1 ? "e" : ""}</p>
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
        ${matches.length === 0 ? `<p class="hint" style="margin:0">Niemand hat diesen Wert.</p>` : ""}
        ${meine
          .map(
            (p) =>
              `<button class="accent wide" data-a="discard" data-id="${p.id}" style="margin-bottom:8px">` +
              `${S.mode === "local" ? esc(p.name) + ": " : ""}Karte ablegen</button>`
          )
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

  // 3. Aufdecken bzw. weiterblaettern - erst wenn alle fertig verteilt haben.
  let steuerung;
  if (!g.revealedNow) {
    steuerung = binHost
      ? `<button class="wide" data-a="reveal" ${offen ? "disabled" : ""}>Karte aufdecken (${
          g.cursor + 1
        } von 8)</button>`
      : `<p class="banner">${esc(hostName(g))} deckt die nächste Karte auf.</p>`;
  } else {
    steuerung = binHost
      ? `<button class="secondary wide" data-a="next" ${offen ? "disabled" : ""}>Weiter</button>`
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

  return `
    ${turnBar(dranText, meinePendings || matches.some((p) => p.id === meId()) || binHost)}
    <h2>Die zwei Reihen</h2>
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
    ${turnBar(darf ? "Du deckst auf" : `${esc(hostName(g))} deckt auf`, darf)}
    <h2>Stechen ⚔️</h2>
    <p class="sub">${esc(namen.join(" gegen "))}</p>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, null)}
    <div class="felt">${mitte}</div>
    ${meBlock(me, null)}
    <div class="actions">${
      darf ? knopf : `<p class="banner">${esc(hostName(g))} deckt auf.</p>`
    }</div>`;
}

function pyramidScreen(g) {
  const me = g.players.find((p) => p.id === meId());
  const others = g.players.filter((p) => p.id !== meId());
  const driver = g.players.find((p) => p.id === g.driverId);
  const level = g.path.length;
  const allowed = allowedPyramidIndices(g);
  const iDrive = g.driverId === meId() || S.mode === "local";

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
      : `<p class="banner">${esc(driver.name)} fährt Bus. Zuschauen und mittrinken.</p>`;
  }

  return `
    ${turnBar(iDrive ? "Du fährst Bus 🚌" : `${esc(driver.name)} fährt Bus 🚌`, iDrive)}
    <h2>Die Pyramide</h2>
    <p class="sub">Reihe ${Math.min(level + 1, 5)} von 5 · Versuch ${g.attempts} ·
       ${g.deck.length} Karten</p>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, driver.id)}
    <div class="felt">${pyramid}</div>
    ${meBlock(me, driver.id)}
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
          `<span class="bet ${p.id === meId() ? "mine" : ""}">${avatar(p.name, true)}` +
          `<span>${esc(p.name)}</span><b>${g.bets[p.id].amount}</b></span>`
      )
      .join("") +
    `</div>`
  );
}

/** Ein Ass als Spielkarte - die Farbe ist das Pferd. */
const horseCard = (suit, size = "s") =>
  `<div class="card ${size} ${suitCls(suit)}">` +
  `<span class="corner tl">A<span>${suitSymbol(suit)}</span></span>` +
  `<span class="pip">${suitSymbol(suit)}</span>` +
  `<span class="corner br">A<span>${suitSymbol(suit)}</span></span></div>`;

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
        <p class="hint">${
          entwurf
            ? "Wie viele Schlücke? Die trinkst du sofort – zurück geht dann nichts mehr."
            : "Erst ein Pferd antippen, dann den Einsatz."
        }</p>
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
    ${turnBar(dranText, S.mode === "local" || (!meine && fehlen.length > 0))}
    <h2>Wetten 🐎</h2>
    <p class="sub">Einsatz sofort trinken. Gewinnt dein Pferd, verteilst du das Doppelte.</p>
    <div class="horses">${pferde}</div>
    <div class="actions">${footer}</div>`;
}

function raceScreen(g) {
  const binHost = S.mode === "local" || g.hostId === S.myId;

  // Kopfzeile: die Streckenkarten sitzen neben den Feldern 1 bis 5.
  const kopf =
    `<div class="lane head"><span class="slot start"></span>` +
    Array.from({ length: ZIEL }, (_, i) => {
      const feld = i + 1;
      if (feld > STRECKENKARTEN) return `<span class="slot"><span class="flag">🏁</span></span>`;
      const s = g.side[feld - 1];
      return `<span class="slot">${cardHtml(s.card, "xs", { faceDown: !s.revealed })}</span>`;
    }).join("") +
    `</div>`;

  const bahnen = HORSE_ORDER.map((suit) => {
    const pos = g.horses[suit];
    const felder = Array.from({ length: ZIEL + 1 }, (_, i) => {
      const hier = i === pos;
      return `<span class="slot ${i === 0 ? "start" : ""} ${hier ? "on" : ""}">${
        hier ? horseCard(suit, "xs") : ""
      }</span>`;
    }).join("");
    return `
      <div class="lane ${g.winner === suit ? "win" : ""} ${
      g.lastMove?.suit === suit ? "moved" : ""
    }">${felder}</div>
      ${betChips(g, suit)}`;
  }).join("");

  const gezogen = g.flipped
    ? `<div class="drawn">${cardHtml(g.flipped, "m")}<span class="note">${suitName(
        g.flipped.suit
      )} zieht vor</span></div>`
    : `<div class="drawn">${cardHtml(null, "m", { faceDown: true })}<span class="note">Noch keine Karte</span></div>`;

  const footer = binHost
    ? `<button class="wide" data-a="flip">Nächste Karte aufdecken</button>`
    : `<p class="banner">${esc(playerById(g, g.hostId)?.name ?? "Der Host")} deckt auf.</p>`;

  const hostName = playerById(g, g.hostId)?.name ?? "Host";
  return `
    ${turnBar(binHost ? "Du deckst auf" : `${esc(hostName)} deckt auf`, binHost)}
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    <div class="track">${kopf}${bahnen}</div>
    ${gezogen}
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
          <span class="rank">${i + 1}</span>${avatar(p.name)}
          <span class="name">${esc(p.name)}</span>
          <span class="badge">${p.sips}</span>
        </div>`
            )
            .join("")
        : ""
    }
    <div class="actions">${footer}</div>`;
}

/**
 * Was nach einer fertigen Runde unten steht. Online bleibt die Lobby mit
 * demselben Code bestehen - ihr müsst euch nicht neu zusammenfinden, weder für
 * noch eine Runde noch für ein anderes Spiel.
 */
function resultFooter(g) {
  const name = SPIELE.find((s) => s.id === (g.game === "race" ? "race" : "bus"))?.name ?? "";
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
        ${avatar(p.name)}
        <span class="name">${esc(p.name)}</span>
        <span class="badge">${p.sips}</span>
      </div>`
      )
      .join("")}
    <div style="height:20px"></div>
    <div class="actions">${footer}</div>`;
}

function meBlock(me, active) {
  if (!me) return "";
  const dran = new Set([active].flat().filter(Boolean)).has(me.id);
  return `
    <div class="me">
      <div class="head">
        ${avatar(me.name)}
        <span class="name">${esc(me.name)}${dran ? " – du bist dran" : ""}</span>
        <span class="badge">${me.sips}</span>
      </div>
      ${handHtml(me)}
    </div>`;
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

  const focusMe = document.getElementById("nameInput") ?? document.getElementById("codeInput");
  if (S.screen === "name") focusMe?.focus();
}

// ---------------------------------------------------------------------------
// Netzwerk
// ---------------------------------------------------------------------------

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
  socket.on("game", (game) => {
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
  socket.on("errorMsg", (msg) => {
    S.error = msg;
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

el.addEventListener("click", (e) => {
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const a = t.dataset.a;
  readInputs();
  S.error = null;

  switch (a) {
    case "saveName":
      if (!S.name.trim()) {
        S.error = "Bitte trag einen Namen ein.";
        break;
      }
      saveName(S.name);
      S.screen = "home";
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
      const players = S.names.map((n, i) => ({ id: "p" + i, name: n.trim() || `Spieler ${i + 1}` }));
      // ohne hostId: am selben Gerät darf jeder aufdecken
      S.game = S.spiel === "race" ? initRace(players) : initGame(players);
      S.bet = { suit: null, amount: 3 };
      S.screen = "game";
      break;
    }

    case "create":
      connect().emit("createLobby", { name: S.name.trim(), spiel: S.spiel }, (res) => {
        if (res.ok) Object.assign(S, { myId: res.playerId, lobby: res.lobby, connected: true });
        else S.error = res.error;
        render();
      });
      return;

    case "join":
      if (S.code.length < 4) {
        S.error = "Bitte den vierstelligen Code eintragen.";
        break;
      }
      connect().emit("joinLobby", { code: S.code, name: S.name.trim() }, (res) => {
        if (res.ok) Object.assign(S, { myId: res.playerId, lobby: res.lobby, connected: true });
        else S.error = res.error;
        render();
      });
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
      S.game = S.game.game === "race" ? initRace(players) : initGame(players);
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
    }
  }
});

render();
