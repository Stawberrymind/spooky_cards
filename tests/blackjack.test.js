import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Blackjack, handValue } from '../src/engine/blackjack.js';
import { mulberry32 } from '../src/engine/cards.js';

const SUIT = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const cards = (str) => str.split(' ').map((t, i) => ({ id: `${t}${i}`, rank: t[0], suit: SUIT[t[1]], faceUp: false }));

/** A game whose next cards are `str`, in dealing order: player, dealer up, player, dealer hole, then draws. */
function rigged(str, bank = 1000) {
  const g = new Blackjack({ seed: 1, bank });
  g.shoe = [...g.shoe.slice(0, 200), ...cards(str).reverse()];
  return g;
}

test('hand values: soft aces, faces, busts', () => {
  assert.deepEqual(handValue(cards('Ah 6d')), { total: 17, soft: true });
  assert.deepEqual(handValue(cards('Ah 6d Kc')), { total: 17, soft: false });
  assert.equal(handValue(cards('Ah Ad 9c')).total, 21);
  assert.equal(handValue(cards('Kh Qd 5c')).total, 25);
});

test('blackjack pays 3:2 straight away', () => {
  const g = rigged('Ah 9c Kd 7s');
  const events = g.deal(100);
  assert.equal(g.phase, 'done');
  assert.equal(events.at(-1).results[0].result, 'blackjack');
  assert.equal(g.bank, 1150);
});

test('dealer blackjack beats everything but a blackjack', () => {
  const g = rigged('Th Ac 9d Ks');
  g.deal(100);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'lose');
  assert.equal(g.bank, 900);
});

test('dealer draws to 17 and stands on soft 17', () => {
  const g = rigged('Th 6c 8d Ah 5s');
  g.deal(100);
  g.stand();
  // Dealer: 6 + A = soft 17, stands. Player 18 wins.
  assert.equal(handValue(g.dealer).total, 17);
  assert.equal(g.dealer.length, 2);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bank, 1100);
});

test('busting loses even if the dealer busts too', () => {
  const g = rigged('Th 6c 6d Ts 9h 9c');
  g.deal(100);
  g.hit(); // 25
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'bust');
  assert.equal(g.dealer.length, 2, 'dealer does not draw when every hand is bust');
  assert.equal(g.bank, 900);
});

test('double takes one card and doubles the stake', () => {
  const g = rigged('6h 9c 5d 8s Th 7c');
  g.deal(100);
  assert.ok(g.legal().double);
  g.double(); // 21
  assert.equal(g.hands[0].bet, 200);
  assert.equal(g.hands[0].cards.length, 3);
  // Dealer 17, player 21.
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bank, 1200);
});

test('split plays two hands; split aces get one card each', () => {
  const g = rigged('Ah 9c Ad 8s Kh 5c');
  g.deal(100);
  assert.ok(g.legal().split);
  g.split();
  assert.equal(g.hands.length, 2);
  assert.ok(g.hands.every((h) => h.cards.length === 2 && h.done));
  // A-K is 21 but not blackjack after a split; dealer 17.
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.hands.map((h) => h.result), ['win', 'lose']);
  assert.equal(g.bank, 1000 - 200 + 200);
});

test('random play keeps the bank honest', () => {
  const rand = mulberry32(4);
  const g = new Blackjack({ seed: 11, bank: 100000 });
  for (let round = 0; round < 3000; round++) {
    const before = g.bank;
    const events = g.deal(10 + Math.floor(rand() * 5) * 10);
    assert.ok(events);
    while (g.phase === 'player') {
      const l = g.legal();
      const r = rand();
      if (l.split && r < 0.3) g.split();
      else if (l.double && r < 0.4) g.double();
      else if (handValue(g.hand().cards).total < 16 && r < 0.9) g.hit();
      else g.stand();
    }
    const staked = g.hands.reduce((s, h) => s + h.bet, 0);
    const paid = g.hands.reduce((s, h) => s + (h.result === 'blackjack' ? h.bet * 2.5 : h.result === 'win' ? h.bet * 2 : h.result === 'push' ? h.bet : 0), 0);
    assert.equal(g.bank, before - staked + Math.floor(paid));
    assert.ok(g.hands.every((h) => h.result));
  }
});
