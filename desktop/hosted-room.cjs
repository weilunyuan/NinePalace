const { randomBytes, randomInt } = require("node:crypto");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createRelayServer } = require("../relay/server.cjs");
const { connectRemoteRoom } = require("./remote-room.cjs");
const { remoteError } = require("./remote-protocol.cjs");
const { publicRoomAddress, startRoomTunnel } = require("./room-tunnel.cjs");

async function verifyPublicRoom(code, signal) {
  const address = `${publicRoomAddress(code)}/health`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    signal.throwIfAborted();
    try {
      const response = await fetch(address, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
      const reachable = response.ok && response.headers.get("x-ninepalace-room") === code;
      await response.body?.cancel();
      if (reachable) return;
    } catch { signal.throwIfAborted(); }
    await delay(400, undefined, { signal });
  }
  throw remoteError("remoteTunnelUnavailable");
}

async function createHostedRemoteRoom({ color, onState, signal }) {
  if (color !== "r" && color !== "b") throw remoteError("remoteBadSide");
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
      room = connectRemoteRoom({ url: `http://127.0.0.1:${port}`, color, hostKey: key, onState, onEnd: stop });
      await room.ready;
      tunnel = startRoomTunnel(code, port, signal, cancel);
      await tunnel.ready;
      await verifyPublicRoom(code, signal);
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
