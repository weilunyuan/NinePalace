const { createServer } = require("node:http");
const { randomInt, randomBytes } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");
const { RELAY_PATH, ROOM_CODE, SESSION_TOKEN, MAX_MESSAGE_BYTES, RECONNECT_MS } = require("../desktop/remote-protocol.cjs");

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
    if (request.url !== RELAY_PATH || request.headers.origin || sockets.clients.size >= ROOM_LIMIT * 3) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, wire => sockets.emit("connection", wire, request));
  });

  sockets.on("connection", (socket, request) => {
    const address = request.socket.remoteAddress || "unknown";
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
      const seat = room[role] ||= { token: randomBytes(24).toString("base64url") };
      const oldSocket = seat.socket;
      seat.socket = socket;
      oldSocket?.close(1008);
      send(socket, { type: "ready", code: room.code, role, token: seat.token, peerOnline: peer()?.socket?.readyState === WebSocket.OPEN });
      send(peer()?.socket, { type: "presence", online: true });
    }

    socket.on("pong", () => { socket.isAlive = true; });
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(handshake);
      if (!room || rooms.get(room.code) !== room || room[role].socket !== socket) return;
      room[role].socket = null;
      room[role].expiresAt = Date.now() + reconnectMs;
      send(peer()?.socket, { type: "presence", online: false });
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
        const allowed = role === "host" ? ["position", "reply"] : ["action"];
        if (!allowed.includes(message.type)) return socket.close(1008);
        send(peer()?.socket, message);
        return;
      }

      sweep(now);
      if (message.type === "create") {
        if (!mayConnect(address) || rooms.size >= ROOM_LIMIT) return error("remoteBusy");
        if (hostedRoom && (rooms.size || message.hostKey !== hostedRoom.key)) return error("remoteBusy");
        let code = hostedRoom?.code;
        if (!code) {
          do { code = String(randomInt(10_000, 100_000)); } while (rooms.has(code));
        }
        const created = { code, host: null, guest: null };
        rooms.set(code, created);
        return attach(created, "host");
      }

      const target = typeof message.code === "string" && ROOM_CODE.test(message.code) && rooms.get(message.code);
      if (message.type === "resume") {
        if (target && typeof message.token === "string" && SESSION_TOKEN.test(message.token)) {
          const seatRole = ["host", "guest"].find(name => target[name]?.token === message.token);
          if (seatRole) return attach(target, seatRole);
        }
        if (!mayConnect(address)) return error("remoteBusy");
        return error("remoteRoomClosed");
      }
      if (message.type !== "join") return socket.close(1008);
      if (!mayConnect(address)) return error("remoteBusy");
      if (!target) return error("remoteRoomMissing");
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
