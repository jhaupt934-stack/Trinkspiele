# Trinkspiele – Busfahren

Läuft im Browser. Keine App-Installation, kein App Store, kein Account.
Funktioniert auf iPhone und Android gleichermaßen.

## Starten

Doppelklick auf **START.bat**.

Beim ersten Mal wird eine einzige Abhängigkeit geladen (`socket.io`), danach
startet der Server sofort. Im Fenster stehen zwei Adressen:

```
Auf diesem Rechner:  http://localhost:8080
Im selben WLAN:      http://192.168.x.x:8080
```

Die zweite Adresse schickst du deinen Freunden — die öffnen sie im Handy-Browser
und sind drin. Auf dem iPhone kann man sie über "Zum Home-Bildschirm" ablegen,
dann sieht es aus wie eine App.

Voraussetzung: Node.js von nodejs.org (LTS-Version).

## Zwei Spielarten

**Auf einem Handy** — ein Gerät wird reihum weitergereicht. Braucht keinen Server
und keine Verbindung, läuft komplett im Browser.

**Online** — jeder öffnet die Seite auf seinem eigenen Handy. Einer erstellt eine
Lobby und sagt den vierstelligen Code an, die anderen treten damit bei. Jeder
sieht seine eigenen Karten groß vor sich, die der Mitspieler klein am Tischrand.

## Die Regeln

Jeder bekommt vier eigene Karten, die offen vor ihm liegen.

**Phase 1 – Karten raten.** Vier Runden, jeder ist reihum dran und zieht eine Karte:

| Runde | Frage | Einsatz |
|---|---|---|
| 1 | Rot oder Schwarz? | 1 Schluck |
| 2 | Höher oder niedriger als deine erste Karte? | 2 Schlucke |
| 3 | Zwischen oder außerhalb deiner ersten beiden? | 3 Schlucke |
| 4 | Hattest du dieses Symbol schon? | 4 Schlucke |

Richtig geraten heißt Schlucke **verteilen**, falsch heißt **selber trinken**.
Verteilen darfst du beliebig aufteilen – nur dir selbst gibst du nichts.
Gleicher Kartenwert wie eine Grenzkarte zählt in Runde 2 und 3 als falsch.

**Phase 2 – Die zwei Reihen.** Je vier Karten, 1 bis 4 Schlucke aufsteigend. Eine
Reihe heißt "selber trinken", die andere "verteilen", abwechselnd aufgedeckt. Wer
den passenden Kartenwert liegen hat, legt ab. Wenig Karten ist gut.

**Phase 3 – Die Pyramide.** Wer die meisten Karten übrig hat, fährt Bus. Unten fünf
Karten, dann vier, drei, zwei, eine. Du suchst dir unten eine aus und arbeitest
dich nach oben – erlaubt ist immer nur eine Karte, die **direkt an deine letzte
angrenzt**. Am Rand gibt es genau einen Weg, in der Mitte hast du die Wahl. Bei
einer Bildkarte geht es zurück nach unten, und du trinkst so viele Schlucke, wie
weit du gekommen warst.

## Von überall spielen

Solange der Server auf deinem PC läuft, funktioniert es nur im selben WLAN. Für
"jeder zuhause" muss er ins Netz.

Stand 2026 ist **Render** der einzige der großen Anbieter mit einem echten
Gratis-Tarif: 750 Stunden im Monat, keine Kreditkarte. Railway hat nur noch
5 $ Startguthaben für 30 Tage, Fly.io verlangt eine Kreditkarte.

Im Projekt liegen `Dockerfile` und `render.yaml` – Render liest beides
automatisch, du musst dort nichts einstellen.

**Schritt 1 – Code zu GitHub** (kein Git nötig, geht im Browser)

1. Auf github.com anmelden
2. Oben rechts auf **+** → **New repository**, Namen vergeben, **Create**
3. Auf **uploading an existing file** klicken
4. Den *Inhalt* des Trinkspiele-Ordners ins Browserfenster ziehen – also
   `server.js`, `package.json`, `Dockerfile`, `render.yaml`, und die Ordner
   `game` und `public`. **Nicht** `node_modules`.
5. Unten auf **Commit changes**

**Schritt 2 – Bei Render deployen**

1. Auf render.com anmelden, am einfachsten mit dem GitHub-Konto
2. **New** → **Web Service** → dein Repository auswählen
3. Render erkennt das Dockerfile von selbst. Plan auf **Free** lassen.
4. **Create Web Service**

Nach ein paar Minuten steht oben eine Adresse wie
`https://trinkspiele-xyz.onrender.com`. Das ist der Link für alle – dein PC kann
aus bleiben.

**Eine Eigenheit des Gratis-Tarifs:** Nach etwa 15 Minuten ohne Zugriff schläft
der Server ein. Der Erste, der den Link dann öffnet, wartet knapp eine Minute,
danach läuft alles normal. Für einen Spieleabend völlig ausreichend.

## Aufbau

```
server.js        Web-Server und Lobby-Verwaltung in einem
game/
  deck.js        Kartendeck, Mischen, Ziehen
  engine.js      Die Spielregeln
  actions.js     Aktionen anwenden und prüfen
public/
  index.html
  style.css
  app.js         Die Oberfläche
test.js          Automatische Prüfung der Regeln
Dockerfile       Für Railway, Fly.io, Render
```

Der Ordner `game/` wird sowohl vom Server als auch direkt vom Browser geladen.
Dadurch gibt es die Spielregeln nur einmal – lokales und Online-Spiel können
nicht auseinanderlaufen.

Kein Build-Schritt, kein Bundler, kein TypeScript. Eine einzige Abhängigkeit.

## Warum niemand schummeln kann

Im Online-Modus schickt der Browser nur Aktionen wie "ich rate Rot". Der Server
prüft, ob du überhaupt dran bist, rechnet selbst und schickt den neuen Stand an
alle. Eine manipulierte Seite kann dadurch nichts erzwingen.

## Getestet

`npm test` spielt die Regeln automatisch durch:

- **Kartendeck:** 52 Karten, jede genau einmal. Über 100.000 Mischungen landet jede
  Karte gleich häufig auf jeder Position (Chi-Quadrat 48,1 bei Grenze 68,7).
- **200 komplette Partien** mit 2 bis 8 Spielern. 4.967 Deck-Prüfungen – keine Karte
  lag je doppelt auf dem Tisch, und die Pyramide benutzt nie eine Karte, die vor
  einem Spieler liegt.
- **Pyramiden-Wege:** Für jede Position geprüft, dass am Rand genau ein Weg nach oben
  führt und in der Mitte zwei, und dass der gelaufene Weg lückenlos angrenzt.
- **Schummelschutz:** 6.681 erlaubte Züge durchgelassen, 14.465 unerlaubte blockiert –
  fremde Karten ablegen, außer der Reihe raten, sich selbst Schlucke geben, nicht
  angrenzende Pyramidenkarten.

Zusätzlich geprüft: alle Dateien werden korrekt ausgeliefert, Ausbruch aus dem
Ordner wird blockiert, jeder Knopf in der Oberfläche hat eine Funktion.

**Nicht getestet:** Die Socket-Verbindung selbst und die Darstellung im echten
Browser – dafür fehlte in meiner Umgebung der npm-Zugriff. Der erste echte Test
passiert bei dir.
