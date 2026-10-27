import { Klondike } from './klondike.js';
import { FreeCell } from './freecell.js';
import { Spider } from './spider.js';
import { TriPeaks } from './tripeaks.js';

// Every game on the menu. `variant` is the one option each game exposes on
// the menu (draw count, number of suits); `create` builds a game from a seed.

export const GAMES = {
  klondike: {
    Game: Klondike,
    blurb: 'Seven graves. Build them down, red on black.',
    variant: { key: 'drawCount', values: [1, 3], label: (v) => `Draw ${v}` },
    whispers: ['the dead are dealt', 'seven graves, fifty-two souls', 'lay them to rest'],
  },
  freecell: {
    Game: FreeCell,
    blurb: 'Every card face up. Four cells to hide them in.',
    whispers: ['nothing is hidden here', 'four cells, and they are all hungry', 'every soul is watching'],
  },
  spider: {
    Game: Spider,
    blurb: 'Two decks. Spin each suit from King down to Ace.',
    variant: { key: 'suits', values: [1, 2, 4], label: (v) => `${v} suit${v > 1 ? 's' : ''}` },
    whispers: ['the web is spun', 'eight legs, ten columns', 'something is crawling in the stock'],
  },
  tripeaks: {
    Game: TriPeaks,
    blurb: 'Three peaks. One up or one down, as fast as you dare.',
    whispers: ['climb the three peaks', 'one higher, one lower, never stop', 'the mountain is hollow'],
  },
};

export const GAME_IDS = Object.keys(GAMES);

export function createGame(id, seed, options = {}) {
  const { Game, variant } = GAMES[id];
  return new Game({ seed, ...(variant ? { [variant.key]: options[variant.key] ?? variant.values[0] } : {}) });
}
