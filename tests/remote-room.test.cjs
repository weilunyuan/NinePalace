const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: pause } = require("node:timers/promises");
const { WebSocket } = require("ws");
const { createRelayServer } = require("../relay/server.cjs");
const { connectRemoteRoom } = require("../desktop/remote-room.cjs");
const { relayAddress } = require("../desktop/remote-protocol.cjs");

async function withRelay(run, options) {
  const { server, sockets } = createRelayServer(options);
  const clients = [];
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const connect = options => {
    const room = connectRemoteRoom({ url: base, ...options });
    clients.push(room);
    return room;
  };
  try { await run({ base, connect, sockets }); }
  finally {
    for (const room of clients) room.close();
    for (const wire of sockets.clients) wire.terminate();
    await new Promise(resolve => server.close(resolve));
    sockets.close();
  }
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 2500;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, label);
    await pause(20);
  }
}

test("five-digit rooms pair two clients and keep the host authoritative through a reconnect", { timeout: 12_000 }, () => withRelay(async ({ base, connect, sockets }) => {
  assert.equal(await (await fetch(`${base}/health`)).text(), "NinePalace relay v1\n");
  assert.throws(() => relayAddress("http://example.com"), { code: "remoteBadRelay" });
  assert.equal(relayAddress("https://example.com"), "wss://example.com/ninepalace/v1");
  assert.throws(() => connect({ code: "1234" }), { code: "remoteBadCode" });
  const host = connect({ color: "b" });
  const waiting = await host.ready;
  assert.match(waiting.roomCode, /^[1-9][0-9]{4}$/);
  const code = waiting.roomCode;
  assert.equal(waiting.phase, "waiting");
  assert.equal(waiting.playerColor, "b");
  assert.equal(waiting.remote, true);
  await assert.rejects(connect({ code: code === "10000" ? "10001" : "10000" }).ready, { code: "remoteRoomMissing" });

  const guest = connect({ code });
  const joined = await guest.ready;
  assert.equal(joined.playerColor, "r");
  assert.equal(joined.turn, "r");
  assert.equal(host.getState().phase, "playing");
  await assert.rejects(connect({ code }).ready, { code: "remoteRoomFull" });
  assert.equal((await host.submitMove("b7e7")).ok, false);
  assert.equal((await guest.submitMove("b2b2")).ok, false);
  assert.ok(guest.getLegalMoves("b2").includes("b2e2"));
  assert.equal((await guest.submitMove("b2e2")).ok, true);
  assert.equal(host.submitMove("b7e7").ok, true);
  await waitFor(() => guest.getState().history.length === 2, "host move did not reach the guest");
  assert.equal(guest.getState().finalFen, host.getState().finalFen);

  const oldSockets = [...sockets.clients].filter(wire => wire.readyState === WebSocket.OPEN);
  assert.equal(oldSockets.length, 2);
  oldSockets[0].terminate();
  await waitFor(() => guest.getState().connection === "reconnecting", "guest did not see host disconnect");
  assert.equal((await guest.submitMove("b0c2")).ok, false);
  await waitFor(() => !guest.getState().connection && !host.getState().connection, "the game did not reconnect");
  assert.deepEqual(guest.getState().history, ["b2e2", "b7e7"]);
  assert.equal(guest.getState().roomCode, code);
  assert.equal(host.getState().playerColor, "b");
  assert.equal((await guest.submitMove("b0c2")).ok, true);
  assert.equal((await guest.resign()).ok, true);
  assert.equal(host.getState().outcome.winner, "black");
  assert.deepEqual(guest.getState().outcome, host.getState().outcome);
  host.close();
  await waitFor(() => guest.getState().connection === "closed", "guest did not see the room close");
  await assert.rejects(connect({ code }).ready, { code: "remoteRoomMissing" });
}));

test("a guest discards a host snapshot containing illegal or malformed moves", { timeout: 5000 }, () => withRelay(async ({ base, connect }) => {
  const host = new WebSocket(relayAddress(base));
  try {
    await once(host, "open");
    const registration = once(host, "message");
    host.send(JSON.stringify({ type: "create" }));
    const ready = JSON.parse((await registration)[0].toString());
    assert.match(ready.code, /^[1-9][0-9]{4}$/);
    const guestArrival = once(host, "message");
    const guest = connect({ code: ready.code });
    const rejected = assert.rejects(guest.ready, { code: "remoteBadState" });
    await guestArrival;
    host.send(JSON.stringify({ type: "position", color: "b", moves: ["a0a9"], resigned: null }));
    await rejected;
    assert.equal(guest.getState(), undefined);
  } finally { host.close(); }
}));

test("an automatic relay only opens its assigned room for the local host", { timeout: 5000 }, () => {
  const code = "52843";
  const key = "test-only-host-key";
  return withRelay(async ({ base, connect }) => {
    assert.equal((await fetch(`${base}/health`)).headers.get("x-ninepalace-room"), code);
    await assert.rejects(connect({ color: "r" }).ready, { code: "remoteBusy" });
    const host = connect({ color: "b", hostKey: key });
    assert.equal((await host.ready).roomCode, code);
    await assert.rejects(connect({ color: "r", hostKey: key }).ready, { code: "remoteBusy" });
    assert.equal((await connect({ code }).ready).playerColor, "r");
  }, { hostedRoom: { code, key } });
});
