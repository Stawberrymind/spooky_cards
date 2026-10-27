import { BACKS, backImage, hasCustomBack } from './art.js';

// Trophies: little goals across every game. Some unlock a new card back.
// Games report what happened with check(event, data); each trophy decides
// whether that event earns it.

export const TROPHIES = [
  { id: 'first-escape', title: 'First Burial', desc: 'Win any solitaire.', on: 'solitaire-win', back: 'skull' },
  { id: 'klondike', title: 'Seven Graves', desc: 'Win Klondike.', on: 'solitaire-win', test: (d) => d.game === 'klondike' },
  { id: 'freecell', title: 'Nothing Hidden', desc: 'Win FreeCell.', on: 'solitaire-win', test: (d) => d.game === 'freecell' },
  { id: 'spider', title: 'Spun', desc: 'Win Spider.', on: 'solitaire-win', test: (d) => d.game === 'spider', back: 'web' },
  { id: 'spider-4', title: 'Eight-Legged Nightmare', desc: 'Win Spider with all 4 suits.', on: 'solitaire-win', test: (d) => d.game === 'spider' && d.suits === 4 },
  { id: 'tripeaks', title: 'Summit', desc: 'Clear all three peaks in TriPeaks.', on: 'solitaire-win', test: (d) => d.game === 'tripeaks' },
  { id: 'pyramid', title: 'Tomb Raider', desc: 'Clear the Pyramid.', on: 'solitaire-win', test: (d) => d.game === 'pyramid' },
  { id: 'golf', title: "Gravedigger's Round", desc: 'Win Golf.', on: 'solitaire-win', test: (d) => d.game === 'golf' },
  { id: 'avalanche', title: 'Avalanche', desc: 'A streak of 10 in TriPeaks or Golf.', on: 'streak', test: (d) => d.streak >= 10, back: 'pumpkin' },
  { id: 'quick', title: 'Quick Burial', desc: 'Win a solitaire in under 3 minutes.', on: 'solitaire-win', test: (d) => d.elapsed < 180 },
  { id: 'daily', title: 'Daily Haunt', desc: "Win the day's shared deal.", on: 'solitaire-win', test: (d) => d.daily },
  { id: 'gravekeeper', title: 'Gravekeeper', desc: 'Win 10 solitaires.', on: 'solitaire-win', test: (d) => d.totalWins >= 10 },
  { id: 'spun-run', title: 'Laid to Rest', desc: 'Complete a run in Spider.', on: 'spider-run' },
  { id: 'holdem', title: 'Last Soul Standing', desc: "Win a Hold'em table.", on: 'holdem-win', back: 'coffin' },
  { id: 'holdem-hard', title: 'Devil Dealt', desc: "Win a Hold'em table on Hard.", on: 'holdem-win', test: (d) => d.level === 'hard' },
  { id: 'monster', title: 'Monster Hand', desc: "Win a Hold'em showdown with a full house or better.", on: 'showdown-win', test: (d) => d.category >= 6 },
  { id: 'natural', title: 'Natural', desc: 'Get a blackjack.', on: 'blackjack', test: (d) => d.result === 'blackjack', back: 'bat' },
  { id: 'split-win', title: 'Two Heads', desc: 'Win both hands after a split in Blackjack.', on: 'blackjack', test: (d) => d.splitWins === 2 },
  { id: 'hoarder', title: 'Soul Hoarder', desc: 'Have 5,000 souls in a bank.', on: 'bank', test: (d) => d.bank >= 5000 },
  { id: 'quads', title: 'Four Horsemen', desc: 'Four of a kind or better in Video Poker.', on: 'videopoker', test: (d) => ['quads', 'straight-flush', 'royal'].includes(d.line), back: 'moth' },
  { id: 'royal', title: 'Royal Haunting', desc: 'A royal flush in Video Poker.', on: 'videopoker', test: (d) => d.line === 'royal' },
  { id: 'witching', title: 'Witching Hour', desc: 'Play between midnight and 3am.', on: 'start', test: () => new Date().getHours() < 3 },
];

export function createTrophies({ store, sfx, fx, onBack }) {
  const earned = new Set(store.get('trophies', []));
  let selectedBack = store.get('back', 'eye');

  const unlockedBacks = () => [
    'eye',
    ...TROPHIES.filter((t) => t.back && earned.has(t.id)).map((t) => t.back),
    ...(hasCustomBack() ? ['custom'] : []),
  ];

  function check(event, data = {}) {
    for (const t of TROPHIES) {
      if (t.on !== event || earned.has(t.id)) continue;
      if (t.test && !t.test(data)) continue;
      earned.add(t.id);
      store.set('trophies', [...earned]);
      toast(t);
    }
  }

  function toast(t) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast-label">Trophy</span><strong></strong><small></small>';
    el.querySelector('strong').textContent = t.title;
    el.querySelector('small').textContent = t.back ? `New card back: ${BACKS[t.back].name}` : t.desc;
    if (t.back) {
      const img = document.createElement('img');
      img.src = backImage(t.back);
      img.alt = '';
      el.prepend(img);
    }
    document.getElementById('toasts').append(el);
    setTimeout(() => {
      sfx.suitDone();
      fx.buzz([30, 30, 60]);
    }, 300);
    setTimeout(() => el.classList.add('is-leaving'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  /** Fill the trophy room dialog: card backs to pick, then every trophy. */
  function renderRoom(root) {
    const backs = unlockedBacks();
    const all = ['eye', ...TROPHIES.filter((t) => t.back).map((t) => t.back), ...(hasCustomBack() ? ['custom'] : [])];
    const grid = document.createElement('div');
    grid.className = 'back-grid';
    for (const id of all) {
      const open = backs.includes(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'back-choice';
      b.disabled = !open;
      b.setAttribute('aria-pressed', String(id === selectedBack));
      b.title = open ? (id === 'custom' ? 'Your own back' : BACKS[id].name) : `Locked: ${TROPHIES.find((t) => t.back === id).title}`;
      const img = document.createElement('img');
      img.src = backImage(id);
      img.alt = b.title;
      b.append(img);
      b.addEventListener('click', () => {
        selectedBack = id;
        store.set('back', id);
        onBack(id);
        sfx.flip();
        renderRoom(root);
      });
      grid.append(b);
    }
    const list = document.createElement('ul');
    list.className = 'trophy-list';
    for (const t of TROPHIES) {
      const li = document.createElement('li');
      li.classList.toggle('is-earned', earned.has(t.id));
      li.innerHTML = '<strong></strong><span></span>';
      li.querySelector('strong').textContent = earned.has(t.id) ? t.title : '???';
      li.querySelector('span').textContent = t.desc + (t.back ? ` Unlocks ${BACKS[t.back].name}.` : '');
      list.append(li);
    }
    const count = document.createElement('p');
    count.className = 'trophy-count';
    count.textContent = `${earned.size} of ${TROPHIES.length} trophies`;
    root.replaceChildren(count, grid, list);
  }

  return {
    check,
    renderRoom,
    back: () => (unlockedBacks().includes(selectedBack) ? selectedBack : 'eye'),
    count: () => earned.size,
  };
}
