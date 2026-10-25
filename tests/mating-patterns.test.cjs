const test = require("node:test");
const assert = require("node:assert/strict");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { detectMatingPattern } = require("../desktop/mating-patterns.cjs");
const { resolveGameResult } = require("../desktop/game-rules.cjs");

const examples = [
  ["smothered-cannon", "4kaC2/4a4/9/9/9/9/9/9/9/4K4 b - - 0 1"],
  ["iron-bolt", "3Rk4/3Pa4/4b4/9/4C4/9/9/9/9/4K4 b - - 0 1"],
  ["double-chariot", "R4k3/1R7/9/9/9/9/9/9/9/4K4 b - - 0 1"],
  ["double-chariot", "5R3/4kR3/4b4/9/9/4P4/9/9/9/4K4 b - - 0 1"],
  ["double-cannon", "4k4/3P1P3/4C4/9/4C4/9/9/9/9/4K4 b - - 0 1"],
  ["horse-cannon", "4k4/9/4N4/9/4C4/9/9/9/9/4K4 b - - 0 1"],
];

function transform(fen, swapColors) {
  const fields = fen.split(" ");
  let ranks = fields[0].split("/").map((rank) => [...rank.replace(/[1-9]/g, (n) => ".".repeat(Number(n)))].reverse());
  if (swapColors) {
    ranks = ranks.reverse().map((rank) => rank.map((piece) => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()));
    fields[1] = fields[1] === "b" ? "r" : "b";
  }
  fields[0] = ranks.map((rank) => rank.join("").replace(/\.+/g, (empty) => String(empty.length))).join("/");
  return fields.join(" ");
}

test("canonical mating formations work for either side and both wings without mutating the game", () => {
  for (const [id, original] of examples) {
    for (const fen of [original, transform(original, false), transform(original, true)]) {
      const game = new Xiangqi(fen);
      assert.equal(game.in_checkmate(), true, `${id}: fixture must actually be checkmate`);
      const before = { fen: game.fen(), history: game.history() };
      const pattern = detectMatingPattern(game);
      assert.equal(pattern?.id, id, `${id}: ${fen}`);
      assert.ok(pattern.squares.length >= 2);
      assert.equal(resolveGameResult(game).pattern.id, id);
      assert.deepEqual({ fen: game.fen(), history: game.history() }, before);
    }
  }
});

test("checks, unrelated extra rooks, stalemates, draws and unknown mates never get invented names", () => {
  const notNamed = [
    "4kaC2/9/9/9/9/4P4/9/9/9/4K4 b - - 0 1",
    "R4k3/9/7N1/9/9/9/9/9/9/4K3R b - - 0 1",
    "4k4/4a4/9/9/9/9/9/9/3r1r3/4K4 r - - 0 2",
    "4k4/4a4/9/9/9/9/9/9/9/4K4 r - - 0 1",
  ];
  for (const fen of notNamed) assert.equal(detectMatingPattern(new Xiangqi(fen)), null, fen);
  assert.equal(detectMatingPattern(new Xiangqi()), null);
});
