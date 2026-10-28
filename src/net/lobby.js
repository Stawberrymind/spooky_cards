import Peer from 'peerjs';
import { cleanCode, cleanName, MAX_PLAYERS } from './protocol.js';

// Lobbies over WebRTC. The host's browser registers a short code with the
// public PeerJS signalling service; friends connect to it directly, browser
// to browser. Only the introduction goes through the service, not the game.

const PREFIX = 'spooooky-cards-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const CONNECT_TIMEOUT = 15000;

function makeCode() {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

function emitter() {
  const subs = new Set();
  return {
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit(...args) {
      for (const fn of [...subs]) fn(...args);
    },
  };
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('The spirit line is busy. Check your connection and try again.'));
    }, CONNECT_TIMEOUT);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

/**
 * Open a lobby. Players: [{ id, name, host?, away? }], host first.
 * events: 'players' (list), 'message' (player, msg), 'leave' (player).
 */
export async function hostLobby(name) {
  let peer = null;
  let code = null;
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = makeCode();
    try {
      peer = await openPeer(PREFIX + code);
    } catch (err) {
      if (err.type !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw new Error('Could not find a free lobby code. Try again.');

  const players = [{ id: 'host', name: cleanName(name), host: true }];
  const conns = new Map();
  const changed = emitter();
  const messages = emitter();
  const leaves = emitter();
  let locked = false;

  const list = () => players.map(({ id, name: n, host, away }) => ({ id, name: n, host: Boolean(host), away: Boolean(away) }));
  const announce = () => {
    changed.emit(list());
    for (const conn of conns.values()) conn.send({ type: 'lobby', code, players: list(), you: conn.peer });
  };

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (locked || players.filter((p) => !p.away).length >= MAX_PLAYERS) {
        conn.send({ type: 'refused', reason: locked ? 'That game has already started.' : 'That table is full.' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      const player = { id: conn.peer, name: cleanName(conn.metadata?.name) };
      players.push(player);
      conns.set(conn.peer, conn);
      conn.on('data', (msg) => {
        if (msg && typeof msg === 'object') messages.emit(player, msg);
      });
      conn.on('close', () => {
        conns.delete(conn.peer);
        if (locked) player.away = true;
        else players.splice(players.indexOf(player), 1);
        leaves.emit(player);
        announce();
      });
      announce();
    });
  });
  // Lost the signalling server: existing games keep working, but nobody new can join.
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });

  return {
    code,
    role: 'host',
    players: list,
    onPlayers: changed.on,
    onMessage: messages.on,
    onLeave: leaves.on,
    send(id, msg) {
      conns.get(id)?.send(msg);
    },
    broadcast(msg) {
      for (const conn of conns.values()) conn.send(msg);
    },
    /** Stop new players joining (the game has started), or reopen for a rematch. */
    lock(on = true) {
      locked = on;
      if (!on) {
        for (let i = players.length - 1; i >= 0; i--) if (players[i].away) players.splice(i, 1);
        announce();
      }
    },
    close() {
      for (const conn of conns.values()) conn.close();
      peer.destroy();
    },
  };
}

/** Join a friend's lobby by code. events: 'message' (msg), 'close'. */
export async function joinLobby(code, name) {
  const peer = await openPeer(null);
  const conn = await new Promise((resolve, reject) => {
    const c = peer.connect(PREFIX + cleanCode(code), { reliable: true, metadata: { name: cleanName(name) } });
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('Nobody answered. Check the code and try again.'));
    }, CONNECT_TIMEOUT);
    c.once('open', () => {
      clearTimeout(timer);
      resolve(c);
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err.type === 'peer-unavailable' ? new Error('No lobby with that code. It may have closed.') : err);
    });
  });

  const messages = emitter();
  const closed = emitter();
  let closing = false;
  conn.on('data', (msg) => {
    if (msg && typeof msg === 'object') messages.emit(msg);
  });
  conn.on('close', () => {
    if (!closing) closed.emit();
    peer.destroy();
  });

  return {
    code: cleanCode(code),
    role: 'guest',
    id: peer.id,
    onMessage: messages.on,
    onClose: closed.on,
    send(msg) {
      conn.send(msg);
    },
    close() {
      closing = true;
      conn.close();
      peer.destroy();
    },
  };
}
