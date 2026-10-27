import { rankValue, isRed, fullDeck, shuffle, mulberry32 } from './cards.js';
import { SolitaireBase, FOUNDATION_SUIT_HINT } from './base.js';

// Klondike. Piles: 'stock', 'waste', 'f0'..'f3' (foundations), 't0'..'t6' (tableau).

export const TABLEAU_IDS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
export const FOUNDATION_IDS = ['f0', 'f1', 'f2', 'f3'];

// Classic Windows scoring.
const POINTS = { wasteToTableau: 5, toFoundation: 10, flip: 5, foundationToTableau: -15, recycle: -100 };

export class Klondike extends SolitaireBase {
  static id = 'klondike';
  static title = 'Klondike';

  constructor({ seed = Date.now(), drawCount = 1 } = {}) {
    super({ seed });
    this.drawCount = drawCount;
    this.passes = 0;

    const deck = shuffle(fullDeck(), mulberry32(this.seed)).map((c) => ({ ...c, faceUp: false }));
    this.piles = { stock: [], waste: [] };
    FOUNDATION_IDS.forEach((id) => { this.piles[id] = []; });
    TABLEAU_IDS.forEach((id, i) => {
      const pile = deck.splice(0, i + 1);
      pile[pile.length - 1].faceUp = true;
      this.piles[id] = pile;
    });
    this.piles.stock = deck;
  }

  layout() {
    const piles = {
      stock: { x: 0, y: 0, fan: 'deck', slot: 'stock' },
      waste: { x: 1, y: 0, fan: 'waste', slot: null, fanCount: this.drawCount === 3 ? 3 : 1 },
    };
    FOUNDATION_IDS.forEach((id, i) => { piles[id] = { x: 3 + i, y: 0, fan: 'stack', slot: 'foundation', label: FOUNDATION_SUIT_HINT[i] }; });
    TABLEAU_IDS.forEach((id, i) => { piles[id] = { x: i, y: 1.2, fan: 'down', slot: 'tableau' }; });
    return { cols: 7, rows: 3.4, piles, cascade: FOUNDATION_IDS };
  }

  stateKeys() {
    return ['passes'];
  }

  options() {
    return { drawCount: this.drawCount };
  }

  static fromJSON(data) {
    // Saves from before there were several games kept these at the top level.
    if (!data.options) data = { ...data, options: { drawCount: data.drawCount }, extra: { passes: data.passes ?? 0 } };
    return super.fromJSON(data);
  }

  dealOrder() {
    const out = [];
    for (let row = 0; row < 7; row++) {
      TABLEAU_IDS.forEach((id, col) => { if (col >= row) out.push(this.piles[id][row]); });
    }
    return out;
  }

  // ---- stock ---------------------------------------------------------------

  canDraw() {
    return this.piles.stock.length > 0 || this.piles.waste.length > 0;
  }

  /** Flip cards from stock to waste, or recycle the waste when stock is empty. */
  draw() {
    if (!this.canDraw()) return null;
    this.snapshot();
    const { stock, waste } = this.piles;
    this.moves += 1;
    if (stock.length === 0) {
      while (waste.length) stock.push({ ...waste.pop(), faceUp: false });
      this.passes += 1;
      const penalty = this.drawCount === 1 ? POINTS.recycle : 0;
      const before = this.score;
      this.score = Math.max(0, this.score + penalty);
      return { recycled: true, cards: [], points: this.score - before };
    }
    const cards = [];
    for (let i = 0; i < this.drawCount && stock.length; i++) {
      const card = { ...stock.pop(), faceUp: true };
      waste.push(card);
      cards.push(card);
    }
    return { recycled: false, cards, points: 0 };
  }

  // ---- moving cards --------------------------------------------------------

  grabbable(pileId, index) {
    const pile = this.piles[pileId];
    if (!pile || index < 0 || index >= pile.length) return null;
    if (pileId === 'stock') return null;
    if (pileId === 'waste' || pileId.startsWith('f')) return index === pile.length - 1 ? [pile[index]] : null;
    const run = pile.slice(index);
    if (!run[0].faceUp) return null;
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1];
      const b = run[i];
      if (rankValue(b) !== rankValue(a) - 1 || isRed(a) === isRed(b)) return null;
    }
    return run;
  }

  canPlace(cards, toId) {
    if (!cards?.length) return false;
    const lead = cards[0];
    const target = this.top(toId);
    if (toId.startsWith('f')) {
      if (cards.length !== 1) return false;
      if (!target) return lead.rank === 'A';
      return target.suit === lead.suit && rankValue(lead) === rankValue(target) + 1;
    }
    if (toId.startsWith('t')) {
      if (!target) return lead.rank === 'K';
      return target.faceUp && isRed(target) !== isRed(lead) && rankValue(lead) === rankValue(target) - 1;
    }
    return false;
  }

  move(fromId, index, toId) {
    if (!this.canMove(fromId, index, toId)) return null;
    this.snapshot();
    const before = this.score;
    const from = this.piles[fromId];
    const cards = from.splice(index);
    this.piles[toId].push(...cards);
    this.moves += 1;

    if (toId.startsWith('f')) this.score += POINTS.toFoundation;
    else if (fromId === 'waste') this.score += POINTS.wasteToTableau;
    else if (fromId.startsWith('f')) this.score = Math.max(0, this.score + POINTS.foundationToTableau);

    const flipped = [];
    const newTop = from[from.length - 1];
    if (fromId.startsWith('t') && newTop && !newTop.faceUp) {
      newTop.faceUp = true;
      flipped.push(newTop);
      this.score += POINTS.flip;
    }
    return { cards, flipped, flipPoints: POINTS.flip, home: toId.startsWith('f'), points: this.score - before };
  }

  /** Foundation first, then tableau. */
  bestTarget(fromId, index) {
    const cards = this.grabbable(fromId, index);
    if (!cards) return null;
    if (cards.length === 1 && !fromId.startsWith('f')) {
      const f = FOUNDATION_IDS.find((id) => this.canPlace(cards, id));
      if (f) return f;
    }
    // Prefer a pile with cards over an empty column, and don't shuffle a King
    // from one empty-bottomed column to another.
    const targets = TABLEAU_IDS.filter((id) => id !== fromId && this.canPlace(cards, id));
    const kingAlreadyAtBottom = fromId.startsWith('t') && index === 0;
    return targets.find((id) => this.piles[id].length) ?? (kingAlreadyAtBottom ? null : targets[0]) ?? null;
  }

  // ---- helpers for the player ----------------------------------------------

  hints() {
    const out = [];
    const sources = ['waste', ...TABLEAU_IDS];
    for (const fromId of sources) {
      const pile = this.piles[fromId];
      if (!pile.length) continue;
      const topIndex = pile.length - 1;
      for (const toId of FOUNDATION_IDS) {
        if (this.canMove(fromId, topIndex, toId)) { out.push({ fromId, index: topIndex, toId, weight: 3 }); break; }
      }
      const starts = fromId === 'waste' ? [topIndex] : pile.map((_, i) => i).filter((i) => this.grabbable(fromId, i));
      for (const index of starts) {
        for (const toId of TABLEAU_IDS) {
          if (!this.canMove(fromId, index, toId)) continue;
          const revealsCard = fromId.startsWith('t') && index > 0 && !pile[index - 1].faceUp;
          // Moving a whole column onto an empty one, or a partial run sideways, gains nothing.
          if (fromId.startsWith('t') && !revealsCard && (index === 0 || pile[index - 1].faceUp)) {
            const emptiesColumn = index === 0 && !this.piles[toId].length;
            if (emptiesColumn || index > 0) continue;
          }
          out.push({ fromId, index, toId, weight: revealsCard ? 2 : 1 });
        }
      }
    }
    out.sort((a, b) => b.weight - a.weight);
    if (!out.length && this.canDraw()) out.push({ draw: true, weight: 0 });
    return out;
  }

  isWon() {
    return FOUNDATION_IDS.every((id) => this.piles[id].length === 13);
  }

  /** Everything is face up and the stock is gone: the rest is just busywork. */
  canAutoComplete() {
    return !this.isWon()
      && this.piles.stock.length === 0
      && this.piles.waste.length <= 1
      && TABLEAU_IDS.every((id) => this.piles[id].every((c) => c.faceUp));
  }

  nextAutoMove() {
    return lowestHomeMove(this, ['waste', ...TABLEAU_IDS], FOUNDATION_IDS);
  }
}

/** The lowest-ranked card that can go to a foundation right now. */
export function lowestHomeMove(game, sources, foundations) {
  let best = null;
  for (const fromId of sources) {
    const card = game.top(fromId);
    if (!card) continue;
    const toId = foundations.find((id) => game.canPlace([card], id));
    if (toId && (!best || rankValue(card) < rankValue(best.card))) {
      best = { fromId, index: game.piles[fromId].length - 1, toId, card };
    }
  }
  return best;
}
