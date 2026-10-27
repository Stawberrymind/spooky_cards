import { rankValue, fullDeck, shuffle, mulberry32 } from './cards.js';
import { SolitaireBase } from './base.js';

// Golf. Seven columns of five face-up cards. Play the top card of any column
// onto the waste if it is one rank above or below the waste card (no wrapping,
// and nothing goes on a King). Clear every column before the stock runs out.

export const COLUMN_IDS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
const POINTS = { perStreak: 10, clear: 500 };

export class Golf extends SolitaireBase {
  static id = 'golf';
  static title = 'Golf';

  constructor({ seed = Date.now() } = {}) {
    super({ seed });
    this.streak = 0;
    this.bestStreak = 0;
    const deck = shuffle(fullDeck(), mulberry32(this.seed)).map((c) => ({ ...c, faceUp: true }));
    this.piles = {};
    COLUMN_IDS.forEach((id) => { this.piles[id] = deck.splice(0, 5); });
    this.piles.waste = [deck.pop()];
    this.piles.stock = deck.map((c) => ({ ...c, faceUp: false }));
  }

  layout() {
    const piles = {};
    COLUMN_IDS.forEach((id, i) => { piles[id] = { x: i, y: 0, fan: 'down', slot: 'tableau' }; });
    piles.stock = { x: 2, y: 2.45, fan: 'deck', slot: 'stock' };
    piles.waste = { x: 4, y: 2.45, fan: 'stack', slot: 'foundation' };
    return { cols: 7, rows: 3.6, piles, cascade: ['waste'] };
  }

  stateKeys() {
    return ['streak', 'bestStreak'];
  }

  dealOrder() {
    const out = [];
    for (let row = 0; row < 5; row++) for (const id of COLUMN_IDS) out.push(this.piles[id][row]);
    return [...out, this.piles.waste[0]];
  }

  canDraw() {
    return this.piles.stock.length > 0;
  }

  draw() {
    if (!this.canDraw()) return null;
    this.snapshot();
    const card = { ...this.piles.stock.pop(), faceUp: true };
    this.piles.waste.push(card);
    this.moves += 1;
    this.streak = 0;
    return { recycled: false, cards: [card], points: 0 };
  }

  grabbable(pileId, index) {
    const pile = this.piles[pileId];
    if (!pileId.startsWith('t') || !pile?.length || index !== pile.length - 1) return null;
    return [pile[index]];
  }

  canPlace(cards, toId) {
    if (toId !== 'waste' || cards?.length !== 1) return false;
    const top = this.top('waste');
    if (!top) return true;
    if (top.rank === 'K') return false;
    return Math.abs(rankValue(cards[0]) - rankValue(top)) === 1;
  }

  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const cards = this.piles[fromId].splice(index);
    this.piles.waste.push(...cards);
    this.moves += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += POINTS.perStreak * this.streak;
    if (this.isWon()) this.score += POINTS.clear + this.piles.stock.length * 20;
    return { cards, flipped: [], home: true, streak: this.streak, points: this.score - before };
  }

  bestTarget(fromId, index) {
    return this.canMove(fromId, index, 'waste') ? 'waste' : null;
  }

  hints() {
    const out = COLUMN_IDS
      .filter((id) => this.piles[id].length && this.canMove(id, this.piles[id].length - 1, 'waste'))
      .map((fromId) => ({ fromId, index: this.piles[fromId].length - 1, toId: 'waste', weight: this.piles[fromId].length }));
    out.sort((a, b) => b.weight - a.weight);
    if (!out.length && this.canDraw()) out.push({ draw: true, weight: 0 });
    return out;
  }

  isWon() {
    return COLUMN_IDS.every((id) => !this.piles[id].length);
  }
}
