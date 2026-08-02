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
  distributorId,
  activePlayerId,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "/game/engine.js";
import { applyAction, mayAct } from "/game/actions.js";
import { isRed, suitSymbol } from "/game/deck.js";

const el = document.getElementById("app");

// Der Name wird im Browser gespeichert und beim naechsten Oeffnen
// automatisch wieder benutzt.
const NAME_KEY = "trinkspiele.name";
const savedName = () => (localStorage.getItem(NAME_KEY) ?? "").trim();
const saveName = (n) => localStorage.setItem(NAME_KEY, n.trim());

const S = {
  screen: savedName() ? "home" : "name", // name | home | setup | lobby | game
  mode: "local", // local | online
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

function seatsHtml(players, activeId) {
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
          `<div class="seat ${p.id === activeId ? "active" : ""}">` +
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

    <h1>Busfahren 🃏</h1>
    <p class="sub">Karten raten, zwei Reihen, dann die Pyramide. 2 bis 8 Spieler.</p>

    <div class="stack">
      <button data-a="online">🌍 Online mit Freunden</button>
      <button class="secondary" data-a="local">📱 Alle an einem Handy</button>
    </div>

    <p class="sub" style="margin-top:22px">
      <strong>Online:</strong> Du erstellst eine Lobby und bekommst einen Code.
      Deine Freunde öffnen denselben Link, tippen den Code ein – und jeder sieht
      seine eigenen Karten groß vor sich.<br><br>
      <strong>An einem Handy:</strong> Ihr reicht ein Gerät reihum weiter.
    </p>`;
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
    <p class="sub">Namen eintragen, dann wird reihum weitergereicht.</p>
    ${rows}
    ${S.names.length < MAX_PLAYERS ? `<button class="secondary wide" data-a="add">+ Spieler</button>` : ""}
    <div style="height:20px"></div>
    <button class="wide" data-a="start">Los geht's 🎉</button>
    <button class="ghost wide" data-a="home">Zurück</button>`;
}

function lobbyScreen() {
  // Warteraum
  if (S.lobby) {
    const me = S.lobby.players.find((p) => p.id === S.myId);
    const enough = S.lobby.players.length >= MIN_PLAYERS;
    return `
      <h2>Eure Lobby</h2>
      <p class="sub">Diesen Code an deine Freunde weitergeben:</p>
      <div class="codebox"><div class="code">${S.lobby.code}</div></div>
      ${!S.connected ? `<p class="error">Verbindung unterbrochen, versuche neu zu verbinden…</p>` : ""}
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
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
      <div style="height:20px"></div>
      ${
        me?.isHost
          ? `<button class="wide" data-a="startOnline" ${enough ? "" : "disabled"}>${
              enough ? "Spiel starten 🎉" : `Warte auf Spieler (min. ${MIN_PLAYERS})`
            }</button>`
          : `<p class="banner">Der Host startet das Spiel.</p>`
      }
      <button class="ghost wide" data-a="leave">Lobby verlassen</button>`;
  }

  // Erstellen oder beitreten - der Name steht ja schon fest
  return `
    <h2>Online mit Freunden</h2>
    <p class="sub">Du spielst als <strong>${esc(S.name)}</strong>.</p>

    <button class="wide" data-a="create">Neue Lobby erstellen</button>

    <p class="sub" style="text-align:center;margin:22px 0 12px">oder einer Lobby beitreten</p>
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

function handOutPanel(g) {
  const targets = sipTargets(g);
  const from = g.players.find((p) => p.id === distributorId(g));
  const mine = canAct({ type: "handOutSip", targetId: targets[0]?.id ?? "" });

  if (!mine) {
    return `<p class="banner">${esc(from?.name ?? "Jemand")} verteilt noch ${g.pendingSips} Schluck${
      g.pendingSips > 1 ? "e" : ""
    }.</p>`;
  }
  return `
    <div class="panel accent">
      <h3>Noch ${g.pendingSips} Schluck${g.pendingSips > 1 ? "e" : ""} verteilen 🍺</h3>
      <p class="hint">Tipp auf den, der trinken soll. An dich selbst geht nicht.</p>
      <div class="tiles">
        ${targets
          .map(
            (p) =>
              `<button class="tile" data-a="sip" data-id="${p.id}">${avatar(p.name)}` +
              `<span style="flex:1">${esc(p.name)}</span><span class="badge">${p.sips}</span></button>`
          )
          .join("")}
      </div>
    </div>`;
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

  let footer;
  if (g.pendingSips > 0) footer = handOutPanel(g);
  else if (canAct({ type: "guess", value: "red" }))
    footer = `<div class="row" style="margin-top:16px">${options
      .map(([label, v]) => `<button data-a="guess" data-v="${v}">${label}</button>`)
      .join("")}</div>`;
  else footer = `<p class="banner">${esc(turn.name)} ist dran.</p>`;

  return `
    <h2>${ROUND_TITLES[g.round]}</h2>
    <p class="sub">Richtig = ${sips} verteilen, falsch = ${sips} selber trinken</p>
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
  const myMatch = matches.find((p) => p.id === meId());

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

  let footer;
  if (g.pendingSips > 0) {
    footer = handOutPanel(g);
  } else if (!g.revealedNow) {
    footer = canAct({ type: "revealRow" })
      ? `<button class="wide" data-a="reveal">Karte aufdecken (${g.cursor + 1} von 8)</button>`
      : `<p class="banner">${esc(hostName(g))} deckt die nächste Karte auf.</p>`;
  } else {
    const inner =
      matches.length === 0
        ? `<p class="hint">Niemand hat diesen Wert.</p>`
        : myMatch
        ? `<button class="accent wide" data-a="discard" data-id="${myMatch.id}">Karte ablegen</button>`
        : `<p class="hint">Passt bei: ${matches.map((p) => esc(p.name)).join(", ")}</p>`;
    footer = `
      <div class="panel">
        <h3>${cur?.card.card.rank} – ${cur?.kind === "drink" ? "selber trinken" : "verteilen"}, ${
      cur?.card.value
    } Schluck${cur?.card.value > 1 ? "e" : ""}</h3>
        ${inner}
      </div>
      ${
        canAct({ type: "nextRow" })
          ? `<button class="secondary wide" data-a="next">Weiter</button>`
          : `<p class="banner">${esc(hostName(g))} blättert weiter.</p>`
      }`;
  }

  return `
    <h2>Die zwei Reihen</h2>
    <p class="sub">Gleicher Kartenwert = ablegen. Wenig Karten ist gut.</p>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, g.pendingFromId)}
    <div class="felt">
      <span class="tag drink">Selber trinken</span>
      ${line(g.drinkRow, "drink")}
      <span class="tag give">Verteilen</span>
      ${line(g.giveRow, "give")}
    </div>
    ${meBlock(me, g.pendingFromId)}
    <div class="actions">${footer}</div>`;
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
    footer = `<p class="success">🎉 Oben angekommen! ${esc(driver.name)} ist raus.</p>
              <button class="wide" data-a="finish">Ergebnis anzeigen</button>`;
  } else if (g.failedAt) {
    footer = iDrive
      ? `<button class="accent wide" data-a="restart">Neue Pyramide, von unten</button>`
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
    <h2>Die Pyramide 🚌</h2>
    <p class="sub">${esc(driver.name)} fährt Bus – Reihe ${Math.min(level + 1, 5)} von 5, Versuch ${g.attempts}</p>
    ${g.message ? `<p class="msg">${esc(g.message)}</p>` : ""}
    ${seatsHtml(others, driver.id)}
    <div class="felt">${pyramid}</div>
    ${meBlock(me, driver.id)}
    <div class="actions">${footer}</div>`;
}

function resultScreen(g) {
  const ranked = [...g.players].sort((a, b) => b.sips - a.sips);
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
    <div style="height:24px"></div>
    <button class="wide" data-a="home">Nochmal spielen</button>`;
}

function meBlock(me, activeId) {
  if (!me) return "";
  return `
    <div class="me">
      <div class="head">
        ${avatar(me.name)}
        <span class="name">${esc(me.name)}${me.id === activeId ? " – du bist dran" : ""}</span>
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
  else if (S.screen === "setup") html = setupScreen();
  else if (S.screen === "lobby") html = lobbyScreen();
  else if (S.game) {
    const g = S.game;
    if (g.phase === "guess") html = guessScreen(g);
    else if (g.phase === "rows") html = rowsScreen(g);
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
    S.game = game;
    S.screen = "game";
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
      // Der eigene Name steht schon in Feld 1.
      if (!S.names[0]) S.names[0] = S.name;
      break;

    case "online":
      S.mode = "online";
      S.screen = "lobby";
      connect();
      break;

    case "add":
      if (S.names.length < MAX_PLAYERS) S.names.push("");
      break;
    case "rm":
      S.names.splice(Number(t.dataset.i), 1);
      break;

    case "start": {
      const players = S.names.map((n, i) => ({ id: "p" + i, name: n.trim() || `Spieler ${i + 1}` }));
      S.game = initGame(players); // ohne hostId: am selben Geraet darf jeder aufdecken
      S.screen = "game";
      break;
    }

    case "create":
      connect().emit("createLobby", { name: S.name.trim() }, (res) => {
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
      S.socket?.emit("startGame");
      return;

    case "leave":
      S.socket?.emit("leaveLobby");
      S.socket?.disconnect();
      S.socket = null;
      Object.assign(S, { screen: "home", mode: "local", lobby: null, myId: null, game: null });
      break;

    // Spielzüge
    case "guess":
      return dispatch({ type: "guess", value: t.dataset.v });
    case "sip":
      return dispatch({ type: "handOutSip", targetId: t.dataset.id });
    case "reveal":
      return dispatch({ type: "revealRow" });
    case "discard":
      return dispatch({ type: "discard", playerId: t.dataset.id });
    case "next":
      return dispatch({ type: "nextRow" });
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
