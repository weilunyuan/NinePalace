const test = require("node:test");
const assert = require("node:assert/strict");
const { MATE_SCORE, parseEngineEvaluation, parseEngineScore, reviewGame, terminalEvaluation } = require("../desktop/game-analysis.cjs");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");

test("analysis score parser keeps the deepest MultiPV-1 score and handles mate scores", () => {
  assert.equal(parseEngineScore([
    "info depth 5 multipv 1 score cp 42 nodes 100 pv a0a1",
    "info depth 6 multipv 2 score cp 900 nodes 200 pv b0b1",
    "info depth 7 multipv 1 score cp -18 nodes 300 pv c0c1",
  ]), -18);
  assert.equal(parseEngineScore(["info depth 9 multipv 1 score mate -3 nodes 80 pv a0a1"]), -29997);
  assert.equal(parseEngineScore(["info depth 2 multipv 1 pv a0a1"]), null);
  assert.deepEqual(parseEngineEvaluation(["info depth 4 multipv 1 score cp 80 nodes 100 pv a0a1 b9b8 c0c1 d9d8 e0e1"]), {
    depth: 4,
    score: 80,
    principalVariation: ["a0a1", "b9b8", "c0c1", "d9d8"],
  });
});

test("review grades moves using the best move and the change in side-to-move evaluation", () => {
  const result = reviewGame(
    ["a0a1", "a9a8", "b0b1", "b9b7", "c0c2", "d9d8", "e0e1"],
    [
      { bestMove: "a0a1", score: 20, principalVariation: ["a0a1", "a9a8"] },
      { bestMove: "a9a8", score: 20 },
      { bestMove: "b0c2", score: 0 },
      { bestMove: "b9b8", score: 20 },
      { bestMove: "c0c1", score: 80 },
      { bestMove: "d9d7", score: 170 },
      { bestMove: "e0e1", score: 200 },
      { bestMove: null, score: -30000 },
    ],
  );
  assert.deepEqual(result.moves.map(({ quality, lossCp }) => [quality, lossCp]), [
    ["best", 0],
    ["best", 0],
    ["good", 20],
    ["inaccuracy", 100],
    ["mistake", 250],
    ["blunder", 370],
    ["best", 0],
  ]);
  assert.deepEqual(result.moves[0].continuation, ["a0a1", "a9a8"]);
  assert.deepEqual(result.summary, {
    total: 7,
    best: 3,
    good: 1,
    inaccuracy: 1,
    mistake: 1,
    blunder: 1,
    unknown: 0,
  });
});

test("missing engine evaluations are not presented as precise move grades", () => {
  const result = reviewGame(["a0a1"], [{ bestMove: "b0b1", score: null }, { bestMove: null, score: null }]);
  assert.equal(result.moves[0].quality, "unknown");
  assert.equal(result.moves[0].lossCp, null);
  assert.equal(result.summary.unknown, 1);
});

test("terminal positions score from the perspective of the side to move", () => {
  const game = new Xiangqi();
  assert.ok(game.move("b2e2"));
  assert.ok(game.move("b7e7"));
  assert.deepEqual(terminalEvaluation(game, null), null);
  assert.deepEqual(terminalEvaluation(game, { winner: "black" }), { bestMove: null, score: -MATE_SCORE });
  assert.deepEqual(terminalEvaluation(game, { winner: "red" }), { bestMove: null, score: MATE_SCORE });
  assert.deepEqual(terminalEvaluation(game, { winner: "draw" }), { bestMove: null, score: 0 });
});
