const test = require("node:test");
const assert = require("node:assert/strict");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const jieqi = require("../desktop/jieqi.js");
const { chooseJieqiMove } = require("../desktop/jieqi-ai.cjs");

const ordered = size => size - 1;
const view = (game, side = game.turn()) => ({ board: game.board(), finalFen: game.fen(), jieqiLog: game.log(side) });
const countCovered = board => board.flat().filter(piece => piece?.covered).length;

test("Jieqi starts with 30 covers, uses the original role and reveals only after a legal move", () => {
  const game = jieqi.game({ randomInt: ordered });
  const swapped = jieqi.game({ randomInt: () => 0 });
  assert.equal(countCovered(game.board()), 30);
  assert.deepEqual(game.board()[9][4], { color: "r", type: "k" });
  assert.deepEqual(view(game), view(swapped));
  assert.ok(game.moves({ square: "a3" }).includes("a3a4"));
  assert.equal(game.move("a3a5"), null);
  assert.equal(game.move("b0d1"), null);
  assert.deepEqual(game.log("r"), []);
  assert.ok(game.move("b2b9"));
  assert.ok(swapped.move("b2b9"));
  assert.notDeepEqual(game.log("r"), swapped.log("r"));
  assert.deepEqual(game.log("r"), ["cn"]);
  assert.deepEqual(game.log("b"), ["c-"]);
  assert.equal(countCovered(game.board()), 28);

  const guest = jieqi.game({ viewer: "b" });
  assert.equal(guest.move("b2b9", "cn"), null);
  assert.ok(guest.move("b2b9", "c-"));
  assert.deepEqual(guest.board(), game.board());
  assert.match(guest.pgn(), /1\. b2b9c$/);
});

test("revealed advisors leave the palace, elephants cross the river and still have an eye", () => {
  const advisor = jieqi.game();
  assert.ok(advisor.move("b2b3", "a-"));
  assert.ok(advisor.move("a6a5", "p-"));
  assert.deepEqual(advisor.board()[6][1], { color: "r", type: "u" });
  assert.ok(advisor.moves({ square: "b3" }).includes("b3c4"));
  const elephant = jieqi.game();
  assert.ok(elephant.move("b2b3", "b-"));
  assert.ok(elephant.move("a6a5", "p-"));
  assert.ok(elephant.moves({ square: "b3" }).includes("b3d5"));
  const check = "4k4/9/9/9/9/9/4P4/2v6/9/4K4 r - - 0 1";
  assert.equal(new Xiangqi(check, { jieqi: true }).in_check(), true);
  assert.equal(new Xiangqi(check.replace("/9/4K4", "/3N5/4K4"), { jieqi: true }).in_check(), false);
});

test("the AI chooses a legal move from its visible position and private captures only", () => {
  const first = jieqi.game({ randomInt: ordered });
  const other = jieqi.game({ randomInt: () => 0 });
  for (const difficulty of ["beginner", "strong"]) {
    const move = chooseJieqiMove(view(first), difficulty, () => 0.5);
    assert.equal(move, chooseJieqiMove(view(other), difficulty, () => 0.5));
    assert.ok(first.moves().includes(move));
  }
  for (let index = 0; index < 8; index += 1) {
    const move = chooseJieqiMove(view(first), "normal", () => 0.5);
    assert.ok(first.move(move));
  }
  assert.equal(first.history().length, 8);
});
