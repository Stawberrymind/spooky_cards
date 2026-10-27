import { Klondike } from './klondike.js';
import { FreeCell } from './freecell.js';
import { Spider } from './spider.js';
import { TriPeaks } from './tripeaks.js';

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
    variants: [{ key: 'drawCount', values: [1, 3], label: (v) => `Draw ${v}` }],
    whispers: ['the dead are dealt', 'seven graves, fifty-two souls', 'lay them to rest'],
  },
  freecell: {
    Game: FreeCell,
    title: 'FreeCell',
    family: 'Solitaire',
    blurb: 'Every card face up. Four cells to hide them in.',
    variants: [],
    whispers: ['nothing is hidden here', 'four cells, and they are all hungry', 'every soul is watching'],
  },
  spider: {
    Game: Spider,
    title: 'Spider',
    family: 'Solitaire',
    blurb: 'Two decks. Spin each suit from King down to Ace.',
    variants: [{ key: 'suits', values: [1, 2, 4], label: (v) => `${v} suit${v > 1 ? 's' : ''}` }],
    whispers: ['the web is spun', 'eight legs, ten columns', 'something is crawling in the stock'],
  },
  tripeaks: {
    Game: TriPeaks,
    title: 'TriPeaks',
    family: 'Solitaire',
    blurb: 'Three peaks. One up or one down, as fast as you dare.',
    variants: [],
    whispers: ['climb the three peaks', 'one higher, one lower, never stop', 'the mountain is hollow'],
  },
  holdem: {
    mode: 'poker',
    title: "Hold'em",
    family: 'Poker',
    blurb: "No-limit Texas Hold'em. Last soul with chips walks out.",
    variants: [
      { key: 'opponents', values: [3, 4, 5, 1, 2], label: (v) => `${v} rival${v > 1 ? 's' : ''}` },
      { key: 'difficulty', values: ['normal', 'hard', 'easy'], label: cap },
    ],
  },
  blackjack: {
    mode: 'blackjack',
    title: 'Blackjack',
    family: 'Blackjack',
    blurb: 'Beat the dealer to 21. Your souls carry over.',
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
