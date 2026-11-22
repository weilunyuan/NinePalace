const test = require("node:test");
const assert = require("node:assert/strict");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { deal, game, legacyVariant, validDraw } = require("../desktop/palace-castling.js");
const { resolveGameResult } = require("../desktop/game-rules.cjs");

const draw = [{ type: "j", r: "b0", b: "h9" }, { type: "m", r: "c0", b: "g9" }];
const clearPalace = "4k4/9/9/4p4/9/9/4P4/9/9/R3K3R r KQ - 0 1";

test("drawing changes two concrete pieces on each side and keeps standard positions independent", () => {
  const lottery = deal(size => size - 1);
  assert.ok(validDraw(lottery));
  assert.equal(lottery.length, 2);
  assert.notEqual(lottery[0].type, lottery[1].type);
  assert.deepEqual(lottery[0], { type: "q", r: "h2", b: "h7" });
  assert.equal(validDraw(lottery, legacyVariant), false);
  assert.equal(validDraw([{ type: "q", r: "h0", b: "h7" }, draw[0]]), false);
  assert.equal(validDraw([draw[0], { ...draw[1], b: "e9" }]), false);
  assert.equal(validDraw([draw[0], draw[0]]), false);

  const variant = game(draw);
  assert.equal(variant.get("b0").type, "j");
  assert.equal(variant.get("h9").type, "j");
  assert.ok(variant.moves({ square: "b0" }).includes("b0d1"));
  assert.ok(variant.moves({ square: "c0" }).includes("c0f3"));
  assert.ok(variant.moves({ square: "c0" }).includes("c0i6"));
  assert.equal(new Xiangqi().moves().length, 44);
  assert.equal(new Xiangqi().validate_fen(variant.fen()).valid, false);
  assert.ok(variant.move("c0i6"));
  assert.ok(variant.move("i9i6"));

  const acrossRiver = game(draw, "4k4/9/9/4p4/9/9/4P4/2M6/9/4K4 r - - 0 1");
  assert.ok(acrossRiver.moves({ square: "c2" }).includes("c2f5"));
  assert.ok(acrossRiver.moves({ square: "c2" }).includes("c2g6"));
  assert.equal(resolveGameResult(game(draw, "4k4/9/9/9/9/4M4/9/9/9/4K4 r - - 0 1")), null);
  const guard = game(draw, "4k4/9/9/4p4/9/9/4P4/9/9/3SK4 r - - 0 1");
  assert.ok(guard.moves({ square: "d0" }).includes("d0c0"));
});

test("short queens replace only the drawn cannons and slide or capture up to three squares", () => {
  const mixedDraw = [{ type: "q", r: "h2", b: "b7" }, draw[1]];
  const opening = game(mixedDraw);
  assert.equal(opening.get("h2").type, "q");
  assert.equal(opening.get("b7").type, "q");
  assert.equal(opening.get("b2").type, "c");
  assert.equal(opening.get("h7").type, "c");
  assert.ok(opening.moves({ square: "h2" }).includes("h2g1"));
  assert.ok(!opening.moves({ square: "h2" }).includes("h2h9"));

  const position = game(mixedDraw, "4k4/9/9/9/1r7/1Q7/4P4/9/9/4K4 r - - 0 1");
  const moves = position.moves({ square: "b4" });
  for (const move of ["b4b5", "b4e4", "b4e7"]) assert.ok(moves.includes(move), move);
  for (const move of ["b4b6", "b4f4", "b4f8"]) assert.ok(!moves.includes(move), move);
  assert.equal(position.move("b4b5").captured, "r");

  assert.equal(game(mixedDraw, "4k4/9/9/9/9/9/4q4/9/9/4K4 r - - 0 1").in_check(), true);
  assert.equal(game(mixedDraw, "4k4/9/9/9/9/4q4/9/9/9/4K4 r - - 0 1").in_check(), false);
  assert.equal(game(mixedDraw, "4k4/9/9/9/9/9/1q2P4/9/9/4K4 r - - 0 1").in_check(), true);
  assert.equal(game(mixedDraw, "4k4/9/9/9/9/q8/4P4/9/9/4K4 r - - 0 1").in_check(), false);
});

test("saved original rules retain the old diagonal range and legal replies", () => {
  assert.equal(game(draw, undefined, legacyVariant).move("c0i6"), null);
  const position = "4k4/9/9/9/9/m8/4P4/9/9/4K3R r - - 0 1";
  const oldReplay = game(draw, position, legacyVariant);
  assert.equal(oldReplay.in_check(), false);
  assert.ok(oldReplay.move("i0i1"));
  assert.equal(game(draw, position).in_check(), true);
  assert.equal(game(draw, position).move("i0i1"), null);
});

test("short castling moves both pieces in one ply and respects check, blockers and lost rights", () => {
  const ready = game(draw, clearPalace);
  assert.ok(ready.moves({ square: "e0" }).includes("e0f0"));
  assert.ok(ready.moves({ square: "e0" }).includes("e0i0"));
  assert.equal(ready.move("e0i0").kingTo, "f0");
  const castled = ready.fen();
  assert.equal(ready.get("e0").type, "r");
  assert.equal(ready.get("f0").type, "k");
  assert.equal(ready.get("i0"), null);
  assert.equal(castled.split(" ")[2], "-");
  assert.deepEqual(ready.history(), ["e0i0"]);
  assert.match(ready.pgn(), /1\. e0i0/);
  assert.equal(ready.undo().iccs, "e0i0");
  assert.equal(ready.fen(), clearPalace);
  assert.equal(ready.redo().iccs, "e0i0");
  assert.equal(ready.fen(), castled);
  assert.equal(game(draw, clearPalace.replace("R3K3R", "R3KA2R")).move("e0i0"), null);
  assert.equal(game(draw, clearPalace.replace("4k4/", "5k3/")).move("e0i0"), null);
  assert.equal(game(draw, clearPalace.replace("R3K3R r KQ", "c3K3R r K")).move("e0i0"), null);
  assert.equal(game(draw, clearPalace.replace("/9/R3K3R", "/6m2/R3K3R")).move("e0i0"), null);
  assert.equal(game(draw, "4k4/9/9/4r4/9/9/9/9/9/R3K3R r KQ - 0 1").move("e0i0"), null);
  const movedRook = game(draw, clearPalace);
  for (const move of ["i0i1", "e6e5", "i1i0", "e5e4"]) assert.ok(movedRook.move(move));
  assert.equal(movedRook.move("e0i0"), null);
});
