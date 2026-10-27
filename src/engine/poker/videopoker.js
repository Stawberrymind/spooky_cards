import { fullDeck, shuffle } from '../cards.js';
import { score5, categoryOf, pokerValue } from './hands.js';

// Jacks or Better video poker, full-pay 9/6 table. Bet 1–5 souls, get five
// cards, hold any of them, draw once. A pair of Jacks or better pays.

export const PAYTABLE = [
  { id: 'royal', name: 'Royal Flush', pays: 250, max: 800 },
  { id: 'straight-flush', name: 'Straight Flush', pays: 50 },
  { id: 'quads', name: 'Four of a Kind', pays: 25 },
  { id: 'full-house', name: 'Full House', pays: 9 },
  { id: 'flush', name: 'Flush', pays: 6 },
  { id: 'straight', name: 'Straight', pays: 4 },
  { id: 'trips', name: 'Three of a Kind', pays: 3 },
  { id: 'two-pair', name: 'Two Pair', pays: 2 },
  { id: 'jacks', name: 'Jacks or Better', pays: 1 },
];
export const MAX_BET = 5;

/** Which pay table row five cards hit, or null. */
export function payline(cards) {
  const score = score5(cards);
  const category = categoryOf(score);
  const top = Math.floor(score / 15 ** 4) % 15; // highest tie-breaker: the pair's rank for one pair
  const byCategory = {
    8: top === 14 ? 'royal' : 'straight-flush',
    7: 'quads',
    6: 'full-house',
    5: 'flush',
    4: 'straight',
    3: 'trips',
    2: 'two-pair',
    1: top >= 11 ? 'jacks' : null,
  };
  const id = byCategory[category] ?? null;
  return id ? PAYTABLE.find((row) => row.id === id) : null;
}

export function payout(row, bet) {
  if (!row) return 0;
  return row.max && bet === MAX_BET ? row.max * bet : row.pays * bet;
}

export class VideoPoker {
  constructor({ seed = Date.now(), bank = 200 } = {}) {
    this.rngState = seed >>> 0;
    this.bank = bank;
    this.bet = 1;
    this.hand = [];
    this.held = [false, false, false, false, false];
    this.phase = 'bet'; // bet → hold → done
    this.result = null;
  }

  random() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  setBet(n) {
    if (this.phase === 'hold') return false;
    this.bet = Math.max(1, Math.min(MAX_BET, n, this.bank || 1));
    return true;
  }

  canDeal() {
    return this.phase !== 'hold' && this.bet <= this.bank;
  }

  deal() {
    if (!this.canDeal()) return null;
    this.bank -= this.bet;
    this.deck = shuffle(fullDeck(), () => this.random()).map((c) => ({ ...c, faceUp: true }));
    this.hand = this.deck.splice(0, 5);
    this.held = [false, false, false, false, false];
    this.phase = 'hold';
    this.result = null;
    return { hand: this.hand, line: payline(this.hand) };
  }

  toggle(i) {
    if (this.phase !== 'hold') return false;
    this.held[i] = !this.held[i];
    return true;
  }

  draw() {
    if (this.phase !== 'hold') return null;
    const replaced = [];
    this.hand = this.hand.map((card, i) => {
      if (this.held[i]) return card;
      const fresh = this.deck.shift();
      replaced.push(i);
      return fresh;
    });
    const line = payline(this.hand);
    const won = payout(line, this.bet);
    this.bank += won;
    this.phase = 'done';
    this.result = { line, won, bet: this.bet };
    return { hand: this.hand, replaced, line, won };
  }

  /**
   * A simple, decent strategy for the Hint button: keep any paying hand,
   * then four to a flush or straight flush, then a low pair, then high cards.
   */
  suggestHolds(hand) {
    const line = payline(hand);
    const values = hand.map(pokerValue);
    const counts = new Map();
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    if (line && ['royal', 'straight-flush', 'full-house', 'flush', 'straight'].includes(line.id)) return hand.map(() => true);
    if (line && ['quads', 'trips', 'two-pair', 'jacks'].includes(line.id)) return values.map((v) => counts.get(v) > 1);
    const bySuit = new Map();
    hand.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]));
    const flushDraw = [...bySuit.values()].find((idx) => idx.length === 4);
    if (flushDraw) return hand.map((_, i) => flushDraw.includes(i));
    const lowPair = values.find((v) => counts.get(v) === 2);
    if (lowPair) return values.map((v) => v === lowPair);
    // Four to an open straight.
    const unique = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 0; i + 3 < unique.length; i++) {
      if (unique[i + 3] - unique[i] === 3) {
        const keep = new Set(unique.slice(i, i + 4));
        const used = new Set();
        return values.map((v) => (keep.has(v) && !used.has(v) ? (used.add(v), true) : false));
      }
    }
    const high = values.map((v) => v >= 11);
    return high.filter(Boolean).length <= 2 ? high : values.map((v) => v >= 11 && v === Math.max(...values.filter((x) => x >= 11)));
  }
}
