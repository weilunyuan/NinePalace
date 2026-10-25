import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const enginePath = process.argv[2];
if (!enginePath) {
  console.error("Usage: node spikes/pikafish-uci-smoke.mjs <path-to-pikafish>");
  process.exit(2);
}

const executable = resolve(enginePath);
const child = spawn(executable, [], {
  cwd: dirname(executable),
  stdio: ["pipe", "pipe", "inherit"],
  windowsHide: true,
});

const lines = [];
const waiters = [];
let closed = false;

const stdoutLines = createInterface({ input: child.stdout });
stdoutLines.on("line", (line) => {
  lines.push(line);
  console.log(`← ${line}`);
  for (let i = waiters.length - 1; i >= 0; i -= 1) {
    if (waiters[i].predicate(line)) {
      const [waiter] = waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(line);
    } else if (line.includes("CRITICAL ERROR")) {
      const [waiter] = waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.reject(new Error(line));
    }
  }
});

child.on("error", (error) => fail(error));
child.on("close", (code) => {
  closed = true;
  for (const waiter of waiters.splice(0)) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(`Engine exited before replying (code ${code}).`));
  }
});

function fail(error) {
  console.error(error.message);
  if (!closed) child.kill();
  process.exitCode = 1;
}

function waitFor(predicate, label, timeoutMs = 30_000, afterIndex = 0) {
  const existing = lines.slice(afterIndex).find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolvePromise, rejectPromise) => {
    const waiter = {
      predicate,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        rejectPromise(new Error(`Timed out waiting for ${label}.`));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });
}

function send(command) {
  console.log(`→ ${command}`);
  child.stdin.write(`${command}\n`);
}

try {
  const uciReady = waitFor((line) => line === "uciok", "uciok");
  send("uci");
  await uciReady;

  const engineReady = waitFor((line) => line === "readyok", "readyok");
  send("isready");
  await engineReady;

  const bestMove = waitFor((line) => line.startsWith("bestmove "), "bestmove");
  send("ucinewgame");
  send("position startpos");
  send("go depth 1");
  const firstResult = await bestMove;
  const firstMove = firstResult.match(/^bestmove\s+([a-i][0-9][a-i][0-9])(?:\s|$)/i)?.[1];
  if (!firstMove) {
    throw new Error(`Engine did not return a playable opening move: ${firstResult}`);
  }

  const history = ["b2e2", "b7e7"];
  const historyStart = lines.length;
  const secondBestMove = waitFor((line) => line.startsWith("bestmove "), "bestmove after move history", 30_000, historyStart);
  send(`position startpos moves ${history.join(" ")}`);
  send("go depth 1");
  const secondResult = await secondBestMove;
  const secondMove = secondResult.match(/^bestmove\s+([a-i][0-9][a-i][0-9])(?:\s|$)/i)?.[1];
  if (!secondMove) {
    throw new Error(`Engine did not return a move after the supplied history: ${secondResult}`);
  }

  const engineExit = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("Engine did not exit after quit.")), 5_000);
    child.once("close", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
  send("quit");
  await engineExit;
  console.log(`UCI smoke check passed; opening move: ${firstMove}; after ${history.join(" ")}: ${secondMove}`);
} catch (error) {
  fail(error);
}
