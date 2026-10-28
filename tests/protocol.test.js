import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Holdem } from '../src/engine/poker/holdem.js';
import { decide } from '../src/engine/poker/bot.js';
import { redact, publicTable, cleanAction, cleanEmote, cleanCode, cleanName } from '../src/net/protocol.js';
import { mulberry32 } from '../src/engine/cards.js';

function table(seats = 4, seed = 11) {
  return new Holdem({ seed, players: Array.from({ length: seats }, (_, i) => ({ name: `P${i}`, chips: 500 })), levelHands: 3 });
}

/** Every real card id a guest at `seat` could learn from these events. */
function visibleIds(events) {
  const ids = new Set();
  JSON.stringify(events, (key, value) => {
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.rank && !value.hidden) ids.add(value.id);
    return value;
  });
  return ids;
}

test('guests only ever see their own hole cards until the showdown', () => {
  const rand = mulberry32(3);
  const g = table(4);
  for (let hand = 0; hand < 40 && !g.isOver(); hand++) {
    let batch = g.startHand();
    const holes = g.seats.map((s) => new Set(s.hole.map((c) => c.id)));
    while (true) {
      for (let seat = 0; seat < 4; seat++) {
        const seen = visibleIds(redact(batch, seat, g));
        const showdown = batch.find((e) => e.type === 'showdown');
        holes.forEach((ids, other) => {
          if (other === seat) return;
          for (const id of ids) {
            if (seen.has(id)) {
              assert.ok(showdown && String(other) in showdown.holes, `seat ${seat} saw seat ${other}'s ${id} outside a showdown`);
            }
          }
        });
      }
      if (g.street === 'done') break;
      const i = g.toAct;
      batch = g.act(i, decide(g, i, 'easy', rand));
    }
  }
});

test('a turn tells only that player what they may do', () => {
  const g = table(3);
  const batch = g.startHand();
  const turn = batch.at(-1);
  assert.equal(turn.type, 'turn');
  const mine = redact(batch, turn.seat, g).at(-1);
  assert.ok(mine.legal);
  assert.equal(mine.legal.toCall, 20);
  assert.equal(mine.legal.currentBet, 20);
  const theirs = redact(batch, (turn.seat + 1) % 3, g).at(-1);
  assert.equal(theirs.legal, undefined);
});

test('the public table has stacks and blinds but no cards', () => {
  const g = table(3);
  g.startHand();
  const t = publicTable(g);
  assert.equal(t.seats.length, 3);
  assert.equal(t.bb, 20);
  assert.equal(JSON.stringify(t).includes('hole'), false);
  assert.equal(visibleIds(t).size, 0);
});

test('network input is cleaned', () => {
  assert.deepEqual(cleanAction({ type: 'raise', to: '120' }), { type: 'raise', to: 120 });
  assert.deepEqual(cleanAction({ type: 'call', to: 9999, extra: 'x' }), { type: 'call' });
  assert.equal(cleanAction({ type: 'steal' }), null);
  assert.equal(cleanAction(null), null);
  assert.equal(cleanEmote(0), 'BOO!');
  assert.equal(cleanEmote(99), null);
  assert.equal(cleanCode(' ab-1c9z '), 'AB1C');
  assert.equal(cleanName('  <b>Hank</b>\u0007 the third of many  '), '<b>Hank</b> th');
  assert.equal(cleanName(''), 'Lost Soul');
});
