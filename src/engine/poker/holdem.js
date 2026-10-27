import { fullDeck, shuffle } from '../cards.js';
import { describe } from './hands.js';

// No-limit Texas Hold'em, tournament style: everyone starts with the same
// stack, blinds go up every few hands, and the last player with chips wins.
// Pure state, no DOM. Every call that changes state returns a list of events
// the UI plays back in order:
//
//   { type: 'hand', handNo, button, sb, bb }
//   { type: 'blind', seat, amount }
//   { type: 'deal', cards: [{ seat, card }] }       hole cards, in dealing order
//   { type: 'turn', seat }                           seat to act next
//   { type: 'action', seat, action, amount, bet }   fold / check / call / raise / all-in
//   { type: 'collect' }                              bets swept into the pot
//   { type: 'street', street, cards }                flop, turn, river
//   { type: 'showdown', hands, pots }                hands: { seat: { name, cards, score } }
//   { type: 'win', seat, amount }                    everyone else folded
//   { type: 'end' }                                  hand over
//
// Simplification: any raise, even a short all-in, re-opens the betting.

const STREET_CARDS = { flop: 3, turn: 1, river: 1 };
const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };

export class Holdem {
  constructor({ seed = Date.now(), players, smallBlind = 10, bigBlind = 20, levelHands = 8 }) {
    this.rngState = seed >>> 0;
    this.baseBlinds = [smallBlind, bigBlind];
    this.levelHands = levelHands;
    this.handNo = 0;
    this.button = -1;
    this.seats = players.map((p, i) => ({
      seat: i, name: p.name, bot: p.bot ?? null, chips: p.chips,
      hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, out: p.chips <= 0, last: null,
    }));
    this.board = [];
    this.deck = [];
    this.street = 'idle';
    this.toAct = -1;
    this.currentBet = 0;
    [this.sb, this.bb] = this.baseBlinds;
    this.minRaise = this.bb;
    this.preHand = null;
  }

  /** mulberry32 with its state on the game, so saves resume the same sequence. */
  random() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  blindsFor(handNo) {
    const level = Math.floor(Math.max(0, handNo - 1) / this.levelHands);
    return this.baseBlinds.map((b) => b * 2 ** level);
  }

  /** Next seat clockwise from `from` that matches `pred`, or -1. */
  next(from, pred) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (pred(this.seats[i])) return i;
    }
    return -1;
  }

  pot() {
    return this.seats.reduce((sum, s) => sum + s.committed, 0);
  }

  contenders() {
    return this.seats.filter((s) => !s.out && !s.folded);
  }

  isOver() {
    return this.seats.filter((s) => !s.out).length < 2;
  }

  pay(s, amount) {
    const x = Math.min(amount, s.chips);
    s.chips -= x;
    s.bet += x;
    s.committed += x;
    if (s.chips === 0) s.allIn = true;
    return x;
  }

  needsAction(s) {
    return !s.out && !s.folded && !s.allIn && (!s.acted || s.bet < this.currentBet);
  }

  // ---- a hand ------------------------------------------------------------

  startHand() {
    if (this.isOver()) return null;
    this.preHand = this.toJSON();
    this.handNo += 1;
    [this.sb, this.bb] = this.blindsFor(this.handNo);
    const live = (s) => !s.out;
    this.button = this.button === -1
      ? this.next(Math.floor(this.random() * this.seats.length) - 1, live)
      : this.next(this.button, live);
    for (const s of this.seats) Object.assign(s, { hole: [], bet: 0, committed: 0, folded: s.out, allIn: false, acted: false, last: null });
    this.board = [];
    this.deck = shuffle(fullDeck(), () => this.random()).map((c) => ({ ...c, faceUp: true }));
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.result = null;

    const events = [{ type: 'hand', handNo: this.handNo, button: this.button, sb: this.sb, bb: this.bb }];
    const headsUp = this.seats.filter(live).length === 2;
    // Heads-up the button posts the small blind and acts first before the flop.
    this.sbSeat = headsUp ? this.button : this.next(this.button, live);
    this.bbSeat = this.next(this.sbSeat, live);
    events.push({ type: 'blind', seat: this.sbSeat, amount: this.pay(this.seats[this.sbSeat], this.sb) });
    events.push({ type: 'blind', seat: this.bbSeat, amount: this.pay(this.seats[this.bbSeat], this.bb) });
    this.currentBet = this.bb;

    const cards = [];
    for (let round = 0; round < 2; round++) {
      let i = this.button;
      for (let k = 0; k < this.seats.filter(live).length; k++) {
        i = this.next(i, live);
        const card = this.deck.pop();
        this.seats[i].hole.push(card);
        cards.push({ seat: i, card });
      }
    }
    events.push({ type: 'deal', cards });
    events.push(...this.advance(this.bbSeat));
    return events;
  }

  /** What seat i may do right now, or null if it isn't their turn. */
  legal(i) {
    if (i !== this.toAct) return null;
    const s = this.seats[i];
    const toCall = Math.min(this.currentBet - s.bet, s.chips);
    const othersWithChips = this.contenders().filter((o) => o !== s && !o.allIn).length;
    const maxTo = s.bet + s.chips;
    const canRaise = s.chips > toCall && othersWithChips > 0;
    return {
      toCall,
      canCheck: toCall === 0,
      raise: canRaise ? { min: Math.min(this.currentBet + this.minRaise, maxTo), max: maxTo } : null,
      pot: this.pot(),
    };
  }

  /** action: { type: 'fold' | 'check' | 'call' | 'raise', to } where `to` is the total bet for raises. */
  act(i, action) {
    const legal = this.legal(i);
    if (!legal) return null;
    const s = this.seats[i];
    let amount = 0;
    switch (action.type) {
      case 'fold':
        s.folded = true;
        break;
      case 'check':
        if (!legal.canCheck) return null;
        break;
      case 'call':
        if (legal.canCheck) return null;
        amount = this.pay(s, legal.toCall);
        break;
      case 'raise': {
        if (!legal.raise) return null;
        const to = Math.max(legal.raise.min, Math.min(legal.raise.max, Math.round(action.to ?? legal.raise.min)));
        const raiseBy = to - this.currentBet;
        if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
        this.currentBet = Math.max(this.currentBet, to);
        amount = this.pay(s, to - s.bet);
        for (const o of this.seats) if (o !== s) o.acted = false;
        break;
      }
      default:
        return null;
    }
    s.acted = true;
    s.last = s.allIn && action.type !== 'fold' ? 'all-in' : action.type;
    const events = [{ type: 'action', seat: i, action: s.last, amount, bet: s.bet }];
    events.push(...this.advance(i));
    return events;
  }

  advance(from) {
    const contenders = this.contenders();
    if (contenders.length === 1) return this.awardUncontested(contenders[0]);
    const nextSeat = this.next(from, (s) => this.needsAction(s));
    if (nextSeat !== -1) {
      this.toAct = nextSeat;
      return [{ type: 'turn', seat: nextSeat }];
    }
    return this.endStreet();
  }

  endStreet() {
    const events = [{ type: 'collect' }];
    for (const s of this.seats) {
      s.bet = 0;
      s.acted = false;
      if (!s.folded && !s.allIn) s.last = null;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.toAct = -1;
    if (this.street === 'river') return [...events, ...this.showdown()];

    this.street = NEXT_STREET[this.street];
    this.deck.pop(); // burn
    const cards = [];
    for (let k = 0; k < STREET_CARDS[this.street]; k++) cards.push(this.deck.pop());
    this.board.push(...cards);
    events.push({ type: 'street', street: this.street, cards });

    // With fewer than two players able to bet, just run the cards out.
    if (this.contenders().filter((s) => !s.allIn).length < 2) return [...events, ...this.endStreet()];
    const first = this.next(this.button, (s) => this.needsAction(s));
    this.toAct = first;
    events.push({ type: 'turn', seat: first });
    return events;
  }

  /** Main pot and side pots: [{ amount, eligible: [seat] }]. */
  pots() {
    const contenders = this.contenders();
    const levels = [...new Set(contenders.map((s) => s.committed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of levels) {
      const amount = this.seats.reduce((sum, s) => sum + Math.min(s.committed, level) - Math.min(s.committed, prev), 0);
      const eligible = contenders.filter((s) => s.committed >= level).map((s) => s.seat);
      if (amount > 0) pots.push({ amount, eligible });
      prev = level;
    }
    // Chips from folded players above the top level (rare) go to the last pot.
    const leftover = this.pot() - pots.reduce((sum, p) => sum + p.amount, 0);
    if (leftover > 0 && pots.length) pots[pots.length - 1].amount += leftover;
    return pots;
  }

  showdown() {
    this.street = 'showdown';
    const hands = {};
    for (const s of this.contenders()) {
      const h = describe([...s.hole, ...this.board]);
      hands[s.seat] = { name: h.name, cards: h.cards, score: h.score };
    }
    const pots = this.pots().map((pot) => {
      const top = Math.max(...pot.eligible.map((i) => hands[i].score));
      // Odd chips go to the first winner clockwise from the button.
      const winners = pot.eligible.filter((i) => hands[i].score === top)
        .sort((a, b) => this.clockwiseFromButton(a) - this.clockwiseFromButton(b));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const paid = winners.map((seat) => {
        const won = share + (odd-- > 0 ? 1 : 0);
        this.seats[seat].chips += won;
        return { seat, won };
      });
      return { amount: pot.amount, eligible: pot.eligible, winners: paid, hand: hands[winners[0]].name };
    });
    this.result = { hands, pots };
    return [{ type: 'showdown', hands, pots }, ...this.finishHand()];
  }

  clockwiseFromButton(seat) {
    const n = this.seats.length;
    return (seat - this.button - 1 + n) % n;
  }

  awardUncontested(s) {
    const amount = this.pot();
    s.chips += amount;
    for (const o of this.seats) o.bet = 0;
    this.result = { uncontested: s.seat, amount };
    return [{ type: 'collect' }, { type: 'win', seat: s.seat, amount }, ...this.finishHand()];
  }

  finishHand() {
    this.street = 'done';
    this.toAct = -1;
    for (const s of this.seats) {
      s.committed = 0;
      if (s.chips === 0) s.out = true;
    }
    return [{ type: 'end' }];
  }

  // ---- saves (between hands only) -------------------------------------------

  toJSON() {
    const { rngState, baseBlinds, levelHands, handNo, button } = this;
    return { rngState, baseBlinds, levelHands, handNo, button, seats: this.seats.map(({ name, bot, chips }) => ({ name, bot, chips })) };
  }

  /** Mid-hand, save the table as it was before the hand (with fresh cards to come). */
  saveState() {
    if (this.street === 'idle' || this.street === 'done') return this.toJSON();
    return { ...this.preHand, rngState: this.rngState };
  }

  static fromJSON(data) {
    const game = new Holdem({
      seed: 0, players: data.seats, smallBlind: data.baseBlinds[0], bigBlind: data.baseBlinds[1], levelHands: data.levelHands,
    });
    Object.assign(game, { rngState: data.rngState, handNo: data.handNo, button: data.button });
    return game;
  }
}
