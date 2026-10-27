import { fullDeck } from '../cards.js';
import { bestHand } from './hands.js';

// Poker bots. Every level estimates its chance of winning by dealing out the
// rest of the hand at random many times (Monte Carlo), then plays it with a
// different temperament:
//   easy    a calling station: overrates its cards, rarely folds, rarely raises
//   normal  plays its odds: bets good hands, folds bad ones, bluffs now and then
//   hard    sizes bets, slow-plays monsters, semi-bluffs draws, bluffs heads-up

export const LEVELS = ['easy', 'normal', 'hard'];
const SAMPLES = { easy: 80, normal: 180, hard: 360 };

/** Chance that `hole` wins against `opponents` random hands, given the board so far. */
export function equity(hole, board, opponents, samples, rand) {
  const known = new Set([...hole, ...board].map((c) => c.id));
  const deck = fullDeck().filter((c) => !known.has(c.id));
  const need = opponents * 2 + (5 - board.length);
  let total = 0;
  for (let n = 0; n < samples; n++) {
    // Partial Fisher-Yates: the last `need` cards become this deal.
    for (let k = 0; k < need; k++) {
      const i = deck.length - 1 - k;
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const dealt = deck.slice(deck.length - need);
    const fullBoard = [...board, ...dealt.slice(opponents * 2)];
    const mine = bestHand([...hole, ...fullBoard]).score;
    let best = 0;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = bestHand([dealt[o * 2], dealt[o * 2 + 1], ...fullBoard]).score;
      if (theirs > best) best = theirs;
      if (theirs === mine) ties += 1;
    }
    if (mine > best) total += 1;
    else if (mine === best) total += 1 / (ties + 1);
  }
  return total / samples;
}

/** Pick an action for seat i: { type, to }. */
export function decide(game, i, level = 'normal', rand = Math.random) {
  const s = game.seats[i];
  const legal = game.legal(i);
  const opponents = game.contenders().length - 1;
  const eq = equity(s.hole, game.board, opponents, SAMPLES[level] ?? SAMPLES.normal, rand);
  const { toCall, pot } = legal;
  const potOdds = toCall / (pot + toCall || 1);
  const fair = 1 / (opponents + 1); // what an average hand would win
  const river = game.street === 'river';

  const bet = (fraction) => {
    if (!legal.raise) return legal.canCheck ? { type: 'check' } : { type: 'call' };
    const size = Math.max(game.minRaise, (pot + toCall) * fraction);
    let to = Math.round((game.currentBet + size) / 5) * 5;
    to = Math.max(legal.raise.min, Math.min(legal.raise.max, to));
    // Nearly everything in anyway: just shove.
    if (to >= legal.raise.max * 0.8) to = legal.raise.max;
    return { type: 'raise', to };
  };
  const check = () => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
  const call = () => (legal.canCheck ? { type: 'check' } : { type: 'call' });

  if (level === 'easy') {
    const feel = eq + 0.12 + (rand() - 0.5) * 0.3;
    if (feel > 0.75 && rand() < 0.35) return bet(0.5);
    if (legal.canCheck) return check();
    if (feel > potOdds * 0.6 || toCall <= game.bb * 2) return call();
    return rand() < 0.25 ? call() : { type: 'fold' };
  }

  if (level === 'hard') {
    const strong = eq > Math.max(0.55, fair * 1.9);
    const decent = eq > fair * 1.25;
    if (legal.canCheck) {
      if (strong) return !river && rand() < 0.2 ? check() : bet(0.5 + rand() * 0.5);
      if (decent && rand() < 0.5) return bet(0.5);
      if ((opponents === 1 && rand() < 0.22) || (river && rand() < 0.12)) return bet(0.66);
      return check();
    }
    if (strong && eq > 0.7 && rand() < 0.7) return bet(0.9);
    const implied = river ? 0 : 0.04;
    if (eq + implied >= potOdds) return strong && rand() < 0.4 ? bet(0.75) : call();
    if (game.street === 'preflop' && toCall <= game.bb && eq > fair * 0.8) return call();
    if (opponents === 1 && rand() < 0.05) return bet(1);
    return { type: 'fold' };
  }

  // normal
  if (legal.canCheck) {
    if (eq > fair * 1.6 + 0.05 && rand() < 0.8) return bet(0.6);
    if (rand() < 0.08) return bet(0.5);
    return check();
  }
  if (eq > Math.max(0.5, fair * 2) && rand() < 0.6) return bet(0.8);
  if (eq >= potOdds) return call();
  if (rand() < 0.04) return call();
  return { type: 'fold' };
}
