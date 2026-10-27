import { Blackjack, MIN_BET, handValue } from '../engine/blackjack.js';
import { sleep, flyChips } from '../ui/felt.js';

// Blackjack against the house. Your bank of souls carries over between visits;
// lose it all and the house lends you another thousand, for a price.

const START_BANK = 1000;
const CHIPS = [10, 25, 100, 500];

export function createBlackjack(ctx) {
  const { felt, actions, sfx, fx, whisper, store } = ctx;
  let game = null;
  let view = null;
  let els = null;
  let run = 0;
  let stake = 50;
  let busy = false;
  let keyHandler = null;

  const stats = () => ({ played: 0, won: 0, best: START_BANK, ruined: 0, ...store.get('stats:blackjack', {}) });

  function start({ seed = Date.now() } = {}) {
    stop();
    run += 1;
    const bank = store.get('bank:blackjack', START_BANK);
    game = new Blackjack({ seed, bank });
    stake = Math.min(store.get('stake:blackjack', 50), Math.max(MIN_BET, game.bank));
    view = { dealer: [], hands: [], up: new Set(), active: 0 };
    build();
    layout();
    betting();
    whisper('the house always collects');
  }

  function stop() {
    run += 1;
    keyHandler = null;
    actions.replaceChildren();
    felt.clear();
    felt.root.replaceChildren();
    els = null;
  }

  // ---- the table ---------------------------------------------------------

  function build() {
    const root = felt.root;
    root.dataset.mode = 'blackjack';
    const table = div('bj-table');
    table.innerHTML = '<p class="bj-rules">BLACKJACK PAYS 3 TO 2<br><small>dealer stands on all 17s</small></p>';
    const shoe = div('shoe');
    const bet = div('bet bet--circle');
    bet.innerHTML = '<span class="chip"></span><span class="chip chip--b"></span><span class="bet-amount"></span>';
    const dealerTotal = div('hand-total');
    root.append(table, shoe, bet, dealerTotal);
    els = { table, shoe, bet, dealerTotal, totals: [] };
  }

  function layout() {
    felt.measure({ across: 8.5, down: 5.4, max: 8 });
    const { w, h } = felt;
    felt.deck = { x: w * 0.86, y: felt.cardH * 0.75 };
    Object.assign(els.shoe.style, { left: `${felt.deck.x}px`, top: `${felt.deck.y}px` });
    render({ instant: true });
  }

  const dealerY = () => felt.cardH * 0.75 + felt.h * 0.05;
  const handY = () => felt.h * 0.62;
  const handX = (k, n) => (n === 1 ? felt.w / 2 : felt.w / 2 + (k - 0.5) * Math.min(felt.w * 0.46, felt.cardW * 4));
  const betPos = () => ({ x: felt.w / 2, y: Math.min(felt.h - 22, handY() + felt.cardH * 1.05) });

  function render({ instant = false } = {}) {
    if (!els) return;
    const spread = felt.cardW * 0.42;
    const placeHand = (cards, cx, cy, opts = {}) => cards.forEach((card, i) => {
      felt.put(card, cx + (i - (cards.length - 1) / 2) * spread, cy + i * felt.px * 0.6, {
        faceUp: opts.dealer ? view.up.has(card.id) : true,
        rot: card.doubled ? 90 : (i - (cards.length - 1) / 2) * 3,
        z: 100 + i,
        instant,
        dim: opts.dim,
      });
    });
    placeHand(view.dealer, felt.w / 2, dealerY(), { dealer: true });
    const n = view.hands.length;
    while (els.totals.length < n) {
      const t = div('hand-total');
      felt.root.append(t);
      els.totals.push(t);
    }
    els.totals.forEach((t, k) => { t.hidden = k >= n; });
    view.hands.forEach((cards, k) => {
      const x = handX(k, n);
      const finished = game.hands[k]?.result;
      placeHand(cards, x, handY(), { dim: n > 1 && game.phase === 'player' && k !== view.active });
      const t = els.totals[k];
      Object.assign(t.style, { left: `${x + besideHand(cards.length)}px`, top: `${handY()}px` });
      t.textContent = totalText(cards) + (finished ? ` · ${finished.toUpperCase()}` : '');
      t.classList.toggle('is-active', n > 1 && game.phase === 'player' && k === view.active);
      t.dataset.result = finished ?? '';
    });
    const shown = view.dealer.filter((c) => view.up.has(c.id));
    els.dealerTotal.hidden = !shown.length;
    Object.assign(els.dealerTotal.style, { left: `${felt.w / 2 + besideHand(view.dealer.length)}px`, top: `${dealerY()}px` });
    els.dealerTotal.textContent = `Dealer ${totalText(shown)}`;
    const b = betPos();
    Object.assign(els.bet.style, { left: `${b.x}px`, top: `${b.y}px` });
    const onTable = game.phase === 'player' || game.phase === 'dealer' ? game.hands.reduce((s, x) => s + x.bet, 0) : stake;
    els.bet.querySelector('.bet-amount').textContent = onTable;
    ctx.hud([['Souls', game.bank], ['Bet', onTable], ['Best', Math.max(stats().best, game.bank)]]);
  }

  /** How far right of a hand's centre its total label starts. */
  function besideHand(n) {
    return Math.max(0, n - 1) / 2 * felt.cardW * 0.42 + felt.cardW * 0.55 + 10;
  }

  function totalText(cards) {
    if (!cards.length) return '';
    const { total, soft } = handValue(cards);
    if (cards.length === 2 && total === 21) return '21';
    return soft && total < 21 ? `${total - 10}/${total}` : String(total);
  }

  // ---- betting -------------------------------------------------------------

  function betting() {
    if (game.bank < MIN_BET) {
      const s = stats();
      store.set('stats:blackjack', { ...s, ruined: s.ruined + 1 });
      game.bank = START_BANK;
      store.set('bank:blackjack', game.bank);
      whisper('the house lends you another soul. it will want it back');
      sfx.sting();
      fx.shake(0.5);
    }
    stake = Math.max(MIN_BET, Math.min(stake, game.bank));
    render();
    const amount = () => els.bet.querySelector('.bet-amount');
    const add = (v) => {
      stake = Math.min(game.bank, stake + v);
      sfx.place();
      fx.buzz(6);
      render();
      ctx.bump(amount());
    };
    const chipRow = div('action-row');
    chipRow.append(...CHIPS.map((v) => {
      const b = button(`+${v}`, 'btn--small chip-btn', () => add(v));
      b.disabled = v > game.bank;
      return b;
    }), button('Clear', 'btn--small', () => { stake = MIN_BET; render(); sfx.flip(); }));
    const dealBtn = button('Deal', 'btn--blood btn--wide', deal, 'enter');
    const row = div('action-row');
    row.append(dealBtn);
    actions.replaceChildren(chipRow, row);
    keyHandler = (k) => {
      if (k === 'enter' || k === ' ' || k === 'd') { dealBtn.click(); return true; }
      return false;
    };
  }

  async function deal() {
    if (busy || !game.canDeal(stake)) return;
    busy = true;
    const token = run;
    keyHandler = null;
    actions.replaceChildren();
    store.set('stake:blackjack', stake);
    await felt.sweep(felt.w * 0.12, felt.cardH * 0.75);
    view = { dealer: [], hands: [[]], up: new Set(), active: 0 };
    const b = betPos();
    flyChips(felt.root, { x: b.x, y: felt.h + 20 }, b, { count: 4 });
    const events = game.deal(stake);
    store.set('bank:blackjack', game.bank);
    await play(events, token);
    busy = false;
    if (token === run) next();
  }

  // ---- playing -------------------------------------------------------------

  async function play(events, token) {
    for (const e of events) {
      if (token !== run) return;
      switch (e.type) {
        case 'shuffle':
          whisper('the shoe is shuffled');
          sfx.shuffle();
          await sleep(600);
          break;
        case 'card': {
          if (e.hand === 'dealer') {
            view.dealer.push(e.card);
            if (e.card.faceUp) view.up.add(e.card.id);
          } else {
            view.hands[e.hand].push({ ...e.card, doubled: e.doubled });
          }
          sfx.draw();
          render();
          await sleep(320);
          break;
        }
        case 'split': {
          const [a, b] = view.hands[0];
          view.hands = [[a], [b]];
          sfx.shuffle();
          render();
          await sleep(350);
          break;
        }
        case 'reveal':
          view.up.add(e.card.id);
          sfx.flip();
          render();
          await sleep(550);
          break;
        case 'settle':
          await settle(e);
          break;
        default:
      }
    }
  }

  async function settle(e) {
    store.set('bank:blackjack', game.bank);
    const s = stats();
    const wins = e.results.filter((r) => r.net > 0).length;
    for (const r of e.results) ctx.trophy('blackjack', { result: r.result, splitWins: e.results.length === 2 ? wins : 0 });
    ctx.trophy('bank', { bank: game.bank });
    store.set('stats:blackjack', { ...s, played: s.played + 1, won: s.won + (wins ? 1 : 0), best: Math.max(s.best, game.bank) });
    render();
    if (e.dealerBust) whisper('the dealer burst open');
    e.results.forEach((r, k) => {
      const p = felt.screen(handX(k, e.results.length), handY());
      const text = { blackjack: 'BLACKJACK!', win: `+${r.net}`, push: 'PUSH', bust: 'BUST', lose: 'LOST' }[r.result];
      setTimeout(() => {
        if (r.result === 'blackjack' || r.result === 'win') {
          fx.burst(p.x, p.y, { palette: 'ecto', count: r.result === 'blackjack' ? 70 : 30, speed: r.result === 'blackjack' ? 10 : 7 });
          fx.popup(text, p.x, p.y - felt.cardH, r.result === 'blackjack' ? 'popup--huge' : 'popup--ecto');
          flyChips(felt.root, { x: felt.w / 2, y: 0 }, betPos(), { count: 5 });
        } else if (r.result === 'push') {
          fx.popup(text, p.x, p.y - felt.cardH, 'popup--pumpkin');
        } else {
          fx.burst(p.x, p.y, { palette: 'blood', count: 30, speed: 6 });
          fx.popup(text, p.x, p.y - felt.cardH);
        }
      }, k * 350);
    });
    const best = e.results.reduce((a, r) => Math.max(a, r.net), -Infinity);
    if (e.results.some((r) => r.result === 'blackjack')) {
      sfx.win();
      fx.shake(0.6);
      fx.buzz([60, 40, 120]);
      ctx.bg.pulse(3);
    } else if (best > 0) {
      sfx.foundation(4);
      fx.buzz([20, 30, 40]);
      ctx.bg.pulse(1);
    } else if (best < 0) {
      sfx.nope();
      fx.shake(0.25);
      fx.buzz(60);
    }
    ctx.bump(document.getElementById('table-value-0'));
    await sleep(900 + e.results.length * 350);
  }

  function next() {
    if (game.phase === 'player') choose();
    else betting();
  }

  function choose() {
    const legal = game.legal();
    view.active = game.active;
    render();
    const act = async (name) => {
      if (busy) return;
      busy = true;
      keyHandler = null;
      actions.replaceChildren();
      const token = run;
      const events = game[name]();
      if (name === 'double' || name === 'split') store.set('bank:blackjack', game.bank);
      await play(events ?? [], token);
      busy = false;
      if (token === run) next();
    };
    const buttons = [
      button('Hit', 'btn--ecto', () => act('hit'), 'h'),
      button('Stand', 'btn--blood', () => act('stand'), 's'),
    ];
    if (legal.double) buttons.push(button('Double', 'btn--pumpkin', () => act('double'), 'd'));
    if (legal.split) buttons.push(button('Split', '', () => act('split'), 'p'));
    const row = div('action-row');
    row.append(...buttons);
    actions.replaceChildren(row);
    keyHandler = (k) => {
      const b = buttons.find((x) => x.dataset.key === k);
      if (b) b.click();
      return Boolean(b);
    };
  }

  function button(text, cls, onClick, key) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = text;
    if (key) b.dataset.key = key;
    b.addEventListener('click', onClick);
    return b;
  }

  function div(className) {
    const el = document.createElement('div');
    el.className = className;
    return el;
  }

  return {
    start,
    stop,
    layout: () => els && layout(),
    key: (k) => keyHandler?.(k) ?? false,
    stats,
    bank: () => store.get('bank:blackjack', START_BANK),
  };
}
