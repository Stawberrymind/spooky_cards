import { SUIT_SYMBOL, rankLabel } from '../engine/cards.js';

// Card art is driven by cards/manifest.json so custom decks are a drop-in:
// point each rank at an image, set the crop to the card inside the image,
// and optionally give a "back" image. Without one, the backs are the pixel
// designs below (the eye, plus ones unlocked by trophies).

const RANK_KEYS = { A: '14', T: '10', J: '11', Q: '12', K: '13' };
const BASE = import.meta.env?.BASE_URL ?? './';

let manifest = null;
const imageCache = new Map();
const backURLs = new Map();

export async function loadArt() {
  const res = await fetch(`${BASE}cards/manifest.json`);
  manifest = await res.json();
  // Warm the browser cache so flips never show a blank face.
  await Promise.all(Object.values(manifest.suits).flatMap((s) => Object.values(s.cards)).map((file) => loadImage(`${BASE}cards/${file}`)));
  if (manifest.back) await loadImage(`${BASE}cards/${manifest.back}`);
  return manifest;
}

export function crop() {
  return manifest.sprite.crop;
}

function spriteFile(card) {
  return `${BASE}cards/${manifest.suits[card.suit].cards[RANK_KEYS[card.rank] ?? card.rank]}`;
}

export function suitColor(card) {
  return manifest.suits[card.suit].color;
}

/** Fill a .card element's faces. Sizes come from the --px CSS variable. */
export function paintCard(el, card) {
  const face = el.querySelector('.card-face');
  const { size, crop: c } = manifest.sprite;
  face.style.backgroundImage = `url("${spriteFile(card)}")`;
  face.style.backgroundSize = `calc(var(--px) * ${size}) calc(var(--px) * ${size})`;
  face.style.backgroundPosition = `calc(var(--px) * ${-c.x}) calc(var(--px) * ${-c.y})`;
  if (manifest.showIndex !== false) {
    face.innerHTML = `<span class="card-index" style="--suit:${suitColor(card)}">${rankLabel(card)}<small>${SUIT_SYMBOL[card.suit]}</small></span>`;
  }
}

/** A painted .card element (tilt > sway > flip > face/back), not yet in the page. */
export function cardElement(card) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  el.innerHTML = '<div class="card-tilt"><div class="card-sway"><div class="card-flip"><div class="card-face"></div><div class="card-back"></div></div></div></div>';
  el.style.setProperty('--sway-delay', `${(-Math.random() * 3.4).toFixed(2)}s`);
  paintCard(el, card);
  return el;
}

/** Image + crop rectangle for canvas drawing (the win cascade). */
export function cardImage(card) {
  return { image: imageCache.get(spriteFile(card)), crop: manifest.sprite.crop };
}

function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
    imageCache.set(src, img);
  });
}

// 9x13 pixel card backs. A is the frame, the other letters are per design.
export const BACKS = {
  eye: {
    name: 'The Eye',
    rows: ['AAAAAAAAA', 'ACBCBCBCA', 'ABBBBBBBA', 'ABBBBBBBA', 'ABBDDDBBA', 'ABDEEEDBA', 'ABDEFEDBA', 'ABDEEEDBA', 'ABBDDDBBA', 'ABBBBBBBA', 'ABBBBBBBA', 'ACBCBCBCA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#2a1530', C: '#f15900', D: '#a80000', E: '#fff7f7', F: '#000000' },
  },
  skull: {
    name: 'The Skull',
    rows: ['AAAAAAAAA', 'ABBBBBBBA', 'ABBEEEBBA', 'ABEEEEEBA', 'ABEFEFEBA', 'ABEFEFEBA', 'ABEEFEEBA', 'ABBEEEBBA', 'ABBEFEBBA', 'ABBEEEBBA', 'ABBBBBBBA', 'ACBCBCBCA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#14202a', C: '#7dff9a', E: '#fff7f7', F: '#000000' },
  },
  web: {
    name: 'The Web',
    rows: ['AAAAAAAAA', 'AEBBEBBEA', 'ABEBEBEBA', 'ABBEEEBBA', 'AEEEFEEEA', 'ABBEEEBBA', 'ABEBEBEBA', 'AEBBEBBEA', 'ABBBEBBBA', 'ABBBEBBBA', 'ABBBFBBBA', 'ABBBBBBBA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#0d0d12', E: '#9c8580', F: '#a80000' },
  },
  pumpkin: {
    name: 'The Lantern',
    rows: ['AAAAAAAAA', 'ABBBBBBBA', 'ABBBGBBBA', 'ABBDDDBBA', 'ABDDDDDBA', 'ADFDDDFDA', 'ADDDFDDDA', 'ADFFFFFDA', 'ABDDDDDBA', 'ABBDDDBBA', 'ABBBBBBBA', 'ABBBBBBBA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#1a0a04', D: '#f15900', F: '#ffd27a', G: '#3fd16a' },
  },
  coffin: {
    name: 'The Coffin',
    rows: ['AAAAAAAAA', 'ABBBBBBBA', 'ABBDDDBBA', 'ABDDDDDBA', 'ADDDCDDDA', 'ADDCCCDDA', 'ADDDCDDDA', 'ABDDCDDBA', 'ABDDDDDBA', 'ABBDDDBBA', 'ABBBDBBBA', 'ABBBBBBBA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#120a10', C: '#ffd27a', D: '#4a1f0c' },
  },
  bat: {
    name: 'The Bat',
    rows: ['AAAAAAAAA', 'ABBBBBBBA', 'ABBBBBBBA', 'ABBEBEBBA', 'ADBEEEBDA', 'ADDEFEDDA', 'ADDEEEDDA', 'ADBDEDBDA', 'ABBBDBBBA', 'ABBBBBBBA', 'ABBBBBBBA', 'ACBCBCBCA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#2a0a12', C: '#a80000', D: '#0b0306', E: '#3a1a22', F: '#dc2626' },
  },
  moth: {
    name: 'The Moth',
    rows: ['AAAAAAAAA', 'ABBBBBBBA', 'ABBEBEBBA', 'ABDBEBDBA', 'ADDDEDDDA', 'ADCDEDCDA', 'ADDDEDDDA', 'ABDDEDDBA', 'ABBDEDBBA', 'ABBBEBBBA', 'ABBBBBBBA', 'ABBBBBBBA', 'AAAAAAAAA'],
    colors: { A: '#6b6767', B: '#1a1208', C: '#f15900', D: '#a39308', E: '#d8c8a0' },
  },
};

/** Data URL for a back design (or the custom image from the manifest). */
export function backImage(id) {
  if (id === 'custom' && manifest?.back) return `${BASE}cards/${manifest.back}`;
  const design = BACKS[id] ?? BACKS.eye;
  if (!backURLs.has(id)) {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 13;
    const ctx = canvas.getContext('2d');
    design.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      ctx.fillStyle = design.colors[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    backURLs.set(id, canvas.toDataURL('image/png'));
  }
  return backURLs.get(id);
}

/** Every card back on screen follows the --card-back variable. */
export function setBack(id) {
  const chosen = manifest?.back && id === 'custom' ? 'custom' : BACKS[id] ? id : 'eye';
  document.documentElement.style.setProperty('--card-back', `url("${backImage(chosen)}")`);
}

export function hasCustomBack() {
  return Boolean(manifest?.back);
}
