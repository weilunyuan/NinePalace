(function attachXiangqiNotation(root, factory) {
  const notation = factory();
  if (typeof module === "object" && module.exports) module.exports = notation;
  if (root) root.NinePalaceNotation = notation;
})(typeof window === "undefined" ? globalThis : window, () => {
  const FILES = "abcdefghi";
  const CHINESE_NUMBERS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const PIECES = {
    r: { k: "帅", a: "仕", b: "相", n: "马", r: "车", c: "炮", p: "兵", j: "跃马", m: "斜相", s: "护卫", q: "短后", u: "仕", v: "相" },
    b: { k: "将", a: "士", b: "象", n: "马", r: "车", c: "炮", p: "卒", j: "跃马", m: "斜象", s: "护卫", q: "短后", u: "士", v: "象" },
  };

  function numberForSide(value, color) {
    return color === "r" ? CHINESE_NUMBERS[value] : String(value);
  }

  function piecePrefix(board, sourceFile, sourceRow, color, type) {
    const sameFile = [];
    board.forEach((row, rowIndex) => {
      const piece = row?.[sourceFile];
      if (piece?.color === color && piece.type === type) sameFile.push(rowIndex);
    });
    if (sameFile.length < 2) return "";

    // From either player's perspective, the front piece is the one nearer the opponent.
    sameFile.sort((left, right) => color === "r" ? left - right : right - left);
    const position = sameFile.indexOf(sourceRow);
    if (position < 0) return "";
    let label;
    if (sameFile.length === 2) label = position === 0 ? "前" : "后";
    else if (sameFile.length === 3) label = ["前", "中", "后"][position];
    else if (position === 0) label = "前";
    else if (position === sameFile.length - 1) label = "后";
    else label = CHINESE_NUMBERS[position + 1] || String(position + 1);
    return label;
  }

  function formatMove(move, color, type, board) {
    if (typeof move !== "string" || !/^[a-i][0-9][a-i][0-9]$/i.test(move)) return null;
    if (!(color in PIECES) || !PIECES[color][type]) return null;

    const normalized = move.toLowerCase();
    const sourceFile = FILES.indexOf(normalized[0]);
    const sourceRank = Number(normalized[1]);
    const targetFile = FILES.indexOf(normalized[2]);
    const targetRank = Number(normalized[3]);
    const sourceRow = 9 - sourceRank;
    const sourceFileNumber = color === "r" ? 9 - sourceFile : sourceFile + 1;
    const targetFileNumber = color === "r" ? 9 - targetFile : targetFile + 1;
    const prefix = piecePrefix(Array.isArray(board) ? board : [], sourceFile, sourceRow, color, type);
    const pieceName = `${prefix}${PIECES[color][type]}`;

    if (sourceFile === targetFile) {
      const rankDelta = targetRank - sourceRank;
      const forward = color === "r" ? rankDelta > 0 : rankDelta < 0;
      const distance = Math.abs(rankDelta);
      return `${pieceName}${prefix ? "" : numberForSide(sourceFileNumber, color)}${forward ? "进" : "退"}${numberForSide(distance, color)}`;
    }

    if (sourceRank === targetRank) {
      return `${pieceName}${prefix ? "" : numberForSide(sourceFileNumber, color)}平${numberForSide(targetFileNumber, color)}`;
    }

    const rankDelta = targetRank - sourceRank;
    const forward = color === "r" ? rankDelta > 0 : rankDelta < 0;
    return `${pieceName}${prefix ? "" : numberForSide(sourceFileNumber, color)}${forward ? "进" : "退"}${numberForSide(targetFileNumber, color)}`;
  }

  return { formatMove };
});
