# Spooooky Solitaire

Klondike solitaire in a haunted, pixel-art style that takes after Balatro: wobbly cards, a swirling background, screen shake, particles, haptics, and things watching you from the dark.

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

Standard Klondike. Build the four foundations up by suit from Ace to King. Build the seven tableau columns down in alternating colours (red: hearts and diamonds; dark: clubs and spades). Only Kings can go into an empty column.

- **Drag** a card or a run of cards to move it, or **tap** a card to send it to the best spot.
- **Tap the deck** to draw. When it runs out, tap the empty slot to recycle the waste.
- **Undo** `Z`, **Hint** `H`, **Draw** `Space`, **New game** `N`, **Menu** `Esc`.
- Draw 1 or Draw 3 is set on the menu. **Daily haunt** gives everyone the same deal on the same day.
- Once every card is face up, the rest fly home on their own.

Score ("Souls") uses classic Windows scoring: +10 to a foundation, +5 waste to tableau, +5 for each card turned face up, −15 for taking a card back off a foundation, −100 per recycle in Draw 1.

## Code layout

| Path | What it is |
| --- | --- |
| `src/engine/klondike.js` | Pure game rules: deal, moves, draw, undo, hints, auto-complete, save and load. No DOM. |
| `src/engine/cards.js` | Card model, seeded shuffle |
| `src/ui/board.js` | Card rendering, layout, drag and tap input |
| `src/ui/fx.js` | Particles, screen shake, popups, vibration, win cascade |
| `src/ui/audio.js` | Synthesised sound effects (WebAudio) |
| `src/ui/background.js` | WebGL swirl background |
| `src/ui/art.js` | Loads the card art from `assets/cards/manifest.json` |
| `src/main.js` | Menu, game flow, HUD, saving, atmosphere |
| `tests/klondike.test.js` | Engine tests |

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
