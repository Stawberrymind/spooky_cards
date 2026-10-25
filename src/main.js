import './style.css';
import { Klondike, TABLEAU_IDS, FOUNDATION_IDS } from './engine/klondike.js';
import { loadArt } from './ui/art.js';
import { Board } from './ui/board.js';
import { startBackground } from './ui/background.js';
import { sfx, setSound, unlockAudio } from './ui/audio.js';
import { burst, shake, popup, bump, buzz, startCascade, stopCascade } from './ui/fx.js';

const $ = (id) => document.getElementById(id);
const BASE = import.meta.env.BASE_URL;

// ---- persistence (per-browser conveniences only) ----------------------------

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`spooky-solitaire:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(`spooky-solitaire:${key}`);
      else localStorage.setItem(`spooky-solitaire:${key}`, JSON.stringify(value));
    } catch { /* private mode etc. */ }
  },
};

const settings = { drawCount: 1, sound: true, music: false, scares: true, ...store.get('settings', {}) };
const stats = { played: 0, won: 0, bestTime: null, bestScore: 0, ...store.get('stats', {}) };

// ---- app state --------------------------------------------------------------

let game = null;
let board = null;
let bg = null;
let elapsed = 0;
let timerStarted = false;
let won = false;
let combo = 0;
let comboTimer = null;
let autoCompleting = false;
let lastShownScore = 0;
let idleTimer = null;
let scareTimer = null;
let busyUntil = 0;

const WHISPERS = {
  idle: ['the cards are getting cold', 'something shuffles behind you', 'it is waiting for you to move', 'do not look at the stock'],
  stuck: ['the dead are waiting', 'there is no way out of this one', 'deal again... if you dare'],
  undo: ['there is no going back', 'it remembers what you did', 'time does not run backwards here'],
  scare: ['did you hear that', 'it is closer now', 'look behind you', 'we see you'],
  start: ['the dead are dealt', 'seven graves, fifty-two souls', 'lay them to rest'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---- boot -------------------------------------------------------------------

async function boot() {
  setSound(settings.sound);
  bg = startBackground($('bg'));
  animatePumpkin();
  syncMenu();
  await loadArt();

  board = new Board($('board'), { draw, move, autoMove, grab: () => sfx.pick(), drop: () => { sfx.nope(); buzz(30); } });
  window.addEventListener('resize', () => {
    if (!game) return;
    board.layout();
    board.render({ instant: true });
  });

  $('play-button').addEventListener('click', () => newGame());
  $('daily-button').addEventListener('click', () => newGame({ daily: true }));
  $('continue-button').addEventListener('click', continueGame);
  $('draw-toggle').addEventListener('click', () => {
    settings.drawCount = settings.drawCount === 1 ? 3 : 1;
    saveSettings();
  });
  $('sound-toggle').addEventListener('click', () => {
    settings.sound = !settings.sound;
    setSound(settings.sound);
    saveSettings();
  });
  $('music-toggle').addEventListener('click', () => {
    settings.music = !settings.music;
    saveSettings();
    syncMusic();
  });
  $('scare-toggle').addEventListener('click', () => {
    settings.scares = !settings.scares;
    saveSettings();
  });

  $('undo-button').addEventListener('click', undo);
  $('hint-button').addEventListener('click', hint);
  $('new-button').addEventListener('click', () => newGame());
  $('menu-button').addEventListener('click', showMenu);
  $('win-again').addEventListener('click', () => newGame());
  $('win-menu').addEventListener('click', showMenu);
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  setInterval(tickTimer, 1000);
}

function saveSettings() {
  store.set('settings', settings);
  syncMenu();
}

function syncMenu() {
  $('draw-toggle').textContent = `Draw ${settings.drawCount}`;
  $('draw-toggle').setAttribute('aria-pressed', String(settings.drawCount === 3));
  $('sound-toggle').textContent = `Sound: ${settings.sound ? 'on' : 'off'}`;
  $('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  $('music-toggle').textContent = `Music: ${settings.music ? 'on' : 'off'}`;
  $('music-toggle').setAttribute('aria-pressed', String(settings.music));
  $('scare-toggle').textContent = `Scares: ${settings.scares ? 'on' : 'off'}`;
  $('scare-toggle').setAttribute('aria-pressed', String(settings.scares));
  const save = store.get('save', null);
  $('continue-button').hidden = !save;
  $('menu-stats').textContent = stats.played
    ? `${stats.won} escaped of ${stats.played}${stats.bestTime ? ` · fastest ${formatTime(stats.bestTime)}` : ''}`
    : '';
}

function syncMusic() {
  const music = $('music');
  music.volume = 0.45;
  if (settings.music) music.play().catch(() => {});
  else music.pause();
}

function animatePumpkin() {
  const img = $('menu-pumpkin');
  let frame = 0;
  setInterval(() => {
    frame = (frame + 1) % 5;
    img.src = `${BASE}pumpkin/sprite_${frame}.png`;
  }, 1000 / 12);
}

// ---- screens ----------------------------------------------------------------

function showMenu() {
  saveGame();
  stopCascade();
  $('win').hidden = true;
  $('game-screen').hidden = true;
  $('menu-screen').hidden = false;
  clearTimeout(scareTimer);
  clearTimeout(idleTimer);
  syncMenu();
}

function showGame() {
  $('menu-screen').hidden = true;
  $('win').hidden = true;
  $('game-screen').hidden = false;
  $('board').style.opacity = '';
  syncMusic();
  board.layout();
}

function newGame({ daily = false } = {}) {
  stopCascade();
  const today = new Date();
  const seed = daily
    ? today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    : Math.floor(Math.random() * 2 ** 31);
  start(new Klondike({ seed, drawCount: settings.drawCount }), 0);
  stats.played += 1;
  store.set('stats', stats);
  whisper(daily ? 'today\'s haunting is the same for everyone' : pick(WHISPERS.start));
}

function continueGame() {
  const save = store.get('save', null);
  if (!save) return newGame();
  start(Klondike.fromJSON(save.game), save.elapsed ?? 0, { deal: false });
}

function start(nextGame, startElapsed, { deal = true } = {}) {
  game = nextGame;
  elapsed = startElapsed;
  timerStarted = startElapsed > 0;
  won = false;
  combo = 0;
  autoCompleting = false;
  lastShownScore = game.score;
  showGame();
  board.setGame(game);
  if (deal) dealAnimation();
  else board.render({ instant: true });
  updateHud(false);
  saveGame();
  armIdle();
  armScare();
}

function dealAnimation() {
  // Everything starts face down on the stock, then flies out row by row.
  for (const id of Object.keys(game.piles)) {
    for (const card of game.pile(id)) board.pileOf.set(card.id, 'stock');
  }
  const stockOnly = { ...game.piles };
  const real = game.piles;
  game.piles = { ...Object.fromEntries(Object.keys(real).map((k) => [k, []])), stock: Object.values(stockOnly).flat().map((c) => ({ ...c, faceUp: false })) };
  board.render({ instant: true });
  game.piles = real;

  const delays = new Map();
  let k = 0;
  for (let row = 0; row < 7; row++) {
    TABLEAU_IDS.forEach((id, col) => {
      if (col >= row) delays.set(game.pile(id)[row].id, 120 + k++ * 45);
    });
  }
  busyUntil = performance.now() + 120 + k * 45 + 300;
  sfx.shuffle();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    board.render({ delays });
    for (let i = 0; i < k; i += 3) setTimeout(() => sfx.draw(), 120 + i * 45);
  }));
}

// ---- moves ------------------------------------------------------------------

function busy() {
  return autoCompleting || won || performance.now() < busyUntil;
}

function draw() {
  if (busy()) return;
  if (!game.canDraw()) {
    sfx.nope();
    return;
  }
  const res = game.draw();
  const delays = new Map(res.cards.map((c, i) => [c.id, i * 70]));
  board.render({ delays });
  if (res.recycled) {
    sfx.shuffle();
    if (game.drawCount === 1 && game.passes > 0) popup('-100', ...xy(board.centerOf('stock')), 'popup--pumpkin');
  } else {
    res.cards.forEach((_, i) => setTimeout(() => sfx.draw(), i * 70));
  }
  buzz(8);
  afterMove();
}

function move(fromId, index, toId) {
  if (busy()) return false;
  const res = game.move(fromId, index, toId);
  if (!res) return false;
  const delays = new Map(res.cards.map((c, i) => [c.id, i * 35]));
  board.render({ delays });
  celebrate(res, toId);
  afterMove();
  return true;
}

function autoMove(fromId, index) {
  if (busy()) return true;
  const toId = game.bestTarget(fromId, index);
  return toId ? move(fromId, index, toId) : false;
}

function celebrate(res, toId) {
  const lead = res.cards[0];
  setTimeout(() => board.flash(lead.id, 'is-landed', 320), 260);

  if (toId.startsWith('f')) {
    combo += 1;
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { combo = 0; }, 3500);
    const at = board.centerOf(toId);
    sfx.foundation(combo);
    buzz(14);
    setTimeout(() => {
      burst(at.x, at.y, { palette: 'ecto', count: 14 + combo * 4, speed: 5 + combo });
      popup(combo > 1 ? `+10  x${combo}` : '+10', at.x, at.y - board.cardH * 0.6, 'popup--ecto');
    }, 200);
    if (combo >= 3) bg.pulse(0.6);
    if (game.pile(toId).length === 13) {
      setTimeout(() => {
        sfx.suitDone();
        shake(0.55);
        bg.pulse(2.5);
        buzz([40, 50, 40]);
        burst(at.x, at.y, { palette: 'blood', count: 60, speed: 9 });
        popup('SUIT LAID TO REST', window.innerWidth / 2, window.innerHeight * 0.42, 'popup--huge');
      }, 320);
    }
  } else {
    sfx.place();
    buzz(8);
  }

  if (res.flipped) {
    setTimeout(() => {
      sfx.flip();
      const at = board.centerOf(res.flipped.id);
      burst(at.x, at.y, { palette: 'ember', count: 10, speed: 4 });
      popup('+5', at.x, at.y - board.cardH * 0.4, 'popup--pumpkin');
    }, 300);
  }
}

function undo() {
  if (busy() || !game.canUndo()) {
    sfx.nope();
    return;
  }
  game.undo();
  combo = 0;
  board.render();
  sfx.flip();
  if (Math.random() < 0.2) whisper(pick(WHISPERS.undo));
  afterMove();
}

function hint() {
  if (busy()) return;
  const [best] = game.hints();
  if (!best) {
    whisper(pick(WHISPERS.stuck));
    sfx.whisper();
    return;
  }
  if (best.draw) {
    const top = game.top('stock');
    if (top) board.flash(top.id, 'is-hint', 1900);
    else popup('↻', ...xy(board.centerOf('stock')), 'popup--ecto');
  } else {
    board.flash(game.pile(best.fromId)[best.index].id, 'is-hint', 1900);
    const target = game.top(best.toId);
    if (target) board.flash(target.id, 'is-hint', 1900);
    else popup('here', ...xy(board.centerOf(best.toId)), 'popup--ecto');
  }
  sfx.pick();
}

function afterMove() {
  if (!timerStarted) timerStarted = true;
  updateHud(true);
  saveGame();
  armIdle();
  if (game.isWon()) return winSequence();
  if (game.canAutoComplete() && !autoCompleting) {
    whisper('they are going home on their own');
    autoComplete();
    return;
  }
  if (!game.hints().length) {
    setTimeout(() => whisper(pick(WHISPERS.stuck)), 600);
  }
}

function autoComplete() {
  autoCompleting = true;
  const step = () => {
    const m = game.nextAutoMove();
    if (!m) {
      autoCompleting = false;
      afterMove();
      return;
    }
    const res = game.move(m.fromId, m.index, m.toId);
    board.render();
    celebrate(res, m.toId);
    updateHud(true);
    if (game.isWon()) {
      autoCompleting = false;
      saveGame();
      setTimeout(winSequence, 400);
      return;
    }
    setTimeout(step, 110);
  };
  setTimeout(step, 300);
}

function winSequence() {
  if (won) return;
  won = true;
  stats.won += 1;
  stats.bestTime = stats.bestTime ? Math.min(stats.bestTime, elapsed) : elapsed;
  stats.bestScore = Math.max(stats.bestScore, game.score);
  store.set('stats', stats);
  store.set('save', null);
  clearTimeout(scareTimer);
  clearTimeout(idleTimer);

  sfx.win();
  shake(0.9);
  bg.pulse(3);
  buzz([60, 40, 60, 40, 200]);
  burst(window.innerWidth / 2, window.innerHeight / 2, { palette: 'ember', count: 120, speed: 12 });

  $('win-score').textContent = game.score;
  $('win-moves').textContent = game.moves;
  $('win-time').textContent = formatTime(elapsed);
  $('win-count').textContent = stats.won;

  setTimeout(() => {
    const rect = $('board').getBoundingClientRect();
    const stacks = FOUNDATION_IDS.map((id, i) => ({
      x: rect.left + board.colX(3 + i),
      y: rect.top + board.top,
      cards: game.pile(id),
    }));
    $('board').style.opacity = '0.12';
    startCascade(stacks, board.cardW, board.cardH, () => {
      $('win').hidden = false;
    });
  }, 900);
}

// ---- HUD, timer, save ---------------------------------------------------------

function updateHud(animate) {
  const scoreEl = $('hud-score');
  scoreEl.textContent = game.score;
  if (animate && game.score !== lastShownScore) bump(scoreEl);
  lastShownScore = game.score;
  $('hud-moves').textContent = game.moves;
  $('hud-time').textContent = formatTime(elapsed);
  $('undo-button').disabled = !game.canUndo();
}

function tickTimer() {
  if (!game || won || !timerStarted || document.hidden || $('game-screen').hidden) return;
  elapsed += 1;
  $('hud-time').textContent = formatTime(elapsed);
  if (elapsed % 15 === 0) saveGame();
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function saveGame() {
  if (!game || won) return;
  store.set('save', { game: game.toJSON(), elapsed });
}

const xy = (p) => [p.x, p.y];

// ---- atmosphere -------------------------------------------------------------

function whisper(text) {
  const el = $('whisper');
  el.textContent = text;
  el.classList.remove('is-shown');
  void el.offsetWidth;
  el.classList.add('is-shown');
}

function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (won || $('game-screen').hidden) return;
    whisper(pick(WHISPERS.idle));
    sfx.whisper();
    armIdle();
  }, 35000);
}

function armScare() {
  clearTimeout(scareTimer);
  scareTimer = setTimeout(() => {
    if (settings.scares && !won && !document.hidden && !$('game-screen').hidden) scare();
    armScare();
  }, 50000 + Math.random() * 70000);
}

// The lights stutter and something in the dark looks at you.
function scare() {
  const dim = $('dim');
  const eyes = $('eyes');
  const steps = [[0, 0.75], [90, 0.1], [160, 0.85], [260, 0.55]];
  steps.forEach(([t, o]) => setTimeout(() => { dim.style.opacity = String(o); }, t));
  eyes.style.left = `${10 + Math.random() * 75}%`;
  eyes.style.top = `${15 + Math.random() * 65}%`;
  setTimeout(() => eyes.classList.add('is-watching'), 260);
  sfx.sting();
  buzz([20, 60, 20]);
  setTimeout(() => {
    dim.style.opacity = '0';
    whisper(pick(WHISPERS.scare));
  }, 1500);
  setTimeout(() => eyes.classList.remove('is-watching'), 3200);
}

function onKey(e) {
  if (!game || $('game-screen').hidden) return;
  const key = e.key.toLowerCase();
  if (key === 'z') { e.preventDefault(); undo(); }
  else if (key === 'h') hint();
  else if (key === ' ' || key === 'd') { e.preventDefault(); draw(); }
  else if (key === 'n') newGame();
  else if (key === 'escape') showMenu();
}

// Dev-only handle for poking at the game from the console.
if (import.meta.env.DEV) {
  window.__solitaire = { get game() { return game; }, board: () => board, start, afterMove, Klondike };
}

boot();
