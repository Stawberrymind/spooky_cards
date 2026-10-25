import { TABLEAU_IDS, FOUNDATION_IDS } from '../engine/klondike.js';
import { paintCard, crop } from './art.js';

// Renders a Klondike game as 52 absolutely positioned card elements and turns
// pointer input into intents (draw / move / auto-move). Cards keep their DOM
// node for the whole game so CSS transitions can carry them between piles.

const FOUNDATION_HINT = ['♥', '♦', '♣', '♠'];

export class Board {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers; // { draw(), move(fromId, index, toId) -> bool, autoMove(fromId, index) -> bool, grab(), drop() }
    this.cards = new Map();
    this.slots = {};
    this.positions = new Map();
    this.pileOf = new Map();
    this.drag = null;
    this.hoverEl = null;

    for (const id of ['stock', 'waste', ...FOUNDATION_IDS, ...TABLEAU_IDS]) {
      const slot = document.createElement('div');
      slot.className = `slot slot--${id === 'stock' ? 'stock' : id[0] === 'f' ? 'foundation' : id}`;
      slot.dataset.pile = id;
      if (id.startsWith('f')) slot.textContent = FOUNDATION_HINT[Number(id[1])];
      if (id === 'stock') slot.textContent = '↻';
      this.root.append(slot);
      this.slots[id] = slot;
    }
    this.slots.stock.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handlers.draw();
    });

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.root.addEventListener('pointerleave', () => this.clearHover());
  }

  setGame(game) {
    this.game = game;
    for (const pile of Object.values(game.piles)) {
      for (const card of pile) if (!this.cards.has(card.id)) this.cards.set(card.id, this.createCard(card));
    }
  }

  createCard(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = card.id;
    el.innerHTML = '<div class="card-tilt"><div class="card-sway"><div class="card-flip"><div class="card-face"></div><div class="card-back"></div></div></div></div>';
    el.style.setProperty('--sway-delay', `${(-Math.random() * 3.4).toFixed(2)}s`);
    paintCard(el, card);
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e, card.id));
    el.addEventListener('pointermove', (e) => this.onHover(e, el));
    this.root.append(el);
    return el;
  }

  // ---- layout --------------------------------------------------------------

  layout() {
    const rect = this.root.getBoundingClientRect();
    const { width: cw, height: ch } = crop();
    // Phones get tighter gutters so the cards can be bigger.
    const narrow = rect.width < 600;
    const pad = narrow ? 6 : 16;
    const gapArt = narrow ? 1 : 2;
    // 7 columns of card art plus 6 gaps.
    let px = (Math.min(rect.width, 1100) - pad * 2) / (7 * cw + 6 * gapArt);
    // Keep at least ~3.2 card heights visible vertically for the opening deal.
    px = Math.min(px, (rect.height - 24) / (ch * 3.4));
    px = px >= 6 ? Math.floor(px) : Math.max(3, Math.floor(px * 2) / 2);
    this.px = px;
    this.cardW = cw * px;
    this.cardH = ch * px;
    this.gap = gapArt * px;
    const boardW = 7 * this.cardW + 6 * this.gap;
    this.left = Math.round((rect.width - boardW) / 2);
    this.top = Math.round(px * 1.5);
    this.height = rect.height;

    this.root.style.setProperty('--px', `${px}px`);
    this.root.style.setProperty('--card-w', `${this.cardW}px`);
    this.root.style.setProperty('--card-h', `${this.cardH}px`);

    const place = (id, x, y) => {
      const s = this.slots[id];
      s.style.width = `${this.cardW}px`;
      s.style.height = `${this.cardH}px`;
      s.style.transform = `translate(${x}px, ${y}px)`;
    };
    place('stock', this.colX(0), this.top);
    place('waste', this.colX(1), this.top);
    FOUNDATION_IDS.forEach((id, i) => place(id, this.colX(3 + i), this.top));
    TABLEAU_IDS.forEach((id, i) => place(id, this.colX(i), this.tableauY()));
  }

  colX(i) {
    return this.left + i * (this.cardW + this.gap);
  }

  tableauY() {
    return this.top + this.cardH + this.gap * 2;
  }

  /** Screen-space positions for every card in a pile. */
  pilePositions(id) {
    const pile = this.game.pile(id);
    if (id === 'stock') {
      // A few pixels of thickness so the deck looks like a deck.
      return pile.map((_, i) => {
        const step = Math.min(3, Math.floor(i / 8)) * this.px * 0.3;
        return { x: this.colX(0) - step, y: this.top - step };
      });
    }
    if (id === 'waste') {
      const fan = this.game.drawCount === 3 ? 3 : 1;
      const firstFanned = Math.max(0, pile.length - fan);
      return pile.map((_, i) => ({ x: this.colX(1) + Math.max(0, i - firstFanned) * this.cardW * 0.28, y: this.top }));
    }
    if (id.startsWith('f')) {
      const col = 3 + Number(id[1]);
      return pile.map(() => ({ x: this.colX(col), y: this.top }));
    }
    // Tableau: fan down, squeezing long columns so they stay on screen.
    const col = Number(id[1]);
    const y0 = this.tableauY();
    const room = Math.max(this.cardH, this.height - y0 - this.cardH - this.px * 6);
    let down = this.cardH * 0.16;
    let up = this.cardH * 0.27;
    const faceDown = pile.filter((c) => !c.faceUp).length;
    const faceUp = Math.max(0, pile.length - faceDown - 1);
    const needed = faceDown * down + faceUp * up;
    if (needed > room) {
      const k = room / needed;
      down *= k;
      up *= k;
    }
    let y = y0;
    return pile.map((c) => {
      const pos = { x: this.colX(col), y };
      y += c.faceUp ? up : down;
      return pos;
    });
  }

  // ---- rendering -----------------------------------------------------------

  /**
   * Sync every card to the game state.
   * opts.delays: Map(cardId → ms) to stagger arrivals (deals, multi-card moves).
   * opts.instant: jump without transitions (resize, first paint).
   */
  render(opts = {}) {
    const { delays = new Map(), instant = false } = opts;
    const zBase = { stock: 0, waste: 100, f0: 200, f1: 200, f2: 200, f3: 200 };
    for (const id of Object.keys(this.game.piles)) {
      const positions = this.pilePositions(id);
      this.game.pile(id).forEach((card, i) => {
        const el = this.cards.get(card.id);
        if (!el || this.drag?.ids.includes(card.id)) return;
        const pos = positions[i];
        const prevPile = this.pileOf.get(card.id);
        const moved = prevPile !== undefined && prevPile !== id;
        const delay = delays.get(card.id) ?? 0;

        el.classList.toggle('is-instant', instant);
        el.style.transitionDelay = `${delay}ms`;
        el.querySelector('.card-flip').style.transitionDelay = `${delay + (moved ? 120 : 0)}ms`;
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        el.classList.toggle('face-up', card.faceUp);

        const z = (zBase[id] ?? 300 + TABLEAU_IDS.indexOf(id) * 40) + i;
        if (moved && !instant) {
          // Fly above everything, then settle into the pile's stacking order.
          el.style.zIndex = 2000 + i;
          el.classList.add('is-flying');
          clearTimeout(el._settle);
          el._settle = setTimeout(() => {
            el.style.zIndex = z;
            el.classList.remove('is-flying');
          }, 380 + delay);
        } else if (!el.classList.contains('is-flying')) {
          el.style.zIndex = z;
        }
        this.positions.set(card.id, pos);
        this.pileOf.set(card.id, id);
      });
    }
    if (instant) requestAnimationFrame(() => this.cards.forEach((el) => el.classList.remove('is-instant')));
  }

  /** Centre of a card or pile in viewport coordinates (for particles and popups). */
  centerOf(cardIdOrPile) {
    const el = this.cards.get(cardIdOrPile) ?? this.slots[cardIdOrPile];
    const pos = this.positions.get(cardIdOrPile);
    const rect = this.root.getBoundingClientRect();
    if (pos) return { x: rect.left + pos.x + this.cardW / 2, y: rect.top + pos.y + this.cardH / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  flash(cardId, className, ms = 900) {
    const el = this.cards.get(cardId);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), ms);
  }

  // ---- input ---------------------------------------------------------------

  onPointerDown(e, cardId) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const loc = this.game.locate(cardId);
    if (!loc) return;
    if (loc.pileId === 'stock') {
      this.handlers.draw();
      return;
    }
    const run = this.game.grabbable(loc.pileId, loc.index);
    if (!run) {
      this.flash(cardId, 'is-nope', 320);
      return;
    }
    this.clearHover();
    const ids = run.map((c) => c.id);
    const start = this.positions.get(ids[0]);
    this.drag = {
      fromId: loc.pileId,
      index: loc.index,
      ids,
      startX: e.clientX,
      startY: e.clientY,
      offsets: ids.map((id) => {
        const p = this.positions.get(id);
        return { x: p.x - start.x, y: p.y - start.y };
      }),
      origin: start,
      x: start.x,
      y: start.y,
      targetX: start.x,
      targetY: start.y,
      lagged: ids.map(() => ({ ...start })),
      vx: 0,
      active: false,
      target: null,
    };
  }

  onPointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 6) return;
      d.active = true;
      d.ids.forEach((id, i) => {
        const el = this.cards.get(id);
        el.classList.add('is-dragging');
        el.style.zIndex = 5000 + i;
      });
      this.handlers.grab?.(d.ids.length);
      this.tick();
    }
    d.targetX = d.origin.x + dx;
    d.targetY = d.origin.y + dy;
    const target = this.dropTarget(d);
    if (target !== d.target) {
      if (d.target) this.slots[d.target].classList.remove('is-target');
      if (target) this.slots[target].classList.add('is-target');
      d.target = target;
    }
  }

  // Cards chase the pointer with a little lag down the run and lean into the
  // direction of travel — the Balatro wobble.
  tick() {
    const d = this.drag;
    if (!d?.active) return;
    const prevX = d.x;
    d.x += (d.targetX - d.x) * 0.45;
    d.y += (d.targetY - d.y) * 0.45;
    d.vx = d.vx * 0.7 + (d.x - prevX) * 0.3;
    d.ids.forEach((id, i) => {
      const el = this.cards.get(id);
      const lag = d.lagged[i];
      const follow = i === 0 ? 1 : 0.5;
      lag.x += (d.x + d.offsets[i].x - lag.x) * follow;
      lag.y += (d.y + d.offsets[i].y - lag.y) * follow;
      el.style.transform = `translate(${lag.x}px, ${lag.y}px)`;
      const tilt = el.querySelector('.card-tilt');
      tilt.style.setProperty('--rz', `${Math.max(-16, Math.min(16, d.vx * 1.1))}deg`);
    });
    requestAnimationFrame(() => this.tick());
  }

  dropTarget(d) {
    const cx = d.targetX + this.cardW / 2;
    const cy = d.targetY + this.cardH / 2;
    let best = null;
    let bestDist = Infinity;
    for (const id of [...FOUNDATION_IDS, ...TABLEAU_IDS]) {
      if (id === d.fromId) continue;
      if (!this.game.canMove(d.fromId, d.index, id)) continue;
      const pile = this.game.pile(id);
      const pos = pile.length ? this.positions.get(pile[pile.length - 1].id) : this.slotPos(id);
      const dist = Math.hypot(pos.x + this.cardW / 2 - cx, pos.y + this.cardH / 2 - cy);
      if (dist < bestDist && dist < this.cardH * 1.1) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
  }

  slotPos(id) {
    if (id.startsWith('f')) return { x: this.colX(3 + Number(id[1])), y: this.top };
    return { x: this.colX(Number(id[1])), y: this.tableauY() };
  }

  onPointerUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.target) this.slots[d.target].classList.remove('is-target');
    d.ids.forEach((id) => {
      const el = this.cards.get(id);
      el.classList.remove('is-dragging');
      el.querySelector('.card-tilt').style.setProperty('--rz', '0deg');
    });

    if (!d.active) {
      // A tap: send the card somewhere sensible.
      if (!this.handlers.autoMove(d.fromId, d.index)) this.flash(d.ids[0], 'is-nope', 320);
      return;
    }
    const ok = d.target && this.handlers.move(d.fromId, d.index, d.target);
    if (!ok) {
      this.handlers.drop?.(false);
      this.render();
    }
  }

  onHover(e, el) {
    if (this.drag || e.pointerType !== 'mouse' || !el.classList.contains('face-up')) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    if (this.hoverEl && this.hoverEl !== el) this.clearHover();
    this.hoverEl = el;
    const tilt = el.querySelector('.card-tilt');
    tilt.style.setProperty('--ry', `${(nx * 22).toFixed(1)}deg`);
    tilt.style.setProperty('--rx', `${(-ny * 22).toFixed(1)}deg`);
    tilt.style.setProperty('--scale', '1.05');
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => this.clearHover(), 400);
  }

  clearHover() {
    if (!this.hoverEl) return;
    const tilt = this.hoverEl.querySelector('.card-tilt');
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
    tilt.style.removeProperty('--scale');
    this.hoverEl = null;
  }

}
