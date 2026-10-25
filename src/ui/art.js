import { SUIT_SYMBOL, rankLabel } from '../engine/cards.js';

// Card art is driven by cards/manifest.json so custom decks are a drop-in:
// point each rank at an image, set the crop to the card inside the image,
// and optionally give a "back" image. Without a back we draw the pixel eye.

const RANK_KEYS = { A: '14', T: '10', J: '11', Q: '12', K: '13' };
const BASE = import.meta.env?.BASE_URL ?? './';

let manifest = null;
let backURL = null;
const imageCache = new Map();

export async function loadArt() {
  const res = await fetch(`${BASE}cards/manifest.json`);
  manifest = await res.json();
  backURL = manifest.back ? `${BASE}cards/${manifest.back}` : drawPixelBack();
  // Warm the browser cache so flips never show a blank face.
  await Promise.all(Object.values(manifest.suits).flatMap((s) => Object.values(s.cards)).map((file) => loadImage(`${BASE}cards/${file}`)));
  await loadImage(backURL);
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
  const back = el.querySelector('.card-back');
  const { size, crop: c } = manifest.sprite;
  face.style.backgroundImage = `url("${spriteFile(card)}")`;
  face.style.backgroundSize = `calc(var(--px) * ${size}) calc(var(--px) * ${size})`;
  face.style.backgroundPosition = `calc(var(--px) * ${-c.x}) calc(var(--px) * ${-c.y})`;
  back.style.backgroundImage = `url("${backURL}")`;
  back.style.backgroundSize = '100% 100%';
  if (manifest.showIndex !== false) {
    face.innerHTML = `<span class="card-index" style="--suit:${suitColor(card)}">${rankLabel(card)}<small>${SUIT_SYMBOL[card.suit]}</small></span>`;
  }
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

// 9x13 card back: a single bloodshot eye staring out of the deck.
const BACK = [
  'AAAAAAAAA',
  'ACBCBCBCA',
  'ABBBBBBBA',
  'ABBBBBBBA',
  'ABBDDDBBA',
  'ABDEEEDBA',
  'ABDEFEDBA',
  'ABDEEEDBA',
  'ABBDDDBBA',
  'ABBBBBBBA',
  'ABBBBBBBA',
  'ACBCBCBCA',
  'AAAAAAAAA',
];
const BACK_COLORS = { A: '#6b6767', B: '#2a1530', C: '#f15900', D: '#a80000', E: '#fff7f7', F: '#000000' };

function drawPixelBack() {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 13;
  const ctx = canvas.getContext('2d');
  BACK.forEach((row, y) => [...row].forEach((ch, x) => {
    ctx.fillStyle = BACK_COLORS[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return canvas.toDataURL('image/png');
}
