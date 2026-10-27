import { VideoPoker, PAYTABLE, MAX_BET, payout } from '../engine/poker/videopoker.js';
import { sleep } from '../ui/felt.js';

// Jacks or Better on a haunted machine. Tap cards to hold them, then draw.
// The bank of souls carries over between visits, like Blackjack's.

const START_BANK = 200;

export function createVideoPoker(ctx) {
  const { felt, actions, sfx, fx, whisper, store } = ctx;
  let game = null;
  let els = null;
  let run = 0;
  let busy = false;
  let keyHandler = null;
  let shownHand = [];

  const stats = () => ({ played: 0, best: START_BANK, ruined: 0, biggest: 0, ...store.get('stats:videopoker', {}) });

  function start({ seed = Date.now() } = {}) {
    stop();
    run += 1;
    game = new VideoPoker({ seed, bank: store.get('bank:videopoker', START_BANK) });
    game.setBet(store.get('bet:videopoker', MAX_BET));
    shownHand = [];
    build();
    layout();
    idle();
    whisper('the machine is hungry');
  }

  function stop() {
    run += 1;
    keyHandler = null;
    // Walking away mid-hand: the machine draws for you.
    if (game?.phase === 'hold') {
      game.draw();
      store.set('bank:videopoker', game.bank);
    }
    actions.replaceChildren();
    felt.clear();
    felt.root.replaceChildren();
    els = null;
  }

  // ---- the machine ---------------------------------------------------------

  function build() {
    const root = felt.root;
    root.dataset.mode = 'videopoker';
    const table = document.createElement('div');
    table.className = 'paytable';
    table.innerHTML = PAYTABLE.map((row) => `<div class="pay-row" data-id="${row.id}"><span>${row.name}</span>${
      Array.from({ length: MAX_BET }, (_, i) => `<b data-bet="${i + 1}">${payout(row, i + 1)}</b>`).join('')}</div>`).join('');
    const banner = document.createElement('p');
    banner.className = 'vp-banner';
    const holds = Array.from({ length: 5 }, () => {
      const tag = document.createElement('span');
      tag.className = 'held-tag';
      tag.textContent = 'HELD';
      root.append(tag);
      return tag;
    });
    root.append(table, banner);
    els = { table, banner, holds };
  }

  function layout() {
    felt.measure({ across: 6.4, down: 3.4, max: 9 });
    felt.deck = { x: felt.w / 2, y: felt.h + felt.cardH };
    render({ instant: true });
  }

  const cardX = (i) => felt.w / 2 + (i - 2) * felt.cardW * 1.14;
  const cardY = () => felt.h - felt.cardH * 0.75 - 18;

  function render({ instant = false, delays = [] } = {}) {
    if (!els) return;
    shownHand.forEach((card, i) => {
      const held = game.phase === 'hold' && game.held[i];
      const el = felt.put(card, cardX(i), cardY() - (held ? felt.cardH * 0.12 : 0), { instant, delay: delays[i] ?? 0, z: 100 + i });
      el.onpointerdown = (e) => {
        e.preventDefault();
        toggle(i);
      };
      el.classList.toggle('is-held', held);
      const tag = els.holds[i];
      tag.style.left = `${cardX(i)}px`;
      tag.style.top = `${cardY() + felt.cardH * 0.62}px`;
      tag.classList.toggle('is-on', held);
    });
    for (const b of els.table.querySelectorAll('b')) b.classList.toggle('is-bet', Number(b.dataset.bet) === game.bet);
    ctx.hud([['Souls', game.bank], ['Bet', game.bet], ['Best', Math.max(stats().best, game.bank)]]);
  }

  function banner(text, kind = '') {
    els.banner.textContent = text;
    els.banner.dataset.kind = kind;
  }

  // ---- playing -------------------------------------------------------------

  function idle() {
    if (game.bank < 1) {
      const s = stats();
      store.set('stats:videopoker', { ...s, ruined: s.ruined + 1 });
      game.bank = START_BANK;
      store.set('bank:videopoker', game.bank);
      whisper('the machine spits your soul back out. for now');
      sfx.sting();
      fx.shake(0.5);
    }
    game.setBet(game.bet);
    render();
    if (!shownHand.length) banner('BET, THEN DEAL');
    const row = document.createElement('div');
    row.className = 'action-row';
    const betOne = button('Bet one', 'btn--small', () => {
      game.setBet(game.bet >= Math.min(MAX_BET, game.bank) ? 1 : game.bet + 1);
      store.set('bet:videopoker', game.bet);
      sfx.place();
      render();
    }, 'b');
    const betMax = button('Bet max', 'btn--small', () => {
      game.setBet(MAX_BET);
      store.set('bet:videopoker', game.bet);
      sfx.foundation(2);
      render();
    }, 'm');
    const dealBtn = button('Deal', 'btn--blood btn--wide', deal, 'enter');
    row.append(betOne, betMax, dealBtn);
    actions.replaceChildren(row);
    keyHandler = (k) => press([betOne, betMax, dealBtn], k === ' ' ? 'enter' : k);
  }

  async function deal() {
    if (busy || !game.canDeal()) return;
    busy = true;
    const token = run;
    keyHandler = null;
    actions.replaceChildren();
    for (const row of els.table.querySelectorAll('.pay-row')) row.classList.remove('is-hit');
    banner('');
    await felt.sweep(felt.w / 2, felt.h + felt.cardH);
    if (token !== run) return;
    const { hand, line } = game.deal();
    store.set('bank:videopoker', game.bank);
    shownHand = hand;
    sfx.shuffle();
    render({ delays: hand.map((_, i) => i * 90) });
    hand.forEach((_, i) => setTimeout(() => sfx.draw(), i * 90));
    await sleep(600);
    busy = false;
    if (token !== run) return;
    if (line) {
      banner(line.name.toUpperCase(), 'tease');
      els.table.querySelector(`[data-id="${line.id}"]`).classList.add('is-hit');
    } else banner('HOLD WHAT YOU LOVE');
    choose();
  }

  function toggle(i) {
    if (busy || !game.toggle(i)) return;
    sfx.flip();
    fx.buzz(6);
    render();
  }

  function choose() {
    const row = document.createElement('div');
    row.className = 'action-row';
    const hint = button('Hint', 'btn--small btn--pumpkin', () => {
      const holds = game.suggestHolds(game.hand);
      holds.forEach((h, i) => { if (h !== game.held[i]) game.toggle(i); });
      sfx.pick();
      render();
    }, 'h');
    const drawBtn = button('Draw', 'btn--blood btn--wide', draw, 'enter');
    row.append(hint, drawBtn);
    actions.replaceChildren(row);
    keyHandler = (k) => {
      if (['1', '2', '3', '4', '5'].includes(k)) {
        toggle(Number(k) - 1);
        return true;
      }
      return press([hint, drawBtn], k === ' ' ? 'enter' : k);
    };
  }

  async function draw() {
    if (busy) return;
    busy = true;
    const token = run;
    keyHandler = null;
    actions.replaceChildren();
    const res = game.draw();
    store.set('bank:videopoker', game.bank);
    // Replaced cards sink away, new ones rise up.
    for (const i of res.replaced) {
      const old = shownHand[i];
      const el = felt.cards.get(old.id);
      if (el) {
        el.style.transitionDelay = '0ms';
        el.classList.remove('face-up');
        el.style.transform = felt.transform(cardX(i), felt.h + felt.cardH, 1, 0);
        felt.cards.delete(old.id);
        setTimeout(() => el.remove(), 400);
      }
    }
    await sleep(250);
    shownHand = res.hand;
    render({ delays: res.hand.map((_, i) => res.replaced.indexOf(i) * 110) });
    res.replaced.forEach((_, k) => setTimeout(() => sfx.draw(), k * 110));
    await sleep(300 + res.replaced.length * 110);
    if (token !== run) return;
    settle(res);
    await sleep(res.won ? 1100 : 500);
    busy = false;
    if (token === run) idle();
  }

  function settle(res) {
    for (const row of els.table.querySelectorAll('.pay-row')) row.classList.toggle('is-hit', row.dataset.id === res.line?.id);
    const s = stats();
    store.set('stats:videopoker', { ...s, played: s.played + 1, best: Math.max(s.best, game.bank), biggest: Math.max(s.biggest, res.won) });
    const mid = felt.screen(felt.w / 2, cardY());
    if (!res.won) {
      banner('NOTHING. THE MACHINE GRINS', 'lose');
      sfx.nope();
      fx.buzz(30);
      return;
    }
    const big = ['royal', 'straight-flush', 'quads'].includes(res.line.id);
    banner(`${res.line.name.toUpperCase()}  +${res.won}`, 'win');
    res.hand.forEach((c) => felt.flash(c.id, 'is-landed', 320));
    fx.popup(`+${res.won}`, mid.x, mid.y - felt.cardH, big ? 'popup--huge' : 'popup--ecto');
    fx.burst(mid.x, mid.y, { palette: big ? 'ember' : 'ecto', count: big ? 120 : 20 + res.won, speed: big ? 12 : 7 });
    ctx.bump(document.getElementById('table-value-0'));
    if (big) {
      sfx.win();
      fx.shake(0.8);
      fx.buzz([60, 40, 60, 40, 200]);
      ctx.bg.pulse(3);
      whisper(res.line.id === 'royal' ? 'the machine screams' : 'the machine shudders');
    } else {
      sfx.foundation(Math.min(10, res.won));
      fx.buzz([20, 30]);
    }
    ctx.trophy('videopoker', { line: res.line.id });
    ctx.trophy('bank', { bank: game.bank });
  }

  function press(buttons, key) {
    const b = buttons.find((x) => x.dataset.key === key);
    if (b) b.click();
    return Boolean(b);
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

  return {
    start,
    stop,
    layout: () => els && layout(),
    key: (k) => keyHandler?.(k) ?? false,
    stats,
    bank: () => store.get('bank:videopoker', START_BANK),
  };
}
