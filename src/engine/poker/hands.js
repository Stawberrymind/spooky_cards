// Poker hand ranking. bestHand() takes 5 to 7 cards and finds the best five.
// Scores are plain numbers: a higher score always wins, equal scores split.

export const HAND_NAMES = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush',
];

const VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
export const pokerValue = (card) => VALUE[card.rank] ?? Number(card.rank);

/** Score exactly five cards: category first, then tie-breakers, base 15. */
export function score5(cards) {
  const vs = cards.map(pokerValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);

  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1);
  // [value, count], biggest group first, then highest value.
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (vs[0] - vs[4] === 4) straightHigh = vs[0];
    else if (vs[0] === 14 && vs[1] === 5) straightHigh = 5; // the wheel, A-2-3-4-5
  }

  let category;
  let ties;
  if (straightHigh && flush) [category, ties] = [8, [straightHigh]];
  else if (groups[0][1] === 4) [category, ties] = [7, groups.map((g) => g[0])];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [category, ties] = [6, groups.map((g) => g[0])];
  else if (flush) [category, ties] = [5, vs];
  else if (straightHigh) [category, ties] = [4, [straightHigh]];
  else if (groups[0][1] === 3) [category, ties] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [category, ties] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [category, ties] = [1, groups.map((g) => g[0])];
  else [category, ties] = [0, vs];

  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (ties[i] ?? 0);
  return score;
}

export const categoryOf = (score) => Math.floor(score / 15 ** 5);

/** Best five of 5–7 cards: { score, category, name, cards }. */
export function bestHand(cards) {
  let best = null;
  const picked = [];
  const walk = (start) => {
    if (picked.length === 5) {
      const five = picked.map((i) => cards[i]);
      const score = score5(five);
      if (!best || score > best.score) best = { score, cards: five };
      return;
    }
    for (let i = start; i <= cards.length - (5 - picked.length); i++) {
      picked.push(i);
      walk(i + 1);
      picked.pop();
    }
  };
  walk(0);
  return best;
}

/** Human-readable name, e.g. "Full house" or "Royal flush". */
export function handName(score) {
  const category = categoryOf(score);
  if (category === 8 && Math.floor(score / 15 ** 4) % 15 === 14) return 'Royal flush';
  return HAND_NAMES[category];
}

export function describe(cards) {
  const best = bestHand(cards);
  return { ...best, category: categoryOf(best.score), name: handName(best.score) };
}
