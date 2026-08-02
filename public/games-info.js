// Name, Bild und Regeln der einzelnen Spiele.
//
// Steht bewusst getrennt von der Spiellogik: Kommt ein Spiel dazu, wird hier
// ein Eintrag ergaenzt und die Auswahl zeigt es automatisch mit an.

import { MIN_EINSATZ, MAX_EINSATZ, ZIEL, STRECKENKARTEN } from "/game/race.js";

export const SPIELE = [
  {
    id: "bus",
    name: "Busfahren",
    kurz: "Raten, ablegen, Pyramide – der Letzte fährt Bus.",
    dauer: "ca. 15 Min.",
  },
  {
    id: "race",
    name: "Pferderennen",
    kurz: "Auf ein Ass setzen und hoffen, dass es zuerst im Ziel ist.",
    dauer: "ca. 5 Min.",
  },
];

// --- Bilder ----------------------------------------------------------------
// Kleine Zeichnungen direkt als SVG: keine Bilddateien, nichts nachzuladen,
// auch bei schlechtem Empfang sofort da.

const karte = (x, y, dreh, zeichen, rot) => `
  <g transform="translate(${x} ${y}) rotate(${dreh})">
    <rect x="-11" y="-15" width="22" height="30" rx="3.5" fill="#FFFDF8" stroke="#E2DCCF"/>
    <text x="0" y="6" text-anchor="middle" font-size="16" font-weight="bold"
          fill="${rot ? "#E8324A" : "#1A1630"}" font-family="serif">${zeichen}</text>
  </g>`;

const ruecken = (x, y, dreh = 0) => `
  <g transform="translate(${x} ${y}) rotate(${dreh})">
    <rect x="-11" y="-15" width="22" height="30" rx="3.5" fill="#5A41C8" stroke="#8B6BFF"/>
    <rect x="-7.5" y="-11.5" width="15" height="23" rx="2" fill="none" stroke="#B9A6FF" stroke-width="1.2"/>
  </g>`;

const BILDER = {
  // Pyramide aus verdeckten Karten, oben eine offene Bildkarte.
  bus: `
    <svg viewBox="0 0 200 116" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${ruecken(58, 96)} ${ruecken(84, 96)} ${ruecken(110, 96)} ${ruecken(136, 96)}
      ${ruecken(71, 62)} ${ruecken(97, 62)} ${ruecken(123, 62)}
      ${ruecken(84, 28)} ${karte(110, 28, 0, "♦", true)}
      <text x="16" y="40" font-size="26">🚌</text>
    </svg>`,

  // Vier Bahnen, die Asse am Start, rechts die Ziellinie.
  race: `
    <svg viewBox="0 0 200 116" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="4" width="200" height="108" rx="10" fill="#16694F"/>
      ${[0, 1, 2, 3]
        .map(
          (i) =>
            `<line x1="10" y1="${29 + i * 26}" x2="190" y2="${29 + i * 26}"
               stroke="#0E5540" stroke-width="1.5" stroke-dasharray="6 5"/>`
        )
        .join("")}
      ${karte(34, 20, -5, "♥", true)}
      ${karte(30, 46, 4, "♦", true)}
      ${karte(44, 72, -3, "♣", false)}
      ${karte(26, 96, 2, "♠", false)}
      ${ruecken(104, 16, 6)} ${ruecken(132, 58, -5)} ${ruecken(118, 96, 3)}
      ${[0, 1, 2, 3, 4, 5, 6, 7]
        .map(
          (r) =>
            `<rect x="170" y="${6 + r * 13}" width="9" height="13" fill="${r % 2 ? "#F8F5FF" : "#1A1630"}"/>
             <rect x="179" y="${6 + r * 13}" width="9" height="13" fill="${r % 2 ? "#1A1630" : "#F8F5FF"}"/>`
        )
        .join("")}
    </svg>`,
};

export const spielBild = (id) => BILDER[id] ?? "";

// --- Regeln ----------------------------------------------------------------
// Die Zahlen kommen aus der Spiellogik, damit Text und Regeln nie
// auseinanderlaufen.

const EINSATZ = `${MIN_EINSATZ} bis ${MAX_EINSATZ} Schlücke`;

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
    <p>Vor dem Start setzt jeder <strong>${EINSATZ}</strong> auf ein Pferd –
    und trinkt sie direkt. Auch die, die später gewinnen: Der Einsatz ist weg,
    sobald er gesetzt ist.</p>
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

export const regelnHtml = (id) => REGELN[id] ?? "<p>Für dieses Spiel gibt es noch keine Erklärung.</p>";
