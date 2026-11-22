const { randomBytes, randomInt } = require("node:crypto");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { WebSocket } = require("ws");
const { createRelayServer } = require("../relay/server.cjs");
const { connectRemoteRoom } = require("./remote-room.cjs");
const { MAX_MESSAGE_BYTES, relayAddress, remoteError } = require("./remote-protocol.cjs");
const { publicRoomAddress, startRoomTunnel } = require("./room-tunnel.cjs");

async function verifyPublicRoom(code, lobby, signal) {
  const address = relayAddress(publicRoomAddress(code), lobby);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    signal.throwIfAborted();
    const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(2500)]);
    const wire = new WebSocket(address, { handshakeTimeout: 2200, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
    wire.on("error", () => {});
    try {
      await once(wire, "open", { signal: probeSignal });
      const reply = once(wire, "message", { signal: probeSignal });
      wire.send(JSON.stringify({ type: "probe", code }));
      const [raw, binary] = await reply;
      const result = binary ? null : JSON.parse(raw.toString());
      if (result?.type === "probe-ready" && result.code === code) return;
    } catch { signal.throwIfAborted(); }
    finally { wire.terminate(); }
    if (attempt < 5) await delay(400, undefined, { signal });
  }
  throw remoteError("remoteTunnelUnavailable");
}

async function createHostedRemoteRoom({ color, lobby = false, variant, onState, signal }) {
  if (!lobby && color !== "r" && color !== "b") throw remoteError("remoteBadSide");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    signal.throwIfAborted();
    const code = String(randomInt(10_000, 100_000));
    const key = randomBytes(24).toString("base64url");
    const relay = createRelayServer({ hostedRoom: { code, key } });
    let room, tunnel;
    let stopped = false;
    function stop() {
      if (stopped) return;
      stopped = true;
      // Send the room-ended message before releasing its public address.
      const timer = setTimeout(() => {
        for (const socket of relay.sockets.clients) socket.terminate();
        tunnel?.close();
      }, 1000);
      timer.unref();
      relay.sockets.once("close", () => {
        clearTimeout(timer);
        tunnel?.close();
      });
      relay.close();
    }
    const cancel = () => { room?.close(); stop(); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const listening = once(relay.server, "listening", { signal });
      relay.server.listen(0, "127.0.0.1");
      await listening;
      const port = relay.server.address().port;
      room = connectRemoteRoom({ url: `http://127.0.0.1:${port}`, color, lobby, variant, hostKey: key, onState, onEnd: stop });
      await room.ready;
      tunnel = startRoomTunnel(code, port, signal, cancel);
      await tunnel.ready;
      await verifyPublicRoom(code, lobby, signal);
      return room;
    } catch (error) {
      cancel();
      if (error.code !== "remoteTunnelNameTaken") throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
  throw remoteError("remoteBusy");
}

module.exports = { createHostedRemoteRoom };
