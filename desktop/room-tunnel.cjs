const { connect: connectLocal } = require("node:net");
const { connect: connectTls } = require("node:tls");
const { setTimeout: delay } = require("node:timers/promises");
const { ROOM_CODE, RECONNECT_MS, remoteError } = require("./remote-protocol.cjs");

const PROVIDER = "viaduct.sh";
const FRAME_LIMIT = 16 * 1024;

function publicRoomAddress(code) {
  if (typeof code !== "string" || !ROOM_CODE.test(code)) throw remoteError("remoteBadCode");
  return `https://ninepalace-${code}.${PROVIDER}`;
}

function dialTunnel(signal) {
  const socket = connectTls({ host: PROVIDER, servername: PROVIDER, port: 4443, rejectUnauthorized: true });
  const destroy = () => socket.destroy();
  socket.setKeepAlive(true, 20_000);
  socket.setTimeout(8000, destroy);
  socket.on("error", destroy);
  signal.addEventListener("abort", destroy, { once: true });
  socket.once("close", () => signal.removeEventListener("abort", destroy));
  return socket;
}

function sendFrame(socket, message) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  socket.write(Buffer.concat([header, body]));
}

// Viaduct uses length-prefixed JSON on the control connection and a byte stream
// on assigned data connections. Only the room's loopback relay receives traffic.
async function registerTunnel(hostname, port, signal, registered) {
  const subdomain = hostname.split(".")[0];
  const session = new AbortController();
  const lifetime = AbortSignal.any([signal, session.signal]);
  const control = dialTunnel(lifetime);
  const { promise: accepted, resolve, reject } = Promise.withResolvers();
  const closed = new Promise(resolveClose => control.once("close", () => {
    session.abort();
    reject(remoteError("remoteTunnelUnavailable"));
    resolveClose();
  }));
  let buffer = Buffer.alloc(0);
  let token;
  control.once("secureConnect", () => sendFrame(control, { type: "hello", name: subdomain, local_port: port }));
  control.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32BE(0);
      if (!size || size > FRAME_LIMIT) return control.destroy();
      if (buffer.length < size + 4) return;
      let frame;
      try { frame = JSON.parse(buffer.subarray(4, size + 4).toString()); }
      catch { return control.destroy(); }
      buffer = buffer.subarray(size + 4);
      if (frame?.type === "ping") {
        sendFrame(control, { type: "pong" });
      } else if (!token) {
        if (frame?.type === "error") {
          const code = frame.reason === "name_taken" ? "remoteTunnelNameTaken"
            : frame.reason === "ip_tunnel_limit" ? "remoteBusy" : "remoteTunnelUnavailable";
          return reject(remoteError(code));
        }
        if (frame?.type !== "ok" || frame.hostname !== hostname || typeof frame.token !== "string"
          || !/^[a-f0-9]{32}$/.test(frame.token)) {
          return control.destroy();
        }
        token = frame.token;
        control.setTimeout(48_000);
        resolve();
      }
    }
  });
  try {
    await accepted;
    lifetime.throwIfAborted();
    const hello = { type: "data_hello", subdomain, token };
    // One active guest plus enough spare connections for probes and reconnects.
    for (let slot = 0; slot < 4; slot += 1) {
      void keepDataSlot(port, hello, lifetime).catch(() => control.destroy());
    }
    registered();
    await closed;
  } finally {
    session.abort();
  }
}

async function keepDataSlot(port, hello, signal) {
  try {
    while (!signal.aborted) {
      const wire = dialTunnel(signal);
      let local;
      wire.once("secureConnect", () => {
        sendFrame(wire, hello);
        wire.setTimeout(0);
      });
      wire.once("data", first => {
        local = connectLocal(port, "127.0.0.1");
        local.once("error", () => wire.destroy());
        local.once("close", () => wire.destroy());
        local.write(first);
        wire.pipe(local).pipe(wire);
      });
      await new Promise(resolve => wire.once("close", resolve));
      local?.destroy();
      await delay(500, undefined, { signal, ref: false });
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

function startRoomTunnel(code, port, signal, onUnavailable) {
  const hostname = new URL(publicRoomAddress(code)).hostname;
  const controller = new AbortController();
  const lifetime = AbortSignal.any([signal, controller.signal]);
  const { promise: ready, resolve, reject } = Promise.withResolvers();
  let connected = false;
  let retryUntil = 0;

  async function maintain() {
    while (!lifetime.aborted) {
      try {
        await registerTunnel(hostname, port, lifetime, () => {
          connected = true;
          retryUntil = 0;
          resolve();
        });
      } catch (error) {
        if (!connected) throw error;
      }
      if (lifetime.aborted) break;
      retryUntil ||= Date.now() + RECONNECT_MS;
      if (Date.now() >= retryUntil) return onUnavailable();
      await delay(1000, undefined, { signal: lifetime, ref: false });
    }
    lifetime.throwIfAborted();
  }

  void maintain().catch(reject);
  return { ready, close: () => controller.abort() };
}

module.exports = { publicRoomAddress, startRoomTunnel };
