// Aktionen anwenden und pruefen.
//
// Wird von beiden Seiten benutzt: lokal vom Browser, online vom Server.
// Der Server ist die Instanz, die entscheidet - eine manipulierte Seite im
// Browser kann dadurch nichts erzwingen.

import {
  discardCard,
  finishGame,
  handOutSip,
  makeGuess,
  nextRow,
  pickPyramid,
  restartPyramid,
  revealRow,
} from "./engine.js";

export function applyAction(g, action) {
  switch (action.type) {
    case "guess":
      return makeGuess(g, action.value);
    case "handOutSip":
      return handOutSip(g, action.targetId);
    case "revealRow":
      return revealRow(g);
    case "discard":
      return discardCard(g, action.playerId);
    case "nextRow":
      return nextRow(g);
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

/** Darf dieser Spieler diese Aktion gerade ausfuehren? */
export function mayAct(g, playerId, action) {
  if (!g.players.some((p) => p.id === playerId)) return false;

  switch (action.type) {
    case "guess":
      return g.phase === "guess" && g.pendingSips === 0 && g.players[g.turn].id === playerId;

    case "handOutSip":
      if (g.phase === "guess") return g.pendingSips > 0 && g.players[g.turn].id === playerId;
      if (g.phase === "rows") return g.pendingSips > 0 && g.pendingFromId === playerId;
      return false;

    // Aufdecken und weiterblaettern macht nur der Host, damit nicht mehrere
    // gleichzeitig durchklicken. Ohne Host (lokales Spiel) darf es jeder.
    case "revealRow":
    case "nextRow":
      return g.phase === "rows" && (!g.hostId || g.hostId === playerId);

    // Ablegen darf nur, wem die Karte gehoert.
    case "discard":
      return g.phase === "rows" && action.playerId === playerId;

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
  return { game: applyAction(g, action), rejected: null };
}
