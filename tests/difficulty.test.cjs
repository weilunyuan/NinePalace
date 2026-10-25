const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_DIFFICULTY,
  SEARCH_COMMANDS,
  candidateMovesFromInfo,
  chooseCandidateMove,
  normalizeDifficulty,
  searchCommandFor,
  searchProfileFor,
} = require("../desktop/difficulty.cjs");

test("default and invalid difficulty are safely limited to beginner search", () => {
  assert.equal(DEFAULT_DIFFICULTY, "beginner");
  assert.equal(normalizeDifficulty(undefined), "beginner");
  assert.equal(normalizeDifficulty("go infinite"), "beginner");
  assert.equal(searchCommandFor("unknown"), "go movetime 250");
});

test("each difficulty has a distinct search budget and deliberate strength profile", () => {
  assert.deepEqual(SEARCH_COMMANDS, {
    beginner: "go movetime 250",
    easy: "go movetime 400",
    normal: "go movetime 900",
    strong: "go movetime 2000",
  });
  assert.equal(searchCommandFor("beginner"), "go movetime 250");
  assert.equal(searchCommandFor("easy"), "go movetime 400");
  assert.equal(searchCommandFor("normal"), "go movetime 900");
  assert.equal(searchCommandFor("strong"), "go movetime 2000");
  assert.deepEqual(searchProfileFor("beginner").pickFrom, [4, 6]);
  assert.deepEqual(searchProfileFor("easy").pickFrom, [2, 4]);
  assert.equal(searchProfileFor("beginner").multiPv, 6);
  assert.equal(searchProfileFor("easy").multiPv, 4);
  assert.equal(searchProfileFor("normal").multiPv, 1);
  assert.equal(searchProfileFor("strong").multiPv, 1);
});

test("low difficulty samples weaker moves from Pikafish MultiPV results", () => {
  const info = [
    "info depth 4 multipv 1 score cp 120 nodes 120 pv a0a1",
    "info depth 4 multipv 2 score cp 90 nodes 120 pv b0b1",
    "info depth 4 multipv 3 score cp 70 nodes 120 pv c0c1",
    "info depth 4 multipv 4 score cp 30 nodes 120 pv d0d1",
    "info depth 4 multipv 5 score cp -10 nodes 120 pv e0e1",
    "info depth 4 multipv 6 score cp -80 nodes 120 pv f0f1",
    "info depth 5 multipv 1 score cp 130 nodes 180 pv a0a2",
    "info depth 5 multipv 2 score cp 100 nodes 180 pv b0b2",
  ];
  const candidates = candidateMovesFromInfo(info, "beginner");
  assert.deepEqual(candidates, [
    { rank: 1, move: "a0a1" },
    { rank: 2, move: "b0b1" },
    { rank: 3, move: "c0c1" },
    { rank: 4, move: "d0d1" },
    { rank: 5, move: "e0e1" },
    { rank: 6, move: "f0f1" },
  ]);
  assert.equal(chooseCandidateMove(candidates, "beginner", () => 0), "d0d1");
  assert.equal(chooseCandidateMove(candidates, "beginner", () => 0.99), "f0f1");
  assert.equal(chooseCandidateMove(candidates, "easy", () => 0), "b0b1");
  assert.equal(chooseCandidateMove(candidates, "easy", () => 0.99), "d0d1");
});

test("a shallow or incomplete MultiPV result still returns the weakest available alternative", () => {
  const candidates = candidateMovesFromInfo([
    "info depth 1 multipv 1 score cp 10 nodes 1 pv a0a1",
    "info depth 1 multipv 2 score cp 0 nodes 1 pv b0b1",
  ], "beginner");
  assert.equal(chooseCandidateMove(candidates, "beginner", () => 0), "b0b1");
  assert.equal(chooseCandidateMove([{ rank: 1, move: "a0a1" }], "beginner"), "a0a1");
});
