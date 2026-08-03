// Aktionen anwenden und pruefen.
//
// Wird von beiden Seiten benutzt: lokal vom Browser, online vom Server.
// Der Server ist die Instanz, die entscheidet - eine manipulierte Seite im
// Browser kann dadurch nichts erzwingen.
//
// Am Feld `game` haengt, welches Spiel laeuft: "bus" oder "race".

import {
  allBetsIn,
  ueberspringenRace,
  wartetAufRace,
  flipRace,
  handOutSipRace,
  placeBet,
  startRace,
  MAX_EINSATZ,
  MIN_EINSATZ,
} from "./race.js";
import {
  currentPlayer,
  erlaubteReihen,
  guessBuild,
  pickSpot,
  ueberspringenBuild,
  wartetAufBuild,
  weiterBuild,
  TIPPS,
} from "./build.js";
import { canUndo, pendingFor as racePendingFor, undoSip } from "./sips.js";
import {
  discardCard,
  finishGame,
  handOutSip,
  makeGuess,
  darfWeiter,
  nextRow,
  pendingFor,
  pendingTotal,
  pickPyramid,
  restartPyramid,
  revealRow,
  tiebreakDraw,
  tiebreakFlip,
  tiebreakGo,
  ueberspringenBus,
  wartetAufBus,
} from "./engine.js";

/**
 * `actorId` ist der Spieler, von dem die Aktion wirklich kommt. Online setzt der
 * Server ihn - dadurch kann niemand Schluecke im Namen eines anderen verteilen.
 * Lokal steht der Verteiler im Feld `fromId` der Aktion.
 */
export function applyAction(g, action, actorId = null) {
  const vorher = g;
  const next = wendeAn(g, action, actorId);
  // Jeder wirksame Zug zaehlt `rev` hoch. Der Browser rechnet online sofort
  // voraus; an dieser Nummer erkennt er spaeter, ob eine Nachricht vom Server
  // schon ueberholt ist.
  return next === vorher ? vorher : { ...next, rev: (vorher.rev ?? 0) + 1 };
}

function wendeAn(g, action, actorId) {
  // Rueckgaengig gilt nur innerhalb der laufenden Verteilung. Sobald die
  // Runde weitergeht - aufdecken, weiterblaettern, naechster Spieler - ist
  // Schluss. Ablegen zaehlt nicht dazu, da wird ja nur nachgelegt.
  const behaelt = ["handOutSip", "undoSip", "discard"];
  if (g.undoStack && Object.keys(g.undoStack).length && !behaelt.includes(action.type)) {
    g = { ...g, undoStack: {} };
  }
  if (g.game === "race") return applyRace(g, action, actorId);
  if (g.game === "build") return applyBuild(g, action, actorId);

  switch (action.type) {
    case "guess":
      return makeGuess(g, action.value);
    case "handOutSip":
      return handOutSip(g, action.targetId, actorId ?? action.fromId);
    case "undoSip":
      return undoSip(g, actorId ?? action.fromId, action.targetId);
    case "revealRow":
      return revealRow(g);
    case "discard":
      return discardCard(g, action.playerId);
    case "nextRow":
      return nextRow(g);
    case "tiebreakFlip":
      return tiebreakFlip(g);
    case "tiebreakDraw":
      return tiebreakDraw(g);
    case "tiebreakGo":
      return tiebreakGo(g);
    case "pickPyramid":
      return pickPyramid(g, action.index);
    case "restartPyramid":
      return restartPyramid(g);
    case "finish":
      return finishGame(g);
    default:
      return g;
  }
}

// ---------------------------------------------------------------------------
// Pferderennen
// ---------------------------------------------------------------------------

function applyRace(g, action, actorId) {
  const wer = actorId ?? action.playerId ?? action.fromId;
  switch (action.type) {
    case "bet":
      return placeBet(g, wer, action.suit, action.amount);
    case "startRace":
      return startRace(g);
    case "flip":
      return flipRace(g);
    case "handOutSip":
      return handOutSipRace(g, action.targetId, wer);
    case "undoSip":
      return undoSip(g, wer, action.targetId);
    default:
      return g;
  }
}

// ---------------------------------------------------------------------------
// Bus bauen
// ---------------------------------------------------------------------------

function applyBuild(g, action, actorId) {
  const wer = actorId ?? action.playerId;
  switch (action.type) {
    case "pickSpot":
      return pickSpot(g, wer, Number(action.row), action.side);
    case "guessBuild":
      return guessBuild(g, wer, action.tipp);
    case "weiterBuild":
      return weiterBuild(g, wer);
    default:
      return g;
  }
}

function mayActBuild(g, playerId, action) {
  if (g.phase !== "play") return false;
  if (currentPlayer(g)?.id !== playerId) return false;
  // Nach einem Fehler steht die Karte gross da - dann geht nur "Nochmal".
  if (g.wartet) return action.type === "weiterBuild";

  switch (action.type) {
    case "pickSpot":
      return (
        erlaubteReihen(g).includes(Number(action.row)) &&
        (action.side === "left" || action.side === "right")
      );
    case "guessBuild":
      return !!g.pick && TIPPS.includes(action.tipp);
    default:
      return false;
  }
}

function mayActRace(g, playerId, action) {
  const istHost = !g.hostId || g.hostId === playerId;
  switch (action.type) {
    // Setzen darf jeder, aber nur fuer sich selbst und nur vor dem Start.
    case "bet":
      return (
        g.phase === "bets" &&
        (!action.playerId || action.playerId === playerId) &&
        Number(action.amount) >= MIN_EINSATZ &&
        Number(action.amount) <= MAX_EINSATZ
      );

    // Das Rennen startet und laeuft ueber den Host.
    case "startRace":
      return g.phase === "bets" && allBetsIn(g) && istHost;
    case "flip":
      return g.phase === "race" && !g.winner && istHost;

    case "handOutSip":
      return g.phase === "payout" && racePendingFor(g, playerId) > 0;
    case "undoSip":
      return g.phase === "payout" && canUndo(g, playerId, action.targetId);

    default:
      return false;
  }
}

/** Darf dieser Spieler diese Aktion gerade ausfuehren? */
export function mayAct(g, playerId, action) {
  if (!g.players.some((p) => p.id === playerId)) return false;
  if (g.game === "race") return mayActRace(g, playerId, action);
  if (g.game === "build") return mayActBuild(g, playerId, action);

  switch (action.type) {
    case "guess":
      return g.phase === "guess" && pendingTotal(g) === 0 && g.players[g.turn].id === playerId;

    // Verteilen darf jeder, der noch offene Schluecke hat - in Phase 2 koennen
    // das mehrere gleichzeitig sein, keiner muss auf den anderen warten.
    case "handOutSip":
      return pendingFor(g, playerId) > 0;

    // Den letzten Schluck zuruecknehmen, falls man danebengetippt hat.
    case "undoSip":
      return canUndo(g, playerId, action.targetId);

    // Aufdecken und weiterblaettern macht nur der Host, damit nicht mehrere
    // gleichzeitig durchklicken. Ohne Host (lokales Spiel) darf es jeder.
    case "revealRow":
      return g.phase === "rows" && !g.revealedNow && (!g.hostId || g.hostId === playerId);

    // Weiterblaettern erst, wenn keiner mehr ablegen kann oder die
    // 10 Sekunden Wartezeit um sind.
    case "nextRow":
      return g.phase === "rows" && darfWeiter(g) && (!g.hostId || g.hostId === playerId);

    // Das Stechen steuert ebenfalls der Host.
    case "tiebreakFlip":
    case "tiebreakDraw":
      return g.phase === "tiebreak" && !g.tieResult && (!g.hostId || g.hostId === playerId);
    case "tiebreakGo":
      return g.phase === "tiebreak" && !!g.tieResult && (!g.hostId || g.hostId === playerId);

    // Ablegen darf nur, wem die Karte gehoert - auch waehrend andere verteilen.
    case "discard":
      return g.phase === "rows" && g.revealedNow === true && action.playerId === playerId;

    case "pickPyramid":
    case "restartPyramid":
      return g.phase === "pyramid" && g.driverId === playerId;

    case "finish":
      return g.phase === "pyramid" && g.finished;

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Wenn jemand weg ist
// ---------------------------------------------------------------------------

/**
 * Auf wen wartet die Runde gerade? Solange diese Leute nichts tun, geht es
 * nicht weiter. Der Server schaut damit nach, ob er jemanden ueberspringen
 * muss, der die App zugemacht hat.
 */
export function wartetAuf(g) {
  if (!g || g.phase === "finished") return [];
  if (g.game === "race") return wartetAufRace(g);
  if (g.game === "build") return wartetAufBuild(g);
  return wartetAufBus(g);
}

/**
 * Diesen Spieler ueberspringen, weil er zu lange weg ist. Was das genau
 * bedeutet, entscheidet das jeweilige Spiel - meistens: sein Zug faellt aus,
 * offene Schluecke verfallen.
 */
export function ueberspringen(g, playerId) {
  if (!g || g.phase === "finished") return g;
  const next =
    g.game === "race"
      ? ueberspringenRace(g, playerId)
      : g.game === "build"
        ? ueberspringenBuild(g, playerId)
        : ueberspringenBus(g, playerId);
  return next === g ? g : { ...next, rev: (g.rev ?? 0) + 1 };
}

/** Ein Zug vom Client: pruefen, anwenden, Ergebnis zurueckgeben. */
export function handleAction(g, playerId, action) {
  if (!mayAct(g, playerId, action)) return { game: g, rejected: "Du bist gerade nicht dran." };
  return { game: applyAction(g, action, playerId), rejected: null };
}
