const test = require("node:test");
const assert = require("node:assert/strict");
const { formatMove } = require("../desktop/chinese-notation.js");

test("red moves use Chinese numerals and traditional Xiangqi move verbs", () => {
  assert.equal(formatMove("h2e2", "r", "c", []), "炮二平五");
  assert.equal(formatMove("a0a1", "r", "r", []), "车九进一");
  assert.equal(formatMove("b2b5", "r", "c", []), "炮八进三");
  assert.equal(formatMove("e5e2", "r", "n", []), "马五退三");
  assert.equal(formatMove("e5f7", "r", "n", []), "马五进四");
});

test("black moves use the black-side file numbering and Arabic numerals", () => {
  assert.equal(formatMove("b7e7", "b", "c", []), "炮2平5");
  assert.equal(formatMove("a9a8", "b", "r", []), "车1进1");
  assert.equal(formatMove("e4e7", "b", "n", []), "马5退3");
});

test("same-file pieces are disambiguated by their order from the player's side", () => {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  board[4][4] = { color: "r", type: "p" };
  board[7][4] = { color: "r", type: "p" };
  board[2][4] = { color: "b", type: "p" };
  board[5][4] = { color: "b", type: "p" };
  assert.equal(formatMove("e5e6", "r", "p", board), "前兵进一");
  assert.equal(formatMove("e2e3", "r", "p", board), "后兵进一");
  assert.equal(formatMove("e7e6", "b", "p", board), "后卒进1");
  assert.equal(formatMove("e4e3", "b", "p", board), "前卒进1");
});
