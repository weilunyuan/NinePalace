const path = require("node:path");

const DEFAULT_ENGINE_ID = "pikafish";

const ENGINES = Object.freeze({
  pikafish: Object.freeze({
    id: "pikafish",
    name: "Pikafish",
    directory: "pikafish",
    executable: "pikafish.exe",
    variant: null,
  }),
  "fairy-stockfish": Object.freeze({
    id: "fairy-stockfish",
    name: "Fairy-Stockfish",
    directory: "fairy-stockfish",
    executable: "fairy-stockfish.exe",
    variant: "xiangqi",
  }),
});

function normalizeEngineId(engineId) {
  return Object.prototype.hasOwnProperty.call(ENGINES, engineId)
    ? engineId
    : DEFAULT_ENGINE_ID;
}

function engineDefinition(engineId) {
  return ENGINES[normalizeEngineId(engineId)];
}

function enginePaths(engineId, {
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  projectRoot = path.join(__dirname, ".."),
} = {}) {
  const definition = engineDefinition(engineId);
  const directory = isPackaged
    ? path.join(resourcesPath, definition.directory)
    : path.join(projectRoot, "vendor", definition.directory);
  return {
    directory,
    executable: path.join(directory, definition.executable),
  };
}

function toEngineMove(move, engineId) {
  if (typeof move !== "string") return null;
  const normalized = move.toLowerCase();
  if (normalizeEngineId(engineId) === "pikafish") {
    return /^[a-i][0-9][a-i][0-9]$/.test(normalized) ? normalized : null;
  }
  const match = normalized.match(/^([a-i])([0-9])([a-i])([0-9])$/);
  if (!match) return null;
  return `${match[1]}${Number(match[2]) + 1}${match[3]}${Number(match[4]) + 1}`;
}

function fromEngineMove(move, engineId) {
  if (typeof move !== "string") return null;
  const normalized = move.toLowerCase();
  if (normalizeEngineId(engineId) === "pikafish") {
    return /^[a-i][0-9][a-i][0-9]$/.test(normalized) ? normalized : null;
  }
  const match = normalized.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/);
  if (!match) return null;
  const fromRank = Number(match[2]) - 1;
  const toRank = Number(match[4]) - 1;
  if (fromRank > 9 || toRank > 9) return null;
  return `${match[1]}${fromRank}${match[3]}${toRank}`;
}

function normalizeEngineInfoLine(line, engineId) {
  if (normalizeEngineId(engineId) !== "fairy-stockfish") return line;
  const match = line.match(/\bpv\s+(.+)$/i);
  if (!match) return line;
  const normalizedPv = match[1].trim().split(/\s+/)
    .map((move) => fromEngineMove(move, engineId))
    .filter(Boolean);
  return `${line.slice(0, match.index)}pv ${normalizedPv.join(" ")}`;
}

module.exports = {
  DEFAULT_ENGINE_ID,
  ENGINES,
  engineDefinition,
  enginePaths,
  fromEngineMove,
  normalizeEngineId,
  normalizeEngineInfoLine,
  toEngineMove,
};
