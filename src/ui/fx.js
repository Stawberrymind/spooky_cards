import { cardImage } from './art.js';

// Juice: particles, screen shake, floating text, haptics, and the bouncing
// win cascade. Everything here is cosmetic and safe to skip.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('fx');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const popups = document.getElementById('popups');

let particles = [];
let trauma = 0;
let cascade = null;
let running = false;

function resize() {
  canvas.width = Math.floor(window.innerWidth / 2);
  canvas.height = Math.floor(window.innerHeight / 2);
  ctx.imageSmoothingEnabled = false;
}
resize();
window.addEventListener('resize', resize);

function loop() {
  running = true;
  if (!cascade) ctx.clearRect(0, 0, canvas.width, canvas.height);
  else stepCascade();

  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += p.gravity;
    p.vx *= 0.98;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
    ctx.globalAlpha = Math.min(1, p.life / 20);
    ctx.fillStyle = p.color;
    const s = p.size;
    ctx.fillRect(Math.round(p.x / 2 - s / 2), Math.round(p.y / 2 - s / 2), s, s);
  }
  ctx.globalAlpha = 1;

  if (trauma > 0) {
    const t = trauma * trauma;
    const x = (Math.random() * 2 - 1) * 14 * t;
    const y = (Math.random() * 2 - 1) * 14 * t;
    const r = (Math.random() * 2 - 1) * 1.6 * t;
    stage.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
    trauma = Math.max(0, trauma - 0.03);
    if (trauma === 0) stage.style.transform = '';
  }

  if (particles.length || trauma > 0 || cascade) requestAnimationFrame(loop);
  else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
  }
}

function kick() {
  if (!running) requestAnimationFrame(loop);
}

const PALETTES = {
  ember: ['#f15900', '#ff9a4d', '#a80000', '#ffd27a'],
  ecto: ['#7dff9a', '#3fd16a', '#c9ffd6', '#1d5a33'],
  blood: ['#a80000', '#dc2626', '#5a0000'],
  bone: ['#fff7f7', '#9c8580', '#6b6767'],
};

export function burst(x, y, { count = 18, palette = 'ember', speed = 6, gravity = 0.25, size = 2 } = {}) {
  if (reduceMotion) return;
  const colors = PALETTES[palette];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.4,
      gravity,
      life: 30 + Math.random() * 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: size + Math.floor(Math.random() * 2),
    });
  }
  kick();
}

export function shake(amount = 0.4) {
  if (reduceMotion) return;
  trauma = Math.min(1, trauma + amount);
  kick();
}

export function popup(text, x, y, variant = '') {
  const el = document.createElement('div');
  el.className = `popup ${variant}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  popups.append(el);
  setTimeout(() => el.remove(), 1200);
}

export function bump(el) {
  el.classList.remove('is-bumped');
  void el.offsetWidth;
  el.classList.add('is-bumped');
}

let hapticsOn = true;
export function setHaptics(on) {
  hapticsOn = on;
}
export function buzz(pattern) {
  if (hapticsOn && navigator.vibrate) navigator.vibrate(pattern);
}

// ---- win cascade: cards leap off the foundations and bounce, leaving ghosts.

export function startCascade(stacks, cardW, cardH, onDone) {
  // stacks: [{ x, y, cards: [card...] }] in viewport px, top card last.
  const queue = [];
  const maxLen = Math.max(...stacks.map((s) => s.cards.length));
  for (let i = maxLen - 1; i >= 0; i--) {
    stacks.forEach((s) => { if (s.cards[i]) queue.push({ card: s.cards[i], x: s.x, y: s.y }); });
  }
  cascade = { queue, active: [], frame: 0, w: cardW / 2, h: cardH / 2 };
  // Don't make anyone wait for all 52 bounces before the result shows.
  setTimeout(() => onDone?.(), 3500);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  kick();
}

export function stopCascade() {
  if (!cascade) return;
  cascade = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function stepCascade() {
  const c = cascade;
  // Ghostly trails: fade old frames slowly instead of clearing.
  ctx.fillStyle = 'rgba(5, 0, 5, 0.035)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Launch a new card every few frames so several bounce at once.
  c.frame += 1;
  if (c.frame % 9 === 0 && c.queue.length) {
    const next = c.queue.shift();
    const dir = Math.random() < 0.5 ? -1 : 1;
    c.active.push({ ...next, x: next.x / 2, y: next.y / 2, vx: dir * (1.5 + Math.random() * 3), vy: -Math.random() * 5 });
  }
  if (!c.queue.length && !c.active.length) {
    cascade = null;
    return;
  }
  const floor = canvas.height - c.h;
  for (const a of c.active) {
    a.vy += 0.4;
    a.x += a.vx;
    a.y += a.vy;
    if (a.y > floor) {
      a.y = floor;
      a.vy *= -0.78;
    }
    const { image, crop } = cardImage(a.card);
    if (image?.complete) {
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, Math.round(a.x), Math.round(a.y), c.w, c.h);
    }
  }
  c.active = c.active.filter((a) => a.x > -c.w && a.x < canvas.width);
}
