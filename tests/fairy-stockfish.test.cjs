const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { enginePaths } = require("../desktop/engine-config.cjs");
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
