const { WebSocket } = require("ws");
const { randomInt } = require("node:crypto");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { createFriendRooms, friendRoomState, friendRoomOutcome } = require("./friend-rooms.cjs");
const { resolveGameResult } = require("./game-rules.cjs");
const castling = require("./palace-castling.js");
const jieqi = require("./jieqi.js");
const { ROOM_CODE, SESSION_TOKEN, MAX_MESSAGE_BYTES, RECONNECT_MS, relayAddress, remoteError } = require("./remote-protocol.cjs");

const MOVE = /^[a-i][0-9][a-i][0-9]$/;
const DISCONNECTED = { ok: false, message: "远程房间暂时无法落子" };
const RELAY_ERRORS = new Set(["remoteBusy", "remoteRoomMissing", "remoteRoomFull", "remoteHostOffline", "remoteRoomClosed", "remoteUpdateRequired"]);
const ROOM_VARIANTS = new Set([castling.variant, jieqi.variant]);

function connectRemoteRoom({ url, color, code, hostKey, lobby = false, variant = null, onState = () => {}, onEnd = () => {} }) {
  const endpoint = relayAddress(url, lobby);
  const hosting = code === undefined;
  if (!hosting && (typeof code !== "string" || !ROOM_CODE.test(code))) throw remoteError("remoteBadCode");
  if (hosting && !lobby && color !== "r" && color !== "b") throw remoteError("remoteBadSide");
  if (variant !== null && (!hosting || !lobby || !ROOM_VARIANTS.has(variant))) throw remoteError("remoteUpdateRequired");
  const rooms = hosting ? createFriendRooms() : null;
  const lobbyGame = lobby ? new Xiangqi() : null;
  let guestGame = hosting ? null : new Xiangqi();
  let roomVariant = variant;
  let draw;
  let host = lobby ? null : rooms?.create(color);
  let guest;
  let seating;
  let roomCode = code;
  let relayToken;
  let socket;
  let registered = false;
  let peerOnline = false;
  let ended = false;
  let board;
  let reachBy = 0;
  let retryDelay = 350;
  let retryTimer;
  let initialTimer;
  let lastPing = Date.now();
  let nextId = 0;
  const pending = new Map();
  const { promise: ready, resolve, reject } = Promise.withResolvers();
  let unsubscribe = host ? rooms.subscribe(host.roomCode, host.token, publishHost) : null;

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > MAX_MESSAGE_BYTES * 4) {
      socket.terminate();
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function show(state, connection) {
    board = { ...state, ...(roomVariant ? { variant: roomVariant, draw } : {}), roomCode, remote: true, connection };
    onState(board);
    if (!connection) {
      clearTimeout(initialTimer);
      resolve(board);
    }
  }

  function settle(id, result) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    request.resolve(result);
  }

  function end(reason = "remoteRoomClosed", leave = false) {
    if (ended) return;
    ended = true;
    clearTimeout(retryTimer);
    clearTimeout(initialTimer);
    clearInterval(watchdog);
    unsubscribe?.();
    for (const id of pending.keys()) settle(id, DISCONNECTED);
    if (leave && registered) send({ type: "leave" });
    socket?.close();
    reject(remoteError(reason));
    onEnd();
    if (board) show(board, "closed");
  }

  function publishHost(state = rooms.getState(host.roomCode, host.token)) {
    const online = registered && (peerOnline || state.phase === "waiting");
    show(state, online ? undefined : "reconnecting");
    if (!registered || !peerOnline) return;
    const resigned = state.outcome?.reason === "红方认输" ? "r" : state.outcome?.reason === "黑方认输" ? "b" : null;
    const jieqiLog = roomVariant === jieqi.variant ? rooms.getState(host.roomCode, guest.token).jieqiLog : undefined;
    send({ type: "position", color: state.playerColor === "r" ? "b" : "r", moves: state.history, resigned, draw, jieqiLog });
  }

  function presence(online) {
    peerOnline = online;
    if (hosting && host) {
      if (online && !guest) guest = rooms.join(host.roomCode);
      else publishHost();
    } else if (!online && board && (!hosting || !registered)) {
      show(board, "reconnecting");
    }
    if (!online && (!lobby || seating?.started || !registered)) {
      for (const id of pending.keys()) settle(id, DISCONNECTED);
    }
  }

  function receiveLobby(message) {
    const { host: owner, guest: visitor, started } = message;
    const validSeat = seat => seat && [null, "r", "b"].includes(seat.side) && typeof seat.online === "boolean"
      && typeof seat.confirmed === "boolean" && (!seat.confirmed || seat.side);
    if (!validSeat(owner) || !validSeat(visitor) || typeof started !== "boolean"
      || (owner.side && owner.side === visitor.side) || (started && (!owner.confirmed || !visitor.confirmed))
      || (seating?.started && (!started || owner.side !== seating.host.side || visitor.side !== seating.guest.side))) {
      throw remoteError("remoteBadState");
    }
    seating = { host: owner, guest: visitor, started };
    const self = hosting ? owner : visitor;
    peerOnline = (hosting ? visitor : owner).online;
    if (!started) {
      const has = side => owner.side === side || visitor.side === side;
      const waiting = friendRoomState(lobbyGame, {
        roomCode, playerColor: self.side, players: { red: has("r"), black: has("b") }, phase: "waiting", outcome: null,
      });
      show({ ...waiting, lobby: { role: hosting ? "host" : "guest", host: owner, guest: visitor } },
        !hosting && !owner.online ? "reconnecting" : undefined);
    } else if (hosting && !host) {
      if (roomVariant === castling.variant) draw = castling.deal(randomInt);
      const game = roomVariant === jieqi.variant ? jieqi.game({ randomInt }) : draw ? castling.game(draw) : undefined;
      host = rooms.create(owner.side, game);
      guest = rooms.join(host.roomCode);
      unsubscribe = rooms.subscribe(host.roomCode, host.token, publishHost);
      publishHost();
    }
  }

  function receivePosition(message) {
    const { color: side, moves, resigned } = message;
    const previous = board?.history || [];
    if (!peerOnline || (side !== "r" && side !== "b") || (lobby && (!seating?.started || side !== seating.guest.side))
      || (board?.phase !== "waiting" && board && side !== board.playerColor)
      || (resigned !== null && resigned !== "r" && resigned !== "b") || !Array.isArray(moves)
      || moves.length > 4096 || moves.length < previous.length || !previous.every((move, index) => move === moves[index])) {
      throw remoteError("remoteBadState");
    }
    if (roomVariant === castling.variant) {
      if (!castling.validDraw(message.draw)) throw remoteError("remoteBadState");
      if (draw && castling.drawKey(draw) !== castling.drawKey(message.draw)) throw remoteError("remoteBadState");
      if (!draw) {
        draw = message.draw.map(({ type, r, b }) => ({ type, r, b }));
        guestGame = castling.game(draw);
      }
    } else if (message.draw !== undefined) throw remoteError("remoteBadState");
    if (roomVariant === jieqi.variant) {
      if (!jieqi.validLog(message.jieqiLog, moves.length)
        || (board?.jieqiLog || []).some((code, index) => code !== message.jieqiLog[index])) throw remoteError("remoteBadState");
      if (!guestGame.jieqi) guestGame = jieqi.game({ viewer: side });
    } else if (message.jieqiLog !== undefined) throw remoteError("remoteBadState");
    for (let index = previous.length; index < moves.length; index += 1) {
      const move = moves[index];
      if (typeof move !== "string" || !MOVE.test(move) || !guestGame.move(move, message.jieqiLog?.[index])) throw remoteError("remoteBadState");
    }
    // Replay the host's moves through the local rules before showing the board.
    const result = resolveGameResult(guestGame);
    const outcome = result ? friendRoomOutcome(result.winner, result.reason, result.pattern)
      : resigned === "r" ? friendRoomOutcome("black", "红方认输")
        : resigned === "b" ? friendRoomOutcome("red", "黑方认输") : null;
    show(friendRoomState(guestGame, {
      roomCode, playerColor: side, players: { red: true, black: true }, phase: outcome ? "finished" : "playing", outcome,
    }));
  }

  function receiveAction(message) {
    if (!guest || !peerOnline || !Number.isSafeInteger(message.id) || message.id < 1) return;
    const state = rooms.getState(host.roomCode, guest.token);
    let result = { ok: false };
    if (message.ply === state.history.length && state.phase === "playing") {
      if (message.action === "resign") result = rooms.resign(host.roomCode, guest.token);
      if (message.action === "move" && typeof message.move === "string" && MOVE.test(message.move)) {
        result = rooms.submitMove(host.roomCode, guest.token, message.move);
      }
    }
    send({ type: "reply", id: message.id, ok: result.ok });
  }

  function receive(message) {
    if (message.type === "error") return end(RELAY_ERRORS.has(message.code) ? message.code : "remoteUnavailable");
    if (message.type === "ended") return end();
    if (!registered) {
      if (message.type !== "ready" || message.role !== (hosting ? "host" : "guest")
        || typeof message.code !== "string" || !ROOM_CODE.test(message.code) || (roomCode && message.code !== roomCode)
        || typeof message.token !== "string" || !SESSION_TOKEN.test(message.token) || (relayToken && message.token !== relayToken)
        || typeof message.peerOnline !== "boolean") throw remoteError("remoteBadState");
      const announcedVariant = message.variant ?? null;
      if ((announcedVariant !== null && (!lobby || !ROOM_VARIANTS.has(announcedVariant)))
        || (hosting && announcedVariant !== variant) || (relayToken && announcedVariant !== roomVariant)) {
        if (hosting) send({ type: "leave" });
        return end("remoteUpdateRequired");
      }
      roomVariant = announcedVariant;
      roomCode = message.code;
      relayToken = message.token;
      registered = true;
      reachBy = 0;
      retryDelay = 350;
      presence(message.peerOnline);
      return;
    }
    if (message.type === "presence" && typeof message.online === "boolean") presence(message.online);
    if (lobby && message.type === "lobby") receiveLobby(message);
    if (hosting && message.type === "action") receiveAction(message);
    if (!hosting && message.type === "position") receivePosition(message);
    if (message.type === "reply" && typeof message.ok === "boolean") {
      settle(message.id, message.ok ? { ok: true } : { ok: false, error: message.error, message: "这步棋不符合规则" });
    }
  }

  function connect() {
    if (ended) return;
    if (reachBy && Date.now() >= reachBy) return end();
    const wire = new WebSocket(endpoint, {
      handshakeTimeout: reachBy ? Math.min(8000, reachBy - Date.now()) : 65_000,
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
    });
    socket = wire;
    wire.on("error", () => {});
    wire.on("unexpected-response", (_request, response) => {
      response.destroy();
      if (!hosting && !relayToken && response.statusCode === 404) end("remoteRoomMissing");
      else wire.terminate();
    });
    wire.on("ping", () => { lastPing = Date.now(); });
    wire.on("open", () => {
      lastPing = Date.now();
      const supported = { supportsCastling: castling.variant, supportsJieqi: jieqi.variant };
      if (relayToken) send({ type: "resume", code: roomCode, token: relayToken, ...supported });
      else send(hosting ? { type: "create", hostKey, variant: variant || undefined } : { type: "join", code: roomCode, ...supported });
    });
    wire.on("message", (raw, binary) => {
      if (ended || socket !== wire) return;
      try {
        if (binary) throw remoteError("remoteBadState");
        receive(JSON.parse(raw.toString()));
      } catch { end("remoteBadState", true); }
    });
    wire.on("close", () => {
      if (ended || socket !== wire) return;
      registered = false;
      if (!relayToken) return end("remoteUnavailable");
      presence(false);
      reachBy ||= Date.now() + RECONNECT_MS;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(4000, retryDelay * 2);
    });
  }

  function request(message) {
    const id = ++nextId;
    return new Promise(resolveAction => {
      const timer = setTimeout(() => settle(id, DISCONNECTED), 6000);
      pending.set(id, { resolve: resolveAction, timer });
      if (!send({ ...message, id })) settle(id, DISCONNECTED);
    });
  }

  function act(action, move) {
    if (!board || ended || board.connection || !peerOnline || board.phase !== "playing") return DISCONNECTED;
    if (action === "move" && (board.turn !== board.playerColor || typeof move !== "string" || !MOVE.test(move))) {
      return { ok: false, message: "现在不能落子" };
    }
    if (hosting) {
      return action === "resign" ? rooms.resign(host.roomCode, host.token) : rooms.submitMove(host.roomCode, host.token, move);
    }
    return request({ type: "action", action, move, ply: board.history.length });
  }

  const watchdog = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN && Date.now() - lastPing > 40_000) socket.terminate();
  }, 5000);
  watchdog.unref();
  initialTimer = setTimeout(() => end("remoteUnavailable", true), 75_000);
  initialTimer.unref();
  connect();
  return {
    ready,
    getState: () => board,
    lobbyAction(action, side) {
      if (!lobby || ended || !registered || !board?.lobby) return { ok: false, error: "remoteUnavailable" };
      if (!["select", "confirm", "start"].includes(action)) return { ok: false, error: "remoteBadSide" };
      return request({ type: "lobby-action", action, side });
    },
    getLegalMoves(square) {
      if (!board || ended || board.connection || board.phase !== "playing" || board.turn !== board.playerColor
        || typeof square !== "string" || !/^[a-i][0-9]$/.test(square)) return [];
      return hosting ? rooms.getLegalMoves(host.roomCode, host.token, square) : guestGame.moves({ square });
    },
    submitMove: move => act("move", move),
    resign: () => act("resign"),
    close: () => end("remoteRoomClosed", true),
  };
}

module.exports = { connectRemoteRoom };
