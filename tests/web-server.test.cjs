const test = require("node:test");
const assert = require("node:assert/strict");
const { createWebServer } = require("../desktop/web-server.cjs");

test("local web server serves the PWA shell and same-origin game API", async () => {
  let state = {
    board: [], turn: "r", history: [], phase: "home", status: "Ready",
    thinking: false, outcome: null, engineFailure: false, inCheck: false,
  };
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(state));
  let submittedMove = null;
  let retriedDifficulty = null;
  let analyzedMoves = null;
  let startedEngineId = null;
  let analyzedEngineId = null;
  const api = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async startGame(engineId) {
      startedEngineId = engineId;
      state = { ...state, phase: "playing", status: "Playing" };
      publish();
      return state;
    },
    getLegalMoves: (square) => square === "b2" ? ["b2e2"] : [],
    submitMove: async (move, difficulty) => {
      submittedMove = { move, difficulty };
      return { ok: move === "b2e2" };
    },
    undo: async () => ({ ok: true }),
    resign: async () => ({ ok: true }),
    retryEngine: async (difficulty) => {
      retriedDifficulty = difficulty;
      return { ok: true };
    },
    analyzeGame: async (moves, _onProgress, engineId) => {
      analyzedMoves = moves;
      analyzedEngineId = engineId;
      return { moves: moves.map((move) => ({ move, bestMove: move, quality: "best", lossCp: 0 })) };
    },
  };
  const server = createWebServer({ api });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const shell = await fetch(`${baseUrl}/`);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /rel="manifest"/);

    const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));

    const worker = await fetch(`${baseUrl}/service-worker.js`);
    assert.equal(worker.status, 200);
    assert.match(await worker.text(), /ninepalace-shell-v24/);
    const lobbyStyles = await fetch(`${baseUrl}/lobby.css`);
    assert.equal(lobbyStyles.status, 200);
    assert.match(lobbyStyles.headers.get("content-type"), /text\/css/);
    const matchStyles = await fetch(`${baseUrl}/match.css`);
    assert.equal(matchStyles.status, 200);
    assert.match(matchStyles.headers.get("content-type"), /text\/css/);
    assert.equal((await fetch(`${baseUrl}/settings.js`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/chinese-notation.js`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/character-select.js`)).status, 200);
    for (const character of ["red-rook-girl", "red-horse-girl", "black-rook-loli", "black-horse-loli"]) {
      const portrait = await fetch(`${baseUrl}/assets/ninepalace-${character}.png`);
      assert.equal(portrait.status, 200, `${character} portrait should be served`);
      assert.equal(portrait.headers.get("content-type"), "image/png");
    }
    for (const character of ["red-rook", "red-horse", "black-rook", "black-horse"]) {
      const hand = await fetch(`${baseUrl}/assets/ninepalace-hand-${character}.png`);
      assert.equal(hand.status, 200, `${character} hand atlas should be served`);
      assert.equal(hand.headers.get("content-type"), "image/png");
      const png = new Uint8Array(await hand.arrayBuffer());
      assert.equal(png[25], 6, "Painted hand atlases must retain alpha transparency");
    }

    const initial = await fetch(`${baseUrl}/api/state`);
    assert.equal((await initial.json()).phase, "home");

    const blocked = await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { Origin: "http://attacker.invalid", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(blocked.status, 403);

    const wrongContentType = await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    assert.equal(wrongContentType.status, 415);

    const started = await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engineId: "fairy-stockfish" }),
    });
    assert.equal((await started.json()).phase, "playing");
    assert.equal(startedEngineId, "fairy-stockfish");

    const legalMoves = await fetch(`${baseUrl}/api/legal-moves?square=b2`);
    assert.deepEqual(await legalMoves.json(), ["b2e2"]);

    const streamController = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events`, { signal: streamController.signal });
    assert.equal(stream.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const firstEvent = await stream.body.getReader().read();
    assert.match(new TextDecoder().decode(firstEvent.value), /"phase":"playing"/);
    streamController.abort();

    const moved = await fetch(`${baseUrl}/api/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: "b2e2", difficulty: "easy" }),
    });
    assert.equal((await moved.json()).ok, true);
    assert.deepEqual(submittedMove, { move: "b2e2", difficulty: "easy" });

    const retried = await fetch(`${baseUrl}/api/retry-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty: "strong" }),
    });
    assert.equal((await retried.json()).ok, true);
    assert.equal(retriedDifficulty, "strong");

    const analyzed = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves: ["b2e2"], engineId: "fairy-stockfish" }),
    });
    assert.equal(analyzed.status, 200);
    assert.deepEqual(analyzedMoves, ["b2e2"]);
    assert.equal(analyzedEngineId, "fairy-stockfish");
    assert.deepEqual((await analyzed.json()).moves[0], { move: "b2e2", bestMove: "b2e2", quality: "best", lossCp: 0 });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
