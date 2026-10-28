# Spooooky Solitaire

GAME LINK: 
https://stawberrymind.github.io/spooky_cards/

Haunted card games in a pixel-art style that takes after Balatro: wobbly cards, a swirling background, screen shake, particles, haptics, and things watching you from the dark. Six solitaires, Texas Hold'em against bots, Video Poker and Blackjack, with trophies that unlock new card backs. Pick the game on the menu. It installs to your phone's home screen and plays offline.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

- `npm test`: engine tests (Node's built-in test runner)
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build
- `npm run package`: build and zip the game into `release/` for uploading to game portals
- `npm run social`: redraw `assets/social.png`, the picture shown when the link is shared

## How to play

### Solitaire

| Game | Rules | Menu option |
| --- | --- | --- |
| **Klondike** | Build four foundations up by suit from Ace to King. Build the seven columns down in alternating colours (red: hearts and diamonds; dark: clubs and spades). Only Kings go into an empty column. | Draw 1 or Draw 3 |
| **FreeCell** | Every card is dealt face up into eight columns. Same building rules as Klondike, but any card can fill an empty column, and four free cells each hold one card. How many cards you can move at once depends on how many cells and columns are free. | |
| **Spider** | Two decks, ten columns. Build down regardless of suit, but only same-suit runs move together. A complete King-to-Ace run of one suit leaves the table. Tap the deck to deal one card onto every column (not while a column is empty). | 1, 2 or 4 suits |
| **Pyramid** | Remove two free cards that add up to 13 by dropping one on the other (Jack 11, Queen 12). A King is 13 on its own: tap it. A card is free once both cards overlapping it are gone. The deck can be gone through three times. | |
| **Golf** | Play the bottom card of any column onto the pile if it is one rank above or below. No wrapping, and nothing goes on a King. The deck only goes through once. Streaks score more. | |
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
- **Pyramid:** +10 per pair or King, +25 per row cleared, +500 for the whole pyramid.
- **Golf:** 10 × the streak for each card, +500 for clearing the table plus 20 per card left in the deck.
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

#### Playing with friends

Pick Hold'em on the menu and press **Play with friends**.

- **Create lobby** gives you a 4-letter code. Share it, or use **Share invite link** (`…/spooky_cards/?join=CODE` opens straight into your lobby).
- Friends type the code and press **Join**. Up to 6 players; choose how many bots fill the empty chairs and how good they are.
- The host presses **Deal them in**. Everyone sees themselves at the bottom of the table. **BOO!**, **GG** and friends send a bubble over your seat.
- If a friend leaves, their hands fold themselves. If the host leaves, the game ends for everyone. After a game, **Back to lobby** deals a rematch with the same people.

How it works: the host's browser runs the game, and players connect browser to browser over WebRTC using [PeerJS](https://github.com/peers/peerjs). The free public PeerJS server only introduces players; it never sees the cards. Each player is sent only their own hole cards until the showdown, so nobody can peek using their browser's developer tools. As with any peer-to-peer game, connected players can see each other's IP addresses. Some strict networks (certain office or school Wi-Fi) block these direct connections.

### Video Poker

Jacks or Better with the full-pay 9/6 table. Bet 1 to 5 souls, tap the cards you want to keep, then draw once. A pair of Jacks or better pays; a Royal Flush on a 5-soul bet pays 4,000. **Hint** holds the cards a decent strategy would keep. Your bank carries over between visits. Keys: `1`–`5` hold, `H` hint, `Enter` deal or draw.

### Blackjack

- Six-deck shoe. The dealer stands on all 17s and checks for blackjack. Blackjack pays 3 to 2.
- Double on any first two cards. Split once; split Aces get one card each.
- Your bank of souls carries over between visits. Lose it all and the house lends you another 1,000.
- **Hit** `H`, **Stand** `S`, **Double** `D`, **Split** `P`, **Deal** `Enter`.

### Everywhere

- **Trophies** on the menu: 22 goals across every game. Six of them unlock new card backs (Skull, Web, Lantern, Coffin, Bat, Moth), which you pick in the trophy room.
- **?** in any game shows its rules. They also appear the first time you play a game.
- **Settings** (menu, or the gear in any game): music and sound volume, jump scares, flashing lights, screen shake, calm motion, scanlines and vibration. The first visit asks whether to keep the flashing and scares on.
- **About** has the credits and a short privacy note.
- **Install:** on a phone, use "Add to Home Screen" (or the install button in a desktop browser). After the first visit the game works offline.

## Code layout

| Path | What it is |
| --- | --- |
| `src/engine/base.js` | What every game provides (moves, hints, layout), plus shared undo and save/load. No DOM. |
| `src/engine/klondike.js`, `freecell.js`, `spider.js`, `tripeaks.js`, `pyramid.js`, `golf.js` | The rules of each solitaire |
| `src/engine/games.js` | The menu's list of games, their options and start-of-game whispers |
| `src/engine/poker/` | Hand ranking (`hands.js`), the Hold'em betting and side-pot engine (`holdem.js`), bots (`bot.js`), Video Poker (`videopoker.js`) |
| `src/engine/blackjack.js` | Blackjack rules and payouts |
| `src/modes/poker.js`, `videopoker.js`, `blackjack.js` | The table screens: play the engine's events back as animation, take your actions. Hold'em runs solo, as a lobby host, or as a guest |
| `src/net/lobby.js` | Creating and joining lobbies with PeerJS |
| `src/net/protocol.js` | What the host sends each guest (hiding other players' cards) and checks on what guests send back |
| `src/ui/lobby-screen.js` | The Play with friends screen and invite links |
| `src/ui/trophies.js` | Trophies, the trophy room and card back picker |
| `assets/sw.js`, `assets/manifest.webmanifest`, `assets/icons/` | Offline play and installing to a home screen |
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
- `back`: an image file for your own card back. It shows up in the trophy room as an extra choice. Leave it `null` to use only the built-in pixel backs.
- `showIndex`: set to `false` if your art already shows the rank and suit clearly.

## Publishing

The game is a static site, so it can go anywhere that hosts files.

- **GitHub Pages** (already set up): every push to `main` is tested, built and deployed (see below).
- **itch.io**: create a project, set *Kind of project* to **HTML**, upload the zip from `npm run package` and tick *This file will be played in the browser*. A viewport of 1280×800 with *Mobile friendly* and *Fullscreen button* switched on works well.
- **Newgrounds, CrazyGames, Poki, GameDistribution**: all take the same zip. Some portals require their own ad or analytics code before they accept a game.
- **Your own domain**: buy one, then add it under the repository's *Settings → Pages → Custom domain*. Also update the `og:url` and `og:image` links at the top of `index.html`.

Before publishing under a different name, change the `<title>` and `og:title` in `index.html`, `name` and `short_name` in `assets/manifest.webmanifest`, and the title on the menu, then run `npm run social` to redraw the preview picture.

## GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds with Vite, and deploys `dist/` whenever `main` is pushed. Set the repository's Pages source to **GitHub Actions**.

## Credits

Art and music by Lemonade (Nibodh). Code by Rocketarmmind (Aarav).
