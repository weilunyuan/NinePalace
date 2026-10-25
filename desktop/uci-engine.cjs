const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { parseEngineEvaluation } = require("./game-analysis.cjs");
const {
  DEFAULT_ENGINE_ID,
  engineDefinition,
  enginePaths,
  fromEngineMove,
  normalizeEngineId,
  normalizeEngineInfoLine,
  toEngineMove,
} = require("./engine-config.cjs");
const {
  DEFAULT_DIFFICULTY,
  candidateMovesFromInfo,
  chooseCandidateMove,
  searchProfileFor,
} = require("./difficulty.cjs");

class UciEngine {
  constructor(engineId = DEFAULT_ENGINE_ID, pathOptions = {}) {
    this.engineId = normalizeEngineId(engineId);
    this.definition = engineDefinition(this.engineId);
    this.pathOptions = pathOptions;
    this.child = null;
    this.lines = [];
    this.waiters = [];
    this.starting = null;
    this.closePromise = null;
    this.stderr = "";
    this.searchInfo = null;
  }

  async start() {
    if (this.child && this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this.startOnce();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async startOnce() {
    const { directory, executable } = enginePaths(this.engineId, this.pathOptions);
    this.lines = [];
    this.stderr = "";
    this.ready = false;
    this.child = spawn(executable, [], {
      cwd: directory,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const child = this.child;
    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.onLine(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-2000);
    });
    this.closePromise = new Promise((resolve) => {
      child.once("close", (code) => {
        this.ready = false;
        if (this.child === child) this.child = null;
        const message = `${this.definition.name} 已退出（代码 ${code}）${this.stderr ? `：${this.stderr.trim()}` : ""}`;
        for (const waiter of this.waiters.splice(0)) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error(message));
        }
        resolve(code);
      });
    });
    child.once("error", (error) => {
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    });

    await this.command("uci", (line) => line === "uciok");
    if (this.definition.variant) {
      this.send(`setoption name UCI_Variant value ${this.definition.variant}`);
    }
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 64");
    await this.command("isready", (line) => line === "readyok");
    this.ready = true;
  }

  onLine(line) {
    for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.waiters[index];
      if (waiter.predicate(line)) {
        this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(line);
        return;
      }
      if (/CRITICAL ERROR|FATAL ERROR/i.test(line)) {
        this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.reject(new Error(line));
        return;
      }
    }
    if (this.searchInfo && line.startsWith("info ")) {
      this.searchInfo.push(line);
      if (this.searchInfo.length > 5000) this.searchInfo.splice(0, this.searchInfo.length - 5000);
    }
    this.lines.push(line);
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
  }

  waitFor(predicate, label, timeoutMs = 30000) {
    const lineIndex = this.lines.findIndex(predicate);
    if (lineIndex >= 0) return Promise.resolve(this.lines.splice(lineIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error(`等待 ${this.definition.name} ${label} 超时`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  send(command) {
    if (!this.child || this.child.killed || !this.child.stdin.writable) {
      throw new Error(`${this.definition.name} 进程尚未就绪`);
    }
    this.child.stdin.write(`${command}\n`);
  }

  async command(command, predicate, label = command) {
    const response = this.waitFor(predicate, label);
    this.send(command);
    return response;
  }

  formatHistory(history) {
    const moves = history.map((move) => toEngineMove(move, this.engineId));
    if (moves.some((move) => !move)) {
      throw new Error("棋谱中包含无法转换为引擎坐标的着法");
    }
    return moves;
  }

  infoForApplication() {
    return (this.searchInfo || []).map((line) => normalizeEngineInfoLine(line, this.engineId));
  }

  async search(history, difficulty = DEFAULT_DIFFICULTY) {
    await this.start();
    const moves = this.formatHistory(history);
    const profile = searchProfileFor(difficulty);
    const response = this.waitFor((line) => line.startsWith("bestmove "), "搜索着法", 60000);
    this.searchInfo = [];
    try {
      this.send(`setoption name MultiPV value ${profile.multiPv}`);
      this.send(`position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`);
      this.send(profile.command);
      const line = await response;
      const engineMove = line.match(/^bestmove\s+(\S+)/i)?.[1];
      const bestMove = fromEngineMove(engineMove, this.engineId);
      if (!bestMove) throw new Error(`${this.definition.name} 未返回可用着法：${line}`);
      const candidates = candidateMovesFromInfo(this.infoForApplication(), difficulty);
      return chooseCandidateMove(candidates, difficulty) || bestMove;
    } finally {
      this.searchInfo = null;
    }
  }

  async evaluatePosition(history, movetime = 200) {
    await this.start();
    const moves = this.formatHistory(history);
    const response = this.waitFor((line) => line.startsWith("bestmove "), "复盘着法", 30000);
    this.searchInfo = [];
    try {
      this.send("setoption name MultiPV value 1");
      this.send(`position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`);
      this.send(`go movetime ${movetime}`);
      const line = await response;
      const engineMove = line.match(/^bestmove\s+(\S+)/i)?.[1];
      const info = parseEngineEvaluation(this.infoForApplication());
      return {
        bestMove: fromEngineMove(engineMove, this.engineId),
        score: info.score,
        principalVariation: info.principalVariation,
      };
    } finally {
      this.searchInfo = null;
    }
  }

  async newGame() {
    await this.start();
    const response = this.waitFor((line) => line === "readyok", "新局准备");
    this.send("ucinewgame");
    this.send("isready");
    await response;
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    const closing = this.closePromise;
    try {
      if (child.stdin.writable) child.stdin.write("quit\n");
    } catch {}
    await Promise.race([
      closing,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    if (this.child === child) child.kill();
  }
}

module.exports = { UciEngine };
