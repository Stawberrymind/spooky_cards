import { RANKS, SUITS } from './cards.js';

// Shared plumbing for every solitaire. A game is pure state (no DOM): the UI
// asks what's legal, calls move()/draw(), and re-renders from `piles`.
//
// Each game provides:
//   piles                      { [pileId]: Card[] }, cards are { id, rank, suit, faceUp }
//   layout()                   where piles sit, see below
//   grabbable(pileId, index)   the cards that would be picked up, or null
//   canPlace(cards, toId)
//   move(fromId, index, toId)  → MoveResult or null
//   bestTarget(fromId, index)  where a tap sends the card, or null
//   hints()                    [{ fromId, index, toId, weight } | { draw: true }]
//   isWon(), canAutoComplete(), nextAutoMove()
//   canDraw(), draw()          only when there is a stock
//
// MoveResult: { cards, flipped: Card[], home: bool, points, completed?: { toId, cards } }
//   home       the cards went somewhere that scores (a foundation, TriPeaks waste)
//   completed  Spider: a full K→A run left the table for a foundation
//
// layout(): {
//   cols,      board width in card widths
//   rows,      board height in card heights, so the cards can be sized to fit
//   piles: { [pileId]: { x, y, fan, slot, label } }
//     x, y     in card widths / card heights from the top-left
//     fan      'stack' (all on one spot), 'deck' (stock thickness), 'waste'
//              (last few fanned right), 'down' (tableau column)
//     slot     'foundation' | 'stock' | 'cell' | 'tableau' | null (no outline)
//   cascade,   pile ids the win animation throws cards from
// }

export const FOUNDATION_SUIT_HINT = ['♥', '♦', '♣', '♠'];

export class SolitaireBase {
  constructor({ seed = Date.now() } = {}) {
    this.seed = seed >>> 0;
    this.score = 0;
    this.moves = 0;
    this.history = [];
    this.piles = {};
  }

  pile(id) {
    return this.piles[id];
  }

  top(id) {
    const p = this.piles[id];
    return p?.[p.length - 1] ?? null;
  }

  /** Where a card currently sits: { pileId, index } */
  locate(cardId) {
    for (const [pileId, pile] of Object.entries(this.piles)) {
      const index = pile.findIndex((c) => c.id === cardId);
      if (index !== -1) return { pileId, index };
    }
    return null;
  }

  hasStock() {
    return 'stock' in this.piles;
  }

  canDraw() {
    return false;
  }

  canMove(fromId, index, toId) {
    if (fromId === toId) return false;
    return this.canPlace(this.grabbable(fromId, index), toId);
  }

  canAutoComplete() {
    return false;
  }

  nextAutoMove() {
    return null;
  }

  /** Cards in the order they fly out during the opening deal. */
  dealOrder() {
    const ids = Object.keys(this.piles).filter((id) => id !== 'stock');
    const longest = Math.max(...ids.map((id) => this.piles[id].length));
    const out = [];
    for (let row = 0; row < longest; row++) {
      for (const id of ids) if (this.piles[id][row]) out.push(this.piles[id][row]);
    }
    return out;
  }

  // ---- undo & save ---------------------------------------------------------

  /** Extra fields (beyond piles and score) that undo and saves must restore. */
  stateKeys() {
    return [];
  }

  snapshot() {
    const extra = Object.fromEntries(this.stateKeys().map((k) => [k, this[k]]));
    this.history.push(JSON.stringify({ piles: this.piles, score: this.score, extra }));
    if (this.history.length > 500) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const prev = this.history.pop();
    if (!prev) return false;
    const { piles, score, extra } = JSON.parse(prev);
    Object.assign(this, extra);
    this.piles = piles;
    this.score = score;
    this.moves += 1;
    return true;
  }

  /** Options needed to rebuild the same game (draw count, suits...). */
  options() {
    return {};
  }

  toJSON() {
    const extra = Object.fromEntries(this.stateKeys().map((k) => [k, this[k]]));
    return { seed: this.seed, options: this.options(), score: this.score, moves: this.moves, piles: this.piles, extra };
  }

  static fromJSON(data) {
    const game = new this({ seed: data.seed, ...data.options });
    Object.assign(game, data.extra, { score: data.score, moves: data.moves, piles: data.piles, history: [] });
    return game;
  }
}

/** n full decks, each card id unique ('Ah', 'Ah2', ...). `suits` limits which suits appear (Spider). */
export function decks(n, suits = SUITS) {
  const out = [];
  const copies = (n * SUITS.length) / suits.length;
  for (let copy = 0; copy < copies; copy++) {
    for (const suit of suits) {
      for (const rank of RANKS) out.push({ id: `${rank}${suit[0]}${copy ? copy + 1 : ''}`, rank, suit, faceUp: false });
    }
  }
  return out;
}
