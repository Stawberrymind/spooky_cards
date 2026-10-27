import { cardElement, crop } from './art.js';

// A table surface for games that aren't solitaire: cards are placed by their
// centre point, fly in from a deck spot, and can be swept away. Chips and
// labels are plain elements the game modes add themselves.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Felt {
  constructor(root) {
    this.root = root;
    this.cards = new Map();
    this.deck = { x: 0, y: 0 };
  }

  /** Size cards so that `fit` card widths fit across and `rows` card heights fit down. */
  measure({ across, down, max = 9 }) {
    const rect = this.root.getBoundingClientRect();
    const { width: cw, height: ch } = crop();
    let px = Math.min(rect.width / (across * cw), rect.height / (down * ch), max);
    px = px >= 6 ? Math.floor(px) : Math.max(2.5, Math.floor(px * 2) / 2);
    Object.assign(this, { w: rect.width, h: rect.height, px, cardW: cw * px, cardH: ch * px });
    this.root.style.setProperty('--px', `${px}px`);
    this.root.style.setProperty('--card-w', `${this.cardW}px`);
    this.root.style.setProperty('--card-h', `${this.cardH}px`);
    return this;
  }

  /** Move a card (creating it at the deck spot if new) so its centre lands on x, y. */
  put(card, x, y, { faceUp = true, delay = 0, scale = 1, rot = 0, z = null, instant = false, dim = false } = {}) {
    let el = this.cards.get(card.id);
    if (!el) {
      el = cardElement(card);
      el.classList.add('is-instant');
      el.style.transform = this.transform(this.deck.x, this.deck.y, scale, 0);
      this.root.append(el);
      this.cards.set(card.id, el);
      void el.offsetWidth;
      el.classList.remove('is-instant');
    }
    el.classList.toggle('is-instant', instant);
    el.style.transitionDelay = `${delay}ms`;
    el.querySelector('.card-flip').style.transitionDelay = `${delay + 140}ms`;
    el.style.transform = this.transform(x, y, scale, rot);
    el.classList.toggle('face-up', faceUp);
    el.classList.toggle('is-dim', dim);
    if (z !== null) el.style.zIndex = z;
    if (instant) requestAnimationFrame(() => el.classList.remove('is-instant'));
    return el;
  }

  transform(x, y, scale, rot) {
    return `translate(${x - this.cardW / 2}px, ${y - this.cardH / 2}px) rotate(${rot}deg) scale(${scale})`;
  }

  flash(cardId, className, ms = 900) {
    const el = this.cards.get(cardId);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), ms);
  }

  /** Slide every card to (x, y), fade them out, and forget them. */
  async sweep(x = this.deck.x, y = this.deck.y) {
    if (!this.cards.size) return;
    const els = [...this.cards.values()];
    this.cards.clear();
    els.forEach((el, i) => {
      el.style.transitionDelay = `${i * 15}ms`;
      el.classList.remove('face-up');
      el.style.transform = this.transform(x, y, 0.8, 0);
      el.classList.add('is-gone');
    });
    await sleep(420 + els.length * 15);
    els.forEach((el) => el.remove());
  }

  clear() {
    for (const el of this.cards.values()) el.remove();
    this.cards.clear();
  }

  /** Viewport coordinates of a point on the felt (for particles and popups). */
  screen(x, y) {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y };
  }
}

/** Fly a little stack of chips from one point to another on the felt. */
export function flyChips(root, from, to, { count = 3, delay = 0 } = {}) {
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('div');
    chip.className = 'chip chip--flying';
    chip.style.transform = `translate(${from.x}px, ${from.y}px)`;
    root.append(chip);
    setTimeout(() => {
      chip.style.transform = `translate(${to.x + (i - count / 2) * 3}px, ${to.y - i * 2}px)`;
    }, delay + 20 + i * 45);
    setTimeout(() => chip.remove(), delay + 520 + i * 45);
  }
}
