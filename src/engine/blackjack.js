import { shuffle } from './cards.js';
import { decks } from './base.js';

// Blackjack against the house. Six-deck shoe, reshuffled at the cut card.
// Dealer stands on all 17s and peeks for blackjack; blackjack pays 3:2.
// Double on any first two cards, split once (split Aces get one card each).
// Calls return events for the UI: { type: 'card', hand, card } (hand = index
// or 'dealer'), { type: 'reveal', card }, { type: 'shuffle' }, { type: 'settle', results }.

export const MIN_BET = 10;

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces += 1; }
    else total += ['T', 'J', 'Q', 'K'].includes(c.rank) ? 10 : Number(c.rank);
  }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}

const tenish = (c) => ['T', 'J', 'Q', 'K'].includes(c.rank);
const splitValue = (c) => (tenish(c) ? 10 : c.rank);

export class Blackjack {
  constructor({ seed = Date.now(), bank = 1000, deckCount = 6 } = {}) {
    this.rngState = seed >>> 0;
    this.bank = bank;
    this.deckCount = deckCount;
    this.hands = [];
    this.dealer = [];
    this.phase = 'bet';
    this.active = 0;
    this.shoe = [];
    this.reshuffle();
  }

  random() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  reshuffle() {
    this.shoe = shuffle(decks(this.deckCount), () => this.random());
    this.cut = Math.floor(this.shoe.length * 0.25);
  }

  take(faceUp = true) {
    return { ...this.shoe.pop(), faceUp };
  }

  canDeal(bet) {
    return (this.phase === 'bet' || this.phase === 'done') && bet >= MIN_BET && bet <= this.bank;
  }

  deal(bet) {
    if (!this.canDeal(bet)) return null;
    const events = [];
    if (this.shoe.length < this.cut) {
      this.reshuffle();
      events.push({ type: 'shuffle' });
    }
    this.bank -= bet;
    this.hands = [{ cards: [], bet, done: false, doubled: false, split: false, result: null }];
    this.dealer = [];
    this.active = 0;
    const give = (hand, faceUp = true) => {
      const card = this.take(faceUp);
      (hand === 'dealer' ? this.dealer : this.hands[hand].cards).push(card);
      events.push({ type: 'card', hand, card });
    };
    give(0);
    give('dealer');
    give(0);
    give('dealer', false);

    const up = this.dealer[0];
    const dealerBJ = (up.rank === 'A' || tenish(up)) && handValue(this.dealer).total === 21;
    const playerBJ = this.isBlackjack(this.hands[0]);
    if (dealerBJ || playerBJ) {
      this.hands[0].done = true;
      events.push(...this.settle());
    } else {
      this.phase = 'player';
    }
    return events;
  }

  isBlackjack(hand) {
    return !hand.split && hand.cards.length === 2 && handValue(hand.cards).total === 21;
  }

  hand() {
    return this.hands[this.active];
  }

  legal() {
    if (this.phase !== 'player') return null;
    const h = this.hand();
    const firstTwo = h.cards.length === 2;
    const splitAces = h.split && h.cards[0].rank === 'A';
    return {
      hit: true,
      stand: true,
      double: firstTwo && !splitAces && this.bank >= h.bet,
      split: firstTwo && this.hands.length === 1 && splitValue(h.cards[0]) === splitValue(h.cards[1]) && this.bank >= h.bet,
    };
  }

  hit() {
    if (!this.legal()?.hit) return null;
    const h = this.hand();
    const card = this.take();
    h.cards.push(card);
    const events = [{ type: 'card', hand: this.active, card }];
    if (handValue(h.cards).total >= 21) h.done = true;
    return [...events, ...this.advance()];
  }

  stand() {
    if (!this.legal()?.stand) return null;
    this.hand().done = true;
    return this.advance();
  }

  double() {
    if (!this.legal()?.double) return null;
    const h = this.hand();
    this.bank -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    const card = this.take();
    h.cards.push(card);
    h.done = true;
    return [{ type: 'card', hand: this.active, card, doubled: true }, ...this.advance()];
  }

  split() {
    if (!this.legal()?.split) return null;
    const h = this.hand();
    this.bank -= h.bet;
    const second = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, split: true, result: null };
    h.split = true;
    this.hands.push(second);
    const events = [{ type: 'split' }];
    for (const [i, hand] of this.hands.entries()) {
      const card = this.take();
      hand.cards.push(card);
      events.push({ type: 'card', hand: i, card });
      // Split Aces get one card each; 21 stands on its own.
      if (hand.cards[0].rank === 'A' || handValue(hand.cards).total === 21) hand.done = true;
    }
    return [...events, ...this.advance()];
  }

  advance() {
    const next = this.hands.findIndex((h) => !h.done);
    if (next !== -1) {
      this.active = next;
      return [];
    }
    return this.settle();
  }

  /** Dealer reveals and draws (unless every hand is already bust), then pay out. */
  settle() {
    this.phase = 'dealer';
    const events = [];
    const hole = this.dealer[1];
    hole.faceUp = true;
    events.push({ type: 'reveal', card: hole });
    const live = this.hands.some((h) => handValue(h.cards).total <= 21 && !this.isBlackjack(h));
    if (live) {
      while (handValue(this.dealer).total < 17) {
        const card = this.take();
        this.dealer.push(card);
        events.push({ type: 'card', hand: 'dealer', card });
      }
    }
    const dealerTotal = handValue(this.dealer).total;
    const dealerBJ = this.dealer.length === 2 && dealerTotal === 21;
    const results = this.hands.map((h) => {
      const total = handValue(h.cards).total;
      let result;
      let paid = 0;
      if (total > 21) result = 'bust';
      else if (this.isBlackjack(h) && !dealerBJ) [result, paid] = ['blackjack', h.bet * 2.5];
      else if (dealerBJ && !this.isBlackjack(h)) result = 'lose';
      else if (dealerTotal > 21 || total > dealerTotal) [result, paid] = ['win', h.bet * 2];
      else if (total === dealerTotal) [result, paid] = ['push', h.bet];
      else result = 'lose';
      paid = Math.floor(paid);
      this.bank += paid;
      h.result = result;
      return { result, bet: h.bet, paid, net: paid - h.bet, total };
    });
    this.phase = 'done';
    events.push({ type: 'settle', results, dealerTotal, dealerBust: dealerTotal > 21 });
    return events;
  }
}
