const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_ENGINE_ID,
  engineDefinition,
  enginePaths,
  fromEngineMove,
  normalizeEngineId,
  normalizeEngineInfoLine,
  toEngineMove,
} = require("../desktop/engine-config.cjs");

test("Pikafish remains the safe default and both engine paths resolve independently", () => {
  assert.equal(DEFAULT_ENGINE_ID, "pikafish");
  assert.equal(normalizeEngineId("unknown"), "pikafish");
  assert.equal(engineDefinition("fairy-stockfish").variant, "xiangqi");
  assert.deepEqual(enginePaths("fairy-stockfish", { projectRoot: "project" }), {
    directory: path.join("project", "vendor", "fairy-stockfish"),
    executable: path.join("project", "vendor", "fairy-stockfish", "fairy-stockfish.exe"),
  });
  assert.deepEqual(enginePaths("fairy-stockfish", { isPackaged: true, resourcesPath: "resources" }), {
    directory: path.join("resources", "fairy-stockfish"),
    executable: path.join("resources", "fairy-stockfish", "fairy-stockfish.exe"),
  });
});

test("Fairy-Stockfish rank coordinates convert to and from app coordinates", () => {
  assert.equal(toEngineMove("b2e2", "fairy-stockfish"), "b3e3");
  assert.equal(toEngineMove("a0a9", "fairy-stockfish"), "a1a10");
  assert.equal(fromEngineMove("b3e3", "fairy-stockfish"), "b2e2");
  assert.equal(fromEngineMove("a1a10", "fairy-stockfish"), "a0a9");
  assert.equal(toEngineMove("a0a10", "fairy-stockfish"), null);
  assert.equal(fromEngineMove("j1a2", "fairy-stockfish"), null);
  assert.equal(fromEngineMove("a0a1", "fairy-stockfish"), null);
  assert.equal(toEngineMove("b2e2", "pikafish"), "b2e2");
});

test("Fairy UCI principal variations are normalized before review parsing", () => {
  assert.equal(
    normalizeEngineInfoLine("info depth 4 multipv 1 score cp 30 nodes 10 pv b3e3 b8e8", "fairy-stockfish"),
    "info depth 4 multipv 1 score cp 30 nodes 10 pv b2e2 b7e7",
  );
});
