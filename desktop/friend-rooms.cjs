const { randomBytes, randomInt } = require("node:crypto");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { resolveGameResult } = require("./game-rules.cjs");

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 500;

function roomError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeCode(value) {
  if (typeof value !== "string") return "";
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === ROOM_CODE_LENGTH ? code : "";
}

function createFriendRooms({ now = Date.now, makeCode = null, makeToken = null } = {}) {
  const rooms = new Map();

  function cleanup() {
    const cutoff = now() - ROOM_TTL_MS;
    for (const [code, room] of rooms) {
      if (room.updatedAt < cutoff) rooms.delete(code);
    }
  }

  function newCode() {
    if (makeCode) return normalizeCode(makeCode());
    let code = "";
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  function newToken() {
    return makeToken ? makeToken() : randomBytes(24).toString("base64url");
  }

  function getRoom(code) {
    cleanup();
    const room = rooms.get(normalizeCode(code));
    if (!room) throw roomError(404, "找不到这个房间，房间可能已过期或服务已重启");
    return room;
  }

  function getSeat(room, token) {
    if (!token || typeof token !== "string") throw roomError(401, "房间会话已失效，请重新加入");
    if (room.players.r?.token === token) return "r";
    if (room.players.b?.token === token) return "b";
    throw roomError(403, "这个设备不属于该房间");
  }

  function snapshot(room, token) {
    const playerColor = getSeat(room, token);
    const board = room.game.board();
    return {
      board,
      turn: room.game.turn(),
      history: room.game.history(),
      phase: room.phase,
      status: room.phase === "waiting"
        ? "房间已创建，等待朋友加入"
        : room.phase === "finished"
          ? `${room.outcome.title} · ${room.outcome.reason}`
          : room.game.turn() === playerColor ? "轮到你走" : "等待对方走棋",
      thinking: false,
      outcome: room.outcome,
      engineFailure: false,
      inCheck: room.game.in_check(),
      mode: "friend",
      roomCode: room.code,
      playerColor,
      players: { red: Boolean(room.players.r), black: Boolean(room.players.b) },
      pgn: room.game.pgn(),
      finalFen: room.game.fen(),
    };
  }

  function publish(room) {
    room.updatedAt = now();
    for (const [token, listeners] of room.listeners) {
      let state;
      try {
        state = snapshot(room, token);
      } catch {
        continue;
      }
      for (const listener of listeners) {
        try { listener(state); } catch {}
      }
    }
  }

  function finish(room, winner, reason, pattern = null) {
    const titles = { red: "红方获胜", black: "黑方获胜", draw: "本局和棋" };
    room.phase = "finished";
    room.outcome = { winner, title: titles[winner], reason };
    if (pattern) room.outcome.pattern = pattern;
  }

  function create(playerColor = "r") {
    if (playerColor !== "r" && playerColor !== "b") throw roomError(400, "请选择执红或执黑");
    cleanup();
    if (rooms.size >= MAX_ROOMS) throw roomError(503, "当前房间较多，请稍后再试");
    let code = newCode();
    let attempts = 0;
    while (!code || rooms.has(code)) {
      code = newCode();
      attempts += 1;
      if (attempts > 100) throw roomError(503, "暂时无法分配房间号");
    }
    const token = newToken();
    const room = {
      code,
      game: new Xiangqi(),
      phase: "waiting",
      outcome: null,
      players: { r: playerColor === "r" ? { token } : null, b: playerColor === "b" ? { token } : null },
      listeners: new Map(),
      updatedAt: now(),
    };
    rooms.set(code, room);
    return { roomCode: code, token, state: snapshot(room, token) };
  }

  function join(codeValue, existingToken = null) {
    const room = getRoom(codeValue);
    if (existingToken) {
      getSeat(room, existingToken);
      room.updatedAt = now();
      return { roomCode: room.code, token: existingToken, state: snapshot(room, existingToken), resumed: true };
    }
    if (room.phase !== "waiting" || (room.players.r && room.players.b)) throw roomError(409, "房间已经有两位玩家");
    const token = newToken();
    room.players[room.players.r ? "b" : "r"] = { token };
    room.phase = "playing";
    publish(room);
    return { roomCode: room.code, token, state: snapshot(room, token), resumed: false };
  }

  function getState(code, token) {
    const room = getRoom(code);
    room.updatedAt = now();
    return snapshot(room, token);
  }

  function getLegalMoves(code, token, square) {
    const room = getRoom(code);
    const playerColor = getSeat(room, token);
    if (room.phase !== "playing" || room.game.turn() !== playerColor || typeof square !== "string" || !/^[a-i][0-9]$/.test(square)) return [];
    const row = 9 - Number(square[1]);
    const file = "abcdefghi".indexOf(square[0]);
    if (file < 0 || row < 0 || row > 9) return [];
    const piece = room.game.board()[row]?.[file];
    if (!piece || piece.color !== playerColor) return [];
    room.updatedAt = now();
    return room.game.moves({ square });
  }

  function submitMove(code, token, move) {
    const room = getRoom(code);
    const playerColor = getSeat(room, token);
    if (room.phase !== "playing") return { ok: false, message: "现在不能落子" };
    if (room.game.turn() !== playerColor) return { ok: false, message: "还没轮到你走" };
    if (typeof move !== "string" || !room.game.move(move)) return { ok: false, message: "这步棋不符合规则" };
    const result = resolveGameResult(room.game);
    if (result) finish(room, result.winner, result.reason, result.pattern);
    publish(room);
    return { ok: true, state: snapshot(room, token) };
  }

  function resign(code, token) {
    const room = getRoom(code);
    const playerColor = getSeat(room, token);
    if (room.phase !== "playing") return { ok: false, message: "本局已经结束" };
    finish(room, playerColor === "r" ? "black" : "red", playerColor === "r" ? "红方认输" : "黑方认输");
    publish(room);
    return { ok: true, state: snapshot(room, token) };
  }

  function subscribe(code, token, listener) {
    const room = getRoom(code);
    getSeat(room, token);
    let listeners = room.listeners.get(token);
    if (!listeners) {
      listeners = new Set();
      room.listeners.set(token, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) room.listeners.delete(token);
    };
  }

  return { create, join, getState, getLegalMoves, submitMove, resign, subscribe };
}

module.exports = { createFriendRooms, normalizeRoomCode: normalizeCode };
