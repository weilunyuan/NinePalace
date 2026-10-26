const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendRooms } = require("../desktop/friend-rooms.cjs");
const { createWebServer } = require("../desktop/web-server.cjs");

test("friend rooms assign seats, enforce turns, resume sessions, and share state", () => {
  let serial = 0;
  const rooms = createFriendRooms({
    makeCode: () => `ROOM0${serial++}`,
    makeToken: () => `session-${serial++}`,
  });
  const host = rooms.create();
  assert.equal(host.state.phase, "waiting");
  assert.equal(host.state.playerColor, "r");

  const guest = rooms.join(host.roomCode);
  assert.equal(guest.state.phase, "playing");
  assert.equal(guest.state.playerColor, "b");
  assert.equal(rooms.join(host.roomCode, guest.token).resumed, true);
  assert.equal(rooms.getState(host.roomCode, host.token).players.black, true);

  assert.deepEqual(rooms.getLegalMoves(host.roomCode, guest.token, "b2"), []);
  assert.ok(rooms.getLegalMoves(host.roomCode, host.token, "b2").includes("b2e2"));
  assert.equal(rooms.submitMove(host.roomCode, guest.token, "b7b6").ok, false);

  let hostUpdate = null;
  const unsubscribe = rooms.subscribe(host.roomCode, host.token, (state) => { hostUpdate = state; });
  const moved = rooms.submitMove(host.roomCode, host.token, "b2e2");
  assert.equal(moved.ok, true);
  assert.equal(hostUpdate.turn, "b");
  assert.deepEqual(hostUpdate.history, ["b2e2"]);
  assert.equal(typeof hostUpdate.pgn, "string");
  assert.equal(rooms.getState(host.roomCode, guest.token).playerColor, "b");
  assert.throws(() => rooms.getState(host.roomCode, "invalid"), { statusCode: 403 });
  unsubscribe();

  assert.equal(rooms.resign(host.roomCode, guest.token).state.outcome.winner, "red");
  assert.equal(rooms.getState(host.roomCode, host.token).phase, "finished");
});

test("a black host reserves Black, the guest takes Red, and both seats survive reconnects", () => {
  const rooms = createFriendRooms();
  assert.throws(() => rooms.create("invalid"), { statusCode: 400 });
  const host = rooms.create("b");
  assert.equal(host.state.playerColor, "b");
  assert.deepEqual(host.state.players, { red: false, black: true });
  assert.equal(host.state.phase, "waiting");
  assert.deepEqual(rooms.getLegalMoves(host.roomCode, host.token, "b7"), []);
  assert.equal(rooms.submitMove(host.roomCode, host.token, "b7e7").ok, false);
  assert.throws(() => rooms.getState(host.roomCode, "invalid"), { statusCode: 403 });
  const guest = rooms.join(host.roomCode);
  assert.equal(guest.state.playerColor, "r");
  assert.deepEqual(guest.state.players, { red: true, black: true });
  assert.equal(guest.state.turn, "r");
  assert.throws(() => rooms.join(host.roomCode), { statusCode: 409 });
  assert.equal(rooms.submitMove(host.roomCode, host.token, "b7e7").ok, false);
  assert.ok(rooms.getLegalMoves(host.roomCode, guest.token, "b2").includes("b2e2"));
  assert.equal(rooms.submitMove(host.roomCode, guest.token, "b2e2").ok, true);
  assert.equal(rooms.submitMove(host.roomCode, host.token, "b7e7").ok, true);
  assert.equal(rooms.join(host.roomCode, host.token).state.playerColor, "b");
  assert.equal(rooms.join(host.roomCode, guest.token).state.playerColor, "r");
  assert.deepEqual(rooms.getState(host.roomCode, host.token).history, ["b2e2", "b7e7"]);
  assert.equal(rooms.resign(host.roomCode, host.token).state.outcome.winner, "red");
});

for (const hostColor of ["r", "b"]) test(`friend-room HTTP API protects sessions and streams updates with a ${hostColor} host`, async () => {
  const rooms = createFriendRooms();
  const server = createWebServer({
    api: {
      getState: () => ({ phase: "home" }),
      subscribe: () => () => {},
    },
    friendRooms: rooms,
    friendRoomsOnly: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body = {}, extraHeaders = {}) => fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });

  try {
    assert.equal((await post("/api/rooms", { playerColor: "invalid" })).status, 400);
    const createdResponse = await post("/api/rooms", { playerColor: hostColor });
    assert.equal(createdResponse.status, 201);
    const host = await createdResponse.json();
    assert.equal(host.state.playerColor, hostColor);
    const guestResponse = await post(`/api/rooms/${host.roomCode}/join`);
    assert.equal(guestResponse.status, 200);
    const guest = await guestResponse.json();
    const guestColor = hostColor === "r" ? "b" : "r";
    assert.equal(guest.state.playerColor, guestColor);
    const red = hostColor === "r" ? host : guest;
    const black = hostColor === "b" ? host : guest;

    const unauthorized = await fetch(`${baseUrl}/api/rooms/${host.roomCode}`);
    assert.equal(unauthorized.status, 401);
    const deniedOrigin = await fetch(`${baseUrl}/api/rooms/${host.roomCode}?token=${host.token}`, {
      headers: { Origin: "http://attacker.invalid" },
    });
    assert.equal(deniedOrigin.status, 403);

    const streamController = new AbortController();
    const streamResponse = await fetch(`${baseUrl}/api/rooms/${host.roomCode}/events?token=${guest.token}`, {
      signal: streamController.signal,
    });
    assert.equal(streamResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const reader = streamResponse.body.getReader();
    const firstEvent = new TextDecoder().decode((await reader.read()).value);
    assert.equal(JSON.parse(firstEvent.slice("data: ".length).trim()).playerColor, guestColor);

    const wrongTurn = await post(`/api/rooms/${host.roomCode}/move`, { token: black.token, move: "b7b6" });
    assert.equal((await wrongTurn.json()).ok, false);
    const accepted = await post(`/api/rooms/${host.roomCode}/move`, { token: red.token, move: "b2e2" });
    assert.equal((await accepted.json()).ok, true);
    const update = new TextDecoder().decode((await reader.read()).value);
    assert.match(update, /"history":\["b2e2"\]/);

    const resumed = await post(`/api/rooms/${host.roomCode}/join`, { token: guest.token });
    assert.equal((await resumed.json()).resumed, true);
    streamController.abort();
    await reader.cancel().catch(() => {});
    assert.equal((await fetch(`${baseUrl}/api/state`)).status, 404);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
