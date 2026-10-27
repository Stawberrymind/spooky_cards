import { Holdem } from '../engine/poker/holdem.js';
import { decide } from '../engine/poker/bot.js';
import { describe } from '../engine/poker/hands.js';
import { sleep, flyChips } from '../ui/felt.js';

// Texas Hold'em at the haunted table: you against up to five bots. The engine
// returns events; this plays them back one at a time with animation, keeping
// its own "view" of chips, bets and cards so the table only changes as fast
// as the story is told.

export const RIVALS = ['The Widow', 'Old Bones', 'Mother Moth', 'Pale Hank', 'Gravedigger'];
const START_CHIPS = 1000;
const ACTION_TEXT = { fold: 'FOLD', check: 'CHECK', call: 'CALL', raise: 'RAISE', 'all-in': 'ALL IN' };

export function createPoker(ctx) {
  const { felt, actions, sfx, fx, whisper } = ctx;
  let game = null;
  let view = null;
  let geo = null;
  let els = null;
  let run = 0;
  let level = 'normal';
  let pending = null; // resolves the human's action
  let keyHandler = null;

  // ---- lifecycle ---------------------------------------------------------

  function start({ opponents = 3, difficulty = 'normal', seed = Date.now(), resume = null }) {
    stop();
    const token = ++run;
    game = resume
      ? Holdem.fromJSON(resume)
      : new Holdem({
        seed,
        players: [{ name: 'You', chips: START_CHIPS }, ...RIVALS.slice(0, opponents).map((name) => ({ name, chips: START_CHIPS, bot: difficulty }))],
        smallBlind: 10,
        bigBlind: 20,
        levelHands: 8,
      });
    level = game.seats.find((s) => s.bot)?.bot ?? difficulty;
    view = freshView();
    build();
    layout();
    loop(token);
  }

  function stop() {
    run += 1;
    if (game && game.street !== 'done' && game.street !== 'idle' && !game.isOver() && !game.seats[0].out) save();
    pending?.(null);
    pending = null;
    actions.replaceChildren();
    felt.clear();
    felt.root.replaceChildren();
    els = null;
  }

  const alive = (token) => token === run;

  function save() {
    ctx.store.set('save:holdem', game.saveState());
  }

  function freshView() {
    return {
      // The engine has already posted this hand's blinds; the blind events take them off again.
      chips: game.seats.map((s) => s.chips + s.committed),
      bets: game.seats.map(() => 0),
      pot: 0,
      board: [],
      hole: game.seats.map(() => []),
      shown: new Set(),
      folded: new Set(game.seats.filter((s) => s.out).map((s) => s.seat)),
      best: new Set(),
      winners: new Set(),
      turn: -1,
      button: game.button,
    };
  }

  // ---- the table ---------------------------------------------------------

  function build() {
    const root = felt.root;
    root.replaceChildren();
    root.dataset.mode = 'poker';
    const table = div('poker-table');
    const emblem = document.createElement('img');
    emblem.className = 'table-emblem';
    emblem.src = `${import.meta.env.BASE_URL}pumpkin/sprite_0.png`;
    emblem.alt = '';
    table.append(emblem);
    const seats = game.seats.map((s, i) => {
      const plate = div(`seat${i === 0 ? ' seat--you' : ''}`);
      plate.innerHTML = `<span class="seat-name"></span><strong class="seat-chips"></strong><span class="seat-bubble"></span>`;
      plate.querySelector('.seat-name').textContent = s.name;
      const bet = div('bet');
      bet.innerHTML = '<span class="chip"></span><span class="bet-amount"></span>';
      root.append(plate, bet);
      return { plate, bet };
    });
    const pot = div('pot');
    pot.innerHTML = '<span class="chip"></span><span class="chip chip--b"></span><span class="pot-amount"></span>';
    const dealer = div('dealer-btn');
    dealer.textContent = 'D';
    const handLabel = div('hand-label');
    root.prepend(table);
    root.append(pot, dealer, handLabel);
    els = { table, seats, pot, dealer, handLabel };
  }

  function layout() {
    felt.measure({ across: 10, down: 6.2, max: 7 });
    const { w, h } = felt;
    const cx = w / 2;
    const cy = h * 0.46;
    const rx = Math.min(w * 0.4, h * 0.9);
    const ry = h * 0.38;
    const n = game.seats.length;
    const at = (k, r) => {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
      return { x: cx + rx * r * Math.cos(a), y: cy + ry * r * Math.sin(a) };
    };
    geo = { cx, cy, rx, ry, at };
    felt.deck = { x: cx, y: cy - felt.cardH * 0.2 };
    Object.assign(els.table.style, { left: `${cx - rx}px`, top: `${cy - ry}px`, width: `${rx * 2}px`, height: `${ry * 2}px` });
    render({ instant: true });
  }

  const clampX = (x) => Math.max(56, Math.min(felt.w - 56, x));
  const clampY = (y) => Math.max(26, Math.min(felt.h - 26, y));
  const narrow = () => felt.w < 600;
  const holeScale = (k) => (k === 0 ? 1.2 : narrow() ? 0.7 : 0.8);
  const holePos = (k) => geo.at(k, k === 0 ? 0.72 : narrow() ? 0.62 : 0.72);
  const platePos = (k) => {
    // Your plate sits right under your cards; rivals sit just outside the rim.
    if (k === 0) {
      const p = holePos(0);
      return { x: p.x, y: Math.min(felt.h - 24, p.y + felt.cardH * 0.6 * holeScale(0) + 16) };
    }
    const p = geo.at(k, 1.08);
    return { x: clampX(p.x), y: clampY(p.y) };
  };
  const betPos = (k) => geo.at(k, 0.48);
  const potPos = () => ({ x: geo.cx, y: geo.cy + felt.cardH * 0.78 });
  const boardX = (i) => geo.cx + (i - 2) * (felt.cardW + felt.px * 1.5);

  function render({ instant = false, delays = new Map() } = {}) {
    if (!els) return;
    game.seats.forEach((s, k) => {
      const you = k === 0;
      const folded = view.folded.has(k);
      const scale = holeScale(k);
      const base = folded && !you ? geo.at(k, 0.5) : holePos(k);
      view.hole[k].forEach((card, j) => {
        const el = felt.put(card, base.x + (j - 0.5) * felt.cardW * scale * 0.58, base.y, {
          faceUp: you || (view.shown.has(k) && !folded),
          scale,
          rot: (j - 0.5) * 8,
          z: 100 + k * 3 + j,
          dim: folded,
          delay: delays.get(card.id) ?? 0,
          instant,
        });
        el.classList.toggle('is-best', view.best.has(card.id));
      });
      const { plate, bet } = els.seats[k];
      const p = platePos(k);
      plate.style.left = `${p.x}px`;
      plate.style.top = `${p.y}px`;
      plate.querySelector('.seat-chips').textContent = s.out && view.chips[k] === 0 ? 'gone' : view.chips[k];
      plate.classList.toggle('is-turn', view.turn === k);
      plate.classList.toggle('is-folded', folded && !s.out);
      plate.classList.toggle('is-out', s.out && view.chips[k] === 0);
      plate.classList.toggle('is-winner', view.winners.has(k));
      const b = betPos(k);
      bet.style.left = `${b.x}px`;
      bet.style.top = `${b.y}px`;
      bet.hidden = !view.bets[k];
      bet.querySelector('.bet-amount').textContent = view.bets[k];
    });
    view.board.forEach((card, i) => {
      const el = felt.put(card, boardX(i), geo.cy, { z: 200 + i, delay: delays.get(card.id) ?? 0, instant });
      el.classList.toggle('is-best', view.best.has(card.id));
    });
    const pp = potPos();
    Object.assign(els.pot.style, { left: `${pp.x}px`, top: `${pp.y}px` });
    els.pot.hidden = !view.pot;
    els.pot.querySelector('.pot-amount').textContent = view.pot;
    if (view.button >= 0) {
      const d = platePos(view.button);
      const right = d.x + 66 < felt.w - 12;
      Object.assign(els.dealer.style, { left: `${right ? d.x + 62 : d.x - 62}px`, top: `${d.y}px` });
    }
    els.dealer.hidden = view.button < 0;
    // What you're holding, in words.
    const mine = view.hole[0];
    const label = els.handLabel;
    const lp = holePos(0);
    Object.assign(label.style, { left: `${lp.x + felt.cardW * 1.25 + 8}px`, top: `${lp.y}px` });
    label.hidden = mine.length < 2 || view.folded.has(0);
    if (!label.hidden) label.textContent = holdingName(mine, view.board);
    ctx.hud([['Souls', view.chips[0]], ['Hand', game.handNo || '-'], ['Blinds', `${game.sb}/${game.bb}`]]);
  }

  function holdingName(hole, board) {
    if (board.length >= 3) return describe([...hole, ...board]).name;
    return hole[0].rank === hole[1].rank ? 'Pocket pair' : `${hole[0].suit === hole[1].suit ? 'Suited' : 'Offsuit'}`;
  }

  // ---- the story of a hand -----------------------------------------------

  async function loop(token) {
    while (alive(token)) {
      if (game.seats[0].out || game.isOver()) {
        finish();
        return;
      }
      const before = game.bb;
      save();
      const events = game.startHand();
      if (game.bb > before && game.handNo > 1) whisper('the blinds grow hungrier');
      await play(events, token);
    }
  }

  async function play(events, token) {
    for (const e of events) {
      if (!alive(token)) return;
      await step(e, token);
    }
  }

  async function step(e, token) {
    switch (e.type) {
      case 'hand': {
        await felt.sweep(geo.cx, geo.cy);
        view = freshView();
        view.button = e.button;
        render();
        await sleep(300);
        break;
      }
      case 'blind':
        view.chips[e.seat] -= e.amount;
        view.bets[e.seat] += e.amount;
        sfx.place();
        render();
        await sleep(160);
        break;
      case 'deal': {
        const delays = new Map(e.cards.map(({ card }, i) => [card.id, i * 85]));
        for (const { seat, card } of e.cards) view.hole[seat].push(card);
        sfx.shuffle();
        render({ delays });
        e.cards.forEach((_, i) => { if (i % 2 === 0) setTimeout(() => sfx.draw(), i * 85); });
        await sleep(e.cards.length * 85 + 380);
        break;
      }
      case 'turn':
        await turn(e.seat, token);
        break;
      case 'action':
        await showAction(e);
        break;
      case 'collect': {
        const pp = potPos();
        let swept = 0;
        view.bets.forEach((amount, k) => {
          if (!amount) return;
          flyChips(felt.root, betPos(k), pp, { count: Math.min(5, 1 + Math.floor(amount / game.bb)) });
          swept += amount;
          view.bets[k] = 0;
        });
        if (!swept) break;
        view.pot += swept;
        sfx.draw();
        render();
        await sleep(450);
        break;
      }
      case 'street': {
        const start = view.board.length;
        view.board.push(...e.cards);
        const delays = new Map(e.cards.map((c, i) => [c.id, i * 140]));
        render({ delays });
        e.cards.forEach((_, i) => setTimeout(() => sfx.flip(), 150 + i * 140));
        await sleep(start === 0 ? 800 : 600);
        break;
      }
      case 'showdown':
        await showdown(e);
        break;
      case 'win': {
        view.winners = new Set([e.seat]);
        payOut(e.seat, e.amount, e.amount);
        render();
        if (e.seat === 0) cheer(e.amount, 'they all ran');
        await sleep(1100);
        break;
      }
      case 'end':
        view.turn = -1;
        view.chips = game.seats.map((s) => s.chips);
        render();
        await sleep(1300);
        break;
      default:
    }
  }

  async function turn(seat, token) {
    view.turn = seat;
    render();
    let action;
    if (seat === 0) {
      action = await askHuman();
      if (!alive(token) || !action) return;
    } else {
      status(`${game.seats[seat].name} is thinking…`);
      await sleep(450 + Math.random() * (level === 'hard' ? 900 : 600));
      if (!alive(token)) return;
      action = decide(game, seat, level);
      status('');
    }
    const legal = game.legal(seat);
    const events = game.act(seat, action) ?? game.act(seat, { type: legal.canCheck ? 'check' : 'fold' });
    view.turn = -1;
    await play(events, token);
  }

  async function showAction(e) {
    const k = e.seat;
    view.chips[k] -= e.amount;
    view.bets[k] += e.amount;
    if (e.action === 'fold') view.folded.add(k);
    const label = ACTION_TEXT[e.action] + (e.action === 'raise' || e.action === 'all-in' ? ` ${e.bet}` : e.amount ? ` ${e.amount}` : '');
    bubble(k, label);
    const at = felt.screen(platePos(k).x, platePos(k).y);
    if (e.action === 'all-in') {
      sfx.suitDone();
      fx.shake(0.4);
      fx.buzz([30, 40, 30]);
      fx.burst(at.x, at.y, { palette: 'blood', count: 40, speed: 8 });
      ctx.bg.pulse(1.5);
    } else if (e.action === 'raise') {
      sfx.foundation(3);
      fx.buzz(14);
      fx.burst(at.x, at.y, { palette: 'ember', count: 14, speed: 5 });
    } else if (e.action === 'fold') {
      sfx.flip();
    } else {
      sfx.place();
      fx.buzz(8);
    }
    render();
    await sleep(e.action === 'all-in' ? 900 : 550);
  }

  async function showdown(e) {
    for (const seat of Object.keys(e.hands)) view.shown.add(Number(seat));
    render();
    sfx.flip();
    await sleep(900);
    for (const pot of e.pots) {
      const first = pot.winners[0].seat;
      view.best = new Set(e.hands[first].cards.map((c) => c.id));
      view.winners = new Set(pot.winners.map((w) => w.seat));
      render();
      for (const w of pot.winners) {
        const p = felt.screen(platePos(w.seat).x, platePos(w.seat).y);
        fx.popup(e.hands[w.seat].name.toUpperCase(), p.x, p.y - 40, 'popup--ecto');
        payOut(w.seat, w.won, pot.amount / pot.winners.length);
      }
      render();
      const youWon = pot.winners.some((w) => w.seat === 0);
      if (youWon) cheer(pot.winners.find((w) => w.seat === 0).won, pot.winners.length > 1 ? 'you share the spoils' : null);
      else if (pot.eligible.includes(0)) {
        const p = felt.screen(platePos(0).x, platePos(0).y);
        fx.burst(p.x, p.y, { palette: 'blood', count: 30, speed: 6 });
        sfx.nope();
        fx.buzz(40);
      }
      await sleep(1700);
    }
  }

  function payOut(seat, won, fromPot) {
    flyChips(felt.root, potPos(), betPos(seat), { count: Math.min(6, 2 + Math.floor(won / (game.bb * 4))) });
    view.pot = Math.max(0, view.pot - Math.round(fromPot));
    view.chips[seat] += won;
  }

  function cheer(amount, text) {
    const p = felt.screen(platePos(0).x, platePos(0).y);
    sfx.win();
    fx.shake(0.35);
    fx.buzz([40, 30, 80]);
    fx.burst(p.x, p.y, { palette: 'ecto', count: 50, speed: 9 });
    fx.popup(`+${amount}`, p.x, p.y - 70, 'popup--huge');
    ctx.bg.pulse(2);
    if (text) whisper(text);
  }

  function bubble(k, text) {
    const b = els.seats[k].plate.querySelector('.seat-bubble');
    b.textContent = text;
    b.classList.remove('is-shown');
    void b.offsetWidth;
    b.classList.add('is-shown');
  }

  // ---- your turn -----------------------------------------------------------

  function status(text) {
    keyHandler = null;
    const p = document.createElement('p');
    p.className = 'table-status';
    p.textContent = text;
    actions.replaceChildren(p);
  }

  function askHuman() {
    const legal = game.legal(0);
    const me = game.seats[0];
    return new Promise((resolve) => {
      pending = resolve;
      const done = (action) => {
        pending = null;
        keyHandler = null;
        status('');
        resolve(action);
      };
      sfx.whisper();
      fx.buzz(20);
      const row = div('action-row');
      const buttons = [];
      if (!legal.canCheck) buttons.push(button('Fold', 'btn--blood', () => done({ type: 'fold' }), 'f'));
      buttons.push(legal.canCheck
        ? button('Check', '', () => done({ type: 'check' }), 'c')
        : button(legal.toCall >= me.chips ? `All in ${legal.toCall}` : `Call ${legal.toCall}`, 'btn--ecto', () => done({ type: 'call' }), 'c'));

      let raiseTo = legal.raise?.min ?? 0;
      const raiseRow = div('raise-row');
      if (legal.raise) {
        const { min, max } = legal.raise;
        const verb = game.currentBet ? 'Raise' : 'Bet';
        const go = button('', 'btn--pumpkin', () => done({ type: 'raise', to: raiseTo }), 'r');
        const slider = document.createElement('input');
        Object.assign(slider, { type: 'range', min, max, step: 5, value: min });
        slider.className = 'raise-slider';
        slider.setAttribute('aria-label', `${verb} amount`);
        const set = (v) => {
          raiseTo = Math.max(min, Math.min(max, Math.round(v / 5) * 5));
          if (max - raiseTo < 5) raiseTo = max;
          slider.value = raiseTo;
          go.textContent = raiseTo === max ? `All in ${max}` : `${verb} to ${raiseTo}`;
        };
        slider.addEventListener('input', () => set(Number(slider.value)));
        const pot = legal.pot + legal.toCall;
        const quick = [['Min', min], ['½ pot', game.currentBet + pot / 2], ['Pot', game.currentBet + pot], ['All in', max]];
        raiseRow.append(slider, ...quick.map(([t, v]) => button(t, 'btn--small', () => set(v))));
        set(min);
        buttons.push(go);
      }
      row.append(...buttons);
      actions.replaceChildren(...(legal.raise ? [raiseRow] : []), row);
      keyHandler = (key) => {
        const b = buttons.find((x) => x.dataset.key === key);
        if (b) b.click();
        return Boolean(b);
      };
    });
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

  // ---- the end ------------------------------------------------------------

  function finish() {
    ctx.store.set('save:holdem', null);
    const won = !game.seats[0].out;
    status(won ? 'the table is yours' : 'you have nothing left to bet');
    ctx.finish({
      won,
      title: won ? 'Last Soul Standing' : 'You Were Eaten',
      eyebrow: won ? 'every rival lies in the dirt' : 'your soul belongs to the table',
      stats: [['Souls', game.seats[0].chips], ['Hands', game.handNo], ['Rivals', game.seats.length - 1], ['Level', level]],
    });
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
    debug: () => ({ game, view }),
  };
}
