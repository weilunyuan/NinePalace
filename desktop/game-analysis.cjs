const UCI_MOVE = /^[a-i][0-9][a-i][0-9]$/i;
const MATE_SCORE = 30000;

function parseEngineEvaluation(infoLines) {
  let best = null;
  for (const line of infoLines) {
    const match = line.match(/^info depth (\d+)\b.*?\bmultipv 1\b.*?\bscore (cp|mate) (-?\d+)/i);
    if (!match) continue;
    const depth = Number(match[1]);
    const value = Number(match[3]);
    const score = match[2].toLowerCase() === "mate"
      ? Math.sign(value || 1) * (MATE_SCORE - Math.min(Math.abs(value), 1000))
      : value;
    const pvMatch = line.match(/\bpv\s+(.+)$/i);
    const principalVariation = pvMatch
      ? pvMatch[1].trim().split(/\s+/).filter((move) => UCI_MOVE.test(move)).slice(0, 4).map((move) => move.toLowerCase())
      : [];
    if (!best || depth >= best.depth) best = { depth, score, principalVariation };
  }
  return best || { score: null, principalVariation: [] };
}

function parseEngineScore(infoLines) {
  return parseEngineEvaluation(infoLines).score;
}

function classifyMove(move, bestMove, currentScore, nextScore) {
  if (bestMove && move === bestMove) return { quality: "best", lossCp: 0 };
  if (!bestMove || !Number.isFinite(currentScore) || !Number.isFinite(nextScore)) {
    return { quality: "unknown", lossCp: null };
  }

  // Each score is from the side-to-move's perspective. Negate the next
  // position to compare the played move with the best move for its mover.
  const lossCp = Math.max(0, Math.round(currentScore + nextScore));
  if (lossCp <= 35) return { quality: "good", lossCp };
  if (lossCp <= 120) return { quality: "inaccuracy", lossCp };
  if (lossCp <= 300) return { quality: "mistake", lossCp };
  return { quality: "blunder", lossCp };
}

function reviewGame(moves, evaluations) {
  if (!Array.isArray(moves) || !Array.isArray(evaluations) || evaluations.length !== moves.length + 1) {
    throw new TypeError("复盘需要每步着法及其前后局面评估");
  }
  const reviews = moves.map((move, index) => {
    if (typeof move !== "string" || !UCI_MOVE.test(move)) throw new TypeError(`棋谱中存在无效着法：${move}`);
    const current = evaluations[index] || {};
    const next = evaluations[index + 1] || {};
    const bestMove = typeof current.bestMove === "string" && UCI_MOVE.test(current.bestMove)
      ? current.bestMove.toLowerCase()
      : null;
    const { quality, lossCp } = classifyMove(
      move.toLowerCase(),
      bestMove,
      current.score,
      next.score,
    );
    return {
      move: move.toLowerCase(),
      bestMove,
      continuation: Array.isArray(current.principalVariation)
        ? current.principalVariation.filter((move) => typeof move === "string" && UCI_MOVE.test(move)).slice(0, 4).map((move) => move.toLowerCase())
        : [],
      quality,
      lossCp,
    };
  });
  const summary = { total: reviews.length, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, unknown: 0 };
  for (const review of reviews) summary[review.quality] += 1;
  return { moves: reviews, summary };
}

function terminalEvaluation(game, result) {
  if (!result) return null;
  if (result.winner === "draw") return { bestMove: null, score: 0 };
  const sideToMove = game.turn() === "r" ? "red" : "black";
  return { bestMove: null, score: result.winner === sideToMove ? MATE_SCORE : -MATE_SCORE };
}

module.exports = { MATE_SCORE, parseEngineEvaluation, parseEngineScore, reviewGame, terminalEvaluation };
