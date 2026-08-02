// Aktionen anwenden und pruefen.
//
// Wird von beiden Seiten benutzt: lokal vom Browser, online vom Server.
// Der Server ist die Instanz, die entscheidet - eine manipulierte Seite im
// Browser kann dadurch nichts erzwingen.
//
// Am Feld `game` haengt, welches Spiel laeuft: "bus" oder "race".

import {
  allBetsIn,
  flipRace,
  handOutSipRace,
  placeBet,
  startRace,
  MAX_EINSATZ,
  MIN_EINSATZ,
} from "./race.js";
import { pendingFor as racePendingFor } from "./sips.js";
import {
  discardCard,
  finishGame,
  handOutSip,
  makeGuess,
  nextRow,
  pendingFor,
  pendingTotal,
  pickPyramid,
  restartPyramid,
  revealRow,
  tiebreakDraw,
  tiebreakFlip,
} from "./engine.js";

/**
 * `actorId` ist der Spieler, von dem die Aktion wirklich kommt. Online setzt der
 * Server ihn - dadurch kann niemand Schluecke im Namen eines anderen verteilen.
 * Lokal steht der Verteiler im Feld `fromId` der Aktion.
 */
export function applyAction(g, action, actorId = null) {
  if (g.game === "race") return applyRace(g, action, actorId);

  switch (action.type) {
    case "guess":
      return makeGuess(g, action.value);
    case "handOutSip":
      return handOutSip(g, action.targetId, actorId ?? action.fromId);
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
    default:
      return g;
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

    default:
      return false;
  }
}

/** Darf dieser Spieler diese Aktion gerade ausfuehren? */
export function mayAct(g, playerId, action) {
  if (!g.players.some((p) => p.id === playerId)) return false;
  if (g.game === "race") return mayActRace(g, playerId, action);

  switch (action.type) {
    case "guess":
      return g.phase === "guess" && pendingTotal(g) === 0 && g.players[g.turn].id === playerId;

    // Verteilen darf jeder, der noch offene Schluecke hat - in Phase 2 koennen
    // das mehrere gleichzeitig sein, keiner muss auf den anderen warten.
    case "handOutSip":
      return pendingFor(g, playerId) > 0;

    // Aufdecken und weiterblaettern macht nur der Host, damit nicht mehrere
    // gleichzeitig durchklicken. Ohne Host (lokales Spiel) darf es jeder.
    // Solange noch jemand verteilt, geht es nicht weiter.
    case "revealRow":
    case "nextRow":
      return g.phase === "rows" && pendingTotal(g) === 0 && (!g.hostId || g.hostId === playerId);

    // Das Stechen steuert ebenfalls der Host.
    case "tiebreakFlip":
    case "tiebreakDraw":
      return g.phase === "tiebreak" && (!g.hostId || g.hostId === playerId);

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

/** Ein Zug vom Client: pruefen, anwenden, Ergebnis zurueckgeben. */
export function handleAction(g, playerId, action) {
  if (!mayAct(g, playerId, action)) return { game: g, rejected: "Du bist gerade nicht dran." };
  return { game: applyAction(g, action, playerId), rejected: null };
}
