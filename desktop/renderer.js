const FILES = "abcdefghi";
const PIECES = {
  r: { k: "帥", a: "仕", b: "相", n: "傌", r: "俥", c: "炮", p: "兵" },
  b: { k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒" },
};
const NS = "http://www.w3.org/2000/svg";
const HAND_SPRITES = Object.fromEntries(["red-rook", "red-horse", "black-rook", "black-horse"].map((id) => {
  const image = new Image();
  const sprite = { image, ready: false };
  image.src = `./assets/ninepalace-hand-${id}.png`;
  sprite.loaded = image.decode().then(() => { sprite.ready = true; return true; }, (error) => {
    console.warn(`NinePalace 手部素材未能加载：${id}`, error);
    return false;
  });
  return [id, sprite];
}));
let state = null;
let selectedSquare = null;
let legalTargets = [];
let keyboardSquare = "e0";
let toastTimer = 0;
let tutorialActive = false;
let tutorialStep = "select";
let lastSavedGameSignature = null;
let currentReplay = null;
let replayIndex = 0;
let selectedReviewIndex = null;
let showBestMove = false;
let analysisRunningId = null;
let analysisProgress = null;
let roomInviteUrls = [];
let finishPresentation = null;
let variation = null;
let selectionRequest = 0;
let submittingMove = false;
let boardMotion = null;
const boardMoveQueue = [];
const t = (key, values) => window.npI18n.t(key, values);
const MATING_PATTERNS = {
  "smothered-cannon": { name: "mateSmothered", description: "mateSmotheredDescription", symbols: ["c"] },
  "iron-bolt": { name: "mateIronBolt", description: "mateIronBoltDescription", symbols: ["c", "r"] },
  "double-chariot": { name: "mateDoubleChariot", description: "mateDoubleChariotDescription", symbols: ["r", "r"] },
  "double-cannon": { name: "mateDoubleCannon", description: "mateDoubleCannonDescription", symbols: ["c", "c"] },
  "horse-cannon": { name: "mateHorseCannon", description: "mateHorseCannonDescription", symbols: ["n", "c"] },
};

function engineNameFor(engineId) {
  return engineId === "fairy-stockfish" ? "Fairy-Stockfish" : "Pikafish";
}

function currentEngineName(currentState = state) {
  return currentState?.engineName || engineNameFor(currentState?.engineId);
}

function handCharacterFor(color) {
  const selected = document.body.dataset.character || "red-rook";
  const faction = selected.startsWith("black-") ? "black" : "red";
  const role = selected.endsWith("-horse") ? "horse" : "rook";
  return `${color === (state?.playerColor || "r") ? faction : faction === "red" ? "black" : "red"}-${role}`;
}

const boardNode = document.querySelector("#game-board");
const replayBoardNode = document.querySelector("#replay-board");
const finishDialog = document.querySelector("#finish-dialog");

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function squareAt(file, row) {
  return `${FILES[file]}${9 - row}`;
}

function boardPoint(file, row) {
  return { x: 25 + file * 50, y: 25 + row * 50 };
}

function boardIsFlipped(svg = boardNode) {
  return (svg === replayBoardNode ? currentReplay : state)?.playerColor === "b";
}

function pieceElement(piece, point, extraClass = "") {
  const group = svgElement("g", {
    class: `piece ${piece.color === "r" ? "red" : "black"}${extraClass ? ` ${extraClass}` : ""}`,
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  group.append(svgElement("circle", { cx: point.x, cy: point.y + 2, r: 18, class: "piece-depth" }));
  group.append(svgElement("circle", { cx: point.x, cy: point.y, r: 18 }));
  group.append(svgElement("circle", { cx: point.x, cy: point.y, r: 15.5, class: "piece-ring" }));
  const text = svgElement("text", { x: point.x, y: point.y + 1 });
  text.textContent = PIECES[piece.color]?.[piece.type] || "?";
  group.append(text);
  return group;
}

function drawBoard(svg, board, interactive, lastMove = null, movingMove = null, hintMove = null, pattern = null) {
  svg.replaceChildren();
  const flipped = boardIsFlipped(svg);
  svg.dataset.orientation = flipped ? "black" : "red";
  // Keep real square IDs and upright artwork; only map their display positions.
  const pointAt = (file, row) => boardPoint(flipped ? 8 - file : file, flipped ? 9 - row : row);
  const animateMove = Boolean(movingMove && !document.documentElement.classList.contains("reduce-motion"));
  if (interactive) {
    svg.setAttribute("aria-rowcount", "10");
    svg.setAttribute("aria-colcount", "9");
    svg.setAttribute("aria-activedescendant", `${svg.id}-square-${keyboardSquare}`);
  }
  const lines = svgElement("g", { class: "board-lines", "aria-hidden": "true" });
  for (let file = 0; file < 9; file += 1) {
    const x = 25 + file * 50;
    lines.append(svgElement("line", { x1: x, y1: 25, x2: x, y2: 225 }));
    lines.append(svgElement("line", { x1: x, y1: 275, x2: x, y2: 475 }));
  }
  for (let row = 0; row < 10; row += 1) {
    const y = 25 + row * 50;
    lines.append(svgElement("line", { x1: 25, y1: y, x2: 425, y2: y }));
  }
  lines.append(svgElement("path", { d: "M175 25L275 125M275 25L175 125M175 375L275 475M275 375L175 475" }));
  lines.append(svgElement("rect", { x: 25, y: 25, width: 400, height: 450, class: "board-boundary" }));
  svg.append(lines);

  const river = svgElement("text", { x: 225, y: 255, class: "river-label", "text-anchor": "middle", "aria-hidden": "true" });
  river.textContent = t("river");
  svg.append(river);

  if (lastMove) {
    for (const square of [lastMove.slice(0, 2), lastMove.slice(2, 4)]) {
      const file = FILES.indexOf(square[0]);
      const row = 9 - Number(square[1]);
      const point = pointAt(file, row);
      svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: 20, class: "last-move-square", "aria-hidden": "true" }));
    }
  }

  if (interactive && selectedSquare) {
    const file = FILES.indexOf(selectedSquare[0]);
    const row = 9 - Number(selectedSquare[1]);
    const point = pointAt(file, row);
    svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: 21, class: "selected-square", "aria-hidden": "true" }));
  }

  if (interactive) {
    for (const move of legalTargets) {
      const target = move.slice(2, 4);
      const file = FILES.indexOf(target[0]);
      const row = 9 - Number(target[1]);
      const point = pointAt(file, row);
      const hasPiece = Boolean(board[row]?.[file]);
      svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: hasPiece ? 19 : 7, class: hasPiece ? "legal-ring" : "legal-dot", "aria-hidden": "true" }));
    }
    if (keyboardSquare) {
      const file = FILES.indexOf(keyboardSquare[0]);
      const row = 9 - Number(keyboardSquare[1]);
      const point = pointAt(file, row);
      svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: 22, class: "cursor-square", "aria-hidden": "true" }));
    }
  }

  const pieces = svgElement("g", { "aria-hidden": "true", "pointer-events": "none" });
  let capturedPiece = null;
  board.forEach((row, rowIndex) => row.forEach((piece, file) => {
    if (!piece) return;
    if (animateMove && movingMove.to === squareAt(file, rowIndex)) return;
    const point = pointAt(file, rowIndex);
    pieces.append(pieceElement(piece, point));
  }));
  if (animateMove && movingMove.captured) {
    capturedPiece = pieceElement(movingMove.captured, pointAt(FILES.indexOf(movingMove.to[0]), 9 - Number(movingMove.to[1])));
    pieces.append(capturedPiece);
  }
  svg.append(pieces);

  if (pattern) {
    for (const square of [...(pattern.squares || []), pattern.king]) {
      if (typeof square !== "string" || !/^[a-i][0-9]$/.test(square)) continue;
      const point = pointAt(FILES.indexOf(square[0]), 9 - Number(square[1]));
      svg.append(svgElement("circle", { cx: point.x, cy: point.y, r: 22, class: `mate-piece-ring${square === pattern.king ? " mate-king-ring" : ""}`, "aria-hidden": "true" }));
    }
  }

  if (typeof hintMove === "string" && /^[a-i][0-9][a-i][0-9]$/i.test(hintMove)) {
    const fromFile = FILES.indexOf(hintMove[0]);
    const fromRow = 9 - Number(hintMove[1]);
    const toFile = FILES.indexOf(hintMove[2]);
    const toRow = 9 - Number(hintMove[3]);
    if (fromFile >= 0 && toFile >= 0) {
      const from = pointAt(fromFile, fromRow);
      const to = pointAt(toFile, toRow);
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const inset = Math.min(21, length / 3);
      const unitX = (to.x - from.x) / length;
      const unitY = (to.y - from.y) / length;
      const markerId = `${svg.id}-review-arrow`;
      const defs = svgElement("defs");
      const marker = svgElement("marker", {
        id: markerId,
        markerWidth: 8,
        markerHeight: 8,
        refX: 7,
        refY: 4,
        orient: "auto",
        markerUnits: "strokeWidth",
      });
      marker.append(svgElement("path", { d: "M0 0L8 4L0 8Z", class: "review-arrow-head" }));
      defs.append(marker);
      svg.append(defs);
      svg.append(svgElement("line", {
        x1: from.x + unitX * inset,
        y1: from.y + unitY * inset,
        x2: to.x - unitX * inset,
        y2: to.y - unitY * inset,
        class: "review-best-arrow",
        "marker-end": `url(#${markerId})`,
        "aria-hidden": "true",
      }));
    }
  }

  let movement = null;
  let landing = null;
  if (animateMove) {
    const fromFile = FILES.indexOf(movingMove.from[0]);
    const fromRow = 9 - Number(movingMove.from[1]);
    const toFile = FILES.indexOf(movingMove.to[0]);
    const toRow = 9 - Number(movingMove.to[1]);
    const fromPoint = pointAt(fromFile, fromRow);
    const toPoint = pointAt(toFile, toRow);
    const character = handCharacterFor(movingMove.piece.color);
    const bottomSeat = movingMove.piece.color === (flipped ? "b" : "r");
    const angle = bottomSeat ? 90 : -90;
    const homeY = bottomSeat ? 560 : -60;
    const homeX = bottomSeat ? 350 : 100;
    const entry = { x: Math.max(-70, Math.min(70, homeX - fromPoint.x)), y: homeY - fromPoint.y };
    const exit = { x: Math.max(-70, Math.min(70, homeX - toPoint.x)), y: homeY - toPoint.y };
    const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
    const duration = (window.npSettings.getPreferences().motion === "full" ? 1260 : 1080)
      + Math.min(180, distance * .35) + Math.min(160, Math.abs(entry.y) * .3);
    const timing = { duration, fill: "forwards", easing: "linear" };
    const glide = "cubic-bezier(.4, 0, .2, 1)";
    const shadow = svgElement("ellipse", { cx: 0, cy: 3, rx: 18, ry: 9, class: "piece-lift-shadow", "aria-hidden": "true" });
    const ripple = svgElement("circle", { cx: 0, cy: 0, r: 20, class: "piece-land-ripple", "aria-hidden": "true" });
    const carrier = svgElement("g", {
      class: "piece-motion", "aria-hidden": "true", "pointer-events": "none",
      "data-piece-move-animation": "lift-carry-land", "data-move-from": movingMove.from, "data-move-to": movingMove.to,
    });
    if (movingMove.opponent) carrier.setAttribute("data-engine-move-animation", "");
    const movingPiece = pieceElement(movingMove.piece, { x: 0, y: 0 }, "moving-piece");
    const handLayer = svgElement("g", { class: "hand-board-layer", "aria-hidden": "true", "pointer-events": "none", "clip-path": `url(#${svg.id}-hand-clip)` });
    const handCarrier = svgElement("g", { class: "hand-transport" });
    const hand = svgElement("g", { class: "piece-hand", "aria-hidden": "true", "data-hand-character": character, "data-hand-seat": movingMove.piece.color });
    hand.dataset.handStyle = "painted";
    const handDefs = svgElement("defs");
    const clip = svgElement("clipPath", { id: `${svg.id}-hand-clip`, clipPathUnits: "userSpaceOnUse" });
    clip.append(svgElement("rect", { x: -14, y: -24, width: 478, height: 538, rx: 12 }));
    handDefs.append(clip);
    hand.append(handDefs);
    const illustration = svgElement("g", { class: "hand-illustration", transform: `rotate(${angle})` });
    const sprite = HAND_SPRITES[character];
    if (sprite.ready) {
      const cellWidth = sprite.image.naturalWidth / 2;
      const cellHeight = sprite.image.naturalHeight / 2;
      const width = 190;
      const height = width * cellHeight / cellWidth;
      // ponytail: extend sleeve texels to the table edge; authored full-arm sheets can replace this strip.
      const sleeve = svgElement("svg", {
        class: "hand-sleeve-extension", x: 0, y: -20, width: 700, height: 40,
        viewBox: `${cellWidth * .945} ${cellHeight * .03} ${cellWidth * .035} ${cellHeight * .05}`,
        transform: "translate(100 -120) rotate(-50)", preserveAspectRatio: "none", overflow: "hidden",
      });
      sleeve.append(svgElement("image", { href: sprite.image.src, width: sprite.image.naturalWidth, height: sprite.image.naturalHeight }));
      illustration.append(sleeve);
      for (const [index, pose] of ["reach", "close", "hold", "release"].entries()) {
        const frame = svgElement("svg", {
          class: "hand-frame", "data-pose": pose,
          x: -width * .35, y: -height * .81, width, height,
          viewBox: `${(index % 2) * cellWidth} ${Math.floor(index / 2) * cellHeight} ${cellWidth} ${cellHeight}`,
          overflow: "hidden", opacity: index === 0 ? 1 : 0,
        });
        frame.append(svgElement("image", {
          href: sprite.image.src, width: sprite.image.naturalWidth, height: sprite.image.naturalHeight,
          preserveAspectRatio: "none",
        }));
        illustration.append(frame);
        // ponytail: blend complete painted poses; add more authored frames if finer finger motion is needed.
        const ranges = [[0, .12, .18], [.12, .18, .2, .25], [.2, .25, .74, .8], [.74, .8, 1]];
        const range = ranges[index];
        const frames = index === 0
          ? [{ opacity: 1, offset: 0 }, { opacity: 1, offset: range[1] }, { opacity: 0, offset: range[2] }, { opacity: 0, offset: 1 }]
          : index === 3
            ? [{ opacity: 0, offset: 0 }, { opacity: 0, offset: range[0] }, { opacity: 1, offset: range[1] }, { opacity: 1, offset: 1 }]
            : [{ opacity: 0, offset: 0 }, { opacity: 0, offset: range[0] }, { opacity: 1, offset: range[1] }, { opacity: 1, offset: range[2] }, { opacity: 0, offset: range[3] }, { opacity: 0, offset: 1 }];
        frame.animate(frames, timing);
      }
    }
    hand.append(illustration);
    carrier.append(shadow, movingPiece);
    handCarrier.append(hand);
    handLayer.append(handCarrier);
    svg.append(ripple, carrier, handLayer);
    const translate = point => `translate(${point.x}px, ${point.y}px)`;
    // One uninterrupted glide; the independent lift/hand tracks overlap instead of stopping at every pose.
    const travelFrames = [
      { transform: translate(fromPoint), offset: 0 },
      { transform: translate(fromPoint), offset: .28, easing: glide },
      { transform: translate(toPoint), offset: .65 },
      { transform: translate(toPoint), offset: 1 },
    ];
    movement = carrier.animate(travelFrames, timing);
    handCarrier.animate(travelFrames, timing);
    const lift = (height, scale = 1, rotation = 0) => `translateY(${-height}px) scale(${scale}, ${height ? scale * .93 : scale}) rotate(${rotation}deg)`;
    landing = movingPiece.animate([
      { transform: lift(0), offset: 0 },
      { transform: lift(0), offset: .25 / .73, easing: glide },
      { transform: lift(24, 1.12, -2), offset: .37 / .73, easing: "ease-in-out" },
      { transform: lift(26, 1.12, 1), offset: .55 / .73, easing: glide },
      { transform: lift(0), offset: 1 },
    ], { ...timing, duration: duration * .73 });
    landing.finished.then(() => capturedPiece?.remove(), () => {});
    shadow.animate([
      { transform: "scale(1)", opacity: .16, filter: "blur(.6px)", offset: 0 },
      { transform: "scale(1)", opacity: .16, filter: "blur(.6px)", offset: .25, easing: glide },
      { transform: "translate(3px, 3px) scale(1.4)", opacity: .11, filter: "blur(2.5px)", offset: .37 },
      { transform: "translate(3px, 3px) scale(1.4)", opacity: .11, filter: "blur(2.5px)", offset: .55, easing: glide },
      { transform: "scale(1)", opacity: .16, filter: "blur(.6px)", offset: .73 },
      { transform: "scale(1)", opacity: .16, filter: "blur(.6px)", offset: 1 },
    ], timing);
    hand.animate([
      { opacity: 0, transform: `${translate(entry)} rotate(${bottomSeat ? -6 : 6}deg)`, offset: 0, easing: glide },
      { opacity: 1, transform: "translate(0, 0)", offset: .25, easing: glide },
      { opacity: 1, transform: lift(24, 1.02, -2), offset: .37, easing: "ease-in-out" },
      { opacity: 1, transform: lift(26, 1.02, 1), offset: .55, easing: glide },
      { opacity: 1, transform: "translate(0, 0)", offset: .73 },
      { opacity: 1, transform: "translate(0, 0)", offset: .8, easing: glide },
      { opacity: 0, transform: `${translate(exit)} rotate(${bottomSeat ? -6 : 6}deg)`, offset: 1 },
    ], timing);
    ripple.animate([
      { opacity: 0, transform: translate(toPoint), offset: 0 },
      { opacity: 0, transform: translate(toPoint), offset: .725 },
      { opacity: .35, transform: `${translate(toPoint)} scale(1.05)`, offset: .75 },
      { opacity: 0, transform: `${translate(toPoint)} scale(1.55)`, offset: .86 },
      { opacity: 0, transform: `${translate(toPoint)} scale(1.55)`, offset: 1 },
    ], timing);
  }

  if (interactive) {
    const hitAreas = svgElement("g", { class: "board-hit-areas" });
    for (let displayRow = 0; displayRow < 10; displayRow += 1) {
      const rowIndex = flipped ? 9 - displayRow : displayRow;
      const rowNode = svgElement("g", { role: "row", "aria-rowindex": displayRow + 1 });
      for (let displayFile = 0; displayFile < 9; displayFile += 1) {
        const file = flipped ? 8 - displayFile : displayFile;
        const piece = board[rowIndex][file];
        const point = pointAt(file, rowIndex);
        const square = squareAt(file, rowIndex);
        const pieceName = piece ? window.npI18n.pieceName(piece.color, piece.type) : t("emptySquare");
        rowNode.append(svgElement("rect", {
          id: `${svg.id}-square-${square}`,
          x: point.x - 22,
          y: point.y - 22,
          width: 44,
          height: 44,
          rx: 5,
          class: "board-square-hit",
          "data-square": square,
          role: "gridcell",
          "aria-rowindex": displayRow + 1,
          "aria-colindex": displayFile + 1,
          "aria-selected": String(selectedSquare === square),
          tabindex: "-1",
          "aria-label": `${pieceName}, ${t("fileRank", { file: square[0], rank: square[1] })}`,
        }));
      }
      hitAreas.append(rowNode);
    }
    svg.append(hitAreas);
  }
  return movement ? { finished: movement.finished, landed: landing.finished } : null;
}

function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = window.npI18n.localizeStatus(message);
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.hidden = true; }, 2600);
}

function showScreen(name) {
  if (name !== "match") stopVariation(false);
  if (name !== "match") cancelFinishPresentation();
  if (name !== "match") cancelBoardMotion();
  document.body.dataset.view = name;
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === name);
    screen.setAttribute("aria-hidden", String(screen.dataset.screen !== name));
  });
  if (name === "result") document.querySelector("#result-title").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function moveNotation(move, game) {
  if (!move || move.length !== 4) return "—";
  if (window.npI18n.getLanguage() !== "zh") return `${move.slice(0, 2)} → ${move.slice(2, 4)}`;
  if (game) {
    const fromFile = FILES.indexOf(move[0].toLowerCase());
    const fromRow = 9 - Number(move[1]);
    const piece = game.board()[fromRow]?.[fromFile];
    const notation = window.NinePalaceNotation.formatMove(move, piece?.color, piece?.type, game.board());
    if (notation) return notation;
  }
  return `${move.slice(0, 2)} → ${move.slice(2, 4)}`;
}

function gameAtPly(moves, ply) {
  const game = new window.NinePalaceXiangqi();
  for (let index = 0; index < ply; index += 1) {
    if (!game.move(moves[index])) throw new Error(`棋谱回放遇到非法着法：${moves[index]}`);
  }
  return game;
}

function moveNotations(moves, game = new window.NinePalaceXiangqi()) {
  const notations = [];
  for (const move of moves) {
    notations.push(moveNotation(move, game));
    if (!game.move(move)) throw new Error(`棋谱回放遇到非法着法：${move}`);
  }
  return notations;
}

function readSavedGames() {
  try {
    const value = JSON.parse(localStorage.getItem("ninepalace.saved-games.v1") || "[]");
    return Array.isArray(value) ? value.filter((record) => record && typeof record.id === "string" && Array.isArray(record.moves)) : [];
  } catch {
    return [];
  }
}

function persistFinishedGame(nextState) {
  if (nextState.phase === "playing" && nextState.history.length === 0) {
    lastSavedGameSignature = null;
    return;
  }
  if (nextState.phase !== "finished" || !nextState.outcome) return;
  const signature = JSON.stringify([nextState.roomCode, nextState.engineId, nextState.playerColor, nextState.history, nextState.outcome]);
  if (signature === lastSavedGameSignature) return;
  try {
    const Game = window.NinePalaceXiangqi;
    const replay = new Game();
    for (const move of nextState.history) {
      if (!replay.move(move)) throw new Error(`无法重建棋谱着法 ${move}`);
    }
    const records = readSavedGames();
    records.unshift({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      finishedAt: new Date().toISOString(),
      winner: nextState.outcome.winner,
      reason: nextState.outcome.reason,
      pattern: nextState.outcome.pattern || null,
      mode: nextState.mode,
      engineId: nextState.engineId || "pikafish",
      playerColor: nextState.playerColor || "r",
      moves: [...nextState.history],
      pgn: replay.pgn(),
      finalFen: replay.fen(),
    });
    localStorage.setItem("ninepalace.saved-games.v1", JSON.stringify(records.slice(0, 30)));
    lastSavedGameSignature = signature;
  } catch (error) {
    console.warn("NinePalace 无法保存本地棋谱", error);
  }
}

function outcomeTitleKey(winner, color = "r") {
  return winner === "draw" ? "resultDraw" : winner === (color === "b" ? "black" : "red") ? "resultWin" : "resultLoss";
}

function outcomeReason(reason) {
  const keys = {
    "将帅被吃": "reasonCapture",
    "将死": "reasonCheckmate",
    "无棋可走": "reasonStalemate",
    "达到本地原型的和棋条件": "reasonDraw",
    "你选择认输": "reasonResign",
    "红方认输": "resignRed",
    "黑方认输": "resignBlack",
  };
  return t(keys[reason] || "resultDefault");
}

function friendOutcomeTitle(outcome, color = state?.playerColor) {
  if (outcome?.winner === "draw") return t("friendDraw");
  return outcome?.winner === (color === "b" ? "black" : "red") ? t("friendWin") : t("friendLoss");
}

function recordOutcomeTitle(record) {
  if (record.mode === "friend") return friendOutcomeTitle(record, record.playerColor);
  return t(outcomeTitleKey(record.winner, record.playerColor), { engine: engineNameFor(record.engineId) });
}

function renderHistory() {
  const list = document.querySelector("#history-list");
  list.replaceChildren();
  const records = readSavedGames();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = t("historyEmpty");
    list.append(empty);
    return;
  }
  const locale = window.npI18n.getLanguage() === "en" ? "en-US" : "zh-CN";
  for (const record of records) {
    const button = document.createElement("button");
    button.className = "history-entry";
    button.type = "button";
    button.dataset.replayId = record.id;
    const summary = document.createElement("div");
    const winner = document.createElement("strong");
    winner.textContent = recordOutcomeTitle(record);
    const details = document.createElement("span");
    const date = new Date(record.finishedAt);
    const dateLabel = Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
    details.textContent = t("historyRecord", { count: record.moves.length, date: dateLabel });
    summary.append(winner, details);
    const reason = document.createElement("span");
    reason.textContent = outcomeReason(record.reason);
    button.append(summary, reason);
    list.append(button);
  }
}

function reviewQualityLabel(quality) {
  const keys = {
    best: "reviewQualityBest",
    good: "reviewQualityGood",
    inaccuracy: "reviewQualityInaccuracy",
    mistake: "reviewQualityMistake",
    blunder: "reviewQualityBlunder",
    unknown: "reviewQualityUnknown",
  };
  return t(keys[quality] || keys.unknown);
}

function createReviewBadge(quality) {
  const badge = document.createElement("span");
  badge.className = `review-quality quality-${quality || "unknown"}`;
  badge.textContent = reviewQualityLabel(quality);
  return badge;
}

function renderReviewPanel() {
  const start = document.querySelector("#review-start");
  const progress = document.querySelector("#review-progress");
  const summary = document.querySelector("#review-summary");
  const detail = document.querySelector("#review-detail");
  const inProgress = analysisRunningId === currentReplay?.id;
  start.disabled = Boolean(analysisRunningId) || !currentReplay?.moves?.length;
  start.textContent = currentReplay?.analysis ? t("reviewRerun") : t("reviewStart");
  progress.hidden = !inProgress;
  if (inProgress) {
    const completed = analysisProgress?.completed || 0;
    const total = analysisProgress?.total || currentReplay.moves.length + 1;
    progress.textContent = t("reviewProgress", { completed, total });
  }

  const analysis = currentReplay?.analysis;
  summary.hidden = !analysis;
  if (analysis) summary.textContent = t("reviewSummary", analysis.summary);

  detail.replaceChildren();
  if (!analysis) {
    detail.hidden = false;
    const hint = document.createElement("p");
    hint.className = "review-selection-hint";
    hint.textContent = t("reviewSelectMove");
    detail.append(hint);
    return;
  }

  const review = Number.isInteger(selectedReviewIndex) ? analysis.moves[selectedReviewIndex] : null;
  if (!review) {
    detail.hidden = false;
    const hint = document.createElement("p");
    hint.className = "review-selection-hint";
    hint.textContent = t("reviewSelectMove");
    detail.append(hint);
    return;
  }

  detail.hidden = false;
  const reviewPosition = gameAtPly(currentReplay.moves, selectedReviewIndex);
  const heading = document.createElement("div");
  heading.className = "review-detail-heading";
  const moveNumber = document.createElement("strong");
  moveNumber.textContent = t("reviewMoveLabel", { move: selectedReviewIndex + 1 });
  heading.append(moveNumber, createReviewBadge(review.quality));
  detail.append(heading);

  const played = document.createElement("p");
  played.className = "review-line";
  const playedLabel = document.createElement("span");
  playedLabel.textContent = t("reviewPlayedMove");
  const playedValue = document.createElement("strong");
  playedValue.textContent = moveNotation(review.move, reviewPosition);
  played.append(playedLabel, playedValue);
  detail.append(played);

  const best = document.createElement("p");
  best.className = "review-line";
  const bestLabel = document.createElement("span");
  bestLabel.textContent = t("reviewBestMove");
  const bestValue = document.createElement("strong");
  bestValue.textContent = moveNotation(review.bestMove, reviewPosition);
  best.append(bestLabel, bestValue);
  detail.append(best);

  if (Array.isArray(review.continuation) && review.continuation.length) {
    const line = document.createElement("p");
    line.className = "review-line review-continuation";
    const lineLabel = document.createElement("span");
    lineLabel.textContent = t("reviewLineTitle");
    const lineValue = document.createElement("strong");
    lineValue.textContent = moveNotations(review.continuation, gameAtPly(currentReplay.moves, selectedReviewIndex)).join(" · ");
    line.append(lineLabel, lineValue);
    detail.append(line);
  }

  const feedback = document.createElement("p");
  feedback.className = "review-feedback";
  const feedbackKeys = {
    best: "reviewFeedbackBest",
    good: "reviewFeedbackGood",
    inaccuracy: "reviewFeedbackInaccuracy",
    mistake: "reviewFeedbackMistake",
    blunder: "reviewFeedbackBlunder",
    unknown: "reviewFeedbackUnknown",
  };
  feedback.textContent = t(feedbackKeys[review.quality] || feedbackKeys.unknown, {
    engine: engineNameFor(currentReplay.engineId),
  });
  detail.append(feedback);

  if (review.bestMove) {
    const viewButton = document.createElement("button");
    viewButton.className = "button secondary compact review-view-move";
    viewButton.type = "button";
    viewButton.dataset.reviewAction = showBestMove ? "played" : "best";
    viewButton.textContent = t(showBestMove ? "reviewViewPlayed" : "reviewViewBest");
    detail.append(viewButton);
  }
}

function saveReplayAnalysis(recordId, analysis) {
  try {
    const records = readSavedGames();
    const updated = records.map((record) => record.id === recordId ? { ...record, analysis } : record);
    localStorage.setItem("ninepalace.saved-games.v1", JSON.stringify(updated));
  } catch (error) {
    console.warn("NinePalace 无法保存复盘结果", error);
  }
}

function renderReplay() {
  if (!currentReplay) return;
  const moves = currentReplay.moves;
  const notations = moveNotations(moves);
  const game = new window.NinePalaceXiangqi();
  for (let index = 0; index < replayIndex; index += 1) {
    if (!game.move(moves[index])) throw new Error(`棋谱回放遇到非法着法：${moves[index]}`);
  }
  const selectedReview = Number.isInteger(selectedReviewIndex) ? currentReplay.analysis?.moves?.[selectedReviewIndex] : null;
  drawBoard(
    replayBoardNode,
    game.board(),
    false,
    !showBestMove && replayIndex ? moves[replayIndex - 1] : null,
    null,
    showBestMove ? selectedReview?.bestMove : null,
  );
  document.querySelector("#replay-current-move").textContent = showBestMove && selectedReview
    ? t("reviewBestPosition", { move: selectedReviewIndex + 1 })
    : replayIndex ? notations[replayIndex - 1] : t("replayStart");
  document.querySelector("#replay-position").textContent = t("replayPosition", { current: replayIndex, total: moves.length });
  document.querySelector('[data-replay-step="first"]').disabled = replayIndex === 0;
  document.querySelector('[data-replay-step="previous"]').disabled = replayIndex === 0;
  document.querySelector('[data-replay-step="next"]').disabled = replayIndex >= moves.length;
  document.querySelector('[data-replay-step="last"]').disabled = replayIndex >= moves.length;
  document.querySelector("#replay-outcome").textContent = `${recordOutcomeTitle(currentReplay)} · ${outcomeReason(currentReplay.reason)}`;

  const moveList = document.querySelector("#replay-moves");
  const focusedPly = Number.isInteger(selectedReviewIndex)
    ? selectedReviewIndex
    : replayIndex ? replayIndex - 1 : null;
  moveList.replaceChildren();
  if (!moves.length) {
    const empty = document.createElement("p");
    empty.className = "empty-moves";
    empty.textContent = t("replayNoMoves");
    moveList.append(empty);
  } else {
    for (let index = 0; index < moves.length; index += 2) {
      const row = document.createElement("div");
      row.className = "move-row review-move-row";
      const number = document.createElement("span");
      number.className = "number";
      number.textContent = String(Math.floor(index / 2) + 1).padStart(2, "0");
      row.append(number);
      for (const ply of [index, index + 1]) {
        if (ply >= moves.length) {
          const spacer = document.createElement("span");
          spacer.className = "review-move-spacer";
          row.append(spacer);
          continue;
        }
        const moveButton = document.createElement("button");
        moveButton.className = "review-move-button";
        moveButton.type = "button";
        moveButton.dataset.reviewPly = String(ply);
        moveButton.setAttribute("aria-label", `${t("reviewMoveLabel", { move: ply + 1 })} · ${notations[ply]}`);
        if (focusedPly === ply) moveButton.classList.add("selected");
        const notation = document.createElement("span");
        notation.className = "review-move-notation";
        notation.textContent = notations[ply];
        moveButton.append(notation);
        const moveReview = currentReplay.analysis?.moves?.[ply];
        if (moveReview) moveButton.append(createReviewBadge(moveReview.quality));
        row.append(moveButton);
      }
      moveList.append(row);
    }
  }
  renderReviewPanel();
}

function renderMoves(history) {
  const list = document.querySelector("#moves-list");
  const count = document.querySelector("#move-count");
  count.textContent = t("moveCount", { count: history.length });
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-moves";
    empty.textContent = t("waiting");
    list.append(empty);
    return;
  }
  const notations = moveNotations(history);
  for (let index = 0; index < history.length; index += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(Math.floor(index / 2) + 1).padStart(2, "0");
    row.append(number);
    for (const ply of [index, index + 1]) {
      const cell = document.createElement("span");
      cell.textContent = notations[ply] || "";
      if (ply < history.length && ply === history.length - 1) cell.classList.add("latest");
      row.append(cell);
    }
    list.append(row);
  }
  list.scrollTop = list.scrollHeight;
}

function renderRoomInviteLinks() {
  const picker = document.querySelector("#room-invite-address");
  const input = document.querySelector("#room-invite-link");
  const previous = picker.value || input.value;
  picker.replaceChildren();
  for (const url of roomInviteUrls) {
    const option = document.createElement("option");
    option.value = url;
    try { option.textContent = new URL(url).host; }
    catch { option.textContent = url; }
    picker.append(option);
  }
  picker.hidden = roomInviteUrls.length < 2;
  if (roomInviteUrls.length) {
    picker.value = roomInviteUrls.includes(previous) ? previous : roomInviteUrls[0];
    input.value = picker.value;
  } else {
    input.value = "";
  }
}

function renderResult() {
  if (!state?.outcome) return;
  const isFriendRoom = state.mode === "friend";
  document.querySelector(".result-card").dataset.winner = state.outcome.winner;
  const playerWon = state.outcome.winner === (state.playerColor === "b" ? "black" : "red");
  document.querySelector("#result-title").textContent = isFriendRoom
    ? friendOutcomeTitle(state.outcome)
    : t(outcomeTitleKey(state.outcome.winner, state.playerColor), { engine: currentEngineName() });
  document.querySelector("#result-reason").textContent = outcomeReason(state.outcome.reason);
  const presentation = finishCopy();
  document.querySelector("#result-emblem").textContent = state.outcome.winner === "draw" ? "和"
    : state.outcome.winner === ((state.playerColor || "r") === "r" ? "red" : "black") ? "胜" : "负";
  document.querySelector("#result-pattern").hidden = state.outcome.reason !== "将死";
  document.querySelector("#result-pattern-name").textContent = t(presentation.name);
  document.querySelector("#result-pattern-description").textContent = t(presentation.description);
  drawBoard(document.querySelector("#result-board"), state.board, false, state.history.at(-1), null, null, state.outcome.pattern);
  document.querySelector("#result-final-move").textContent = moveNotations(state.history).at(-1) || "";
  document.querySelector("#result-review").disabled = !state.history.length || !finishedRecord();
  document.querySelector("#result-score").innerHTML = isFriendRoom
    ? t(state.outcome.winner === "draw" ? "friendScoreDraw" : playerWon ? "friendScoreWin" : "friendScoreLoss")
    : state.outcome.winner === "draw" ? t("scoreDraw", { engine: currentEngineName() })
      : playerWon ? t("scoreWin", { engine: currentEngineName() })
        : t("scoreLoss", { engine: currentEngineName() });
  document.querySelector("#result-share-pgn").hidden = !isFriendRoom;
  document.querySelector('[data-screen="result"] [data-action="start"]').hidden = isFriendRoom;
  const moves = document.querySelector("#result-moves");
  moves.replaceChildren();
  const notations = moveNotations(state.history);
  for (let index = 0; index < state.history.length; index += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    for (const text of [String(Math.floor(index / 2) + 1).padStart(2, "0"), notations[index], notations[index + 1] || ""]) {
      const cell = document.createElement("span");
      cell.textContent = text;
      row.append(cell);
    }
    moves.append(row);
  }
}

function finishCopy() {
  if (state.outcome.reason === "将死") return MATING_PATTERNS[state.outcome.pattern?.id]
    || { name: "mateGeneric", description: "mateGenericDescription", symbols: ["k"] };
  if (state.outcome.reason === "无棋可走") return { name: "finishStalemate", description: "finishStalemateDescription", symbols: ["k"] };
  if (state.outcome.winner === "draw") return { name: "resultDraw", description: "reasonDraw", symbols: ["k"] };
  return { name: "resultDefault", description: state.outcome.reason === "将帅被吃" ? "reasonCapture" : "finishResignation", symbols: ["k"] };
}

function renderFinishCopy() {
  const copy = finishCopy();
  finishDialog.dataset.winner = state.outcome.winner;
  document.querySelector("#finish-winner").textContent = t(state.outcome.winner === "draw" ? "resultDraw" : state.outcome.winner === "red" ? "redWins" : "blackWins");
  document.querySelector("#finish-title").textContent = t(copy.name);
  document.querySelector("#finish-description").textContent = t(copy.description);
  const symbols = document.querySelector("#finish-symbols");
  symbols.replaceChildren();
  const color = state.outcome.winner === "black" ? "b" : "r";
  const participants = (state.outcome.pattern?.squares || []).flatMap((square) => {
    if (!/^[a-i][0-9]$/.test(square)) return [];
    const piece = state.board[9 - Number(square[1])]?.[FILES.indexOf(square[0])];
    return piece?.color === color ? [piece.type] : [];
  });
  for (const type of participants.length ? participants : copy.symbols) {
    const chip = document.createElement("span");
    chip.textContent = PIECES[color][type];
    symbols.append(chip);
  }
}

function cancelFinishPresentation() {
  if (!finishPresentation) return;
  window.clearTimeout(finishPresentation.openTimer);
  window.clearTimeout(finishPresentation.resultTimer);
  finishPresentation = null;
  if (finishDialog.open) finishDialog.close();
}

function finishToResult() {
  if (!finishPresentation) return;
  cancelFinishPresentation();
  showScreen("result");
}

function openFinishWhenLanded() {
  if (!finishPresentation || finishPresentation.openTimer || boardMotion || boardMoveQueue.length) return;
  const presentation = finishPresentation;
  presentation.openTimer = window.setTimeout(() => {
    if (finishPresentation === presentation && !finishDialog.open) finishDialog.showModal();
  }, 80);
  presentation.resultTimer = window.setTimeout(finishToResult, 1980);
}

function presentGameEnd(previousState) {
  if (finishPresentation) {
    renderFinishCopy();
    return;
  }
  if (previousState?.phase === "finished") return;
  if (previousState?.phase !== "playing" || document.documentElement.classList.contains("reduce-motion")) {
    showScreen("result");
    return;
  }
  showScreen("match");
  renderFinishCopy();
  finishPresentation = { openTimer: null, resultTimer: null };
  openFinishWhenLanded();
}

finishDialog.addEventListener("close", () => {
  if (!finishDialog.open) finishToResult();
});

function finishedRecord() {
  return readSavedGames().find((record) => record.reason === state?.outcome?.reason
    && (record.playerColor || "r") === (state.playerColor || "r")
    && record.moves.length === state.history.length && record.moves.every((move, index) => move === state.history[index]));
}

function openReplay(record) {
  if (!record) return;
  currentReplay = record;
  replayIndex = 0;
  selectedReviewIndex = null;
  showBestMove = false;
  renderReplay();
  showScreen("replay");
}

function renderTutorial() {
  const panel = document.querySelector("#lesson-card");
  panel.hidden = !tutorialActive;
  if (!tutorialActive) return;
  const steps = {
    select: {
      progress: t("tutorial1Progress"),
      title: t("tutorial1Title"),
      copy: t("tutorial1Copy"),
      action: t("skipTutorial"),
    },
    move: {
      progress: t("tutorial2Progress"),
      title: t("tutorial2Title"),
      copy: t("tutorial2Copy"),
      action: t("skipTutorial"),
    },
    reply: {
      progress: t("tutorial3Progress"),
      title: t("tutorial3Title"),
      copy: t("tutorial3Copy", { engine: currentEngineName() }),
      action: t("skipTutorial"),
    },
    done: {
      progress: t("tutorialDoneProgress"),
      title: t("tutorialDoneTitle"),
      copy: t("tutorialDoneCopy"),
      action: t("finishTutorial"),
    },
  };
  const step = steps[tutorialStep];
  document.querySelector("#lesson-progress").textContent = step.progress;
  document.querySelector("#lesson-title").textContent = step.title;
  document.querySelector("#lesson-copy").textContent = step.copy;
  document.querySelector("#lesson-exit").textContent = step.action;
}

function render(nextState) {
  const previousState = state;
  state = nextState;
  if ((previousState?.playerColor || "r") !== (state.playerColor || "r")) {
    cancelBoardMotion();
    keyboardSquare = state.playerColor === "b" ? "e9" : "e0";
  }
  if (variation && (variation.baseKey !== realPositionKey() || !canUseVariation())) {
    stopVariation(false);
    toast(t("variationChanged"));
  }
  if (previousState && realPositionKey(previousState) !== realPositionKey()) clearBoardSelection();
  if (previousState?.connection !== state.connection) clearBoardSelection();
  if (state.phase !== "finished") cancelFinishPresentation();
  if (state.phase === "finished") {
    selectedSquare = null;
    legalTargets = [];
  }
  if (state.mode === "friend" && !roomInviteUrls.length && Array.isArray(state.inviteUrls)) {
    roomInviteUrls = makeRoomInviteUrls(state);
  }
  if (previousState?.phase === "playing" && state.phase === "finished" && state.history.length === previousState.history.length) {
    window.npSettings.playMoveSound({ finished: true });
  }
  persistFinishedGame(state);
  if (tutorialActive && tutorialStep === "reply" && state.phase === "playing" && state.turn === "r" && !state.thinking && state.history.length >= 2) {
    tutorialStep = "done";
  }
  queueRealBoardMoves(previousState, state);
  drawCurrentBoard();
  const isFriendRoom = state.mode === "friend";
  const connectionStatus = state.connection === "closed" ? t("remoteRoomClosed")
    : state.connection === "reconnecting" ? t("roomReconnecting") : null;
  const waitingStatus = t(state.remote ? "remoteWaiting" : "roomWaiting");
  const friendStatus = connectionStatus || (state.phase === "waiting" ? waitingStatus
    : state.phase === "playing" ? t(state.turn === state.playerColor ? "roomYourTurn" : "roomWaitingTurn") : friendOutcomeTitle(state.outcome));
  const blackPlayer = state.playerColor === "b";
  const opponentColor = blackPlayer ? "r" : "b";
  const engineName = currentEngineName();
  document.querySelector('[data-i18n="matchEyebrow"]').textContent = isFriendRoom
    ? t(state.remote ? "remoteTitle" : "roomEyebrow") : t("matchEyebrow", { engine: engineName });
  document.querySelector("#match-title").textContent = t(isFriendRoom ? "roomEyebrow" : "matchTitle");
  document.querySelector('[data-screen="match"] [data-action="home"]').textContent = t(state.remote ? "remoteLeave" : "returnHome");
  document.querySelector("#top-player-name").textContent = isFriendRoom ? t(blackPlayer ? "friendAsRed" : "friendAsBlack") : engineName;
  document.querySelector("#bottom-player-name").textContent = isFriendRoom ? t(blackPlayer ? "youAsBlack" : "youAsRed") : t("guest");
  document.querySelector("#top-player-meta").textContent = t(blackPlayer ? "redSide" : "blackSide");
  document.querySelector("#bottom-player-meta").textContent = t(blackPlayer ? "blackSide" : "redSide");
  document.querySelector("#top-avatar").textContent = PIECES[opponentColor].k;
  document.querySelector("#bottom-avatar").textContent = PIECES[blackPlayer ? "b" : "r"].k;
  document.querySelector("#top-avatar").dataset.side = opponentColor;
  document.querySelector("#bottom-avatar").dataset.side = blackPlayer ? "b" : "r";
  document.querySelector("#experience-badge").textContent = t(isFriendRoom ? state.remote ? "remoteTitle" : "roomEyebrow" : "localBadge");
  const roomPanel = document.querySelector("#friend-room-panel");
  roomPanel.hidden = !isFriendRoom;
  roomPanel.dataset.remote = String(Boolean(state.remote));
  if (isFriendRoom) {
    document.querySelector("#room-code-value").textContent = state.roomCode;
    const roomPanelStatus = document.querySelector("#room-panel-status");
    roomPanelStatus.hidden = Boolean(state.remote && (state.phase !== "waiting" || connectionStatus));
    roomPanelStatus.textContent = connectionStatus || (state.phase === "waiting" ? state.remote ? t("remoteSendCode") : waitingStatus
      : state.phase === "playing" ? t(state.remote ? "remoteTitle" : "friendMeta") : friendOutcomeTitle(state.outcome));
    document.querySelector("#lan-room-invite").hidden = Boolean(state.remote);
    document.querySelector("#remote-copy-code").hidden = !state.remote || state.connection === "closed";
    if (!state.remote && !roomInviteUrls.length) {
      try {
        const fallback = new URL("/", location.origin);
        fallback.searchParams.set("room", state.roomCode);
        if (location.protocol !== "file:") roomInviteUrls = [fallback.href];
      } catch {}
    }
    if (!state.remote) renderRoomInviteLinks();
  }
  document.querySelector("#game-status").textContent = isFriendRoom
    ? friendStatus
    : window.npI18n.localizeStatus(state.status);
  const statusPanel = document.querySelector(".status");
  statusPanel.dataset.state = state.engineFailure || connectionStatus ? "error"
    : state.phase === "finished" ? "finished"
      : state.inCheck ? "check"
        : state.thinking ? "thinking" : "ready";
  document.querySelector("#turn-label").textContent = isFriendRoom
    ? friendStatus
    : state.inCheck && state.turn === (state.playerColor || "r")
    ? (window.npI18n.getLanguage() === "en" ? "Check · Respond carefully" : "将军 · 注意应对")
    : state.thinking ? t("engineThinking")
      : state.turn === (state.playerColor || "r") ? t("userTurn") : t("waitingEngine");
  const turnPill = document.querySelector("#turn-pill");
  turnPill.hidden = Boolean(state.remote && (state.phase === "waiting" || connectionStatus));
  turnPill.textContent = isFriendRoom ? friendStatus : state.phase !== "playing" ? t("gameFinished")
    : state.thinking ? t("engineThinking") : state.turn === (state.playerColor || "r") ? t("userTurn") : t("waitingEngine");
  turnPill.classList.toggle("active-turn", state.phase === "playing" && state.turn === (state.playerColor || "r") && !state.thinking && !state.connection);
  turnPill.classList.toggle("engine-thinking", state.phase === "playing" && state.thinking);
  document.querySelector("#undo-button").hidden = isFriendRoom;
  document.querySelector("#undo-button").disabled = isFriendRoom || state.phase !== "playing" || state.thinking || state.turn !== (state.playerColor || "r") || state.history.length < 2;
  document.querySelector("#retry-button").hidden = !state.engineFailure;
  renderMoves(state.history);
  if (state.phase === "finished") {
    renderResult();
    presentGameEnd(previousState);
  }
  renderTutorial();
  renderVariationUI();
}

function makeRoomInviteUrls(result) {
  const provided = Array.isArray(result.inviteUrls) ? result.inviteUrls : [];
  const candidates = provided.length ? provided : location.protocol === "file:" ? [] : [location.origin];
  return [...new Set(candidates.map((value) => {
    try {
      const url = new URL(value, location.href);
      url.searchParams.set("room", result.roomCode);
      return url.href;
    } catch {
      return "";
    }
  }).filter(Boolean))];
}

async function copyText(value, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("copy command failed");
    }
    toast(t(successMessage));
  } catch {
    toast(t("copyFailed"));
  }
}

async function enterFriendRoom(result) {
  tutorialActive = false;
  clearBoardSelection();
  roomInviteUrls = result.state.remote ? [] : makeRoomInviteUrls(result);
  render(result.state);
  showScreen(result.state.phase === "finished" ? "result" : "match");
  if (result.state.phase !== "finished") boardNode.focus();
}

function realPositionKey(position = state) {
  if (!position) return "";
  return JSON.stringify([position.mode, position.remote, position.roomCode, position.playerColor, position.phase, position.turn, position.history, position.finalFen || position.board]);
}

function canUseVariation(position = state) {
  return Boolean(position?.phase === "playing" && !position.thinking && !tutorialActive
    && !position.connection && position.turn === (position.playerColor || "r"));
}

function clearBoardSelection() {
  selectedSquare = null;
  legalTargets = [];
  selectionRequest += 1;
}

function cancelBoardMotion() {
  boardMotion = null;
  boardMoveQueue.length = 0;
  boardNode.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  boardNode.setAttribute("aria-busy", "false");
}

function playNextBoardMove() {
  if (boardMotion || !boardMoveQueue.length) return;
  const move = boardMoveQueue.shift();
  const motion = { move };
  boardMotion = motion;
  boardNode.setAttribute("aria-busy", "true");
  const sprite = HAND_SPRITES[handCharacterFor(move.piece.color)];
  const start = () => {
    if (boardMotion !== motion) return;
    const animation = drawBoard(boardNode, move.board, true, `${move.from}${move.to}`, move, null, move.pattern);
    renderVariationUI();
    Promise.resolve(animation?.landed).then(() => {
      if (boardMotion === motion) window.npSettings.playMoveSound({ engine: move.opponent });
    }, () => {});
    Promise.resolve(animation?.finished).then(() => {
      if (boardMotion !== motion) return;
      boardMotion = null;
      if (boardMoveQueue.length) playNextBoardMove();
      else {
        drawCurrentBoard();
        renderVariationUI();
        openFinishWhenLanded();
      }
    }).catch((error) => {
      // Cancellation on undo/navigation is intentional, never a live move.
      if (error.name !== "AbortError") console.error("NinePalace 棋子动画失败", error);
    });
  };
  if (sprite.ready) start();
  else {
    renderVariationUI();
    sprite.loaded.then((ok) => {
      if (boardMotion !== motion) return;
      if (!ok) toast(window.npI18n.getLanguage() === "en" ? "Hand artwork could not load; piece animation is still available." : "手部素材未能加载，棋子动画仍可使用。");
      start();
    });
  }
}

function makeBoardMove(move, before, after, opponent = false, pattern = null) {
  return {
    from: move.slice(0, 2), to: move.slice(2),
    piece: before[9 - Number(move[1])]?.[FILES.indexOf(move[0])],
    captured: before[9 - Number(move[3])]?.[FILES.indexOf(move[2])],
    board: after, opponent, pattern,
  };
}

function queueRealBoardMoves(previous, next) {
  const continuous = previous && previous.mode === next.mode && previous.roomCode === next.roomCode
    && previous.remote === next.remote
    && (previous.playerColor || "r") === (next.playerColor || "r")
    && previous.engineId === next.engineId && previous.history.length <= next.history.length
    && previous.history.every((move, index) => move === next.history[index]);
  const advance = continuous && previous.phase === "playing" && next.history.length > previous.history.length;
  if (!continuous || (!advance && previous.finalFen !== next.finalFen)) cancelBoardMotion();
  if (!advance) return;
  const moves = next.history.slice(previous.history.length);
  if (document.body.dataset.view !== "match" || document.documentElement.classList.contains("reduce-motion")) {
    cancelBoardMotion();
    let turn = previous.turn;
    for (let index = 0; index < moves.length; index += 1) {
      window.npSettings.playMoveSound({ engine: turn !== (next.playerColor || "r") });
      turn = turn === "r" ? "b" : "r";
    }
    return;
  }
  // ponytail: one visual queue; engine/network state stays authoritative and never waits for animation.
  const game = previous.finalFen ? new window.NinePalaceXiangqi(previous.finalFen) : gameAtPly(previous.history, previous.history.length);
  const pending = [];
  for (const [index, move] of moves.entries()) {
    const before = game.board();
    if (!game.move(move)) {
      cancelBoardMotion();
      return;
    }
    const piece = before[9 - Number(move[1])]?.[FILES.indexOf(move[0])];
    pending.push(makeBoardMove(move, before, game.board(), piece?.color !== (next.playerColor || "r"),
      previous.history.length + index + 1 === next.history.length ? next.outcome?.pattern : null));
  }
  boardMoveQueue.push(...pending);
  playNextBoardMove();
}

function animateVariationMove(move, before) {
  if (document.documentElement.classList.contains("reduce-motion")) {
    window.npSettings.playMoveSound();
    return;
  }
  boardMoveQueue.push(makeBoardMove(move, before, variation.game.board()));
  playNextBoardMove();
}

function drawCurrentBoard() {
  if (!state || boardMotion) return;
  boardNode.setAttribute("aria-busy", "false");
  const game = variation?.game;
  drawBoard(boardNode, game ? game.board() : state.board, true,
    game ? game.history().at(-1) : state.history.at(-1), null, null,
    game ? null : state.outcome?.pattern);
}

function startVariation() {
  if (variation || submittingMove || boardMotion || !canUseVariation() || document.body.dataset.view !== "match") return;
  try {
    const baseFen = state.finalFen || gameAtPly(state.history, state.history.length).fen();
    const game = new window.NinePalaceXiangqi();
    if (!game.load(baseFen) || game.turn() !== state.turn) throw new Error("Invalid practice position");
    // One disposable line with undo/redo; no engine requests or saved-game writes.
    variation = { game, baseFen, baseKey: realPositionKey(), redo: [], keyboardSquare };
    clearBoardSelection();
    render(state);
    boardNode.focus({ preventScroll: true });
  } catch {
    variation = null;
    toast(t("variationUnavailable"));
  }
}

function stopVariation(redraw = true) {
  if (!variation) return;
  cancelBoardMotion();
  keyboardSquare = variation.keyboardSquare;
  variation = null;
  clearBoardSelection();
  document.querySelector(".match-table").dataset.variation = "false";
  document.querySelector("#variation-panel").hidden = true;
  document.querySelector("#variation-board-badge").hidden = true;
  document.querySelector("#live-move-card").hidden = false;
  document.querySelector("#variation-toggle").setAttribute("aria-pressed", "false");
  if (redraw && state) {
    render(state);
    if (document.body.dataset.view === "match") boardNode.focus({ preventScroll: true });
  }
}

function renderVariationUI() {
  if (!state) return;
  const active = Boolean(variation);
  const moving = Boolean(boardMotion);
  const toggle = document.querySelector("#variation-toggle");
  toggle.textContent = t(active ? "variationExit" : "variationStart");
  toggle.title = t(active ? "variationExit" : canUseVariation() ? "variationHelp" : "variationUnavailable");
  toggle.setAttribute("aria-pressed", String(active));
  toggle.disabled = !active && (submittingMove || moving || !canUseVariation());
  document.querySelector(".match-table").dataset.variation = String(active);
  document.querySelector("#variation-panel").hidden = !active;
  document.querySelector("#variation-board-badge").hidden = !active;
  document.querySelector("#live-move-card").hidden = active;
  boardNode.dataset.i18nAria = active ? "variationBoardInstructions" : "boardInstructions";
  boardNode.setAttribute("aria-label", t(boardNode.dataset.i18nAria));
  document.querySelector("#undo-button").disabled = active || submittingMove || moving || state.mode === "friend"
    || state.phase !== "playing" || state.thinking || state.turn !== (state.playerColor || "r") || state.history.length < 2;
  document.querySelector("#resign-button").disabled = active || submittingMove || moving || state.phase !== "playing" || state.thinking || Boolean(state.connection);
  document.querySelector("#retry-button").disabled = active || submittingMove || moving;
  if (!variation) return;
  const { game, redo, baseFen } = variation;
  const moves = game.history();
  const side = t(game.turn() === "r" ? "redSide" : "blackSide");
  const status = t(game.in_checkmate() ? "variationMate" : game.in_stalemate() ? "variationStalemate"
    : game.in_check() ? "variationCheck" : "variationTurn", { side });
  document.querySelector("#game-status").textContent = status;
  document.querySelector(".status").dataset.state = "variation";
  document.querySelector("#turn-label").textContent = status;
  const pill = document.querySelector("#turn-pill");
  pill.textContent = status;
  pill.classList.remove("active-turn", "engine-thinking");
  document.querySelector("#variation-count").textContent = t("moveCount", { count: moves.length });
  document.querySelector("#variation-back").disabled = submittingMove || !moves.length;
  document.querySelector("#variation-forward").disabled = submittingMove || moving || !redo.length;
  document.querySelector("#variation-reset").disabled = submittingMove || (!moves.length && !redo.length);
  const notationGame = new window.NinePalaceXiangqi(baseFen);
  const commit = document.querySelector("#variation-commit");
  commit.disabled = submittingMove || moving || !moves.length;
  commit.textContent = moves.length ? t("variationPlayFirst", { move: moveNotation(moves[0], notationGame) }) : t("variationAdopt");
  const list = document.querySelector("#variation-line");
  list.replaceChildren();
  if (!moves.length) {
    const empty = document.createElement("li");
    empty.className = "variation-empty";
    empty.textContent = t("variationEmpty");
    list.append(empty);
  }
  moves.forEach((move, index) => {
    const item = document.createElement("li");
    item.dataset.variationPly = String(index + 1);
    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const sideLabel = document.createElement("span");
    sideLabel.className = "variation-side";
    sideLabel.textContent = t(notationGame.turn() === "r" ? "redSideShort" : "blackSideShort");
    const notation = document.createElement("strong");
    notation.textContent = moveNotation(move, notationGame);
    item.append(number, sideLabel, notation);
    list.append(item);
    notationGame.move(move);
  });
  list.scrollTop = list.scrollHeight;
}

function changeVariation(action) {
  if (!variation || submittingMove) return;
  if (action === "forward" && boardMotion) return;
  cancelBoardMotion();
  const before = variation.game.board();
  if (action === "back") {
    const move = variation.game.undo();
    if (move) variation.redo.push(`${move.from}${move.to}`);
  } else if (action === "forward") {
    const move = variation.redo.at(-1);
    if (move && variation.game.move(move)) {
      variation.redo.pop();
      animateVariationMove(move, before);
    }
  } else if (action === "reset") {
    variation.game.load(variation.baseFen);
    variation.redo.length = 0;
  }
  clearBoardSelection();
  drawCurrentBoard();
  renderVariationUI();
}

function selectVariationSquare(square) {
  const game = variation.game;
  const before = game.board();
  const piece = before[9 - Number(square[1])]?.[FILES.indexOf(square[0])];
  const move = selectedSquare && legalTargets.find((candidate) => candidate.slice(2) === square);
  if (move && game.move(move)) {
    variation.redo.length = 0;
    clearBoardSelection();
    animateVariationMove(move, before);
  } else if (!game.in_checkmate() && !game.in_stalemate() && piece?.color === game.turn()) {
    selectedSquare = square;
    legalTargets = game.moves({ square });
  } else {
    clearBoardSelection();
  }
  drawCurrentBoard();
  renderVariationUI();
}

async function submitRealMove(move, practice = null) {
  if (submittingMove || boardMotion || (variation && !practice)) return;
  submittingMove = true;
  renderVariationUI();
  try {
    if (practice) {
      const latest = await window.ninepalace.getState();
      if (variation !== practice) return;
      if (realPositionKey(latest) !== practice.baseKey || realPositionKey() !== practice.baseKey || !canUseVariation(latest)) {
        stopVariation(false);
        render(latest);
        toast(t("variationChanged"));
        return;
      }
      stopVariation(false);
      render(latest);
      boardNode.focus({ preventScroll: true });
    }
    clearBoardSelection();
    keyboardSquare = move.slice(2);
    drawCurrentBoard();
    const result = await window.ninepalace.submitMove(move, window.npSettings.getPreferences().difficulty);
    if (result.ok && tutorialActive && tutorialStep === "move") {
      tutorialStep = "reply";
      renderTutorial();
    }
    if (!result.ok) toast(result.message || t("toastIllegal"));
  } catch (error) {
    toast(error.message || t("toastIllegal"));
  } finally {
    submittingMove = false;
    renderVariationUI();
  }
}

async function selectSquare(square) {
  if (boardMotion) return;
  const request = ++selectionRequest;
  keyboardSquare = square;
  boardNode.setAttribute("aria-activedescendant", `${boardNode.id}-square-${square}`);
  if (submittingMove) return;
  if (variation) {
    selectVariationSquare(square);
    return;
  }
  const playerColor = state?.playerColor || "r";
  if (!state || state.phase !== "playing" || state.thinking || state.connection || state.turn !== playerColor) return;
  const file = FILES.indexOf(square[0]);
  const row = 9 - Number(square[1]);
  const piece = state.board[row]?.[file];
  const selectedMove = selectedSquare && legalTargets.find((move) => move.slice(2, 4) === square);
  if (selectedMove) {
    await submitRealMove(selectedMove);
    return;
  }
  if (piece?.color === playerColor) {
    selectedSquare = square;
    legalTargets = [];
    drawCurrentBoard();
    const position = realPositionKey();
    const moves = await window.ninepalace.getLegalMoves(square);
    if (request !== selectionRequest || variation || submittingMove || position !== realPositionKey()) return;
    legalTargets = moves;
    drawCurrentBoard();
    if (tutorialActive && tutorialStep === "select" && square === "b2" && legalTargets.includes("b2e2")) {
      tutorialStep = "move";
      renderTutorial();
    }
    return;
  }
  selectedSquare = null;
  legalTargets = [];
  drawCurrentBoard();
}

boardNode.addEventListener("click", (event) => {
  const square = event.target.closest("[data-square]")?.getAttribute("data-square");
  if (square) {
    boardNode.focus({ preventScroll: true });
    void selectSquare(square);
  }
});

boardNode.addEventListener("keydown", (event) => {
  const file = FILES.indexOf(keyboardSquare[0]);
  const row = 9 - Number(keyboardSquare[1]);
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (event.key in offsets) {
    event.preventDefault();
    const [dx, dy] = offsets[event.key];
    const direction = boardIsFlipped() ? -1 : 1;
    const nextFile = Math.max(0, Math.min(8, file + dx * direction));
    const nextRow = Math.max(0, Math.min(9, row + dy * direction));
    keyboardSquare = squareAt(nextFile, nextRow);
    drawCurrentBoard();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void selectSquare(keyboardSquare);
  } else if (event.key === "Escape") {
    clearBoardSelection();
    drawCurrentBoard();
  }
});

document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
  switch (button.dataset.action) {
    case "variation-toggle":
      if (variation) stopVariation();
      else startVariation();
      break;
    case "variation-exit":
      stopVariation();
      boardNode.focus({ preventScroll: true });
      break;
    case "variation-back":
    case "variation-forward":
    case "variation-reset":
      changeVariation(button.dataset.action.slice("variation-".length));
      break;
    case "variation-commit":
      if (variation?.game.history().length) await submitRealMove(variation.game.history()[0], variation);
      break;
    case "start":
      tutorialActive = false;
      roomInviteUrls = [];
      stopVariation(false);
      cancelBoardMotion();
      clearBoardSelection();
      {
        const preferences = window.npSettings.getPreferences();
        keyboardSquare = preferences.playerColor === "b" ? "e9" : "e0";
        const nextState = await window.ninepalace.startGame(preferences.engineId, preferences.playerColor, preferences.difficulty);
        render(nextState);
        if (nextState.phase === "playing") {
          showScreen("match");
          boardNode.focus();
        } else {
          showScreen("home");
          toast(window.npI18n.localizeStatus(nextState.status));
        }
      }
      break;
    case "create-room":
      document.querySelector("#room-create-dialog").showModal();
      document.querySelector("#room-create-side").focus();
      break;
    case "join-room":
      document.querySelector("#room-dialog").showModal();
      document.querySelector("#room-code-input").focus();
      break;
    case "remote-room":
      openRemoteDialog();
      break;
    case "home":
      tutorialActive = false;
      if (state?.remote) render(await window.ninepalace.leaveRoom());
      renderTutorial();
      showScreen("home");
      break;
    case "history":
      renderHistory();
      showScreen("history");
      break;
    case "review-current":
      openReplay(finishedRecord());
      break;
    case "tutorial":
      tutorialActive = true;
      tutorialStep = "select";
      stopVariation(false);
      cancelBoardMotion();
      clearBoardSelection();
      keyboardSquare = "e0";
      {
        const preferences = window.npSettings.getPreferences();
        const nextState = await window.ninepalace.startGame(preferences.engineId, "r", preferences.difficulty);
        if (nextState.phase !== "playing") {
          tutorialActive = false;
          showScreen("home");
          toast(window.npI18n.localizeStatus(nextState.status));
          break;
        }
        render(nextState);
        showScreen("match");
        boardNode.focus();
      }
      break;
    case "undo": {
      if (variation || submittingMove) break;
      const result = await window.ninepalace.undo();
    if (!result.ok) toast(t("toastUndo"));
      break;
    }
    case "resign":
      if (variation || submittingMove) break;
      if (window.confirm(t("confirmResign"))) {
        const result = await window.ninepalace.resign();
        if (!result.ok && result.message) toast(result.message);
      }
      break;
    case "retry":
      if (variation || submittingMove) break;
      await window.ninepalace.retryEngine(window.npSettings.getPreferences().difficulty);
      break;
    default:
      break;
  }
}));

document.querySelector("#lesson-exit").addEventListener("click", () => {
  tutorialActive = false;
  renderTutorial();
  renderVariationUI();
  boardNode.focus();
});

document.querySelector("#room-create-submit").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try {
    const result = await window.ninepalace.createRoom(document.querySelector("#room-create-side").value);
    document.querySelector("#room-create-dialog").close();
    await enterFriendRoom(result);
  } catch (error) {
    toast(error.message || t("roomCreateFailed"));
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#room-join-submit").addEventListener("click", async () => {
  const input = document.querySelector("#room-code-input");
  try {
    const result = await window.ninepalace.joinRoom(input.value);
    document.querySelector("#room-dialog").close();
    await enterFriendRoom(result);
  } catch (error) {
    toast(error.message || t("roomJoinFailed"));
  }
});

document.querySelector("#room-code-input").addEventListener("input", (event) => {
  event.currentTarget.value = event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

document.querySelector("#room-copy-link").addEventListener("click", () => {
  const value = document.querySelector("#room-invite-link").value;
  if (value) void copyText(value, "copySuccess");
});

document.querySelector("#remote-copy-code").addEventListener("click", () => {
  if (state?.remote) void copyText(state.roomCode, "remoteCodeCopied");
});

document.querySelector("#room-invite-address").addEventListener("change", (event) => {
  document.querySelector("#room-invite-link").value = event.currentTarget.value;
});

document.querySelector("#result-share-pgn").addEventListener("click", () => {
  if (state?.pgn) void copyText(state.pgn, "pgnCopied");
});

if (location.protocol === "file:") document.querySelector("#join-room-home").hidden = true;

const remoteDialog = document.querySelector("#remote-room-dialog");
const remoteCode = document.querySelector("#remote-room-code");
const remoteSide = document.querySelector("#remote-room-side");
const remoteCreate = document.querySelector("#remote-room-create");
const remoteJoin = document.querySelector("#remote-room-join");
const remoteStatus = document.querySelector("#remote-room-status");

if (window.ninepalace.createRemoteRoom) {
  document.querySelector("#remote-room-home").hidden = false;
}

function openRemoteDialog() {
  remoteStatus.hidden = true;
  remoteDialog.showModal();
  remoteCode.focus();
}

function showRemoteStatus(key) {
  remoteStatus.textContent = t(key);
  remoteStatus.hidden = false;
}

async function requestRemoteRoom(hosting) {
  if (remoteCreate.disabled) return;
  const code = remoteCode.value;
  if (!hosting && !/^[1-9][0-9]{4}$/.test(code)) {
    remoteCode.focus();
    return showRemoteStatus("remoteBadCode");
  }
  const controls = [remoteCreate, remoteJoin, remoteCode, remoteSide];
  controls.forEach(control => { control.disabled = true; });
  showRemoteStatus(hosting ? "remoteStarting" : "remoteConnecting");
  try {
    const result = await (hosting ? window.ninepalace.createRemoteRoom(remoteSide.value) : window.ninepalace.joinRemoteRoom(code));
    if (!remoteDialog.open) {
      if (result.state) await window.ninepalace.leaveRoom();
      return;
    }
    if (!result.state) return showRemoteStatus(result.error || "remoteUnavailable");
    remoteDialog.close();
    await enterFriendRoom(result);
  } catch {
    if (remoteDialog.open) showRemoteStatus("remoteUnavailable");
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
}

remoteCode.addEventListener("input", () => {
  remoteCode.value = remoteCode.value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, 5);
  if (!remoteCreate.disabled) remoteStatus.hidden = true;
});
remoteCreate.addEventListener("click", () => void requestRemoteRoom(true));
document.querySelector("#remote-room-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void requestRemoteRoom(false);
});
document.querySelector("#remote-room-close").addEventListener("click", () => remoteDialog.close());
remoteDialog.addEventListener("close", () => {
  if (remoteCreate.disabled) void window.ninepalace.cancelRemoteRoom();
});

document.querySelector("#history-list").addEventListener("click", (event) => {
  const entry = event.target.closest("[data-replay-id]");
  if (!entry) return;
  openReplay(readSavedGames().find((record) => record.id === entry.dataset.replayId));
});

document.querySelector("#review-start").addEventListener("click", async () => {
  if (!currentReplay || analysisRunningId || !currentReplay.moves.length) return;
  const recordId = currentReplay.id;
  const moves = [...currentReplay.moves];
  analysisRunningId = recordId;
  analysisProgress = { completed: 0, total: moves.length + 1 };
  renderReplay();
  try {
    const analysis = await window.ninepalace.analyzeGame(recordId, moves, currentReplay.engineId);
    saveReplayAnalysis(recordId, analysis);
    if (currentReplay?.id === recordId) {
      currentReplay = { ...currentReplay, analysis };
      selectedReviewIndex = 0;
      replayIndex = 1;
      showBestMove = false;
    }
  } catch (error) {
    toast(`${t("reviewFailed")}${error.message || error}`);
  } finally {
    if (analysisRunningId === recordId) {
      analysisRunningId = null;
      analysisProgress = null;
    }
    if (currentReplay?.id === recordId) renderReplay();
  }
});

document.querySelector("#replay-moves").addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-ply]");
  if (!button || !currentReplay) return;
  selectedReviewIndex = Number(button.dataset.reviewPly);
  replayIndex = selectedReviewIndex + 1;
  showBestMove = false;
  renderReplay();
});

document.querySelector("#review-detail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-action]");
  if (!button || !Number.isInteger(selectedReviewIndex)) return;
  showBestMove = button.dataset.reviewAction === "best";
  replayIndex = selectedReviewIndex + (showBestMove ? 0 : 1);
  renderReplay();
});

document.querySelectorAll("[data-replay-step]").forEach((button) => button.addEventListener("click", () => {
  if (!currentReplay) return;
  selectedReviewIndex = null;
  showBestMove = false;
  switch (button.dataset.replayStep) {
    case "first": replayIndex = 0; break;
    case "previous": replayIndex = Math.max(0, replayIndex - 1); break;
    case "next": replayIndex = Math.min(currentReplay.moves.length, replayIndex + 1); break;
    case "last": replayIndex = currentReplay.moves.length; break;
    default: return;
  }
  renderReplay();
}));

window.ninepalace.onAnalysisProgress?.((progress) => {
  if (progress.recordId !== analysisRunningId) return;
  analysisProgress = progress;
  if (currentReplay?.id === progress.recordId) renderReviewPanel();
});

window.ninepalace.onState(render);
window.addEventListener("ninepalace:motion-change", () => {
  if (!document.documentElement.classList.contains("reduce-motion")) return;
  cancelBoardMotion();
  drawCurrentBoard();
  renderVariationUI();
  if (finishPresentation) finishToResult();
});
window.ninepalace.getState().then((nextState) => {
  render(nextState);
  if (nextState.mode === "friend") showScreen(nextState.phase === "finished" ? "result" : "match");
});
window.addEventListener("ninepalace:language-change", () => {
  const activeScreen = document.querySelector("[data-screen].active")?.dataset.screen;
  if (state) render(state);
  if (activeScreen === "history") {
    renderHistory();
    showScreen("history");
  } else if (activeScreen === "replay") {
    renderReplay();
    showScreen("replay");
  } else if (activeScreen && activeScreen !== "result") {
    showScreen(activeScreen);
  }
});
