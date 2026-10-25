const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");

// Canonical formations: https://www.xiangqi.com/articles/checkmate-strategies
// ponytail: terminal-board recognition, not a reconstruction of multi-move mating combinations.
function detectMatingPattern(game) {
  if (!game.in_checkmate()) return null;
  const defender = game.turn();
  const attacker = defender === "r" ? "b" : "r";
  const board = game.board();
  const pieces = board.flatMap((rank, row) => rank.flatMap((piece, file) => piece
    ? [{ ...piece, row, file, square: `${"abcdefghi"[file]}${9 - row}` }] : []));
  const king = pieces.find((piece) => piece.type === "k" && piece.color === defender);
  if (!king) return null;
  const attackingPieces = pieces.filter((piece) => piece.color === attacker);
  const attackPosition = game.fen().split(" ");
  attackPosition[1] = attacker;
  const attacks = new Xiangqi(attackPosition.join(" ")).moves({ verbose: true, legal: false })
    .map((move) => ({ ...move, piece: move.piece.toLowerCase() }));
  const checkers = attacks.filter((move) => move.to === king.square);
  const between = (piece) => {
    if (piece.file !== king.file && piece.row !== king.row) return [];
    const dr = Math.sign(king.row - piece.row);
    const df = Math.sign(king.file - piece.file);
    const screens = [];
    for (let row = piece.row + dr, file = piece.file + df; row !== king.row || file !== king.file; row += dr, file += df) {
      if (board[row][file]) screens.push(pieces.find((entry) => entry.row === row && entry.file === file));
    }
    return screens;
  };
  const essential = (piece) => {
    const probe = new Xiangqi(game.fen());
    probe.remove(piece.square);
    return !probe.in_checkmate();
  };
  const pattern = (id, participants) => ({ id, squares: participants.map((piece) => piece.square), king: king.square });

  for (const checkingMove of checkers.filter((move) => move.piece === "c")) {
    const cannon = attackingPieces.find((piece) => piece.square === checkingMove.from);
    const screens = between(cannon);
    if (screens.length !== 1) continue;
    const screen = screens[0];
    const homeRow = defender === "b" ? 0 : 9;
    const centerAdvisor = board[defender === "b" ? 1 : 8][4];
    if (checkers.length === 1 && king.file === 4 && king.row === homeRow
      && cannon.row === homeRow && screen.type === "a" && screen.color === defender
      && centerAdvisor?.type === "a" && centerAdvisor.color === defender) {
      return pattern("smothered-cannon", [cannon, screen]);
    }
    if (screen.color === attacker && screen.type === "c") {
      return pattern("double-cannon", [cannon, screen]);
    }
    if (screen.color === attacker && screen.type === "n"
      && Math.abs(screen.row - king.row) + Math.abs(screen.file - king.file) === 2
      && attacks.some((move) => move.from === screen.square
        && Math.abs(Number(move.to[1]) - (9 - king.row)) + Math.abs("abcdefghi".indexOf(move.to[0]) - king.file) === 1)) {
      return pattern("horse-cannon", [cannon, screen]);
    }
  }

  if (king.file === 4 && checkers.some((move) => move.piece === "r" || move.piece === "p")) {
    for (const cannon of attackingPieces.filter((piece) => piece.type === "c" && piece.file === 4)) {
      const screens = between(cannon);
      if ((screens.length === 0 || (screens.length === 2 && screens.every((piece) => piece.color === defender)))
        && essential(cannon)) {
        const checkingPiece = attackingPieces.find((piece) => piece.square === checkers.find((move) => move.piece === "r" || move.piece === "p").from);
        return pattern("iron-bolt", [cannon, checkingPiece]);
      }
    }
  }

  const rooks = attackingPieces.filter((piece) => piece.type === "r");
  if (rooks.length === 2 && checkers.some((move) => move.piece === "r") && rooks.every(essential)) {
    return pattern("double-chariot", rooks);
  }
  return null;
}

module.exports = { detectMatingPattern };
