const { createServer } = require("node:http");
const { randomInt, randomBytes } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");
const { RELAY_PATH, LOBBY_RELAY_PATH, ROOM_CODE, SESSION_TOKEN, MAX_MESSAGE_BYTES, RECONNECT_MS } = require("../desktop/remote-protocol.cjs");
const { variant: CASTLING_VARIANT } = require("../desktop/palace-castling.js");
const { variant: JIEQI_VARIANT } = require("../desktop/jieqi.js");
const ROOM_VARIANTS = new Set([CASTLING_VARIANT, JIEQI_VARIANT]);

function supportsVariant(message, variant) {
  if (!variant) return true;
  return (variant === JIEQI_VARIANT ? message.supportsJieqi : message.supportsCastling) === variant;
}

const ROOM_LIMIT = 100;
const MINUTE = 60_000;

function createRelayServer({ reconnectMs = RECONNECT_MS, heartbeatMs = 12_000, hostedRoom } = {}) {
  // ponytail: rooms live in one relay process. Use shared routing before adding replicas.
  const rooms = new Map();
  const attempts = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const server = createServer((request, response) => {
    const healthy = request.method === "GET" && request.url === "/health";
    if (healthy && hostedRoom) response.setHeader("X-NinePalace-Room", hostedRoom.code);
    response.writeHead(healthy ? 200 : 404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    response.end(healthy ? "NinePalace relay v1\n" : "Not found\n");
  });

  function send(socket, message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_MESSAGE_BYTES * 4) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function finish(room) {
    rooms.delete(room.code);
    for (const seat of [room.host, room.guest]) {
      send(seat?.socket, { type: "ended" });
      seat?.socket?.close();
    }
  }

  function publishLobby(room) {
    if (!room.lobby) return;
    const info = seat => ({ side: seat?.side ?? null, confirmed: Boolean(seat?.confirmed), online: seat?.socket?.readyState === WebSocket.OPEN });
    const state = { type: "lobby", host: info(room.host), guest: info(room.guest), started: room.started };
    send(room.host?.socket, state);
    send(room.guest?.socket, state);
  }

  function sweep(now) {
    for (const room of rooms.values()) {
      if ([room.host, room.guest].some(seat => seat && !seat.socket && seat.expiresAt <= now)) finish(room);
    }
    for (const [address, bucket] of attempts) {
      if (bucket.until <= now) attempts.delete(address);
    }
  }

  function mayConnect(address) {
    const now = Date.now();
    let bucket = attempts.get(address);
    if (!bucket || bucket.until <= now) {
      if (attempts.size >= 4096) return false;
      bucket = { count: 0, until: now + MINUTE };
      attempts.set(address, bucket);
    }
    return ++bucket.count <= 24;
  }

  server.on("upgrade", (request, socket, head) => {
    if (![RELAY_PATH, LOBBY_RELAY_PATH].includes(request.url) || request.headers.origin || sockets.clients.size >= ROOM_LIMIT * 3) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, wire => sockets.emit("connection", wire, request));
  });

  sockets.on("connection", (socket, request) => {
    const address = request.socket.remoteAddress || "unknown";
    const lobby = request.url === LOBBY_RELAY_PATH;
    let room;
    let role;
    let messageWindow = Date.now();
    let messageCount = 0;
    socket.isAlive = true;
    const handshake = setTimeout(() => socket.close(1008), 8000);
    handshake.unref();
    const peer = () => room[role === "host" ? "guest" : "host"];
    const error = (code) => {
      send(socket, { type: "error", code });
      socket.close(1008);
    };

    function attach(target, seatRole) {
      clearTimeout(handshake);
      room = target;
      role = seatRole;
      const seat = room[role] ||= { token: randomBytes(24).toString("base64url"), side: null, confirmed: false };
      const oldSocket = seat.socket;
      seat.socket = socket;
      oldSocket?.close(1008);
      send(socket, { type: "ready", code: room.code, role, token: seat.token, peerOnline: peer()?.socket?.readyState === WebSocket.OPEN, variant: room.variant });
      publishLobby(room);
      send(peer()?.socket, { type: "presence", online: true });
    }

    function changeLobby(message) {
      const { id, action, side } = message;
      if (!Number.isSafeInteger(id) || id < 1) return socket.close(1008);
      const reply = error => send(socket, { type: "reply", id, ok: !error, error });
      if (room.started) return reply("remoteRoomStarted");
      const seat = room[role];
      if (action === "select") {
        if (side !== null && side !== "r" && side !== "b") return reply("remoteBadSide");
        if (side && peer()?.side === side) return reply("remoteSeatTaken");
        if (seat.side !== side) {
          seat.side = side;
          seat.confirmed = false;
        }
      } else if (action === "confirm") {
        if (!seat.side || seat.side !== side) return reply("remoteChooseSeat");
        seat.confirmed = true;
      } else if (action === "start") {
        if (role !== "host" || !seat.confirmed || !room.guest?.confirmed || !seat.side || !room.guest.side
          || seat.side === room.guest.side || room.guest.socket?.readyState !== WebSocket.OPEN) return reply("remoteBothConfirm");
        room.started = true;
      } else return socket.close(1008);
      publishLobby(room);
      reply();
    }

    socket.on("pong", () => { socket.isAlive = true; });
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(handshake);
      if (!room || rooms.get(room.code) !== room || room[role].socket !== socket) return;
      room[role].socket = null;
      room[role].expiresAt = Date.now() + reconnectMs;
      send(peer()?.socket, { type: "presence", online: false });
      if (!room.started) publishLobby(room);
    });
    socket.on("message", (data, binary) => {
      const now = Date.now();
      if (now - messageWindow >= 1000) { messageWindow = now; messageCount = 0; }
      if (++messageCount > 32 || binary) return socket.close(1008);
      let message;
      try { message = JSON.parse(data.toString()); }
      catch { return socket.close(1007); }
      if (!message || typeof message.type !== "string") return socket.close(1008);

      if (room) {
        if (rooms.get(room.code) !== room || room[role].socket !== socket) return;
        if (message.type === "leave") return finish(room);
        if (room.lobby && message.type === "lobby-action") return changeLobby(message);
        if (!room.started) return socket.close(1008);
        const allowed = role === "host" ? ["position", "reply"] : ["action"];
        if (!allowed.includes(message.type)) return socket.close(1008);
        send(peer()?.socket, message);
        return;
      }

      sweep(now);
      if (message.type === "probe") {
        if (!mayConnect(address)) return error("remoteBusy");
        const target = hostedRoom && message.code === hostedRoom.code && rooms.get(hostedRoom.code);
        if (!target || target.lobby !== lobby || target.host?.socket?.readyState !== WebSocket.OPEN) return error("remoteRoomMissing");
        send(socket, { type: "probe-ready", code: target.code });
        return socket.close();
      }
      if (message.type === "create") {
        if (!mayConnect(address) || rooms.size >= ROOM_LIMIT) return error("remoteBusy");
        if (hostedRoom && (rooms.size || message.hostKey !== hostedRoom.key)) return error("remoteBusy");
        if (message.variant !== undefined && (!lobby || !ROOM_VARIANTS.has(message.variant))) return error("remoteUpdateRequired");
        let code = hostedRoom?.code;
        if (!code) {
          do { code = String(randomInt(10_000, 100_000)); } while (rooms.has(code));
        }
        const created = { code, host: null, guest: null, lobby, started: !lobby, variant: message.variant };
        rooms.set(code, created);
        return attach(created, "host");
      }

      const target = typeof message.code === "string" && ROOM_CODE.test(message.code) && rooms.get(message.code);
      if (message.type === "resume") {
        if (target?.lobby === lobby && typeof message.token === "string" && SESSION_TOKEN.test(message.token)) {
          const seatRole = ["host", "guest"].find(name => target[name]?.token === message.token);
          if (seatRole) {
            if (!supportsVariant(message, target.variant)) return error("remoteUpdateRequired");
            return attach(target, seatRole);
          }
        }
        if (!mayConnect(address)) return error("remoteBusy");
        return error("remoteRoomClosed");
      }
      if (message.type !== "join") return socket.close(1008);
      if (!mayConnect(address)) return error("remoteBusy");
      if (!target) return error("remoteRoomMissing");
      if (target.lobby !== lobby || !supportsVariant(message, target.variant)) return error("remoteUpdateRequired");
      if (target.guest) return error("remoteRoomFull");
      if (target.host.socket?.readyState !== WebSocket.OPEN) return error("remoteHostOffline");
      attach(target, "guest");
    });
  });

  const heartbeat = setInterval(() => {
    sweep(Date.now());
    for (const socket of sockets.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      if (socket.readyState !== WebSocket.OPEN) continue;
      socket.isAlive = false;
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  server.once("close", () => clearInterval(heartbeat));
  function close() {
    for (const room of rooms.values()) finish(room);
    for (const socket of sockets.clients) socket.close(1001);
    sockets.close();
    server.close();
  }
  return { server, sockets, close };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4174);
  const host = process.env.HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid relay PORT");
  const { server, sockets } = createRelayServer();
  server.listen(port, host, () => console.log(`NinePalace relay listening at ${host}:${server.address().port}${RELAY_PATH}`));
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      for (const socket of sockets.clients) socket.close(1001);
      server.close();
    });
  }
}

module.exports = { createRelayServer };
