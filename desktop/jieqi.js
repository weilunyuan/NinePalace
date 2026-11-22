((root, build) => {
  if (typeof module === "object" && module.exports) {
    module.exports = build(require("../vendor/xiangqi-js/xiangqi.js").Xiangqi);
  } else {
    root.NinePalaceJieqi = build(root.NinePalaceXiangqi);
  }
})(globalThis, (Xiangqi) => {
  const variant = "jieqi-v1";
  const files = "abcdefghi";
  const material = { r: 2, n: 2, b: 2, a: 2, c: 2, p: 5 };
  const originalRole = { u: "a", v: "b" };
  const revealedType = { a: "u", b: "v" };
  const movePattern = /^[a-i][0-9][a-i][0-9]$/;
  const flipPattern = /^[arnbcp-]{2}$/;
  const origins = new Xiangqi().board().flatMap((row, rank) => row.flatMap((piece, file) => piece && piece.type !== "k"
    ? [{ ...piece, square: `${files[file]}${9 - rank}` }] : []));

  function deal(randomInt) {
    const faces = new Map();
    for (const side of ["r", "b"]) {
      const seats = origins.filter(piece => piece.color === side);
      const shuffled = seats.map(piece => piece.type);
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      seats.forEach(({ square }, index) => faces.set(square, shuffled[index]));
    }
    return faces;
  }

  function validLog(log, count) {
    return Array.isArray(log) && log.length === count && log.every(code => typeof code === "string" && flipPattern.test(code));
  }

  function game({ randomInt, viewer = null } = {}) {
    const rules = new Xiangqi(undefined, { jieqi: true });
    const deck = randomInt ? deal(randomInt) : null;
    const dark = new Set(origins.map(piece => piece.square));
    const unseen = { r: { ...material }, b: { ...material } };
    const moves = [];
    const flips = [];

    function move(iccs, code) {
      if (typeof iccs !== "string" || !movePattern.test(iccs)) return null;
      const from = iccs.slice(0, 2);
      const to = iccs.slice(2);
      const side = rules.turn();
      const enemy = side === "r" ? "b" : "r";
      const revealFrom = dark.has(from);
      const captureDark = dark.has(to);
      if (deck) code = `${revealFrom ? deck.get(from) : "-"}${captureDark ? deck.get(to) : "-"}`;
      if (typeof code !== "string" || !flipPattern.test(code)) return null;
      const [reveal, capture] = code;
      if ((reveal !== "-") !== revealFrom || (capture !== "-") !== (captureDark && Boolean(deck || viewer === side))) return null;
      if ((revealFrom && !unseen[side][reveal]) || (capture !== "-" && !unseen[enemy][capture])) return null;
      const played = rules.move(iccs);
      if (!played) return null;
      if (revealFrom) {
        rules.put({ color: side, type: revealedType[reveal] || reveal }, to);
        unseen[side][reveal] -= 1;
      }
      if (capture !== "-") unseen[enemy][capture] -= 1;
      dark.delete(from);
      dark.delete(to);
      moves.push(iccs);
      flips.push(code);
      return played;
    }

    return {
      jieqi: true,
      move,
      moves: rules.moves,
      turn: rules.turn,
      fen: rules.fen,
      in_check: rules.in_check,
      in_checkmate: rules.in_checkmate,
      in_stalemate: rules.in_stalemate,
      insufficient_material: rules.insufficient_material,
      board: () => rules.board().map((rank, row) => rank.map((piece, file) => dark.has(`${files[file]}${9 - row}`)
        ? { ...piece, covered: true } : piece)),
      history: () => [...moves],
      log: (side = viewer) => flips.map((code, index) => (index % 2 === 0 ? "r" : "b") === side ? code : `${code[0]}-`),
      pgn: () => {
        const line = moves.map((iccs, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${iccs}${flips[index][0].replace("-", "")}`);
        return `[Variant "Jieqi"]\n\n${line.join(" ")}`;
      },
    };
  }

  return { variant, material, originalRole, revealedType, validLog, game };
});
