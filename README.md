# Spooooky Solitaire

GAME LINK: 
https://stawberrymind.github.io/spooky_cards/

Haunted card games in a pixel-art style that takes after Balatro: wobbly cards, a swirling background, screen shake, particles, haptics, and things watching you from the dark. Four solitaires, Texas Hold'em against bots, and Blackjack. Pick the game on the menu.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

- `npm test`: engine tests (Node's built-in test runner)
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build

## How to play

### Solitaire

| Game | Rules | Menu option |
| --- | --- | --- |
| **Klondike** | Build four foundations up by suit from Ace to King. Build the seven columns down in alternating colours (red: hearts and diamonds; dark: clubs and spades). Only Kings go into an empty column. | Draw 1 or Draw 3 |
| **FreeCell** | Every card is dealt face up into eight columns. Same building rules as Klondike, but any card can fill an empty column, and four free cells each hold one card. How many cards you can move at once depends on how many cells and columns are free. | |
| **Spider** | Two decks, ten columns. Build down regardless of suit, but only same-suit runs move together. A complete King-to-Ace run of one suit leaves the table. Tap the deck to deal one card onto every column (not while a column is empty). | 1, 2 or 4 suits |
| **TriPeaks** | Clear the three peaks. A card can go onto the waste pile if it is one rank above or below it (King and Ace wrap). Cards unlock once nothing overlaps them. Every card in a row without drawing grows the streak, and the streak multiplies the points. | |

- **Drag** a card or a run of cards to move it, or **tap** a card to send it to the best spot.
- **Tap the deck** to draw or deal. In Klondike, when it runs out, tap the empty slot to recycle the waste.
- **Undo** `Z`, **Hint** `H`, **Draw** `Space`, **New game** `N`, **Menu** `Esc`.
- **Daily haunt** gives everyone the same deal on the same day.
- Klondike and FreeCell finish themselves once nothing is left to work out.
- Each game keeps its own save and stats.

Scoring ("Souls"):

- **Klondike:** classic Windows scoring. +10 to a foundation, +5 waste to tableau, +5 for each card turned face up, −15 for taking a card back off a foundation, −100 per recycle in Draw 1.
- **FreeCell:** +10 per card on a foundation.
- **Spider:** starts at 500, −1 per move, +100 per run laid to rest.
- **TriPeaks:** 10 × the streak for each card, +150 for each peak, +500 for clearing the table.

### Hold'em

No-limit Texas Hold'em against 1 to 5 bots, tournament style: everyone starts with 1,000 chips, the blinds double every 8 hands, and the last player with chips wins.

- Pick the number of rivals and how good they are on the menu:
  - **Easy:** calls almost anything and rarely folds.
  - **Normal:** plays the odds, with the odd bluff.
  - **Hard:** varies its bet sizes, slow-plays big hands, semi-bluffs draws, and bluffs more when it's one on one.
- Every bot works out its chance of winning by dealing the rest of the hand out hundreds of times.
- **Fold** `F`, **Check / Call** `C`, **Bet / Raise** `R`. Use the slider or the Min / ½ pot / Pot / All in buttons to size a raise.
- Side pots and split pots are handled properly.
- Simplification: any raise, even a short all-in, re-opens the betting.
- Leaving mid-hand saves the table as it was before that hand; Continue deals a fresh hand.

### Blackjack

- Six-deck shoe. The dealer stands on all 17s and checks for blackjack. Blackjack pays 3 to 2.
- Double on any first two cards. Split once; split Aces get one card each.
- Your bank of souls carries over between visits. Lose it all and the house lends you another 1,000.
- **Hit** `H`, **Stand** `S`, **Double** `D`, **Split** `P`, **Deal** `Enter`.

## Code layout

| Path | What it is |
| --- | --- |
| `src/engine/base.js` | What every game provides (moves, hints, layout), plus shared undo and save/load. No DOM. |
| `src/engine/klondike.js`, `freecell.js`, `spider.js`, `tripeaks.js` | The rules of each game |
| `src/engine/games.js` | The menu's list of games, their options and start-of-game whispers |
| `src/engine/poker/` | Hold'em: hand ranking (`hands.js`), the betting and side-pot engine (`holdem.js`), bots (`bot.js`) |
| `src/engine/blackjack.js` | Blackjack rules and payouts |
| `src/modes/poker.js`, `src/modes/blackjack.js` | The table screens: play the engine's events back as animation, take your actions |
| `src/ui/felt.js` | Places cards and chips on the poker and blackjack tables |
| `src/engine/cards.js` | Card model, seeded shuffle |
| `src/ui/board.js` | Card rendering, drag and tap input. Places piles from each game's `layout()` |
| `src/ui/fx.js` | Particles, screen shake, popups, vibration, win cascade |
| `src/ui/audio.js` | Synthesised sound effects (WebAudio) |
| `src/ui/background.js` | WebGL swirl background |
| `src/ui/art.js` | Loads the card art from `assets/cards/manifest.json` |
| `src/main.js` | Menu, game flow, HUD, saving, atmosphere |
| `tests/` | Engine tests |

## Custom cards

All card art is driven by `assets/cards/manifest.json`, so a new deck needs no code changes:

- `sprite.size`: the square size of each source image in pixels.
- `sprite.crop`: where the card sits inside that image (`x`, `y`, `width`, `height`). The card is drawn at an integer multiple of this size, so keep it pixel art.
- `suits.<suit>.cards`: one image file per rank (`2`–`10`, `11` = Jack, `12` = Queen, `13` = King, `14` = Ace), relative to `assets/cards/`.
- `suits.<suit>.color`: colour of the rank and suit label drawn in the corner.
- `back`: an image file for the card back. Leave it `null` to use the built-in pixel eye.
- `showIndex`: set to `false` if your art already shows the rank and suit clearly.

## GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds with Vite, and deploys `dist/` whenever `main` is pushed. Set the repository's Pages source to **GitHub Actions**.

## Credits

Art and music by Lemonade (Nibodh). Code by Rocketarmmind (Aarav).
