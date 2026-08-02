// Prueft die Oberflaeche, ohne einen Browser zu starten.
//
// Die App wird mit einem winzigen Ersatz-Browser geladen und dann durch jeden
// Bildschirm und jede Spielphase geschickt. So fallen Tippfehler und vergessene
// Umbenennungen auf, die man sonst erst am Handy merkt.
//
// Aufruf: node test-ui.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (cond, text) => {
  if (!cond) {
    console.log("  FEHLER: " + text);
    fails++;
  }
};
const section = (t) => console.log("\n" + t);

// --- Ersatz-Browser --------------------------------------------------------

const clickHandlers = {};
const appEl = {
  innerHTML: "",
  addEventListener: (ev, fn) => (clickHandlers[ev] = fn),
  querySelectorAll: () => [],
};
const dummy = () => ({
  className: "",
  innerHTML: "",
  classList: { add() {}, remove() {} },
  children: [],
  firstChild: null,
  appendChild() {},
  remove() {},
});
globalThis.document = {
  getElementById: (id) => (id === "app" ? appEl : null),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: dummy,
  body: { appendChild() {} },
};
globalThis.localStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = v;
  },
};
const gesendet = [];
globalThis.io = () => ({
  on() {},
  emit(ev, ...args) {
    gesendet.push({ ev, args });
  },
  disconnect() {},
});

// app.js benutzt Browser-Pfade wie "/game/engine.js". Fuers Testen werden
// Kopien mit vollen Pfaden angelegt - am Code selbst aendert das nichts.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trinkspiele-"));
const gameUrl = pathToFileURL(path.join(ROOT, "game/")).href;

const infoKopie = path.join(tmp, "games-info.mjs");
fs.writeFileSync(
  infoKopie,
  fs.readFileSync(path.join(ROOT, "public/games-info.js"), "utf8").replaceAll('from "/game/', `from "${gameUrl}`)
);

const kopie = path.join(tmp, "app.mjs");
fs.writeFileSync(
  kopie,
  fs
    .readFileSync(path.join(ROOT, "public/app.js"), "utf8")
    .replaceAll('from "/game/', `from "${gameUrl}`)
    .replaceAll('from "/games-info.js"', `from "${pathToFileURL(infoKopie).href}"`) +
    "\nexport { S, render };\n"
);

const { S, render } = await import(pathToFileURL(kopie).href);
const { initGame } = await import("./game/engine.js");
const { initRace, placeBet, startRace, flipRace, handOutSipRace } = await import("./game/race.js");
const { makeGuess, handOutSip, revealRow, discardCard, nextRow } = await import("./game/engine.js");
const { pendingTotal, distributorIds, sipTargets } = await import("./game/sips.js");
const { SUITS } = await import("./game/deck.js");

process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* der Ordner liegt im Papierkorb des Systems, das reicht */
  }
});

/** Einmal zeichnen und schauen, dass wirklich etwas Sinnvolles herauskommt. */
function zeichne(was) {
  appEl.innerHTML = "";
  try {
    render();
  } catch (e) {
    ok(false, `${was}: Absturz beim Zeichnen – ${e.message}`);
    return "";
  }
  const html = appEl.innerHTML;
  ok(html.length > 60, `${was}: es wurde so gut wie nichts gezeichnet`);
  ok(!html.includes("undefined"), `${was}: im Text steht "undefined"`);
  ok(!html.includes("NaN"), `${was}: im Text steht "NaN"`);
  ok(!html.includes("[object Object]"), `${was}: im Text steht "[object Object]"`);
  return html;
}

/** Einen Knopf antippen, so wie es der echte Klick tun wuerde. */
function tippe(daten) {
  const el = { dataset: daten };
  clickHandlers.click({ target: { closest: () => el } });
}

const spieler = (n) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "Spieler" + i }));

// --- 1. Menue-Bildschirme --------------------------------------------------
section("Menü");
{
  S.name = "Jonas";
  for (const screen of ["name", "home", "games", "rules", "setup", "lobby"]) {
    S.screen = screen;
    S.rulesFor = "bus";
    zeichne(screen);
  }

  S.screen = "home";
  const home = zeichne("Startseite");
  ok(!home.includes("Du erstellst eine Lobby"), "die alte Online-Erklärung steht noch auf der Startseite");
  ok(!home.includes("reicht ein Gerät"), "die alte Handy-Erklärung steht noch auf der Startseite");
  ok(home.includes("Online") && home.includes("Handy"), "die beiden Knöpfe fehlen");

  S.screen = "games";
  const auswahl = zeichne("Spielauswahl");
  ok(auswahl.includes("Busfahren") && auswahl.includes("Pferderennen"), "es fehlt ein Spiel in der Auswahl");
  ok(auswahl.includes("<svg"), "in der Auswahl ist kein Bild");
  ok(!auswahl.includes("Worum geht"), "die Regeln stehen ungefragt schon in der Auswahl");
  ok(auswahl.includes('data-a="rules"'), "es gibt keinen Regel-Knopf");

  S.rulesFor = "race";
  S.screen = "rules";
  const regeln = zeichne("Regeln Pferderennen");
  ok(regeln.includes("Streckenkarte") && regeln.includes("Doppelte"), "die Rennregeln sind unvollständig");
  S.rulesFor = "bus";
  S.screen = "rules";
  ok(zeichne("Regeln Busfahren").includes("Pyramide"), "die Busregeln sind unvollständig");
  console.log("  Startseite ohne Erklärtexte, Auswahl mit Bild, Regeln erst auf Knopfdruck");
}

// --- 2. Durchklicken bis zur Lobby ----------------------------------------
section("Durchklicken");
{
  S.screen = "home";
  S.lobby = null;
  S.game = null;
  tippe({ a: "online" });
  ok(S.screen === "games", "nach 'Online' kommt nicht die Spielauswahl");
  tippe({ a: "pickGame", id: "race" });
  ok(S.spiel === "race", "die Auswahl ist nicht hängen geblieben");
  ok(zeichne("Auswahl Rennen").includes("Pferderennen spielen"), "der Weiter-Knopf trägt nicht den Spielnamen");
  tippe({ a: "rules", id: "race" });
  ok(S.screen === "rules", "der Regel-Knopf führt nicht zu den Regeln");
  tippe({ a: "rulesBack" });
  ok(S.screen === "games", "von den Regeln kommt man nicht zurück");
  tippe({ a: "gameNext" });
  ok(S.screen === "lobby", "man landet nicht in der Lobby");

  gesendet.length = 0;
  tippe({ a: "create" });
  ok(gesendet.some((m) => m.ev === "createLobby" && m.args[0].spiel === "race"),
     "beim Aufmachen der Lobby wird das Spiel nicht mitgeschickt");

  // Lokal: Auswahl fuehrt zur Namensliste
  S.screen = "home";
  tippe({ a: "local" });
  ok(S.screen === "games", "nach 'Am Handy' kommt nicht die Spielauswahl");
  tippe({ a: "pickGame", id: "bus" });
  tippe({ a: "gameNext" });
  ok(S.screen === "setup", "lokal landet man nicht bei den Namen");
  console.log("  Online und lokal führen beide über die Spielauswahl");
}

// --- 3. Alle Bildschirme von Busfahren ------------------------------------
section("Busfahren");
{
  S.mode = "local";
  S.myId = null;
  S.screen = "game";
  let g = initGame(spieler(4));
  S.game = g;
  zeichne("Busfahren Phase 1");

  // bis zu den Reihen durchspielen
  let guard = 0;
  while (S.game.phase === "guess" && guard++ < 900) {
    let x = S.game;
    if (pendingTotal(x) > 0) {
      const from = distributorIds(x)[0];
      x = handOutSip(x, sipTargets(x, from)[0].id, from);
    } else {
      x = makeGuess(x, ["red", "higher", "inside", "seen"][x.round]);
    }
    S.game = x;
    zeichne("Busfahren Phase 1");
  }

  ok(S.game.phase === "rows", "Phase 2 nicht erreicht");
  zeichne("Busfahren Phase 2");
  S.game = revealRow(S.game);
  zeichne("Busfahren Phase 2 aufgedeckt");

  guard = 0;
  while (S.game.phase === "rows" && guard++ < 900) {
    let x = S.game;
    if (!x.revealedNow) x = revealRow(x);
    else {
      const passt = x.players.filter((p) => p.cards.some((c) => c.rank === x.order && false));
      const match = (await import("./game/engine.js")).playersWithMatch(x);
      if (match.length) x = discardCard(x, match[0].id);
      else if (pendingTotal(x) > 0) {
        const from = distributorIds(x)[0];
        x = handOutSip(x, sipTargets(x, from)[0].id, from);
      } else x = nextRow(x);
    }
    S.game = x;
    zeichne("Busfahren Phase 2");
  }

  if (S.game.phase === "tiebreak") zeichne("Busfahren Stechen");
  ok(["tiebreak", "pyramid"].includes(S.game.phase), "nach den Reihen geht es nicht weiter");

  // Pyramide und Ergebnis
  const { tiebreakFlip, tiebreakDraw, pickPyramid, restartPyramid, allowedPyramidIndices, finishGame } =
    await import("./game/engine.js");
  guard = 0;
  while (S.game.phase === "tiebreak" && guard++ < 400) {
    S.game = S.game.tieMode === "flip" ? tiebreakFlip(S.game) : tiebreakDraw(S.game);
    zeichne("Busfahren Stechen");
  }
  zeichne("Busfahren Pyramide");
  guard = 0;
  while (S.game.phase === "pyramid" && !S.game.finished && guard++ < 3000) {
    S.game = S.game.failedAt ? restartPyramid(S.game) : pickPyramid(S.game, allowedPyramidIndices(S.game)[0]);
    zeichne("Busfahren Pyramide");
  }
  S.game = finishGame(S.game);
  const erg = zeichne("Busfahren Ergebnis");
  ok(erg.includes("Ergebnis"), "der Ergebnisbildschirm fehlt");
  console.log("  Alle fünf Bildschirme einer kompletten Partie gezeichnet");
}

// --- 4. Alle Bildschirme vom Pferderennen ---------------------------------
section("Pferderennen");
{
  S.mode = "local";
  S.myId = null;
  S.screen = "game";
  S.bet = { suit: null, amount: 3 };
  S.game = initRace(spieler(4));

  const wetten = zeichne("Rennen Wetten");
  ok(wetten.includes("Herz") && wetten.includes("Pik"), "es fehlen Pferde auf dem Wettzettel");
  ok(wetten.includes("Erst ein Pferd antippen"), "ohne Pferd fehlt der Hinweis");

  // Setzen per Klick, so wie am Handy
  tippe({ a: "pickHorse", suit: "hearts" });
  ok(S.bet.suit === "hearts", "das Pferd wurde nicht gemerkt");
  tippe({ a: "betSet", n: "7" });
  ok(S.bet.amount === 7, "der Einsatz wurde nicht übernommen");
  tippe({ a: "betPlus" });
  tippe({ a: "betMinus" });
  ok(S.bet.amount === 7, "Plus und Minus heben sich nicht auf");
  tippe({ a: "placeBet" });
  ok(S.game.bets.p0?.suit === "hearts" && S.game.bets.p0.amount === 7, "die Wette kam nicht an");
  ok(S.game.players[0].sips === 7, "der Einsatz wurde nicht sofort getrunken");
  const nachWette = zeichne("Rennen nach erster Wette");
  ok(nachWette.includes("Spieler0") && nachWette.includes("7"), "man sieht nicht, wer worauf gesetzt hat");
  ok(wetten.includes("sofort getrunken"), "auf dem Wettzettel fehlt der Hinweis aufs Trinken");
  ok(nachWette.includes("Spieler1"), "lokal ist nach der ersten Wette nicht der nächste dran");

  for (let i = 1; i < 4; i++) S.game = placeBet(S.game, "p" + i, SUITS[i], 2 + i);
  const alle = zeichne("Rennen alle Wetten");
  ok(alle.includes("Rennen starten"), "der Startknopf fehlt, obwohl alle gesetzt haben");
  for (const s of SUITS) ok(alle.includes(s === "hearts" ? "Herz" : ""), "");

  S.game = startRace(S.game);
  const bahn = zeichne("Rennbahn");
  ok(bahn.includes("track") && bahn.includes("lane"), "die Rennbahn wird nicht gezeichnet");
  ok((bahn.match(/class="lane/g) ?? []).length >= 5, "es fehlen Bahnen oder die Kopfzeile");

  let guard = 0;
  while (S.game.phase === "race" && guard++ < 3000) {
    S.game = flipRace(S.game);
    zeichne("Rennbahn");
  }
  ok(S.game.winner, "das Rennen kam nie ins Ziel");

  const ende = zeichne("Rennen Ende");
  ok(ende.includes("gewinnt"), "der Sieger wird nicht genannt");

  guard = 0;
  while (S.game.phase === "payout" && guard++ < 500) {
    const from = distributorIds(S.game)[0];
    S.game = handOutSipRace(S.game, sipTargets(S.game, from)[0].id, from);
    zeichne("Rennen Auszahlung");
  }
  ok(S.game.phase === "finished", "die Auszahlung wurde nicht fertig");
  const schluss = zeichne("Rennen Schluss");
  ok(schluss.includes("Nochmal spielen"), "am Ende fehlt der Knopf für die nächste Runde");
  console.log("  Wetten, Rennbahn, Auszahlung und Ergebnis gezeichnet");
}

// --- 5. Online-Sicht: Gast darf nicht aufdecken ----------------------------
section("Online-Sicht");
{
  S.mode = "online";
  S.myId = "p2";
  S.lobby = { code: "ABCD", players: [], spiel: "race" };
  S.screen = "game";

  let g = initRace(spieler(4), undefined, "p0");
  for (let i = 0; i < 4; i++) g = placeBet(g, "p" + i, SUITS[i], 3);
  g = startRace(g);
  S.game = g;
  const gast = zeichne("Rennbahn als Gast");
  ok(!gast.includes('data-a="flip"'), "ein Gast bekommt den Aufdeck-Knopf zu sehen");
  ok(gast.includes("deckt auf"), "dem Gast wird nicht gesagt, worauf er wartet");

  S.myId = "p0";
  ok(zeichne("Rennbahn als Host").includes('data-a="flip"'), "der Host bekommt keinen Aufdeck-Knopf");

  // Busfahren: Gast darf nicht weiterblaettern
  S.myId = "p2";
  let b = initGame(spieler(4), undefined, "p0");
  while (b.phase === "guess") {
    b = pendingTotal(b) > 0
      ? handOutSip(b, sipTargets(b, distributorIds(b)[0])[0].id, distributorIds(b)[0])
      : makeGuess(b, ["red", "higher", "inside", "seen"][b.round]);
  }
  S.game = b;
  ok(!zeichne("Reihen als Gast").includes('data-a="reveal"'), "ein Gast kann die Reihen aufdecken");
  S.myId = "p0";
  ok(zeichne("Reihen als Host").includes('data-a="reveal"'), "der Host kann die Reihen nicht aufdecken");
  console.log("  Nur der Host sieht die Aufdeck-Knöpfe, Gäste bekommen einen Hinweis");
}

console.log("");
if (fails === 0) {
  console.log("OBERFLAECHE GRUEN – jeder Bildschirm zeichnet sauber.");
} else {
  console.log(`${fails} Pruefung(en) fehlgeschlagen.`);
  process.exitCode = 1;
}
