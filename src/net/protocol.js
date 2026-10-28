// What the host sends each guest. Everything goes through here so nobody's
// browser ever receives another player's hole cards before the showdown.

const ACTIONS = new Set(['fold', 'check', 'call', 'raise']);
export const EMOTES = ['BOO!', 'GG', 'NICE', 'HURRY', '...'];
export const MAX_PLAYERS = 6;

export function cleanCode(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/** Names are shown with textContent, but keep them short and printable anyway. */
export function cleanName(text) {
  const name = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
  return name || 'Lost Soul';
}

/** The table everyone can see: names, stacks, blinds. No cards. */
export function publicTable(game) {
  return {
    seats: game.seats.map((s) => ({ name: s.name, chips: s.chips, committed: s.committed, out: s.out, bot: Boolean(s.bot) })),
    handNo: game.handNo,
    sb: game.sb,
    bb: game.bb,
    button: game.button,
  };
}

/** A face-down stand-in for a card the guest isn't allowed to see. */
export function hiddenCard(handNo, seat, index) {
  return { id: `hidden-${handNo}-${seat}-${index}`, rank: 'A', suit: 'spades', faceUp: false, hidden: true };
}

/**
 * The events as `seat` may see them: other players' hole cards are swapped
 * for stand-ins, and a turn for `seat` carries what they're allowed to do.
 */
export function redact(events, seat, game) {
  return events.map((e) => {
    if (e.type === 'deal') {
      const count = new Map();
      return {
        ...e,
        cards: e.cards.map(({ seat: s, card }) => {
          const index = count.get(s) ?? 0;
          count.set(s, index + 1);
          return { seat: s, card: s === seat ? card : hiddenCard(game.handNo, s, index) };
        }),
      };
    }
    if (e.type === 'turn' && e.seat === seat) return { ...e, legal: game.legal(seat) };
    return e;
  });
}

/** Only accept well-formed actions from the network. */
export function cleanAction(action) {
  if (!action || !ACTIONS.has(action.type)) return null;
  const to = Number(action.to);
  return action.type === 'raise' ? { type: 'raise', to: Number.isFinite(to) ? to : 0 } : { type: action.type };
}

export function cleanEmote(index) {
  return EMOTES[Number(index)] ?? null;
}
