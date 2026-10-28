import './style.css';
import { GAMES, GAME_IDS, createGame, optionsFor } from './engine/games.js';
import { loadArt, setBack } from './ui/art.js';
import { Board } from './ui/board.js';
import { startBackground } from './ui/background.js';
import { sfx, setSound, unlockAudio } from './ui/audio.js';
import { burst, shake, popup, bump, buzz, setHaptics, startCascade, stopCascade } from './ui/fx.js';
import { Felt } from './ui/felt.js';
import { createPoker } from './modes/poker.js';
import { createBlackjack } from './modes/blackjack.js';
import { createVideoPoker } from './modes/videopoker.js';
import { createTrophies } from './ui/trophies.js';
import { createLobbyScreen } from './ui/lobby-screen.js';

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

// Before there were several games, Klondike's save and stats had no game in the key.
for (const key of ['save', 'stats']) {
  const old = store.get(key, null);
  if (old) {
    if (!store.get(`${key}:klondike`, null)) store.set(`${key}:klondike`, old);
    store.set(key, null);
  }
}

const settings = { game: 'klondike', sound: true, music: false, scares: true, haptics: true, ...store.get('settings', {}) };
if (!GAMES[settings.game]) settings.game = 'klondike';

const freshStats = () => ({ played: 0, won: 0, bestTime: null, bestScore: 0 });
const statsFor = (id) => ({ ...freshStats(), ...store.get(`stats:${id}`, {}) });

// ---- app state --------------------------------------------------------------

let game = null;
let gameId = settings.game;
let stats = statsFor(gameId);
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
let table = null; // the running poker/blackjack/video poker controller
const modes = {};
let trophies = null;
let lobbyScreen = null;
let lastResultLobby = false;
let isDaily = false;

const WHISPERS = {
  idle: ['the cards are getting cold', 'something shuffles behind you', 'it is waiting for you to move', 'do not look at the stock'],
  stuck: ['the dead are waiting', 'there is no way out of this one', 'deal again... if you dare'],
  undo: ['there is no going back', 'it remembers what you did', 'time does not run backwards here'],
  scare: ['did you hear that', 'it is closer now', 'look behind you', 'we see you'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---- boot -------------------------------------------------------------------

async function boot() {
  setSound(settings.sound);
  setHaptics(settings.haptics);
  bg = startBackground($('bg'));
  animatePumpkin();
  buildGamePicker();
  syncMenu();
  await loadArt();
  trophies = createTrophies({ store, sfx, fx: { buzz }, onBack: setBack });
  setBack(trophies.back());
  trophies.check('start');

  board = new Board($('board'), { draw, move, autoMove, grab: () => sfx.pick(), drop: () => { sfx.nope(); buzz(30); } });
  const tableCtx = {
    felt: new Felt($('felt')),
    actions: $('table-actions'),
    store,
    sfx,
    fx: { burst, shake, popup, buzz },
    bg,
    whisper,
    bump,
    hud: setTableHud,
    finish: showResult,
    trophy: (event, data) => trophies.check(event, data),
  };
  modes.poker = createPoker(tableCtx);
  modes.blackjack = createBlackjack(tableCtx);
  modes.videopoker = createVideoPoker(tableCtx);
  lobbyScreen = createLobbyScreen({
    $,
    store,
    sfx,
    whisper,
    onStart: (opts) => startTable('holdem', opts),
    onExit: () => showMenu(),
  });
  syncMenu();
  window.addEventListener('resize', () => {
    if (table) table.layout();
    if (!game || $('game-screen').hidden) return;
    board.layout();
    board.render({ instant: true });
  });

  $('play-button').addEventListener('click', () => newGame());
  $('daily-button').addEventListener('click', () => newGame({ daily: true }));
  $('continue-button').addEventListener('click', continueGame);
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
  $('haptics-toggle').addEventListener('click', () => {
    settings.haptics = !settings.haptics;
    setHaptics(settings.haptics);
    buzz(30);
    saveSettings();
  });
  $('trophies-button').addEventListener('click', () => {
    trophies.renderRoom($('trophy-body'));
    $('trophy-room').hidden = false;
    sfx.pick();
  });
  $('trophy-close').addEventListener('click', () => { $('trophy-room').hidden = true; });
  $('rules-button').addEventListener('click', () => openRules(gameId));
  $('table-rules-button').addEventListener('click', () => openRules(gameId));
  $('rules-close').addEventListener('click', closeRules);

  $('undo-button').addEventListener('click', undo);
  $('hint-button').addEventListener('click', hint);
  $('new-button').addEventListener('click', () => newGame());
  $('menu-button').addEventListener('click', showMenu);
  $('table-menu-button').addEventListener('click', showMenu);
  $('win-again').addEventListener('click', () => (lastResultLobby ? showLobby() : newGame()));
  $('friends-button').addEventListener('click', () => showLobby());
  $('win-menu').addEventListener('click', showMenu);
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  setInterval(tickTimer, 1000);
}

function buildGamePicker() {
  const picker = $('game-picker');
  for (const id of GAME_IDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--small';
    btn.setAttribute('role', 'radio');
    btn.dataset.game = id;
    btn.textContent = GAMES[id].title;
    btn.addEventListener('click', () => {
      if (settings.game === id) return;
      settings.game = id;
      sfx.flip();
      saveSettings();
    });
    picker.append(btn);
  }
}

function saveSettings() {
  store.set('settings', settings);
  syncMenu();
}

function syncMenu() {
  const { variants, blurb, family } = GAMES[settings.game];
  for (const btn of $('game-picker').children) btn.setAttribute('aria-checked', String(btn.dataset.game === settings.game));
  $('game-blurb').textContent = blurb;
  const sub = document.querySelector('.title--sub');
  sub.textContent = family;
  sub.dataset.text = family;
  const options = optionsFor(settings.game, settings);
  $('variant-toggles').replaceChildren(...variants.map((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--small';
    btn.textContent = v.label(options[v.key]);
    btn.addEventListener('click', () => {
      settings[v.key] = v.values[(v.values.indexOf(options[v.key]) + 1) % v.values.length];
      sfx.pick();
      saveSettings();
    });
    return btn;
  }));
  $('sound-toggle').textContent = `Sound: ${settings.sound ? 'on' : 'off'}`;
  $('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  $('music-toggle').textContent = `Music: ${settings.music ? 'on' : 'off'}`;
  $('music-toggle').setAttribute('aria-pressed', String(settings.music));
  $('scare-toggle').textContent = `Scares: ${settings.scares ? 'on' : 'off'}`;
  $('scare-toggle').setAttribute('aria-pressed', String(settings.scares));
  $('haptics-toggle').textContent = `Buzz: ${settings.haptics ? 'on' : 'off'}`;
  $('haptics-toggle').setAttribute('aria-pressed', String(settings.haptics));
  if (trophies) $('trophies-button').textContent = `Trophies ${trophies.count()}`;
  $('continue-button').hidden = !store.get(`save:${settings.game}`, null);
  $('friends-button').hidden = settings.game !== 'holdem';
  $('menu-stats').textContent = menuStats(settings.game);
}

function menuStats(id) {
  const banked = modes[GAMES[id].mode];
  if (banked?.bank) {
    const s = banked.stats();
    return `${banked.bank()} souls in the bank${s.played ? ` · best ${s.best}` : ''}`;
  }
  const s = statsFor(id);
  if (!s.played) return '';
  if (id === 'holdem') return `${s.won} tables taken of ${s.played}`;
  return `${s.won} escaped of ${s.played}${s.bestTime ? ` · fastest ${formatTime(s.bestTime)}` : ''}`;
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
  stopTable();
  lobbyScreen?.leave();
  stopCascade();
  $('win').hidden = true;
  $('game-screen').hidden = true;
  $('table-screen').hidden = true;
  $('lobby-screen').hidden = true;
  $('stage').dataset.screen = 'menu';
  $('menu-screen').hidden = false;
  clearTimeout(scareTimer);
  clearTimeout(idleTimer);
  syncMenu();
}

function stopTable() {
  table?.stop();
  table = null;
}

/** The lobby screen; `code` comes from an invite link. */
function showLobby(code) {
  saveGame();
  stopTable();
  stopCascade();
  game = null;
  $('menu-screen').hidden = true;
  $('game-screen').hidden = true;
  $('table-screen').hidden = true;
  $('win').hidden = true;
  $('lobby-screen').hidden = false;
  $('stage').dataset.screen = 'lobby';
  clearTimeout(scareTimer);
  clearTimeout(idleTimer);
  lobbyScreen.open(code);
}

function showGame() {
  stopTable();
  $('menu-screen').hidden = true;
  $('win').hidden = true;
  $('table-screen').hidden = true;
  $('lobby-screen').hidden = true;
  $('game-screen').hidden = false;
  $('stage').dataset.screen = 'solitaire';
  $('board').style.opacity = '';
  syncMusic();
  board.layout();
}

/** New game of whatever is picked on the menu (or the one being played, from in-game). */
function newGame({ daily = false } = {}) {
  stopCascade();
  const id = $('menu-screen').hidden && gameId ? gameId : settings.game;
  const today = new Date();
  const seed = daily
    ? today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    : Math.floor(Math.random() * 2 ** 31);
  if (GAMES[id].mode) {
    startTable(id, { seed, ...optionsFor(id, settings) });
    if (daily) whisper('today\'s haunting is the same for everyone');
    return;
  }
  start(id, createGame(id, seed, settings), 0);
  isDaily = daily;
  stats.played += 1;
  store.set(`stats:${gameId}`, stats);
  whisper(daily ? 'today\'s haunting is the same for everyone' : pick(GAMES[id].whispers));
}

function startTable(id, options) {
  const fresh = !options.resume;
  saveGame();
  game = null;
  gameId = id;
  $('menu-screen').hidden = true;
  $('game-screen').hidden = true;
  $('lobby-screen').hidden = true;
  $('win').hidden = true;
  $('table-screen').hidden = false;
  $('stage').dataset.screen = 'table';
  syncMusic();
  stopTable();
  table = modes[GAMES[id].mode];
  table.start(options);
  showRulesOnce(id);
  if (fresh && GAMES[id].mode === 'poker') {
    const s = statsFor(id);
    s.played += 1;
    store.set(`stats:${id}`, s);
  }
  armIdle();
  armScare();
}

function continueGame() {
  const save = store.get(`save:${settings.game}`, null);
  if (!save) return newGame();
  if (GAMES[settings.game].mode) return startTable(settings.game, { resume: save });
  start(settings.game, GAMES[settings.game].Game.fromJSON(save.game), save.elapsed ?? 0, { deal: false });
  isDaily = false;
}

// ---- how to play ------------------------------------------------------------

function openRules(id) {
  $('rules-title').textContent = GAMES[id].title;
  $('rules-list').replaceChildren(...GAMES[id].rules.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
  $('rules').hidden = false;
  sfx.pick();
}

function closeRules() {
  $('rules').hidden = true;
}

/** The first time someone plays a game, show them how. */
function showRulesOnce(id) {
  const seen = store.get('rules-seen', []);
  if (seen.includes(id)) return;
  store.set('rules-seen', [...seen, id]);
  // Only if they're still at that game by then.
  setTimeout(() => { if (gameId === id && $('menu-screen').hidden && $('win').hidden) openRules(id); }, 700);
}

function start(id, nextGame, startElapsed, { deal = true } = {}) {
  if (game && !won) saveGame();
  gameId = id;
  stats = statsFor(id);
  game = nextGame;
  elapsed = startElapsed;
  timerStarted = startElapsed > 0;
  won = false;
  combo = 0;
  autoCompleting = false;
  lastShownScore = game.score;
  board.setGame(game);
  showGame();
  $('game-screen').dataset.game = id;
  showRulesOnce(id);
  if (deal) dealAnimation();
  else board.render({ instant: true });
  updateHud(false);
  saveGame();
  armIdle();
  armScare();
}

function dealAnimation() {
  // Everything starts face down in one heap (the stock, or just above the
  // table when there isn't one), then flies out in the game's deal order.
  const from = game.hasStock()
    ? board.slotPos('stock')
    : { x: board.left + ((board.spec.cols - 1) * (board.cardW + board.gap)) / 2, y: -board.cardH * 1.5 };
  board.gather(from);

  const order = game.dealOrder();
  const step = Math.max(14, Math.min(45, 1300 / order.length));
  const delays = new Map(order.map((c, k) => [c.id, 120 + k * step]));
  busyUntil = performance.now() + 120 + order.length * step + 300;
  sfx.shuffle();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    board.render({ delays });
    for (let k = 0; k < order.length; k += 3) setTimeout(() => sfx.draw(), 120 + k * step);
  }));
}

// ---- moves ------------------------------------------------------------------

function busy() {
  return autoCompleting || won || performance.now() < busyUntil;
}

function draw() {
  if (busy() || !game.hasStock()) return;
  if (!game.canDraw()) {
    sfx.nope();
    if (game.pile('stock').length) whisper('fill every column before you deal');
    return;
  }
  const res = game.draw();
  combo = 0;
  const delays = new Map(res.cards.map((c, i) => [c.id, i * 70]));
  res.completed?.cards.forEach((c, i) => delays.set(c.id, 500 + i * 30));
  board.render({ delays });
  if (res.recycled) {
    sfx.shuffle();
    if (res.points < 0) popup(String(res.points), ...xy(board.centerOf('stock')), 'popup--pumpkin');
  } else {
    res.cards.forEach((_, i) => setTimeout(() => sfx.draw(), i * 70));
  }
  if (res.completed) runLaidToRest(res.completed, 600);
  buzz(8);
  afterMove();
}

function move(fromId, index, toId) {
  if (busy()) return false;
  const res = game.move(fromId, index, toId);
  if (!res) return false;
  const delays = new Map(res.cards.map((c, i) => [c.id, i * 35]));
  // Spider: the finished run lands, then peels off to its foundation.
  res.completed?.cards.forEach((c, i) => delays.set(c.id, 380 + i * 30));
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

  if (res.home) {
    // TriPeaks keeps its own streak; elsewhere quick foundation moves chain up.
    if (res.streak) {
      combo = res.streak;
      trophies.check('streak', { streak: res.streak });
    }
    else {
      combo += 1;
      clearTimeout(comboTimer);
      comboTimer = setTimeout(() => { combo = 0; }, 3500);
    }
    const at = board.centerOf(res.homeId ?? toId);
    const gained = res.points - res.flipped.length * (res.flipPoints ?? 0);
    sfx.foundation(combo);
    buzz(14);
    setTimeout(() => {
      burst(at.x, at.y, { palette: 'ecto', count: 14 + Math.min(combo, 12) * 4, speed: 5 + Math.min(combo, 8) });
      popup(combo > 1 ? `+${gained}  x${combo}` : `+${gained}`, at.x, at.y - board.cardH * 0.6, 'popup--ecto');
    }, 200);
    if (combo >= 3) bg.pulse(0.6);
    if (toId.startsWith('f') && game.pile(toId).length === 13) {
      setTimeout(() => suitFanfare(at, 'SUIT LAID TO REST'), 320);
    }
    if (res.peak && !game.isWon()) {
      setTimeout(() => {
        sfx.suitDone();
        shake(0.45);
        bg.pulse(2);
        buzz([30, 40, 30]);
        popup('PEAK CLEARED', window.innerWidth / 2, window.innerHeight * 0.42, 'popup--huge');
      }, 300);
    }
  } else {
    sfx.place();
    buzz(8);
  }

  if (res.completed) runLaidToRest(res.completed, 420);

  res.flipped.forEach((card, i) => {
    setTimeout(() => {
      sfx.flip();
      const at = board.centerOf(card.id);
      burst(at.x, at.y, { palette: 'ember', count: 10, speed: 4 });
      if (res.flipPoints) popup(`+${res.flipPoints}`, at.x, at.y - board.cardH * 0.4, 'popup--pumpkin');
    }, 300 + i * 60);
  });
}

function suitFanfare(at, text) {
  sfx.suitDone();
  shake(0.55);
  bg.pulse(2.5);
  buzz([40, 50, 40]);
  burst(at.x, at.y, { palette: 'blood', count: 60, speed: 9 });
  popup(text, window.innerWidth / 2, window.innerHeight * 0.42, 'popup--huge');
}

/** Spider: a finished K→A run has left the table. */
function runLaidToRest(completed, delay) {
  trophies.check('spider-run');
  setTimeout(() => {
    const at = board.centerOf(completed.toId);
    suitFanfare(at, 'SUIT LAID TO REST');
    popup('+100', at.x, at.y - board.cardH * 0.6, 'popup--ecto');
    completed.flipped.forEach((card) => board.flash(card.id, 'is-landed', 320));
    updateHud(true);
  }, delay + 13 * 30);
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
  store.set(`stats:${gameId}`, stats);
  const totalWins = Object.keys(GAMES).filter((id) => GAMES[id].Game).reduce((sum, id) => sum + statsFor(id).won, 0);
  trophies.check('solitaire-win', { game: gameId, elapsed, daily: isDaily, suits: game.suits, totalWins });
  store.set(`save:${gameId}`, null);
  clearTimeout(scareTimer);
  clearTimeout(idleTimer);

  sfx.win();
  shake(0.9);
  bg.pulse(3);
  buzz([60, 40, 60, 40, 200]);
  burst(window.innerWidth / 2, window.innerHeight / 2, { palette: 'ember', count: 120, speed: 12 });

  const result = {
    won: true,
    eyebrow: 'every soul laid to rest',
    title: 'You Escaped',
    stats: [['Souls', game.score], ['Moves', game.moves], ['Time', formatTime(elapsed)], ['Wins', stats.won]],
  };

  setTimeout(() => {
    const rect = $('board').getBoundingClientRect();
    const stacks = board.spec.cascade.map((id) => {
      const pos = board.slotPos(id);
      return { x: rect.left + pos.x, y: rect.top + pos.y, cards: game.pile(id) };
    });
    $('board').style.opacity = '0.12';
    startCascade(stacks, board.cardW, board.cardH, () => showResult(result, { quiet: true }));
  }, 900);
}

/** The end-of-game dialog, for any game. */
function showResult({ won, eyebrow, title, stats: rows, lobby = false }, { quiet = false } = {}) {
  lastResultLobby = lobby;
  $('win-eyebrow').textContent = eyebrow;
  $('win-title').textContent = title;
  $('win-stats').replaceChildren(...rows.map(([label, value]) => {
    const cell = document.createElement('div');
    cell.innerHTML = '<dt></dt><dd></dd>';
    cell.querySelector('dt').textContent = label;
    cell.querySelector('dd').textContent = value;
    return cell;
  }));
  $('win-again').textContent = lobby ? 'Back to lobby' : GAMES[gameId].mode === 'poker' ? 'Sit down again' : 'Deal again';
  $('win').dataset.won = String(won);
  if (!quiet) {
    if (won) {
      sfx.win();
      shake(0.8);
      bg.pulse(3);
      buzz([60, 40, 60, 40, 200]);
      burst(window.innerWidth / 2, window.innerHeight / 2, { palette: 'ember', count: 120, speed: 12 });
      const s = statsFor(gameId);
      s.won += 1;
      store.set(`stats:${gameId}`, s);
    } else {
      sfx.sting();
      shake(0.6);
      buzz([80, 40, 200]);
      burst(window.innerWidth / 2, window.innerHeight / 2, { palette: 'blood', count: 100, speed: 10 });
    }
  }
  setTimeout(() => { $('win').hidden = false; }, quiet ? 0 : 900);
}

function setTableHud(panels) {
  panels.forEach(([label, value], i) => {
    $(`table-label-${i}`).textContent = label;
    const el = $(`table-value-${i}`);
    if (el.textContent !== String(value)) el.textContent = value;
  });
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
  store.set(`save:${gameId}`, { game: game.toJSON(), elapsed });
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
    if (won || !$('menu-screen').hidden) return;
    whisper(pick(WHISPERS.idle));
    sfx.whisper();
    armIdle();
  }, 35000);
}

function armScare() {
  clearTimeout(scareTimer);
  scareTimer = setTimeout(() => {
    if (settings.scares && !won && !document.hidden && $('menu-screen').hidden) scare();
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
  const key = e.key.toLowerCase();
  if (!$('rules').hidden || !$('trophy-room').hidden) {
    if (key === 'escape' || key === 'enter') {
      e.preventDefault();
      closeRules();
      $('trophy-room').hidden = true;
    }
    return;
  }
  if (key === '?' && $('menu-screen').hidden) {
    openRules(gameId);
    return;
  }
  if (table && !$('table-screen').hidden) {
    if (key === 'escape') showMenu();
    else if (table.key(key)) e.preventDefault();
    return;
  }
  if (!game || $('game-screen').hidden) return;
  if (key === 'z') { e.preventDefault(); undo(); }
  else if (key === 'h') hint();
  else if (key === ' ' || key === 'd') { e.preventDefault(); draw(); }
  else if (key === 'n') newGame();
  else if (key === 'escape') showMenu();
}

// Dev-only handle for poking at the game from the console.
if (import.meta.env.DEV) {
  window.__solitaire = { get game() { return game; }, board: () => board, start, afterMove, createGame, get table() { return table; } };
}

// Installable and playable offline (production builds only: the dev server changes too often).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot().then(() => {
  // Opened from an invite link: straight to the lobby, then tidy the address bar.
  const code = new URLSearchParams(window.location.search).get('join');
  if (!code) return;
  window.history.replaceState(null, '', window.location.pathname);
  showLobby(code);
});
