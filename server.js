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
import { handleAction } from "./game/actions.js";

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
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
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

const lobbyView = (l) => ({ code: l.code, players: l.players, started: l.game !== null });

function findBySocket(socketId) {
  for (const lobby of lobbies.values()) {
    for (const [playerId, sid] of lobby.sockets) {
      if (sid === socketId) return { lobby, playerId };
    }
  }
  return null;
}

const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("createLobby", ({ name } = {}, ack) => {
    const code = makeCode();
    const playerId = "p-" + Math.random().toString(36).slice(2, 10);
    const lobby = {
      code,
      players: [{ id: playerId, name: (name ?? "").trim() || "Spieler", isHost: true, connected: true }],
      sockets: new Map([[playerId, socket.id]]),
      game: null,
      lastActivity: Date.now(),
    };
    lobbies.set(code, lobby);
    socket.join(code);
    ack?.({ ok: true, playerId, lobby: lobbyView(lobby) });
    io.to(code).emit("lobby", lobbyView(lobby));
  });

  socket.on("joinLobby", ({ code, name } = {}, ack) => {
    const key = (code ?? "").trim().toUpperCase();
    const lobby = lobbies.get(key);
    if (!lobby) return ack?.({ ok: false, error: "Diesen Code gibt es nicht." });
    if (lobby.game) return ack?.({ ok: false, error: "Das Spiel läuft schon." });
    if (lobby.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: "Die Lobby ist voll." });

    const playerId = "p-" + Math.random().toString(36).slice(2, 10);
    lobby.players.push({ id: playerId, name: (name ?? "").trim() || "Spieler", isHost: false, connected: true });
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
    socket.join(lobby.code);
    ack?.({ ok: true, playerId, lobby: lobbyView(lobby) });
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    if (lobby.game) socket.emit("game", lobby.game);
  });

  /** Eine neue Runde in derselben Lobby beginnen. */
  function neueRunde(lobby) {
    lobby.game = initGame(
      lobby.players.map((p) => ({ id: p.id, name: p.name })),
      undefined,
      lobby.players.find((p) => p.isHost)?.id ?? lobby.players[0].id
    );
    lobby.lastActivity = Date.now();
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    io.to(lobby.code).emit("game", lobby.game);
  }

  socket.on("startGame", () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { lobby, playerId } = found;
    const me = lobby.players.find((p) => p.id === playerId);
    if (!me?.isHost) return socket.emit("errorMsg", "Nur der Host kann starten.");
    if (lobby.players.length < MIN_PLAYERS) {
      return socket.emit("errorMsg", `Ihr braucht mindestens ${MIN_PLAYERS} Spieler.`);
    }
    if (lobby.game) return;
    neueRunde(lobby);
  });

  // Nach dem Ergebnis: Die Lobby bleibt mit allen Spielern bestehen. Entweder
  // geht es sofort in die naechste Runde oder alle landen wieder im Warteraum,
  // von wo aus spaeter auch ein anderes Spiel gestartet werden kann.
  socket.on("playAgain", ({ restart } = {}) => {
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
    lobby.lastActivity = Date.now();

    if (restart && lobby.players.length >= MIN_PLAYERS) return neueRunde(lobby);
    io.to(lobby.code).emit("lobby", lobbyView(lobby));
    io.to(lobby.code).emit("backToLobby");
  });

  socket.on("action", (action) => {
    const found = findBySocket(socket.id);
    if (!found?.lobby.game) return;
    const { lobby, playerId } = found;

    const { game, rejected } = handleAction(lobby.game, playerId, action);
    if (rejected) return socket.emit("errorMsg", rejected);
    if (game === lobby.game) return; // Aktion war wirkungslos

    lobby.game = game;
    lobby.lastActivity = Date.now();
    io.to(lobby.code).emit("game", game);
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
