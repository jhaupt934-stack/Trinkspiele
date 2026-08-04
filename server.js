// Trinkspiele-Server.
//
// Macht zwei Dinge in einem:
//   1. Er liefert die Web-Seite aus (Ordner public/ und game/)
//   2. Er verwaltet die Online-Lobbys und haelt den Spielstand
//
// Dadurch braucht ihr nur einen einzigen Link. Lobbys leben im Arbeitsspeicher -
// sie sind kurzlebig, eine Datenbank waere hier unnoetiger Ballast.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

import { initGame, MIN_PLAYERS, MAX_PLAYERS } from "./game/engine.js";
import { initRace } from "./game/race.js";
import { initBuild } from "./game/build.js";
import { initLeber } from "./game/leber.js";
import { grenzen, handleAction, ueberspringen, wartetAuf } from "./game/actions.js";

/** Welche Spiele es gibt. Ein neues Spiel braucht hier nur eine Zeile mehr. */
const SPIELE = { bus: initGame, race: initRace, build: initBuild, leber: initLeber };
const istSpiel = (s) => Object.prototype.hasOwnProperty.call(SPIELE, s);

// Profilbilder: Gesichter mit verschiedenen Hauttoenen, Frisuren und Baerten,
// damit man sie am Tisch sofort auseinanderhaelt.
// Dieselbe Liste steht in public/app.js - test-ui.js prueft, dass beide gleich sind.
const AVATARE = [
  "👩🏻‍🦰", "🧔🏻", "👱🏼", "👨🏻‍🦲",
  "👩🏼‍🦱", "🧔🏽", "👨🏽", "👩🏽",
  "👳🏽", "🧕🏽", "👨🏾‍🦱", "👩🏾",
  "🧔🏿", "👩🏿‍🦳", "👨🏿‍🦲", "👵🏼",
];

/**
 * So lange darf jemand weg sein, bevor die Runde ohne ihn weitergeht.
 * Kurz genug, dass keiner ewig auf ein totes Handy wartet - lang genug, dass
 * ein Tunnel oder ein Anruf nicht gleich den Zug kostet.
 */
const WEG_MS = 30_000;
const PRUEF_MS = 5_000;

/** Das erste Bild, das in dieser Lobby noch keiner hat. */
function freiesAvatar(lobby) {
  const belegt = new Set(lobby.players.map((p) => p.avatar));
  return AVATARE.find((a) => !belegt.has(a)) ?? AVATARE[0];
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const IDLE_MS = 3 * 60 * 60 * 1000;

// Keine leicht verwechselbaren Zeichen (kein O/0, kein I/1).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ---------------------------------------------------------------------------
// Statische Dateien
// ---------------------------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (rel === "/") rel = "/index.html";

  // game/ wird direkt ausgeliefert, alles andere kommt aus public/
  const base = rel.startsWith("/game/") ? ROOT : path.join(ROOT, "public");
  const file = path.normalize(path.join(base, rel));

  // Kein Ausbrechen aus den freigegebenen Ordnern.
  if (!file.startsWith(path.join(ROOT, "public")) && !file.startsWith(path.join(ROOT, "game"))) {
    res.writeHead(403).end("Verboten");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Nicht gefunden");
    return;
  }
  // Seite, Skripte und Stile duerfen NICHT im Handy haengen bleiben, sonst
  // spielt ihr nach einem Update noch tagelang die alte Fassung. "no-cache"
  // heisst: darf gespeichert werden, aber vor jeder Benutzung nachfragen.
  // Bilder aendern sich praktisch nie, die bleiben ein Jahr liegen.
  const ext = path.extname(file);
  const frisch = [".html", ".js", ".css", ".webmanifest"].includes(ext);

  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": frisch ? "no-cache" : "public, max-age=31536000",
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, lobbies: lobbies.size }));
    return;
  }
  serveStatic(req, res);
});

// ---------------------------------------------------------------------------
// Lobbys
// ---------------------------------------------------------------------------

/** code -> { code, players, sockets, game, lastActivity } */
const lobbies = new Map();

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (lobbies.has(code));
  return code;
}

const lobbyView = (l) => ({
  code: l.code,
  players: l.players,
  started: l.game !== null,
  spiel: l.spiel,
});

function findBySocket(socketId) {
  for (const lobby of lobbies.values()) {
    for (const [playerId, sid] of lobby.sockets) {
      if (sid === socketId) return { lobby, playerId };
    }
  }
  return null;
}

const io = new Server(server, { cors: { origin: "*" } });

/**
 * Der Spielstand fuehrt eine eigene Spielerliste. Wer online ist, steht aber
 * in der Lobby - also nach jeder Aenderung hinueberkopieren, sonst weiss das
 * Spiel nichts davon, dass jemand weg ist.
 */
function syncVerbindung(lobby, sendenAn = null) {
  if (!lobby.game) return;
  const stand = new Map(lobby.players.map((p) => [p.id, p.connected !== false]));
  const players = lobby.game.players.map((p) =>
    p.connected === (stand.get(p.id) ?? false) ? p : { ...p, connected: stand.get(p.id) ?? false }
  );
  if (players.every((p, i) => p === lobby.game.players[i])) return;
  lobby.game = { ...lobby.game, players, hostId: hostVon(lobby) ?? lobby.game.hostId };
  (sendenAn ?? io.to(lobby.code)).emit("game", lobby.game);
}

const hostVon = (lobby) => lobby.players.find((p) => p.isHost)?.id ?? null;

/**
 * Der Host ist weg: Die Rolle geht an den ersten Anwesenden - auch mitten in
 * einer Runde, sonst kann niemand mehr aufdecken oder neu starten.
 */
function hostUebergeben(lobby) {
  const host = lobby.players.find((p) => p.isHost);
  if (host && host.connected !== false) return false;
  const neuer = lobby.players.find((p) => p.connected !== false);
  if (!neuer || neuer === host) return false;
  lobby.players.forEach((p) => (p.isHost = p === neuer));
  if (lobby.game) lobby.game = { ...lobby.game, hostId: neuer.id };
  return true;
}

io.on("connection", (socket) => {
  socket.on("createLobby", ({ name, spiel, avatar } = {}, ack) => {
    const code = makeCode();
    const playerId = "p-" + Math.random().toString(36).slice(2, 10);
    const lobby = {
      code,
      players: [
        {
          id: playerId,
          name: (name ?? "").trim() || "Spieler",
          avatar: AVATARE.includes(avatar) ? avatar : AVATARE[0],
          isHost: true,
          connected: true,
        },
      ],
      sockets: new Map([[playerId, socket.id]]),
      game: null,
      spiel: istSpiel(spiel) ? spiel : "bus",
      lastActivity: Date.now(),
    };
    lobbies.set(code, lobby);
    socket.join(code);
    ack?.({ ok: true, playerId, lobby: lobbyView(lobby) });
    io.to(code).emit("lobby", lobbyView(lobby));
  });

  socket.on("joinLobby", ({ code, name, avatar } = {}, ack) => {
    const key = (code ?? "").trim().toUpperCase();
    const lobby = lobbies.get(key);
    if (!lobby) return ack?.({ ok: false, error: "Diesen Code gibt es nicht." });
    if (lobby.game) return ack?.({ ok: false, error: "Das Spiel läuft schon." });
    if (lobby.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: "Die Lobby ist voll." });

    // Wunschbild nur, wenn es noch keiner hat - sonst das naechste freie.
    const belegt = new Set(lobby.players.map((p) => p.avatar));
    const meins = AVATARE.includes(avatar) && !belegt.has(avatar) ? avatar : freiesAvatar(lobby);

    const playerId = "p-" + Math.random().toString(36).slice(2, 10);
    lobby.players.push({
      id: playerId,
      name: (name ?? "").trim() || "Spieler",
      avatar: meins,
      isHost: false,
      connected: true,
    });
    lobby.sockets.set(playerId, socket.id);
    lobby.lastActivity = Date.now();
    socket.join(key);
    ack?.({ ok: true, playerId, lobby: lobbyView(lobby) });
    io.to(key).emit("lobby", lobbyView(lobby));
  });

  // Nach kurzem Verbindungsabbruch zurueck in die laufende Runde.
  socket.on("rejoin", ({ code, playerId } = {}, ack) => {
    const lobby = lobbies.get((code ?? "").toUpperCase());
    if (!lobby) return ack?.({ ok: false, error: "Lobby nicht gefunden." });
    const player = lobby.players.find((p) => p.id === playerId);
    if (!player) return ack?.({ ok: false, error: "Spieler nicht in dieser Lobby." });

    player.connected = true;
    lobby.sockets.set(playerId, socket.id);
    lobby.lastActivity = Date.now();
    delete lobby.wegSeit?.[playerId];
    socket.join(lobby.code);
    syncVerbindung(lobby);
    ack?.({ ok: true, playerId, lobby: lobbyView(lobby) });
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    if (lobby.game) socket.emit("game", lobby.game);
  });

  /** Eine neue Runde in derselben Lobby beginnen. */
  function neueRunde(lobby) {
    const start = SPIELE[lobby.spiel] ?? initGame;
    lobby.game = start(
      lobby.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
      undefined,
      lobby.players.find((p) => p.isHost)?.id ?? lobby.players[0].id
    );
    lobby.lastActivity = Date.now();
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    io.to(lobby.code).emit("game", lobby.game);
  }

  // Profilbild wechseln. Jedes gibt es in einer Lobby nur einmal.
  socket.on("setAvatar", ({ avatar } = {}) => {
    const found = findBySocket(socket.id);
    if (!found || found.lobby.game) return;
    const { lobby, playerId } = found;
    if (!AVATARE.includes(avatar)) return;

    if (lobby.players.some((p) => p.avatar === avatar && p.id !== playerId)) {
      return socket.emit("errorMsg", "Das Bild hat schon jemand.");
    }
    const me = lobby.players.find((p) => p.id === playerId);
    if (!me) return;
    me.avatar = avatar;
    lobby.lastActivity = Date.now();
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
  });

  // Der Host stellt um, welches Spiel als naechstes laeuft.
  socket.on("setGame", ({ spiel } = {}) => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    if (!lobby.players.find((p) => p.id === playerId)?.isHost) return;
    if (!istSpiel(spiel)) return;

    // Waehrend eine Runde laeuft, wird nicht umgestellt - aber das muss man
    // auch merken. Vorher ist der Tipp einfach ins Leere gegangen, und auf dem
    // Handy sah es aus, als liesse sich das Spiel nicht mehr wechseln.
    if (lobby.game) {
      return socket.emit("errorMsg", "Erst die Runde beenden, dann umstellen.");
    }
    lobby.spiel = spiel;
    lobby.lastActivity = Date.now();
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
  });

  socket.on("startGame", ({ spiel } = {}) => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    const me = lobby.players.find((p) => p.id === playerId);
    if (!me?.isHost) return socket.emit("errorMsg", "Nur der Host kann starten.");
    if (lobby.game) return;
    if (istSpiel(spiel)) lobby.spiel = spiel;

    // Jedes Spiel hat seine eigene Spielerzahl: Leberschuss ist 2 gegen 2,
    // da gibt es genau vier Ecken und vier Kronkorken.
    const g = grenzen(lobby.spiel);
    if (lobby.players.length < g.min || lobby.players.length > g.max) {
      const wie = g.min === g.max ? `genau ${g.min}` : `${g.min} bis ${g.max}`;
      return socket.emit("errorMsg", `Dafuer braucht ihr ${wie} Spieler.`);
    }
    neueRunde(lobby);
  });

  // Nach dem Ergebnis: Die Lobby bleibt mit allen Spielern bestehen. Entweder
  // geht es sofort in die naechste Runde oder alle landen wieder im Warteraum,
  // von wo aus spaeter auch ein anderes Spiel gestartet werden kann.
  socket.on("playAgain", ({ restart, spiel } = {}) => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    const me = lobby.players.find((p) => p.id === playerId);
    if (!me?.isHost) return socket.emit("errorMsg", "Nur der Host startet die nächste Runde.");

    lobby.game = null;
    // Wer waehrend der Runde weg ist, wird jetzt aus der Lobby genommen.
    lobby.players = lobby.players.filter((p) => p.connected);
    if (lobby.players.length === 0) {
      lobbies.delete(lobby.code);
      return;
    }
    if (!lobby.players.some((p) => p.isHost)) lobby.players[0].isHost = true;
    if (istSpiel(spiel)) lobby.spiel = spiel;
    lobby.lastActivity = Date.now();

    const g2 = grenzen(lobby.spiel);
    if (restart && lobby.players.length >= g2.min && lobby.players.length <= g2.max) {
      return neueRunde(lobby);
    }
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    io.to(lobby.code).emit("backToLobby");
  });

  socket.on("action", (action) => {
    const found = findBySocket(socket.id);
    if (!found?.lobby.game) return;
    const { lobby, playerId } = found;

    const { game, rejected } = handleAction(lobby.game, playerId, action);

    // Der Browser rechnet jede Aktion sofort selbst mit, damit ein Tipp nicht
    // erst nach der Netzrunde sichtbar wird. Geht sie hier nicht durch oder
    // bewirkt sie nichts, muss er den echten Stand zurueckbekommen - sonst
    // bleibt seine Vorhersage stehen.
    if (rejected) {
      socket.emit("errorMsg", rejected);
      return socket.emit("game", lobby.game);
    }
    if (game === lobby.game) return socket.emit("game", lobby.game);

    lobby.game = game;
    lobby.lastActivity = Date.now();
    // Wer die Aktion ausgeloest hat, steht mit dabei: Dieser Spieler hat sie
    // schon selbst gerechnet und darf eine ueberholte Nachricht wegwerfen.
    io.to(lobby.code).emit("game", game, playerId);
  });

  socket.on("leaveLobby", () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    lobby.players = lobby.players.filter((p) => p.id !== playerId);
    lobby.sockets.delete(playerId);
    socket.leave(lobby.code);
    if (lobby.players.length === 0) return void lobbies.delete(lobby.code);
    if (!lobby.players.some((p) => p.isHost)) lobby.players[0].isHost = true;
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
  });

  socket.on("disconnect", () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    const player = lobby.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    lobby.sockets.delete(playerId);

    // Vor dem Start fliegt man raus. Waehrend des Spiels bleibt der Platz
    // erhalten, damit man nach einem Abbruch zurueckkommen kann.
    if (!lobby.game) {
      lobby.players = lobby.players.filter((p) => p.id !== playerId);
      if (lobby.players.length === 0) return void lobbies.delete(lobby.code);
      if (!lobby.players.some((p) => p.isHost)) lobby.players[0].isHost = true;
    } else {
      (lobby.wegSeit ??= {})[playerId] = Date.now();
      hostUebergeben(lobby);
      syncVerbindung(lobby);
      if (lobby.game) io.to(lobby.code).emit("game", lobby.game);
    }
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, lobby] of lobbies) {
    if (now - lobby.lastActivity > IDLE_MS) lobbies.delete(code);
  }
}, 10 * 60 * 1000);

/**
 * Wer weg ist und dabei die Runde blockiert, wird nach einer halben Minute
 * uebersprungen. Ohne das steht das Spiel still, sobald jemand die App zumacht
 * oder in ein Funkloch faehrt - und alle anderen sitzen davor und warten.
 */
export function pruefeAbwesende(jetzt = Date.now()) {
  let uebersprungen = 0;
  for (const lobby of lobbies.values()) {
    if (!lobby.game || lobby.game.phase === "finished") continue;
    if (hostUebergeben(lobby)) {
      syncVerbindung(lobby);
      io.to(lobby.code).emit("lobby", lobbyView(lobby));
      io.to(lobby.code).emit("game", lobby.game);
    }

    const weg = lobby.wegSeit ?? {};
    for (const id of wartetAuf(lobby.game)) {
      const spieler = lobby.players.find((p) => p.id === id);
      if (!spieler || spieler.connected !== false) continue;
      if (jetzt - (weg[id] ?? jetzt) < WEG_MS) continue;

      const next = ueberspringen(lobby.game, id);
      if (next === lobby.game) continue;
      lobby.game = next;
      delete weg[id];
      uebersprungen++;
      io.to(lobby.code).emit("game", lobby.game);
    }
  }
  return uebersprungen;
}

setInterval(pruefeAbwesende, PRUEF_MS).unref?.();

server.listen(PORT, () => {
  console.log("");
  console.log("  Trinkspiele läuft.");
  console.log("");
  console.log("  Auf diesem Rechner:  http://localhost:" + PORT);
  for (const addr of localAddresses()) {
    console.log("  Im selben WLAN:      http://" + addr + ":" + PORT);
  }
  console.log("");
  console.log("  Zum Beenden: Strg+C");
  console.log("");
});

/** Die eigenen WLAN-Adressen, damit man sie nicht suchen muss. */
function localAddresses() {
  const out = [];
  for (const net of Object.values(os.networkInterfaces())) {
    for (const entry of net ?? []) {
      if (entry.family === "IPv4" && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}
