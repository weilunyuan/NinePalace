const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const { material, originalRole, revealedType } = require("./jieqi.js");

const values = { k: 10000, r: 900, c: 430, n: 410, a: 220, b: 235, p: 115 };
const choices = { beginner: [3, 8], easy: [1, 5], normal: [0, 3], strong: [0, 1] };
const files = "abcdefghi";
const pieceAt = (board, square) => board[9 - Number(square[1])][files.indexOf(square[0])];
const worth = type => values[originalRole[type] || type] || 0;

function chooseJieqiMove({ board, finalFen, jieqiLog }, difficulty, random = Math.random) {
  const position = new Xiangqi(finalFen, { jieqi: true });
  const side = position.turn();
  const other = side === "r" ? "b" : "r";
  const unseen = { r: { ...material }, b: { ...material } };
  for (const [index, [reveal, capture]] of jieqiLog.entries()) {
    const mover = index % 2 ? "b" : "r";
    if (reveal !== "-") unseen[mover][reveal] -= 1;
    if (capture !== "-") unseen[mover === "r" ? "b" : "r"][capture] -= 1;
  }
  const pool = color => Object.entries(unseen[color]).filter(([, count]) => count > 0);
  const expected = color => {
    const remaining = pool(color);
    return remaining.reduce((sum, [type, count]) => sum + worth(type) * count, 0)
      / (remaining.reduce((sum, [, count]) => sum + count, 0) || 1);
  };
  const ownDark = expected(side);
  const enemyDark = expected(other);

  function score(move) {
    const piece = pieceAt(board, move.from);
    const captured = pieceAt(board, move.to);
    if (captured?.type === "k") return 20000;
    const gain = captured?.covered ? enemyDark : worth(captured?.type);
    const next = new Xiangqi(finalFen, { jieqi: true });
    next.move(move.iccs);
    const after = next.fen();
    // Evaluate the possible flips from known material, then price the strongest immediate reply.
    const cases = piece.covered ? pool(side) : [[piece.type, 1]];
    let replyScore = 0;
    let weight = 0;
    for (const [type, count] of cases) {
      const probe = new Xiangqi(after, { jieqi: true });
      if (piece.covered) probe.put({ type: revealedType[type] || type, color: side }, move.to);
      const replies = probe.moves({ verbose: true });
      let risk = 0;
      for (const reply of replies) {
        if (!reply.captured) continue;
        const loss = reply.to === move.to ? worth(type)
          : pieceAt(board, reply.to)?.covered ? ownDark : worth(reply.captured);
        risk = Math.max(risk, loss);
      }
      replyScore += count * (replies.length ? (probe.in_check() ? 65 : 0) - risk * 0.8 : 20000);
      weight += count;
    }
    const advance = (Number(move.to[1]) - Number(move.from[1])) * (side === "r" ? 1 : -1);
    return gain + replyScore / (weight || 1) + (piece.covered ? 55 : 0) + 2 * advance;
  }

  const ranked = position.moves({ verbose: true }).map(move => ({ move: move.iccs, value: score(move) }))
    .sort((a, b) => b.value - a.value);
  if (!ranked.length) return null;
  if (ranked[0].value >= 20000) return ranked[0].move;
  const [start, end] = choices[difficulty] || choices.beginner;
  const available = ranked.slice(Math.min(start, ranked.length - 1), end);
  return available[Math.floor(random() * available.length)].move;
}

module.exports = { chooseJieqiMove };
