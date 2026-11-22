const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: pause } = require("node:timers/promises");
const { WebSocket } = require("ws");
const { createRelayServer } = require("../relay/server.cjs");
const { connectRemoteRoom } = require("../desktop/remote-room.cjs");
const { relayAddress } = require("../desktop/remote-protocol.cjs");
const castling = require("../desktop/palace-castling.js");
const jieqi = require("../desktop/jieqi.js");

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
    const probe = new WebSocket(relayAddress(base));
    await once(probe, "open");
    const probeReply = once(probe, "message");
    probe.send(JSON.stringify({ type: "probe", code }));
    assert.deepEqual(JSON.parse((await probeReply)[0]), { type: "probe-ready", code });
    probe.close();
    await assert.rejects(connect({ color: "r", hostKey: key }).ready, { code: "remoteBusy" });
    assert.equal((await connect({ code }).ready).playerColor, "r");
  }, { hostedRoom: { code, key } });
});

test("both players reserve different remote seats and confirm before only the host can start", { timeout: 12000 }, () => withRelay(async ({ connect, sockets }) => {
  const host = connect({ lobby: true });
  const { roomCode, lobby: waiting } = await host.ready;
  assert.equal(waiting.host.side, null);
  assert.equal(waiting.guest.side, null);
  assert.equal((await host.lobbyAction("start")).error, "remoteBothConfirm");
  await assert.rejects(connect({ code: roomCode }).ready, { code: "remoteUpdateRequired" });

  const guest = connect({ code: roomCode, lobby: true });
  assert.equal((await guest.ready).phase, "waiting");
  assert.equal((await guest.lobbyAction("confirm", "r")).error, "remoteChooseSeat");
  const competing = await Promise.all([host.lobbyAction("select", "r"), guest.lobbyAction("select", "r")]);
  assert.equal(competing.filter(result => result.ok).length, 1);
  assert.equal(competing.find(result => !result.ok).error, "remoteSeatTaken");

  assert.equal((await host.lobbyAction("select", "b")).ok, true);
  assert.equal((await guest.lobbyAction("select", "r")).ok, true);
  assert.equal((await host.lobbyAction("confirm", "b")).ok, true);
  assert.equal((await host.lobbyAction("select", null)).ok, true);
  assert.equal(host.getState().lobby.host.confirmed, false);
  assert.equal((await host.lobbyAction("select", "b")).ok, true);
  assert.equal((await host.lobbyAction("confirm", "b")).ok, true);
  assert.equal((await guest.submitMove("b2e2")).ok, false);
  assert.equal((await host.lobbyAction("start")).error, "remoteBothConfirm");

  const wires = [...sockets.clients].filter(wire => wire.readyState === WebSocket.OPEN);
  assert.equal(wires.length, 2);
  wires[1].terminate();
  await waitFor(() => !host.getState().lobby.guest.online, "host did not see the seat disconnect");
  await waitFor(() => host.getState().lobby.guest.online && !guest.getState().connection, "guest did not reconnect to the lobby");
  assert.equal(guest.getState().lobby.guest.side, "r");
  assert.equal(guest.getState().lobby.host.confirmed, true);

  assert.equal((await guest.lobbyAction("confirm", "r")).ok, true);
  assert.equal((await guest.lobbyAction("start")).error, "remoteBothConfirm");
  assert.equal((await host.lobbyAction("start")).ok, true);
  await waitFor(() => guest.getState().phase === "playing", "host start did not open both boards");
  assert.equal(host.getState().playerColor, "b");
  assert.equal(guest.getState().playerColor, "r");
  assert.equal(guest.getState().turn, "r");
  assert.equal((await guest.submitMove("b2e2")).ok, true);
  assert.equal(host.submitMove("b7e7").ok, true);
  await waitFor(() => guest.getState().history.length === 2, "moves did not sync after seat confirmation");
  assert.equal(host.getState().finalFen, guest.getState().finalFen);
}));

test("a remote castling room shares a single opening draw, replays a castle and resumes the same position", { timeout: 12000 }, () => withRelay(async ({ base, connect, sockets }) => {
  const host = connect({ lobby: true, variant: castling.variant });
  const { roomCode } = await host.ready;
  assert.equal(host.getState().variant, castling.variant);
  assert.equal(host.getState().draw, undefined);

  const legacy = new WebSocket(relayAddress(base, true));
  await once(legacy, "open");
  const reply = once(legacy, "message");
  legacy.send(JSON.stringify({ type: "join", code: roomCode, supportsCastling: true }));
  assert.deepEqual(JSON.parse((await reply)[0]), { type: "error", code: "remoteUpdateRequired" });
  legacy.close();

  const guest = connect({ code: roomCode, lobby: true });
  assert.equal((await guest.ready).variant, castling.variant);
  assert.equal((await host.lobbyAction("select", "b")).ok, true);
  assert.equal((await guest.lobbyAction("select", "r")).ok, true);
  assert.equal((await host.lobbyAction("confirm", "b")).ok, true);
  assert.equal((await guest.lobbyAction("confirm", "r")).ok, true);
  assert.equal((await host.lobbyAction("start")).ok, true);
  await waitFor(() => guest.getState().phase === "playing", "variant game never started");
  const draw = host.getState().draw;
  assert.ok(castling.validDraw(draw));
  assert.deepEqual(guest.getState().draw, draw);
  assert.equal(host.getState().finalFen, castling.game(draw).fen());

  const line = ["h0g2", "a6a5", "g0i2", "c6c5", "f0e1", "g6g5", "e0i0"];
  for (const [index, move] of line.entries()) {
    const currentPlayer = index % 2 ? host : guest;
    assert.ok(currentPlayer.getLegalMoves(move.slice(0, 2)).includes(move), move);
    assert.equal((await currentPlayer.submitMove(move)).ok, true);
    await waitFor(() => [host, guest].every(room => room.getState().history.length === index + 1), `move ${move} did not sync`);
  }
  assert.deepEqual(host.getState().board[9].slice(4, 6).map(piece => piece.type), ["r", "k"]);
  assert.equal(guest.getState().finalFen, host.getState().finalFen);
  assert.equal(guest.getState().board[9][8], null);

  const active = [...sockets.clients].filter(wire => wire.readyState === WebSocket.OPEN);
  active.at(-1).terminate();
  await waitFor(() => host.getState().connection === "reconnecting", "host did not notice disconnect");
  await waitFor(() => !host.getState().connection && !guest.getState().connection, "variant room did not reconnect");
  assert.deepEqual(guest.getState().draw, draw);
  assert.equal(guest.getState().finalFen, host.getState().finalFen);
  assert.deepEqual(guest.getState().history, line);
  assert.equal((await host.resign()).ok, true);
  await waitFor(() => guest.getState().phase === "finished", "variant resignation did not sync");
  assert.equal(guest.getState().outcome.winner, "red");
}));

test("remote Jieqi reveals moving pieces to both seats and captured faces only to the capturing seat", { timeout: 12000 }, () => withRelay(async ({ connect, sockets }) => {
  const host = connect({ lobby: true, variant: jieqi.variant });
  const guest = connect({ lobby: true, code: (await host.ready).roomCode });
  assert.equal((await guest.ready).variant, jieqi.variant);
  for (const [seat, action, side] of [[host, "select", "r"], [guest, "select", "b"], [host, "confirm", "r"], [guest, "confirm", "b"], [host, "start"]]) {
    assert.equal((await seat.lobbyAction(action, side)).ok, true);
  }
  await waitFor(() => guest.getState().phase === "playing", "Jieqi did not start");
  assert.equal(guest.getState().board.flat().filter(piece => piece?.covered).length, 30);
  assert.deepEqual(host.getState().jieqiLog, []);
  assert.deepEqual(guest.getState().jieqiLog, []);
  assert.ok(host.submitMove("b2b9").ok);
  await waitFor(() => guest.getState().history.length === 1, "first reveal did not sync");
  const hostCapture = host.getState().jieqiLog[0];
  assert.match(hostCapture, /^[abnrcp]{2}$/);
  assert.equal(guest.getState().jieqiLog[0], `${hostCapture[0]}-`);
  assert.ok((await guest.submitMove("h7h0")).ok);
  await waitFor(() => host.getState().history.length === 2 && guest.getState().history.length === 2, "second reveal did not sync");
  const guestCapture = guest.getState().jieqiLog[1];
  assert.match(guestCapture, /^[abnrcp]{2}$/);
  assert.equal(host.getState().jieqiLog[1], `${guestCapture[0]}-`);
  assert.deepEqual(host.getState().board, guest.getState().board);
  const visibleLog = guest.getState().jieqiLog;
  [...sockets.clients].at(-1).terminate();
  await waitFor(() => host.getState().connection === "reconnecting", "host did not see break in connection");
  await waitFor(() => !guest.getState().connection && !host.getState().connection, "Jieqi did not reconnect");
  assert.deepEqual(guest.getState().jieqiLog, visibleLog);
  assert.equal(guest.getState().finalFen, host.getState().finalFen);
}));
