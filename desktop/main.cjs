const { app, BrowserWindow, ipcMain } = require("electron");
const os = require("node:os");
const path = require("node:path");
const { randomInt } = require("node:crypto");
const { setTimeout: wait } = require("node:timers/promises");
const { Xiangqi } = require("../vendor/xiangqi-js/xiangqi.js");
const castling = require("./palace-castling.js");
const jieqi = require("./jieqi.js");
const { chooseJieqiMove } = require("./jieqi-ai.cjs");
const { resolveGameResult } = require("./game-rules.cjs");
const { reviewGame, terminalEvaluation } = require("./game-analysis.cjs");
const {
  DEFAULT_ENGINE_ID,
  engineDefinition,
  normalizeEngineId,
} = require("./engine-config.cjs");
const { UciEngine } = require("./uci-engine.cjs");
const {
  DEFAULT_DIFFICULTY,
  normalizeDifficulty,
} = require("./difficulty.cjs");
const { createWebServer } = require("./web-server.cjs");
const { createFriendRooms, normalizeRoomCode } = require("./friend-rooms.cjs");
const { connectRemoteRoom } = require("./remote-room.cjs");
const { createHostedRemoteRoom } = require("./hosted-room.cjs");
const { publicRoomAddress } = require("./room-tunnel.cjs");

let playerColor = "r";
let mainWindow = null;
let game = new Xiangqi();
let phase = "home";
let status = "开始一盘本地人机对局";
let thinking = false;
let outcome = null;
let engineFailure = false;
let engine = null;
let analysisEngine = null;
let analysisQueue = Promise.resolve();
let currentDifficulty = DEFAULT_DIFFICULTY;
let currentEngineId = DEFAULT_ENGINE_ID;
let gameGeneration = 0;
let gameRevision = 0;
let webServer = null;
let friendRoomServer = null;
let activeDesktopRoom = null;
let activeDesktopRoomUnsubscribe = null;
let remoteRoom = null;
let connectingRoom = null;
const webStateListeners = new Set();
const friendRooms = createFriendRooms();

function getLanInviteUrls(port) {
  const addresses = Object.values(os.networkInterfaces()).flatMap((interfaces) => interfaces || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
  const unique = [...new Set(addresses)];
  if (!unique.length) unique.push("127.0.0.1");
  return unique.map((address) => `http://${address}:${port}`);
}

function createWebApi(server = null, listenHost = "127.0.0.1") {
  return {
    getState: () => snapshot(),
    startGame,
    getLegalMoves,
    submitMove,
    analyzeGame: (moves, onProgress, engineId) => analyzeSavedGame(moves, onProgress, engineId),
    undo: undoGame,
    resign: resignGame,
    retryEngine,
    subscribe(listener) {
      webStateListeners.add(listener);
      return () => webStateListeners.delete(listener);
    },
    getInviteUrls(request) {
      const port = server?.address()?.port;
      if (!port) return [];
      if (listenHost === "0.0.0.0" || listenHost === "::") return getLanInviteUrls(port);
      try { return [new URL(request.url, `http://${request.headers.host}`).origin]; }
      catch { return [`http://127.0.0.1:${port}`]; }
    },
  };
}

async function startFriendRoomServer() {
  if (friendRoomServer?.listening) return getLanInviteUrls(friendRoomServer.address().port);
  const api = createWebApi();
  friendRoomServer = createWebServer({ api, friendRooms, friendRoomsOnly: true, desktopDirectory: __dirname });
  api.getInviteUrls = () => getLanInviteUrls(friendRoomServer?.address()?.port || 0);
  try {
    await new Promise((resolve, reject) => {
      friendRoomServer.once("error", reject);
      friendRoomServer.listen(0, "0.0.0.0", resolve);
    });
  } catch (error) {
    friendRoomServer = null;
    throw error;
  }
  return getLanInviteUrls(friendRoomServer.address().port);
}

function activateDesktopRoom(code, token) {
  leaveDesktopRoom();
  activeDesktopRoom = { code, token };
  activeDesktopRoomUnsubscribe = friendRooms.subscribe(code, token, (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("game:state", state);
  });
}

function cancelRemoteConnection() {
  const request = connectingRoom;
  connectingRoom = null;
  request?.abort();
}

function leaveDesktopRoom() {
  cancelRemoteConnection();
  const room = remoteRoom;
  remoteRoom = null;
  room?.close();
  activeDesktopRoomUnsubscribe?.();
  activeDesktopRoomUnsubscribe = null;
  activeDesktopRoom = null;
}

async function enterRemoteRoom(options) {
  if (connectingRoom) return { error: "remoteConnecting" };
  const request = new AbortController();
  connectingRoom = request;
  let candidate;
  request.signal.addEventListener("abort", () => candidate?.close(), { once: true });
  try {
    const onState = (state) => {
      if (remoteRoom === candidate && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("game:state", state);
    };
    const relay = process.env.NINEPALACE_RELAY_URL?.trim();
    if (relay || options.code !== undefined) {
      candidate = connectRemoteRoom({ ...options, url: relay || publicRoomAddress(options.code), onState });
    } else {
      candidate = await createHostedRemoteRoom({ ...options, signal: request.signal, onState });
    }
    request.signal.throwIfAborted();
    await candidate.ready;
    request.signal.throwIfAborted();
    const state = candidate.getState();
    if (state.connection === "closed") return { error: "remoteRoomClosed" };
    connectingRoom = null;
    leaveDesktopRoom();
    remoteRoom = candidate;
    return { state, roomCode: state.roomCode };
  } catch (error) {
    candidate?.close();
    if (request.signal.aborted) return { error: "remoteRoomClosed" };
    return { error: /^remote[A-Z]/.test(error.code) ? error.code : "remoteUnavailable" };
  } finally {
    if (connectingRoom === request) connectingRoom = null;
  }
}

function snapshot() {
  return {
    board: game.board(),
    finalFen: game.fen(),
    turn: game.turn(),
    history: game.history(),
    ...(game.draw ? { variant: castling.variant, draw: game.draw } : {}),
    ...(game.jieqi ? { variant: jieqi.variant, jieqiLog: game.log(playerColor) } : {}),
    revision: gameRevision,
    phase,
    status,
    thinking,
    outcome,
    engineFailure,
    engineId: currentEngineId,
    engineName: currentOpponentName(),
    playerColor,
    inCheck: game.in_check(),
  };
}

function analyzeSavedGame(moves, onProgress = () => {}, engineId = DEFAULT_ENGINE_ID) {
  const job = analysisQueue.then(
    () => analyzeSavedGameNow(moves, onProgress, engineId),
    () => analyzeSavedGameNow(moves, onProgress, engineId),
  );
  analysisQueue = job.then(() => undefined, () => undefined);
  return job;
}

async function analyzeSavedGameNow(moves, onProgress, engineId) {
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > 120) {
    throw new Error("棋谱无着法，或长度超过复盘上限");
  }
  const validationGame = new Xiangqi();
  for (const move of moves) {
    if (!validationGame.move(move)) throw new Error(`棋谱中存在不合法着法：${move}`);
  }

  const analyzer = createUciEngine(engineId);
  analysisEngine = analyzer;
  const evaluations = [];
  const replay = new Xiangqi();
  const total = moves.length + 1;
  try {
    for (let index = 0; index <= moves.length; index += 1) {
      if (index > 0) replay.move(moves[index - 1]);
      const terminal = terminalEvaluation(replay, resolveGameResult(replay));
      const evaluation = terminal || await analyzer.evaluatePosition(moves.slice(0, index));
      evaluations.push(evaluation);
      onProgress?.({ completed: index + 1, total });
    }
    return reviewGame(moves, evaluations);
  } finally {
    await analyzer.stop();
    if (analysisEngine === analyzer) analysisEngine = null;
  }
}

function publish() {
  gameRevision += 1;
  const current = snapshot();
  if (mainWindow && !mainWindow.isDestroyed() && !activeDesktopRoom && !remoteRoom) {
    mainWindow.webContents.send("game:state", current);
  }
  for (const listener of webStateListeners) listener(current);
}

function createUciEngine(engineId = currentEngineId, gameVariant = null) {
  return new UciEngine(engineId, {
    gameVariant,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot: path.join(__dirname, ".."),
  });
}

function currentOpponentName() {
  return game.jieqi ? "揭棋 AI" : engineDefinition(currentEngineId).name;
}

function finish(winner, reason, pattern = null) {
  phase = "finished";
  thinking = false;
  engineFailure = false;
  const title = winner === "draw" ? "本局和棋"
    : winner === (playerColor === "b" ? "black" : "red") ? "你赢了" : `${currentOpponentName()} 获胜`;
  outcome = { winner, title, reason };
  if (pattern) outcome.pattern = pattern;
  status = `${outcome.title} · ${reason}`;
}

function checkResult() {
  const result = resolveGameResult(game);
  if (!result) return false;
  finish(result.winner, result.reason, result.pattern);
  return true;
}

async function startGame(engineId = currentEngineId, color = "r", difficulty = DEFAULT_DIFFICULTY, variant = null) {
  const engineVariant = variant === castling.variant ? castling.variant : null;
  const nextEngineId = engineVariant ? "fairy-stockfish" : normalizeEngineId(engineId);
  const generation = ++gameGeneration;
  const previousEngine = engine;
  if (previousEngine && (variant === jieqi.variant || previousEngine.engineId !== nextEngineId
    || (previousEngine.gameVariant ?? null) !== engineVariant || thinking)) {
    engine = null;
    await previousEngine.stop();
  } else if (previousEngine) {
    try {
      await previousEngine.newGame();
    } catch {
      if (engine === previousEngine) engine = null;
      await previousEngine.stop();
    }
  }
  if (generation !== gameGeneration) return snapshot();
  currentEngineId = nextEngineId;
  playerColor = color === "b" ? "b" : "r";
  currentDifficulty = normalizeDifficulty(difficulty);
  if (engineVariant) game = castling.game(castling.deal(randomInt));
  else game = variant === jieqi.variant ? jieqi.game({ randomInt }) : new Xiangqi();
  phase = "playing";
  status = playerColor === "b" ? "轮到你走（黑方）" : "轮到你走（红方）";
  thinking = false;
  outcome = null;
  engineFailure = false;
  publish();
  if (playerColor === "b") void runEngineTurn(currentDifficulty);
  return snapshot();
}

function getLegalMoves(square) {
  if (phase !== "playing" || thinking || game.turn() !== playerColor || typeof square !== "string") return [];
  return game.moves({ square });
}

function submitMove(move, difficulty) {
  if (phase !== "playing" || thinking || game.turn() !== playerColor || typeof move !== "string") {
    return { ok: false, message: "现在不能落子" };
  }
  const result = game.move(move);
  if (!result) return { ok: false, message: "这步棋不符合规则" };
  currentDifficulty = normalizeDifficulty(difficulty);
  if (!checkResult()) {
    void runEngineTurn(currentDifficulty);
  } else {
    publish();
  }
  return { ok: true };
}

function undoGame() {
  if (game.jieqi || phase !== "playing" || thinking || game.turn() !== playerColor || game.history().length < 2) return { ok: false };
  game.undo();
  game.undo();
  outcome = null;
  status = playerColor === "b" ? "已悔棋，轮到你走（黑方）" : "已悔棋，轮到你走（红方）";
  publish();
  return { ok: true };
}

function resignGame() {
  if (phase !== "playing" || thinking) return { ok: false };
  finish(playerColor === "b" ? "red" : "black", "你选择认输");
  publish();
  return { ok: true };
}

function retryEngine(difficulty) {
  if (!engineFailure || phase !== "playing" || game.turn() === playerColor) return { ok: false };
  currentDifficulty = normalizeDifficulty(difficulty ?? currentDifficulty);
  void runEngineTurn(currentDifficulty);
  return { ok: true };
}

async function startWebServer(port = 4173) {
  const hostArgument = process.argv.find((argument) => argument.startsWith("--host="));
  const listenHost = hostArgument ? hostArgument.slice("--host=".length) : "127.0.0.1";
  if (!new Set(["127.0.0.1", "0.0.0.0", "::1", "::"]).has(listenHost)) {
    throw new Error("Web 服务监听地址仅支持 127.0.0.1 或 0.0.0.0");
  }
  const api = createWebApi(null, listenHost);
  webServer = createWebServer({ api, friendRooms, desktopDirectory: __dirname });
  api.getInviteUrls = (request) => {
    const actualPort = webServer?.address()?.port;
    if (!actualPort) return [];
    if (listenHost === "0.0.0.0" || listenHost === "::") return getLanInviteUrls(actualPort);
    try { return [new URL(request.url, `http://${request.headers.host}`).origin]; }
    catch { return [`http://127.0.0.1:${actualPort}`]; }
  };
  await new Promise((resolve, reject) => {
    webServer.once("error", reject);
    webServer.listen(port, listenHost, resolve);
  });
  const address = webServer.address();
  return `http://127.0.0.1:${address.port}/`;
}

function closeWebServer() {
  leaveDesktopRoom();
  const servers = [webServer, friendRoomServer].filter(Boolean);
  webServer = null;
  friendRoomServer = null;
  return Promise.all(servers.map((server) => new Promise((resolve) => {
    server.closeAllConnections?.();
    if (!server.listening) return resolve();
    server.close(resolve);
  })));
}

async function runEngineTurn(difficulty = currentDifficulty) {
  if (phase !== "playing" || game.turn() === playerColor || thinking) return;
  const generation = gameGeneration;
  thinking = true;
  engineFailure = false;
  status = `${currentOpponentName()} 正在思考…`;
  publish();
  let searchingEngine = null;
  try {
    let move;
    if (game.jieqi) {
      await wait(200);
      if (generation !== gameGeneration || phase !== "playing") return;
      move = chooseJieqiMove({ board: game.board(), finalFen: game.fen(), jieqiLog: game.log(game.turn()) }, difficulty);
    } else {
      const engineVariant = game.palaceCastling ? castling.variant : null;
      if (!engine) engine = createUciEngine(currentEngineId, engineVariant);
      searchingEngine = engine;
      const position = engineVariant ? { fen: game.fen(), legalMoves: game.moves() } : undefined;
      move = await searchingEngine.search(game.history(), difficulty, position);
    }
    if (generation !== gameGeneration || phase !== "playing") return;
    const result = game.move(move);
    if (!result) throw new Error(`引擎着法未通过规则校验：${move}`);
    thinking = false;
    if (!checkResult()) status = playerColor === "b" ? "轮到你走（黑方）" : "轮到你走（红方）";
  } catch (error) {
    await searchingEngine?.stop();
    if (generation !== gameGeneration) return;
    if (engine === searchingEngine) engine = null;
    thinking = false;
    engineFailure = true;
    status = `引擎暂时无法应手：${error.message}`;
  }
  publish();
}

async function createWindow(hidden = false, { url = null, withPreload = true, partition = null } = {}) {
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: !hidden,
    offscreen: hidden,
  };
  if (partition) webPreferences.partition = partition;
  if (withPreload) webPreferences.preload = path.join(__dirname, "preload.cjs");
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 900,
    minWidth: 980,
    minHeight: 720,
    show: !hidden,
    title: "NinePalace · 九宫象棋",
    autoHideMenuBar: true,
    backgroundColor: "#eaf8ff",
    webPreferences,
  });
  if (url) await mainWindow.loadURL(url);
  else await mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("game:get-state", () => {
  if (remoteRoom) return remoteRoom.getState();
  if (!activeDesktopRoom) return snapshot();
  const state = friendRooms.getState(activeDesktopRoom.code, activeDesktopRoom.token);
  const port = friendRoomServer?.address()?.port;
  return { ...state, inviteUrls: port ? getLanInviteUrls(port) : [] };
});
ipcMain.handle("game:start", async (_event, engineId, color, difficulty, variant) => {
  leaveDesktopRoom();
  return startGame(engineId, color, difficulty, variant);
});
ipcMain.handle("game:get-legal-moves", (_event, square) => remoteRoom ? remoteRoom.getLegalMoves(square) : activeDesktopRoom
  ? friendRooms.getLegalMoves(activeDesktopRoom.code, activeDesktopRoom.token, square)
  : getLegalMoves(square));
ipcMain.handle("game:move", (_event, move, difficulty) => remoteRoom ? remoteRoom.submitMove(move) : activeDesktopRoom
  ? friendRooms.submitMove(activeDesktopRoom.code, activeDesktopRoom.token, move)
  : submitMove(move, difficulty));
ipcMain.handle("game:undo", () => (activeDesktopRoom || remoteRoom) ? { ok: false } : undoGame());
ipcMain.handle("game:resign", () => remoteRoom ? remoteRoom.resign() : activeDesktopRoom
  ? friendRooms.resign(activeDesktopRoom.code, activeDesktopRoom.token)
  : resignGame());
ipcMain.handle("game:retry-engine", (_event, difficulty) => (activeDesktopRoom || remoteRoom) ? { ok: false } : retryEngine(difficulty));
ipcMain.handle("game:analyze", async (event, recordId, moves, engineId) => analyzeSavedGame(moves, (progress) => {
  if (!event.sender.isDestroyed()) event.sender.send("game:analysis-progress", { recordId, ...progress });
}, engineId));
ipcMain.handle("room:create", async (_event, color) => {
  const inviteUrls = await startFriendRoomServer();
  const session = friendRooms.create(color);
  activateDesktopRoom(session.roomCode, session.token);
  return { ...session, inviteUrls };
});
ipcMain.handle("room:join", (_event, rawCode) => {
  const code = normalizeRoomCode(rawCode);
  const priorToken = activeDesktopRoom?.code === code ? activeDesktopRoom.token : null;
  const session = friendRooms.join(code, priorToken);
  activateDesktopRoom(session.roomCode, session.token);
  return session;
});
ipcMain.handle("room:leave", () => {
  leaveDesktopRoom();
  return snapshot();
});
ipcMain.handle("remote:create", (_event, variant) => enterRemoteRoom({ lobby: true, variant }));
ipcMain.handle("remote:join", (_event, code) => enterRemoteRoom({ code: code ?? "", lobby: true }));
ipcMain.handle("remote:cancel", cancelRemoteConnection);
ipcMain.handle("remote:lobby-action", (_event, action, side) => remoteRoom?.lobbyAction(action, side) || { ok: false, error: "remoteRoomClosed" });

async function runSmokeTest() {
  try {
    const humanMove = "b2e2";
    const acceptedHumanMove = game.move(humanMove);
    if (!acceptedHumanMove) throw new Error(`冒烟测试的用户着法不合法：${humanMove}`);
    if (!engine) engine = new UciEngine();
    const move = await engine.search(game.history());
    const applied = game.move(move);
    if (!applied) throw new Error(`引擎返回非法应手：${move}`);
    console.log(`NINEPALACE_SMOKE_OK human=${humanMove} engine=${move} fen=${game.fen()}`);
    await engine.stop();
    app.exit(0);
  } catch (error) {
    console.error(`NINEPALACE_SMOKE_FAILED ${error.stack || error.message}`);
    await engine?.stop();
    app.exit(1);
  }
}

async function runSideUiSmokeTest() {
  await mainWindow.webContents.executeJavaScript(`(async () => {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const assert = (ok, label) => { if (!ok) throw new Error(label); };
    const board = document.querySelector('#game-board');
    const preferences = window.npSettings.getPreferences();
    const language = window.npI18n.getLanguage();
    const priorGameArchive = localStorage.getItem(SAVED_GAMES_KEY);
    const sound = window.npSettings.playMoveSound;
    const sounds = [];
    window.npSettings.playMoveSound = options => sounds.push(options || {});
    const set = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const wait = async (predicate, label) => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const position = await window.ninepalace.getState();
        if (predicate(position)) return position;
        await pause(30);
      }
      throw new Error(label);
    };
    const idle = () => wait(() => !boardMotion && !boardMoveQueue.length, '选边对局动画未结束');
    const clickMove = async move => {
      await idle();
      board.querySelector('[data-square="'+move.slice(0,2)+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
      await wait(() => legalTargets.includes(move), '翻转棋盘无法选中己方棋子：'+move);
      board.querySelector('[data-square="'+move.slice(2)+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    };
    try {
      await Promise.all(Object.values(HAND_SPRITES).map(sprite => sprite.loaded));
      for (const engineId of ['pikafish', 'fairy-stockfish']) {
        showScreen('home');
        window.npI18n.setLanguage('zh');
        set('#engine-setting',engineId);
        set('#difficulty-setting','beginner');
        set('#motion-setting',engineId === 'pikafish' ? 'full' : 'reduce');
        const seen = [];
        const stop = window.ninepalace.onState(position => seen.push(position));
        const hands = [];
        const observer = new MutationObserver(() => {
          const hand = board.querySelector('.piece-hand');
          if (hand) hands.push({side:hand.dataset.handSeat, angle:hand.querySelector('.hand-illustration').getAttribute('transform')});
        });
        observer.observe(board,{childList:true});
        try {
          document.querySelector('[data-screen="home"] [data-action="practice"]').click();
          const chooseBlack = document.querySelector('#practice-form input[value="b"]');
          assert(practiceDialog.open && practiceStart.disabled, '人机选边前开始按钮没有锁定');
          chooseBlack.click();
          assert(!practiceStart.disabled && document.body.dataset.view === 'home', '人机选择黑方后没有等待开始');
          practiceStart.click();
          assert(window.npSettings.getPreferences().playerColor === 'b'
            && JSON.parse(localStorage.getItem('ninepalace.preferences.v2')).playerColor === 'b', '执棋方偏好未保存');
          const opening = await wait(position => position.playerColor === 'b' && position.engineId === engineId
            && position.history.length === 1 && position.turn === 'b' && !position.thinking
            && document.body.dataset.view === 'match' && position, 'AI 未执红先走：'+engineId);
          await idle();
          await pause(150);
          assert(seen.some(position => position.playerColor === 'b' && position.history.length === 0 && position.thinking), '开局未进入 AI 先行状态');
          assert((await window.ninepalace.getState()).history.length === 1, 'AI 开局重复走棋');
          assert(board.dataset.orientation === 'black', '执黑时棋盘未翻转');
          const blackKing = board.querySelector('[data-square="e9"]');
          assert(Number(blackKing.getAttribute('y')) === 453 && blackKing.getAttribute('aria-rowindex') === '10', '黑将不在下方');
          assert(Number(board.querySelector('[data-square="a9"]').getAttribute('x')) === 403, '翻转棋盘未交换左右路线');
          assert(board.querySelector('.board-hit-areas [role="row"] [role="gridcell"]').dataset.square === 'i0', '读屏顺序与翻转棋盘不一致');
          assert(document.querySelector('#top-player-meta').textContent === '红方'
            && document.querySelector('#bottom-player-meta').textContent === '黑方'
            && document.querySelector('#bottom-avatar').textContent === '將'
            && document.querySelector('#bottom-avatar').dataset.side === 'b', '侧边玩家阵营信息不正确');
          assert(document.querySelector('#undo-button').disabled && !(await window.ninepalace.undo()).ok, '不能单独撤销 AI 的开局');
          assert(!(await window.ninepalace.getLegalMoves(opening.history[0].slice(2))).length, '黑方玩家可以选中红棋');
          const beforeX = blackKing.getBoundingClientRect().x;
          board.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
          assert(board.getAttribute('aria-activedescendant') === 'game-board-square-d9'
            && board.querySelector('[data-square="d9"]').getBoundingClientRect().x > beforeX, '执黑时方向键未按屏幕方向移动');
          board.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
          board.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
          assert(board.getAttribute('aria-activedescendant') === 'game-board-square-e8', '执黑时向上导航错误');
          board.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
          window.npI18n.setLanguage('en');
          assert(document.querySelector('#game-status').textContent === 'Your turn (Black)'
            && document.querySelector('#practice-form [data-i18n="playBlack"]').textContent === 'Black · Second', '执黑英文文案不正确');
          window.npI18n.setLanguage('zh');
          document.querySelector('#variation-toggle').click();
          assert(variation?.game.turn() === 'b', '执黑时无法开始推演');
          const move = variation.game.moves({square:'b7'})[0];
          assert(!!move, '黑炮没有合法着法');
          await clickMove(move);
          await idle();
          const reply = variation.game.moves()[0];
          await clickMove(reply);
          await idle();
          assert(variation.game.history().length === 2 && board.dataset.orientation === 'black'
            && (await window.ninepalace.getState()).finalFen === opening.finalFen, '执黑推演未保持实战和棋盘视角');
          sounds.length = 0;
          document.querySelector('#variation-commit').click();
          const after = await wait(position => position.history.length === 3 && position.turn === 'b' && !position.thinking && position, '执黑落子后 AI 未正确应手');
          await idle();
          assert(after.history[1] === move && after.history[0] === opening.history[0] && !variation, '推演采用未只提交第一步黑棋');
          assert(sounds.length === 2 && sounds[0].engine === false && sounds[1].engine === true, '黑方玩家和红方 AI 的落子音效未正确区分：' + JSON.stringify(sounds));
          if (engineId === 'pikafish') assert(hands.some(hand => hand.side === 'b' && hand.angle === 'rotate(90)')
            && hands.some(hand => hand.side === 'r' && hand.angle === 'rotate(-90)'), '翻转棋盘后人手进入方向不正确');
          document.querySelector('#undo-button').click();
          await wait(position => position.history.length === 1 && position.turn === 'b' && position.finalFen === opening.finalFen, '执黑悔棋未保留 AI 的开局');
          set('#motion-setting','reduce');
          assert((await window.ninepalace.resign()).ok, '执黑认输失败');
          await wait(position => position.outcome?.winner === 'red' && document.body.dataset.view === 'result', '执黑认输未判红方获胜');
          assert(document.querySelector('#result-title').textContent === engineNameFor(engineId)+' 获胜'
            && document.querySelector('#result-emblem').textContent === '负'
            && document.querySelector('#result-board').dataset.orientation === 'black', '执黑结算胜负或视角不正确');
          const record = finishedRecord();
          assert(record?.playerColor === 'b', '棋谱未保存执棋方');
          openReplay(record);
          assert(document.querySelector('#replay-board').dataset.orientation === 'black'
            && document.querySelector('#replay-outcome').textContent.includes(engineNameFor(engineId)+' 获胜'), '执黑复盘未恢复视角和胜负');
          showScreen('result');
          document.querySelector('[data-screen="result"] [data-action="start"]').click();
          await wait(position => position.playerColor === 'b' && position.history.length === 1 && !position.thinking
            && document.body.dataset.view === 'match', '再来一局未保持执黑并让 AI 先走');
          showScreen('home');
          document.querySelector('[data-screen="home"] [data-action="tutorial"]').click();
          await wait(position => position.playerColor === 'r' && position.history.length === 0
            && !position.thinking && document.body.dataset.view === 'match', '执黑偏好影响了红方入门教学');
          assert(board.dataset.orientation === 'red' && window.npSettings.getPreferences().playerColor === 'b', '教学未临时使用红方或覆盖了选边偏好');
          document.querySelector('#lesson-exit').click();
        } finally { stop(); observer.disconnect(); }
      }

      const selectPractice = (side, variant) => {
        showScreen('home');
        document.querySelector('[data-screen="home"] [data-action="practice"]').click();
        set('#practice-variant', variant);
        assert(document.querySelector('#practice-variant').value === variant, '人机玩法选项缺失');
        practiceForm.querySelector('input[value="' + side + '"]').click();
        practiceStart.click();
      };
      set('#engine-setting', 'pikafish');
      const isCastling = position => position.variant === castling.variant && position.engineId === 'fairy-stockfish'
        && !position.thinking && !position.engineFailure && document.body.dataset.view === 'match';
      selectPractice('r', castling.variant);
      const red = await wait(position => isCastling(position) && position.playerColor === 'r' && !position.history.length,
        '执红未开启王车易位');
      assert(castling.validDraw(red.draw) && document.querySelectorAll('#castling-draw-results .castling-card-badge').length === 4,
        '人机开局未显示双方抽签');
      await clickMove('e3e4');
      await wait(position => isCastling(position) && position.history.length === 2 && position.turn === 'r', '易位引擎未执黑应手');
      assert((await window.ninepalace.resign()).ok, '易位对局认输失败');
      await wait(() => document.body.dataset.view === 'result', '易位对局结果未显示');
      document.querySelector('#result-review').click();
      assert(document.body.dataset.view === 'replay' && castling.drawKey(currentReplay.draw) === castling.drawKey(red.draw),
        '易位棋谱未恢复抽签结果');
      showScreen('result');
      document.querySelector('[data-screen="result"] [data-action="start"]').click();
      await wait(position => isCastling(position) && !position.history.length, '再来一局未保留易位玩法');
      selectPractice('b', castling.variant);
      await wait(position => isCastling(position) && position.playerColor === 'b' && position.history.length === 1
        && position.turn === 'b' && board.dataset.orientation === 'black', '执黑易位未翻转棋盘或让 AI 先走');
      set('#engine-setting', 'fairy-stockfish');
      selectPractice('b', '');
      await wait(position => !position.variant && !position.thinking && !position.engineFailure && position.engineId === 'fairy-stockfish'
        && position.history.length === 1 && position.turn === 'b', '从易位切回标准 Fairy-Stockfish 后无法开局');
    } finally {
      window.npSettings.playMoveSound = sound;
      window.npSettings.setPlayerColor(preferences.playerColor);
      for (const [selector,key] of [['#engine-setting','engineId'],['#difficulty-setting','difficulty'],['#motion-setting','motion']]) set(selector,preferences[key]);
      window.npI18n.setLanguage(language);
      if (priorGameArchive === null) localStorage.removeItem(SAVED_GAMES_KEY);
      else localStorage.setItem(SAVED_GAMES_KEY, priorGameArchive);
    }
  })()`);

  // Test search failures and stale completions without requiring a broken real engine.
  await engine?.stop();
  engine = null;
  playerColor = "b";
  finish("black", "将死");
  if (outcome.title !== "你赢了") throw new Error("黑方获胜被判为引擎获胜");
  game = new Xiangqi();
  phase = "playing";
  outcome = null;
  currentEngineId = "pikafish";
  engine = { engineId: "pikafish", search: async () => { throw new Error("test opening failure"); }, stop: async () => {} };
  await runEngineTurn();
  if (!engineFailure || thinking || game.turn() !== "r" || game.history().length) throw new Error("黑方开局失败状态不正确");
  if (!retryEngine("beginner").ok) throw new Error("黑方开局无法重试 AI");
  const deadline = Date.now() + 20000;
  while (thinking && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  if (engineFailure || thinking || game.turn() !== "b" || game.history().length !== 1) throw new Error("重试后 AI 未完成开局");
  await engine?.stop();
  let rejectOldSearch;
  game = new Xiangqi();
  engine = { engineId: "pikafish", search: () => new Promise((_resolve,reject) => { rejectOldSearch = reject; }), stop: async () => {} };
  const oldTurn = runEngineTurn();
  await startGame("pikafish", "r", "beginner");
  rejectOldSearch(new Error("test stale search"));
  await oldTurn;
  if (playerColor !== "r" || thinking || engineFailure || game.history().length) throw new Error("旧的 AI 开局破坏了换边后的新对局");
  console.log("NINEPALACE_SIDE_SMOKE_OK engines=2 black-opening=ok flip=pointer+keyboard+aria hands=both-directions undo=preserves-opening variation=apply-first result+replay=perspective tutorial=red retry+stale-search=ok castling=red+black+replay+rematch");
}

async function runUiSmokeTest() {
  try {
    if (!mainWindow) await createWindow(true);
    const result = await mainWindow.webContents.executeJavaScript(`(async () => {
      const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      window.npI18n.setLanguage('zh');
      const lobby = document.querySelector('[data-screen="home"].active');
      if (!lobby || document.body.dataset.view !== 'home') throw new Error('游戏大厅没有激活');
      if (lobby.querySelector('.home-copy, .feature-row, .preview-card, #home-board')) {
        throw new Error('大厅仍然包含宣传页文案、特点标签或演示棋盘');
      }
      const lobbyActor = lobby.querySelector('.lobby-actor');
      if (lobby.querySelector('canvas') || lobbyActor?.querySelectorAll('.lobby-foot-shadow').length !== 2) {
        throw new Error('大厅没有使用带脚下阴影的 2D 立绘');
      }
      if (getComputedStyle(document.querySelector('.topbar .brand')).display !== 'none' || lobby.querySelector('#player-side, .lobby-menu-heading, .lobby-nameplate')) {
        throw new Error('大厅保留了旧的标题或选边入口');
      }
      const quote = lobby.querySelector('#lobby-character-quote');
      if (!quote?.textContent.trim() || getComputedStyle(quote).backgroundColor !== 'rgba(0, 0, 0, 0)') {
        throw new Error('角色台词未直接显示在场景中');
      }
      const accountButton = document.querySelector('#lobby-account-open');
      const characterButton = document.querySelector('#lobby-character-open');
      const settingsButton = document.querySelector('#settings-open');
      const cornerControls = [...document.querySelector('.topbar-right').children].filter(node => node.getClientRects().length);
      if (cornerControls.length !== 2 || cornerControls[0] !== characterButton || cornerControls[1] !== settingsButton) {
        throw new Error('角色和设置没有并排位于大厅右上角');
      }
      if (accountButton.getAttribute('aria-label') !== '账户' || !accountButton.querySelector('svg')
        || accountButton.getBoundingClientRect().right >= characterButton.getBoundingClientRect().left) {
        throw new Error('账户图标没有显示在大厅左上角');
      }
      const lobbyActions = ['practice', 'friend-menu', 'tutorial', 'entertainment'];
      const menuButtons = lobbyActions.map(action => lobby.querySelector('[data-action="' + action + '"]'));
      const lobbyButtons = [accountButton, ...cornerControls, ...menuButtons];
      const installButton = lobby.querySelector('#pwa-install-button');
      if (!installButton.hidden) lobbyButtons.push(installButton);
      for (const button of lobbyButtons) {
        const rect = button?.getBoundingClientRect();
        if (!rect || rect.width < 40 || rect.height < 36 || rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) {
          throw new Error('大厅入口被裁切或无法点击：' + (button?.dataset.action || button?.id));
        }
        const face = getComputedStyle(button);
        const pattern = getComputedStyle(button, '::after');
        if (Math.abs(rect.width - rect.height) > 1 || face.borderRadius !== '50%' || face.backdropFilter === 'none'
          || !pattern.backgroundImage.includes('ninepalace-piece-border.svg')
          || (button !== accountButton && button.innerText.trim() !== button.querySelector('.lobby-piece-label')?.innerText.trim())) {
          throw new Error('大厅入口未使用半透明花纹棋子和功能名称');
        }
      }
      const menuBounds = menuButtons.map(button => button.getBoundingClientRect());
      if (menuBounds[0].left <= menuBounds[1].left || menuBounds[2].left <= menuBounds[3].left
        || menuBounds.some((rect, i) => i > 0 && rect.top <= menuBounds[i - 1].top)) {
        throw new Error('大厅主棋子没有按右、左、右、左的顺序交错排列');
      }
      for (const [index, rect] of menuBounds.entries()) {
        if (menuBounds.slice(index + 1).some(other => rect.left < other.right && other.left < rect.right
          && rect.top < other.bottom && other.top < rect.bottom)) throw new Error('大厅主棋子互相遮挡');
      }
      menuButtons[3].click();
      const lobbyToast = document.querySelector('#toast');
      if (window.ninepalace.createRemoteRoom) {
        const casualMenu = document.querySelector('#entertainment-dialog');
        if (!casualMenu.open || !casualMenu.querySelector('[data-action="jieqi-room"]')) throw new Error('娱乐模式没有显示玩法选择');
        casualMenu.querySelector('[data-action="castling-room"]').click();
        const casualDialog = document.querySelector('#remote-room-dialog');
        if (!casualDialog.open || document.querySelector('#remote-room-title').textContent !== '王车易位'
          || document.querySelector('#remote-castling-info').hidden) throw new Error('娱乐模式入口没有打开王车易位');
        casualDialog.close();
      } else {
        if (lobbyToast.hidden || lobbyToast.textContent !== '请在 NinePalace Windows 客户端开房或加入。') {
          throw new Error('网页娱乐模式入口没有显示 Windows 远程联机指引');
        }
        lobbyToast.hidden = true;
      }
      accountButton.click();
      const account = document.querySelector('[data-screen="account"]');
      if (!account.classList.contains('active') || !account.querySelector('#history-list')) throw new Error('账户未显示最近棋谱');
      const accountLosses = () => Number(account.querySelector('#account-losses').textContent.replaceAll(',', ''));
      const priorAccountLosses = accountLosses();
      account.querySelector('[data-action="home"]').click();
      const border = new Image();
      border.src = './assets/ninepalace-piece-border.svg';
      await border.decode();
      const characterFiles = {
        'red-rook': ['ninepalace-red-rook-girl.png', 'redRookQuote', '绯音'],
        'red-horse': ['ninepalace-red-horse-white-tights.png', 'redHorseQuote', '朱羽'],
        'black-rook': ['ninepalace-black-rook-loli.png', 'blackRookQuote', '墨铃'],
        'black-horse': ['ninepalace-black-horse-adult.png', 'blackHorseQuote', '玄芽'],
      };
      const characterColors = new Set();
      characterButton.click();
      if (document.body.dataset.view !== 'characters') throw new Error('角色入口未打开角色界面');
      for (const [id, [file, quoteKey, name]] of Object.entries(characterFiles)) {
        const choice = document.querySelector('[data-character-id="' + id + '"]');
        if (!choice) throw new Error('角色界面缺少棋友切换按钮：' + id);
        choice.click();
        const hero = document.querySelector('#lobby-character');
        const portrait = document.querySelector('#companion-portrait');
        if (document.body.dataset.character !== id || hero.getAttribute('src') !== './assets/' + file || portrait.getAttribute('src') !== './assets/' + file) {
          throw new Error('棋友切换后立绘没有同步：' + id);
        }
        await hero.decode();
        if (quote.textContent !== window.npI18n.t(quoteKey) || document.querySelector('#companion-name').textContent !== name || choice.getAttribute('aria-pressed') !== 'true') {
          throw new Error('棋友切换后台词、名字或选中状态没有同步：' + id);
        }
        if (localStorage.getItem('ninepalace.character.v1') !== id) throw new Error('棋友选择没有保存在本机：' + id);
        if (handCharacterFor('r') !== id || handCharacterFor('b') === id) throw new Error('角色选择没有同步到执棋手：' + id);
        characterColors.add(getComputedStyle(document.body).getPropertyValue('--character-accent').trim());
      }
      if (characterColors.size !== 4) throw new Error('四位棋友没有各自独立的主题色');
      document.querySelector('[data-character-id="red-rook"]').click();
      document.querySelector('[data-screen="characters"] [data-action="home"]').click();
      if (document.body.dataset.view !== 'home') throw new Error('无法从角色界面返回大厅');
      const priorGameArchive = localStorage.getItem(SAVED_GAMES_KEY);
      const priorRecordIds = new Set(readSavedGames().map((record) => record.id));
      const previousPreferences = window.npSettings.getPreferences();
      settingsButton.click();
      const dialog = document.querySelector('#settings-dialog');
      const languageSetting = dialog.querySelector('#language-setting');
      if (!dialog.open || dialog.querySelector('#settings-player').textContent !== '访客玩家' || languageSetting.value !== 'zh') {
        throw new Error('设置未展示访客身份和当前语言');
      }
      const selectLanguage = (language) => {
        languageSetting.value = language;
        languageSetting.dispatchEvent(new Event('change', { bubbles: true }));
      };
      selectLanguage('en');
      if (document.documentElement.lang !== 'en' || !document.querySelector('[data-screen="home"] [data-action="practice"]').textContent.includes('Play vs engine')) {
        throw new Error('英文界面切换未覆盖首页关键操作');
      }
      if (localStorage.getItem('ninepalace.preferences.language') !== 'en' || dialog.querySelector('#settings-player').textContent !== 'Guest player') {
        throw new Error('语言设置没有保存或访客信息没有翻译');
      }
      selectLanguage('zh');
      if (document.documentElement.lang !== 'zh-CN' || !dialog.open) throw new Error('设置内无法切回简体中文');
      const engineSetting = document.querySelector('#engine-setting');
      if (engineSetting.value !== previousPreferences.engineId) throw new Error('对弈引擎没有从本地偏好载入');
      engineSetting.value = 'fairy-stockfish';
      engineSetting.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.npSettings.getPreferences().engineId !== 'fairy-stockfish') throw new Error('对弈引擎设置没有保存');
      const difficultySetting = document.querySelector('#difficulty-setting');
      if (difficultySetting.value !== previousPreferences.difficulty) throw new Error('人机难度设置未从本地偏好载入');
      difficultySetting.value = 'easy';
      difficultySetting.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.npSettings.getPreferences().difficulty !== 'easy') throw new Error('人机难度设置没有保存');
      const motionSetting = document.querySelector('#motion-setting');
      motionSetting.value = 'reduce';
      motionSetting.dispatchEvent(new Event('change', { bubbles: true }));
      if (!document.documentElement.classList.contains('reduce-motion')) throw new Error('减少动画偏好没有生效');
      motionSetting.value = 'full';
      motionSetting.dispatchEvent(new Event('change', { bubbles: true }));
      if (document.documentElement.classList.contains('reduce-motion')) throw new Error('完整动画偏好没有生效');
      const soundToggle = document.querySelector('#sound-toggle');
      soundToggle.checked = true;
      soundToggle.dispatchEvent(new Event('change', { bubbles: true }));
      if (!window.npSettings.getPreferences().sound) throw new Error('走棋音效开关没有保存');
      difficultySetting.value = previousPreferences.difficulty;
      difficultySetting.dispatchEvent(new Event('change', { bubbles: true }));
      motionSetting.value = previousPreferences.motion;
      motionSetting.dispatchEvent(new Event('change', { bubbles: true }));
      soundToggle.checked = previousPreferences.sound;
      soundToggle.dispatchEvent(new Event('change', { bubbles: true }));
      engineSetting.value = 'fairy-stockfish';
      engineSetting.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#settings-dialog button[type="submit"]').click();
      if (document.querySelector('#settings-dialog').open) throw new Error('设置对话框没有关闭');
      let state;
      const waitFor = async (predicate, label, timeoutMs = 10000) => {
        const deadline = Date.now() + timeoutMs;
        do {
          state = await window.ninepalace.getState();
          const value = predicate(state);
          if (value) return value;
          await pause(50);
        } while (Date.now() < deadline);
        throw new Error(label);
      };
      const playFirstTurn = async () => {
        const board = document.querySelector('#game-board');
        await waitFor(() => board.getAttribute('aria-busy') !== 'true', '上一步走棋动画没有结束');
        const cannon = board.querySelector('[data-square="b2"]');
        if (!cannon) throw new Error('棋盘缺少红炮格点 b2');
        cannon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const legalMoves = await window.ninepalace.getLegalMoves('b2');
        if (!legalMoves.includes('b2e2')) throw new Error('规则层未提供预期的红炮着法 b2e2');
        const deadline = Date.now() + 5000;
        while (!board.querySelector('.legal-dot') && Date.now() < deadline) await pause(25);
        if (!board.querySelector('.legal-dot')) throw new Error('界面没有显示合法落点');
        const target = board.querySelector('[data-square="e2"]');
        if (!target) throw new Error('棋盘缺少目标格点 e2');
        let animatedMove = null;
        const moveAnimations = [];
        let animationObserver = null;
        if (!document.documentElement.classList.contains('reduce-motion')) {
          animationObserver = new MutationObserver(() => {
            const carrier = board.querySelector('[data-piece-move-animation]');
            if (carrier && !moveAnimations.some(move => move.from === carrier.dataset.moveFrom && move.to === carrier.dataset.moveTo)) {
              const frames = carrier.querySelector('.moving-piece')?.getAnimations()[0]?.effect.getKeyframes();
              if (!board.querySelector('.piece-hand[data-hand-style="painted"] .hand-frame[data-pose="hold"] image') || !frames?.some(frame => new DOMMatrix(frame.transform).a > 1.05)) throw new Error('走棋缺少绘制人手或提起效果');
              moveAnimations.push({ from: carrier.dataset.moveFrom, to: carrier.dataset.moveTo });
            }
            const movingPiece = board.querySelector('[data-engine-move-animation]');
            if (!movingPiece) return;
            animatedMove = { from: movingPiece.dataset.moveFrom, to: movingPiece.dataset.moveTo };
            animationObserver.disconnect();
          });
          animationObserver.observe(board, { childList: true, subtree: true });
        }
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await waitFor((next) => {
          if (next.engineFailure) throw new Error(next.status);
          return next.phase === 'playing' && next.history.length === 2 && next.turn === 'r' && !next.thinking;
        }, '等待 Pikafish 应手超时', 30000);
        const moveRow = document.querySelector('#moves-list .move-row:last-child');
        if (moveRow?.children[1]?.textContent !== '炮八平五') {
          throw new Error('中文着法没有按象棋记谱显示红方炮八平五：' + JSON.stringify(Array.from(moveRow?.children || []).map((child) => child.textContent)));
        }
        if (!moveRow?.children[2]?.textContent || moveRow.children[2].textContent.includes('→')) {
          throw new Error('中文着法没有正确显示黑方应手');
        }
        if (animationObserver) {
          const animationDeadline = Date.now() + 4000;
          while (!animatedMove && Date.now() < animationDeadline) await pause(20);
          animationObserver.disconnect();
          const engineMove = state.history.at(-1);
          if (!animatedMove) throw new Error('引擎应手没有展示棋子移动动画：' + JSON.stringify({ moveAnimations, busy: board.getAttribute('aria-busy'), active:board.querySelector('[data-piece-move-animation]')?.outerHTML, history: state.history }));
          if (animatedMove.from !== engineMove.slice(0, 2) || animatedMove.to !== engineMove.slice(2, 4)) {
            throw new Error('引擎移动动画的起点/终点与实际着法不一致');
          }
          if (moveAnimations.length !== 2 || moveAnimations[0].from !== 'b2' || moveAnimations[0].to !== 'e2') throw new Error('人机双方的提子动画没有按顺序播放');
        }
        await waitFor(() => board.getAttribute('aria-busy') !== 'true', '棋子没有落稳');
      };

      const homeStart = document.querySelector('[data-screen="home"].active [data-action="practice"]');
      if (!homeStart) throw new Error('找不到首页的开始对局按钮');
      homeStart.click();
      if (!practiceDialog.open || !practiceStart.disabled) throw new Error('人机对局未要求先选择红黑方');
      document.querySelector('#practice-close').click();
      if (practiceDialog.open || (await window.ninepalace.getState()).phase !== 'home') throw new Error('关闭选边仍然开始了对局');
      homeStart.click();
      document.querySelector('#practice-form input[value="r"]').click();
      practiceStart.click();
      await waitFor((next) => next.phase === 'playing' && next.engineId === 'fairy-stockfish', '选择 Fairy-Stockfish 后没有按所选引擎开始对局');
      if (document.body.dataset.view !== 'match') throw new Error('开始对局后没有切换离开大厅布局');
      const tableBounds = document.querySelector('.match-table').getBoundingClientRect();
      if (tableBounds.bottom > innerHeight || tableBounds.left < 0 || tableBounds.right > innerWidth) {
        throw new Error('对局棋盘没有完整适配窗口');
      }
      if (document.querySelector('#demo-note') || document.querySelector('.help-copy') || document.querySelector('.match-help').open) {
        throw new Error('对局页仍然默认展开开发说明或重复的帮助文案');
      }
      const practiceBoard = document.querySelector('#game-board');
      const practiceCount = () => document.querySelectorAll('#variation-line [data-variation-ply]').length;
      const playPracticeMove = async (move) => {
        await waitFor(() => practiceBoard.getAttribute('aria-busy') !== 'true', '推演前一步动画没有结束');
        const count = practiceCount();
        practiceBoard.querySelector('[data-square="' + move.slice(0, 2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        practiceBoard.querySelector('[data-square="' + move.slice(2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        if (practiceCount() !== count + 1) throw new Error('推演无法合法落子：' + move);
        if (!document.documentElement.classList.contains('reduce-motion') && !practiceBoard.querySelector('.piece-hand[data-hand-character]')) throw new Error('推演着法缺少角色提子动画');
        await waitFor(() => practiceBoard.getAttribute('aria-busy') !== 'true', '推演棋子没有落稳');
      };
      const positionSignature = (position) => JSON.stringify([position.board, position.history, position.turn, position.phase, position.thinking, position.outcome, position.finalFen]);
      const beforePractice = positionSignature(await window.ninepalace.getState());
      const recordsBeforePractice = localStorage.getItem(SAVED_GAMES_KEY);
      document.querySelector('#variation-toggle').click();
      if (document.querySelector('#variation-panel').hidden || document.querySelector('#variation-toggle').getAttribute('aria-pressed') !== 'true') throw new Error('推演模式没有开启');
      await playPracticeMove('b2e2');
      await playPracticeMove('b7e7');
      if (document.querySelector('#variation-line strong').textContent !== '炮八平五') throw new Error('推演没有使用中文象棋记谱');
      document.querySelector('#variation-back').click();
      if (practiceCount() !== 1) throw new Error('推演退一步没有撤回单手着法');
      document.querySelector('#variation-forward').click();
      if (practiceCount() !== 2) throw new Error('推演重做没有恢复着法');
      document.querySelector('#variation-back').click();
      await playPracticeMove('a6a5');
      if (!document.querySelector('#variation-forward').disabled) throw new Error('改走其他路线后仍保留了过期重做');
      settingsButton.click();
      selectLanguage('en');
      if (practiceCount() !== 2 || !document.querySelector('#variation-title').textContent.includes('Practice')) throw new Error('英文切换丢失推演路线');
      selectLanguage('zh');
      dialog.querySelector('button[type="submit"]').click();
      document.querySelector('#variation-reset').click();
      if (practiceCount() !== 0 || !document.querySelector('#variation-commit').disabled || !document.querySelector('#variation-forward').disabled) throw new Error('推演重置没有回到实战起点');
      practiceBoard.querySelector('[data-square="b2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      for (let step = 0; step < 3; step += 1) practiceBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      practiceBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      if (practiceCount() !== 1) throw new Error('推演模式无法使用键盘落子');
      document.querySelector('#variation-exit').click();
      if (positionSignature(await window.ninepalace.getState()) !== beforePractice) throw new Error('试走或退出推演改变了实战');
      if (localStorage.getItem(SAVED_GAMES_KEY) !== recordsBeforePractice) throw new Error('推演写入了实战棋谱');
      if (!document.querySelector('#variation-panel').hidden || !practiceBoard.querySelector('[data-square="b2"]').getAttribute('aria-label').includes('红炮')) throw new Error('退出后没有还原实战棋盘');
      document.querySelector('#variation-toggle').click();
      await playPracticeMove('b2e2');
      await playPracticeMove('b7e7');
      await playPracticeMove('b0c2');
      document.querySelector('#variation-commit').click();
      await waitFor(next => next.history.length === 2 && next.turn === 'r' && !next.thinking, '采用首步后没有完成真实引擎回合', 30000);
      if (state.history[0] !== 'b2e2' || !document.querySelector('#variation-panel').hidden) throw new Error('采用首步错误提交了整条推演路线');
      await waitFor(() => !document.querySelector('#undo-button').disabled, '采用首步后的悔棋不可用');
      document.querySelector('#undo-button').click();
      await waitFor(next => next.history.length === 0 && !next.thinking, '采用首步后的测试回合无法恢复');
      await playFirstTurn();

      const undoButton = document.querySelector('#undo-button');
      await waitFor(() => !undoButton.disabled, '完整回合结束后悔棋按钮仍不可用');
      undoButton.click();
      await waitFor((next) => next.phase === 'playing' && next.history.length === 0 && next.turn === 'r' && !next.thinking,
        '悔棋没有恢复到红方初始回合');
      await waitFor(() => undoButton.disabled, '悔棋后按钮状态未刷新');

      const keyboardBoard = document.querySelector('#game-board');
      if (keyboardBoard.getAttribute('aria-rowcount') !== '10' || keyboardBoard.getAttribute('aria-colcount') !== '9') {
        throw new Error('棋盘没有暴露完整的网格尺寸');
      }
      keyboardBoard.focus();
      for (let step = 0; step < 3; step += 1) {
        keyboardBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      }
      if (keyboardBoard.getAttribute('aria-activedescendant') !== 'game-board-square-b2') {
        throw new Error('方向键导航没有同步读屏器焦点位置');
      }
      keyboardBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor(() => keyboardBoard.querySelector('#game-board-square-b2')?.getAttribute('aria-selected') === 'true'
        && keyboardBoard.querySelector('.legal-dot'), '键盘无法选中棋子或暴露其选择状态');
      for (let step = 0; step < 3; step += 1) {
        keyboardBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      keyboardBoard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor((next) => next.phase === 'playing' && next.history.length === 2 && next.turn === 'r' && !next.thinking,
        '键盘无法将红炮走到 e2 并完成引擎应手', 30000);
      await waitFor(() => !undoButton.disabled, '键盘对局结束后悔棋按钮状态未刷新');
      undoButton.click();
      await waitFor((next) => next.phase === 'playing' && next.history.length === 0 && next.turn === 'r' && !next.thinking,
        '键盘对局后的悔棋没有恢复初始局面');

      await playFirstTurn();
      window.confirm = () => true;
      document.querySelector('#resign-button').click();
      await waitFor((next) => next.phase === 'finished' && next.outcome?.winner === 'black', '认输没有结束对局');
      const resultScreen = document.querySelector('[data-screen="result"]');
      await waitFor(() => resultScreen.classList.contains('active'), '结束动画后没有显示结果页', 6000);
      if (!document.querySelector('#result-pattern').hidden) throw new Error('认输被错误标记成了命名杀法');
      await waitFor(() => document.querySelector('.result-card').dataset.winner === 'black', '结果页没有标记获胜方');
      if (!document.querySelector('#result-score').textContent.includes('Fairy-Stockfish 获胜')) {
        throw new Error('结果页没有显示所选引擎 Fairy-Stockfish');
      }
      const savedRecord = await waitFor(() => readSavedGames()
        .find((record) => !priorRecordIds.has(record.id) && record.reason === '你选择认输'), '结束对局后没有保存本地棋谱');
      if (savedRecord.moves.length !== 2 || !savedRecord.pgn || !savedRecord.finalFen || savedRecord.engineId !== 'fairy-stockfish') throw new Error('本地棋谱缺少着法、所选引擎标识、PGN 或终局局面');
      if (document.querySelector('#result-review').disabled) throw new Error('已保存棋谱但结算页复盘按钮不可用');

      const restartButton = resultScreen.querySelector('[data-action="start"]');
      if (!restartButton) throw new Error('结果页缺少再来一局按钮');
      restartButton.click();
      await waitFor((next) => next.phase === 'playing' && next.history.length === 0 && next.turn === 'r' && !next.thinking,
        '重新开局后棋局状态不正确');
      await waitFor(() => document.querySelector('[data-screen="match"].active'), '重新开局后没有返回对局页');
      document.querySelector('[data-screen="match"].active [data-action="home"]').click();
      await waitFor(() => document.querySelector('[data-screen="home"].active'), '无法从对局返回首页');
      accountButton.click();
      await waitFor(() => account.classList.contains('active')
        && Array.from(document.querySelectorAll('[data-replay-id]')).some((entry) => entry.dataset.replayId === savedRecord.id),
      '账户中的最近棋谱没有显示刚结束的对局');
      if (accountLosses() !== priorAccountLosses + 1) throw new Error('账户统计没有计入这局负局');
      Array.from(document.querySelectorAll('[data-replay-id]')).find((entry) => entry.dataset.replayId === savedRecord.id).click();
      await waitFor(() => document.querySelector('[data-screen="replay"].active')
        && document.querySelector('#replay-position').textContent === '0 / 2 手', '棋谱没有从初始局面开始回放');
      if (document.querySelector('#replay-moves .review-move-notation')?.textContent !== '炮八平五') {
        throw new Error('复盘棋谱没有显示中文象棋记谱');
      }
      document.querySelector('[data-replay-step="next"]').click();
      if (document.querySelector('#replay-position').textContent !== '1 / 2 手') throw new Error('逐手回放无法前进一步');
      document.querySelector('[data-replay-step="last"]').click();
      if (document.querySelector('#replay-position').textContent !== '2 / 2 手') throw new Error('回放无法跳到终局');
      const replayModel = new window.NinePalaceXiangqi();
      for (const move of savedRecord.moves) replayModel.move(move);
      if (replayModel.fen() !== savedRecord.finalFen) throw new Error('回放终局与保存的局面不一致');
      document.querySelector('#review-start').click();
      await waitFor(() => !document.querySelector('#review-summary').hidden
        && document.querySelectorAll('#replay-moves .review-quality').length === savedRecord.moves.length,
      '逐手复盘没有完成或未显示着法评价', 30000);
      document.querySelector('#replay-moves [data-review-ply="0"]').click();
      if (!document.querySelector('#review-detail').textContent.includes('引擎正招')) throw new Error('复盘详情没有显示引擎推荐着法');
      if (document.querySelector('#review-detail .review-line strong')?.textContent !== '炮八平五') {
        throw new Error('逐手复盘没有使用中文象棋记谱显示实战着法');
      }
      if (!document.querySelector('#review-detail .review-continuation')) throw new Error('复盘详情没有显示引擎后续变化');
      const viewBestMove = document.querySelector('#review-detail [data-review-action="best"]');
      if (!viewBestMove) throw new Error('复盘详情缺少查看正招操作');
      viewBestMove.click();
      if (!document.querySelector('#replay-board .review-best-arrow')) throw new Error('正招没有在棋盘上显示路线');
      document.querySelector('#review-detail [data-review-action="played"]').click();
      if (document.querySelector('#replay-board .review-best-arrow')) throw new Error('返回实战着法后正招箭头仍显示');
      document.querySelector('[data-screen="replay"].active [data-action="account"]').click();
      await waitFor(() => account.classList.contains('active'), '无法从回放返回账户');
      account.querySelector('[data-action="home"]').click();
      await waitFor(() => lobby.classList.contains('active'), '无法从账户返回大厅');
      document.querySelector('[data-screen="home"].active [data-action="tutorial"]').click();
      await waitFor((next) => next.phase === 'playing'
        && document.querySelector('[data-screen="match"].active')
        && !document.querySelector('#lesson-card').hidden
        && document.querySelector('#lesson-title').textContent === '先选中一枚红方棋子',
      '新手教学没有从第一步开始');
      const tutorialBoard = document.querySelector('#game-board');
      tutorialBoard.querySelector('[data-square="b2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(() => document.querySelector('#lesson-title').textContent === '选择一个合法落点',
        '选中红炮后没有进入落子教学');
      const tutorialMoves = await window.ninepalace.getLegalMoves('b2');
      if (!tutorialMoves.includes('b2e2')) throw new Error('新手教学示例着法不合法');
      tutorialBoard.querySelector('[data-square="e2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor((next) => next.phase === 'playing' && next.history.length >= 2 && next.turn === 'r' && !next.thinking
        && document.querySelector('#lesson-title').textContent === '现在可以自由对弈了',
      '红炮走子后没有完成 Pikafish 应手教学', 30000);
      document.querySelector('#lesson-exit').click();
      if (!document.querySelector('#lesson-card').hidden) throw new Error('完成教学后引导卡片未关闭');
      const completedTutorialState = await window.ninepalace.getState();
      if (completedTutorialState.history.length !== 2) throw new Error('完成教学后首个示范回合未保留');
      document.querySelector('[data-screen="match"].active [data-action="home"]').click();
      await waitFor(() => document.querySelector('[data-screen="home"].active'), '完成教学后无法返回首页');
      document.querySelector('[data-screen="home"].active [data-action="tutorial"]').click();
      await waitFor((next) => next.phase === 'playing' && next.history.length === 0 && next.turn === 'r' && !next.thinking
        && document.querySelector('#lesson-title').textContent === '先选中一枚红方棋子'
        && !document.querySelector('#lesson-card').hidden, '无法再次打开新手教学');
      document.querySelector('#lesson-exit').click();
      await waitFor(() => document.querySelector('#lesson-card').hidden, '跳过操作没有关闭教学卡片');
      engineSetting.value = previousPreferences.engineId;
      engineSetting.dispatchEvent(new Event('change', { bubbles: true }));
      if (priorGameArchive === null) localStorage.removeItem(SAVED_GAMES_KEY);
      else localStorage.setItem(SAVED_GAMES_KEY, priorGameArchive);
      const finalState = await window.ninepalace.getState();
      return { history: finalState.history, phase: finalState.phase, tutorialCompleted: true };
    })()`);
    if (result.phase !== "playing" || result.history.length !== 0 || !result.tutorialCompleted) {
      throw new Error(`新手教学完成状态不正确：${JSON.stringify(result)}`);
    }
    await runSideUiSmokeTest();
    console.log("NINEPALACE_UI_SMOKE_OK lobby=account+entertainment start=ok pointer=ok keyboard-aria=ok engine=ok undo=ok resign=result restart=ok replay=ok analysis=ok tutorial=complete+skip variation=both-sides+undo+redo+reset+cancel+apply-first side=red+black");
    await engine?.stop();
    mainWindow?.close();
    await closeWebServer();
    app.exit(0);
  } catch (error) {
    console.error(`NINEPALACE_UI_SMOKE_FAILED ${error.stack || error.message}`);
    await engine?.stop();
    mainWindow?.close();
    await closeWebServer();
    app.exit(1);
  }
}

async function waitForRoomState(window, predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  do {
    try {
      lastState = await window.webContents.executeJavaScript("window.ninepalace.getState()");
      if (predicate(lastState)) return lastState;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  } while (Date.now() < deadline);
  throw new Error(`${label}：${JSON.stringify(lastState)}`);
}

async function runFriendRoomUiSmokeTest() {
  let guestWindow = null;
  try {
    await createWindow(true, { partition: "ninepalace-friend-host-smoke" });
    for (const hostColor of ["r", "b"]) {
    await mainWindow.webContents.executeJavaScript(`(async () => {
      showScreen('home');
      const prior = await window.ninepalace.getState();
      const button = document.querySelector('[data-action="create-room"]');
      const friends = document.querySelector('[data-action="friend-menu"]');
      if (!button) throw new Error('首页缺少创建好友房入口');
      friends.click();
      if (!friendMenuDialog.open) throw new Error('好友对局菜单没有打开');
      button.click();
      const dialog = document.querySelector('#room-create-dialog');
      if (!dialog.open) throw new Error('创建好友房时未显示选边窗口');
      dialog.querySelector('button[type="submit"]').click();
      if (dialog.open || (await window.ninepalace.getState()).roomCode !== prior.roomCode) throw new Error('取消选边仍创建了房间');
      friends.click();
      button.click();
      document.querySelector('#room-create-side').value = ${JSON.stringify(hostColor)};
      const submit = document.querySelector('#room-create-submit');
      submit.click();
      if (!submit.disabled) throw new Error('创建房间没有防止重复提交');
      submit.click();
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const state = await window.ninepalace.getState();
        if (state.mode === 'friend' && state.phase === 'waiting') return state;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error('创建好友房后没有进入等待页面');
    })()`);
    let hostState = await waitForRoomState(mainWindow, (state) => state?.mode === "friend" && state.phase === "waiting", "好友房没有创建成功");
    if (hostState.playerColor !== hostColor || hostState.players.red !== (hostColor === "r")
      || hostState.players.black !== (hostColor === "b")) throw new Error("房主所选席位未正确保留");
    if (!/^[A-Z0-9]{6}$/.test(hostState.roomCode)) throw new Error(`房间码格式无效：${hostState.roomCode}`);
    if (!friendRoomServer?.listening) throw new Error("创建房间后没有启动局域网邀请服务");
    publish();
    const hostStillInRoom = await mainWindow.webContents.executeJavaScript("state?.mode === 'friend' && boardNode.dataset.orientation === (state.playerColor === 'b' ? 'black' : 'red')");
    if (!hostStillInRoom) throw new Error("本地人机状态覆盖了好友房或视角错误");

    const inviteUrl = `http://127.0.0.1:${friendRoomServer.address().port}/?room=${encodeURIComponent(hostState.roomCode)}`;
    guestWindow?.close();
    guestWindow = new BrowserWindow({
      width: 1100,
      height: 850,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, partition: `ninepalace-friend-guest-smoke-${hostColor}` },
    });
    await guestWindow.loadURL(inviteUrl);
    const guestState = await waitForRoomState(guestWindow, (state) => state?.mode === "friend" && state.phase === "playing", "访客无法通过邀请链接加入");
    const guestColor = hostColor === "r" ? "b" : "r";
    if (guestState.playerColor !== guestColor || guestState.roomCode !== hostState.roomCode) throw new Error("好友没有自动取得另一方席位");
    hostState = await waitForRoomState(mainWindow, (state) => state.phase === "playing" && state.players?.red && state.players?.black, "房主没有收到好友加入事件");
    const redWindow = hostColor === "r" ? mainWindow : guestWindow;
    const blackWindow = hostColor === "b" ? mainWindow : guestWindow;
    const wrongTurn = await blackWindow.webContents.executeJavaScript("window.ninepalace.submitMove('b7b6')");
    if (wrongTurn.ok) throw new Error("执黑玩家可以抢先走棋");

    await redWindow.webContents.executeJavaScript(`(async () => {
      const board = document.querySelector('#game-board');
      board.querySelector('[data-square="b2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const deadline = Date.now() + 3000;
      while (!board.querySelector('.legal-dot') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      const target = board.querySelector('[data-square="e2"]');
      if (!board.querySelector('.legal-dot') || !target) throw new Error('执红玩家无法选择合法着法');
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await waitForRoomState(blackWindow, (state) => state.history?.length === 1 && state.turn === "b", "执黑玩家没有收到红方着法同步");

    await blackWindow.webContents.executeJavaScript(`(async () => {
      const board = document.querySelector('#game-board');
      const waitForLanding = async () => {
        const deadline = Date.now() + 5000;
        while (board.getAttribute('aria-busy') === 'true' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
        if (board.getAttribute('aria-busy') === 'true') throw new Error('好友棋子动画没有结束');
      };
      await waitForLanding();
      document.querySelector('#variation-toggle').click();
      for (const move of ['b7e7', 'b0c2']) {
        board.querySelector('[data-square="' + move.slice(0,2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        board.querySelector('[data-square="' + move.slice(2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await waitForLanding();
      }
      if (document.querySelectorAll('#variation-line [data-variation-ply]').length !== 2) throw new Error('黑方玩家无法自行推演双方着法');
      if ((await window.ninepalace.getState()).history.length !== 1) throw new Error('黑方推演改变了好友实战');
      document.querySelector('#variation-exit').click();
      const moves = await window.ninepalace.getLegalMoves('b7');
      const move = moves.find((candidate) => candidate === 'b7b6');
      if (!move) throw new Error('黑方合法着法缺失');
      board.querySelector('[data-square="b7"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const deadline = Date.now() + 3000;
      while (!board.querySelector('.legal-dot') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      board.querySelector('[data-square="b6"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return move;
    })()`);
    hostState = await waitForRoomState(mainWindow, (state) => state.history?.length === 2 && state.turn === "r", "房主没有收到访客的着法同步");

    await guestWindow.loadURL(inviteUrl);
    const resumed = await waitForRoomState(guestWindow, (state) => state.history?.length === 2 && state.playerColor === guestColor, "好友刷新后无法恢复原席位");
    if (resumed.roomCode !== hostState.roomCode) throw new Error("重连后恢复到了错误房间");
    await mainWindow.loadFile(path.join(__dirname, "index.html"));
    await waitForRoomState(mainWindow, (state) => state.roomCode === hostState.roomCode && state.playerColor === hostColor && state.history.length === 2, "房主刷新后没有恢复原席位");

    await redWindow.webContents.executeJavaScript(`(async () => {
      const board = document.querySelector('#game-board');
      const waitForLanding = async () => {
        const deadline = Date.now() + 5000;
        while (board.getAttribute('aria-busy') === 'true' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
        if (board.getAttribute('aria-busy') === 'true') throw new Error('房主棋子动画没有结束');
      };
      await waitForLanding();
      document.querySelector('#variation-toggle').click();
      for (const move of ['h2h5', 'a6a5']) {
        board.querySelector('[data-square="' + move.slice(0,2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        board.querySelector('[data-square="' + move.slice(2) + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await waitForLanding();
      }
      if (document.querySelectorAll('#variation-line [data-variation-ply]').length !== 2) throw new Error('红方未进入私人推演');
    })()`);

    await blackWindow.webContents.executeJavaScript(`(() => {
      window.confirm = () => true;
      document.querySelector('#resign-button').click();
    })()`);
    const finalHostState = await waitForRoomState(mainWindow, (state) => state.phase === "finished", "认输后房主没有收到结束状态");
    const finalGuestState = await waitForRoomState(guestWindow, (state) => state.phase === "finished", "访客页面没有显示对局结果");
    const shareReady = await blackWindow.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 6000;
      while (!document.querySelector('[data-screen="result"]').classList.contains('active') && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return {
        visible: !document.querySelector('#result-share-pgn').hidden,
        resultScreen: document.querySelector('[data-screen="result"]').classList.contains('active'),
        correctTitle: document.querySelector('#result-title').textContent === window.npI18n.t('friendLoss'),
        pgn: (await window.ninepalace.getState()).pgn
      };
    })()`);
    if (finalHostState.outcome.winner !== "red" || finalGuestState.outcome.winner !== "red"
      || !shareReady.visible || !shareReady.resultScreen || !shareReady.correctTitle || !shareReady.pgn.includes("b2e2")) {
      throw new Error(`好友房结果或棋谱分享未就绪：${JSON.stringify(shareReady)}`);
    }
    const redTitleCorrect = await redWindow.webContents.executeJavaScript("document.querySelector('#result-title').textContent === window.npI18n.t('friendWin')");
    if (!redTitleCorrect) throw new Error("红方的获胜结算标题不正确");
    const trialCleared = await redWindow.webContents.executeJavaScript("document.querySelector('#variation-panel').hidden && document.querySelector('#variation-toggle').getAttribute('aria-pressed') === 'false'");
    if (!trialCleared || finalHostState.history.length !== 2) throw new Error("好友结束对局后没有清除私人推演或实战着法被污染");

    console.log(`NINEPALACE_FRIEND_SIDE_OK host=${hostColor} guest=${guestColor} reconnect=both-seats result=both-perspectives`);
    }

    // Exercise browser-host creation too; desktop then joins the reserved opposite seat.
    await guestWindow.webContents.executeJavaScript(`(() => {
      showScreen('home');
      window.npI18n.setLanguage('en');
      document.querySelector('[data-action="friend-menu"]').click();
      document.querySelector('[data-action="create-room"]').click();
      if (!document.querySelector('#room-create-dialog').open
        || document.querySelector('#room-create-title').textContent !== 'Create friend room') throw new Error('网页创建好友房窗口或英文文案缺失');
      document.querySelector('#room-create-side').value = 'b';
      document.querySelector('#room-create-submit').click();
    })()`);
    const browserHost = await waitForRoomState(guestWindow, state => state.mode === "friend" && state.phase === "waiting" && state.playerColor === "b", "网页创建好友房未采用执黑选择");
    await mainWindow.webContents.executeJavaScript(`window.ninepalace.joinRoom(${JSON.stringify(browserHost.roomCode)}).then(enterFriendRoom)`);
    await waitForRoomState(mainWindow, state => state.roomCode === browserHost.roomCode && state.phase === "playing" && state.playerColor === "r", "桌面加入网页好友房未取得红方");
    await waitForRoomState(guestWindow, state => state.roomCode === browserHost.roomCode && state.phase === "playing" && state.players.red, "网页房主未收到红方加入");
    console.log("NINEPALACE_FRIEND_ROOM_SMOKE_OK create=dialog+cancel+both-sides web-host=black invite=ok join=opposite-seat authoritative-turns=ok sync=ok reconnect=both-seats result=ok pgn=ok variation=private+black-seat+live-end-cancel");
    guestWindow.close();
    guestWindow = null;
    mainWindow?.close();
    await closeWebServer();
    app.exit(0);
  } catch (error) {
    console.error(`NINEPALACE_FRIEND_ROOM_SMOKE_FAILED ${error.stack || error.message}`);
    guestWindow?.close();
    mainWindow?.close();
    await closeWebServer();
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  if (process.argv.includes("--friend-room-ui-smoke-test")) {
    await runFriendRoomUiSmokeTest();
    return;
  }
  if (process.argv.includes("--web-ui-smoke-test")) {
    try {
      const url = await startWebServer(0);
      await createWindow(true, { url, withPreload: false });
      const pwa = await mainWindow.webContents.executeJavaScript(`(async () => {
        if (!('serviceWorker' in navigator)) throw new Error('当前浏览器没有 Service Worker 支持');
        const registration = await navigator.serviceWorker.ready;
        const cache = await caches.open('ninepalace-shell-v54');
        const required = ['/', '/styles.css', '/lobby.css', '/match.css', '/renderer.js', '/i18n.js', '/character-select.js', '/settings.js', '/chinese-notation.js', '/manifest.webmanifest', '/assets/ninepalace-red-rook-girl.png', '/assets/ninepalace-red-horse-white-tights.png', '/assets/ninepalace-black-rook-loli.png', '/assets/ninepalace-black-horse-adult.png', '/vendor/xiangqi-js/xiangqi.js'];
        required.push(...['red-rook', 'red-horse', 'black-rook', 'black-horse'].map(id => '/assets/ninepalace-hand-' + id + '.png'));
        required.push('/assets/ninepalace-lobby-campus.png', '/assets/ninepalace-piece-border.svg', '/palace-castling.js', '/jieqi.js');
        const missing = [];
        for (const path of required) {
          if (!await cache.match(new URL(path, location.origin).href)) missing.push(path);
        }
        return { state: registration.active?.state, missing };
      })()`);
      if (pwa.state !== "activated" || pwa.missing.length) {
        throw new Error(`PWA 离线外壳未完整就绪：${JSON.stringify(pwa)}`);
      }
      console.log("NINEPALACE_PWA_SMOKE_OK service-worker=activated cached-shell=complete");
      await runUiSmokeTest();
    } catch (error) {
      console.error(`NINEPALACE_WEB_UI_SMOKE_FAILED ${error.stack || error.message}`);
      await engine?.stop();
      mainWindow?.close();
      await closeWebServer();
      app.exit(1);
    }
    return;
  }
  if (process.argv.includes("--web-server")) {
    const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
    const port = portArgument ? Number(portArgument.slice("--port=".length)) : 4173;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error("NinePalace Web 服务端口无效，请使用 --port=1 到 --port=65535");
      app.exit(1);
      return;
    }
    try {
      const url = await startWebServer(port);
      console.log(`NINEPALACE_WEB_READY ${url}`);
      process.once("SIGINT", () => app.quit());
      process.once("SIGTERM", () => app.quit());
    } catch (error) {
      console.error(`NINEPALACE_WEB_FAILED ${error.message}`);
      app.exit(1);
    }
    return;
  }
  if (process.argv.includes("--ui-smoke-test")) {
    await runUiSmokeTest();
    return;
  }
  if (process.argv.includes("--smoke-test")) {
    await runSmokeTest();
    return;
  }
  await createWindow();
});

app.on("before-quit", () => {
  void engine?.stop();
  void analysisEngine?.stop();
  void closeWebServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
