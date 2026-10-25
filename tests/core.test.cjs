const test = require("node:test");
const assert = require("node:assert/strict");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { resolveGameResult } = require("../desktop/game-rules.cjs");

test("initial position exposes the expected legal moves", () => {
  const game = new Xiangqi();
  assert.equal(game.moves().length, 44);
  assert.equal(game.turn(), "r");
});

test("illegal moves are rejected and legal history is replayable", () => {
  const game = new Xiangqi();
  assert.equal(game.move("b0b1"), null);
  assert.ok(game.move("b2e2"));
  assert.ok(game.move("b7e7"));
  assert.deepEqual(game.history(), ["b2e2", "b7e7"]);
  assert.equal(game.turn(), "r");
});

test("undoing a complete human/engine turn returns to the player's move", () => {
  const game = new Xiangqi();
  game.move("b2e2");
  game.move("b7e7");
  game.undo();
  game.undo();
  assert.equal(game.history().length, 0);
  assert.equal(game.turn(), "r");
});

test("checkmate is a loss for the side that has no legal move", () => {
  const game = new Xiangqi();
  game.load("4k4/9/9/9/9/9/9/9/4Ar3/2r1K4 r - - 0 7");
  assert.equal(game.in_checkmate(), true);
  assert.deepEqual(resolveGameResult(game), { winner: "black", reason: "将死" });
});

test("Xiangqi stalemate is also a loss, not a draw", () => {
  const game = new Xiangqi();
  game.load("4k4/4a4/9/9/9/9/9/9/3r1r3/4K4 r - - 0 2");
  assert.equal(game.in_stalemate(), true);
  assert.deepEqual(resolveGameResult(game), { winner: "black", reason: "无棋可走" });
});

test("simplified draw conditions remain separate from no-legal-move results", () => {
  const game = new Xiangqi();
  game.load("4k4/4a4/9/9/9/9/9/9/9/4K4 r - - 0 1");
  assert.deepEqual(resolveGameResult(game), { winner: "draw", reason: "达到本地原型的和棋条件" });
});
