import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Klondike, TABLEAU_IDS, FOUNDATION_IDS } from '../src/engine/klondike.js';
import { mulberry32 } from '../src/engine/cards.js';

const card = (rank, suit, faceUp = true) => ({ id: `${rank}${suit[0]}`, rank, suit, faceUp });

function emptyGame() {
  const g = new Klondike({ seed: 1 });
  for (const id of Object.keys(g.piles)) g.piles[id] = [];
  return g;
}

const allCards = (g) => Object.values(g.piles).flat();

test('deal: 28 cards in a staircase, one face up per column, 24 in stock', () => {
  const g = new Klondike({ seed: 123 });
  TABLEAU_IDS.forEach((id, i) => {
    assert.equal(g.pile(id).length, i + 1);
    assert.deepEqual(g.pile(id).map((c) => c.faceUp), [...Array(i).fill(false), true]);
  });
  assert.equal(g.pile('stock').length, 24);
  assert.equal(new Set(allCards(g).map((c) => c.id)).size, 52);
});

test('same seed, same deal', () => {
  assert.deepEqual(new Klondike({ seed: 9 }).toJSON(), new Klondike({ seed: 9 }).toJSON());
  assert.notDeepEqual(new Klondike({ seed: 9 }).toJSON().piles, new Klondike({ seed: 10 }).toJSON().piles);
});

test('foundations build up by suit from the Ace', () => {
  const g = emptyGame();
  g.piles.waste = [card('2', 'hearts'), card('A', 'hearts')];
  assert.equal(g.canMove('waste', 1, 'f0'), true);
  assert.ok(g.move('waste', 1, 'f0'));
  assert.equal(g.canMove('waste', 0, 'f0'), true);
  g.piles.waste = [card('3', 'spades')];
  assert.equal(g.canMove('waste', 0, 'f0'), false, 'wrong suit');
});

test('tableau builds down in alternating colours; only Kings on empty columns', () => {
  const g = emptyGame();
  g.piles.t0 = [card('8', 'spades')];
  g.piles.waste = [card('7', 'hearts')];
  assert.equal(g.canMove('waste', 0, 't0'), true);
  g.piles.waste = [card('7', 'clubs')];
  assert.equal(g.canMove('waste', 0, 't0'), false, 'same colour');
  g.piles.waste = [card('Q', 'clubs')];
  assert.equal(g.canMove('waste', 0, 't1'), false, 'empty column needs a King');
  g.piles.waste = [card('K', 'clubs')];
  assert.equal(g.canMove('waste', 0, 't1'), true);
});

test('moving a run flips the newly exposed card and scores it', () => {
  const g = emptyGame();
  g.piles.t0 = [card('4', 'clubs', false), card('9', 'hearts'), card('8', 'spades')];
  g.piles.t1 = [card('T', 'clubs')];
  const res = g.move('t0', 1, 't1');
  assert.ok(res);
  assert.equal(res.flipped[0].id, '4c');
  assert.equal(g.pile('t1').length, 3);
  assert.equal(g.score, 5);
});

test('face-down cards and broken runs cannot be grabbed', () => {
  const g = emptyGame();
  g.piles.t0 = [card('4', 'clubs', false), card('9', 'hearts')];
  assert.equal(g.grabbable('t0', 0), null);
  g.piles.t1 = [card('9', 'hearts'), card('7', 'spades')];
  assert.equal(g.grabbable('t1', 0), null);
});

test('drawing and recycling the stock, draw-3', () => {
  const g = new Klondike({ seed: 5, drawCount: 3 });
  const res = g.draw();
  assert.equal(res.cards.length, 3);
  assert.equal(g.pile('waste').length, 3);
  while (g.pile('stock').length) g.draw();
  assert.equal(g.pile('waste').length, 24);
  assert.equal(g.draw().recycled, true);
  assert.equal(g.pile('stock').length, 24);
  assert.ok(g.pile('stock').every((c) => !c.faceUp));
});

test('undo restores the previous position', () => {
  const g = new Klondike({ seed: 77 });
  const before = JSON.stringify(g.piles);
  g.draw();
  assert.notEqual(JSON.stringify(g.piles), before);
  g.undo();
  assert.equal(JSON.stringify(g.piles), before);
});

test('auto-complete finishes a fully revealed board', () => {
  const g = emptyGame();
  const suits = ['hearts', 'spades', 'diamonds', 'clubs'];
  const ranks = ['K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];
  // Four alternating-colour columns, King down to Ace.
  suits.forEach((_, col) => {
    g.piles[TABLEAU_IDS[col]] = ranks.map((r, i) => card(r, suits[(col + i) % 4]));
  });
  assert.equal(g.canAutoComplete(), true);
  let guard = 0;
  while (!g.isWon() && guard++ < 60) {
    const m = g.nextAutoMove();
    assert.ok(m, 'always a next move');
    assert.ok(g.move(m.fromId, m.index, m.toId));
  }
  assert.equal(g.isWon(), true);
  FOUNDATION_IDS.forEach((id) => assert.equal(g.pile(id).length, 13));
});

test('random play never loses or duplicates a card, and hints are always legal', () => {
  const rng = mulberry32(2026);
  for (let n = 0; n < 60; n++) {
    const g = new Klondike({ seed: Math.floor(rng() * 1e9), drawCount: rng() < 0.5 ? 1 : 3 });
    for (let step = 0; step < 300; step++) {
      const hints = g.hints();
      if (!hints.length) break;
      for (const h of hints) if (!h.draw) assert.ok(g.canMove(h.fromId, h.index, h.toId));
      const h = hints[Math.floor(rng() * Math.min(hints.length, 3))];
      if (h.draw) g.draw(); else g.move(h.fromId, h.index, h.toId);
      if (rng() < 0.05) g.undo();
      const ids = allCards(g).map((c) => c.id);
      assert.equal(ids.length, 52);
      assert.equal(new Set(ids).size, 52);
    }
  }
});

test('save and load round-trips', () => {
  const g = new Klondike({ seed: 31 });
  g.draw();
  const copy = Klondike.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(copy.toJSON(), g.toJSON());
});
