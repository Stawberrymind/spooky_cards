import { rankValue, isRed, fullDeck, shuffle, mulberry32 } from './cards.js';
import { SolitaireBase, FOUNDATION_SUIT_HINT } from './base.js';
import { lowestHomeMove } from './klondike.js';

// FreeCell. Every card is dealt face up. Piles: 'c0'..'c3' (free cells),
// 'f0'..'f3' (foundations), 't0'..'t7' (tableau). Runs can be moved as long
// as there are enough free cells and empty columns to shuffle them across.

export const CELL_IDS = ['c0', 'c1', 'c2', 'c3'];
export const FOUNDATION_IDS = ['f0', 'f1', 'f2', 'f3'];
export const TABLEAU_IDS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];

const POINTS = { toFoundation: 10, foundationToTableau: -15 };

export class FreeCell extends SolitaireBase {
  static id = 'freecell';
  static title = 'FreeCell';

  constructor({ seed = Date.now() } = {}) {
    super({ seed });
    const deck = shuffle(fullDeck(), mulberry32(this.seed)).map((c) => ({ ...c, faceUp: true }));
    this.piles = {};
    CELL_IDS.forEach((id) => { this.piles[id] = []; });
    FOUNDATION_IDS.forEach((id) => { this.piles[id] = []; });
    TABLEAU_IDS.forEach((id, i) => { this.piles[id] = deck.splice(0, i < 4 ? 7 : 6); });
  }

  layout() {
    const piles = {};
    CELL_IDS.forEach((id, i) => { piles[id] = { x: i, y: 0, fan: 'stack', slot: 'cell' }; });
    FOUNDATION_IDS.forEach((id, i) => { piles[id] = { x: 4 + i, y: 0, fan: 'stack', slot: 'foundation', label: FOUNDATION_SUIT_HINT[i] }; });
    TABLEAU_IDS.forEach((id, i) => { piles[id] = { x: i, y: 1.2, fan: 'down', slot: 'tableau' }; });
    return { cols: 8, rows: 3.6, piles, cascade: FOUNDATION_IDS };
  }

  dealOrder() {
    const out = [];
    for (let row = 0; row < 7; row++) {
      for (const id of TABLEAU_IDS) if (this.piles[id][row]) out.push(this.piles[id][row]);
    }
    return out;
  }

  /** How many cards can move at once: (free cells + 1) × 2^(empty columns). */
  capacity(toEmptyColumn = false) {
    const cells = CELL_IDS.filter((id) => !this.piles[id].length).length;
    const empty = TABLEAU_IDS.filter((id) => !this.piles[id].length).length - (toEmptyColumn ? 1 : 0);
    return (cells + 1) * 2 ** Math.max(0, empty);
  }

  grabbable(pileId, index) {
    const pile = this.piles[pileId];
    if (!pile || index < 0 || index >= pile.length) return null;
    if (!pileId.startsWith('t')) return index === pile.length - 1 ? [pile[index]] : null;
    const run = pile.slice(index);
    for (let i = 1; i < run.length; i++) {
      if (rankValue(run[i]) !== rankValue(run[i - 1]) - 1 || isRed(run[i]) === isRed(run[i - 1])) return null;
    }
    return run.length <= this.capacity() ? run : null;
  }

  canPlace(cards, toId) {
    if (!cards?.length) return false;
    const lead = cards[0];
    const target = this.top(toId);
    if (toId.startsWith('c')) return cards.length === 1 && !target;
    if (toId.startsWith('f')) {
      if (cards.length !== 1) return false;
      if (!target) return lead.rank === 'A';
      return target.suit === lead.suit && rankValue(lead) === rankValue(target) + 1;
    }
    if (toId.startsWith('t')) {
      if (!target) return cards.length <= this.capacity(true);
      return isRed(target) !== isRed(lead) && rankValue(lead) === rankValue(target) - 1;
    }
    return false;
  }

  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const cards = this.piles[fromId].splice(index);
    this.piles[toId].push(...cards);
    this.moves += 1;
    if (toId.startsWith('f')) this.score += POINTS.toFoundation;
    else if (fromId.startsWith('f')) this.score = Math.max(0, this.score + POINTS.foundationToTableau);
    return { cards, flipped: [], home: toId.startsWith('f'), points: this.score - before };
  }

  /** Foundation, then a column with cards, then an empty column, then a free cell. */
  bestTarget(fromId, index) {
    const cards = this.grabbable(fromId, index);
    if (!cards) return null;
    if (cards.length === 1 && !fromId.startsWith('f')) {
      const f = FOUNDATION_IDS.find((id) => this.canPlace(cards, id));
      if (f) return f;
    }
    const columns = TABLEAU_IDS.filter((id) => id !== fromId && this.canPlace(cards, id));
    const filled = columns.find((id) => this.piles[id].length);
    if (filled) return filled;
    const wholeColumn = fromId.startsWith('t') && index === 0;
    if (!wholeColumn && columns[0]) return columns[0];
    if (fromId.startsWith('t')) return CELL_IDS.find((id) => this.canPlace(cards, id)) ?? null;
    return null;
  }

  hints() {
    const out = [];
    for (const fromId of [...CELL_IDS, ...TABLEAU_IDS]) {
      const pile = this.piles[fromId];
      if (!pile.length) continue;
      const topIndex = pile.length - 1;
      const homeTo = FOUNDATION_IDS.find((id) => this.canMove(fromId, topIndex, id));
      if (homeTo) out.push({ fromId, index: topIndex, toId: homeTo, weight: 3 });
      const starts = fromId.startsWith('c') ? [0] : pile.map((_, i) => i).filter((i) => this.grabbable(fromId, i));
      for (const index of starts) {
        // Already sitting on a card it could legally sit on: moving it sideways gains nothing.
        const settled = index > 0 && fromId.startsWith('t')
          && rankValue(pile[index - 1]) === rankValue(pile[index]) + 1 && isRed(pile[index - 1]) !== isRed(pile[index]);
        for (const toId of TABLEAU_IDS) {
          if (!this.canMove(fromId, index, toId)) continue;
          const empty = !this.piles[toId].length;
          if (settled || (empty && index === 0 && fromId.startsWith('t'))) continue;
          out.push({ fromId, index, toId, weight: empty ? 0.5 : 2 });
        }
      }
    }
    // Parking a card in a free cell, unless it already sits where it belongs
    // (that just shuttles it back and forth).
    const cell = CELL_IDS.find((id) => !this.piles[id].length);
    if (cell) {
      for (const fromId of TABLEAU_IDS) {
        const pile = this.piles[fromId];
        const [below, topCard] = pile.slice(-2);
        if (pile.length < 2) continue;
        if (rankValue(below) === rankValue(topCard) + 1 && isRed(below) !== isRed(topCard)) continue;
        out.push({ fromId, index: pile.length - 1, toId: cell, weight: 0 });
      }
    }
    return out.sort((a, b) => b.weight - a.weight);
  }

  isWon() {
    return FOUNDATION_IDS.every((id) => this.piles[id].length === 13);
  }

  /** Every column runs high to low, so cards can just go home lowest first. */
  canAutoComplete() {
    return !this.isWon() && TABLEAU_IDS.every((id) => {
      const p = this.piles[id];
      return p.every((c, i) => i === 0 || rankValue(c) <= rankValue(p[i - 1]));
    });
  }

  nextAutoMove() {
    return lowestHomeMove(this, [...CELL_IDS, ...TABLEAU_IDS], FOUNDATION_IDS);
  }
}
