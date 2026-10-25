const DEFAULT_DIFFICULTY = "beginner";

const SEARCH_PROFILES = Object.freeze({
  beginner: Object.freeze({ command: "go movetime 250", multiPv: 6, pickFrom: Object.freeze([4, 6]) }),
  easy: Object.freeze({ command: "go movetime 400", multiPv: 4, pickFrom: Object.freeze([2, 4]) }),
  normal: Object.freeze({ command: "go movetime 900", multiPv: 1, pickFrom: Object.freeze([1, 1]) }),
  strong: Object.freeze({ command: "go movetime 2000", multiPv: 1, pickFrom: Object.freeze([1, 1]) }),
});

function normalizeDifficulty(difficulty) {
  return Object.prototype.hasOwnProperty.call(SEARCH_PROFILES, difficulty)
    ? difficulty
    : DEFAULT_DIFFICULTY;
}

function searchProfileFor(difficulty) {
  return SEARCH_PROFILES[normalizeDifficulty(difficulty)];
}

const SEARCH_COMMANDS = Object.freeze(Object.fromEntries(
  Object.entries(SEARCH_PROFILES).map(([difficulty, profile]) => [difficulty, profile.command]),
));

function searchCommandFor(difficulty) {
  return searchProfileFor(difficulty).command;
}

function candidateMovesFromInfo(lines, difficulty) {
  const profile = searchProfileFor(difficulty);
  if (profile.multiPv < 2) return [];

  const byDepth = new Map();
  for (const line of lines) {
    const match = line.match(/^info depth (\d+)\b.*?\bmultipv (\d+)\b.*?\bpv ([a-i][0-9][a-i][0-9])(?:\s|$)/i);
    if (!match) continue;
    const depth = Number(match[1]);
    const rank = Number(match[2]);
    const moves = byDepth.get(depth) || new Map();
    moves.set(rank, match[3].toLowerCase());
    byDepth.set(depth, moves);
  }

  const rankedDepths = [...byDepth.entries()].map(([depth, moves]) => ({
    depth,
    moves,
  }));
  const complete = rankedDepths
    .filter(({ moves }) => moves.size >= profile.multiPv)
    .sort((left, right) => right.depth - left.depth);
  const selected = complete[0] || rankedDepths.sort((left, right) =>
    right.moves.size - left.moves.size || right.depth - left.depth)[0];
  if (!selected) return [];

  return [...selected.moves.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rank, move]) => ({ rank, move }));
}

function chooseCandidateMove(candidates, difficulty, random = Math.random) {
  if (!candidates.length) return null;
  const profile = searchProfileFor(difficulty);
  const [firstRank, lastRank] = profile.pickFrom;
  const preferred = candidates.filter(({ rank }) => rank >= firstRank && rank <= lastRank);
  const weakerAlternatives = candidates.filter(({ rank }) => rank > 1);
  const choices = preferred.length ? preferred : weakerAlternatives;
  if (!choices.length) return candidates[0].move;
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index].move;
}

module.exports = {
  DEFAULT_DIFFICULTY,
  SEARCH_COMMANDS,
  SEARCH_PROFILES,
  candidateMovesFromInfo,
  chooseCandidateMove,
  normalizeDifficulty,
  searchCommandFor,
  searchProfileFor,
};
