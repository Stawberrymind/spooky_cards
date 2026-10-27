import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_IDS, createGame } from '../src/engine/games.js';
import { FreeCell, TABLEAU_IDS as FC_TABLEAU, FOUNDATION_IDS as FC_FOUNDATIONS } from '../src/engine/freecell.js';
import { Spider, TABLEAU_IDS as SP_TABLEAU } from '../src/engine/spider.js';
import { TriPeaks, PEAK_IDS } from '../src/engine/tripeaks.js';
import { mulberry32 } from '../src/engine/cards.js';

const card = (rank, suit, faceUp = true, copy = '') => ({ id: `${rank}${suit[0]}${copy}`, rank, suit, faceUp });
const allCards = (g) => Object.values(g.piles).flat();
const RANKS_DOWN = ['K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];

function cleared(Game, opts) {
  const g = new Game({ seed: 1, ...opts });
  for (const id of Object.keys(g.piles)) g.piles[id] = [];
  return g;
}

// ---- every game -------------------------------------------------------------

const SOLITAIRES = GAME_IDS.filter((id) => GAMES[id].Game);

for (const id of SOLITAIRES) {
  const variant = GAMES[id].variants[0];
  const variants = variant?.values ?? [undefined];

  test(`${id}: deals every card exactly once, and the layout covers every pile`, () => {
    for (const v of variants) {
      const g = createGame(id, 42, v === undefined ? {} : { [variant.key]: v });
      const ids = allCards(g).map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, id === 'spider' ? 104 : 52);
      assert.deepEqual(Object.keys(g.layout().piles).sort(), Object.keys(g.piles).sort());
      assert.equal(new Set(g.dealOrder().map((c) => c.id)).size, g.dealOrder().length);
    }
  });

  test(`${id}: random play never loses a card, hints are legal, undo and saves work`, () => {
    const rng = mulberry32(id.length * 977);
    for (let n = 0; n < 25; n++) {
      const v = variants[n % variants.length];
      const g = createGame(id, Math.floor(rng() * 1e9), v === undefined ? {} : { [variant.key]: v });
      const total = allCards(g).length;
      for (let step = 0; step < 250; step++) {
        const hints = g.hints();
        if (!hints.length) break;
        for (const h of hints) if (!h.draw) assert.ok(g.canMove(h.fromId, h.index, h.toId), `${id} hint ${JSON.stringify(h)}`);
        const h = hints[Math.floor(rng() * Math.min(hints.length, 3))];
        if (h.draw) assert.ok(g.draw()); else assert.ok(g.move(h.fromId, h.index, h.toId));
        if (rng() < 0.05) g.undo();
        const ids = allCards(g).map((c) => c.id);
        assert.equal(ids.length, total);
        assert.equal(new Set(ids).size, total);
      }
      const copy = g.constructor.fromJSON(JSON.parse(JSON.stringify(g)));
      assert.deepEqual(copy.toJSON(), g.toJSON());
    }
  });
}

// ---- FreeCell ---------------------------------------------------------------

test('freecell: cells hold one card, runs are limited by free space', () => {
  const g = cleared(FreeCell);
  g.piles.t0 = [card('9', 'hearts'), card('8', 'spades'), card('7', 'hearts'), card('6', 'clubs')];
  g.piles.t1 = [card('T', 'clubs')];
  // 4 free cells, and 6 empty columns: plenty of room.
  assert.ok(g.canMove('t0', 0, 't1'));
  // Fill every cell and column: only one card moves at a time.
  ['c0', 'c1', 'c2', 'c3'].forEach((id, i) => { g.piles[id] = [card('2', ['hearts', 'clubs', 'spades', 'diamonds'][i])]; });
  FC_TABLEAU.slice(2).forEach((id, i) => { g.piles[id] = [card('K', 'hearts', true, i)]; });
  assert.equal(g.grabbable('t0', 0), null);
  assert.ok(g.grabbable('t0', 3));
  assert.equal(g.canMove('t0', 3, 'c0'), false, 'cell already full');
});

test('freecell: an empty column halves how much can move into it', () => {
  const g = cleared(FreeCell);
  g.piles.t0 = [card('9', 'hearts'), card('8', 'spades'), card('7', 'hearts')];
  ['c0', 'c1', 'c2'].forEach((id) => { g.piles[id] = [card('K', 'clubs', true, id)]; });
  FC_TABLEAU.slice(2).forEach((id, i) => { g.piles[id] = [card('Q', 'hearts', true, i)]; });
  // One free cell, one empty column (t1): 2 × 2 = 4 to a column, but only 2 into the empty one.
  assert.ok(g.grabbable('t0', 0));
  assert.equal(g.canMove('t0', 0, 't1'), false);
  assert.ok(g.canMove('t0', 1, 't1'));
});

test('freecell: auto-complete finishes once every column runs high to low', () => {
  const g = cleared(FreeCell);
  ['hearts', 'spades', 'diamonds', 'clubs'].forEach((suit, i) => { g.piles[FC_TABLEAU[i]] = RANKS_DOWN.map((r) => card(r, suit)); });
  assert.ok(g.canAutoComplete());
  let guard = 0;
  while (!g.isWon() && guard++ < 60) {
    const m = g.nextAutoMove();
    assert.ok(m);
    assert.ok(g.move(m.fromId, m.index, m.toId));
  }
  assert.ok(g.isWon());
  FC_FOUNDATIONS.forEach((id) => assert.equal(g.pile(id).length, 13));
});

// ---- Spider -----------------------------------------------------------------

test('spider: only same-suit runs move, but anything one lower can land', () => {
  const g = cleared(Spider, { suits: 2 });
  g.piles.t0 = [card('7', 'hearts'), card('6', 'spades')];
  g.piles.t1 = [card('8', 'spades')];
  assert.equal(g.grabbable('t0', 0), null, 'mixed suits');
  assert.ok(g.canMove('t0', 1, 't0') === false);
  g.piles.t2 = [card('7', 'hearts', true, 2)];
  assert.ok(g.canMove('t2', 0, 't1'), 'any suit can land');
});

test('spider: a full King-to-Ace run is laid to rest and the card under it flips', () => {
  const g = cleared(Spider);
  SP_TABLEAU.forEach((id, i) => { g.piles[id] = [card('9', 'spades', true, `x${i}`)]; });
  g.piles.t0 = [card('5', 'spades', false, 'under'), ...RANKS_DOWN.slice(0, 12).map((r) => card(r, 'spades'))];
  g.piles.t1 = [card('A', 'spades')];
  const res = g.move('t1', 0, 't0');
  assert.ok(res?.completed);
  assert.equal(g.pile('f0').length, 13);
  assert.equal(g.pile('t0').length, 1);
  assert.equal(g.top('t0').faceUp, true);
  assert.equal(g.score, 500 - 1 + 100);
});

test('spider: no dealing while a column is empty', () => {
  const g = new Spider({ seed: 3 });
  assert.ok(g.canDraw());
  const res = g.draw();
  assert.equal(res.cards.length, 10);
  assert.equal(g.pile('stock').length, 40);
  g.piles.t3 = [];
  assert.equal(g.canDraw(), false);
});

// ---- TriPeaks ---------------------------------------------------------------

test('tripeaks: one up or one down, wrapping King and Ace', () => {
  const g = cleared(TriPeaks);
  g.piles.waste = [card('K', 'clubs')];
  g.piles.p20 = [card('A', 'hearts')];
  g.piles.p21 = [card('5', 'hearts')];
  assert.ok(g.canMove('p20', 0, 'waste'));
  assert.equal(g.canMove('p21', 0, 'waste'), false);
});

test('tripeaks: covered cards are locked until both cards below them go, then flip', () => {
  const g = new TriPeaks({ seed: 8 });
  // p3 (second row) is covered by p9 and p10 (third row).
  assert.equal(g.grabbable('p3', 0), null);
  g.piles.p9 = [];
  assert.equal(g.grabbable('p3', 0), null);
  g.piles.p10 = [g.piles.p10[0]];
  g.piles.waste = [card('Q', 'clubs')];
  g.piles.p10[0] = card('J', 'hearts');
  // p10 is itself covered by p19 and p20: clear those.
  g.piles.p19 = [];
  g.piles.p20 = [];
  const res = g.move('p10', 0, 'waste');
  assert.ok(res);
  assert.ok(res.flipped.some((c) => c.id === g.piles.p3[0].id));
  assert.ok(g.grabbable('p3', 0));
});

test('tripeaks: streak multiplies points and resets on a draw', () => {
  const g = cleared(TriPeaks);
  g.piles.stock = [card('2', 'clubs')];
  g.piles.waste = [card('5', 'clubs')];
  g.piles.p25 = [card('6', 'hearts')];
  g.piles.p26 = [card('7', 'hearts')];
  g.move('p25', 0, 'waste');
  g.move('p26', 0, 'waste');
  assert.equal(g.streak, 2);
  assert.equal(g.score, 10 + 20);
  g.draw();
  assert.equal(g.streak, 0);
  assert.equal(PEAK_IDS.length, 28);
});
