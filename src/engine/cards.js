// Cards: { id, rank: 'A' | '2'..'9' | 'T' | 'J' | 'Q' | 'K', suit: 'clubs' | 'diamonds' | 'hearts' | 'spades' }

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

/** Ace = 1 ... King = 13 */
export function rankValue(card) {
  return RANKS.indexOf(card.rank) + 1;
}

export function rankLabel(card) {
  return card.rank === 'T' ? '10' : card.rank;
}

export function isRed(card) {
  return card.suit === 'hearts' || card.suit === 'diamonds';
}

export function fullDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${rank}${suit[0]}`, rank, suit });
  return deck;
}

export function shuffle(deck, rng) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Small seedable PRNG so deals can be replayed (daily seeds, tests). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
