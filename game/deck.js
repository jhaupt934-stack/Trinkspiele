// Kartendeck. Reines JavaScript ohne Abhaengigkeiten - laeuft unveraendert
// im Browser und in Node, deshalb gibt es die Spielregeln nur einmal.

export const SUITS = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const RED = new Set(["hearts", "diamonds"]);
const SYMBOLS = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const NAMES_DE = { hearts: "Herz", diamonds: "Karo", clubs: "Kreuz", spades: "Pik" };

export const isRed = (card) => RED.has(card.suit);
export const suitSymbol = (suit) => SYMBOLS[suit];
export const suitName = (suit) => NAMES_DE[suit];

/** 2 = 2 ... Bube 11, Dame 12, Koenig 13, Ass 14 */
export const rankValue = (rank) => RANKS.indexOf(rank) + 2;

/** Frisches, geordnetes 52-Karten-Deck ohne Joker. */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

/** Fisher-Yates. Gibt ein neues Array zurueck, das Original bleibt unveraendert. */
export function shuffle(items, rng = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const createShuffledDeck = (rng) => shuffle(createDeck(), rng);

/** Zieht `count` Karten von oben. Liefert die gezogenen und den Rest. */
export const draw = (deck, count) => ({ drawn: deck.slice(0, count), rest: deck.slice(count) });
