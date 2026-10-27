import { rankValue, fullDeck, shuffle, mulberry32 } from './cards.js';
import { SolitaireBase } from './base.js';

// Pyramid. 28 cards in seven overlapping rows, 'p0'..'p27'. Remove pairs that
// add up to 13 (Jack 11, Queen 12; a King is 13 on its own). A card is free
// once both cards overlapping it from the row below are gone. Draw from the
// stock onto the waste; the stock can be gone through three times.

const ROWS = 7;
const SPOTS = [];
for (let r = 0; r < ROWS; r++) for (let i = 0; i <= r; i++) SPOTS.push({ row: r, x: (ROWS - 1 - r) / 2 + i });
export const PYRAMID_IDS = SPOTS.map((_, i) => `p${i}`);
const COVERED_BY = SPOTS.map((s) => SPOTS
  .map((o, j) => (o.row === s.row + 1 && Math.abs(o.x - s.x) === 0.5 ? j : -1))
  .filter((j) => j !== -1));
const PASSES = 3;
const POINTS = { pair: 10, king: 10, row: 25, clear: 500 };

export class Pyramid extends SolitaireBase {
  static id = 'pyramid';
  static title = 'Pyramid';

  constructor({ seed = Date.now() } = {}) {
    super({ seed });
    this.passes = 1;
    const deck = shuffle(fullDeck(), mulberry32(this.seed)).map((c) => ({ ...c, faceUp: true }));
    this.piles = {};
    PYRAMID_IDS.forEach((id) => { this.piles[id] = [deck.pop()]; });
    this.piles.stock = deck.map((c) => ({ ...c, faceUp: false }));
    this.piles.waste = [];
    this.piles.discard = [];
  }

  layout() {
    const piles = {};
    PYRAMID_IDS.forEach((id, i) => { piles[id] = { x: SPOTS[i].x, y: SPOTS[i].row * 0.5, fan: 'stack', slot: null }; });
    piles.stock = { x: 0, y: 0, fan: 'deck', slot: 'stock' };
    piles.waste = { x: 1, y: 0, fan: 'stack', slot: 'tableau' };
    piles.discard = { x: 6, y: 0, fan: 'stack', slot: 'foundation', label: '13' };
    return { cols: 7, rows: (ROWS - 1) * 0.5 + 1.2, piles, cascade: ['discard'] };
  }

  stateKeys() {
    return ['passes'];
  }

  dealOrder() {
    return PYRAMID_IDS.map((id) => this.piles[id][0]);
  }

  isFree(i) {
    return this.piles[PYRAMID_IDS[i]].length > 0 && COVERED_BY[i].every((j) => !this.piles[PYRAMID_IDS[j]].length);
  }

  // ---- stock ---------------------------------------------------------------

  canDraw() {
    return this.piles.stock.length > 0 || (this.passes < PASSES && this.piles.waste.length > 0);
  }

  draw() {
    if (!this.canDraw()) return null;
    this.snapshot();
    this.moves += 1;
    const { stock, waste } = this.piles;
    if (!stock.length) {
      while (waste.length) stock.push({ ...waste.pop(), faceUp: false });
      this.passes += 1;
      return { recycled: true, cards: [], points: 0 };
    }
    const card = { ...stock.pop(), faceUp: true };
    waste.push(card);
    return { recycled: false, cards: [card], points: 0 };
  }

  // ---- pairing ---------------------------------------------------------------

  grabbable(pileId, index) {
    const pile = this.piles[pileId];
    if (!pile?.length || index !== pile.length - 1) return null;
    if (pileId === 'waste') return [pile[index]];
    if (pileId.startsWith('p') && this.isFree(Number(pileId.slice(1)))) return [pile[index]];
    return null;
  }

  canPlace(cards, toId) {
    if (cards?.length !== 1) return false;
    if (toId === 'discard') return rankValue(cards[0]) === 13;
    const target = this.top(toId);
    if (!target || target === cards[0] || !this.grabbable(toId, this.piles[toId].length - 1)) return false;
    return rankValue(cards[0]) + rankValue(target) === 13;
  }

  /** Dropping a card on its partner sends both to the discard pile. */
  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const rowsBefore = this.clearedRows();
    const cards = [this.piles[fromId].pop()];
    if (toId !== 'discard') cards.push(this.piles[toId].pop());
    this.piles.discard.push(...cards);
    this.moves += 1;
    this.score += cards.length === 2 ? POINTS.pair : POINTS.king;
    const rows = this.clearedRows() - rowsBefore;
    this.score += rows * POINTS.row;
    if (this.isWon()) this.score += POINTS.clear;
    return { cards, flipped: [], home: true, homeId: 'discard', points: this.score - before };
  }

  clearedRows() {
    let n = 0;
    let start = 0;
    for (let r = 0; r < ROWS; r++) {
      if (PYRAMID_IDS.slice(start, start + r + 1).every((id) => !this.piles[id].length)) n += 1;
      start += r + 1;
    }
    return n;
  }

  bestTarget(fromId, index) {
    const cards = this.grabbable(fromId, index);
    if (!cards) return null;
    if (this.canPlace(cards, 'discard')) return 'discard';
    return this.partners().find((id) => id !== fromId && this.canPlace(cards, id)) ?? null;
  }

  /** Piles whose top card could be paired right now. */
  partners() {
    return [...PYRAMID_IDS.filter((_, i) => this.isFree(i)), ...(this.piles.waste.length ? ['waste'] : [])];
  }

  hints() {
    const out = [];
    const free = this.partners();
    for (const fromId of free) {
      const index = this.piles[fromId].length - 1;
      if (this.canMove(fromId, index, 'discard')) out.push({ fromId, index, toId: 'discard', weight: 2 });
      for (const toId of free) {
        if (toId > fromId && this.canMove(fromId, index, toId)) out.push({ fromId, index, toId, weight: fromId === 'waste' || toId === 'waste' ? 1 : 2 });
      }
    }
    out.sort((a, b) => b.weight - a.weight);
    if (!out.length && this.canDraw()) out.push({ draw: true, weight: 0 });
    return out;
  }

  isWon() {
    return PYRAMID_IDS.every((id) => !this.piles[id].length);
  }
}
