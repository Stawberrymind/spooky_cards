import { rankValue, fullDeck, shuffle, mulberry32 } from './cards.js';
import { SolitaireBase } from './base.js';

// TriPeaks. 28 cards in three overlapping peaks, 'p0'..'p27', one card each.
// Clear a card by playing it onto the waste if it is one rank above or below
// (Kings and Aces wrap). Every card in a row without drawing grows the streak.

// Peak positions in card widths, row by row from the tips down.
const ROWS = [
  [1.5, 4.5, 7.5],
  [1, 2, 4, 5, 7, 8],
  [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
];
const ROW_STEP = 0.5;
const SPOTS = ROWS.flatMap((xs, row) => xs.map((x) => ({ row, x })));
export const PEAK_IDS = SPOTS.map((_, i) => `p${i}`);
// Each spot is pinned by the (up to two) cards overlapping it from the row below.
const COVERED_BY = SPOTS.map((s) => SPOTS
  .map((o, j) => (o.row === s.row + 1 && Math.abs(o.x - s.x) === 0.5 ? j : -1))
  .filter((j) => j !== -1));
const TIPS = [0, 1, 2];

const POINTS = { perStreak: 10, peak: 150, clear: 500 };

export class TriPeaks extends SolitaireBase {
  static id = 'tripeaks';
  static title = 'TriPeaks';

  constructor({ seed = Date.now() } = {}) {
    super({ seed });
    this.streak = 0;
    this.bestStreak = 0;
    const deck = shuffle(fullDeck(), mulberry32(this.seed)).map((c) => ({ ...c, faceUp: false }));
    this.piles = {};
    PEAK_IDS.forEach((id, i) => {
      const card = deck.pop();
      card.faceUp = SPOTS[i].row === ROWS.length - 1;
      this.piles[id] = [card];
    });
    this.piles.waste = [{ ...deck.pop(), faceUp: true }];
    this.piles.stock = deck;
  }

  layout() {
    const piles = {};
    PEAK_IDS.forEach((id, i) => { piles[id] = { x: SPOTS[i].x, y: SPOTS[i].row * ROW_STEP, fan: 'stack', slot: null }; });
    const deckY = (ROWS.length - 1) * ROW_STEP + 1.25;
    piles.stock = { x: 3.25, y: deckY, fan: 'deck', slot: 'stock' };
    piles.waste = { x: 5.25, y: deckY, fan: 'stack', slot: 'foundation' };
    return { cols: 10, rows: deckY + 1.15, piles, cascade: ['waste', 'stock'] };
  }

  stateKeys() {
    return ['streak', 'bestStreak'];
  }

  dealOrder() {
    return [...PEAK_IDS.map((id) => this.piles[id][0]), this.piles.waste[0]];
  }

  isFree(i) {
    return this.piles[PEAK_IDS[i]].length > 0 && COVERED_BY[i].every((j) => !this.piles[PEAK_IDS[j]].length);
  }

  // ---- stock ---------------------------------------------------------------

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

  // ---- moving cards --------------------------------------------------------

  grabbable(pileId, index) {
    if (!pileId.startsWith('p') || index !== 0) return null;
    const i = Number(pileId.slice(1));
    return this.isFree(i) ? [...this.piles[pileId]] : null;
  }

  canPlace(cards, toId) {
    if (toId !== 'waste' || cards?.length !== 1) return false;
    const top = this.top('waste');
    if (!top) return true;
    const diff = Math.abs(rankValue(cards[0]) - rankValue(top));
    return diff === 1 || diff === 12;
  }

  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const cards = this.piles[fromId].splice(0);
    this.piles.waste.push(...cards);
    this.moves += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += POINTS.perStreak * this.streak;

    const i = Number(fromId.slice(1));
    let peak = false;
    if (TIPS.includes(i)) {
      peak = true;
      this.score += this.isWon() ? POINTS.clear : POINTS.peak;
    }
    // Anything this card was pinning may now be free.
    const flipped = [];
    SPOTS.forEach((_, j) => {
      if (!COVERED_BY[j].includes(i) || !this.isFree(j)) return;
      const card = this.piles[PEAK_IDS[j]][0];
      if (!card.faceUp) {
        card.faceUp = true;
        flipped.push(card);
      }
    });
    return { cards, flipped, home: true, streak: this.streak, peak, points: this.score - before };
  }

  bestTarget(fromId, index) {
    return this.canMove(fromId, index, 'waste') ? 'waste' : null;
  }

  hints() {
    const out = [];
    PEAK_IDS.forEach((fromId, i) => {
      if (!this.canMove(fromId, 0, 'waste')) return;
      // Prefer cards that free others, and keep a run going if this one has a follow-up.
      const frees = SPOTS.filter((_, j) => COVERED_BY[j].includes(i)).length;
      out.push({ fromId, index: 0, toId: 'waste', weight: 1 + frees });
    });
    out.sort((a, b) => b.weight - a.weight);
    if (!out.length && this.canDraw()) out.push({ draw: true, weight: 0 });
    return out;
  }

  isWon() {
    return PEAK_IDS.every((id) => !this.piles[id].length);
  }
}
