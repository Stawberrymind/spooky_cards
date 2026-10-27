import { rankValue, shuffle, mulberry32, SUITS } from './cards.js';
import { SolitaireBase, decks } from './base.js';

// Spider, two decks. Piles: 'stock', 'f0'..'f7' (completed runs), 't0'..'t9'.
// Build down regardless of suit, but only same-suit runs move together. A full
// King-to-Ace run of one suit leaves the table on its own.

export const TABLEAU_IDS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'];
export const FOUNDATION_IDS = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];

const SUIT_SETS = { 1: ['spades'], 2: ['spades', 'hearts'], 4: SUITS };
// Windows scoring: start at 500, lose one per move, +100 per run laid to rest.
const POINTS = { start: 500, move: -1, run: 100 };

export class Spider extends SolitaireBase {
  static id = 'spider';
  static title = 'Spider';

  constructor({ seed = Date.now(), suits = 1 } = {}) {
    super({ seed });
    this.suits = SUIT_SETS[suits] ? suits : 1;
    this.score = POINTS.start;
    const deck = shuffle(decks(2, SUIT_SETS[this.suits]), mulberry32(this.seed));
    this.piles = { stock: [] };
    FOUNDATION_IDS.forEach((id) => { this.piles[id] = []; });
    TABLEAU_IDS.forEach((id, i) => {
      const pile = deck.splice(0, i < 4 ? 6 : 5);
      pile[pile.length - 1].faceUp = true;
      this.piles[id] = pile;
    });
    this.piles.stock = deck;
  }

  layout() {
    const piles = { stock: { x: 0, y: 0, fan: 'deck', slot: 'stock' } };
    FOUNDATION_IDS.forEach((id, i) => { piles[id] = { x: 2 + i, y: 0, fan: 'stack', slot: 'foundation', label: 'K' }; });
    TABLEAU_IDS.forEach((id, i) => { piles[id] = { x: i, y: 1.2, fan: 'down', slot: 'tableau' }; });
    return { cols: 10, rows: 3.6, piles, cascade: FOUNDATION_IDS };
  }

  options() {
    return { suits: this.suits };
  }

  // ---- stock: one card onto every column ----------------------------------

  canDraw() {
    return this.piles.stock.length > 0 && TABLEAU_IDS.every((id) => this.piles[id].length);
  }

  draw() {
    if (!this.canDraw()) return null;
    this.snapshot();
    const before = this.score;
    const cards = TABLEAU_IDS.map((id) => {
      const card = { ...this.piles.stock.pop(), faceUp: true };
      this.piles[id].push(card);
      return card;
    });
    this.moves += 1;
    this.score += POINTS.move;
    // A deal can finish a run.
    const completed = TABLEAU_IDS.map((id) => this.collect(id)).find(Boolean) ?? null;
    return { recycled: false, cards, completed, points: this.score - before };
  }

  // ---- moving cards --------------------------------------------------------

  grabbable(pileId, index) {
    const pile = this.piles[pileId];
    if (!pile || !pileId.startsWith('t') || index < 0 || index >= pile.length) return null;
    const run = pile.slice(index);
    if (!run[0].faceUp) return null;
    for (let i = 1; i < run.length; i++) {
      if (run[i].suit !== run[0].suit || rankValue(run[i]) !== rankValue(run[i - 1]) - 1) return null;
    }
    return run;
  }

  canPlace(cards, toId) {
    if (!cards?.length || !toId.startsWith('t')) return false;
    const target = this.top(toId);
    return !target || (target.faceUp && rankValue(cards[0]) === rankValue(target) - 1);
  }

  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const cards = this.piles[fromId].splice(index);
    this.piles[toId].push(...cards);
    this.moves += 1;
    this.score += POINTS.move;
    const flipped = this.flipTop(fromId);
    const completed = this.collect(toId);
    return { cards, flipped, home: false, completed, points: this.score - before };
  }

  flipTop(pileId) {
    const top = this.top(pileId);
    if (top && !top.faceUp) {
      top.faceUp = true;
      return [top];
    }
    return [];
  }

  /** If a column now ends in K..A of one suit, send that run to a foundation. */
  collect(pileId) {
    const pile = this.piles[pileId];
    if (pile.length < 13) return null;
    const run = pile.slice(-13);
    const suit = run[0].suit;
    const ok = run.every((c, i) => c.faceUp && c.suit === suit && rankValue(c) === 13 - i);
    if (!ok) return null;
    const toId = FOUNDATION_IDS.find((id) => !this.piles[id].length);
    pile.splice(-13);
    this.piles[toId].push(...run);
    this.score += POINTS.run;
    return { toId, fromId: pileId, cards: run, flipped: this.flipTop(pileId) };
  }

  /** Same suit first, then any card, then an empty column. */
  bestTarget(fromId, index) {
    const cards = this.grabbable(fromId, index);
    if (!cards) return null;
    const targets = TABLEAU_IDS.filter((id) => id !== fromId && this.canPlace(cards, id));
    const sameSuit = targets.find((id) => this.top(id)?.suit === cards[0].suit);
    const filled = targets.find((id) => this.piles[id].length);
    const wholeColumn = index === 0;
    return sameSuit ?? filled ?? (wholeColumn ? null : targets[0]) ?? null;
  }

  hints() {
    const out = [];
    for (const fromId of TABLEAU_IDS) {
      const pile = this.piles[fromId];
      pile.forEach((_, index) => {
        const run = this.grabbable(fromId, index);
        if (!run) return;
        const below = pile[index - 1];
        const reveals = below && !below.faceUp;
        const onParent = below?.faceUp && rankValue(below) === rankValue(run[0]) + 1;
        const onSameSuitParent = onParent && below.suit === run[0].suit;
        for (const toId of TABLEAU_IDS) {
          if (!this.canMove(fromId, index, toId)) continue;
          const target = this.top(toId);
          const joinsSuit = target?.suit === run[0].suit;
          if (!target && index === 0) continue; // whole column to an empty one
          if (onSameSuitParent) continue; // would break a run
          if (onParent && !joinsSuit) continue; // sideways
          out.push({ fromId, index, toId, weight: (joinsSuit ? 2 : 0) + (reveals ? 1.5 : 0) + (!below ? 1 : 0) + (target ? 0.5 : 0) });
        }
      });
    }
    out.sort((a, b) => b.weight - a.weight);
    if (!out.length && this.canDraw()) out.push({ draw: true, weight: 0 });
    return out;
  }

  isWon() {
    return FOUNDATION_IDS.every((id) => this.piles[id].length === 13);
  }
}
