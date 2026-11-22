const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { enginePaths } = require("../desktop/engine-config.cjs");
const castling = require("../desktop/palace-castling.js");
const { UciEngine } = require("../desktop/uci-engine.cjs");

const projectRoot = path.join(__dirname, "..");
const executable = enginePaths("fairy-stockfish", { projectRoot }).executable;

test("Fairy-Stockfish searches and evaluates Xiangqi with legal app-coordinate moves", {
  skip: process.platform !== "win32" || !fs.existsSync(executable),
}, async () => {
  const engine = new UciEngine("fairy-stockfish", { projectRoot });
  try {
    const game = new Xiangqi();
    const bestMove = await engine.search([], "beginner");
    assert.ok(game.moves().includes(bestMove), `engine returned illegal opening move ${bestMove}`);

    assert.ok(game.move("b2e2"));
    const evaluation = await engine.evaluatePosition(["b2e2"], 150);
    assert.ok(game.moves().includes(evaluation.bestMove), `engine returned illegal reply ${evaluation.bestMove}`);
    assert.equal(evaluation.principalVariation[0], evaluation.bestMove);
    for (const move of evaluation.principalVariation) {
      assert.ok(game.move(move), `engine PV contains illegal app-coordinate move ${move}`);
    }
  } finally {
    await engine.stop();
  }
});

test("Fairy-Stockfish searches transformed pieces and both sides of short castling", {
  skip: process.platform !== "win32" || !fs.existsSync(executable),
}, async () => {
  const engine = new UciEngine("fairy-stockfish", { projectRoot, gameVariant: castling.variant });
  const draw = [{ type: "m", r: "c0", b: "g9" }, { type: "q", r: "h2", b: "b7" }];
  const positions = [
    [undefined, "c0i6"],
    [undefined, "h2g1"],
    ["4k4/9/9/4p4/9/9/4P4/9/9/R3K3R r KQ - 0 1", "e0i0"],
    ["r3k3r/9/9/4p4/9/9/4P4/9/9/4K4 b kq - 0 1", "e9a9"],
  ];
  try {
    for (const [fen, expected] of positions) {
      const game = castling.game(draw, fen);
      assert.ok(game.moves().includes(expected));
      const bestMove = await engine.search([], "beginner", { fen: game.fen(), legalMoves: [expected] });
      assert.equal(bestMove, expected);
      assert.ok(game.move(bestMove));
    }
  } finally {
    await engine.stop();
  }
});
