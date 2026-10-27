import { Klondike } from './klondike.js';
import { FreeCell } from './freecell.js';
import { Spider } from './spider.js';
import { TriPeaks } from './tripeaks.js';
import { Pyramid } from './pyramid.js';
import { Golf } from './golf.js';

// Every game on the menu. `variants` are the options each game shows on the
// menu (draw count, suits, rivals...). Solitaires have a `Game` engine class;
// table games (`mode`) are run by a controller in src/modes/.

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const GAMES = {
  klondike: {
    Game: Klondike,
    title: 'Klondike',
    family: 'Solitaire',
    blurb: 'Seven graves. Build them down, red on black.',
    rules: [
      'Build four foundations up by suit, Ace to King.',
      'Build the seven columns down in alternating colours.',
      'Only a King can fill an empty column.',
      'Tap the deck to draw. When it runs out, tap the empty slot to go through it again.',
    ],
    variants: [{ key: 'drawCount', values: [1, 3], label: (v) => `Draw ${v}` }],
    whispers: ['the dead are dealt', 'seven graves, fifty-two souls', 'lay them to rest'],
  },
  freecell: {
    Game: FreeCell,
    title: 'FreeCell',
    family: 'Solitaire',
    blurb: 'Every card face up. Four cells to hide them in.',
    rules: [
      'Every card is face up. Build foundations up by suit, Ace to King.',
      'Build columns down in alternating colours. Any card can fill an empty column.',
      'The four cells top-left each hold one card.',
      'How many cards you can move at once depends on free cells and empty columns.',
    ],
    variants: [],
    whispers: ['nothing is hidden here', 'four cells, and they are all hungry', 'every soul is watching'],
  },
  spider: {
    Game: Spider,
    title: 'Spider',
    family: 'Solitaire',
    blurb: 'Two decks. Spin each suit from King down to Ace.',
    rules: [
      'Build down in any suit, but only runs of one suit move together.',
      'A full King-to-Ace run of one suit leaves the table.',
      'Tap the deck to deal a card onto every column (not while one is empty).',
      'Clear all eight runs to win.',
    ],
    variants: [{ key: 'suits', values: [1, 2, 4], label: (v) => `${v} suit${v > 1 ? 's' : ''}` }],
    whispers: ['the web is spun', 'eight legs, ten columns', 'something is crawling in the stock'],
  },
  tripeaks: {
    Game: TriPeaks,
    title: 'TriPeaks',
    family: 'Solitaire',
    blurb: 'Three peaks. One up or one down, as fast as you dare.',
    rules: [
      'Play a free card onto the pile if it is one higher or lower (Kings and Aces wrap).',
      'A card is free once nothing overlaps it.',
      'Cards in a row without drawing build a streak that multiplies points.',
      'Clear all three peaks to win.',
    ],
    variants: [],
    whispers: ['climb the three peaks', 'one higher, one lower, never stop', 'the mountain is hollow'],
  },
  pyramid: {
    Game: Pyramid,
    title: 'Pyramid',
    family: 'Solitaire',
    blurb: 'Pair the dead to thirteen. Kings go alone.',
    rules: [
      'Remove two free cards that add up to 13: drag one onto the other.',
      'Jacks are 11, Queens 12. A King is 13 on its own: tap it.',
      'A card is free once both cards overlapping it are gone.',
      'The deck can be gone through three times. Clear the pyramid to win.',
    ],
    variants: [],
    whispers: ['the tomb is sealed', 'thirteen opens the way', 'something sleeps at the top'],
  },
  golf: {
    Game: Golf,
    title: 'Golf',
    family: 'Solitaire',
    blurb: 'Seven graves to dig. One up or one down, never past a King.',
    rules: [
      'Play the bottom card of any column onto the pile if it is one higher or lower.',
      'No wrapping, and nothing can go on a King.',
      'Tap the deck when you are stuck, but it only goes through once.',
      'Clear all seven columns to win. Streaks score more.',
    ],
    variants: [],
    whispers: ['fore...', 'dig, and keep digging', 'the groundskeeper is watching'],
  },
  holdem: {
    mode: 'poker',
    title: "Hold'em",
    family: 'Poker',
    blurb: "No-limit Texas Hold'em. Last soul with chips walks out.",
    rules: [
      'You get two cards; five are shared in the middle. Best five-card hand wins.',
      'Bet, call, raise or fold each round. The blinds rise every 8 hands.',
      'Last player with chips wins the table.',
      'Keys: F fold, C check or call, R raise, Esc menu.',
    ],
    variants: [
      { key: 'opponents', values: [3, 4, 5, 1, 2], label: (v) => `${v} rival${v > 1 ? 's' : ''}` },
      { key: 'difficulty', values: ['normal', 'hard', 'easy'], label: cap },
    ],
  },
  videopoker: {
    mode: 'videopoker',
    title: 'Video Poker',
    family: 'Poker',
    blurb: 'Jacks or Better on a machine that hums your name.',
    rules: [
      'Bet 1 to 5 souls and get five cards.',
      'Tap the cards you want to keep, then draw once.',
      'A pair of Jacks or better pays. Bet 5 for the big Royal Flush payout.',
      'Keys: 1 to 5 hold, H hint, Enter deal or draw.',
    ],
    variants: [],
  },
  blackjack: {
    mode: 'blackjack',
    title: 'Blackjack',
    family: 'Blackjack',
    blurb: 'Beat the dealer to 21. Your souls carry over.',
    rules: [
      'Get closer to 21 than the dealer without going over.',
      'Face cards count 10, Aces 1 or 11. Blackjack pays 3 to 2.',
      'Double: one more card for twice the bet. Split: play a pair as two hands.',
      'Keys: H hit, S stand, D double, P split, Enter deal.',
    ],
    variants: [],
  },
};

export const GAME_IDS = Object.keys(GAMES);

/** The menu's value for each of a game's options (first value by default). */
export function optionsFor(id, settings) {
  return Object.fromEntries(GAMES[id].variants.map((v) => [v.key, v.values.includes(settings[v.key]) ? settings[v.key] : v.values[0]]));
}

export function createGame(id, seed, settings = {}) {
  return new GAMES[id].Game({ seed, ...optionsFor(id, settings) });
}
