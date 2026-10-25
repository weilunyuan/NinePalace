const { detectMatingPattern } = require("./mating-patterns.cjs");

function resolveGameResult(game) {
  const board = game.board();
  const hasRedKing = board.some((row) => row.some((piece) => piece?.type === "k" && piece.color === "r"));
  const hasBlackKing = board.some((row) => row.some((piece) => piece?.type === "k" && piece.color === "b"));
  if (!hasRedKing || !hasBlackKing) {
    return { winner: hasRedKing ? "red" : "black", reason: "将帅被吃" };
  }

  // In Xiangqi, a player with no legal move loses, whether or not their general is in check.
  const checkmate = game.in_checkmate();
  if (checkmate || game.in_stalemate()) {
    const pattern = checkmate ? detectMatingPattern(game) : null;
    return {
      winner: game.turn() === "r" ? "black" : "red",
      reason: game.in_check() ? "将死" : "无棋可走",
      ...(pattern ? { pattern } : {}),
    };
  }

  const halfMoves = Number(game.fen().split(/\s+/)[4] || 0);
  if (halfMoves >= 120 || game.insufficient_material()) {
    return { winner: "draw", reason: "达到本地原型的和棋条件" };
  }
  return null;
}

module.exports = { resolveGameResult };
