import { cleanCode, cleanName, MAX_PLAYERS } from '../net/protocol.js';
import { RIVALS } from '../modes/poker.js';

// The "Play with friends" screen: pick a name, create or join a lobby, see
// who's in, and (as host) choose bots and start. Invite links look like
// ...?join=ABCD and open this screen with the code filled in.
// The networking code (PeerJS) only loads once someone creates or joins.

const network = () => import('../net/lobby.js');

const DIFFICULTIES = ['normal', 'hard', 'easy'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function createLobbyScreen({ $, store, sfx, whisper, onStart, onExit }) {
  let lobby = null;
  let offs = [];
  let bots = store.get('lobby-bots', 1);
  let difficulty = store.get('lobby-difficulty', 'normal');
  let busy = false;

  $('lobby-name').value = store.get('player-name', '');
  $('lobby-name').addEventListener('change', () => store.set('player-name', cleanName($('lobby-name').value)));
  $('lobby-code').addEventListener('input', () => { $('lobby-code').value = cleanCode($('lobby-code').value); });
  $('lobby-create').addEventListener('click', create);
  $('lobby-join').addEventListener('click', () => join($('lobby-code').value));
  $('lobby-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('lobby-code').value); });
  $('lobby-back').addEventListener('click', () => {
    leave();
    onExit();
  });
  $('lobby-invite').addEventListener('click', invite);
  $('lobby-bots').addEventListener('click', () => {
    bots = (bots + 1) % (RIVALS.length + 1);
    store.set('lobby-bots', bots);
    sfx.pick();
    renderRoom();
  });
  $('lobby-difficulty').addEventListener('click', () => {
    difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(difficulty) + 1) % DIFFICULTIES.length];
    store.set('lobby-difficulty', difficulty);
    sfx.pick();
    renderRoom();
  });
  $('lobby-go').addEventListener('click', () => {
    if (lobby?.role !== 'host') return;
    const humans = lobby.players().filter((p) => !p.away).length;
    if (humans + Math.min(bots, MAX_PLAYERS - humans) < 2) return;
    sfx.shuffle();
    onStart({ role: 'host', lobby, bots, difficulty, seed: Math.floor(Math.random() * 2 ** 31) });
  });

  function name() {
    const n = cleanName($('lobby-name').value);
    $('lobby-name').value = n;
    store.set('player-name', n);
    return n;
  }

  function setStatus(text, bad = false) {
    $('lobby-status').textContent = text;
    $('lobby-status').classList.toggle('is-bad', bad);
  }

  async function create() {
    if (busy) return;
    busy = true;
    setStatus('opening a door to the other side…');
    try {
      leave();
      const { hostLobby } = await network();
      lobby = await hostLobby(name());
      offs = [lobby.onPlayers(renderRoom)];
      sfx.suitDone();
      showRoom();
      setStatus('share the code. bots fill any empty chairs');
    } catch (err) {
      setStatus(err.message || 'Could not open a lobby.', true);
    }
    busy = false;
  }

  async function join(code) {
    if (busy) return;
    const clean = cleanCode(code);
    if (clean.length !== 4) {
      setStatus('lobby codes are 4 letters', true);
      return;
    }
    busy = true;
    setStatus(`knocking on ${clean}…`);
    try {
      leave();
      const { joinLobby } = await network();
      lobby = await joinLobby(clean, name());
      let players = [];
      offs = [
        lobby.onMessage((msg) => {
          if (msg.type === 'lobby') {
            players = Array.isArray(msg.players) ? msg.players : [];
            renderRoom(players);
          } else if (msg.type === 'refused') {
            setStatus(String(msg.reason ?? 'Refused.'), true);
            leave();
            showStart();
          } else if (msg.type === 'start') {
            onStart({ role: 'guest', lobby, seat: Number(msg.seat), table: msg.table });
          }
        }),
        lobby.onClose(() => {
          whisper('the host has vanished');
          leave();
          onExit({ vanished: true });
        }),
      ];
      sfx.suitDone();
      showRoom();
      setStatus('waiting for the host to start…');
    } catch (err) {
      setStatus(err.message || 'Could not join.', true);
    }
    busy = false;
  }

  function leave() {
    for (const off of offs) off();
    offs = [];
    lobby?.close();
    lobby = null;
  }

  async function invite() {
    if (!lobby) return;
    const url = new URL(window.location.href);
    url.search = `?join=${lobby.code}`;
    url.hash = '';
    const link = url.toString();
    try {
      if (navigator.share) await navigator.share({ title: 'Spooooky poker', text: `Join my haunted poker table: ${lobby.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setStatus('invite link copied');
      }
    } catch {
      setStatus(link);
    }
  }

  function showStart() {
    $('lobby-start').hidden = false;
    $('lobby-room').hidden = true;
  }

  function showRoom() {
    $('lobby-start').hidden = true;
    $('lobby-room').hidden = false;
    renderRoom();
  }

  function renderRoom(list) {
    if (!lobby) return;
    const players = lobby.role === 'host' ? lobby.players() : (list ?? []);
    $('lobby-code-show').textContent = lobby.code;
    $('lobby-players').replaceChildren(...players.map((p) => {
      const li = document.createElement('li');
      li.textContent = p.name;
      if (p.host) li.dataset.tag = 'host';
      if (lobby.role === 'guest' && p.id === lobby.id) li.dataset.tag = 'you';
      return li;
    }));
    const host = lobby.role === 'host';
    $('lobby-host-options').hidden = !host;
    $('lobby-go').hidden = !host;
    if (host) {
      const humans = players.filter((p) => !p.away).length;
      const seatsForBots = Math.min(bots, MAX_PLAYERS - humans);
      $('lobby-bots').textContent = `Bots: ${seatsForBots}`;
      $('lobby-difficulty').textContent = `Level: ${cap(difficulty)}`;
      $('lobby-go').disabled = humans + seatsForBots < 2;
    }
  }

  return {
    /** Show the screen; `code` comes from an invite link. */
    open(code) {
      if (lobby) {
        // Back from a game: same lobby, maybe a rematch.
        if (lobby.role === 'host') lobby.lock(false);
        showRoom();
        setStatus(lobby.role === 'host' ? 'deal again whenever you like' : 'waiting for the host…');
        return;
      }
      showStart();
      setStatus('');
      if (code) {
        $('lobby-code').value = cleanCode(code);
        if ($('lobby-name').value) join(code);
        else {
          setStatus('pick a name, then join');
          $('lobby-name').focus();
        }
      }
    },
    leave,
    active: () => Boolean(lobby),
  };
}
