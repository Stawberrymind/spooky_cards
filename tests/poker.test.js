import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, describe, score5 } from '../src/engine/poker/hands.js';
import { Holdem } from '../src/engine/poker/holdem.js';
import { decide, equity, LEVELS } from '../src/engine/poker/bot.js';
import { mulberry32 } from '../src/engine/cards.js';

const SUIT = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const cards = (str) => str.split(' ').map((t) => ({ id: t, rank: t[0], suit: SUIT[t[1]] }));
const name = (str) => describe(cards(str)).name;

test('hand ranking: every category is recognised', () => {
  assert.equal(name('Ah Kh Qh Jh Th 2c 3d'), 'Royal flush');
  assert.equal(name('9s 8s 7s 6s 5s Ah Ad'), 'Straight flush');
  assert.equal(name('9s 9h 9d 9c 2s'), 'Four of a kind');
  assert.equal(name('9s 9h 9d 2c 2s'), 'Full house');
  assert.equal(name('Ks 9s 7s 4s 2s'), 'Flush');
  assert.equal(name('Ah 2d 3c 4s 5h'), 'Straight');
  assert.equal(name('9s 9h 9d Kc 2s'), 'Three of a kind');
  assert.equal(name('9s 9h Kd Kc 2s'), 'Two pair');
  assert.equal(name('9s 9h Kd 4c 2s'), 'Pair');
  assert.equal(name('As Jh 9d 4c 2s'), 'High card');
});

test('hand ranking: tie-breakers and the wheel', () => {
  const s = (str) => score5(cards(str));
  assert.ok(s('Ah Ad Kc 4s 2h') > s('Ah Ad Qc Js Th'), 'kicker');
  assert.ok(s('2h 3d 4c 5s 6h') > s('Ah 2d 3c 4s 5h'), 'six-high straight beats the wheel');
  assert.ok(s('Kh Kd 2c 2s 3h') > s('Qh Qd Jc Js Ah'), 'higher top pair wins two pair');
  assert.equal(s('Ah Kd Qc Js 9h'), s('As Kc Qd Jh 9s'), 'same ranks split');
  // Best five of seven ignores the weaker cards.
  assert.equal(bestHand(cards('2c 3c Ah Kh Qh Jh Th')).cards.length, 5);
  assert.equal(name('2c 3c 4c 5c 7d 8h 6c'), 'Straight flush');
});

function table(chips = [1000, 1000, 1000], seed = 7) {
  return new Holdem({ seed, players: chips.map((c, i) => ({ name: `P${i}`, chips: c })) });
}

test('blinds: small and big blind left of the button, first to act after them', () => {
  const g = table([1000, 1000, 1000, 1000]);
  g.startHand();
  assert.equal(g.sbSeat, (g.button + 1) % 4);
  assert.equal(g.bbSeat, (g.button + 2) % 4);
  assert.equal(g.toAct, (g.button + 3) % 4);
  assert.equal(g.pot(), 30);
});

test('heads-up: the button posts the small blind and acts first preflop, last after', () => {
  const g = table([1000, 1000]);
  g.startHand();
  assert.equal(g.sbSeat, g.button);
  assert.equal(g.toAct, g.button);
  g.act(g.toAct, { type: 'call' });
  // Big blind gets the option.
  assert.equal(g.toAct, g.bbSeat);
  g.act(g.toAct, { type: 'check' });
  assert.equal(g.street, 'flop');
  assert.equal(g.board.length, 3);
  assert.equal(g.toAct, g.bbSeat);
});

test('everyone folding hands the pot to the last player', () => {
  const g = table([1000, 1000, 1000]);
  g.startHand();
  const winner = g.bbSeat;
  g.act(g.toAct, { type: 'fold' });
  const events = g.act(g.toAct, { type: 'fold' });
  assert.ok(events.some((e) => e.type === 'win' && e.seat === winner && e.amount === 30));
  assert.equal(g.seats[winner].chips, 1010);
  assert.equal(g.street, 'done');
});

test('raises: minimum raise is the last raise size', () => {
  const g = table([1000, 1000, 1000]);
  g.startHand();
  const first = g.toAct;
  assert.equal(g.legal(first).raise.min, 40);
  g.act(first, { type: 'raise', to: 100 });
  assert.equal(g.legal(g.toAct).raise.min, 180);
  assert.equal(g.legal(g.toAct).toCall, 100 - g.seats[g.toAct].bet);
});

test('side pots: a short all-in can only win what it matched', () => {
  const g = table([100, 500, 500], 3);
  g.startHand();
  // Rig the cards: the short stack has the best hand, seat 1 the second best.
  g.seats[0].hole = cards('Ah As');
  g.seats[1].hole = cards('Kh Ks');
  g.seats[2].hole = cards('7c 2d');
  // Dealt from the end: burn, flop, burn, turn, burn, river. Board 3d 4s 9c Jd 6h.
  g.deck = cards('Qs 3d 4s 9c 8h Jd 5c 6h').reverse();
  // Everyone all in.
  while (g.street !== 'done') {
    const l = g.legal(g.toAct);
    g.act(g.toAct, l.raise ? { type: 'raise', to: l.raise.max } : { type: 'call' });
  }
  const total = g.seats.reduce((s, p) => s + p.chips, 0);
  assert.equal(total, 1100);
  assert.equal(g.seats[0].chips, 300, 'main pot: 100 from each');
  assert.equal(g.seats[1].chips, 800, 'side pot between the two big stacks');
  assert.equal(g.seats[2].chips, 0);
  assert.ok(g.seats[2].out);
});

test('bots play whole tournaments without losing a chip', () => {
  const rand = mulberry32(99);
  for (let t = 0; t < 2; t++) {
    const g = new Holdem({ seed: 1000 + t, players: [0, 1, 2, 3].map((i) => ({ name: `B${i}`, chips: 500, bot: LEVELS[i % 3] })), levelHands: 3 });
    let hands = 0;
    while (!g.isOver() && hands < 200) {
      g.startHand();
      hands += 1;
      let guard = 0;
      while (g.street !== 'done' && guard++ < 200) {
        const i = g.toAct;
        assert.ok(g.legal(i), `seat ${i} should be able to act on ${g.street}`);
        const a = decide(g, i, g.seats[i].bot, rand);
        assert.ok(g.act(i, a), `legal action ${JSON.stringify(a)}`);
      }
      assert.equal(g.street, 'done');
      assert.equal(g.seats.reduce((s, p) => s + p.chips, 0), 2000);
    }
    assert.ok(g.isOver(), 'someone wins eventually');
  }
});

test('equity: aces are big favourites, and the river is exact', () => {
  const rand = mulberry32(5);
  assert.ok(equity(cards('Ah As'), [], 1, 400, rand) > 0.78);
  assert.equal(equity(cards('Ah As'), cards('Ad Ac 2s 7h 9d'), 2, 50, rand), 1);
});

test('save between hands round-trips, mid-hand saves the table before the hand', () => {
  const g = table([1000, 1000, 1000]);
  g.startHand();
  const before = g.preHand;
  g.act(g.toAct, { type: 'call' });
  const mid = g.saveState();
  assert.deepEqual(mid.seats, before.seats);
  const copy = Holdem.fromJSON(JSON.parse(JSON.stringify(mid)));
  assert.ok(copy.startHand());
});
