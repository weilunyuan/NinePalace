((root, build) => {
  if (typeof module === "object" && module.exports) {
    module.exports = build(require("../vendor/xiangqi-js/xiangqi.js").Xiangqi);
  } else {
    root.NinePalaceCastling = build(root.NinePalaceXiangqi);
  }
})(globalThis, (Xiangqi) => {
  const variant = "palace-castling-v2";
  const legacyVariant = "palace-castling";
  const cards = {
    j: { type: "n", files: ["b", "h"], name: "castlingHorse", rule: "castlingHorseRule" },
    m: { type: "b", files: ["c", "g"], name: "castlingElephant", rule: "castlingElephantRule" },
    s: { type: "a", files: ["d", "f"], name: "castlingGuard", rule: "castlingGuardRule" },
    q: { type: "c", files: ["b", "h"], ranks: { r: 2, b: 7 }, name: "castlingQueen", rule: "castlingQueenRule" },
  };
  const [initialBoard] = new Xiangqi().fen().split(" ");
  const initialRows = initialBoard.split("/").map(row => row.replace(/\d/g, count => "1".repeat(Number(count))));

  function squareFor(card, file, side) {
    return `${file}${card.ranks?.[side] ?? (side === "r" ? 0 : 9)}`;
  }

  function deal(randomInt) {
    const pool = Object.keys(cards);
    const first = pool.splice(randomInt(pool.length), 1)[0];
    const second = pool[randomInt(pool.length)];
    return [first, second].map(type => ({
      type,
      r: squareFor(cards[type], cards[type].files[randomInt(2)], "r"),
      b: squareFor(cards[type], cards[type].files[randomInt(2)], "b"),
    }));
  }

  function validDraw(draw, ruleset = variant) {
    if (ruleset !== variant && ruleset !== legacyVariant) return false;
    return Array.isArray(draw) && draw.length === 2 && draw[0]?.type !== draw[1]?.type && draw.every(entry => {
      if (!entry || typeof entry.type !== "string" || !Object.hasOwn(cards, entry.type)) return false;
      const card = cards[entry.type];
      return !(ruleset === legacyVariant && entry.type === "q")
        && ["r", "b"].every(side => card.files.some(file => entry[side] === squareFor(card, file, side)));
    });
  }

  function drawKey(draw) {
    return draw.map(({ type, r, b }) => `${type}${r}${b}`).sort().join(",");
  }

  function game(draw, fen, ruleset = variant) {
    if (!validDraw(draw, ruleset)) throw new Error("Invalid palace castling draw");
    if (fen === undefined) {
      const rows = initialRows.map(row => [...row]);
      for (const { type, r, b } of draw) {
        rows[9 - Number(r[1])][r.charCodeAt(0) - 97] = type.toUpperCase();
        rows[9 - Number(b[1])][b.charCodeAt(0) - 97] = type;
      }
      fen = `${rows.map(row => row.join("").replace(/1+/g, empty => empty.length)).join("/")} r KQkq - 0 1`;
    }
    const legacyCastling = ruleset === legacyVariant;
    const position = new Xiangqi(fen, { palaceCastling: true, legacyCastling });
    position.header("Variant", legacyCastling ? "Palace Castling" : "Palace Castling v2");
    position.draw = draw;
    return position;
  }

  return { variant, legacyVariant, cards, deal, validDraw, drawKey, game };
});
